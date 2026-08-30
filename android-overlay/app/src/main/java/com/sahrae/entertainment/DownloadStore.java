package com.sahrae.entertainment;

import android.app.DownloadManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

/**
 * Captures in-app file downloads into the app's OWN storage instead of the
 * device's public Downloads folder, and reports them to JS so they appear in the
 * Downloads section and play offline inside the app.
 *
 * Files land in the app-specific external dir (Android/data/<pkg>/files) —
 * private to the app, hidden from the gallery, wiped on uninstall. Records live
 * in SharedPreferences and are reconciled against DownloadManager on every list,
 * so no BroadcastReceiver is needed and a download survives the app being killed.
 *
 * WHY DOWNLOADMANAGER, AND NOT A HAND-ROLLED DOWNLOADER
 * A custom HTTP downloader would allow a manual pause button, which this cannot.
 * It would also have to re-implement resume-after-network-loss, retry with
 * backoff, surviving reboot, and writing to scoped storage — all of which
 * DownloadManager already does correctly and none of which can be tested here.
 * The honest trade is to keep the reliable engine and surface everything it
 * reports, rather than ship a prettier one that drops a download on a subway.
 *
 * WHAT THIS FIXES, all of which were real and all of which were silent:
 *
 *   1. FAILED DOWNLOADS VANISHED. listJson() skipped any entry DownloadManager
 *      reported as failed, so a download that died left no trace — it was in the
 *      list, then it was not, and nothing said why. Failures are now kept, given
 *      a human-readable reason, and can be retried.
 *
 *   2. DELETED FILES STAYED IN THE LIST. The old code carried a comment saying
 *      it kept "only entries whose file still exists" and then unconditionally
 *      kept every entry. Tapping one played nothing at all.
 *
 *   3. NO PROGRESS EXISTED. State was a single `done` boolean, so the UI could
 *      only say "Downloading…" forever with no idea whether a 2 GB film was at
 *      1% or 99%. DownloadManager reports bytes and totals; the bridge simply
 *      never asked for them.
 *
 * It also carries content identity (tmdb id, season, episode, poster) so a saved
 * file can be shown with its artwork and grouped under its series, rather than
 * appearing as a bare filename.
 */
final class DownloadStore {
    private static final String PREF = "sahrae_downloads";
    private static final String K = "items";
    private static final String K_WIFI = "wifi_only";

    /**
     * Metadata staged by JS immediately before a download starts.
     *
     * The old version of this was a bare title string with no expiry, which had
     * a nasty failure mode: if the user opened a title, tapped Download, and
     * then backed out without the download ever starting, the stale title sat
     * here and attached itself to whatever downloaded next — labelling one film
     * with another's name. Metadata now expires.
     */
    private static JSONObject pendingMeta;
    private static long pendingAt;
    private static final long PENDING_TTL_MS = 5 * 60 * 1000;

    private DownloadStore() {}

    static void setPendingMeta(String json) {
        try {
            pendingMeta = (json == null || json.isEmpty()) ? null : new JSONObject(json);
            pendingAt = System.currentTimeMillis();
        } catch (Throwable t) {
            pendingMeta = null;
        }
    }

    /** Back-compat with the older /__dltitle bridge, which sent a bare title. */
    static void setPendingTitle(String t) {
        if (t == null || t.isEmpty()) { pendingMeta = null; return; }
        try {
            JSONObject o = new JSONObject();
            o.put("title", t);
            pendingMeta = o;
            pendingAt = System.currentTimeMillis();
        } catch (Throwable ignore) { pendingMeta = null; }
    }

