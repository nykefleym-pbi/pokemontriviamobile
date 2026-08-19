import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { applyAnswer, applyRoundStart, type BattleEvent, type BattleState } from "@ptb/core";
import { findPokemon, spriteUrl, type PokeEntry } from "@ptb/core/pokemon-data";
import { findGymLeader } from "@ptb/core/gym-leaders";
import { getEliteById } from "@ptb/core/elite-four";
import { battleReward } from "@ptb/core/rewards";
import { levelFromTotalXp } from "@ptb/core/game-data";
import {
  buildCfgRef,
  buildSetup,
  DEFAULT_PARTNER_ID,
  pickOpponent,
  startBattle,
  type BattleRuntime,
} from "../lib/battle-setup";
import { startServerBattle, submitAction } from "../lib/battle-server";
import { gradeAnswer, loadQuestions, type QuestionSet } from "../lib/questions";
import { useTrainer } from "../lib/store";
import { playBattleResult, playBgm, setMusicOn, stopBgm } from "../lib/audio";
import { answerHaptic } from "../lib/haptics";

const QUESTION_COUNT = 6;

function HpBar({ label, hp, max, tone }: { label: string; hp: number; max: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  return (
    <View className="flex-1 gap-1">
      <View className="flex-row justify-between">
        <Text className="text-xs font-bold text-poke-dark">{label}</Text>
        <Text className="text-xs text-muted-foreground">
          {Math.max(0, hp)}/{max}
        </Text>
      </View>
      <View className="h-3 overflow-hidden rounded-full bg-muted">
        <View className={`h-3 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </View>
    </View>
  );
}

function describe(e: BattleEvent): string | null {
  switch (e.type) {
    case "damage_dealt":
      return `${e.target === "enemy" ? "You hit" : "You took"} ${e.amount}${e.crit ? " — critical!" : ""}`;
    case "type_effect":
      return e.band === "super"
        ? "Super effective!"
        : e.band === "resisted"
          ? "Not very effective…"
          : e.band === "immune"
            ? "It had no effect…"
            : null;
    case "status_applied":
      return `${e.target === "player" ? "You are" : "Enemy is"} ${e.kind}`;
    case "status_cured":
      return `${e.target === "player" ? "You" : "Enemy"} shook off ${e.kind}`;
    case "item_consumed":
      return `Used ${e.itemId}`;
    case "battle_ended":
      return e.won ? "You win!" : "You were knocked out.";
    default:
      return null;
  }
}

export default function Battle() {
  const router = useRouter();
  const [set, setSet] = useState<QuestionSet | null>(null);
  const [runtime, setRuntime] = useState<BattleRuntime | null>(null);
  const [idx, setIdx] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [reveal, setReveal] = useState<{ choice: number; correctIndex: number } | null>(null);
  const [sides, setSides] = useState<{ partner: PokeEntry; opponent: PokeEntry } | null>(null);
  // Non-null once the battle is running server-side. That is the ONLY thing
  // that decides which of the two paths `answer` takes.
  const [serverBattleId, setServerBattleId] = useState<string | null>(null);
  const askedAt = useRef(Date.now());

  const partnerId = useTrainer((s) => s.partnerId);
  const musicOn = useTrainer((s) => s.musicOn);
  const markSeen = useTrainer((s) => s.markSeen);
  const markCaught = useTrainer((s) => s.markCaught);
  const awardBadge = useTrainer((s) => s.awardBadge);
  const awardElite = useTrainer((s) => s.awardElite);
  const grantReward = useTrainer((s) => s.grantReward);
  const xp = useTrainer((s) => s.xp);
  const { gym, elite } = useLocalSearchParams<{ gym?: string; elite?: string }>();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const qs = await loadQuestions(QUESTION_COUNT);
      if (!alive) return;
      const partner = findPokemon(partnerId ?? DEFAULT_PARTNER_ID) ?? findPokemon(DEFAULT_PARTNER_ID)!;

      // A gym or Elite Four challenge fixes the opponent; a plain solo battle
      // rolls one. `pickRandomGymLeader` in packages/core is deliberately NOT
      // used — it calls Math.random inside the engine package, and routing the
      // choice through an explicit id keeps a challenge reproducible.
      const leader = gym ? findGymLeader(gym) : undefined;
      const challenger = elite ? getEliteById(elite) : undefined;
      const foeId = leader?.signaturePokemonId ?? challenger?.signaturePokemonId;
      const opponent = foeId ? (findPokemon(foeId) ?? pickOpponent(partner)) : pickOpponent(partner);
      const mode = challenger ? "elite" : leader ? "weekly" : "battle";
      const setup = buildSetup(partner, opponent, 5, mode);

      // Open a server battle when the questions came from the server, because
      // only then do they have ids the server can resolve. If that call fails
      // the battle still happens, resolved on the device: a player on a flaky
      // connection gets to play, and what is lost is authority over a
      // single-player result — not the result itself.
      let battleId: string | null = null;
      if (qs.fromServer) {
        try {
          const started = await startServerBattle(
            buildCfgRef(
              qs.served.map((q) => q.id),
              partner,
              opponent,
              5,
              mode,
            ),
          );
          battleId = started.battleId;
        } catch {
          battleId = null;
        }
      }

      if (!alive) return;
      setSides({ partner, opponent });
      // Encountering is seeing. Winning is catching — that is the whole loop.
      markSeen(opponent.id);
      markCaught(partner.id);
      setSet(qs);
      setServerBattleId(battleId);
      // Only the opening frame. On the server path every state after this one
      // comes back from the Edge Function; `runtime.rng` and `runtime.seed`
      // go unused there, since the server owns the real seed.
      setRuntime(startBattle(setup));
      askedAt.current = Date.now();
    })();
    return () => {
      alive = false;
    };
  }, [partnerId, markSeen, markCaught, gym, elite]);

  // BGM follows the screen, not the battle: leaving mid-fight must stop it, or
  // the loop keeps playing under the home screen.
  useEffect(() => {
    setMusicOn(musicOn);
    if (musicOn) playBgm("battle_regular");
    return () => stopBgm();
  }, [musicOn]);

  const state: BattleState | null = runtime?.state ?? null;
  const question = set?.served[idx] ?? null;
  const done = state !== null && state.phase !== "in_progress";
  const outOfQuestions = set !== null && idx >= set.served.length;

  const answer = useCallback(
    async (choice: number) => {
      if (!set || !runtime || busy || done) return;
      setBusy(true);
      const elapsedMs = Date.now() - askedAt.current;
      try {
        let next: BattleState;
        let events: BattleEvent[];
        let correct: boolean;
        let correctIndex: number;

        if (serverBattleId) {
          // The authoritative path runs NO local engine code. A second opinion
          // computed here is exactly the drift battle-solo exists to prevent,
          // and `reveal` is the only thing the device ever learns about the
          // answer key — the same thing `grade_trivia_answer` would have told
          // it, arriving in the round-trip that had to happen anyway.
          const res = await submitAction(serverBattleId, {
            type: "submit_answer",
            questionIdx: idx,
            choiceIdx: choice,
            elapsedMs,
          });
          next = res.state;
          events = res.events;
          correctIndex = res.reveal?.correctIndex ?? -1;
          correct = correctIndex === choice;
        } else {
          const grade = await gradeAnswer(set, idx, choice);
          correct = grade.correct;
          correctIndex = grade.correctIndex;

          // Round start first (statuses tick, poison bites), then the answer —
          // the same order solo-battle-replay.ts uses server-side, so the two
          // paths cannot disagree about a battle they both could have run.
          const rs = applyRoundStart(runtime.state, runtime.config, idx);
          const res =
            rs.state.phase === "in_progress"
              ? applyAnswer(
                  rs.state,
                  runtime.config,
                  { correct, questionIdx: idx, elapsedMs },
                  runtime.rng.fork(String(idx)),
                )
              : { state: rs.state, events: [] as BattleEvent[] };
          next = res.state;
          events = [...rs.events, ...res.events];
        }

        answerHaptic(correct);
        setReveal({ choice, correctIndex });

        if (next.phase !== "in_progress") {
          const won = next.phase === "won";
          playBattleResult(won);

          // The same reward function the web app uses, so a battle here pays
          // exactly what the same battle pays there. A loss still earns a
          // little XP in "regular" mode — that is the web behaviour, not an
          // oversight.
          grantReward(
            battleReward({
              mode: elite ? "elite" : gym ? "weekly" : "regular",
              won,
              level: levelFromTotalXp(xp),
              maxStreak: next.maxStreak,
            }),
          );

          if (won) {
            if (sides) markCaught(sides.opponent.id);
            if (gym) awardBadge(gym);
            if (elite) awardElite(elite);
          }
        }

        const lines = events.map(describe).filter((l): l is string => l !== null);
        setLog((prev) => [...lines, ...prev].slice(0, 6));
        setRuntime({ ...runtime, state: next });

        setTimeout(() => {
          setReveal(null);
          setIdx((i) => i + 1);
          askedAt.current = Date.now();
          setBusy(false);
        }, 900);
      } catch {
        setLog((prev) => ["Could not reach the server — try again.", ...prev].slice(0, 6));
        setBusy(false);
      }
    },
    [
      set,
      runtime,
      busy,
      done,
      idx,
      sides,
      serverBattleId,
      markCaught,
      grantReward,
      xp,
      awardBadge,
      awardElite,
      gym,
      elite,
    ],
  );

  const summary = useMemo(() => {
    if (!state) return "";
    if (state.phase === "won") return "Victory!";
    if (state.phase === "lost") return "Defeated";
    return outOfQuestions ? "Out of questions" : "";
  }, [state, outOfQuestions]);

  if (!set || !runtime || !state) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator color="#ee343b" />
        <Text className="mt-3 text-muted-foreground">Loading questions…</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-5">
      <View className="flex-row gap-4">
        <HpBar
          label={sides?.partner.name ?? "You"}
          hp={state.playerHp}
          max={runtime.config.playerMaxHp}
          tone="bg-poke-blue"
        />
        <HpBar
          label={sides?.opponent.name ?? "Enemy"}
          hp={state.enemyHp}
          max={runtime.config.enemyMaxHp}
          tone="bg-poke-red"
        />
      </View>

      {sides && (
        <View className="flex-row items-center justify-between px-2">
          <Image
            source={{ uri: spriteUrl(sides.partner.id) }}
            style={{ width: 88, height: 88 }}
            resizeMode="contain"
          />
          <Text className="text-xs font-bold text-muted-foreground">VS</Text>
          <Image
            source={{ uri: spriteUrl(sides.opponent.id) }}
            style={{ width: 88, height: 88 }}
            resizeMode="contain"
          />
        </View>
      )}

      <View className="flex-row justify-between rounded-card bg-card p-3">
        <Text className="text-xs text-muted-foreground">Streak {state.streak}</Text>
        <Text className="text-xs text-muted-foreground">Best {state.maxStreak}</Text>
        <Text className="text-xs text-muted-foreground">Correct {state.correctCount}</Text>
        <Text className="text-xs text-muted-foreground">Top hit {state.topDmg}</Text>
      </View>

      {!set.fromServer && (
        <Text className="text-center text-xs text-muted-foreground">
          Offline set — could not reach the question bank.
        </Text>
      )}

      {done || outOfQuestions ? (
        <View className="gap-4 rounded-card bg-card p-6">
          <Text className="text-center text-2xl font-extrabold text-poke-dark">{summary}</Text>
          <Text className="text-center text-sm text-muted-foreground">
            {state.correctCount} correct · best streak {state.maxStreak} · biggest hit {state.topDmg}
          </Text>
          <Pressable
            className="rounded-card bg-primary px-5 py-3 active:opacity-80"
            onPress={() => router.replace("/battle")}
          >
            <Text className="text-center font-bold text-primary-foreground">Battle again</Text>
          </Pressable>
          <Pressable className="px-5 py-2" onPress={() => router.replace("/")}>
            <Text className="text-center text-sm text-muted-foreground">Back home</Text>
          </Pressable>
        </View>
      ) : question ? (
        <View className="gap-3">
          <Text className="text-xs uppercase tracking-wide text-muted-foreground">
            Question {idx + 1} of {set.served.length} · {question.category}
          </Text>
          <Text className="text-xl font-bold text-poke-dark">{question.question}</Text>

          {question.options.map((opt, i) => {
            const isPicked = reveal?.choice === i;
            const isRight = reveal !== null && reveal.correctIndex === i;
            const tone = isRight
              ? "bg-poke-blue"
              : isPicked
                ? "bg-primary"
                : "bg-card";
            const textTone = isRight || isPicked ? "text-primary-foreground" : "text-poke-dark";
            return (
              <Pressable
                key={i}
                disabled={busy}
                onPress={() => answer(i)}
                className={`rounded-card border border-border ${tone} px-4 py-3 active:opacity-80`}
              >
                <Text className={`text-base font-semibold ${textTone}`}>{opt}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {log.length > 0 && (
        <View className="gap-1 rounded-card bg-muted p-3">
          {log.map((line, i) => (
            <Text key={i} className="text-xs text-muted-foreground">
              {line}
            </Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
