package com.sahrae.entertainment;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Sahrae's music and podcasts outside the app: the mini player in the
 * notification shade and on the lock screen, and the buttons on Bluetooth
 * earbuds, headphones, cars and watches (play, pause, next, previous).
 *
 * The sound itself is still Sahrae's own player in the page. This service only
 * (1) keeps the app running as a media app while something is playing, so
 * Android does not stop it once you switch to another app, and (2) owns the
 * Android media session, which is what earbuds and the shade talk to. Every
 * button press is handed to the page (MainActivity.mediaCommand → window.__sauti).
 *
 * The page reports what is playing through /__bgaudio (MainActivity). The
 * service starts only while Sahrae is on screen (Android does not let an app
 * start one from the background), stays while a track is paused, and ends
 * when the player is closed.
 */
public class MediaPlaybackService extends Service {
    private static final String CHANNEL = "sahrae_playback";
    private static final int NOTIFICATION_ID = 4711;
    static final String ACTION_UPDATE = "com.sahrae.entertainment.media.UPDATE";
    static final String ACTION_STOP = "com.sahrae.entertainment.media.STOP";
    private static final String ACTION_TOGGLE = "com.sahrae.entertainment.media.TOGGLE";
    private static final String ACTION_NEXT = "com.sahrae.entertainment.media.NEXT";
    private static final String ACTION_PREV = "com.sahrae.entertainment.media.PREV";
    private static final String ACTION_CLOSE = "com.sahrae.entertainment.media.CLOSE";

    /** What the page last reported (read on the main thread only). */
    static final class NowPlaying {
        String title = "", artist = "", art = "";
        boolean playing;
        long posMs, durMs;
    }

    private static volatile boolean sRunning = false;
    static boolean isRunning() { return sRunning; }

    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaSession session;
    private final NowPlaying now = new NowPlaying();
    private String artLoaded = "";
    private Bitmap artBitmap;
    private PowerManager.WakeLock wake;
    private WifiManager.WifiLock wifi;

    /** Report the page's player: start the service on the first track, update it after. */
    static void update(Context ctx, String title, String artist, String art, boolean playing, long posMs, long durMs) {
        Intent i = new Intent(ctx, MediaPlaybackService.class).setAction(ACTION_UPDATE)
            .putExtra("title", title).putExtra("artist", artist).putExtra("art", art)
            .putExtra("playing", playing).putExtra("pos", posMs).putExtra("dur", durMs);
        try {
            if (sRunning) ctx.startService(i);
            else if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Throwable ignore) {
            // Android refused (the app was not on screen): the next report from the page tries again.
        }
    }

    /** The player was closed: no notification, no session. */
    static void stop(Context ctx) {
        if (!sRunning) return;
        try { ctx.startService(new Intent(ctx, MediaPlaybackService.class).setAction(ACTION_STOP)); } catch (Throwable ignore) {}
    }

    @Override
    public void onCreate() {
        super.onCreate();
        sRunning = true;
        session = new MediaSession(this, "Sahrae");
        session.setCallback(new MediaSession.Callback() {
            // Shown at once: in the background the page reports back slowly, and a
            // second earbud tap must see the state the first one asked for.
            @Override public void onPlay() { MainActivity.mediaCommand("play"); now.playing = true; publish(); }
            @Override public void onPause() { MainActivity.mediaCommand("pause"); now.playing = false; publish(); }
            @Override public void onSkipToNext() { MainActivity.mediaCommand("next"); }
            @Override public void onSkipToPrevious() { MainActivity.mediaCommand("prev"); }
            @Override public void onStop() { MainActivity.mediaCommand("stop"); }
            @Override public void onSeekTo(long pos) { MainActivity.mediaCommand("seek:" + pos); }
        });
        Intent open = new Intent(this, MainActivity.class)
            .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        session.setActive(true);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null && nm.getNotificationChannel(CHANNEL) == null) {
                NotificationChannel ch = new NotificationChannel(CHANNEL, "Now playing", NotificationManager.IMPORTANCE_LOW);
                ch.setDescription("Music and podcasts playing in Sahrae");
                ch.setShowBadge(false);
                nm.createNotificationChannel(ch);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent != null ? intent.getAction() : null;
        // Android insists a foreground service shows its notification at once.
        if (ACTION_UPDATE.equals(action) && intent != null) {
            now.title = str(intent.getStringExtra("title"));
            now.artist = str(intent.getStringExtra("artist"));
            String art = str(intent.getStringExtra("art"));
            if (!art.equals(now.art)) { now.art = art; artBitmap = null; }
            now.playing = intent.getBooleanExtra("playing", false);
            now.posMs = intent.getLongExtra("pos", 0);
            now.durMs = intent.getLongExtra("dur", 0);
            publish();
            loadArt();
        } else if (ACTION_STOP.equals(action) || ACTION_CLOSE.equals(action)) {
            if (ACTION_CLOSE.equals(action)) MainActivity.mediaCommand("pause");
            stopEverything();
            return START_NOT_STICKY;
        } else if (ACTION_TOGGLE.equals(action)) {
            MainActivity.mediaCommand(now.playing ? "pause" : "play");
            now.playing = !now.playing;
            publish();
        } else if (ACTION_NEXT.equals(action)) {
            MainActivity.mediaCommand("next");
            publish();
        } else if (ACTION_PREV.equals(action)) {
            MainActivity.mediaCommand("prev");
            publish();
        } else {
            // Restarted with nothing to show: there is no player to keep alive.
            publish();
            stopEverything();
            return START_NOT_STICKY;
        }
        return START_NOT_STICKY;
    }

