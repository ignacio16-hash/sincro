import cron, { ScheduledTask } from "node-cron";
import { runFullSync } from "./sync";

let isRunning = false;
let cronJob: ScheduledTask | null = null;

export function startCronSync() {
  if (cronJob) return;

  // Every 15 minutes
  cronJob = cron.schedule("*/15 * * * *", async () => {
    if (isRunning) {
      console.log("[Cron] Sync already running, skipping");
      return;
    }
    isRunning = true;
    console.log("[Cron] Starting scheduled sync...");
    try {
      const result = await runFullSync();
      console.log(`[Cron] Sync finished: ${result.status} — ${result.synced} SKUs in ${result.duration}ms`);
    } catch (err) {
      console.error("[Cron] Sync error:", err);
    } finally {
      isRunning = false;
    }
  });

  console.log("[Cron] Scheduled sync started (every 15 min)");
}

export function stopCronSync() {
  cronJob?.stop();
  cronJob = null;
}
