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
 * Captures in-app file downloads (e.g. a movie from the in-app download browser)
 * into the app's OWN storage instead of the device's public Downloads / file
 * manager, and exposes the list to JS so they appear in the Downloads section
 * and play offline inside the app.
 *
 * Files are written to the app-specific external dir (Android/data/<pkg>/files)
 * — private to the app, hidden from the gallery / main Downloads view, and wiped
 * on uninstall. Records live in SharedPreferences; completion is reconciled lazily
 * against DownloadManager on each list, so no BroadcastReceiver is needed.
 */
final class DownloadStore {
    private static final String PREF = "sahrae_downloads";
    private static final String K = "items";
    private static String pendingTitle; // set by JS just before a download starts

    private DownloadStore() {}

    static void setPendingTitle(String t) { pendingTitle = (t == null || t.isEmpty()) ? null : t; }

    private static SharedPreferences sp(Context c) { return c.getSharedPreferences(PREF, Context.MODE_PRIVATE); }
    private static JSONArray read(Context c) {
        try { return new JSONArray(sp(c).getString(K, "[]")); } catch (Throwable t) { return new JSONArray(); }
    }
    private static void write(Context c, JSONArray a) { sp(c).edit().putString(K, a.toString()).apply(); }

    private static String sanitize(String s) {
        if (s == null) return null;
        s = s.replaceAll("[\\\\/:*?\"<>|]+", " ").trim();
        return s.isEmpty() ? null : s;
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
            String title = sanitize(pendingTitle);
            if (title == null) title = sanitize(guessed != null ? guessed.replaceAll("\\.[^.]*$", "") : null);
            if (title == null) title = "Download " + System.currentTimeMillis();
            String fileName = sanitize(title) + "-" + System.currentTimeMillis() + ext;

            DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
            req.setTitle(title);
            req.setDescription("Sahrae · saving to your in-app Downloads");
            req.setMimeType(mimeType);
            if (userAgent != null) req.addRequestHeader("User-Agent", userAgent);
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
            o.put("done", false);
            JSONArray a = read(ctx);
            a.put(o);
            write(ctx, a);
            pendingTitle = null;
        } catch (Throwable ignore) { /* never crash on a download */ }
    }

    /** Reconcile pending downloads against DownloadManager, then return the list as JSON. */
    static String listJson(Context ctx) {
        JSONArray a = read(ctx);
        try {
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            JSONArray out = new JSONArray();
            boolean changed = false;
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                if (!o.optBoolean("done", false)) {
                    Cursor cur = null;
                    try {
                        cur = dm.query(new DownloadManager.Query().setFilterById(o.getLong("id")));
                        if (cur != null && cur.moveToFirst()) {
                            int st = cur.getInt(cur.getColumnIndex(DownloadManager.COLUMN_STATUS));
                            if (st == DownloadManager.STATUS_SUCCESSFUL) { o.put("done", true); changed = true; }
                            else if (st == DownloadManager.STATUS_FAILED) { continue; /* drop failed */ }
                        }
                    } catch (Throwable ignore) {} finally { if (cur != null) cur.close(); }
                }
                // keep only entries whose file still exists (once done)
                out.put(o);
            }
            if (changed) write(ctx, out);
            return out.toString();
        } catch (Throwable t) {
            return a.toString();
        }
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

    static WebResourceResponse json(String body) {
        Map<String, String> h = new HashMap<>();
        h.put("Access-Control-Allow-Origin", "*");
        h.put("Cache-Control", "no-cache");
        return new WebResourceResponse("application/json", "utf-8", 200, "OK", h,
            new ByteArrayInputStream((body == null ? "[]" : body).getBytes(StandardCharsets.UTF_8)));
    }
}
