import cron, { ScheduledTask } from "node-cron";
import { runFullSync, pollAndProcessOrders, refreshBsaleCatalog } from "./sync";

let isSyncRunning = false;
let isCatalogRefreshing = false;
let syncJob: ScheduledTask | null = null;
let ordersJob: ScheduledTask | null = null;
let catalogJob: ScheduledTask | null = null;

export function startCronSync() {
  if (syncJob && ordersJob && catalogJob) return;

  // Catalog refresh: 9 AM y 6 PM hora Chile continental (America/Santiago)
  // Recalcula Bsale SKUs + matching Falabella/Ripley. Base de verdad para el sync.
  if (!catalogJob) {
    catalogJob = cron.schedule(
      "0 9,18 * * *",
      async () => {
        if (isCatalogRefreshing) {
          console.log("[Cron] Catalog refresh already running, skipping");
          return;
        }
        isCatalogRefreshing = true;
        console.log("[Cron] Starting Bsale catalog refresh...");
        try {
          const result = await refreshBsaleCatalog();
          console.log(`[Cron] Catalog refreshed: ${result.status} — ${result.bsaleCount} Bsale, ${result.matched.falabella} Falabella, ${result.matched.ripley} Ripley`);
        } catch (err) {
          console.error("[Cron] Catalog refresh error:", err);
        } finally {
          isCatalogRefreshing = false;
        }
      },
      { timezone: "America/Santiago" }
    );
    console.log("[Cron] Bsale catalog refresh scheduled (9 AM y 6 PM Santiago)");
  }

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
  catalogJob?.stop();
  catalogJob = null;
}
