import { AppState } from "react-native";
import Constants from "expo-constants";
import { createClient } from "@supabase/supabase-js";
import { createMMKV } from "react-native-mmkv";

// These two are publishable by design — they ship inside every client bundle,
// and every table they can reach is protected by RLS rather than by the key
// being secret. The service-role key must never appear in this app.
const extra = Constants.expoConfig?.extra ?? {};
const url = String(extra.supabaseUrl ?? "");
const anonKey = String(extra.supabaseAnonKey ?? "");

// Sessions live in their own MMKV instance, separate from game state, so
// clearing a save can never invalidate the session (or the reverse).
const authStore = createMMKV({ id: "ptb-auth" });

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: {
      getItem: (key) => authStore.getString(key) ?? null,
      setItem: (key, value) => authStore.set(key, value),
      removeItem: (key) => {
        authStore.remove(key);
      },
    },
    persistSession: true,
    autoRefreshToken: true,
    // No URL to parse: anonymous sign-in involves no redirect, and there is no
    // OAuth provider yet. Leaving this on makes supabase-js touch web APIs that
    // do not exist in React Native.
    detectSessionInUrl: false,
  },
});

// supabase-js refreshes on a timer, which the OS suspends in the background.
// Without this an app resumed after a long pause runs on an expired token
// until the next refresh tick, and the first query of the session fails.
AppState.addEventListener("change", (state) => {
  if (state === "active") void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});

export const hasSupabaseConfig = url.length > 0 && anonKey.length > 0;
