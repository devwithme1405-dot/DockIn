package android.print;
public abstract class PrintDocumentAdapter {
  public abstract void onLayout(PrintAttributes oldA, PrintAttributes newA, android.os.CancellationSignal s, LayoutResultCallback cb, android.os.Bundle extras);
  public abstract void onWrite(PageRange[] pages, android.os.ParcelFileDescriptor dest, android.os.CancellationSignal s, WriteResultCallback cb);
  public static abstract class LayoutResultCallback {
    LayoutResultCallback() {}
    public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {}
    public void onLayoutFailed(CharSequence error) {}
    public void onLayoutCancelled() {}
  }
  public static abstract class WriteResultCallback {
    WriteResultCallback() {}
    public void onWriteFinished(PageRange[] pages) {}
    public void onWriteFailed(CharSequence error) {}
    public void onWriteCancelled() {}
  }
}
