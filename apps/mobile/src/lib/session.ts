import { hasSupabaseConfig, supabase } from "./supabase";

/** Signs in anonymously on first launch and returns the user id.
 *
 *  The profile row and its friend code are NOT created here — an `after insert`
 *  trigger on `auth.users` does that, so the client never has to invent a code
 *  nor be trusted to pick one (collisions and squatting are both server
 *  problems). See migration 0001.
 *
 *  Returns null when there is no config or the device is offline; every caller
 *  treats that as "play locally", never as an error worth blocking on. */
export async function ensureSession(): Promise<string | null> {
  if (!hasSupabaseConfig) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return data.session.user.id;

    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error || !signed.user) return null;
    return signed.user.id;
  } catch {
    return null;
  }
}
