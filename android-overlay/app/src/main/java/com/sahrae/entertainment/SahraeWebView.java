package com.sahrae.entertainment;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

import com.getcapacitor.CapacitorWebView;

/**
 * Capacitor's WebView, which keeps playing music when Sahrae leaves the screen.
 *
 * When the app goes to the background Android tells the WebView its window is
 * hidden, and the web engine then pauses any video in the page itself, which
 * is how the songs (played through YouTube's player) stopped in other apps
 * even with the media service running (owner, 2026-11-03). While a song or
 * podcast plays (MainActivity.keepPlayerAwake), that "hidden" is held back,
 * so the page carries on as if on screen; once playback stops, the page is
 * told it is hidden after all, so nothing runs in the background for nothing.
 */
public class SahraeWebView extends CapacitorWebView {
    /** Set while Sauti is playing. */
    static volatile boolean sKeepPlaying = false;

    public SahraeWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (visibility != View.VISIBLE && sKeepPlaying) {
            MainActivity.bgLog("Android said the window is hidden: held back, the song carries on");
            return;
        }
        super.onWindowVisibilityChanged(visibility);
    }
}
