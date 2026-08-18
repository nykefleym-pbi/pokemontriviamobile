import { useMemo, useState } from "react";
import { FlatList, Image, Pressable, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { spriteUrl, type PokeEntry } from "@ptb/core/pokemon-data";
import { countCaught, DEX_TOTAL, searchDex, statusOf } from "../../lib/dex";
import { useTrainer } from "../../lib/store";

const COLUMNS = 3;

export default function Dex() {
  const router = useRouter();
  const dex = useTrainer((s) => s.dex);
  const [query, setQuery] = useState("");

  const entries = useMemo(() => searchDex(query), [query]);
  const caught = countCaught(dex);

  return (
    <View className="flex-1 bg-background">
      <View className="gap-3 p-4">
        <View className="flex-row items-baseline justify-between">
          <Text className="text-lg font-extrabold text-poke-dark">Pokédex</Text>
          <Text className="text-xs text-muted-foreground">
            {caught} / {DEX_TOTAL} caught
          </Text>
        </View>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or number"
          placeholderTextColor="#586474"
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-card border border-border bg-card px-4 py-2 text-poke-dark"
        />
      </View>

      <FlatList
        data={entries}
        numColumns={COLUMNS}
        keyExtractor={(p) => String(p.id)}
        contentContainerClassName="px-3 pb-8 gap-3"
        columnWrapperClassName="gap-3"
        // 1025 entries: without windowing this list drops frames badly on a
        // mid-range phone. These are the knobs that matter.
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={
          <Text className="p-6 text-center text-sm text-muted-foreground">
            Nothing matches “{query}”.
          </Text>
        }
        renderItem={({ item }) => (
          <DexCell entry={item} status={statusOf(dex, item.id)} onPress={() => router.push(`/dex/${item.id}`)} />
        )}
      />
    </View>
  );
}

function DexCell({
  entry,
  status,
  onPress,
}: {
  entry: PokeEntry;
  status: "caught" | "seen" | "unknown";
  onPress: () => void;
}) {
  const known = status !== "unknown";
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center gap-1 rounded-card border p-2 ${
        status === "caught" ? "border-poke-blue bg-card" : "border-border bg-card"
      }`}
    >
      <Text className="self-start text-[10px] text-muted-foreground">
        #{String(entry.id).padStart(4, "0")}
      </Text>
      <Image
        source={{ uri: spriteUrl(entry.id) }}
        style={{
          width: "72%",
          aspectRatio: 1,
          // An unseen entry is a silhouette. Tint rather than a separate asset,
          // and sized as a share of the tile so it is never cropped.
          opacity: known ? 1 : 0.25,
          tintColor: known ? undefined : "#0f1b2d",
        }}
        resizeMode="contain"
      />
      <Text className="text-center text-[11px] font-bold text-poke-dark" numberOfLines={1}>
        {known ? entry.name : "???"}
      </Text>
      {status === "caught" ? (
        <View className="rounded-full bg-poke-blue px-2">
          <Text className="text-[9px] font-bold text-primary-foreground">Caught</Text>
        </View>
      ) : status === "seen" ? (
        <View className="rounded-full bg-muted px-2">
          <Text className="text-[9px] font-bold text-muted-foreground">Seen</Text>
        </View>
      ) : (
        <View className="h-[14px]" />
      )}
    </Pressable>
  );
}

