package com.dockin.student;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

import java.util.Calendar;

/**
 * Checks Camu and the LMS about once an hour, whether DockIn is open or not.
 *
 * Android decides the exact moment (it batches jobs to save battery) and only
 * runs this with a network connection. The work itself is {@link College#sync}.
 */
public class CollegeJob extends JobService {

    private static final int JOB_ID = 4201;
    private static final long EVERY_MS = 60 * 60 * 1000L;

    /** Starts the hourly check, or stops it when nothing is connected. Safe to call often. */
    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        boolean wanted = Camu.connected(c) || Lms.connected(c);
        if (!wanted) {
            js.cancel(JOB_ID);
            return;
        }
        if (js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, CollegeJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(EVERY_MS)
                .setPersisted(true)
                .build();
        try {
            js.schedule(job);
        } catch (RuntimeException ignored) {
            // A phone that refuses background jobs still syncs whenever DockIn opens.
        }
    }

    /**
     * The quiet hours when nobody is checking their attendance, so neither are
     * we. A background job that keeps hitting Camu's servers at 3am, night after
     * night, is exactly the kind of clockwork a human never produces — and the
     * easiest pattern to notice. Between 1am and 6am the job wakes, does nothing,
     * and goes back to sleep.
     */
    private static boolean quietHours() {
        int hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        return hour >= 1 && hour < 6;
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        if (quietHours()) {
            jobFinished(params, false);
            return false;
        }
        final Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // A little human slack before the request. Android already
                    // batches these runs, but landing every sync on the same tidy
                    // phase still reads as a machine; a random 0–90s wait blurs it.
                    try {
                        Thread.sleep((long) (Math.random() * 90_000));
                    } catch (InterruptedException ignored) {
                    }
                    College.sync(app, false);
                } finally {
                    jobFinished(params, false);
                }
            }
        }, "dockin-college").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        // Cut short by Android: try again at the next window.
        return true;
    }
}
