import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  NAME_MAX,
  TRAINER_SPRITES,
  useTrainer,
  validateTrainerName,
  type TrainerSprite,
} from "../lib/store";
import { claimTrainer } from "../lib/sync";

export default function CreateTrainer() {
  const router = useRouter();
  const existingName = useTrainer((s) => s.trainerName);
  const existingSprite = useTrainer((s) => s.sprite);
  const setTrainer = useTrainer((s) => s.setTrainer);

  const [name, setName] = useState(existingName ?? "");
  const [sprite, setSprite] = useState<TrainerSprite>(existingSprite);
  const [touched, setTouched] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [taken, setTaken] = useState(false);

  const userId = useTrainer((s) => s.userId);
  const error = validateTrainerName(name);
  const showError = (touched && error !== null) || taken;
  const message = taken ? "That name is already taken." : error;

  async function submit() {
    setTouched(true);
    setTaken(false);
    if (error || claiming) return;

    // The database holds a unique index on lower(trainer_name) that the app
    // cannot check ahead of time, so the claim is what decides. With no
    // session we save locally and let the next sync attempt settle it.
    if (userId) {
      setClaiming(true);
      const result = await claimTrainer(userId, name.trim(), sprite);
      setClaiming(false);
      if (!result.ok && result.reason === "taken") {
        setTaken(true);
        return;
      }
    }

    setTrainer(name, sprite);
    router.replace("/partner");
  }

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-7 p-6">
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-poke-dark">Name your trainer</Text>
        <Text className="text-sm text-muted-foreground">
          This is the name other trainers see. You can change it later.
        </Text>
      </View>

      <View className="gap-2">
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            setTaken(false);
          }}
          onBlur={() => setTouched(true)}
          placeholder="Ash"
          placeholderTextColor="#586474"
          maxLength={NAME_MAX}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={() => void submit()}
          className={`rounded-card border bg-card px-4 py-3 text-lg text-poke-dark ${
            showError ? "border-primary" : "border-border"
          }`}
        />
        <View className="flex-row justify-between">
          <Text className="text-xs text-primary">{showError ? message : " "}</Text>
          <Text className="text-xs text-muted-foreground">
            {name.trim().length}/{NAME_MAX}
          </Text>
        </View>
      </View>

      <View className="gap-3">
        <Text className="text-sm font-bold text-poke-dark">Pick a look</Text>
        <View className="flex-row flex-wrap gap-3">
          {TRAINER_SPRITES.map((s) => {
            const active = s === sprite;
            return (
              <Pressable
                key={s}
                onPress={() => setSprite(s)}
                className={`h-20 w-20 items-center justify-center rounded-card border-2 ${
                  active ? "border-poke-blue bg-poke-blue" : "border-border bg-card"
                }`}
              >
                <Text
                  className={`text-2xl font-extrabold ${
                    active ? "text-primary-foreground" : "text-poke-dark"
                  }`}
                >
                  {s.charAt(0).toUpperCase()}
                </Text>
                <Text
                  className={`text-[10px] capitalize ${
                    active ? "text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text className="text-xs text-muted-foreground">
          Trainer art is not bundled yet — these show initials for now.
        </Text>
      </View>

      <Pressable
        onPress={() => void submit()}
        disabled={claiming}
        className={`rounded-card px-6 py-4 ${
          error || claiming ? "bg-muted" : "bg-primary active:opacity-80"
        }`}
      >
        <Text
          className={`text-center text-lg font-bold ${
            error || claiming ? "text-muted-foreground" : "text-primary-foreground"
          }`}
        >
          {claiming ? "Claiming name…" : "Choose a partner"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}
