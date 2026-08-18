import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ELITE_FOUR, nextPendingElite, type EliteMember } from "@ptb/core/elite-four";
import { spriteUrl } from "@ptb/core/pokemon-data";
import { TYPE_COLORS } from "../lib/partners";
import { useTrainer } from "../lib/store";

export default function Elite() {
  const router = useRouter();
  const defeated = useTrainer((s) => s.eliteDefeated);
  const level = useTrainer((s) => s.level);
  const next = nextPendingElite(level, defeated);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4 pb-8">
      <View className="gap-1">
        <Text className="text-xs text-muted-foreground">
          {defeated.length} / {ELITE_FOUR.length} defeated · you are level {level}
        </Text>
        <Text className="text-xs text-muted-foreground">
          {next
            ? `Next up: ${next.name} of ${next.region}.`
            : defeated.length === ELITE_FOUR.length
              ? "Every challenger defeated."
              : "Win more battles to unlock the next challenger."}
        </Text>
      </View>

      {ELITE_FOUR.map((e) => (
        <EliteRow
          key={e.id}
          member={e}
          beaten={defeated.includes(e.id)}
          locked={level < e.unlockLevel}
          onPress={() => router.push(`/battle?elite=${e.id}`)}
        />
      ))}
    </ScrollView>
  );
}

function EliteRow({
  member,
  beaten,
  locked,
  onPress,
}: {
  member: EliteMember;
  beaten: boolean;
  locked: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      disabled={locked}
      className={`flex-row items-center gap-3 rounded-card border p-3 ${
        beaten ? "border-poke-blue bg-card" : "border-border bg-card"
      } ${locked ? "opacity-50" : "active:opacity-80"}`}
    >
      <Image
        source={{ uri: spriteUrl(member.signaturePokemonId) }}
        style={{ width: 56, height: 56, opacity: locked ? 0.4 : 1 }}
        resizeMode="contain"
      />
      <View className="flex-1">
        <Text className="text-base font-extrabold text-poke-dark">{member.name}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={1}>
          {member.title} · {member.region}
        </Text>
      </View>
      {locked ? (
        <Text className="text-[10px] font-bold text-muted-foreground">Lv {member.unlockLevel}</Text>
      ) : (
        <View
          className="rounded-full px-2 py-1"
          style={{ backgroundColor: TYPE_COLORS[member.type] ?? "#9aa0a8" }}
        >
          <Text className="text-[10px] font-bold capitalize text-white">{member.type}</Text>
        </View>
      )}
      {beaten && (
        <View className="rounded-full bg-poke-blue px-2 py-1">
          <Text className="text-[10px] font-bold text-primary-foreground">✓</Text>
        </View>
      )}
    </Pressable>
  );
}
