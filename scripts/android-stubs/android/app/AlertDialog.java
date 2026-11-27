package android.app;
import android.content.Context;
import android.content.DialogInterface;
public class AlertDialog implements DialogInterface {
  public static class Builder {
    public Builder(Context c) {}
    public Builder setTitle(CharSequence t) { return this; }
    public Builder setMessage(CharSequence t) { return this; }
    public Builder setPositiveButton(CharSequence t, DialogInterface.OnClickListener l) { return this; }
    public Builder setNegativeButton(CharSequence t, DialogInterface.OnClickListener l) { return this; }
    public Builder setItems(CharSequence[] items, DialogInterface.OnClickListener l) { return this; }
    public Builder setOnCancelListener(DialogInterface.OnCancelListener l) { return this; }
    public AlertDialog show() { return new AlertDialog(); }
  }
}
