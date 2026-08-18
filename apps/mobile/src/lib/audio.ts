import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from "expo-audio";
import battleBgm from "../../assets/audio/battle_bgm.mp3";
import battleWin from "../../assets/audio/battle_win.mp3";
import battleLose from "../../assets/audio/battle_lose.mp3";

/** A deliberate subset of the web app's `audio.ts`, keeping its names so the
 *  two read alike. Only the contexts the mobile app actually has are here —
 *  the web union covers dex/shop/arena/mega screens that do not exist yet.
 *
 *  NOT ported: `playSfx`. The web app SYNTHESISES its sound effects with
 *  WebAudio oscillators rather than shipping files, so there is nothing to
 *  bundle and expo-audio cannot synthesise. Answer feedback is haptic-only for
 *  now (see haptics.ts); real SFX need either recorded assets or a synthesis
 *  library, and that is a decision, not an oversight. */
export type BgmContext = "battle_regular";

const SOURCES = {
  battle_regular: battleBgm,
  win: battleWin,
  lose: battleLose,
};

let bgm: AudioPlayer | null = null;
let musicOn = true;
let configured = false;

async function configureOnce() {
  if (configured) return;
  configured = true;
  try {
    // Play through the silent switch and duck rather than stop other audio —
    // a trivia game is not a phone call.
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false });
  } catch {
    // Audio mode is a nicety; never block the battle on it.
  }
}

export function isMusicOn(): boolean {
  return musicOn;
}

export function setMusicOn(on: boolean) {
  musicOn = on;
  if (!on) stopBgm();
}

export function playBgm(context: BgmContext) {
  if (!musicOn) return;
  void configureOnce();
  try {
    stopBgm();
    bgm = createAudioPlayer(SOURCES[context]);
    bgm.loop = true;
    bgm.volume = 0.4;
    bgm.play();
  } catch {
    bgm = null;
  }
}

export function stopBgm() {
  try {
    bgm?.remove();
  } catch {
    // already gone
  }
  bgm = null;
}

/** The win/lose sting. Stops the loop first so the two do not overlap — the
 *  one audio bug that is guaranteed to be noticed. */
export function playBattleResult(won: boolean) {
  stopBgm();
  if (!musicOn) return;
  try {
    const player = createAudioPlayer(won ? SOURCES.win : SOURCES.lose);
    player.volume = 0.6;
    player.play();
  } catch {
    // nothing to do
  }
}
