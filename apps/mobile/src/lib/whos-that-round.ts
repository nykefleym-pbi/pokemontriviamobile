import { makeRound, type WhosThatMode, type WhosThatRound } from "@ptb/core/whos-that";

/** The modes this app can actually render.
 *
 *  Mode "3" plays the Pokémon's cry and mode "5" shows its Pokédex flavour
 *  text; both need a remote resource the mobile app does not fetch yet (cry
 *  audio, and a flavour-text endpoint). Rather than render them half-working,
 *  a round that lands on either is re-rolled.
 *
 *  This is a filter, NOT a fork of `makeRound`: the same function the web route
 *  and the Edge Function use still generates every round, so there is one
 *  implementation of what a round is. Delete an entry here when its mode is
 *  supported, rather than reimplementing round generation. */
const SUPPORTED: ReadonlySet<WhosThatMode> = new Set<WhosThatMode>(["1A", "1B", "2", "4"]);

export function makeSupportedRound(): WhosThatRound {
  // Bounded: 4 of 6 modes are supported, so the chance of 40 consecutive
  // misses is about 1 in 10^7. The cap exists so a future filter that excluded
  // everything could not spin forever.
  for (let i = 0; i < 40; i++) {
    const round = makeRound();
    if (SUPPORTED.has(round.mode)) return round;
  }
  return { ...makeRound(), mode: "1A" };
}

export const MODE_PROMPT: Record<string, string> = {
  "1A": "Who's that Pokémon?",
  "1B": "What type is it?",
  "2": "Who's that Pokémon?",
  "4": "Name any Pokémon with this typing.",
};
