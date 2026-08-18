import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  applyMegaAnswer,
  applyMegaForfeit,
  applyMegaPotion,
  applyMegaXAttack,
  initialMegaRaidState,
  MEGA_BOSS_HP,
  MEGA_PLAYER_MAX_HP,
  type MegaHealItemId,
  type MegaRaidState,
} from "@ptb/core/mega";
import { gradeAnswer, loadQuestions, type QuestionSet } from "../lib/questions";
import { answerHaptic } from "../lib/haptics";
import { playBattleResult, playBgm, stopBgm } from "../lib/audio";
import { useTrainer } from "../lib/store";

/** The boss has 400 HP and a correct answer removes 10, so a win needs 40
 *  correct answers — the question set has to be at least that deep or the
 *  raid is unwinnable by construction. */
const QUESTION_COUNT = 40;

const HEAL_ITEMS: MegaHealItemId[] = ["potion", "superpotion", "maxpotion"];

export default function Mega() {
  const router = useRouter();
  const inventory = useTrainer((s) => s.inventory);
  const consumeItem = useTrainer((s) => s.consumeItem);
  const grantReward = useTrainer((s) => s.grantReward);
  const musicOn = useTrainer((s) => s.musicOn);

  const [set, setSet] = useState<QuestionSet | null>(null);
  const [state, setState] = useState<MegaRaidState>(initialMegaRaidState);
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ choice: number; correctIndex: number } | null>(null);
  const paid = useRef(false);

  useEffect(() => {
    let alive = true;
    void loadQuestions(QUESTION_COUNT).then((qs) => {
      if (alive) setSet(qs);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (musicOn) playBgm("battle_regular");
    return () => stopBgm();
  }, [musicOn]);

  const done = state.phase !== "in_progress";

  // Pay out exactly once, however the raid ended.
  useEffect(() => {
    if (!done || paid.current) return;
    paid.current = true;
    playBattleResult(state.phase === "won");
    grantReward(
      state.phase === "won" ? { xp: 500, coins: 750 } : { xp: state.correctCount * 5 },
    );
  }, [done, state.phase, state.correctCount, grantReward]);

  const answer = useCallback(
    async (choice: number) => {
      if (!set || busy || done) return;
      setBusy(true);
      try {
        const grade = await gradeAnswer(set, idx % set.served.length, choice);
        answerHaptic(grade.correct);
        setReveal({ choice, correctIndex: grade.correctIndex });
        setState((s) => applyMegaAnswer(s, QUESTION_COUNT, { correct: grade.correct }));
        setTimeout(() => {
          setReveal(null);
          setIdx((i) => i + 1);
          setBusy(false);
        }, 700);
      } catch {
        setBusy(false);
      }
    },
    [set, busy, done, idx],
  );

  if (!set) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#ee343b" />
      </View>
    );
  }

  const question = set.served[idx % set.served.length];

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-4 p-5">
      <Bar label="Boss" hp={state.bossHp} max={MEGA_BOSS_HP} tone="bg-primary" />
      <Bar label="You" hp={state.playerHp} max={MEGA_PLAYER_MAX_HP} tone="bg-poke-blue" />

      <View className="flex-row justify-between rounded-card bg-card p-3">
        <Text className="text-xs text-muted-foreground">Correct {state.correctCount}/40</Text>
        <Text className="text-xs text-muted-foreground">
          Q {state.questionsAnswered}/{QUESTION_COUNT}
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
          <Pressable
            className="rounded-card bg-primary px-5 py-3 active:opacity-80"
            onPress={() => router.replace("/")}
          >
            <Text className="text-center font-bold text-primary-foreground">Back home</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text className="text-lg font-bold text-poke-dark">{question.question}</Text>
          {question.options.map((opt, i) => {
            const isRight = reveal !== null && reveal.correctIndex === i;
            const isPicked = reveal?.choice === i;
            return (
              <Pressable
                key={i}
                disabled={busy}
                onPress={() => void answer(i)}
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
                  disabled={held < 1}
                  onPress={() => {
                    if (consumeItem(id)) setState((s) => applyMegaPotion(s, id));
                  }}
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
              disabled={(inventory.xattack ?? 0) < 1 || state.xAttackArmed}
              onPress={() => {
                if (consumeItem("xattack")) setState(applyMegaXAttack);
              }}
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
              onPress={() => setState(applyMegaForfeit)}
              className="rounded-card border border-border px-3 py-2"
            >
              <Text className="text-xs font-bold text-muted-foreground">Forfeit</Text>
            </Pressable>
          </View>
        </>
      )}
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
