package com.dockin.student;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

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

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
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
