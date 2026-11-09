package com.dockin.student;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Runs {@link PayHealth#check} every 15 minutes, with DockIn closed. */
public class PayHealthJob extends JobService {
    @Override
    public boolean onStartJob(JobParameters params) {
        try {
            PayHealth.check(getApplicationContext());
        } catch (RuntimeException ignored) {
            // never crash a background check
        }
        return false;
    }

    @Override
    public boolean onStopJob(JobParameters params) {
        return false;
    }
}
