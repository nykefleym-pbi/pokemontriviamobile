import { useEffect } from "react";
import { ensureSession } from "./session";
import {
  fetchFriendCode,
  pullSave,
  pushPokedexCount,
  pushSave,
  SAVE_VERSION,
  type SavePayload,
} from "./sync";
import { countCaught } from "./dex";
import { useTrainer } from "./store";

function payloadOf(s: ReturnType<typeof useTrainer.getState>): SavePayload {
  return {
    trainerName: s.trainerName,
    sprite: s.sprite,
    partnerId: s.partnerId,
    dex: s.dex,
  };
}

/** Signs in, reconciles the local save with the server's, then keeps the
 *  server copy up to date. Every step degrades to "play locally" rather than
 *  blocking: the battle screen needs no session at all.
 *
 *  Conflict policy, stated plainly because it is deliberately simple: the
 *  server copy is adopted only on a device with NO local trainer — the fresh
 *  install case. Otherwise local wins and is pushed. A real multi-device merge
 *  (two devices both with progress) is NOT implemented; `saves.version` and
 *  `updated_at` are in the schema to support one when a phase needs it. */
export function useBootSync() {
  const hydrated = useTrainer((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    let alive = true;

    void (async () => {
      const userId = await ensureSession();
      if (!alive || !userId) return;
      useTrainer.setState({ userId });

      const remote = await pullSave();
      if (!alive) return;

      const local = useTrainer.getState();
      if (remote && remote.version <= SAVE_VERSION && !local.trainerName && remote.state.trainerName) {
        useTrainer.setState({
          trainerName: remote.state.trainerName,
          sprite: remote.state.sprite as typeof local.sprite,
          partnerId: remote.state.partnerId,
          dex: remote.state.dex ?? {},
        });
      } else if (local.trainerName) {
        await pushSave(userId, payloadOf(local));
        await pushPokedexCount(userId, countCaught(local.dex));
      }

      const code = await fetchFriendCode();
      if (alive && code) useTrainer.setState({ friendCode: code });
    })();

    return () => {
      alive = false;
    };
  }, [hydrated]);

  // Push subsequent edits. Debounced so that typing a name or flicking through
  // partners is one write, not one per keystroke.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const unsub = useTrainer.subscribe((s, prev) => {
      if (!s.userId) return;
      if (
        s.trainerName === prev.trainerName &&
        s.sprite === prev.sprite &&
        s.partnerId === prev.partnerId &&
        s.dex === prev.dex
      ) {
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const uid = s.userId;
        if (!uid) return;
        void pushSave(uid, payloadOf(s));
        void pushPokedexCount(uid, countCaught(s.dex));
      }, 1200);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, []);
}
