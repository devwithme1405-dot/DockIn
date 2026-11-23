package com.dockin.student;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The clock moved on: redraw the widgets (each redraw books the next tick). */
public class WidgetTick extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Widgets.refreshAll(c);
    }
}
