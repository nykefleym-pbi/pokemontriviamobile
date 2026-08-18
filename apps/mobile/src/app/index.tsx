import { Image, Pressable, Text, View } from "react-native";
import { Link, useRouter } from "expo-router";
import { findPokemon, spriteUrl } from "@ptb/core/pokemon-data";
import { countCaught, DEX_TOTAL } from "../lib/dex";
import { useTrainer } from "../lib/store";

export default function Home() {
  const router = useRouter();
  const hydrated = useTrainer((s) => s.hydrated);
  const trainerName = useTrainer((s) => s.trainerName);
  const sprite = useTrainer((s) => s.sprite);
  const partnerId = useTrainer((s) => s.partnerId);
  const friendCode = useTrainer((s) => s.friendCode);
  const musicOn = useTrainer((s) => s.musicOn);
  const setMusic = useTrainer((s) => s.setMusicOn);
  const dex = useTrainer((s) => s.dex);
  const level = useTrainer((s) => s.level);
  const badges = useTrainer((s) => s.badges);
  const reset = useTrainer((s) => s.reset);

  // Rendering onboarding before the store has read from disk would flash a
  // "create your trainer" prompt at a returning player on every cold start.
  if (!hydrated) {
    return <View className="flex-1 bg-background" />;
  }

  const partner = partnerId !== null ? findPokemon(partnerId) : undefined;

  if (!trainerName) {
    return (
      <View className="flex-1 items-center justify-center gap-8 bg-background px-6">
        <View className="items-center gap-2">
          <Text className="text-center text-4xl font-extrabold text-poke-dark">
            Pokémon Trivia Battle
          </Text>
          <Text className="text-center text-base text-muted-foreground">
            Answer fast, answer right, knock them out.
          </Text>
        </View>
        <Link href="/create" asChild>
          <Pressable className="w-full rounded-card bg-primary px-6 py-4 active:opacity-80">
            <Text className="text-center text-lg font-bold text-primary-foreground">
              Create your trainer
            </Text>
          </Pressable>
        </Link>
        <Text className="text-center text-xs text-muted-foreground">
          No account needed. Progress stays on this device until sign-in ships.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 justify-between bg-background p-6">
      <View className="gap-5">
        <View className="flex-row items-center gap-4 rounded-card bg-card p-4">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-poke-blue">
            <Text className="text-2xl font-extrabold text-primary-foreground">
              {sprite.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View className="flex-1">
            <Text className="text-xl font-extrabold text-poke-dark">{trainerName}</Text>
            <Text className="text-xs capitalize text-muted-foreground">
              {sprite} · Level {level} · {badges.length} badges
            </Text>
            {friendCode && (
              <Text className="text-xs text-muted-foreground">
                Friend code <Text className="font-bold text-poke-dark">{friendCode}</Text>
              </Text>
            )}
          </View>
          {partner && (
            <Image
              source={{ uri: spriteUrl(partner.id) }}
              style={{ width: 64, height: 64 }}
              resizeMode="contain"
            />
          )}
        </View>

        {partner ? (
          <Text className="text-center text-sm text-muted-foreground">
            Partner: <Text className="font-bold text-poke-dark">{partner.name}</Text> (
            {partner.types.join(" / ")})
          </Text>
        ) : (
          <Text className="text-center text-sm text-muted-foreground">
            No partner chosen yet.
          </Text>
        )}
      </View>

      <View className="gap-3">
        <Pressable
          onPress={() => router.push(partner ? "/battle" : "/partner")}
          className="rounded-card bg-primary px-6 py-4 active:opacity-80"
        >
          <Text className="text-center text-lg font-bold text-primary-foreground">
            {partner ? "Start a solo battle" : "Choose a partner"}
          </Text>
        </Pressable>

        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.push("/gyms")}
            className="flex-1 rounded-card border border-border bg-card px-4 py-3 active:opacity-80"
          >
            <Text className="text-center text-sm font-bold text-poke-dark">Gyms</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push("/elite")}
            className="flex-1 rounded-card border border-border bg-card px-4 py-3 active:opacity-80"
          >
            <Text className="text-center text-sm font-bold text-poke-dark">Elite Four</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.push("/whos-that")}
          className="rounded-card border border-border bg-card px-6 py-3 active:opacity-80"
        >
          <Text className="text-center text-base font-bold text-poke-dark">
            Who's That Pokémon?
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.push("/dex")}
          className="rounded-card border border-border bg-card px-6 py-3 active:opacity-80"
        >
          <Text className="text-center text-base font-bold text-poke-dark">
            Pokédex · {countCaught(dex)} / {DEX_TOTAL}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.push("/partner")} className="px-6 py-2">
          <Text className="text-center text-sm text-muted-foreground">Change partner</Text>
        </Pressable>

        <Pressable onPress={() => setMusic(!musicOn)} className="px-6 py-2">
          <Text className="text-center text-sm text-muted-foreground">
            Music: {musicOn ? "on" : "off"}
          </Text>
        </Pressable>

        <Pressable onPress={reset} className="px-6 py-2">
          <Text className="text-center text-xs text-muted-foreground">Reset trainer</Text>
        </Pressable>
      </View>
    </View>
  );
}
