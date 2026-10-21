package com.sahrae.entertainment;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

/**
 * Kick-off reminders from the Matchday screen: a notification shortly before a
 * match, delivered by the phone's alarm service so it arrives with Sahrae
 * closed. Inexact on purpose (setAndAllowWhileIdle): exact alarms need a
 * special permission on Android 12+, and a reminder set 15 minutes ahead
 * survives Android delivering it a few minutes late. A restart of the phone
 * clears pending alarms; that is accepted rather than adding a boot receiver.
 */
public class KickoffReminder extends BroadcastReceiver {
    static final String CHANNEL = "kickoff";
    private static final String EXTRA_ID = "id";
    private static final String EXTRA_TITLE = "title";
    private static final String EXTRA_TEXT = "text";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        try {
            int id = intent.getIntExtra(EXTRA_ID, 0);
            String title = intent.getStringExtra(EXTRA_TITLE);
            String text = intent.getStringExtra(EXTRA_TEXT);
            if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return;
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) return;
            ensureChannel(nm);
            Intent open = new Intent(ctx, MainActivity.class)
                .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent tap = PendingIntent.getActivity(ctx, id, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL)
                : new Notification.Builder(ctx);
            b.setSmallIcon(ctx.getApplicationInfo().icon)
                .setContentTitle(title != null ? title : "Kick-off soon")
                .setContentText(text != null ? text : "Open Sahrae to watch live")
                .setAutoCancel(true)
                .setContentIntent(tap);
            if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_HIGH);
            nm.notify(id, b.build());
        } catch (Throwable ignore) {
            // A reminder must never crash anything.
        }
    }

    private static void ensureChannel(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        if (nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Kick-off reminders", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("A notification shortly before a match you asked to be reminded of");
        nm.createNotificationChannel(ch);
    }

    private static PendingIntent pending(Context ctx, int id, String title, String text) {
        Intent i = new Intent(ctx, KickoffReminder.class)
            .putExtra(EXTRA_ID, id)
            .putExtra(EXTRA_TITLE, title)
            .putExtra(EXTRA_TEXT, text);
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Schedule (or reschedule) reminder `id` for `atMs`. False when the time has passed or the alarm service is missing. */
    static boolean schedule(Context ctx, int id, long atMs, String title, String text) {
        if (atMs <= System.currentTimeMillis()) return false;
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return false;
        PendingIntent pi = pending(ctx, id, title, text);
        if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pi);
        else am.set(AlarmManager.RTC_WAKEUP, atMs, pi);
        return true;
    }

    static void cancel(Context ctx, int id) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx, id, null, null));
    }
}
