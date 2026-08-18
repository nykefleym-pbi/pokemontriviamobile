import { ALL_POKEMON, type PokeEntry } from "@ptb/core/pokemon-data";

export type DexStatus = "caught" | "seen" | "unknown";

/** The National-Dex-ordered list the grid renders.
 *
 *  `ALL_POKEMON` in packages/core also carries synthetic forme entries with
 *  ids far above the real range (Calyrex's rider formes, id 10194 and friends).
 *  Those exist for battle maths, not for a Pokédex, so the grid stops at the
 *  real National Dex. */
export const DEX_ENTRIES: PokeEntry[] = ALL_POKEMON.filter((p) => p.id <= 1025).sort(
  (a, b) => a.id - b.id,
);

export const DEX_TOTAL = DEX_ENTRIES.length;

export function statusOf(
  dex: Record<string, "seen" | "caught">,
  id: number,
): DexStatus {
  return dex[String(id)] ?? "unknown";
}

export function countCaught(dex: Record<string, "seen" | "caught">): number {
  return Object.values(dex).filter((v) => v === "caught").length;
}

export function searchDex(query: string): PokeEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return DEX_ENTRIES;
  // A number search means "the entry with that id", which is how people
  // actually look a Pokémon up when they know its number.
  if (/^\d+$/.test(q)) {
    const id = Number(q);
    return DEX_ENTRIES.filter((p) => p.id === id || String(p.id).startsWith(q));
  }
  return DEX_ENTRIES.filter((p) => p.name.toLowerCase().includes(q));
}
