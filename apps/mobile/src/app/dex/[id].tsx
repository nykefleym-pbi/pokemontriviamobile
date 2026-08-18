import { Image, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { findPokemon, spriteUrl } from "@ptb/core/pokemon-data";
import { statusOf } from "../../lib/dex";
import { TYPE_COLORS } from "../../lib/partners";
import { useTrainer } from "../../lib/store";

export default function DexEntry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const dex = useTrainer((s) => s.dex);
  const entry = findPokemon(Number(id));

  if (!entry) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-6">
        <Text className="text-muted-foreground">No Pokédex entry for #{id}.</Text>
      </View>
    );
  }

  const status = statusOf(dex, entry.id);
  const known = status !== "unknown";

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-5 p-6">
      <View className="items-center gap-2 rounded-card bg-card p-6">
        <Text className="text-xs text-muted-foreground">
          #{String(entry.id).padStart(4, "0")}
        </Text>
        <Image
          source={{ uri: spriteUrl(entry.id) }}
          style={{
            width: 160,
            height: 160,
            opacity: known ? 1 : 0.25,
            tintColor: known ? undefined : "#0f1b2d",
          }}
          resizeMode="contain"
        />
        <Text className="text-2xl font-extrabold text-poke-dark">
          {known ? entry.name : "???"}
        </Text>
        <View className="flex-row gap-2">
          {entry.types.map((t) => (
            <View
              key={t}
              className="rounded-full px-3 py-1"
              style={{ backgroundColor: known ? (TYPE_COLORS[t] ?? "#9aa0a8") : "#d4dfeb" }}
            >
              <Text className="text-xs font-bold capitalize text-white">{known ? t : "???"}</Text>
            </View>
          ))}
        </View>
      </View>

      <View className="gap-2 rounded-card bg-card p-4">
        <Row label="Status" value={status === "unknown" ? "Not encountered" : status === "caught" ? "Caught" : "Seen"} />
        <Row label="Evolution stage" value={String(entry.evolutionStage)} />
        <Row label="Fully evolved" value={entry.isFullyEvolved ? "Yes" : "No"} />
        {entry.evolvesToIds.length > 0 && (
          <Row
            label="Evolves into"
            value={entry.evolvesToIds
              .map((e) => findPokemon(e)?.name ?? `#${e}`)
              .join(", ")}
          />
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="text-sm font-bold text-poke-dark">{value}</Text>
    </View>
  );
}
