import { Pressable, Text, View } from "react-native";
import { GIFT_CYCLE_DAYS, litGiftPips, planDailyGift } from "@ptb/core/daily-gift";
import { useTrainer } from "../lib/store";
import { answerHaptic } from "../lib/haptics";

/** Local calendar day as YYYY-MM-DD.
 *
 *  Deliberately NOT `toISOString().slice(0,10)`: that is UTC, so a player east
 *  or west of it would see the gift flip at the wrong hour — the exact class of
 *  bug the daily-gift module's own header warns calendar arithmetic invites. */
function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function DailyGift() {
  const lastClaim = useTrainer((s) => s.giftLastClaim);
  const streak = useTrainer((s) => s.giftStreak);
  const freezeUsed = useTrainer((s) => s.giftFreezeUsed);
  const claimGift = useTrainer((s) => s.claimGift);
  const grantReward = useTrainer((s) => s.grantReward);

  const today = todayLocal();
  const plan = planDailyGift({ lastClaim, streak, freezeUsedDate: freezeUsed, today });
  const lit = litGiftPips({ lastClaim, streak, freezeUsedDate: freezeUsed, today });

  function claim() {
    if (!plan) return;
    answerHaptic(true);
    // Day 7 is the cycle's peak. The web app pays a guaranteed shiny there,
    // which needs a Pokémon to attach to; until that exists the cycle pays
    // coins and XP that scale with the day.
    const coins = plan.day * 50 + plan.comebackCoins;
    claimGift(today, plan.day, plan.usedFreeze, coins);
    grantReward({ xp: 25 * plan.day });
  }

  return (
    <View className="gap-2 rounded-card bg-card p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-bold text-poke-dark">Daily gift</Text>
        <Text className="text-xs text-muted-foreground">
          {lit} / {GIFT_CYCLE_DAYS}
        </Text>
      </View>

      <View className="flex-row gap-1.5">
        {Array.from({ length: GIFT_CYCLE_DAYS }, (_, i) => (
          <View
            key={i}
            className={`h-2 flex-1 rounded-full ${i < lit ? "bg-poke-yellow" : "bg-muted"}`}
          />
        ))}
      </View>

      {plan ? (
        <Pressable onPress={claim} className="rounded-card bg-primary px-4 py-2.5 active:opacity-80">
          <Text className="text-center text-sm font-bold text-primary-foreground">
            Claim day {plan.day}
            {plan.comebackCoins > 0 ? ` · +${plan.comebackCoins} welcome back` : ""}
          </Text>
        </Pressable>
      ) : (
        <Text className="py-1 text-center text-xs text-muted-foreground">
          Claimed today — come back tomorrow.
        </Text>
      )}
    </View>
  );
}
