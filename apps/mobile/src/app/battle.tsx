import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { applyAnswer, applyRoundStart, type BattleEvent, type BattleState } from "@ptb/core";
import { findPokemon, spriteUrl, type PokeEntry } from "@ptb/core/pokemon-data";
import {
  buildCfg,
  DEFAULT_PARTNER_ID,
  pickOpponent,
  startBattle,
  type BattleRuntime,
} from "../lib/battle-setup";
import { gradeAnswer, loadQuestions, type QuestionSet } from "../lib/questions";
import { FALLBACK_QUESTIONS } from "../lib/questions";
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
  const askedAt = useRef(Date.now());

  const partnerId = useTrainer((s) => s.partnerId);
  const musicOn = useTrainer((s) => s.musicOn);

  useEffect(() => {
    let alive = true;
    loadQuestions(QUESTION_COUNT).then((qs) => {
      if (!alive) return;
      // The engine needs a question set to size the battle. When the questions
      // came from the server we do NOT hold their answers, so we hand it the
      // bundled shapes purely for length — correctness arrives per answer from
      // `gradeAnswer` and is fed straight into applyAnswer.
      const shapes = qs.local ?? FALLBACK_QUESTIONS.slice(0, qs.served.length);
      const partner = findPokemon(partnerId ?? DEFAULT_PARTNER_ID) ?? findPokemon(DEFAULT_PARTNER_ID)!;
      const opponent = pickOpponent(partner);
      if (!alive) return;
      setSides({ partner, opponent });
      setSet(qs);
      setRuntime(startBattle(buildCfg(shapes, partner, opponent)));
      askedAt.current = Date.now();
    });
    return () => {
      alive = false;
    };
  }, [partnerId]);

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
        const grade = await gradeAnswer(set, idx, choice);
        answerHaptic(grade.correct);
        setReveal({ choice, correctIndex: grade.correctIndex });

        // Round start first (statuses tick, poison bites), then the answer —
        // the same order solo-battle-replay.ts uses server-side, so an
        // optimistic preview here and the authoritative replay agree.
        const rs = applyRoundStart(runtime.state, runtime.config, idx);
        const res =
          rs.state.phase === "in_progress"
            ? applyAnswer(
                rs.state,
                runtime.config,
                { correct: grade.correct, questionIdx: idx, elapsedMs },
                runtime.rng.fork(String(idx)),
              )
            : { state: rs.state, events: [] };

        if (res.state.phase !== "in_progress") {
          playBattleResult(res.state.phase === "won");
        }

        const events = [...rs.events, ...res.events];
        const lines = events.map(describe).filter((l): l is string => l !== null);
        setLog((prev) => [...lines, ...prev].slice(0, 6));
        setRuntime({ ...runtime, state: res.state });

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
    [set, runtime, busy, done, idx],
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
