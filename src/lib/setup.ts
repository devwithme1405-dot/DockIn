/** Set once the setup screen has been seen, so it is never forced on anyone twice. */
export const SETUP_KEY = "dockin-setup-v1";

export function setupSeen(): boolean {
  try {
    return localStorage.getItem(SETUP_KEY) === "1";
  } catch {
    return true;
  }
}

export function markSetupSeen(): void {
  try {
    localStorage.setItem(SETUP_KEY, "1");
  } catch {}
}
