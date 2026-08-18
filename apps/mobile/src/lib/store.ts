import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { createMMKV } from "react-native-mmkv";

// App state, deliberately NOT in packages/core. The engine is isomorphic and
// must stay free of client state — eslint enforces that by banning `zustand`,
// `react-native-mmkv` and any `**/store` import inside packages/core/src.
// v4 exposes a factory, not a class — `MMKV` is a type-only export there.
const mmkv = createMMKV({ id: "ptb-trainer" });

const storage = createJSONStorage(() => ({
  getItem: (key) => mmkv.getString(key) ?? null,
  setItem: (key, value) => mmkv.set(key, value),
  removeItem: (key) => {
    mmkv.remove(key);
  },
}));

/** Mirrors `profiles.trainer_name`'s check constraint exactly — 3 to 16
 *  characters. Keeping the two in step matters: a name accepted here and
 *  rejected by the database would fail at sync time, long after the player
 *  chose it. */
export const NAME_MIN = 3;
export const NAME_MAX = 16;

export function validateTrainerName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < NAME_MIN) return `At least ${NAME_MIN} characters.`;
  if (name.length > NAME_MAX) return `At most ${NAME_MAX} characters.`;
  return null;
}

/** The sprite ids the server already knows about — `profiles.trainer_sprite`
 *  defaults to 'red'. Art is not bundled yet, so these render as initials. */
export const TRAINER_SPRITES = ["red", "blue", "leaf", "ethan", "may", "gold"] as const;
export type TrainerSprite = (typeof TRAINER_SPRITES)[number];

interface TrainerState {
  trainerName: string | null;
  sprite: TrainerSprite;
  partnerId: number | null;
  hydrated: boolean;
  setTrainer: (name: string, sprite: TrainerSprite) => void;
  setPartner: (id: number) => void;
  reset: () => void;
}

export const useTrainer = create<TrainerState>()(
  persist(
    (set) => ({
      trainerName: null,
      sprite: "red",
      partnerId: null,
      hydrated: false,
      setTrainer: (trainerName, sprite) => set({ trainerName: trainerName.trim(), sprite }),
      setPartner: (partnerId) => set({ partnerId }),
      reset: () => set({ trainerName: null, sprite: "red", partnerId: null }),
    }),
    {
      name: "trainer",
      storage,
      partialize: (s) => ({
        trainerName: s.trainerName,
        sprite: s.sprite,
        partnerId: s.partnerId,
      }),
      // Nothing should render a "create your trainer" prompt before the store
      // has actually read from disk, or a returning player sees onboarding for
      // a frame on every cold start.
      onRehydrateStorage: () => (state) => {
        useTrainer.setState({ hydrated: true });
        void state;
      },
    },
  ),
);
