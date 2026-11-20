package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * Writes a WebView's print output straight to a PDF file, with no print dialog.
 *
 * It lives in android.print because the two result callbacks only have
 * package-private constructors; this is the usual way apps save a page as PDF.
 */
public final class DockInPdfPrinter {
    public interface Done {
        void ok(File file);

        void fail(String message);
    }

    private DockInPdfPrinter() {}

    public static void print(final PrintDocumentAdapter adapter, final PrintAttributes attrs, final File out, final Done done) {
        adapter.onLayout(null, attrs, null, new PrintDocumentAdapter.LayoutResultCallback() {
            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                final ParcelFileDescriptor fd;
                try {
                    fd = ParcelFileDescriptor.open(out,
                            ParcelFileDescriptor.MODE_CREATE | ParcelFileDescriptor.MODE_TRUNCATE | ParcelFileDescriptor.MODE_READ_WRITE);
                } catch (Exception e) {
                    done.fail("Could not write the PDF.");
                    return;
                }
                adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES}, fd, new CancellationSignal(),
                        new PrintDocumentAdapter.WriteResultCallback() {
                            @Override
                            public void onWriteFinished(PageRange[] pages) {
                                closeQuietly(fd);
                                done.ok(out);
                            }

                            @Override
                            public void onWriteFailed(CharSequence error) {
                                closeQuietly(fd);
                                done.fail(error == null ? "Could not make the PDF." : error.toString());
                            }

                            @Override
                            public void onWriteCancelled() {
                                closeQuietly(fd);
                                done.fail("Making the PDF was cancelled.");
                            }
                        });
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                done.fail(error == null ? "Could not lay out the PDF." : error.toString());
            }

            @Override
            public void onLayoutCancelled() {
                done.fail("Making the PDF was cancelled.");
            }
        }, null);
    }

    private static void closeQuietly(ParcelFileDescriptor fd) {
        try {
            fd.close();
        } catch (Exception ignored) {
            // Already closed.
        }
    }
}
