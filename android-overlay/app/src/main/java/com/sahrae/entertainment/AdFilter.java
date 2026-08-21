package com.sahrae.entertainment;

import android.content.Context;
import android.net.Uri;
import android.webkit.WebResourceRequest;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * EasyList-style network filtering — the mechanism Brave and uBlock Origin use,
 * applied inside our WebView.
 *
 * WHY THIS EXISTS. The app already blocked a bundled list of ad HOSTNAMES. A
 * hostname list can only ever say "this whole domain is bad", which means it is
 * powerless against the ads that matter most here: a popunder script served from
 * the streaming provider's OWN domain. Blocking that domain would kill playback,
 * so those ads always got through. An EasyList rule can block
 * {@code ||vidsrc.to/js/pop.js$script} while leaving the player untouched.
 *
 * WHERE IT RUNS. {@link android.webkit.WebViewClient#shouldInterceptRequest} sees
 * every request from every frame, including the cross-origin embeds. That is the
 * same position in the stack a browser-level blocker occupies, and it is why the
 * Android app can do this while the web build cannot.
 *
 * SCOPE, deliberately narrow. Network rules only — no cosmetic ({@code ##})
 * filtering, because injecting CSS into an allow-listed provider trips its
 * anti-tamper check and stops playback. Rules using options this parser does not
 * understand are SKIPPED rather than guessed at: a mis-parsed rule over-blocks,
 * and over-blocking looks exactly like a broken player.
 *
 * PERFORMANCE. This runs on every subresource request, so rules are bucketed by
 * a token (the longest alphanumeric run in the pattern) exactly as adblock-rust
 * does. A URL is tokenised the same way and only rules sharing a token are
 * tested, which turns tens of thousands of comparisons into a handful. Rules
 * without wildcards skip regex entirely and use substring matching.
 */
final class AdFilter {

    // ── Resource types we can tell apart from a WebResourceRequest ──
    static final int TYPE_UNKNOWN     = 0;
    static final int TYPE_DOCUMENT    = 1;
    static final int TYPE_SUBDOCUMENT = 1 << 1;
    static final int TYPE_SCRIPT      = 1 << 2;
    static final int TYPE_IMAGE       = 1 << 3;
    static final int TYPE_STYLESHEET  = 1 << 4;
    static final int TYPE_XHR         = 1 << 5;
    static final int TYPE_MEDIA       = 1 << 6;
    static final int TYPE_FONT        = 1 << 7;

    /** Hard cap so a runaway list can never exhaust a low-end TV box. */
    private static final int MAX_RULES = 60000;

    private static final class Rule {
        /** Plain substring to look for, when the pattern has no wildcards. */
        String literal;
        /** Compiled form, used only when the pattern needs it. */
        Pattern regex;
        /** For {@code ||host^} rules: match the request's host (or a subdomain). */
        String anchorHost;
        /** Types this rule applies to; 0 means "any type". */
        int types;
        /** Types explicitly excluded via {@code ~type}. */
        int notTypes;
        /** TRUE = third-party only, FALSE = first-party only, null = either. */
        Boolean thirdParty;
        /** $domain= include / exclude lists (lower-case, no leading dot). */
        String[] domainsInclude;
        String[] domainsExclude;
    }

    private final Map<String, List<Rule>> blockBuckets = new HashMap<>();
    private final List<Rule> blockGeneric = new ArrayList<>();
    private final Map<String, List<Rule>> allowBuckets = new HashMap<>();
    private final List<Rule> allowGeneric = new ArrayList<>();

    /**
     * Plain {@code ||host^} rules with no options. These say nothing more than
     * "block this domain", which is exactly what the existing hostname set
     * already does — and about 88k of EasyList's 110k rules are this shape. Kept
     * as bare strings and folded into that set instead of becoming Rule objects,
     * which cuts the engine from ~110k objects to ~22k.
     */
    private final java.util.Set<String> domainOnly = new java.util.HashSet<>();

    private volatile boolean ready = false;
    private int ruleCount = 0;

    boolean isReady() { return ready; }
    int size() { return ruleCount; }
    /** Domains extracted from plain rules, for folding into the hostname set. */
    java.util.Set<String> domainRules() { return domainOnly; }

    // ────────────────────────────────────────────────────────────── loading ──

    /** Parse a filter list from an app asset. Never throws. */
    void loadFromAsset(Context ctx, String assetName) {
        try (InputStream in = ctx.getAssets().open(assetName);
             BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                if (ruleCount >= MAX_RULES) break;
                parseLine(line);
            }
        } catch (Throwable ignore) {
            // A missing or malformed list must never break the app; we simply
            // fall back to the hostname blocklist that was always there.
        }
        ready = true;
    }

    private void parseLine(String raw) {
        if (raw == null) return;
        String line = raw.trim();
        if (line.isEmpty()) return;
        // Comments and list metadata.
        if (line.charAt(0) == '!' || line.charAt(0) == '[') return;
        // Cosmetic rules (##, #@#, #?#) — out of scope, see class docs.
        if (line.contains("##") || line.contains("#@#") || line.contains("#?#")) return;
        // Hostname-style lines ("0.0.0.0 host") belong to the other list.
        if (line.startsWith("0.0.0.0 ") || line.startsWith("127.0.0.1 ")) return;

        boolean exception = false;
        if (line.startsWith("@@")) {
            exception = true;
            line = line.substring(2);
        }

        // Literal regex rules (/…/) are rare and expensive; skip rather than risk
        // a catastrophic backtrack on a hot path.
        if (line.length() > 1 && line.charAt(0) == '/' && line.endsWith("/")) return;

        Rule rule = new Rule();
        String pattern = line;

        int dollar = findOptionsSeparator(line);
        if (dollar >= 0) {
            pattern = line.substring(0, dollar);
            if (!applyOptions(rule, line.substring(dollar + 1))) return; // unknown option → skip
        }
        if (pattern.isEmpty()) return;

        // Fast path: a plain domain block with no options is just a hostname.
        if (!exception && dollar < 0 && pattern.startsWith("||")) {
            String rest = pattern.substring(2);
            int sep = indexOfAny(rest, "/^*|");
            String host = (sep < 0 ? rest : rest.substring(0, sep)).toLowerCase(Locale.US);
            String tail = sep < 0 ? "" : rest.substring(sep);
            if (!host.isEmpty()
                && (tail.isEmpty() || tail.equals("^") || tail.equals("|") || tail.equals("^|"))) {
                domainOnly.add(host);
                return;
            }
        }

        if (!buildMatcher(rule, pattern)) return;

        String token = tokenOf(pattern);
        Map<String, List<Rule>> buckets = exception ? allowBuckets : blockBuckets;
        List<Rule> generic = exception ? allowGeneric : blockGeneric;
        if (token != null) {
            List<Rule> list = buckets.get(token);
            if (list == null) { list = new ArrayList<>(2); buckets.put(token, list); }
            list.add(rule);
        } else {
            generic.add(rule);
        }
        ruleCount++;
    }

    /** Index of the '$' that starts options, ignoring one inside a regex-ish pattern. */
    private static int findOptionsSeparator(String s) {
        for (int i = s.length() - 1; i >= 0; i--) {
            if (s.charAt(i) == '$') return i;
        }
        return -1;
    }

    /** Returns false when an option is not understood, so the caller skips the rule. */
    private static boolean applyOptions(Rule rule, String opts) {
        for (String optRaw : opts.split(",")) {
            String opt = optRaw.trim().toLowerCase(Locale.US);
            if (opt.isEmpty()) continue;

            boolean negate = opt.startsWith("~");
            if (negate) opt = opt.substring(1);

            if (opt.startsWith("domain=")) {
                String[] parts = opt.substring(7).split("\\|");
                List<String> inc = new ArrayList<>(), exc = new ArrayList<>();
                for (String p : parts) {
                    if (p.isEmpty()) continue;
                    if (p.charAt(0) == '~') exc.add(p.substring(1)); else inc.add(p);
                }
                if (!inc.isEmpty()) rule.domainsInclude = inc.toArray(new String[0]);
                if (!exc.isEmpty()) rule.domainsExclude = exc.toArray(new String[0]);
                continue;
            }

            switch (opt) {
                case "third-party": rule.thirdParty = !negate; break;
                case "script":      if (negate) rule.notTypes |= TYPE_SCRIPT;     else rule.types |= TYPE_SCRIPT; break;
                case "image":       if (negate) rule.notTypes |= TYPE_IMAGE;      else rule.types |= TYPE_IMAGE; break;
                case "stylesheet":  if (negate) rule.notTypes |= TYPE_STYLESHEET; else rule.types |= TYPE_STYLESHEET; break;
                case "xmlhttprequest": if (negate) rule.notTypes |= TYPE_XHR;     else rule.types |= TYPE_XHR; break;
                case "subdocument": if (negate) rule.notTypes |= TYPE_SUBDOCUMENT;else rule.types |= TYPE_SUBDOCUMENT; break;
                case "media":       if (negate) rule.notTypes |= TYPE_MEDIA;      else rule.types |= TYPE_MEDIA; break;
                case "font":        if (negate) rule.notTypes |= TYPE_FONT;       else rule.types |= TYPE_FONT; break;
                case "document":    if (negate) rule.notTypes |= TYPE_DOCUMENT;   else rule.types |= TYPE_DOCUMENT; break;
                // Harmless to honour as plain blocks.
                case "popup": case "other": case "object": case "websocket": case "ping":
                    break;
                // Everything else ($csp, $redirect, $removeparam, $replace, …)
                // changes semantics in ways this matcher does not implement.
                default:
                    return false;
            }
        }
        return true;
    }

    /** Turn an ABP pattern into either a substring test or a compiled regex. */
    private static boolean buildMatcher(Rule rule, String pattern) {
        try {
            if (pattern.startsWith("||")) {
                String rest = pattern.substring(2);
                // "||host^" with nothing after it is a pure domain rule — by far
                // the most common shape, and matchable without any regex.
                int sep = indexOfAny(rest, "/^*|");
                String host = (sep < 0 ? rest : rest.substring(0, sep)).toLowerCase(Locale.US);
                if (host.isEmpty()) return false;
                rule.anchorHost = host;
                String tail = sep < 0 ? "" : rest.substring(sep);
                if (tail.isEmpty() || tail.equals("^") || tail.equals("|") || tail.equals("^|")) {
                    return true; // host check alone is enough
                }
                rule.regex = Pattern.compile(abpToRegex(pattern), Pattern.CASE_INSENSITIVE);
                return true;
            }

            if (pattern.indexOf('*') < 0 && pattern.indexOf('^') < 0
                && pattern.indexOf('|') < 0) {
                rule.literal = pattern.toLowerCase(Locale.US);
                return !rule.literal.isEmpty();
            }

            rule.regex = Pattern.compile(abpToRegex(pattern), Pattern.CASE_INSENSITIVE);
            return true;
        } catch (Throwable t) {
            return false; // unparseable → drop the rule rather than misapply it
        }
    }

    private static int indexOfAny(String s, String chars) {
        int best = -1;
        for (int i = 0; i < chars.length(); i++) {
            int idx = s.indexOf(chars.charAt(i));
            if (idx >= 0 && (best < 0 || idx < best)) best = idx;
        }
        return best;
    }

    /** ABP pattern → regex. `*` = any run, `^` = separator, `|` = anchor. */
    private static String abpToRegex(String p) {
        StringBuilder sb = new StringBuilder(p.length() * 2);
        int i = 0;
        if (p.startsWith("||")) {
            sb.append("^[a-z]+://([^/]*\\.)?");
            i = 2;
        } else if (p.startsWith("|")) {
            sb.append('^');
            i = 1;
        }
        for (; i < p.length(); i++) {
            char c = p.charAt(i);
            switch (c) {
                case '*': sb.append(".*"); break;
                // ABP's separator: anything that is not a letter, digit, _ - . %
                case '^': sb.append("(?:[^a-zA-Z0-9_\\-.%]|$)"); break;
                case '|':
                    if (i == p.length() - 1) sb.append('$');
                    else sb.append("\\|");
                    break;
                default:
                    if ("\\.+?()[]{}$".indexOf(c) >= 0) sb.append('\\');
                    sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Bucket key: the longest alphanumeric run of 3+ chars in the pattern. */
    private static String tokenOf(String pattern) {
        String best = null;
        int start = -1;
        for (int i = 0; i <= pattern.length(); i++) {
            char c = i < pattern.length() ? Character.toLowerCase(pattern.charAt(i)) : ' ';
            boolean alnum = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
            if (alnum) {
                if (start < 0) start = i;
            } else {
                if (start >= 0) {
                    int len = i - start;
                    if (len >= 3 && (best == null || len > best.length())) {
                        best = pattern.substring(start, i).toLowerCase(Locale.US);
                    }
                    start = -1;
                }
            }
        }
        return best;
    }

    // ───────────────────────────────────────────────────────────── matching ──

    /**
     * @param url         full request URL
     * @param host        request host (lower-case)
     * @param documentHost host of the page making the request, or null if unknown
     * @param type        one of the TYPE_* constants
     * @return true when the request should be blocked
     */
    boolean shouldBlock(String url, String host, String documentHost, int type) {
        if (!ready || url == null || host == null) return false;
        String lower = url.toLowerCase(Locale.US);
        List<String> tokens = tokensOf(lower);

        if (!matches(blockBuckets, blockGeneric, tokens, lower, host, documentHost, type)) return false;
        // An exception rule beats a block rule, same as EasyList semantics.
        return !matches(allowBuckets, allowGeneric, tokens, lower, host, documentHost, type);
    }

    /**
     * Does an {@code @@} exception cover this request?
     *
     * Called before a HOSTNAME block so that domain rules folded into the host
     * set still honour EasyList's allow-rules. Without this, moving the plain
     * domain rules out of the engine would quietly drop ~1.4k exceptions and
     * over-block whatever they exist to protect.
     */
    boolean isExcepted(String url, String host, String documentHost, int type) {
        if (!ready || url == null || host == null) return false;
        String lower = url.toLowerCase(Locale.US);
        return matches(allowBuckets, allowGeneric, tokensOf(lower), lower, host, documentHost, type);
    }

    private boolean matches(Map<String, List<Rule>> buckets, List<Rule> generic,
                            List<String> tokens, String url, String host,
                            String documentHost, int type) {
        for (String t : tokens) {
            List<Rule> list = buckets.get(t);
            if (list == null) continue;
            for (int i = 0; i < list.size(); i++) {
                if (ruleMatches(list.get(i), url, host, documentHost, type)) return true;
            }
        }
        for (int i = 0; i < generic.size(); i++) {
            if (ruleMatches(generic.get(i), url, host, documentHost, type)) return true;
        }
        return false;
    }

    private static boolean ruleMatches(Rule r, String url, String host,
                                       String documentHost, int type) {
        // Type conditions. When we could not classify the request, only apply
        // rules that do not care about type — guessing here over-blocks.
        if (r.types != 0) {
            if (type == TYPE_UNKNOWN || (r.types & type) == 0) return false;
        }
        if (r.notTypes != 0 && type != TYPE_UNKNOWN && (r.notTypes & type) != 0) return false;

        if (r.thirdParty != null) {
            if (documentHost == null) return false; // unknown context → don't guess
            boolean third = !sameSite(host, documentHost);
            if (third != r.thirdParty) return false;
        }

        if (r.domainsInclude != null || r.domainsExclude != null) {
            if (documentHost == null) return false;
            if (r.domainsExclude != null) {
                for (String d : r.domainsExclude) if (hostMatches(documentHost, d)) return false;
            }
            if (r.domainsInclude != null) {
                boolean hit = false;
                for (String d : r.domainsInclude) if (hostMatches(documentHost, d)) { hit = true; break; }
                if (!hit) return false;
            }
        }

        if (r.anchorHost != null && !hostMatches(host, r.anchorHost)) return false;
        if (r.literal != null) return url.contains(r.literal);
        if (r.regex != null) return r.regex.matcher(url).find();
        return r.anchorHost != null; // pure ||host^ rule
    }

    /** host == domain, or a subdomain of it. */
    private static boolean hostMatches(String host, String domain) {
        if (host.equals(domain)) return true;
        return host.length() > domain.length()
            && host.charAt(host.length() - domain.length() - 1) == '.'
            && host.endsWith(domain);
    }

    /** Cheap same-site test: compare the last two labels. */
    private static boolean sameSite(String a, String b) {
        return registrable(a).equals(registrable(b));
    }

    private static String registrable(String host) {
        int last = host.lastIndexOf('.');
        if (last <= 0) return host;
        int prev = host.lastIndexOf('.', last - 1);
        return prev < 0 ? host : host.substring(prev + 1);
    }

    private static List<String> tokensOf(String url) {
        List<String> out = new ArrayList<>(12);
        int start = -1;
        for (int i = 0; i <= url.length(); i++) {
            char c = i < url.length() ? url.charAt(i) : ' ';
            boolean alnum = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
            if (alnum) {
                if (start < 0) start = i;
            } else {
                if (start >= 0) {
                    if (i - start >= 3) out.add(url.substring(start, i));
                    start = -1;
                }
            }
        }
        return out;
    }

    /** Best-effort resource type from what a WebResourceRequest exposes. */
    static int typeOf(WebResourceRequest req, Uri uri) {
        try {
            if (req.isForMainFrame()) return TYPE_DOCUMENT;
            Map<String, String> h = req.getRequestHeaders();
            String accept = null;
            if (h != null) {
                accept = h.get("Accept");
                if (accept == null) accept = h.get("accept");
            }
            if (accept != null) {
                String a = accept.toLowerCase(Locale.US);
                if (a.contains("text/html")) return TYPE_SUBDOCUMENT;
                if (a.startsWith("image/") || a.contains("image/webp") || a.contains("image/avif")) return TYPE_IMAGE;
                if (a.contains("text/css")) return TYPE_STYLESHEET;
                if (a.contains("font/") || a.contains("application/font")) return TYPE_FONT;
            }
            String path = uri.getPath();
            if (path != null) {
                String p = path.toLowerCase(Locale.US);
                if (p.endsWith(".js") || p.endsWith(".mjs")) return TYPE_SCRIPT;
                if (p.endsWith(".css")) return TYPE_STYLESHEET;
                if (p.endsWith(".png") || p.endsWith(".jpg") || p.endsWith(".jpeg")
                    || p.endsWith(".gif") || p.endsWith(".webp") || p.endsWith(".svg")) return TYPE_IMAGE;
                if (p.endsWith(".woff") || p.endsWith(".woff2") || p.endsWith(".ttf")) return TYPE_FONT;
                if (p.endsWith(".mp4") || p.endsWith(".m3u8") || p.endsWith(".ts")
                    || p.endsWith(".mpd") || p.endsWith(".m4s")) return TYPE_MEDIA;
            }
            String xhr = h != null ? h.get("X-Requested-With") : null;
            if (xhr != null) return TYPE_XHR;
        } catch (Throwable ignore) { /* fall through */ }
        return TYPE_UNKNOWN;
    }
}
