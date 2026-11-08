package com.sahrae.entertainment;

import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import android.media.audiofx.LoudnessEnhancer;
import android.media.audiofx.Virtualizer;

/**
 * The equaliser, in Android's own audio effects.
 *
 * A song plays inside YouTube's player, in a frame whose sound never passes
 * through Sahrae's page, so nothing in the page can shape it. These effects sit
 * on the phone's audio output instead (session 0, the output mix), after the
 * player, so they shape YouTube, podcasts and radio alike. Needs only
 * MODIFY_AUDIO_SETTINGS, an install-time permission.
 *
 * The output mix is the whole phone's, so they are held only while Sahrae is
 * playing music or a podcast: another app's sound is never touched, not even
 * after pausing here. Android can refuse any of the four on a given phone, so
 * each stands alone and the Music report says which took.
 */
final class AudioFx {
    private AudioFx() {}

    /** The page's five sliders, in Hz (src/services/eq.ts). */
    private static final int[] SLIDER_HZ = {60, 230, 910, 3600, 14000};
    private static final int PRIORITY = 1000;
    private static final int SESSION_OUTPUT_MIX = 0;

    private static Equalizer eq;
    private static BassBoost bassBoost;
    private static Virtualizer virtualizer;
    private static LoudnessEnhancer loudness;

    private static boolean on = false;
    private static boolean playing = false;
    private static int[] bands = new int[5];
    private static int bass, spatial, loud;
    private static Boolean capable;

    /** Can this phone put an equaliser on its output at all? Asked once. */
    static synchronized boolean capable() {
        if (capable == null) {
            try {
                Equalizer probe = new Equalizer(0, SESSION_OUTPUT_MIX);
                probe.release();
                capable = true;
            } catch (Throwable t) {
                capable = false;
                MainActivity.bgLog("This phone refused an equaliser on its output: " + t.getClass().getSimpleName());
            }
        }
        return capable;
    }

    static synchronized void set(boolean enabled, int[] gains, int bassLevel, int spatialLevel, int loudGain) {
        on = enabled;
        if (gains.length == 5) bands = gains;
        bass = bassLevel;
        spatial = spatialLevel;
        loud = loudGain;
        sync();
    }

    /** Sahrae started or stopped playing (MainActivity, /__bgaudio). */
    static synchronized void playing(boolean nowPlaying) {
        if (playing == nowPlaying) return;
        playing = nowPlaying;
        sync();
    }

    static synchronized void release() {
        playing = false;
        releaseAll();
    }

    private static void sync() {
        if (!on || !playing || !capable()) { releaseAll(); return; }
        applyEqualizer();
        applyBass();
        applySpatial();
        applyLoudness();
    }

    /** The sliders' curve at a frequency, read on a log scale, so a phone with other bands still follows it. */
    private static int gainAt(int hz) {
        if (hz <= SLIDER_HZ[0]) return bands[0];
        for (int i = 1; i < SLIDER_HZ.length; i++) {
            if (hz <= SLIDER_HZ[i]) {
                double span = Math.log(SLIDER_HZ[i]) - Math.log(SLIDER_HZ[i - 1]);
                double at = (Math.log(hz) - Math.log(SLIDER_HZ[i - 1])) / span;
                return (int) Math.round(bands[i - 1] + (bands[i] - bands[i - 1]) * at);
            }
        }
        return bands[bands.length - 1];
    }

    private static void applyEqualizer() {
        try {
            boolean fresh = eq == null;
            if (fresh) eq = new Equalizer(PRIORITY, SESSION_OUTPUT_MIX);
            short[] range = eq.getBandLevelRange();
            short count = eq.getNumberOfBands();
            // Boosting every band at once clips. Half the highest boost comes off the whole curve.
            int peak = 0;
            for (int g : bands) peak = Math.max(peak, g);
            int headroom = peak / 2;
            for (short i = 0; i < count; i++) {
                int gain = gainAt(eq.getCenterFreq(i) / 1000) - headroom;
                eq.setBandLevel(i, (short) Math.max(range[0], Math.min(range[1], gain)));
            }
            eq.setEnabled(true);
            if (fresh) MainActivity.bgLog("Equalizer on: " + count + " bands on the phone's output");
        } catch (Throwable t) {
            MainActivity.bgLog("Equalizer failed: " + t.getClass().getSimpleName());
            releaseEq();
        }
    }

    private static void applyBass() {
        try {
            if (bass <= 0) { releaseBass(); return; }
            if (bassBoost == null) bassBoost = new BassBoost(PRIORITY, SESSION_OUTPUT_MIX);
            if (bassBoost.getStrengthSupported()) bassBoost.setStrength((short) Math.max(0, Math.min(1000, bass)));
            bassBoost.setEnabled(true);
        } catch (Throwable t) {
            MainActivity.bgLog("Bass boost not available: " + t.getClass().getSimpleName());
            releaseBass();
        }
    }

    private static void applySpatial() {
        try {
            if (spatial <= 0) { releaseVirtualizer(); return; }
            if (virtualizer == null) virtualizer = new Virtualizer(PRIORITY, SESSION_OUTPUT_MIX);
            if (virtualizer.getStrengthSupported()) virtualizer.setStrength((short) Math.max(0, Math.min(1000, spatial)));
            virtualizer.setEnabled(true);
        } catch (Throwable t) {
            MainActivity.bgLog("Spatial not available: " + t.getClass().getSimpleName());
            releaseVirtualizer();
        }
    }

    private static void applyLoudness() {
        try {
            if (loud <= 0) { releaseLoudness(); return; }
            if (loudness == null) loudness = new LoudnessEnhancer(SESSION_OUTPUT_MIX);
            loudness.setTargetGain(Math.max(0, Math.min(2000, loud)));
            loudness.setEnabled(true);
        } catch (Throwable t) {
            MainActivity.bgLog("Loudness not available: " + t.getClass().getSimpleName());
            releaseLoudness();
        }
    }

    private static void releaseEq() { try { if (eq != null) eq.release(); } catch (Throwable ignore) {} eq = null; }
    private static void releaseBass() { try { if (bassBoost != null) bassBoost.release(); } catch (Throwable ignore) {} bassBoost = null; }
    private static void releaseVirtualizer() { try { if (virtualizer != null) virtualizer.release(); } catch (Throwable ignore) {} virtualizer = null; }
    private static void releaseLoudness() { try { if (loudness != null) loudness.release(); } catch (Throwable ignore) {} loudness = null; }

    private static void releaseAll() {
        releaseEq();
        releaseBass();
        releaseVirtualizer();
        releaseLoudness();
    }
}
