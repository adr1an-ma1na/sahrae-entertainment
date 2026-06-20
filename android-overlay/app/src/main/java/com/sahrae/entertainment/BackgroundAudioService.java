package com.sahrae.entertainment;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaMetadata;
import android.media.MediaPlayer;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.view.KeyEvent;
import android.webkit.WebView;

import java.util.HashMap;
import java.util.Map;

/**
 * Foreground media service: keeps Sauti's audio alive when the app is in the
 * background and owns a framework MediaSession so the lock-screen / notification
 * shows now-playing and HEADSET / EARBUD media buttons (play, pause, next, prev)
 * are routed back to the JS player via window.__sauti.* .
 *
 * Driven from JS through MainActivity's /__bgaudio intercept. Everything is
 * guarded so a failure degrades to "plays in foreground only" rather than a crash.
 */
public class BackgroundAudioService extends Service {
    private static final String CH = "sahrae_playback";
    private static final int NID = 0x5A07;
    private static final String UA =
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36";
    private MediaSession session;

    // ── Native audio engine — the part that ACTUALLY plays in the background.
    // A single MediaPlayer owned by the service plays the resolved audio URL, so
    // playback continues when the app/WebView is backgrounded (which a WebView
    // <audio>/iframe never could). JS drives it via MainActivity's /__play etc.
    private static MediaPlayer sPlayer;
    private static volatile String sState = "idle"; // idle|preparing|playing|paused|ended|error
    private static volatile String sTitle = "";
    private static volatile String sArtist = "";

    /** Start/replace native playback of a resolved audio URL. */
    static void playUrl(Context ctx, String url, String title, String artist) {
        try {
            Intent i = new Intent(ctx, BackgroundAudioService.class).setAction("PLAY_URL");
            i.putExtra("url", url);
            i.putExtra("title", title == null ? "" : title);
            i.putExtra("artist", artist == null ? "" : artist);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
        } catch (Throwable ignore) {}
    }
    static void control(Context ctx, String action) {
        try { ctx.startService(new Intent(ctx, BackgroundAudioService.class).setAction(action)); } catch (Throwable ignore) {}
    }
    static void seekTo(Context ctx, int ms) {
        try { ctx.startService(new Intent(ctx, BackgroundAudioService.class).setAction("SEEK").putExtra("pos", ms)); } catch (Throwable ignore) {}
    }
    /** Snapshot for the JS poller (/__pstate): {state, position(sec), duration(sec)}. */
    static String stateJson() {
        long pos = 0, dur = 0;
        try { if (sPlayer != null) { pos = sPlayer.getCurrentPosition(); dur = sPlayer.getDuration(); } } catch (Throwable ignore) {}
        if (dur < 0) dur = 0;
        return "{\"state\":\"" + sState + "\",\"position\":" + (pos / 1000.0) + ",\"duration\":" + (dur / 1000.0) + "}";
    }

