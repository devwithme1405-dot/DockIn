/**
 * Runs `start` only while the app is on screen. When the app goes to the
 * background it waits `graceMs` (a quick app switch keeps everything live),
 * then calls the stop function `start` returned. Coming back starts it again,
 * after any stop still in progress has finished.
 *
 * Realtime channels use this so a phone in someone's pocket doesn't hold a
 * websocket open: the server's concurrent-connection limit then counts the
 * people actually using DockIn, not everyone who ever opened it. Whatever was
 * missed while away is caught up by the pull that runs when the app returns.
 */
export function whileVisible(
  start: () => (() => unknown) | void,
  graceMs = 30_000,
): () => void {
  if (typeof document === "undefined") return () => {};
  let stop: (() => unknown) | null = null;
  let stopping: Promise<unknown> = Promise.resolve();
  let timer: number | undefined;
  let wanted = false;
  let alive = true;

  const halt = () => {
    wanted = false;
    const s = stop;
    stop = null;
    if (s) {
      try {
        stopping = Promise.resolve(s()).catch(() => {});
      } catch {
        stopping = Promise.resolve();
      }
    }
  };

  const up = () => {
    window.clearTimeout(timer);
    if (wanted) return;
    wanted = true;
    void stopping.then(() => {
      if (!alive || !wanted || stop) return;
      try {
        stop = start() || null;
      } catch {
        stop = null;
      }
    });
  };

  const down = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(halt, graceMs);
  };

  const onChange = () =>
    document.visibilityState === "hidden" ? down() : up();
  document.addEventListener("visibilitychange", onChange);
  if (document.visibilityState === "hidden") down();
  else up();

  return () => {
    alive = false;
    document.removeEventListener("visibilitychange", onChange);
    window.clearTimeout(timer);
    halt();
  };
}
