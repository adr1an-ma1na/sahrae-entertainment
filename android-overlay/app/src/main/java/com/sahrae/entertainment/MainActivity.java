package com.sahrae.entertainment;

import android.os.Bundle;
import android.os.Message;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

import java.io.ByteArrayInputStream;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/**
 * Sahrae Entertainment — Android shell with FIVE LAYERS of pop-up / ad
 * protection. The streaming-embed servers (vidrock, vidzee, vidlink, etc.)
 * monetise by injecting popunder ads via several different mechanisms;
 * each layer blocks one class of attack.
 *
 *  L1 — Network blocklist: shouldInterceptRequest drops any request to a
 *       known ad / popunder / tracker host. Subresource and top-frame.
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

    /** Network-level blocklist of ad/popunder/tracker hosts. */
    private static final Set<String> AD_HOSTS = new HashSet<>(Arrays.asList(
        // Popunder / aggressive redirect networks
        "popads.net","popcash.net","popunder.net","propellerads.com","propu.sh",
        "adsterra.com","ad-maven.com","trafficjunky.net","trafficjunky.com",
        "exoclick.com","exosrv.com","ero-advertising.com","yllix.com",
        "hilltopads.com","clickadu.com","oclasrv.com","onclkds.com","onclickads.net",
        "onclickperformance.com","trafficstars.com","trafficfactory.biz",
        "runative.com","ranatv.com","juicyads.com","go2cloud.org","go2affise.com",
        "admixer.net","clksite.com","oktrkme.com","historyoftrust.com","adcash.com",
        "airpush.com","popmyads.com","popunderjs.com","popmonster.net","validclick.com",
        "voluumtrk.com","voluumtrk2.com","voluumtrk3.com","evadav.com","vrtzads.com",
        "highperformancecpm.com","highperformanceformat.com","smartclickexpress.com",
        // Major ad networks
        "doubleclick.net","googlesyndication.com","googleadservices.com",
        "googletagmanager.com","googletagservices.com","amazon-adsystem.com",
        "adnxs.com","rubiconproject.com","openx.net","pubmatic.com","bidswitch.net",
        // Trackers / analytics
        "google-analytics.com","scorecardresearch.com","quantserve.com","criteo.com",
        "chartbeat.com","newrelic.com",
        // Content-recommendation chum
        "outbrain.com","taboola.com","mgid.com","revcontent.com","zergnet.com","nativeads.com",
        // Adult popunder redirect targets piracy embeds commonly use
        "chaturbate.com","livejasmin.com","bongacams.com","stripchat.com","camsoda.com"
    ));

    private static boolean isAdHost(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        if (AD_HOSTS.contains(h)) return true;
        for (String bad : AD_HOSTS) {
            if (h.endsWith("." + bad)) return true;
        }
        return false;
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
          // Rewrite any <a target=_blank> to target=_self at click time so they go through " +
          // Capacitor's normal nav path (which our WebViewClient then arbitrates).
          "document.addEventListener('click',function(e){" +
            "var n=e.target;while(n&&n!==document){if(n.tagName==='A'&&(n.target==='_blank'||n.target==='_top')){n.target='_self';}n=n.parentNode;}" +
          "},true);" +
        "}catch(err){}})();";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Bridge bridge = this.bridge;
        final WebView webView = bridge.getWebView();

        // ── L1 + L2 — custom WebViewClient
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null && isAdHost(request.getUrl().getHost())) {
                    return new WebResourceResponse(
                        "text/plain", "utf-8",
                        new ByteArrayInputStream(new byte[0])
                    );
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null) {
                    String host = request.getUrl().getHost();

                    // L1 again at navigation time
                    if (isAdHost(host)) return true;

                    // L2 — top-frame navigation whitelist
                    if (request.isForMainFrame() && !isTrustedMainFrameHost(host)) {
                        // Try Capacitor's external-intent handling first (target="_blank"
                        // to a real external app, custom schemes, etc.)
                        boolean handledByBridge = super.shouldOverrideUrlLoading(view, request);
                        if (handledByBridge) return true;
                        // Bridge wouldn't intercept this — that means it would replace
                        // our app shell with whatever the iframe asked for. Refuse.
                        return true;
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

        // ── L3 — refuse every JS popup at the WebView level
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                return false;
            }
        });

        // ── L5 — low-level lockdown
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSafeBrowsingEnabled(true);
    }
}
