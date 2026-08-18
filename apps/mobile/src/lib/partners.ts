import { findPokemon, type PokeEntry } from "@ptb/core/pokemon-data";

/** A curated starter grid.
 *
 *  `STARTING_PARTNERS` in packages/core is every stage-1 Pokémon — hundreds of
 *  entries — which is the right list for a searchable picker later, but not
 *  something to render as a grid. These ids are resolved through
 *  `findPokemon` so names and types come from the real Pokédex rather than
 *  being typed out here and drifting from it. */
const STARTER_IDS = [1, 4, 7, 25, 152, 155, 158, 252, 255, 258, 133, 447];

export const STARTERS: PokeEntry[] = STARTER_IDS.map((id) => findPokemon(id)).filter(
  (p): p is PokeEntry => p !== undefined,
);

export const TYPE_COLORS: Record<string, string> = {
  normal: "#9aa0a8", fire: "#ee8130", water: "#6390f0", electric: "#f7d02c",
  grass: "#7ac74c", ice: "#96d9d6", fighting: "#c22e28", poison: "#a33ea1",
  ground: "#e2bf65", flying: "#a98ff3", psychic: "#f95587", bug: "#a6b91a",
  rock: "#b6a136", ghost: "#735797", dragon: "#6f35fc", dark: "#705746",
  steel: "#b7b7ce", fairy: "#d685ad",
};
