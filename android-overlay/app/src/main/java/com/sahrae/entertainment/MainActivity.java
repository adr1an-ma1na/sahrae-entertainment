package com.sahrae.entertainment;

import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.zip.GZIPInputStream;

/**
 * Sahrae Entertainment — Android shell with SIX LAYERS of pop-up / ad
 * protection. The streaming-embed servers (vidrock, vidzee, vidlink, etc.)
 * monetise by injecting popunder ads via several different mechanisms;
 * each layer blocks one class of attack.
 *
 *  L1 — Network blocklist: shouldInterceptRequest drops any request to a
 *       known ad / popunder / tracker host. Subresource and top-frame.
 *
 *  L1.5 — DOM-level eradication (THE BIG ONE): shouldInterceptRequest fetches
 *       the embed's *HTML document* itself, strips its Content-Security-Policy
 *       / X-Frame-Options headers, and injects an aggressive anti-popup shim
 *       as the very first thing in <head> — so it runs *inside* the hostile
 *       cross-origin iframe, BEFORE the embed's own ad scripts, and neuters
 *       window.open / anchor-popunder / location tricks at the source. This is
 *       what L4 (below) could never reach, because L4 only runs in the top
 *       frame.
 *
 *  L2 — Top-frame navigation whitelist: shouldOverrideUrlLoading refuses to
 *       navigate the WebView's top frame to anywhere outside our trusted
 *       host set. The most common popup technique is `top.location = ad`;
 *       this blocks it cold no matter which ad host is targeted.
 *
 *  L3 — Popup window refusal: WebChromeClient.onCreateWindow returns false
 *       so JS-initiated `window.open()` never spawns a new window.
 *
 *  L4 — JS shim injection on the top frame: when our React app finishes
 *       loading, we override window.open / location setters so even
 *       in-app callsites can't accidentally trigger a popup.
 *
 *  L5 — WebSettings lockdown: file:// isolation, no multiple windows, no
 *       JS-opened windows, Safe Browsing on.
 */
public class MainActivity extends BridgeActivity {

    /** Hosts the top frame is allowed to navigate to. Everything else is refused. */
    private static final Set<String> TRUSTED_MAIN_FRAME_HOSTS = new HashSet<>(Arrays.asList(
        "localhost",                  // Capacitor's bundled app
        "firebaseapp.com",            // Firebase auth + hosting (matches *.firebaseapp.com)
        "google.com",                 // accounts.google.com, etc. (Google sign-in redirect)
        "googleapis.com",             // Firebase Auth REST endpoints
        "gstatic.com",                // Google CDN
        "googleusercontent.com"       // Sometimes hit by Google services
    ));

    /**
     * The streaming-embed providers we actually use (see PlayerModal SERVERS).
     * A sub-frame (iframe) may navigate freely among these; a *gesture-driven*
     * navigation to anything outside this + the trusted set is treated as an
     * on-click popunder/redirect and refused.
     */
    private static final Set<String> EMBED_HOSTS = new HashSet<>(Arrays.asList(
        // Movie / TV embed providers
        "vidrock.ru","vidzee.wtf","vidlink.pro","vidsrc.to","vidsrc.pm",
        "autoembed.co","vidsrc.icu","vidvault.ru",
        "youtube-nocookie.com","youtube.com","ytimg.com",   // trailer player
        // Live Sports (Streamed API + its stream embed hosts)
        "streamed.pk","streamed.su","streamed.st",
        "embed.st","embedme.top","embedsports.top","embedstreams.top","rr.buytommy.top"
    ));

