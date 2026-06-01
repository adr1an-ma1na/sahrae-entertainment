package com.sahrae.entertainment;

import android.os.Bundle;
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
 * Sahrae Entertainment — custom MainActivity that installs an ad-blocking
 * WebViewClient. Every HTTP(S) request the WebView (or any iframe inside it)
 * makes is checked against AD_HOSTS; matches return an empty response so the
 * popunder / tracker scripts never load and cannot trigger redirects, popups,
 * or click-jacks.
 *
 * The list targets the popunder networks commonly used by piracy-adjacent
 * streaming embeds (popads, propellerads, adsterra, exoclick, etc.) plus the
 * major analytics/tracker domains. CDNs and legitimate video infrastructure
 * are deliberately not blocked.
 */
public class MainActivity extends BridgeActivity {

    private static final Set<String> AD_HOSTS = new HashSet<>(Arrays.asList(
        // Popunder / aggressive redirect networks
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

        // Major ad networks
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "googletagmanager.com",
        "googletagservices.com",

        // Trackers / analytics
        "google-analytics.com",
        "scorecardresearch.com",
        "quantserve.com",
        "criteo.com",

        // Content-recommendation chum
        "outbrain.com",
        "taboola.com",
        "mgid.com",
        "revcontent.com",
        "zergnet.com"
    ));

    private static boolean isBlocked(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        // exact match
        if (AD_HOSTS.contains(h)) return true;
        // subdomain match (e.g. "tag.adsterra.com" → block because "adsterra.com" is listed)
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

        // Subclass Capacitor's default WebViewClient so non-blocked requests
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

        // Belt-and-braces: disallow opening file:// from network content, and
        // suppress any "create new window" popup the WebView might honour.
        webView.getSettings().setAllowFileAccessFromFileURLs(false);
        webView.getSettings().setAllowUniversalAccessFromFileURLs(false);
        webView.getSettings().setSupportMultipleWindows(false);
        webView.getSettings().setJavaScriptCanOpenWindowsAutomatically(false);
    }
}
