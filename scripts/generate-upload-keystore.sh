#!/usr/bin/env bash
# Generates the Play upload key.
#
# RUN THIS ON YOUR OWN MACHINE, not in CI and not in an agent sandbox.
#
# This key is what proves to Google Play that an upload is yours. It is
# long-lived, and anything it passes through keeps a copy: a CI log, an agent
# transcript, a chat message. Generating it locally means the only copies are
# the file you hold and the GitHub secret you paste it into.
#
# Losing it is recoverable — Play can reset an upload key via support — but it
# is a slow process at exactly the moment you want to ship.
set -euo pipefail

OUT="${1:-upload.jks}"
ALIAS="${ALIAS:-upload}"

if [ -e "$OUT" ]; then
  echo "refusing to overwrite existing $OUT" >&2
  exit 1
fi

echo "Choose a password when prompted. Use the SAME one for the store and the"
echo "key — the workflow passes them separately but they may match, and two"
echo "different passwords is a needless thing to lose track of."
echo

keytool -genkeypair -v \
  -keystore "$OUT" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

echo
echo "Done: $OUT"
echo
echo "Now set these four GitHub repository secrets"
echo "(Settings -> Secrets and variables -> Actions):"
echo
echo "  ANDROID_KEYSTORE_BASE64   $(printf '%s' "base64 -w0 $OUT")"
echo "  ANDROID_KEYSTORE_PASSWORD the store password you just chose"
echo "  ANDROID_KEY_ALIAS         $ALIAS"
echo "  ANDROID_KEY_PASSWORD      the key password you just chose"
echo
echo "Then back up $OUT somewhere durable and DO NOT COMMIT IT."
