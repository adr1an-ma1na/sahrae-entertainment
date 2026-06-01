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
 * Sahrae Entertainment — Android shell with multi-layer pop-up/ad protection.
 *
 *  Layer A: a custom WebViewClient blocks network requests to known ad /
 *           popunder / tracker domains. Even if a streaming embed's JS slips
 *           past the renderer, the ad scripts/tracker beacons cannot load.
 *
 *  Layer B: a custom WebChromeClient refuses every JavaScript-initiated
 *           popup (window.open, target=_blank-without-user-gesture, etc.)
 *           at the WebView level — this is what kills the "click anywhere
 *           and a new tab/app opens" pattern that the piracy embed servers
 *           use, regardless of which ad host they're routed to.
 *
 *  Layer C: low-level WebSettings tightening so JS can't bypass the above
 *           via background window creation.
 *
 *  Note: we deliberately do NOT set iframe sandbox attributes on the player
 *  iframe — VidZee/VidRock/VidLink etc. explicitly refuse to play in any
 *  sandboxed context and display a "Sandbox Not Allowed" interstitial. The
 *  three layers above replace the protection sandbox would have given.
 */
public class MainActivity extends BridgeActivity {

    private static final Set<String> AD_HOSTS = new HashSet<>(Arrays.asList(
        // Popunder / aggressive redirect networks (the heart of piracy-embed monetisation)
        "popads.net",
        "popcash.net",
        "popunder.net",
        "propellerads.com",
        "propu.sh",
        "adsterra.com",
        "ad-maven.com",
        "trafficjunky.net",
        "trafficjunky.com",
        "exoclick.com",
        "exosrv.com",
        "ero-advertising.com",
        "yllix.com",
        "hilltopads.com",
        "clickadu.com",
        "oclasrv.com",
        "onclkds.com",
        "onclickads.net",
        "onclickperformance.com",
        "trafficstars.com",
        "trafficfactory.biz",
        "runative.com",
        "ranatv.com",
        "juicyads.com",
        "go2cloud.org",
        "go2affise.com",
        "admixer.net",
        "clksite.com",
        "oktrkme.com",
        "historyoftrust.com",
        "adcash.com",
        "airpush.com",
        "popmyads.com",
        "popunderjs.com",
        "popmonster.net",
        "validclick.com",
        "voluumtrk.com",
        "voluumtrk2.com",
        "voluumtrk3.com",
        "evadav.com",
        "vrtzads.com",
        "highperformancecpm.com",
        "highperformanceformat.com",
        "smartclickexpress.com",

        // Major ad networks
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "googletagmanager.com",
        "googletagservices.com",
        "amazon-adsystem.com",
        "adnxs.com",
        "rubiconproject.com",
        "openx.net",
        "pubmatic.com",
        "bidswitch.net",

        // Trackers / analytics
        "google-analytics.com",
        "scorecardresearch.com",
        "quantserve.com",
        "criteo.com",
        "chartbeat.com",
        "newrelic.com",

        // Content-recommendation chum
        "outbrain.com",
        "taboola.com",
        "mgid.com",
        "revcontent.com",
        "zergnet.com",
        "nativeads.com",

        // Adult popunder targets piracy embeds commonly redirect to
        "chaturbate.com",
        "livejasmin.com",
        "bongacams.com",
        "stripchat.com",
        "camsoda.com"
    ));

    private static boolean isBlocked(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        if (AD_HOSTS.contains(h)) return true;
        for (String bad : AD_HOSTS) {
            if (h.endsWith("." + bad)) return true;
        }
        return false;
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final Bridge bridge = this.bridge;
        WebView webView = bridge.getWebView();

        // ── Layer A: subclass Capacitor's WebViewClient so non-blocked requests
        // still flow through its bridge handling (file:// loading, JS messages).
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null && isBlocked(request.getUrl().getHost())) {
                    return new WebResourceResponse(
                        "text/plain",
                        "utf-8",
                        new ByteArrayInputStream(new byte[0])
                    );
                }
                return super.shouldInterceptRequest(view, request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (request != null && request.getUrl() != null && isBlocked(request.getUrl().getHost())) {
                    return true; // swallow the navigation entirely
                }
                return super.shouldOverrideUrlLoading(view, request);
            }
        });

        // ── Layer B: refuse every JS-initiated popup at the WebChromeClient level.
        // Returning false from onCreateWindow tells the WebView "no, you may not
        // open a new window," regardless of which target URL the JS asked for.
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog,
                                          boolean isUserGesture, Message resultMsg) {
                // Even if the click came from a user gesture, we refuse — piracy
                // embed servers fake "user gestures" by binding global click handlers.
                return false;
            }
        });

        // ── Layer C: low-level lockdown.
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
        webView.getSettings().setSafeBrowsingEnabled(true);
    }
}