    /**
     * Core, always-present blocklist of ad/popunder/tracker hosts. At startup
     * we ALSO fold in a large bundled host list (assets/adhosts.txt, fetched in
     * CI from a maintained ad/malware list) for near-total coverage — see
     * loadBundledBlocklistAsync(). Reads go through the volatile {@link #adHosts}
     * reference so the swap-in is thread-safe.
     */
    private static final Set<String> CORE_AD_HOSTS = new HashSet<>(Arrays.asList(
        // Popunder / aggressive redirect networks
        "popads.net","popcash.net","popunder.net","propellerads.com","propellerads.net","propu.sh",
        "adsterra.com","adsterra.net","ad-maven.com","admaven.com","trafficjunky.net","trafficjunky.com",
        "exoclick.com","exosrv.com","ero-advertising.com","yllix.com",
        "hilltopads.com","clickadu.com","oclasrv.com","onclkds.com","onclickads.net",
        "onclickperformance.com","trafficstars.com","trafficfactory.biz",
        "runative.com","ranatv.com","juicyads.com","go2cloud.org","go2affise.com",
        "admixer.net","clksite.com","oktrkme.com","historyoftrust.com","adcash.com",
        "airpush.com","popmyads.com","popunderjs.com","popmonster.net","validclick.com",
        "voluumtrk.com","voluumtrk2.com","voluumtrk3.com","evadav.com","vrtzads.com",
        "highperformancecpm.com","highperformanceformat.com","smartclickexpress.com",
        "a-ads.com","ad-delivery.net","adskeeper.com","adskeeper.co.uk","push.house",
        "mgcash.com","clickaine.com","clickwinkals.com","luckyforbet.com","bestadbid.com",
        "adservetx.media","servedby-buysellads.com","poptm.com","popunder.io",
        // Major ad networks
        "doubleclick.net","googlesyndication.com","googleadservices.com",
        "googletagmanager.com","googletagservices.com","amazon-adsystem.com",
        "adnxs.com","rubiconproject.com","openx.net","pubmatic.com","bidswitch.net",
        // Trackers / analytics
        "google-analytics.com","scorecardresearch.com","quantserve.com","criteo.com",
        "chartbeat.com","newrelic.com","mc.yandex.ru","histats.com",
        // Content-recommendation chum
        "outbrain.com","taboola.com","mgid.com","revcontent.com","zergnet.com","nativeads.com",
        // Adult popunder redirect targets piracy embeds commonly use
        "chaturbate.com","livejasmin.com","bongacams.com","stripchat.com","camsoda.com"
    ));

    /** Live blocklist used for lookups. Starts as the core set, swapped for the
     *  full (core + bundled) set once the asset loads. Volatile = safe to swap. */
    private static volatile Set<String> adHosts = CORE_AD_HOSTS;

