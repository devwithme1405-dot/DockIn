package android.security.keystore;
import java.security.spec.AlgorithmParameterSpec;
public class KeyGenParameterSpec implements AlgorithmParameterSpec {
  public static class Builder {
    public Builder(String alias, int purposes) {}
    public Builder setBlockModes(String... m) { return this; }
    public Builder setEncryptionPaddings(String... p) { return this; }
    public Builder setKeySize(int bits) { return this; }
    public KeyGenParameterSpec build() { return new KeyGenParameterSpec(); }
  }
}
