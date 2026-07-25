package com.sahrae.entertainment;

import android.net.Uri;
import android.webkit.WebResourceResponse;
import android.media.audiofx.Equalizer;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Virtualizer;
import android.media.audiofx.LoudnessEnhancer;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * OS-level audio effects on the GLOBAL output mix (audio session 0), so they
 * shape ALL app audio — including the WebView / YouTube-IFrame "Sauti" playback
 * that JavaScript's Web Audio API can't reach.
 *
 * - Equalizer  → 5-band parametric EQ.
 * - BassBoost  → low-end enhancement.
 * - Virtualizer→ spatial "wideness" (the closest to an Atmos-style room feel
 *                without licensed object audio).
 *
 * Everything is wrapped in try/catch: some OEMs forbid global-session effects, in
 * which case this silently no-ops and never crashes the app. Driven from JS via
 * /__eq?on=1&b0..b4=<millibels>&bass=<0-1000>&virt=<0-1000>.
 */
final class AudioFx {
    private static Equalizer eq;
    private static BassBoost bass;
    private static Virtualizer virt;
    private static LoudnessEnhancer loud;

    private AudioFx() {}

    private static synchronized void ensure() {
        if (eq == null)   { try { eq = new Equalizer(0, 0); }   catch (Throwable ignore) {} }
        if (bass == null) { try { bass = new BassBoost(0, 0); } catch (Throwable ignore) {} }
        if (virt == null) { try { virt = new Virtualizer(0, 0); } catch (Throwable ignore) {} }
        if (loud == null) { try { loud = new LoudnessEnhancer(0); } catch (Throwable ignore) {} }
    }

    static WebResourceResponse ok() {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "https://localhost");
        h.put("Cache-Control", "no-cache");
        return new WebResourceResponse("application/json", "utf-8", 200, "OK", h,
            new ByteArrayInputStream("{\"ok\":true}".getBytes(StandardCharsets.UTF_8)));
    }

    private static int qi(Uri u, String k, int def) {
        try { String v = u.getQueryParameter(k); return v != null ? Integer.parseInt(v) : def; }
        catch (Throwable t) { return def; }
    }
    private static int clamp(int v, int lo, int hi) { return v < lo ? lo : (v > hi ? hi : v); }

    static synchronized WebResourceResponse apply(Uri u) {
        try {
            ensure();
            boolean on = "1".equals(u.getQueryParameter("on"));
            int[] g = { qi(u, "b0", 0), qi(u, "b1", 0), qi(u, "b2", 0), qi(u, "b3", 0), qi(u, "b4", 0) };

            if (eq != null) {
                try {
                    eq.setEnabled(on);
                    if (on) {
                        short n = eq.getNumberOfBands();
                        short[] range = eq.getBandLevelRange(); // millibels [min,max]
                        for (short b = 0; b < n; b++) {
                            int idx = (n <= 1) ? 0 : (int) Math.round((double) b / (n - 1) * 4.0);
                            idx = clamp(idx, 0, 4);
                            try { eq.setBandLevel(b, (short) clamp(g[idx], range[0], range[1])); } catch (Throwable ignore) {}
                        }
                    }
                } catch (Throwable ignore) {}
            }
            if (bass != null) {
                try { if (bass.getStrengthSupported()) { bass.setEnabled(on); if (on) bass.setStrength((short) clamp(qi(u, "bass", 0), 0, 1000)); } }
                catch (Throwable ignore) {}
            }
            if (virt != null) {
                try {
                    if (virt.getStrengthSupported()) {
                        virt.setEnabled(on);
                        if (on) {
                            // Strong spatial widening (closest to an Atmos-style room feel).
                            try { virt.forceVirtualizationMode(Virtualizer.VIRTUALIZATION_MODE_AUTO); } catch (Throwable ignore) {}
                            virt.setStrength((short) clamp(qi(u, "virt", 0), 0, 1000));
                        }
                    }
                } catch (Throwable ignore) {}
            }
            if (loud != null) {
                // Perceived loudness / fullness — the "mastered", premium body.
                try { loud.setEnabled(on); if (on) loud.setTargetGain(clamp(qi(u, "loud", 0), 0, 2000)); }
                catch (Throwable ignore) {}
            }
        } catch (Throwable ignore) {
            /* never crash the app over audio effects */
        }
        return ok();
    }
}
