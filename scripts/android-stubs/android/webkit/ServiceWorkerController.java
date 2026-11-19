package android.webkit;
public abstract class ServiceWorkerController {
  public static ServiceWorkerController getInstance() { return null; }
  public abstract void setServiceWorkerClient(ServiceWorkerClient c);
}
