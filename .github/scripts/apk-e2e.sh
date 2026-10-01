#!/usr/bin/env bash
# Install the debug APK, open it, attach to its WebView over DevTools and run the
# shared user flows (e2e/lib.mjs). Usage: apk-e2e.sh <label>
set -uo pipefail
LABEL="$1"
PKG=com.sahrae.entertainment
OUT="e2e/results/android-$LABEL"
mkdir -p "$OUT"

APK=$(find android/app/build/outputs/apk -name '*.apk' | head -n1)
echo "APK: $APK"
timeout 180 adb install -r "$APK"
# The app asks for this on first launch; pre-granting keeps a system dialog off the screen.
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb logcat -c
timeout 60 adb shell am start -W -n "$PKG/.MainActivity"

SOCK=""
for _ in $(seq 1 90); do
  SOCK=$(timeout 10 adb shell cat /proc/net/unix 2>/dev/null | grep -oE 'webview_devtools_remote_[0-9]+' | head -n1)
  [ -n "$SOCK" ] && break
  sleep 2
done
echo "WebView DevTools socket: ${SOCK:-none}"
if [ -z "$SOCK" ]; then
  timeout 30 adb exec-out screencap -p > "$OUT/no-devtools.png"
  timeout 30 adb logcat -d > "$OUT/logcat.txt"
  exit 1
fi
adb forward tcp:9222 "localabstract:$SOCK"

# The ad-rule engine loads off-thread a few seconds after launch. Wait it out so
# the run sees the steady state a person is in, not the first few seconds.
sleep 25

( cd e2e && timeout 2400 node run.mjs android --out "results/android-$LABEL" ) 2>&1 | tee "$OUT/run.log"
RC=${PIPESTATUS[0]}

timeout 30 adb exec-out screencap -p > "$OUT/device-screen-at-end.png" || true
timeout 30 adb logcat -d > "$OUT/logcat.txt" || true
echo "flows exit code: $RC"
exit "$RC"
