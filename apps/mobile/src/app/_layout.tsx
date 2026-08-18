import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useBootSync } from "../lib/use-boot-sync";
import { useTrainer } from "../lib/store";
import "../global.css";

// Hold the native splash until the store has read from disk. Without this the
// first frame is whatever renders before rehydration — a blank screen, or worse
// the onboarding prompt shown to a player who already has a trainer.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useBootSync();
  const hydrated = useTrainer((s) => s.hydrated);

  useEffect(() => {
    if (hydrated) void SplashScreen.hideAsync();
  }, [hydrated]);

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0f1b2d" },
          headerTintColor: "#fcfaf1",
          headerTitleStyle: { fontWeight: "700" },
          contentStyle: { backgroundColor: "#fcfaf1" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "Pokémon Trivia Battle" }} />
        <Stack.Screen name="create" options={{ title: "New Trainer" }} />
        <Stack.Screen name="partner" options={{ title: "Your Partner" }} />
        <Stack.Screen name="battle" options={{ title: "Solo Battle" }} />
        <Stack.Screen name="gyms" options={{ title: "Gym Leaders" }} />
        <Stack.Screen name="elite" options={{ title: "Elite Four" }} />
        <Stack.Screen name="dex/index" options={{ title: "Pokédex" }} />
        <Stack.Screen name="dex/[id]" options={{ title: "Entry" }} />
      </Stack>
    </>
  );
}
