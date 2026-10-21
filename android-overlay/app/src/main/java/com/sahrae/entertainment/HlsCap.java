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

    /** True for a DASH manifest (VidLink serves these). */
    public static boolean isDash(String text) {
        return text != null && text.contains("<MPD") && text.contains("<Representation");
    }

    /**
     * The DASH manifest with every video Representation taller than maxHeight
     * removed, keeping the shortest one in an AdaptationSet when none would be
     * left, so the player always has a picture. Audio and text Representations
     * carry no height and are never touched.
     */
    public static String capDash(String text, int maxHeight) {
        if (!isDash(text)) return text;
        StringBuilder out = new StringBuilder(text.length());
        int pos = 0;
        while (true) {
            int setStart = text.indexOf("<AdaptationSet", pos);
            if (setStart < 0) break;
            int setEnd = text.indexOf("</AdaptationSet>", setStart);
            if (setEnd < 0) break;
            setEnd += "</AdaptationSet>".length();
            out.append(text, pos, setStart);
            out.append(capSet(text.substring(setStart, setEnd), maxHeight));
            pos = setEnd;
        }
        out.append(text.substring(pos));
        return out.toString();
    }

    private static String capSet(String set, int maxHeight) {
        List<int[]> reps = new ArrayList<>();   // {start, end, height}
        int i = 0;
        while (true) {
            int s = set.indexOf("<Representation", i);
            if (s < 0) break;
            int tagEnd = set.indexOf('>', s);
            if (tagEnd < 0) break;
            int end;
            if (set.charAt(tagEnd - 1) == '/') end = tagEnd + 1;
            else {
                int close = set.indexOf("</Representation>", tagEnd);
                if (close < 0) break;
                end = close + "</Representation>".length();
            }
            long h = xmlAttrLong(set.substring(s, tagEnd), "height");
            reps.add(new int[] { s, end, (int) h });
            i = end;
        }
        int shortest = -1, keep = 0;
        for (int r = 0; r < reps.size(); r++) {
            int h = reps.get(r)[2];
            if (h <= 0 || h <= maxHeight) keep++;
            if (h > 0 && (shortest < 0 || h < reps.get(shortest)[2])) shortest = r;
        }
        StringBuilder sb = new StringBuilder(set.length());
        int at = 0;
        for (int r = 0; r < reps.size(); r++) {
            int[] rp = reps.get(r);
            boolean drop = rp[2] > maxHeight && !(keep == 0 && r == shortest);
            if (!drop) continue;
            sb.append(set, at, rp[0]);
            at = rp[1];
        }
        sb.append(set.substring(at));
        return sb.toString();
    }

    private static long xmlAttrLong(String tag, String name) {
        int i = tag.indexOf(" " + name + "=\"");
        if (i < 0) return -1;
        int s = i + name.length() + 3;
        int e = tag.indexOf('"', s);
        if (e < 0) return -1;
        try { return Long.parseLong(tag.substring(s, e).trim()); } catch (NumberFormatException x) { return -1; }
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

        String mpd = String.join("\n",
            "<?xml version=\"1.0\"?>",
            "<MPD xmlns=\"urn:mpeg:dash:schema:mpd:2011\" type=\"static\">",
            "<Period>",
            "<AdaptationSet mimeType=\"video/mp4\">",
            "<Representation id=\"v1080\" bandwidth=\"1600000\" width=\"1920\" height=\"1080\" codecs=\"hev1\"><BaseURL>1080.mp4</BaseURL><SegmentBase indexRange=\"0-1\"/></Representation>",
            "<Representation id=\"v720\" bandwidth=\"900000\" width=\"1280\" height=\"720\"><BaseURL>720.mp4</BaseURL></Representation>",
            "<Representation id=\"v480\" bandwidth=\"500000\" width=\"854\" height=\"480\"/>",
            "</AdaptationSet>",
            "<AdaptationSet mimeType=\"audio/mp4\" lang=\"eng\">",
            "<Representation id=\"a1\" bandwidth=\"128000\" codecs=\"mp4a.40.2\"><AudioChannelConfiguration value=\"2\"/></Representation>",
            "</AdaptationSet>",
            "</Period></MPD>");
        String dc = capDash(mpd, 480);
        check(r, "DASH: 1080p and 720p removed", !dc.contains("v1080") && !dc.contains("v720") && !dc.contains("1080.mp4"));
        check(r, "DASH: 480p kept (self-closing form)", dc.contains("id=\"v480\""));
        check(r, "DASH: the audio is untouched", dc.contains("id=\"a1\"") && dc.contains("AudioChannelConfiguration"));
        check(r, "DASH: the rest of the manifest is intact", dc.startsWith("<?xml") && dc.trim().endsWith("</MPD>") && dc.contains("</AdaptationSet>"));
        String hiOnly = mpd.replace("<Representation id=\"v480\" bandwidth=\"500000\" width=\"854\" height=\"480\"/>", "");
        String dc2 = capDash(hiOnly, 480);
        check(r, "DASH: when every video is too tall, the shortest stays", dc2.contains("v720") && !dc2.contains("v1080"));
        check(r, "DASH: not a manifest is untouched", capDash("#EXTM3U", 480).equals("#EXTM3U"));

        System.out.println("\n" + r[0] + " passed, " + r[1] + " failed");
        if (r[1] > 0) System.exit(1);
    }

    private static void check(int[] r, String name, boolean ok) {
        if (ok) r[0]++; else r[1]++;
        System.out.println((ok ? "  ok   " : "  FAIL ") + name);
    }
}
