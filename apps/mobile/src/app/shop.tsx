import { ScrollView, Text, View, Pressable } from "react-native";
import { ITEMS } from "@ptb/core/game-data";
import { useTrainer } from "../lib/store";
import { answerHaptic } from "../lib/haptics";

/** Berries and pvpOnly items are Nearby-Battle only, and premium items are not
 *  bought with coins — the solo shop shows neither. */
const SHOP_ITEMS = ITEMS.filter((i) => !i.premium && !i.pvpOnly && !i.isBerry);

export default function Shop() {
  const coins = useTrainer((s) => s.coins);
  const inventory = useTrainer((s) => s.inventory);
  const buyItem = useTrainer((s) => s.buyItem);

  return (
    <ScrollView className="flex-1 bg-background" contentContainerClassName="gap-3 p-4 pb-8">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-lg font-extrabold text-poke-dark">Shop</Text>
        <Text className="text-sm font-bold text-poke-dark">{coins} coins</Text>
      </View>

      {SHOP_ITEMS.map((item) => {
        const held = inventory[item.id] ?? 0;
        const afford = coins >= item.cost;
        return (
          <View key={item.id} className="flex-row items-center gap-3 rounded-card bg-card p-3">
            <View className="flex-1">
              <Text className="text-base font-bold text-poke-dark">
                {item.name}
                {held > 0 ? ` ×${held}` : ""}
              </Text>
              <Text className="text-xs text-muted-foreground" numberOfLines={2}>
                {item.desc}
              </Text>
            </View>
            <Pressable
              disabled={!afford}
              onPress={() => answerHaptic(buyItem(item.id, item.cost))}
              className={`rounded-card px-4 py-2 ${afford ? "bg-primary active:opacity-80" : "bg-muted"}`}
            >
              <Text
                className={`text-sm font-bold ${afford ? "text-primary-foreground" : "text-muted-foreground"}`}
              >
                {item.cost}
              </Text>
            </Pressable>
          </View>
        );
      })}

      <Text className="pt-2 text-center text-xs text-muted-foreground">
        Items are bought and held, but nothing consumes them yet — the battle
        screen does not offer a bag. See docs/ROADMAP.md.
      </Text>
    </ScrollView>
  );
}
