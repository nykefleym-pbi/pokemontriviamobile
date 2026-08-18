import { useMemo, useState } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { GYM_LEADERS, type GymLeader } from "@ptb/core/gym-leaders";
import { spriteUrl } from "@ptb/core/pokemon-data";
import { TYPE_COLORS } from "../lib/partners";
import { useTrainer } from "../lib/store";

const REGIONS = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"] as const;

export default function Gyms() {
  const router = useRouter();
  const badges = useTrainer((s) => s.badges);
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("Kanto");

  const leaders = useMemo(
    () => GYM_LEADERS.filter((g) => g.region === region),
    [region],
  );
  const earnedHere = leaders.filter((g) => badges.includes(g.id)).length;

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2 px-4 py-3"
      >
        {REGIONS.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRegion(r)}
            className={`rounded-full px-4 py-2 ${r === region ? "bg-primary" : "bg-card border border-border"}`}
          >
            <Text
              className={`text-xs font-bold ${r === region ? "text-primary-foreground" : "text-poke-dark"}`}
            >
              {r}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <Text className="px-4 pb-2 text-xs text-muted-foreground">
        {earnedHere} / {leaders.length} badges in {region} · {badges.length} of{" "}
        {GYM_LEADERS.length} overall
      </Text>

      <ScrollView contentContainerClassName="gap-3 px-4 pb-8">
        {leaders.map((g) => (
          <LeaderRow
            key={g.id}
            leader={g}
            earned={badges.includes(g.id)}
            onPress={() => router.push(`/battle?gym=${g.id}`)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function LeaderRow({
  leader,
  earned,
  onPress,
}: {
  leader: GymLeader;
  earned: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-card border p-3 ${
        earned ? "border-poke-blue bg-card" : "border-border bg-card"
      } active:opacity-80`}
    >
      {/* The leader's own portrait and badge art live at web-absolute paths
          (/trainers/…, /badges/…) that mean nothing here, so the signature
          Pokémon stands in — it loads from the same CDN the rest of the app
          already uses. */}
      <Image
        source={{ uri: spriteUrl(leader.signaturePokemonId) }}
        style={{ width: 56, height: 56 }}
        resizeMode="contain"
      />
      <View className="flex-1">
        <Text className="text-base font-extrabold text-poke-dark">{leader.name}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {leader.badge}
        </Text>
      </View>
      <View
        className="rounded-full px-2 py-1"
        style={{ backgroundColor: TYPE_COLORS[leader.type] ?? "#9aa0a8" }}
      >
        <Text className="text-[10px] font-bold capitalize text-white">{leader.type}</Text>
      </View>
      {earned && (
        <View className="rounded-full bg-poke-blue px-2 py-1">
          <Text className="text-[10px] font-bold text-primary-foreground">✓</Text>
        </View>
      )}
    </Pressable>
  );
}
