#!/usr/bin/env bash
# Runs inside the emulator step of apk-smoke.yml. Kept in one file because the
# emulator runner executes each line of its `script:` as a separate shell, so
# variables set on one line are gone on the next.
set -u
API="$1"
PKG=com.sahrae.entertainment

adb install -r Sahrae-release.apk
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell dumpsys webviewupdate | grep -i "current webview package" | tee webview.txt || true
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
sleep 45

adb shell pidof "$PKG" > pid.txt || true
adb exec-out screencap -p > screen.png || true
adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 || true
adb pull /sdcard/ui.xml ui.xml >/dev/null 2>&1 || true
adb logcat -d > logcat.txt || true

MAJOR=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' webview.txt | head -1 | cut -d. -f1)
COLOURS=$(python3 blank.py screen.png 2>/dev/null || echo 0)
echo "API $API   WebView major: ${MAJOR:-unknown}   distinct colours: $COLOURS   pid: $(cat pid.txt)"
grep -E "FATAL EXCEPTION|ANR in $PKG" logcat.txt | head -20 || true

if ! [ -s pid.txt ]; then
  echo "::error::App process exited within 45s (API $API)"; exit 1
fi
if [ -n "$MAJOR" ] && [ "$MAJOR" -lt 111 ]; then
  if grep -q "One quick update needed" ui.xml; then
    echo "Outdated WebView $MAJOR: the update dialog is shown, as intended."
  else
    echo "::error::WebView $MAJOR is too old and the update dialog did not appear (API $API)"; exit 1
  fi
else
  if [ "${COLOURS:-0}" -gt 40 ]; then
    echo "Modern WebView: the app is drawing content."
  else
    echo "::error::Screen is blank 45s after launch (API $API, $COLOURS colours)"; exit 1
  fi

  # ── Renderer loss ──
  # What a low-memory phone does to a WebView app: kill its renderer process.
  # Unhandled, Android then kills the whole app ("it closes by itself"). The app
  # must survive and draw again.
  APP_PID=$(cat pid.txt | tr -d '\r ')
  adb root >/dev/null 2>&1 || true
  adb wait-for-device
  # adbd restarts as root; give it a moment, then look for the renderer a few
  # times. Its name varies by WebView version, so match broadly.
  RENDERER=""
  for attempt in 1 2 3 4 5 6; do
    sleep 3
    adb shell ps -A > ps.txt 2>/dev/null || adb shell ps > ps.txt 2>/dev/null || true
    RENDERER=$(grep -iE "sandboxed_process|:sandboxed|privileged_process" ps.txt | awk '{print $2}' | head -1 | tr -d '\r')
    [ -n "$RENDERER" ] && break
  done
  if [ -z "$RENDERER" ]; then
    echo "--- process list ---"; grep -iE "webview|chrome|sahrae" ps.txt || true
    echo "::error::Could not find the WebView renderer process, so renderer loss was not tested (API $API)"; exit 1
  else
    echo "Killing WebView renderer pid $RENDERER"
    adb shell kill -9 "$RENDERER" || true
    sleep 20
    adb shell pidof "$PKG" > pid2.txt || true
    adb exec-out screencap -p > screen-after-renderer-loss.png || true
    COLOURS2=$(python3 blank.py screen-after-renderer-loss.png 2>/dev/null || echo 0)
    adb logcat -d > logcat.txt || true
    echo "After renderer loss: pid $(cat pid2.txt | tr -d '\r')  colours $COLOURS2"
    [ -s pid2.txt ] || { echo "::error::The app was killed when its WebView renderer died (API $API)"; exit 1; }
    [ "${COLOURS2:-0}" -gt 40 ] || { echo "::error::The app survived renderer loss but the screen is blank (API $API)"; exit 1; }
    echo "Renderer loss handled: the app stayed open and drew again (was pid $APP_PID)."
  fi
fi
