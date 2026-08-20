import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  initialMegaRaidState,
  MEGA_BOSS_HP,
  MEGA_MIN_QUESTIONS,
  MEGA_PLAYER_MAX_HP,
  type MegaHealItemId,
  type MegaRaidState,
} from "@ptb/core/mega";
import type { MegaRaidAction } from "@ptb/core/mega-replay";
import {
  claimRaidReward,
  startRaid,
  submitRaidAction,
  type MegaReward,
  type ServedQuestion,
} from "../lib/mega-server";
import { answerHaptic } from "../lib/haptics";
import { playBattleResult, playBgm, stopBgm } from "../lib/audio";
import { useTrainer } from "../lib/store";

// This screen holds NO raid math. The boss's HP, the player's HP, whether an
// answer was right and what the run is worth are all decided by the `mega-run`
// Edge Function; everything below just renders the state it sends back and
// forwards the player's intent. The one number kept locally is the reveal
// timer, which is presentation.
//
// Items are the exception, and deliberately so: the wallet and the inventory
// still live on the device (see the store), so the client spends the item and
// the server is told an item was used. A player who edits their own inventory
// cheats themselves out of nothing the server pays for -- the reward depends
// only on correct answers and the win, both of which the server owns.

const HEAL_ITEMS: MegaHealItemId[] = ["potion", "superpotion", "maxpotion"];

const REVEAL_MS = 700;

