import { useCallback, useEffect, useState } from "react";
import { Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { checkGuess, type WhosThatRound } from "@ptb/core/whos-that";
import { spriteUrl } from "@ptb/core/pokemon-data";
import type { PokeType } from "@ptb/core/pokemon-data";
import { MODE_PROMPT, makeSupportedRound } from "../lib/whos-that-round";
import { TYPE_COLORS } from "../lib/partners";
import { answerHaptic } from "../lib/haptics";
import { useTrainer } from "../lib/store";

const ALL_TYPES = Object.keys(TYPE_COLORS) as PokeType[];

export default function WhosThat() {
  const markCaught = useTrainer((s) => s.markCaught);
  const markSeen = useTrainer((s) => s.markSeen);

  const [round, setRound] = useState<WhosThatRound | null>(null);
  const [text, setText] = useState("");
  const [types, setTypes] = useState<PokeType[]>([]);
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const [streak, setStreak] = useState(0);

  const next = useCallback(() => {
    setRound(makeSupportedRound());
    setText("");
    setTypes([]);
    setResult(null);
  }, []);

  useEffect(() => next(), [next]);

  if (!round) return <View className="flex-1 bg-background" />;

  const revealed = result !== null;

  function submit() {
    if (!round || revealed) return;
    const ok = checkGuess(round, { guessText: text, guessTypes: types });
    answerHaptic(ok);
    setResult(ok ? "right" : "wrong");
    setStreak((s) => (ok ? s + 1 : 0));
    // A correct guess is a capture, matching the web app; a wrong one still
    // counts as having seen it, since the answer is revealed either way.
    markSeen(round.monId);
    if (ok) markCaught(round.monId);
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-5">
      <View className="flex-row justify-between">
        <Text className="text-xs text-muted-foreground">Streak {streak}</Text>
        <Text className="text-xs text-muted-foreground">Mode {round.mode}</Text>
      </View>

      <Panel round={round} revealed={revealed} />

      <Text className="text-center text-xl font-extrabold text-poke-dark">
        {revealed ? (result === "right" ? "Correct!" : "Not quite.") : (MODE_PROMPT[round.mode] ?? "Who's that Pokémon?")}
      </Text>

      {revealed && (
        <Text className="text-center text-sm text-muted-foreground">
          It's <Text className="font-bold text-poke-dark">{round.name}</Text> (
          {round.types.join(" / ")})
          {result === "right" ? ` · ${round.rewardName} earned` : ""}
        </Text>
      )}

      {round.mode === "1B" ? (
        <View className="flex-row flex-wrap justify-center gap-2">
          {ALL_TYPES.map((t) => {
            const on = types.includes(t);
            return (
              <Pressable
                key={t}
                disabled={revealed}
                onPress={() => setTypes((prev) => (on ? prev.filter((x) => x !== t) : [...prev, t]))}
                className="rounded-full px-3 py-1.5"
                style={{ backgroundColor: on ? (TYPE_COLORS[t] ?? "#9aa0a8") : "#e7f0f8" }}
              >
                <Text
                  className={`text-xs font-bold capitalize ${on ? "text-white" : "text-muted-foreground"}`}
                >
                  {t}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <TextInput
          value={text}
          onChangeText={setText}
          editable={!revealed}
          placeholder="Type a name"
          placeholderTextColor="#586474"
          autoCapitalize="words"
          autoCorrect={false}
          onSubmitEditing={submit}
          returnKeyType="done"
          className="rounded-card border border-border bg-card px-4 py-3 text-lg text-poke-dark"
        />
      )}

      <Pressable
        onPress={revealed ? next : submit}
        className="rounded-card bg-primary px-6 py-4 active:opacity-80"
      >
        <Text className="text-center text-lg font-bold text-primary-foreground">
          {revealed ? "Next" : "Guess"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

function Panel({ round, revealed }: { round: WhosThatRound; revealed: boolean }) {
  const uri = spriteUrl(round.monId, { back: round.cropBack, shiny: round.isShiny });

  // Mode 4 shows the typing instead of the Pokémon — the answer is any species
  // with that typing, so showing the sprite would give it away.
  if (round.mode === "4") {
    return (
      <View className="items-center gap-3 rounded-card bg-card p-6">
        <View className="flex-row gap-2">
          {round.types.map((t) => (
            <View
              key={t}
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: TYPE_COLORS[t] ?? "#9aa0a8" }}
            >
              <Text className="text-sm font-bold capitalize text-white">{t}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Mode 2 is an extreme crop. The sprite is scaled up inside a round window
  // and nudged by the round's own offsets, so the same round looks the same
  // wherever it is rendered.
  if (round.mode === "2") {
    return (
      <View className="items-center">
        <View
          className="overflow-hidden rounded-full border-4 border-poke-dark bg-poke-dark"
          style={{ width: 220, height: 220 }}
        >
          <Image
            source={{ uri }}
            style={{
              width: "300%",
              height: "300%",
              transform: [
                { translateX: (-round.cropDX / 100) * 220 },
                { translateY: (-round.cropDY / 100) * 220 },
              ],
              opacity: revealed ? 1 : 1,
            }}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  // 1A and 1B: the silhouette. Sized as a SHARE of its panel rather than a
  // fixed box inside an overflow-hidden container — the web app cropped this
  // twice before the rule stuck.
  return (
    <View className="items-center justify-center rounded-card bg-card p-6" style={{ minHeight: 240 }}>
      <Image
        source={{ uri }}
        style={{
          width: "70%",
          aspectRatio: 1,
          tintColor: revealed ? undefined : "#0f1b2d",
        }}
        resizeMode="contain"
      />
    </View>
  );
}
