import cron, { ScheduledTask } from "node-cron";
import { runFullSync, pollAndProcessOrders } from "./sync";

let isSyncRunning = false;
let syncJob: ScheduledTask | null = null;
let ordersJob: ScheduledTask | null = null;

export function startCronSync() {
  if (syncJob && ordersJob) return;

  // Full stock sync every 15 minutes
  if (!syncJob) {
    syncJob = cron.schedule("*/15 * * * *", async () => {
      if (isSyncRunning) {
        console.log("[Cron] Sync already running, skipping");
        return;
      }
      isSyncRunning = true;
      console.log("[Cron] Starting scheduled sync...");
      try {
        const result = await runFullSync();
        console.log(`[Cron] Sync finished: ${result.status} — ${result.synced} SKUs in ${result.duration}ms`);
      } catch (err) {
        console.error("[Cron] Sync error:", err);
      } finally {
        isSyncRunning = false;
      }
    });
    console.log("[Cron] Stock sync scheduled (every 15 min)");
  }

  // Order polling every 2 minutes — detects sales on Ripley (polling mandatory)
  // and Falabella (backup to webhooks) and discounts stock in Bsale.
  if (!ordersJob) {
    ordersJob = cron.schedule("*/2 * * * *", async () => {
      try {
        await pollAndProcessOrders();
      } catch (err) {
        console.error("[Cron] Order polling error:", err);
      }
    });
    console.log("[Cron] Order polling scheduled (every 2 min)");
  }
}

export function stopCronSync() {
  syncJob?.stop();
  syncJob = null;
  ordersJob?.stop();
  ordersJob = null;
}
