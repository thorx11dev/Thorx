/**
 * Shared registry of background-job timers.
 *
 * Every startXxxJob() in server/jobs registers its setTimeout/setInterval
 * handles here via trackTimeout()/trackInterval(). gracefulShutdown() in
 * server/index.ts calls stopBackgroundJobs() BEFORE pool.end(), so a job can
 * never fire after the pg pool has been closed.
 *
 * Before this registry existed, only the HilltopAds scheduler was stopped on
 * shutdown; the hourly inactivity sweep (and other intervals) kept running
 * during the drain window and logged hundreds of "Cannot use a pool after
 * calling end on the pool" errors on every platform sleep/SIGTERM (observed
 * on SnapDeploy free tier, 2026-08-12 — the sweep was mid-flight when the
 * container went to sleep).
 */

const intervalHandles = new Set<ReturnType<typeof setInterval>>();
const timeoutHandles = new Set<ReturnType<typeof setTimeout>>();

export function trackInterval(handle: ReturnType<typeof setInterval>): ReturnType<typeof setInterval> {
  intervalHandles.add(handle);
  return handle;
}

export function trackTimeout(handle: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout> {
  timeoutHandles.add(handle);
  return handle;
}

export function stopBackgroundJobs(): void {
  for (const handle of intervalHandles) clearInterval(handle);
  for (const handle of timeoutHandles) clearTimeout(handle);
  intervalHandles.clear();
  timeoutHandles.clear();
}
