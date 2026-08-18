import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";

// These two are publishable by design — they ship inside every client bundle,
// and every table they can reach is protected by RLS rather than by the key
// being secret. The service-role key must never appear in this app.
const extra = Constants.expoConfig?.extra ?? {};
const url = String(extra.supabaseUrl ?? "");
const anonKey = String(extra.supabaseAnonKey ?? "");

export const supabase = createClient(url, anonKey, {
  auth: {
    // No session persistence yet: anonymous sign-in is still disabled in the
    // dashboard, so nothing here holds a session. When that is switched on,
    // this is where the MMKV/AsyncStorage adapter goes.
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const hasSupabaseConfig = url.length > 0 && anonKey.length > 0;
