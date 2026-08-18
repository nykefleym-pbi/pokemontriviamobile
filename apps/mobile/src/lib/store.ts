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
  /** True once the store has read from disk. Nothing should render onboarding
   *  before this, or a returning player sees it for a frame on every launch. */
  hydrated: boolean;
  /** Anonymous auth user id, once signed in. Null means playing locally. */
  userId: string | null;
  /** Server-allocated, never invented here — see migration 0001. */
  friendCode: string | null;
  musicOn: boolean;
  setMusicOn: (on: boolean) => void;
  /** Pokédex progress, keyed by id as a STRING because this is serialised to
   *  JSON — numeric object keys survive a round trip only by luck of ordering.
   *
   *  The web app models this as `caught !== false` rather than a truthy test,
   *  because its `caught` key was added after players already had saves and a
   *  truthy check would have silently demoted every existing Pokédex to "seen".
   *  This app starts fresh, so the states are explicit and that hazard does not
   *  apply — but do not "simplify" the web one to match. */
  dex: Record<string, "seen" | "caught">;
  markSeen: (id: number) => void;
  markCaught: (id: number) => void;
  /** Gym leader ids defeated. */
  badges: string[];
  /** Elite Four member ids defeated. */
  eliteDefeated: string[];
  /** TOTAL xp earned. Level is DERIVED from it via `levelFromTotalXp`, never
   *  stored — two fields that can disagree is exactly how a save ends up with a
   *  level its xp cannot justify. This replaces the earlier placeholder that
   *  simply counted wins. */
  xp: number;
  coins: number;
  /** Training points — the currency the lifetime-TP damage multiplier reads. */
  tp: number;
  /** item id -> count held. */
  inventory: Record<string, number>;
  /** Daily-gift cadence state. The ARITHMETIC lives in packages/core's
   *  planDailyGift; this only stores what that function needs as input. */
  giftLastClaim: string | null;
  giftStreak: number;
  giftFreezeUsed: string | null;
  buyItem: (id: string, cost: number) => boolean;
  /** Returns false when none are held, so a caller cannot spend what the
   *  player does not have by forgetting to check first. */
  consumeItem: (id: string) => boolean;
  claimGift: (today: string, day: number, usedFreeze: boolean, coins: number) => void;
  awardBadge: (gymId: string) => void;
  awardElite: (eliteId: string) => void;
  grantReward: (r: { xp: number; coins?: number; tp?: number }) => void;
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
      userId: null,
      friendCode: null,
      musicOn: true,
      dex: {},
      badges: [],
      eliteDefeated: [],
      xp: 0,
      coins: 0,
      tp: 0,
      inventory: {},
      giftLastClaim: null,
      giftStreak: 0,
      giftFreezeUsed: null,
      setTrainer: (trainerName, sprite) => set({ trainerName: trainerName.trim(), sprite }),
      setPartner: (partnerId) => set({ partnerId }),
      setMusicOn: (musicOn) => set({ musicOn }),
      markSeen: (id) =>
        set((s) => {
          // Never downgrade a catch to a sighting.
          if (s.dex[String(id)]) return s;
          return { dex: { ...s.dex, [String(id)]: "seen" } };
        }),
      markCaught: (id) => set((s) => ({ dex: { ...s.dex, [String(id)]: "caught" } })),
      awardBadge: (gymId) =>
        set((s) => (s.badges.includes(gymId) ? s : { badges: [...s.badges, gymId] })),
      awardElite: (eliteId) =>
        set((s) =>
          s.eliteDefeated.includes(eliteId) ? s : { eliteDefeated: [...s.eliteDefeated, eliteId] },
        ),
      buyItem: (id, cost) => {
        const s = useTrainer.getState();
        if (s.coins < cost) return false;
        useTrainer.setState({
          coins: s.coins - cost,
          inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + 1 },
        });
        return true;
      },
      consumeItem: (id) => {
        const s = useTrainer.getState();
        if ((s.inventory[id] ?? 0) < 1) return false;
        useTrainer.setState({
          inventory: { ...s.inventory, [id]: s.inventory[id] - 1 },
        });
        return true;
      },
      claimGift: (today, day, usedFreeze, coins) =>
        set((s) => ({
          giftLastClaim: today,
          giftStreak: day,
          giftFreezeUsed: usedFreeze ? today : s.giftFreezeUsed,
          coins: s.coins + coins,
        })),
      grantReward: ({ xp, coins = 0, tp = 0 }) =>
        set((s) => ({ xp: s.xp + xp, coins: s.coins + coins, tp: s.tp + tp })),
      reset: () =>
        set({
          trainerName: null,
          sprite: "red",
          partnerId: null,
          dex: {},
          badges: [],
          eliteDefeated: [],
          xp: 0,
          coins: 0,
          tp: 0,
          inventory: {},
          giftLastClaim: null,
          giftStreak: 0,
          giftFreezeUsed: null,
        }),
    }),
    {
      name: "trainer",
      storage,
      // userId and friendCode are deliberately NOT persisted: the session is
      // the source of truth for one and the server for the other, and a stale
      // copy of either would be worse than re-fetching.
      partialize: (s) => ({
        trainerName: s.trainerName,
        sprite: s.sprite,
        partnerId: s.partnerId,
        musicOn: s.musicOn,
        dex: s.dex,
        badges: s.badges,
        eliteDefeated: s.eliteDefeated,
        xp: s.xp,
        coins: s.coins,
        tp: s.tp,
        inventory: s.inventory,
        giftLastClaim: s.giftLastClaim,
        giftStreak: s.giftStreak,
        giftFreezeUsed: s.giftFreezeUsed,
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
