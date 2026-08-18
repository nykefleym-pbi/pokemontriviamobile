import * as Haptics from "expo-haptics";

/**
 * Answer feedback you feel rather than hear — a short tap on a correct answer,
 * a heavier error pattern on a wrong one.
 *
 * Ported from the web app's `answerHaptic`, keeping the signature so a caller
 * reads the same in both codebases. The web version drives
 * `navigator.vibrate(30)` / `[50, 30, 50]`; expo-haptics exposes semantic
 * patterns rather than raw durations, so the equivalents are used instead of
 * trying to reproduce exact millisecond timings.
 *
 * Deliberately not gated on a Reduced Motion setting: that setting is about
 * vestibular triggers from on-screen animation, and silencing haptics with it
 * would take feedback away from players who enabled it for a different reason.
 * Muting audio is a separate switch.
 */
export function answerHaptic(correct: boolean): void {
  try {
    if (correct) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  } catch {
    // No haptic motor, or the OS refused. Never worth failing an answer over.
  }
}
