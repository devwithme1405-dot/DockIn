package android.app.job;
public class JobScheduler {
  public int schedule(JobInfo j) { return 1; }
  public void cancel(int id) {}
  public JobInfo getPendingJob(int id) { return null; }
}
