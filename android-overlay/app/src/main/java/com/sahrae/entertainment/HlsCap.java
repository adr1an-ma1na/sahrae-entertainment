package com.sahrae.entertainment;

import java.util.ArrayList;
import java.util.List;

/**
 * Data Saver for films and episodes: drop the high-quality renditions from an
 * HLS master playlist, so the player can only choose 480p or lower.
 *
 * The movie players are other people's pages, so the app cannot set their
 * quality. What it can do is answer the player's request for the master
 * playlist (the menu of qualities) with a shorter menu. The player then adapts
 * between what is left. Measured rule of thumb: 1080p costs about four times
 * what 480p does.
 *
 * Pure Java with no Android imports, so CI runs the checks in main() on a plain
 * JDK before the APK is built: java HlsCap.java
 */
public final class HlsCap {
    private HlsCap() {}

    /** Renditions without a RESOLUTION are kept up to this bandwidth (bits/s), about what 480p needs. */
    static final long UNLABELLED_MAX_BPS = 1_600_000L;

    /** True when this playlist lists renditions (a master), rather than the segments of one. */
    public static boolean isMaster(String text) {
        return text != null && text.startsWith("#EXTM3U") && text.contains("#EXT-X-STREAM-INF");
    }

    /**
     * The playlist with every rendition taller than maxHeight removed. When
     * none would be left, the single lowest-bandwidth rendition stays, so the
     * player always has something to play. Anything that is not a master
     * playlist comes back unchanged.
     */
    public static String cap(String text, int maxHeight) {
        if (!isMaster(text)) return text;
        String[] lines = text.split("\n", -1);
        List<int[]> variants = new ArrayList<>();      // {infLine, uriLine}
        List<long[]> info = new ArrayList<>();         // {height or -1, bandwidth or -1}
        for (int i = 0; i < lines.length; i++) {
            if (!lines[i].trim().startsWith("#EXT-X-STREAM-INF")) continue;
            int uri = -1;
            for (int j = i + 1; j < lines.length; j++) {
                String t = lines[j].trim();
                if (t.isEmpty() || t.startsWith("#")) continue;
                uri = j;
                break;
            }
            if (uri < 0) continue;
            variants.add(new int[] { i, uri });
            info.add(new long[] { height(lines[i]), attrLong(lines[i], "BANDWIDTH") });
        }
        if (variants.isEmpty()) return text;

        boolean[] keep = new boolean[variants.size()];
        int kept = 0, lowest = 0;
        for (int v = 0; v < variants.size(); v++) {
            long h = info.get(v)[0], bw = info.get(v)[1];
            boolean ok = h > 0 ? h <= maxHeight : (bw > 0 && bw <= UNLABELLED_MAX_BPS);
            keep[v] = ok;
            if (ok) kept++;
            long lbw = info.get(lowest)[1];
            if (bw > 0 && (lbw <= 0 || bw < lbw)) lowest = v;
        }
        if (kept == variants.size()) return text;
        if (kept == 0) keep[lowest] = true;

        boolean[] drop = new boolean[lines.length];
        for (int v = 0; v < variants.size(); v++) {
            if (keep[v]) continue;
            drop[variants.get(v)[0]] = true;
            drop[variants.get(v)[1]] = true;
        }
        StringBuilder sb = new StringBuilder(text.length());
        for (int i = 0; i < lines.length; i++) {
            if (drop[i]) continue;
            sb.append(lines[i]);
            if (i < lines.length - 1) sb.append('\n');
        }
        return sb.toString();
    }

    private static long height(String inf) {
        String r = attr(inf, "RESOLUTION");
        if (r == null) return -1;
        int x = r.toLowerCase().indexOf('x');
        if (x < 0) return -1;
        try { return Long.parseLong(r.substring(x + 1).trim()); } catch (NumberFormatException e) { return -1; }
    }

    private static long attrLong(String inf, String name) {
        String v = attr(inf, name);
        if (v == null) return -1;
        try { return Long.parseLong(v.trim()); } catch (NumberFormatException e) { return -1; }
    }