export default function Mega() {
  const router = useRouter();
  const inventory = useTrainer((s) => s.inventory);
  const consumeItem = useTrainer((s) => s.consumeItem);
  const grantReward = useTrainer((s) => s.grantReward);
  const musicOn = useTrainer((s) => s.musicOn);

  const [runId, setRunId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ServedQuestion[] | null>(null);
  const [state, setState] = useState<MegaRaidState>(initialMegaRaidState);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ choice: number | null; correctIndex: number } | null>(
    null,
  );
  const [reward, setReward] = useState<MegaReward | null>(null);
  const paid = useRef(false);

  useEffect(() => {
    let alive = true;
    startRaid().then(
      (r) => {
        if (!alive) return;
        setRunId(r.runId);
        setQuestions(r.questions);
      },
      (e: Error) => {
        if (alive) setError(e.message);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (musicOn) playBgm("battle_regular");
    return () => stopBgm();
  }, [musicOn]);

  const done = state.phase !== "in_progress";

  // Collect exactly once, however the raid ended. `claim_reward` is the
  // server's claim-once guard, so this is safe even if the effect re-runs; the
  // local wallet is only credited on the call that actually won the race.
  useEffect(() => {
    if (!done || !runId || paid.current) return;
    paid.current = true;
    playBattleResult(state.phase === "won");
    claimRaidReward(runId).then(
      (r) => {
        setReward(r.reward);
        grantReward({ xp: r.reward.xp, coins: r.reward.coins });
      },
      () => {
        /* already claimed, or offline — the run keeps the reward server-side */
      },
    );
  }, [done, runId, state.phase, grantReward]);

  /** Every player intent goes through here, so the server is the only thing
   *  that ever advances `state`. */
  const send = useCallback(
    async (action: MegaRaidAction) => {
      if (!runId || busy || done) return;
      setBusy(true);
      try {
        const res = await submitRaidAction(runId, action);
        if (action.type === "answer" && res.reveal) {
          answerHaptic(res.reveal.correctIndex === action.choiceIdx);
          setReveal({ choice: action.choiceIdx, correctIndex: res.reveal.correctIndex });
          setTimeout(() => {
            setReveal(null);
            setState(res.state);
            setBusy(false);
          }, REVEAL_MS);
          return;
        }
        setState(res.state);
        setBusy(false);
      } catch (e) {
        setError((e as Error).message);
        setBusy(false);
      }
    },
    [runId, busy, done],
  );

  /** Spend the item first: if the device has none, the server is never told
   *  one was used, so the two never disagree in the player's favour. */
  const useItem = useCallback(
    (id: MegaHealItemId | "xattack") => {
      if (!consumeItem(id)) return;
      void send(id === "xattack" ? { type: "use_xattack" } : { type: "use_potion", itemId: id });
    },
    [consumeItem, send],
  );

  if (error && !questions) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text className="text-center text-sm text-muted-foreground">
          The raid could not be started. {error}
        </Text>
        <Pressable
          className="rounded-card bg-primary px-5 py-3 active:opacity-80"
          onPress={() => router.replace("/")}
        >
          <Text className="font-bold text-primary-foreground">Back home</Text>
        </Pressable>
      </View>
    );
  }

  if (!questions) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#ee343b" />
      </View>
    );
  }

  // The server hands back one question per index and refuses any answer out of
  // sequence, so the index IS the number already answered — no local cursor.
  const question = questions[state.questionsAnswered];

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-5">
      <Bar label="Boss" hp={state.bossHp} max={MEGA_BOSS_HP} tone="bg-primary" />
      <Bar label="You" hp={state.playerHp} max={MEGA_PLAYER_MAX_HP} tone="bg-poke-blue" />

      <View className="flex-row justify-between rounded-card bg-card p-3">
        <Text className="text-xs text-muted-foreground">
          Correct {state.correctCount}/{MEGA_MIN_QUESTIONS}
        </Text>
        <Text className="text-xs text-muted-foreground">
          Q {state.questionsAnswered}/{questions.length}
        </Text>
        {state.xAttackArmed && <Text className="text-xs font-bold text-primary">X Attack</Text>}
      </View>

      {done ? (
        <View className="gap-4 rounded-card bg-card p-6">
          <Text className="text-center text-2xl font-extrabold text-poke-dark">
            {state.phase === "won" ? "Raid cleared!" : "The raid failed."}
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            {state.correctCount} correct · boss on {state.bossHp} HP
          </Text>
          {reward && (
            <Text className="text-center text-sm font-bold text-poke-dark">
              +{reward.xp} XP{reward.coins > 0 ? ` · +${reward.coins} coins` : ""}
            </Text>
          )}
          <Pressable
            className="rounded-card bg-primary px-5 py-3 active:opacity-80"
            onPress={() => router.replace("/")}
          >
            <Text className="text-center font-bold text-primary-foreground">Back home</Text>
          </Pressable>
        </View>
      ) : question ? (
        <>
          <Text className="text-lg font-bold text-poke-dark">{question.question}</Text>
          {question.options.map((opt, i) => {
            const isRight = reveal !== null && reveal.correctIndex === i;
            const isPicked = reveal?.choice === i;
            return (
              <Pressable
                key={i}
                disabled={busy}
                onPress={() => void send({ type: "answer", questionIdx: state.questionsAnswered, choiceIdx: i })}
                className={`rounded-card border border-border px-4 py-3 active:opacity-80 ${
                  isRight ? "bg-poke-blue" : isPicked ? "bg-primary" : "bg-card"
                }`}
              >
                <Text
                  className={`font-semibold ${
                    isRight || isPicked ? "text-primary-foreground" : "text-poke-dark"
                  }`}
                >
                  {opt}
                </Text>
              </Pressable>
            );
          })}

          {/* Where the shop finally pays off: the raid is the first screen that
              consumes what the player bought. */}
          <View className="flex-row flex-wrap gap-2 pt-2">
            {HEAL_ITEMS.map((id) => {
              const held = inventory[id] ?? 0;
              return (
                <Pressable
                  key={id}
                  disabled={held < 1 || busy}
                  onPress={() => useItem(id)}
                  className={`rounded-card px-3 py-2 ${
                    held > 0 ? "border border-border bg-card" : "bg-muted"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${held > 0 ? "text-poke-dark" : "text-muted-foreground"}`}
                  >
                    {id} ×{held}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              disabled={(inventory.xattack ?? 0) < 1 || state.xAttackArmed || busy}
              onPress={() => useItem("xattack")}
              className={`rounded-card px-3 py-2 ${
                (inventory.xattack ?? 0) > 0 && !state.xAttackArmed
                  ? "border border-border bg-card"
                  : "bg-muted"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  (inventory.xattack ?? 0) > 0 && !state.xAttackArmed
                    ? "text-poke-dark"
                    : "text-muted-foreground"
                }`}
              >
                xattack ×{inventory.xattack ?? 0}
              </Text>
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => void send({ type: "forfeit" })}
              className="rounded-card border border-border px-3 py-2"
            >
              <Text className="text-xs font-bold text-muted-foreground">Forfeit</Text>
            </Pressable>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Bar({ label, hp, max, tone }: { label: string; hp: number; max: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <View className="gap-1">
      <View className="flex-row justify-between">
        <Text className="text-xs font-bold text-poke-dark">{label}</Text>
        <Text className="text-xs text-muted-foreground">
          {hp}/{max}
        </Text>
      </View>
      <View className="h-3 overflow-hidden rounded-full bg-muted">
        <View className={`h-3 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}
