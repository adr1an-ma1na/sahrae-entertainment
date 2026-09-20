#!/usr/bin/env bash
# Runs inside the emulator step of apk-smoke.yml. Kept in one file because the
# emulator runner executes each line of its `script:` as a separate shell, so
# variables set on one line are gone on the next.
set -u
API="$1"
RAM="${2:-4096}"
PKG=com.sahrae.entertainment

adb install -r Sahrae-release.apk
adb shell pm grant "$PKG" android.permission.POST_NOTIFICATIONS 2>/dev/null || true
adb shell dumpsys webviewupdate | grep -i "current webview package" | tee webview.txt || true

# On a freshly booted CI emulator, Google Play services restarts itself within
# the first minute or so. Android kills every app using its font provider when
# it does, and the WebView uses it, so any WebView app launched in that window
# dies with it. That is an emulator start-up artifact, not a Sahrae bug; wait it
# out before launching.
sleep 90

launch() {
  adb logcat -c
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
  sleep 45
  adb shell pidof "$PKG" > pid.txt || true
}
launch
if ! [ -s pid.txt ]; then
  adb logcat -d > logcat-first-launch.txt || true
  if grep -q "depends on provider com.google.android.gms" logcat-first-launch.txt; then
    echo "::warning::Play services restarted during launch and took the app with it (a platform behaviour for every WebView app). Relaunching once."
    sleep 30
    launch
  fi
fi
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

  # ── Small phone ──
  # The failure a 3 GB Nokia C32 hit: the app starts, then Android kills its
  # renderer for memory, over and over. Lite mode is what is supposed to prevent
  # that, so on a small emulator sit with the app open and require that it is
  # still the same process, still drawing, a minute later.
  if [ "$RAM" -le 2048 ]; then
    FIRST_PID=$(cat pid.txt | tr -d '\r ')
    adb shell input swipe 500 1200 500 300 300 || true
    sleep 20
    adb shell input swipe 500 1200 500 300 300 || true
    sleep 40
    adb shell pidof "$PKG" > pid-idle.txt || true
    adb exec-out screencap -p > screen-small-phone.png || true
    IDLE_PID=$(cat pid-idle.txt | tr -d '\r ')
    COLOURS_IDLE=$(python3 blank.py screen-small-phone.png 2>/dev/null || echo 0)
    adb logcat -d > logcat.txt || true
    KILLS=$(grep -c "Killing .*$PKG" logcat.txt || true)
    echo "Small phone ($RAM MB): pid $FIRST_PID -> $IDLE_PID, colours $COLOURS_IDLE, kills $KILLS"
    [ -n "$IDLE_PID" ] || { grep -E "Killing .*$PKG|$PKG.*has died" logcat.txt | head -5; echo "::error::The app was killed while open on a $RAM MB device (API $API)"; exit 1; }
    [ "$IDLE_PID" = "$FIRST_PID" ] || { echo "::error::The app restarted while open on a $RAM MB device: its renderer is still being killed (API $API)"; exit 1; }
    [ "${COLOURS_IDLE:-0}" -gt 40 ] || { echo "::error::Blank screen after a minute on a $RAM MB device (API $API)"; exit 1; }
    echo "Small phone: the app held its process and kept drawing."
  fi

  # ── Renderer loss ──
  # What a low-memory phone does to a WebView app: kill its renderer process.
  # Unhandled, Android then kills the whole app ("it closes by itself"). The app
  # must survive and draw again.
  APP_PID=$(cat pid.txt | tr -d '\r ')
  adb root >/dev/null 2>&1 || true
  adb wait-for-device
  # Switching adbd to root makes Google Play services restart a few seconds
  # later, and Android kills every app bound to its font provider when it does,
  # which the WebView is. Seen in the first runs of this check: the app handled
  # the renderer loss, then died to that restart. Let it settle first.
  sleep 30
  adb logcat -c
  # Look for the renderer a few times. Its name varies by WebView version, so
  # match broadly.
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
    # Chromium's own verdict when an app does not handle renderer loss.
    if grep -qiE "wasn.t hand(l)?ed by all associated webviews" logcat.txt; then
      grep -iE "wasn.t hand(l)?ed by all associated webviews" logcat.txt | head -2
      echo "::error::Renderer loss was not handled; Chromium killed the app (API $API)"; exit 1
    fi
    if ! [ -s pid2.txt ]; then
      grep -E "Killing .*$PKG|$PKG.*has died" logcat.txt | head -5
      echo "::error::The app is gone after renderer loss (API $API)"; exit 1
    fi
    [ "${COLOURS2:-0}" -gt 40 ] || { echo "::error::The app survived renderer loss but the screen is blank (API $API)"; exit 1; }
    echo "Renderer loss handled: the app stayed open and drew again (was pid $APP_PID)."
  fi
fi