    /** Start/refresh (on=true) or stop (on=false) the service, from any context. */
    static void set(Context ctx, boolean on, String title, String artist, boolean playing) {
        try {
            Intent i = new Intent(ctx, BackgroundAudioService.class);
            if (!on) {
                // Stop via stopService (NOT startForegroundService — that would
                // require a startForeground() call within 5s and crash otherwise).
                ctx.stopService(i);
                return;
            }
            i.setAction("UPDATE");
            i.putExtra("title", title == null || title.isEmpty() ? "Sauti" : title);
            i.putExtra("artist", artist == null ? "" : artist);
            i.putExtra("playing", playing);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Throwable ignore) { /* foreground-start restrictions / OEM quirks */ }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            String action = intent != null ? intent.getAction() : null;
            if ("STOP".equals(action) || "STOP_PLAYBACK".equals(action)) { stopNative(); teardown(); stopSelf(); return START_NOT_STICKY; }

            ensureSession();

            // ── Native-player control ──
            if ("PLAY_URL".equals(action)) {
                sTitle = intent.getStringExtra("title");
                sArtist = intent.getStringExtra("artist");
                startNative(intent.getStringExtra("url"));
                updateSession(sTitle, sArtist, true);
                startForeground(NID, buildNotification(sTitle, sArtist, true));
                return START_STICKY;
            }
            if ("RESUME".equals(action)) { resumeNative(); return START_STICKY; }
            if ("PAUSE_NATIVE".equals(action)) { pauseNative(); return START_STICKY; }
            if ("SEEK".equals(action)) { try { if (sPlayer != null) sPlayer.seekTo(intent.getIntExtra("pos", 0)); } catch (Throwable ignore) {} return START_STICKY; }

            // Notification buttons. PREV/NEXT need the JS queue; PLAY/PAUSE act on
            // the native player when it's the engine, else fall back to the JS player.
            boolean nativeOn = sPlayer != null;
            if ("NEXT".equals(action)) forward("next");
            else if ("PREV".equals(action)) forward("prev");
            else if ("PLAY".equals(action)) { if (nativeOn) resumeNative(); else forward("toggle"); }
            else if ("PAUSE".equals(action)) { if (nativeOn) pauseNative(); else forward("toggle"); }

            String title = (intent != null && intent.getStringExtra("title") != null) ? intent.getStringExtra("title") : sTitle;
            String artist = (intent != null && intent.getStringExtra("artist") != null) ? intent.getStringExtra("artist") : sArtist;
            boolean playing = nativeOn ? "playing".equals(sState) : (intent == null || intent.getBooleanExtra("playing", true));
            updateSession(title, artist, playing);
            startForeground(NID, buildNotification(title, artist, playing));
        } catch (Throwable t) {
            try { stopSelf(); } catch (Throwable ignore) {}
        }
        return START_STICKY;
    }

    // ── Native MediaPlayer engine ──
    private void startNative(String url) {
        if (url == null || url.isEmpty()) { sState = "error"; return; }
        try {
            if (sPlayer == null) {
                sPlayer = new MediaPlayer();
                sPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
                sPlayer.setOnPreparedListener(mp -> { try { mp.start(); sState = "playing"; refreshNote(true); } catch (Throwable ignore) {} });
                sPlayer.setOnCompletionListener(mp -> { sState = "ended"; refreshNote(false); forward("next"); });
                sPlayer.setOnErrorListener((mp, what, extra) -> { sState = "error"; return true; });
            } else {
                sPlayer.reset();
            }
            sState = "preparing";
            Map<String, String> h = new HashMap<>();
            h.put("User-Agent", UA);
            sPlayer.setDataSource(this, Uri.parse(url), h);
            sPlayer.prepareAsync();
        } catch (Throwable t) {
            sState = "error";
        }
    }
    private void resumeNative() { try { if (sPlayer != null) { sPlayer.start(); sState = "playing"; refreshNote(true); } } catch (Throwable ignore) {} }
    private void pauseNative() { try { if (sPlayer != null && sPlayer.isPlaying()) { sPlayer.pause(); sState = "paused"; refreshNote(false); } } catch (Throwable ignore) {} }
    private void stopNative() { try { if (sPlayer != null) { sPlayer.stop(); sPlayer.release(); } } catch (Throwable ignore) {} sPlayer = null; sState = "idle"; }
    private void refreshNote(boolean playing) {
        try { updateSession(sTitle, sArtist, playing); startForeground(NID, buildNotification(sTitle, sArtist, playing)); } catch (Throwable ignore) {}
    }

    private void ensureSession() {
        if (session != null) return;
        session = new MediaSession(this, "Sauti");
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { if (sPlayer != null) resumeNative(); else forward("play"); }
            @Override public void onPause() { if (sPlayer != null) pauseNative(); else forward("pause"); }
            @Override public void onSkipToNext() { forward("next"); }
            @Override public void onSkipToPrevious() { forward("prev"); }
            @Override public void onStop() { if (sPlayer != null) stopNative(); forward("stop"); }
            @Override public void onSeekTo(long pos) { try { if (sPlayer != null) sPlayer.seekTo((int) pos); } catch (Throwable ignore) {} }
            @Override public boolean onMediaButtonEvent(Intent mbi) {
                try {
                    KeyEvent ke = mbi != null ? (KeyEvent) mbi.getParcelableExtra(Intent.EXTRA_KEY_EVENT) : null;
                    if (ke != null && ke.getAction() == KeyEvent.ACTION_DOWN) {
                        switch (ke.getKeyCode()) {
                            case KeyEvent.KEYCODE_MEDIA_NEXT: forward("next"); return true;
                            case KeyEvent.KEYCODE_MEDIA_PREVIOUS: forward("prev"); return true;
                            case KeyEvent.KEYCODE_MEDIA_PLAY: forward("play"); return true;
                            case KeyEvent.KEYCODE_MEDIA_PAUSE: forward("pause"); return true;
                            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
                            case KeyEvent.KEYCODE_HEADSETHOOK: forward("toggle"); return true;
                        }
                    }
                } catch (Throwable ignore) {}
                return super.onMediaButtonEvent(mbi);
            }
        });
        try { session.setActive(true); } catch (Throwable ignore) {}
    }

    private void updateSession(String title, String artist, boolean playing) {
        if (session == null) return;
        try {
            session.setMetadata(new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                .build());
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP;
            session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                          PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f)
                .build());
        } catch (Throwable ignore) {}
    }

    private int pendingFlags() {
        return Build.VERSION.SDK_INT >= 23
            ? (PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE)
            : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    private PendingIntent actionIntent(String action) {
        Intent i = new Intent(this, BackgroundAudioService.class).setAction(action);
        return PendingIntent.getService(this, action.hashCode(), i, pendingFlags());
    }

    @SuppressWarnings("deprecation")
    private Notification buildNotification(String title, String artist, boolean playing) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CH) == null) {
                NotificationChannel ch = new NotificationChannel(CH, "Playback", NotificationManager.IMPORTANCE_LOW);
                ch.setShowBadge(false);
                ch.setSound(null, null);
                try { nm.createNotificationChannel(ch); } catch (Throwable ignore) {}
            }
        }
        Notification.Builder b = (Build.VERSION.SDK_INT >= 26)
            ? new Notification.Builder(this, CH) : new Notification.Builder(this);

        int icon = getApplicationInfo().icon;
        b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_media_play)
         .setContentTitle(title)
         .setContentText(artist)
         .setVisibility(Notification.VISIBILITY_PUBLIC)
         .setOngoing(playing)
         .setShowWhen(false);

        try {
            Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (open != null) b.setContentIntent(PendingIntent.getActivity(this, 0, open, pendingFlags()));
        } catch (Throwable ignore) {}

        b.addAction(android.R.drawable.ic_media_previous, "Prev", actionIntent("PREV"));
        b.addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                    playing ? "Pause" : "Play", actionIntent(playing ? "PAUSE" : "PLAY"));
        b.addAction(android.R.drawable.ic_media_next, "Next", actionIntent("NEXT"));

        if (session != null) {
            try {
                b.setStyle(new Notification.MediaStyle()
                    .setMediaSession(session.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2));
            } catch (Throwable ignore) {}
        }
        return b.build();
    }

    private void forward(final String cmd) {
        try {
            final WebView wv = MainActivity.sWebView;
            if (wv == null) return;
            wv.post(() -> {
                try { wv.evaluateJavascript("window.__sauti&&window.__sauti." + cmd + "&&window.__sauti." + cmd + "()", null); }
                catch (Throwable ignore) {}
            });
        } catch (Throwable ignore) {}
    }

    private void teardown() {
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Throwable ignore) {}
        try { if (sPlayer != null) { sPlayer.release(); sPlayer = null; sState = "idle"; } } catch (Throwable ignore) {}
        try { if (session != null) { session.setActive(false); session.release(); session = null; } } catch (Throwable ignore) {}
    }

    @Override public void onDestroy() { teardown(); super.onDestroy(); }
    @Override public IBinder onBind(Intent intent) { return null; }
}
