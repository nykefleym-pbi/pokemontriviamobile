import { supabase } from "./supabase";

/** Bumped when the shape of the payload in `saves.state` changes. It is also
 *  the conflict resolver: `saves.version` is compared on pull, and a device
 *  holding an older schema never overwrites a newer one. */
export const SAVE_VERSION = 1;

export interface SavePayload {
  trainerName: string | null;
  sprite: string;
  partnerId: number | null;
  dex: Record<string, "seen" | "caught">;
}

export interface RemoteSave {
  state: SavePayload;
  version: number;
  updatedAt: string;
}

export async function pullSave(): Promise<RemoteSave | null> {
  const { data, error } = await supabase
    .from("saves")
    .select("state, version, updated_at")
    .maybeSingle();
  if (error || !data) return null;
  return {
    state: data.state as SavePayload,
    version: data.version as number,
    updatedAt: data.updated_at as string,
  };
}

export async function pushSave(userId: string, state: SavePayload): Promise<boolean> {
  const { error } = await supabase
    .from("saves")
    .upsert({ user_id: userId, state, version: SAVE_VERSION }, { onConflict: "user_id" });
  return !error;
}

export type ClaimResult = { ok: true } | { ok: false; reason: "taken" | "offline" };

/** Claims the trainer name and sprite on the public profile.
 *
 *  `profiles` carries a unique index on `lower(trainer_name)`, which the app
 *  cannot check ahead of time — two devices can pass local validation with the
 *  same name and only one can win. Postgres reports that as 23505, and this is
 *  the only place that distinguishes it from a generic failure, so the create
 *  screen can say "that name is taken" instead of "something went wrong".
 *
 *  Nothing here writes anything the profiles table should not hold: no email,
 *  no device id. That table has a public read policy. */
export async function claimTrainer(
  userId: string,
  trainerName: string,
  sprite: string,
): Promise<ClaimResult> {
  const { error } = await supabase
    .from("profiles")
    .update({ trainer_name: trainerName, trainer_sprite: sprite })
    .eq("id", userId);

  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, reason: "taken" };
  return { ok: false, reason: "offline" };
}

/** Mirrors the caught count onto the public profile.
 *
 *  `profiles` is publicly readable, so this is the number other trainers see.
 *  It is derived from `saves.state.dex` rather than being a second source of
 *  truth — if the two ever disagree, the save is right and this is stale. */
export async function pushPokedexCount(userId: string, caught: number): Promise<boolean> {
  const { error } = await supabase
    .from("profiles")
    .update({ pokedex_count: caught })
    .eq("id", userId);
  return !error;
}

export async function fetchFriendCode(): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("friend_code").maybeSingle();
  if (error || !data) return null;
  return (data.friend_code as string) ?? null;
}