    /** Value of NAME=value in an attribute list, skipping quoted commas. AVERAGE-BANDWIDTH is not BANDWIDTH. */
    private static String attr(String line, String name) {
        int colon = line.indexOf(':');
        if (colon < 0) return null;
        String list = line.substring(colon + 1);
        int i = 0;
        while (i < list.length()) {
            int eq = list.indexOf('=', i);
            if (eq < 0) return null;
            String key = list.substring(i, eq).trim();
            int end;
            if (eq + 1 < list.length() && list.charAt(eq + 1) == '"') {
                int close = list.indexOf('"', eq + 2);
                end = close < 0 ? list.length() : list.indexOf(',', close);
            } else {
                end = list.indexOf(',', eq);
            }
            if (end < 0) end = list.length();
            if (key.equals(name)) {
                String v = list.substring(eq + 1, end).trim();
                return v.startsWith("\"") && v.endsWith("\"") && v.length() >= 2 ? v.substring(1, v.length() - 1) : v;
            }
            i = end + 1;
        }
        return null;
    }

    // ── Checks, run in CI: java HlsCap.java ─────────────────────────────────
    public static void main(String[] args) {
        int[] r = { 0, 0 };
        String master = String.join("\n",
            "#EXTM3U",
            "#EXT-X-VERSION:3",
            "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"English\",URI=\"audio/en.m3u8\"",
            "#EXT-X-STREAM-INF:BANDWIDTH=6000000,AVERAGE-BANDWIDTH=5000000,RESOLUTION=1920x1080,CODECS=\"avc1.640028,mp4a.40.2\",AUDIO=\"aud\"",
            "1080/index.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720",
            "720/index.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=854x480",
            "480/index.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360",
            "https://cdn.example/360/index.m3u8",
            "");
        String capped = cap(master, 480);
        check(r, "drops 1080p", !capped.contains("1080/index.m3u8") && !capped.contains("RESOLUTION=1920x1080"));
        check(r, "drops 720p", !capped.contains("720/index.m3u8"));
        check(r, "keeps 480p and 360p", capped.contains("480/index.m3u8") && capped.contains("https://cdn.example/360/index.m3u8"));
        check(r, "keeps the audio track and header", capped.startsWith("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-MEDIA:TYPE=AUDIO"));
        check(r, "each kept rendition still precedes its URI", capped.contains("RESOLUTION=854x480\n480/index.m3u8"));
        check(r, "a quoted comma in CODECS does not confuse the parser", height("#EXT-X-STREAM-INF:CODECS=\"a,b\",RESOLUTION=640x360") == 360);
        check(r, "AVERAGE-BANDWIDTH is not read as BANDWIDTH", attrLong("#EXT-X-STREAM-INF:AVERAGE-BANDWIDTH=5,BANDWIDTH=9", "BANDWIDTH") == 9);

        String allHigh = String.join("\n", "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080", "a.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720", "b.m3u8");
        String one = cap(allHigh, 480);
        check(r, "when every rendition is too tall, the lowest one stays", one.contains("b.m3u8") && !one.contains("a.m3u8"));

        String unlabelled = String.join("\n", "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=5000000", "hi.m3u8",
            "#EXT-X-STREAM-INF:BANDWIDTH=900000", "lo.m3u8");
        String u = cap(unlabelled, 480);
        check(r, "without RESOLUTION, bandwidth decides", u.contains("lo.m3u8") && !u.contains("hi.m3u8"));

        String media = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg1.ts\n#EXT-X-ENDLIST\n";
        check(r, "a segment playlist is untouched", cap(media, 480).equals(media));
        check(r, "a master already within the cap is untouched", cap(String.join("\n", "#EXTM3U",
            "#EXT-X-STREAM-INF:BANDWIDTH=600000,RESOLUTION=640x360", "a.m3u8"), 480).contains("a.m3u8"));
        check(r, "not a playlist at all is untouched", cap("<html>", 480).equals("<html>"));
        check(r, "CRLF playlists keep working", cap(master.replace("\n", "\r\n"), 480).contains("480/index.m3u8")
            && !cap(master.replace("\n", "\r\n"), 480).contains("1080/index.m3u8"));

        System.out.println("\n" + r[0] + " passed, " + r[1] + " failed");
        if (r[1] > 0) System.exit(1);
    }

    private static void check(int[] r, String name, boolean ok) {
        if (ok) r[0]++; else r[1]++;
        System.out.println((ok ? "  ok   " : "  FAIL ") + name);
    }
}
