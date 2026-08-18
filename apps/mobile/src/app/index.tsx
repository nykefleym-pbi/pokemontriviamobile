import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

export default function Home() {
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

      <Link href="/battle" asChild>
        <Pressable className="w-full rounded-card bg-primary px-6 py-4 active:opacity-80">
          <Text className="text-center text-lg font-bold text-primary-foreground">
            Start a solo battle
          </Text>
        </Pressable>
      </Link>

      <Text className="text-center text-xs text-muted-foreground">
        Trainer profiles and saved progress arrive once anonymous sign-in is
        enabled. The battle itself needs no account.
      </Text>
    </View>
  );
}
