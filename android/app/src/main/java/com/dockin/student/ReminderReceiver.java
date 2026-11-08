package com.dockin.student;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** When a scheduled reminder fires, post it as a notification. A tap opens the
 * screen it names (the timetable, tasks, attendance). */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        String title = intent.getStringExtra("title");
        if (title == null) return;
        String body = intent.getStringExtra("body");
        String path = intent.getStringExtra("path");
        College.post(c, 20_000 + intent.getIntExtra("id", 0), title, body, path == null ? "/" : path);
    }
}