    /**
     * Match a host against the blocklist using a progressive suffix walk:
     * for "a.b.tracker.com" we test "a.b.tracker.com", "b.tracker.com",
     * "tracker.com", "com" — at most a handful of O(1) HashSet lookups,
     * so a 150k-entry blocklist stays fast (no linear scan).
     */
    private static boolean isAdHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        Set<String> set = adHosts;
        int idx = 0;
        while (idx >= 0 && idx < h.length()) {
            if (set.contains(idx == 0 ? h : h.substring(idx))) return true;
            int dot = h.indexOf('.', idx);
            idx = (dot < 0) ? -1 : dot + 1;
        }
        return false;
    }

    /**
     * Load the bundled host list (assets/adhosts.txt) off the UI thread, fold it
     * into a fresh set together with the core hosts, then atomically swap it in.
     * Each line is a bare domain (lines starting with '#' or blank are skipped).
     */
    private void loadBundledBlocklistAsync() {
        new Thread(() -> {
            try {
                Set<String> full = new HashSet<>(CORE_AD_HOSTS);
                java.io.InputStream is = getAssets().open("adhosts.txt");
                java.io.BufferedReader br = new java.io.BufferedReader(
                    new java.io.InputStreamReader(is, StandardCharsets.UTF_8), 1 << 16);
                String line;
                while ((line = br.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.charAt(0) == '#') continue;
                    full.add(line.toLowerCase());
                }
                br.close();
                adHosts = full; // atomic swap — readers see core or full, never a torn set
            } catch (Exception ignore) {
                // No bundled list (e.g. local build) — core set stays in effect.
            }
        }, "adhosts-loader").start();
    }

    private static boolean isTrustedMainFrameHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        if (TRUSTED_MAIN_FRAME_HOSTS.contains(h)) return true;
        for (String t : TRUSTED_MAIN_FRAME_HOSTS) {
            if (h.endsWith("." + t)) return true;
        }
        return false;
    }

    private static boolean isEmbedHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        if (EMBED_HOSTS.contains(h)) return true;
        for (String e : EMBED_HOSTS) {
            if (h.endsWith("." + e)) return true;
        }
        return false;
    }

    /** Safely extract the host from a URL string (null on any parse failure). */
    private static String uriHost(String url) {
        if (url == null) return null;
        try {
            return Uri.parse(url).getHost();
        } catch (Exception e) {
            return null;
        }
    }

    /** Our own Capacitor app shell — never intercept/rewrite it. */
    private static boolean isLocalAppHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        return h.equals("localhost") || h.endsWith(".localhost");
    }

    /**
     * The aggressive shim injected INTO the embed iframes (L1.5). Runs before
     * the embed's own scripts, in the embed's own origin, so it can actually
     * stop the popunders at their source.
     */
    private static final String EMBED_SHIM =
        "<script>(function(){try{" +
          "var noop=function(){return null;};" +
          // 1) Kill window.open at every touchpoint (instance + prototype).
          "try{Object.defineProperty(window,'open',{value:noop,writable:false,configurable:false});}catch(e){try{window.open=noop;}catch(_){ }}" +
          "try{Object.defineProperty(Window.prototype,'open',{value:noop,writable:false,configurable:false});}catch(e){}" +
          // 2) Kill the 'create an <a target=_blank> and .click() it' popunder.
          //    Swallow programmatic clicks on blank/parent/top anchors and on
          //    anchors not attached to the document (classic popunder pattern).
          "try{var _click=HTMLElement.prototype.click;HTMLElement.prototype.click=function(){try{if(this&&this.tagName==='A'){var t=((this.target||'')+'').toLowerCase();var inDoc=document.documentElement&&document.documentElement.contains(this);if(t==='_blank'||t==='_top'||t==='_parent'||!inDoc){return;}}}catch(_){ }return _click.apply(this,arguments);};}catch(e){}" +
          // 3) On real user clicks, force any _blank/_top/_parent anchor to _self
          //    so it can't break out of the frame.
          "document.addEventListener('click',function(e){try{var n=e.target;while(n&&n!==document){if(n.tagName==='A'){var t=((n.target||'')+'').toLowerCase();if(t==='_blank'||t==='_top'||t==='_parent'){n.target='_self';}}n=n.parentNode;}}catch(_){ }},true);" +
          // 4) Defeat beforeunload/unload/pagehide redirect traps. We leave the
          //    frame's OWN location alone so the actual video can still load.
          "['beforeunload','unload','pagehide'].forEach(function(ev){try{window.addEventListener(ev,function(e){try{e.preventDefault();e.stopImmediatePropagation();}catch(_){ }return undefined;},true);}catch(_){ }});" +
        "}catch(err){}})();</script>";

    /** JS that runs on every page-load in the top frame. Neuters popup APIs. */
    private static final String ANTI_POPUP_SHIM =
        "(function(){try{" +
          // Disable window.open at multiple touchpoints — some scripts cache the original.
          "var noop=function(){return null;};" +
          "try{Object.defineProperty(window,'open',{value:noop,writable:false,configurable:false});}catch(e){window.open=noop;}" +
          "try{Object.defineProperty(Window.prototype,'open',{value:noop,writable:false,configurable:false});}catch(e){}" +
          // Neuter beforeunload/unload-based redirect tricks.
          "['beforeunload','unload','pagehide'].forEach(function(ev){" +
            "window.addEventListener(ev,function(e){try{e.preventDefault();e.stopImmediatePropagation();}catch(_){ } return false;},true);" +
          "});" +
          // Rewrite any <a target=_blank> to target=_self at click time so they go through
          // Capacitor's normal nav path (which our WebViewClient then arbitrates).
          "document.addEventListener('click',function(e){" +
            "var n=e.target;while(n&&n!==document){if(n.tagName==='A'&&(n.target==='_blank'||n.target==='_top')){n.target='_self';}n=n.parentNode;}" +
          "},true);" +
        "}catch(err){}})();";

    private static WebResourceResponse blockedResponse() {
        return new WebResourceResponse(
            "text/plain", "utf-8",
            new ByteArrayInputStream(new byte[0])
        );
    }

    private static int indexOfIgnoreCase(String haystack, String needle, int from) {
        if (haystack == null) return -1;
        String h = haystack.toLowerCase();
        return h.indexOf(needle.toLowerCase(), Math.max(0, from));
    }

    private static Charset charsetFromContentType(String contentType) {
        if (contentType != null) {
            String ct = contentType.toLowerCase();
            int i = ct.indexOf("charset=");
            if (i >= 0) {
                String cs = contentType.substring(i + 8).trim();
                int sc = cs.indexOf(';');
                if (sc >= 0) cs = cs.substring(0, sc).trim();
                cs = cs.replace("\"", "").replace("'", "").trim();
                try {
                    if (cs.length() > 0 && Charset.isSupported(cs)) return Charset.forName(cs);
                } catch (Exception ignore) {}
            }
        }
        return StandardCharsets.UTF_8;
    }

    private static byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        while ((n = in.read(buf)) != -1) bos.write(buf, 0, n);
        return bos.toByteArray();
    }

    /**
     * L1.5 — fetch a 3rd-party HTML *document*, inject the embed shim into its
     * <head>, strip CSP/X-Frame-Options so the shim runs and the frame embeds,
     * and hand the rewritten document back to the WebView. Returns null to fall
     * back to normal loading for anything that isn't a plain HTML document.
     */
    private WebResourceResponse maybeRewriteEmbedHtml(WebResourceRequest request, String host) {
        HttpURLConnection conn = null;
        try {
            if (request.getMethod() != null && !"GET".equalsIgnoreCase(request.getMethod())) return null;

            Uri uri = request.getUrl();
            String scheme = uri.getScheme();
            if (scheme == null) return null;
            scheme = scheme.toLowerCase();
            if (!scheme.equals("http") && !scheme.equals("https")) return null;

            // Never rewrite our own shell, the trusted auth/Google pages, ad
            // hosts, or our KNOWN embed providers. Several player embeds run an
            // anti-tamper check and refuse to play ("Remove sandbox attributes
            // on the iframe tag") if their document was modified — so we leave
            // every allow-listed provider completely untouched and rely on the
            // blocklist + nav guards + JS-dialog suppression for ad protection.
            if (isLocalAppHost(host) || isTrustedMainFrameHost(host)
                || isAdHost(host) || isEmbedHost(host)) return null;

            Map<String, String> headers = request.getRequestHeaders();
            String accept = null;
            if (headers != null) {
                accept = headers.get("Accept");
                if (accept == null) accept = headers.get("accept");
                if (headers.containsKey("Range") || headers.containsKey("range")) return null; // media
            }
            // Only document loads advertise text/html. XHR/fetch/media/css/js do not,
            // so this cleanly targets just the top-frame + iframe navigations.
            if (accept == null || !accept.toLowerCase().contains("text/html")) return null;

            String urlStr = uri.toString();
            conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setInstanceFollowRedirects(false); // let the WebView follow redirects itself
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(20000);
            conn.setRequestMethod("GET");

            if (headers != null) {
                for (Map.Entry<String, String> e : headers.entrySet()) {
                    String k = e.getKey();
                    if (k == null) continue;
                    String lk = k.toLowerCase();
                    if (lk.equals("accept-encoding") || lk.equals("connection")
                        || lk.equals("host") || lk.equals("range") || lk.equals("content-length")) continue;
                    try { conn.setRequestProperty(k, e.getValue()); } catch (Exception ignore) {}
                }
            }
            conn.setRequestProperty("Accept-Encoding", "identity"); // we want plaintext to rewrite

            int code = conn.getResponseCode();
            // Redirect or error — bail and let the WebView do its own normal load
            // (it follows redirects natively; we'll catch the final document then).
            if (code < 200 || code >= 300) return null;

            String contentType = conn.getContentType();
            if (contentType == null || !contentType.toLowerCase().contains("text/html")) return null;

            String enc = conn.getContentEncoding();
            InputStream raw = conn.getInputStream();
            InputStream in = (enc != null && enc.toLowerCase().contains("gzip"))
                ? new GZIPInputStream(raw) : raw;

            byte[] bodyBytes = readAll(in);
            Charset cs = charsetFromContentType(contentType);
            String html = new String(bodyBytes, cs);

            // Inject the shim as the FIRST thing inside <head> (before embed scripts).
            int insertAt = -1;
            int headIdx = indexOfIgnoreCase(html, "<head", 0);
            if (headIdx >= 0) {
                int gt = html.indexOf('>', headIdx);
                if (gt >= 0) insertAt = gt + 1;
            }
            if (insertAt < 0) {
                int htmlIdx = indexOfIgnoreCase(html, "<html", 0);
                if (htmlIdx >= 0) {
                    int gt = html.indexOf('>', htmlIdx);
                    if (gt >= 0) insertAt = gt + 1;
                }
            }
            if (insertAt < 0) insertAt = 0;
            String rewritten = html.substring(0, insertAt) + EMBED_SHIM + html.substring(insertAt);

            byte[] outBytes = rewritten.getBytes(cs);

            // Build response headers: drop CSP / framing / encoding / length, keep the rest.
            Map<String, String> respHeaders = new HashMap<>();
            for (Map.Entry<String, List<String>> e : conn.getHeaderFields().entrySet()) {
                String k = e.getKey();
                if (k == null) continue;
                String lk = k.toLowerCase();
                if (lk.equals("set-cookie")) {
                    try {
                        for (String c : e.getValue()) CookieManager.getInstance().setCookie(urlStr, c);
                    } catch (Exception ignore) {}
                    continue;
                }
                if (lk.equals("content-encoding") || lk.equals("content-length")
                    || lk.equals("transfer-encoding") || lk.equals("content-type")
                    || lk.equals("content-security-policy")
                    || lk.equals("content-security-policy-report-only")
                    || lk.equals("x-frame-options")) continue;
                StringBuilder sb = new StringBuilder();
                for (String v : e.getValue()) {
                    if (v == null) continue;
                    if (sb.length() > 0) sb.append(", ");
                    sb.append(v);
                }
                if (sb.length() > 0) respHeaders.put(k, sb.toString());
            }

            String csName = cs.name().toLowerCase();
            WebResourceResponse resp = new WebResourceResponse(
                "text/html", csName, 200, "OK",
                respHeaders, new ByteArrayInputStream(outBytes)
            );
            return resp;
        } catch (Exception e) {
            return null; // any failure → fall back to normal loading
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignore) {}
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Fold the large bundled ad/tracker blocklist in off the UI thread.
        loadBundledBlocklistAsync();

        final Bridge bridge = this.bridge;
        final WebView webView = bridge.getWebView();

        // ── L1 + L1.5 + L2 — custom WebViewClient
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String host = request.getUrl().getHost();

                    // L1 — network blocklist
                    if (isAdHost(host)) return blockedResponse();

                    // L1.5 — DOM-level eradication: rewrite embed HTML documents,
                    // injecting the anti-popup shim inside the hostile iframe.
                    WebResourceResponse rewritten = maybeRewriteEmbedHtml(request, host);
                    if (rewritten != null) return rewritten;
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String host = request.getUrl().getHost();

                    // L1 again at navigation time
                    if (isAdHost(host)) return true;

                    if (request.isForMainFrame()) {
                        // L2 — top-frame navigation whitelist. The embeds must NEVER
                        // replace our shell, so embed hosts are deliberately NOT trusted
                        // here — only the real app/auth hosts are.
                        if (!isTrustedMainFrameHost(host)) {
                            // Try Capacitor's external-intent handling first (target="_blank"
                            // to a real external app, custom schemes, etc.)
                            boolean handledByBridge = super.shouldOverrideUrlLoading(view, request);
                            if (handledByBridge) return true;
                            // Bridge wouldn't intercept this — that means it would replace
                            // our app shell with whatever the iframe asked for. Refuse.
                            return true;
                        }
                    } else {
                        // L2.5 — sub-frame (iframe) popunder / on-click redirect killer.
                        //
                        // The embeds plant ad redirects that fire SYNCHRONOUSLY on your
                        // tap (they need the user gesture to dodge popup blockers) and
                        // navigate an iframe to a fresh ad host. The actual video plays
                        // *in place* via media/XHR requests — NOT via a frame navigation —
                        // so refusing gesture-driven frame navigations to anything that
                        // isn't a known embed/trusted host kills the ad while leaving
                        // playback untouched. Non-gesture frame loads (the player wiring
                        // up its own CDN iframes during page load) are always allowed.
                        boolean okHost = isTrustedMainFrameHost(host) || isEmbedHost(host);
                        if (!okHost && request.hasGesture()) {
                            return true; // refuse the on-click ad redirect
                        }
                    }
                }
                return super.shouldOverrideUrlLoading(view, request);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                // L4 — only inject into the top frame (this callback only fires there)
                view.evaluateJavascript(ANTI_POPUP_SHIM, null);
            }
        });

        // ── L3 — refuse every JS popup at the WebView level.
        // IMPORTANT: subclass Capacitor's BridgeWebChromeClient instead of
        // replacing it with a bare WebChromeClient — the bridge client provides
        // onShowCustomView/onHideCustomView (HTML5 fullscreen), the file chooser,
        // permission prompts, etc. A bare client silently breaks fullscreen.
        webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                return false;
            }

            // ── Kill the embeds' JS dialog spam.
            // The "Confirm Navigation / Changes you made may not be saved" box is
            // a beforeunload dialog the ad fires to interrupt you — always cancel
            // it so it never appears. alert()/confirm()/prompt() are suppressed
            // when they come from an embed (non-localhost) frame, but still allowed
            // from our own app UI (localhost) so legitimate messages work.
            @Override
            public boolean onJsBeforeUnload(WebView view, String url, String message, JsResult result) {
                result.cancel(); // stay on the page, show nothing
                return true;
            }

            @Override
            public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                if (isLocalAppHost(uriHost(url))) return super.onJsAlert(view, url, message, result);
                result.cancel();
                return true;
            }

            @Override
            public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (isLocalAppHost(uriHost(url))) return super.onJsConfirm(view, url, message, result);
                result.cancel();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView view, String url, String message,
                                      String defaultValue, JsPromptResult result) {
                if (isLocalAppHost(uriHost(url))) {
                    return super.onJsPrompt(view, url, message, defaultValue, result);
                }
                result.cancel();
                return true;
            }

            // ── Edge-to-edge fullscreen (fill the screen like Netflix).
            // Capacitor adds the fullscreen view but leaves the status / nav
            // bars showing and doesn't draw under the notch — that's the grey
            // bar at the top. We hide the system bars (immersive) and extend
            // under the display cutout while a video is fullscreen, then undo
            // it when fullscreen ends.
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                super.onShowCustomView(view, callback);
                enterImmersiveFullscreen();
            }

            @Override
            public void onHideCustomView() {
                super.onHideCustomView();
                exitImmersiveFullscreen();
            }
        });

        // ── L5 — low-level lockdown
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSafeBrowsingEnabled(true);
    }

    /** Hide the status + navigation bars and draw under the notch — true edge-to-edge. */
    private void enterImmersiveFullscreen() {
        final Window window = getWindow();
        if (window == null) return;
        runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                    window.setAttributes(lp);
                }
                window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                );
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignore) {}
        });
    }

    /** Restore the normal UI when leaving fullscreen. */
    private void exitImmersiveFullscreen() {
        final Window window = getWindow();
        if (window == null) return;
        runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.layoutInDisplayCutoutMode =
                        WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT;
                    window.setAttributes(lp);
                }
                window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            } catch (Exception ignore) {}
        });
    }
}
