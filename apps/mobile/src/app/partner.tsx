import { useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { spriteUrl } from "@ptb/core/pokemon-data";
import { STARTERS, TYPE_COLORS } from "../lib/partners";
import { useTrainer } from "../lib/store";

export default function PickPartner() {
  const router = useRouter();
  const partnerId = useTrainer((s) => s.partnerId);
  const setPartner = useTrainer((s) => s.setPartner);
  const [selected, setSelected] = useState<number | null>(partnerId);

  function confirm() {
    if (selected === null) return;
    setPartner(selected);
    router.replace("/");
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-6 p-6">
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-poke-dark">Choose your partner</Text>
        <Text className="text-sm text-muted-foreground">
          Their type decides how much damage you deal and take. You can change it later.
        </Text>
      </View>

      <View className="flex-row flex-wrap justify-between gap-y-4">
        {STARTERS.map((p) => {
          const active = selected === p.id;
          return (
            <Pressable
              key={p.id}
              onPress={() => setSelected(p.id)}
              className={`w-[31%] items-center gap-1 rounded-card border-2 p-2 ${
                active ? "border-poke-blue bg-card" : "border-border bg-card"
              }`}
            >
              <Image
                source={{ uri: spriteUrl(p.id) }}
                // Sized as a share of the tile rather than a fixed box, so the
                // sprite is never cropped — the lesson the web app's Who's That
                // silhouette had to learn twice.
                style={{ width: "80%", aspectRatio: 1 }}
                resizeMode="contain"
              />
              <Text className="text-center text-xs font-bold text-poke-dark" numberOfLines={1}>
                {p.name}
              </Text>
              <View className="flex-row flex-wrap justify-center gap-1">
                {p.types.map((t) => (
                  <View
                    key={t}
                    className="rounded-full px-1.5 py-0.5"
                    style={{ backgroundColor: TYPE_COLORS[t] ?? "#9aa0a8" }}
                  >
                    <Text className="text-[9px] font-bold capitalize text-white">{t}</Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={confirm}
        className={`rounded-card px-6 py-4 ${
          selected === null ? "bg-muted" : "bg-primary active:opacity-80"
        }`}
      >
        <Text
          className={`text-center text-lg font-bold ${
            selected === null ? "text-muted-foreground" : "text-primary-foreground"
          }`}
        >
          {selected === null ? "Pick one to continue" : "Confirm partner"}
        </Text>
      </Pressable>

      <Text className="text-center text-xs text-muted-foreground">
        Sprites load from the PokeAPI CDN. Bundling them is a later step — see
        docs/ROADMAP.md Phase 3.
      </Text>
    </ScrollView>
  );
}
