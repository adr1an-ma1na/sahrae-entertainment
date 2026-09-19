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
fi
