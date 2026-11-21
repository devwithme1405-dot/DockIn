package com.dockin.student;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

/**
 * Looks for a new DockIn every few hours, whether the app is open or not, and
 * posts "DockIn update ready" when there is one (see {@link Updater#backgroundCheck}).
 * On Wi-Fi it downloads the update ahead, so tapping Update installs at once.
 */
public class UpdateJob extends JobService {

    private static final int JOB_ID = 4202;
    private static final long EVERY_MS = 3 * 60 * 60 * 1000L;
    private static final long FLEX_MS = 60 * 60 * 1000L;

    /** Starts the check if it isn't scheduled yet. Safe to call often. */
    static void schedule(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, UpdateJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPeriodic(EVERY_MS, FLEX_MS)
                .setPersisted(true)
                .build();
        try {
            js.schedule(job);
        } catch (RuntimeException ignored) {
            // The check still runs every time DockIn opens.
        }
    }

    @Override
    public boolean onStartJob(final JobParameters params) {
        final Context app = getApplicationContext();
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    Updater.backgroundCheck(app);
                } catch (RuntimeException ignored) {
                    // Next run.
                } finally {
                    jobFinished(params, false);
                }
            }
        }, "dockin-update-job").start();
        return true;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return true;
    }
}