    private static JSONObject takePending() {
        JSONObject m = pendingMeta;
        long at = pendingAt;
        pendingMeta = null;
        pendingAt = 0;
        if (m == null || System.currentTimeMillis() - at > PENDING_TTL_MS) return null;
        return m;
    }

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREF, Context.MODE_PRIVATE); }
    private static JSONArray read(Context c) {
        try { return new JSONArray(sp(c).getString(K, "[]")); } catch (Throwable t) { return new JSONArray(); }
    }
    private static void write(Context c, JSONArray a) { sp(c).edit().putString(K, a.toString()).apply(); }

    static void setWifiOnly(Context c, boolean on) { sp(c).edit().putBoolean(K_WIFI, on).apply(); }
    static boolean wifiOnly(Context c) { return sp(c).getBoolean(K_WIFI, false); }

    private static String sanitize(String s) {
        if (s == null) return null;
        s = s.replaceAll("[\\\\/:*?\"<>|]+", " ").trim();
        return s.isEmpty() ? null : s;
    }

    /** Safe column read — getColumnIndex returns -1 for a column that is not present. */
    private static long lng(Cursor c, String col) {
        try { int i = c.getColumnIndex(col); return i < 0 ? -1 : c.getLong(i); } catch (Throwable t) { return -1; }
    }
    private static int intg(Cursor c, String col) {
        try { int i = c.getColumnIndex(col); return i < 0 ? -1 : c.getInt(i); } catch (Throwable t) { return -1; }
    }

    /** Called from the WebView's DownloadListener. */
    static void enqueue(Context ctx, String url, String userAgent, String contentDisposition, String mimeType) {
        try {
            String guessed = URLUtil.guessFileName(url, contentDisposition, mimeType);
            String ext = guessed != null && guessed.contains(".") ? guessed.substring(guessed.lastIndexOf('.')) : "";
            if (ext.isEmpty()) {
                String e = mimeType != null ? MimeTypeMap.getSingleton().getExtensionFromMimeType(mimeType) : null;
                ext = e != null ? "." + e : ".mp4";
            }

            JSONObject meta = takePending();
            String title = meta != null ? sanitize(meta.optString("title", null)) : null;
            if (title == null) title = sanitize(guessed != null ? guessed.replaceAll("\\.[^.]*$", "") : null);
            if (title == null) title = "Download " + System.currentTimeMillis();
            String fileName = sanitize(title) + "-" + System.currentTimeMillis() + ext;

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle(title);
            req.setDescription("Sahrae · saving to your in-app Downloads");
            req.setMimeType(mimeType);
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
            // Carry the WebView's cookies: some providers hand out a session-bound
            // download URL that 403s without them.
            try {
                String ck = android.webkit.CookieManager.getInstance().getCookie(url);
                if (ck != null && !ck.isEmpty()) req.addRequestHeader("Cookie", ck);
            } catch (Throwable ignore) {}
            // Wi-Fi only, when the viewer has asked for it. DownloadManager parks
            // the job as PAUSED_QUEUED_FOR_WIFI rather than failing it, and
            // resumes on its own once Wi-Fi returns.
            if (wifiOnly(ctx)) {
                req.setAllowedNetworkTypes(DownloadManager.Request.NETWORK_WIFI);
                try { req.setAllowedOverMetered(false); } catch (Throwable ignore) {}
            }
            req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            req.setDestinationInExternalFilesDir(ctx, Environment.DIRECTORY_DOWNLOADS, fileName);

            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            long id = dm.enqueue(req);

            File f = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), fileName);
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("title", title);
            o.put("file", f.getAbsolutePath());
            o.put("mime", mimeType == null ? "video/mp4" : mimeType);
            o.put("ts", System.currentTimeMillis());
            o.put("state", "queued");
            // Kept so a failed download can be retried without making the viewer
            // find the title and tap through the provider a second time.
            o.put("url", url);
            if (userAgent != null) o.put("ua", userAgent);
            if (meta != null) {
                if (meta.has("tmdbId")) o.put("tmdbId", meta.optInt("tmdbId"));
                if (meta.has("type")) o.put("type", meta.optString("type"));
                if (meta.has("season")) o.put("season", meta.optInt("season"));
                if (meta.has("episode")) o.put("episode", meta.optInt("episode"));
                if (meta.has("poster")) o.put("poster", meta.optString("poster"));
                if (meta.has("show")) o.put("show", meta.optString("show"));
            }
            JSONArray a = read(ctx);
            a.put(o);
            write(ctx, a);
        } catch (Throwable ignore) { /* never crash on a download */ }
    }

    /** DownloadManager's numeric reasons, in words a viewer can act on. */
    private static String pausedReason(int reason) {
        switch (reason) {
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI: return "Waiting for Wi-Fi";
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK: return "Waiting for a connection";
            case DownloadManager.PAUSED_WAITING_TO_RETRY: return "Retrying…";
            default: return "Paused";
        }
    }

    private static String failedReason(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "Not enough storage space";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "Storage unavailable";
            case DownloadManager.ERROR_CANNOT_RESUME: return "Connection dropped and could not resume";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS: return "A file with that name already exists";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "The connection kept breaking";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "The link redirected too many times";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE: return "The source refused the download";
            default:
                // 400-599 are passed straight through as the HTTP status.
                if (reason >= 400 && reason < 600) return "The source returned an error (" + reason + ")";
                return "Download failed";
        }
    }

    /**
     * Reconcile against DownloadManager and return the list as JSON.
     *
     * Every state DownloadManager can report is mapped to something the UI can
     * say out loud. Nothing is dropped for being in a state we would rather not
     * think about — a failure the viewer cannot see is a failure they will
     * report as "the app is broken".
     */
    static String listJson(Context ctx) {
        JSONArray a = read(ctx);
        JSONArray out = new JSONArray();
        boolean changed = false;
        DownloadManager dm = null;
        try { dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE); } catch (Throwable ignore) {}

        for (int i = 0; i < a.length(); i++) {
            JSONObject o;
            try { o = a.getJSONObject(i); } catch (Throwable t) { continue; }

            String state = o.optString("state", o.optBoolean("done", false) ? "done" : "queued");
            File file = null;
            try { file = new File(o.optString("file", "")); } catch (Throwable ignore) {}

            if (!"done".equals(state) && !"failed".equals(state) && dm != null) {
                Cursor cur = null;
                try {
                    cur = dm.query(new DownloadManager.Query().setFilterById(o.getLong("id")));
                    if (cur != null && cur.moveToFirst()) {
                        int st = intg(cur, DownloadManager.COLUMN_STATUS);
                        int rs = intg(cur, DownloadManager.COLUMN_REASON);
                        long got = lng(cur, DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                        long tot = lng(cur, DownloadManager.COLUMN_TOTAL_SIZE_BYTES);
                        if (got >= 0) o.put("bytes", got);
                        if (tot > 0) o.put("total", tot);

                        if (st == DownloadManager.STATUS_SUCCESSFUL) {
                            o.put("state", "done");
                            o.remove("reason");
                            if (file != null && file.exists()) o.put("total", file.length());
                            changed = true;
                        } else if (st == DownloadManager.STATUS_FAILED) {
                            // KEPT, not dropped. This is the whole point.
                            o.put("state", "failed");
                            o.put("reason", failedReason(rs));
                            changed = true;
                        } else if (st == DownloadManager.STATUS_PAUSED) {
                            o.put("state", "paused");
                            o.put("reason", pausedReason(rs));
                        } else if (st == DownloadManager.STATUS_RUNNING) {
                            o.put("state", "running");
                            o.remove("reason");
                        } else {
                            o.put("state", "queued");
                        }
                    } else {
                        // DownloadManager has forgotten this job — its database is
                        // cleared periodically and on reboot. The file on disk is
                        // the only remaining truth.
                        if (file != null && file.exists() && file.length() > 0) {
                            o.put("state", "done");
                            o.put("total", file.length());
                        } else {
                            o.put("state", "failed");
                            o.put("reason", "The download was interrupted");
                        }
                        changed = true;
                    }
                } catch (Throwable ignore) {
                } finally { if (cur != null) try { cur.close(); } catch (Throwable ignore) {} }
            }

            // A finished entry whose file is gone is not a download any more. The
            // old code promised this in a comment and never did it, so deleting a
            // file from the device left a row that played nothing.
            if ("done".equals(o.optString("state")) && (file == null || !file.exists())) {
                changed = true;
                continue;
            }

            // Legacy rows carried `done`; keep it in sync so an older web build
            // reading this bridge still behaves.
            try { o.put("done", "done".equals(o.optString("state"))); } catch (Throwable ignore) {}
            out.put(o);
        }

        if (changed) write(ctx, out);
        return out.toString();
    }

    /**
     * Re-queue a failed download from the URL captured when it first started, so
     * a retry costs one tap instead of navigating the provider again.
     */
    static void retry(Context ctx, long id) {
        try {
            JSONArray a = read(ctx);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (o.optLong("id") != id) continue;
                String url = o.optString("url", "");
                if (url.isEmpty()) return;

                JSONObject meta = new JSONObject();
                meta.put("title", o.optString("title"));
                if (o.has("tmdbId")) meta.put("tmdbId", o.optInt("tmdbId"));
                if (o.has("type")) meta.put("type", o.optString("type"));
                if (o.has("season")) meta.put("season", o.optInt("season"));
                if (o.has("episode")) meta.put("episode", o.optInt("episode"));
                if (o.has("poster")) meta.put("poster", o.optString("poster"));
                if (o.has("show")) meta.put("show", o.optString("show"));
                setPendingMeta(meta.toString());

                remove(ctx, id);
                enqueue(ctx, url, o.optString("ua", null), null, o.optString("mime", "video/mp4"));
                return;
            }
        } catch (Throwable ignore) {}
    }

    static void remove(Context ctx, long id) {
        try {
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            JSONArray a = read(ctx), out = new JSONArray();
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (o.getLong("id") == id) {
                    try { dm.remove(id); } catch (Throwable ignore) {}
                    try { new File(o.getString("file")).delete(); } catch (Throwable ignore) {}
                } else out.put(o);
            }
            write(ctx, out);
        } catch (Throwable ignore) {}
    }

    /**
     * Bytes actually on disk, plus what the device has left.
     *
     * Measured by asking the filesystem, not by trusting the recorded sizes — a
     * stored number drifts the moment anything touches the file, and a storage
     * meter that lies is worse than no storage meter.
     */
    static String statsJson(Context ctx) {
        long used = 0;
        int done = 0, active = 0, failed = 0;
        try {
            JSONArray a = read(ctx);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                String st = o.optString("state", "queued");
                if ("done".equals(st)) {
                    done++;
                    File f = new File(o.optString("file", ""));
                    if (f.exists()) used += f.length();
                } else if ("failed".equals(st)) failed++;
                else active++;
            }
        } catch (Throwable ignore) {}

        long free = 0;
        try {
            File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir != null) free = dir.getUsableSpace();
        } catch (Throwable ignore) {}

        try {
            JSONObject o = new JSONObject();
            o.put("used", used);
            o.put("free", free);
            o.put("done", done);
            o.put("active", active);
            o.put("failed", failed);
            o.put("wifiOnly", wifiOnly(ctx));
            return o.toString();
        } catch (Throwable t) {
            return "{\"used\":0,\"free\":0}";
        }
    }

    static WebResourceResponse json(String body) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "https://localhost");
        h.put("Cache-Control", "no-cache");
        return new WebResourceResponse("application/json", "utf-8", 200, "OK", h,
            new ByteArrayInputStream((body == null ? "[]" : body).getBytes(StandardCharsets.UTF_8)));
    }
}
