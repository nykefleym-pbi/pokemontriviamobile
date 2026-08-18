import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "../global.css";

export default function RootLayout() {
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
      </Stack>
    </>
  );
}