    private void publish() {
        try {
            MediaMetadata.Builder md = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, now.title.isEmpty() ? "Sahrae" : now.title)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, now.artist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, "Sahrae");
            if (now.durMs > 0) md.putLong(MediaMetadata.METADATA_KEY_DURATION, now.durMs);
            if (artBitmap != null) md.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artBitmap);
            session.setMetadata(md.build());
            long actions = PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_STOP
                | (now.durMs > 0 ? PlaybackState.ACTION_SEEK_TO : 0);
            session.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(now.playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    now.posMs, now.playing ? 1f : 0f, SystemClock.elapsedRealtime())
                .build());
        } catch (Throwable ignore) {}

        Notification n = buildNotification();
        try {
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION_ID, n);
        } catch (Throwable t) {
            // Not allowed to run in the foreground now: show the controls anyway.
            try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID, n); } catch (Throwable ignore) {}
        }
        holdLocks(now.playing);
    }

    private Notification buildNotification() {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        int small = getResources().getIdentifier("ic_stat_sahrae", "drawable", getPackageName());
        b.setSmallIcon(small != 0 ? small : getApplicationInfo().icon)
            .setContentTitle(now.title.isEmpty() ? "Sahrae" : now.title)
            .setContentText(now.artist)
            .setContentIntent(session.getController().getSessionActivity())
            .setDeleteIntent(service(ACTION_CLOSE, 5))
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setOngoing(now.playing);
        if (artBitmap != null) b.setLargeIcon(artBitmap);
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous", service(ACTION_PREV, 1)).build());
        b.addAction(new Notification.Action.Builder(
            now.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
            now.playing ? "Pause" : "Play", service(ACTION_TOGGLE, 2)).build());
        b.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", service(ACTION_NEXT, 3)).build());
        b.setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private PendingIntent service(String action, int code) {
        Intent i = new Intent(this, MediaPlaybackService.class).setAction(action);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The cover, fetched once per track off the main thread, then the notification is redrawn. */
    private void loadArt() {
        final String url = now.art;
        if (url.isEmpty() || url.equals(artLoaded) || !url.startsWith("https://")) return;
        artLoaded = url;
        new Thread(() -> {
            Bitmap bmp = null;
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    BitmapFactory.Options o = new BitmapFactory.Options();
                    o.inPreferredConfig = Bitmap.Config.RGB_565;
                    bmp = BitmapFactory.decodeStream(in, null, o);
                }
                if (bmp != null && (bmp.getWidth() > 512 || bmp.getHeight() > 512)) {
                    float s = 512f / Math.max(bmp.getWidth(), bmp.getHeight());
                    bmp = Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * s), Math.round(bmp.getHeight() * s), true);
                }
            } catch (Throwable ignore) {
            } finally {
                if (c != null) c.disconnect();
            }
            final Bitmap got = bmp;
            main.post(() -> {
                if (got != null && url.equals(now.art) && sRunning) { artBitmap = got; publish(); }
            });
        }, "sahrae-art").start();
    }

    /** While playing, keep the processor and Wi-Fi awake (screen off), as music apps do. */
    private void holdLocks(boolean on) {
        try {
            if (on) {
                if (wake == null) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Sahrae:playback");
                    wake.setReferenceCounted(false);
                }
                // Renewed by every report from the page; lapses by itself if the page goes quiet.
                wake.acquire(30 * 60 * 1000L);
                if (wifi == null) {
                    WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                    if (wm != null) {
                        wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "Sahrae:playback");
                        wifi.setReferenceCounted(false);
                    }
                }
                if (wifi != null && !wifi.isHeld()) wifi.acquire();
            } else {
                if (wake != null && wake.isHeld()) wake.release();
                if (wifi != null && wifi.isHeld()) wifi.release();
            }
        } catch (Throwable ignore) {}
    }

    private void stopEverything() {
        holdLocks(false);
        try {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE);
            else stopForeground(true);
        } catch (Throwable ignore) {}
        try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(NOTIFICATION_ID); } catch (Throwable ignore) {}
        stopSelf();
    }

    @Override
    public void onDestroy() {
        sRunning = false;
        holdLocks(false);
        try { session.setActive(false); session.release(); } catch (Throwable ignore) {}
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private static String str(String s) { return s == null ? "" : s; }
}
