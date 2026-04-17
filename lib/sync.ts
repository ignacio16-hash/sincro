import { prisma } from "./db";
import {
  getAllBsaleSkus,
  consumeBsaleStock,
  getBsaleStockByVariantId,
  resolveSkuToVariantId,
} from "./bsale";
import { batchUpdateParisStock } from "./paris";
import { batchUpdateFalabellaStock, getFalabellaOrders } from "./falabella";
import { batchUpdateRipleyStock, getPendingRipleyOrders } from "./ripley";

export type Platform = "paris" | "falabella" | "ripley";

export interface SyncProgressEvent {
  stage: string;
  message: string;
  percent: number;
  status?: "ok" | "error" | "partial" | "skipped";
}

async function getCredentials(platform: string) {
  const cred = await prisma.apiCredential.findUnique({ where: { platform } });
  if (!cred || !cred.isActive) return null;
  return cred.config as Record<string, string>;
}

// Build a human-readable summary of failed SKUs for log messages
function failedSummary(failed: string[]): string {
  if (failed.length === 0) return "";
  const preview = failed.slice(0, 8).join(", ");
  const extra = failed.length > 8 ? ` (+${failed.length - 8} más)` : "";
  return ` — fallaron: ${preview}${extra}`;
}

export async function runFullSync(
  onProgress?: (event: SyncProgressEvent) => void
): Promise<{
  status: string;
  synced: number;
  errors: string[];
  duration: number;
}> {
  const start = Date.now();
  const errors: string[] = [];
  let synced = 0;

  onProgress?.({ stage: "init", message: "Iniciando sincronización...", percent: 0 });

  const bsaleCreds = await getCredentials("bsale");
  if (!bsaleCreds?.accessToken) {
    await logSync("full_sync", "all", "error", "Bsale no configurado");
    onProgress?.({ stage: "bsale", message: "Bsale no configurado", percent: 100, status: "error" });
    return { status: "error", synced: 0, errors: ["Bsale no configurado"], duration: 0 };
  }

  let skus: { sku: string; variantId: number; name: string; stock: number }[] = [];
  try {
    onProgress?.({ stage: "bsale", message: "Cargando SKUs de Bsale...", percent: 5 });
    const officeId = bsaleCreds.officeId ? parseInt(bsaleCreds.officeId) : undefined;
    skus = await getAllBsaleSkus(bsaleCreds.accessToken, officeId);
    onProgress?.({ stage: "bsale", message: `${skus.length} SKUs cargados de Bsale`, percent: 20, status: "ok" });
  } catch (e) {
    const msg = `Error obteniendo SKUs de Bsale: ${(e as Error).message}`;
    errors.push(msg);
    await logSync("full_sync", "bsale", "error", msg);
    onProgress?.({ stage: "bsale", message: msg, percent: 100, status: "error" });
    return { status: "error", synced: 0, errors, duration: Date.now() - start };
  }

  // Persist stock items in DB
  for (const item of skus) {
    await prisma.stockItem.upsert({
      where: { sku: item.sku },
      update: {
        bsaleStock: item.stock,
        bsaleVariantId: String(item.variantId),
        name: item.name,
        lastSyncAt: new Date(),
      },
      create: {
        sku: item.sku,
        name: item.name,
        bsaleStock: item.stock,
        bsaleVariantId: String(item.variantId),
        lastSyncAt: new Date(),
      },
    });
  }

  const stockItems = skus.map((s) => ({ sku: s.sku, quantity: s.stock }));
  synced = stockItems.length;

  // Sync Paris
  const parisCreds = await getCredentials("paris");
  if (parisCreds?.apiKey && parisCreds?.sellerId && parisCreds?.baseUrl) {
    onProgress?.({ stage: "paris", message: "Sincronizando Paris...", percent: 30 });
    try {
      const result = await batchUpdateParisStock(
        parisCreds.apiKey,
        parisCreds.sellerId,
        parisCreds.baseUrl,
        stockItems
      );
      const st = result.failed.length === 0 ? "success" : "partial";
      const msg = `${result.success.length} ok, ${result.failed.length} fallaron${failedSummary(result.failed)}`;
      await logSync("full_sync", "paris", st, msg,
        result.failed.length > 0 ? { failed: result.failed } : undefined);
      onProgress?.({ stage: "paris", message: `Paris: ${msg}`, percent: 45, status: result.failed.length === 0 ? "ok" : "partial" });
      if (result.failed.length > 0) errors.push(`Paris: ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Paris: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "paris", "error", msg);
      onProgress?.({ stage: "paris", message: msg, percent: 45, status: "error" });
    }
  } else {
    onProgress?.({ stage: "paris", message: "Paris: no configurado", percent: 45, status: "skipped" });
  }

  // Sync Falabella
  const falabellaCreds = await getCredentials("falabella");
  if (falabellaCreds?.apiKey && falabellaCreds?.userId) {
    onProgress?.({ stage: "falabella", message: "Sincronizando Falabella...", percent: 50 });
    try {
      const result = await batchUpdateFalabellaStock(
        falabellaCreds.apiKey,
        falabellaCreds.userId,
        stockItems,
        falabellaCreds.country || "CL"
      );
      const st = result.failed.length === 0 ? "success" : "partial";
      const msg = `${result.success.length} ok, ${result.failed.length} fallaron${failedSummary(result.failed)}`;
      await logSync("full_sync", "falabella", st, msg,
        result.failed.length > 0 ? { failed: result.failed } : undefined);
      onProgress?.({ stage: "falabella", message: `Falabella: ${msg}`, percent: 70, status: result.failed.length === 0 ? "ok" : "partial" });
      if (result.failed.length > 0) errors.push(`Falabella: ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Falabella: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "falabella", "error", msg);
      onProgress?.({ stage: "falabella", message: msg, percent: 70, status: "error" });
    }
  } else {
    onProgress?.({ stage: "falabella", message: "Falabella: no configurado", percent: 70, status: "skipped" });
  }

  // Sync Ripley
  const ripleyCreds = await getCredentials("ripley");
  if (ripleyCreds?.apiKey && ripleyCreds?.instanceUrl) {
    onProgress?.({ stage: "ripley", message: "Sincronizando Ripley...", percent: 75 });
    try {
      const result = await batchUpdateRipleyStock(
        ripleyCreds.apiKey,
        ripleyCreds.instanceUrl,
        stockItems
      );
      const st = result.failed.length === 0 ? "success" : "partial";
      const msg = `${result.success.length} ok, ${result.failed.length} fallaron${failedSummary(result.failed)}`;
      await logSync("full_sync", "ripley", st, msg,
        result.failed.length > 0 ? { failed: result.failed } : undefined);
      onProgress?.({ stage: "ripley", message: `Ripley: ${msg}`, percent: 92, status: result.failed.length === 0 ? "ok" : "partial" });
      if (result.failed.length > 0) errors.push(`Ripley: ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Ripley: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "ripley", "error", msg);
      onProgress?.({ stage: "ripley", message: msg, percent: 92, status: "error" });
    }
  } else {
    onProgress?.({ stage: "ripley", message: "Ripley: no configurado", percent: 92, status: "skipped" });
  }

  const duration = Date.now() - start;
  const overallStatus = errors.length === 0 ? "success" : errors.length < 3 ? "partial" : "error";
  await logSync("full_sync", "all", overallStatus,
    `Sync completado: ${synced} SKUs en ${(duration / 1000).toFixed(1)}s`, { errors, synced }, duration);

  onProgress?.({
    stage: "done",
    message: `Sync completado: ${synced} SKUs en ${(duration / 1000).toFixed(1)}s`,
    percent: 100,
    status: overallStatus === "success" ? "ok" : overallStatus === "partial" ? "partial" : "error",
  });

  return { status: overallStatus, synced, errors, duration };
}

// Poll all marketplaces for new orders and discount stock in Bsale.
// Ripley/Mirakl doesn't push webhooks to sellers → polling is mandatory.
// Falabella polling serves as a backup to webhooks.
export async function pollAndProcessOrders(): Promise<void> {
  // --- Ripley ---
  const ripleyCreds = await getCredentials("ripley");
  if (ripleyCreds?.apiKey && ripleyCreds?.instanceUrl) {
    try {
      const orders = await getPendingRipleyOrders(ripleyCreds.apiKey, ripleyCreds.instanceUrl);
      for (const order of orders) {
        // Skip if already processed (deduplication)
        const exists = await prisma.syncEvent.findFirst({
          where: { orderId: order.orderId, sku: order.sku, source: "ripley" },
        });
        if (!exists) {
          await handleMarketplaceOrder("ripley", order.sku, order.quantity, order.orderId);
        }
      }
    } catch (e) {
      console.error("[Orders] Ripley polling error:", (e as Error).message);
    }
  }

  // --- Falabella ---
  const falabellaCreds = await getCredentials("falabella");
  if (falabellaCreds?.apiKey && falabellaCreds?.userId) {
    try {
      // Look back 30 minutes to catch any orders missed since last poll
      const since = new Date(Date.now() - 30 * 60 * 1000)
        .toISOString()
        .replace(/\.\d+Z$/, "+00:00");
      const orders = await getFalabellaOrders(
        falabellaCreds.apiKey,
        falabellaCreds.userId,
        since,
        falabellaCreds.country || "CL"
      );
      for (const order of orders) {
        const exists = await prisma.syncEvent.findFirst({
          where: { orderId: order.orderId, sku: order.sku, source: "falabella" },
        });
        if (!exists) {
          await handleMarketplaceOrder("falabella", order.sku, order.quantity, order.orderId);
        }
      }
    } catch (e) {
      console.error("[Orders] Falabella polling error:", (e as Error).message);
    }
  }
}

// Called when a marketplace receives an order → discount from Bsale
export async function handleMarketplaceOrder(
  platform: Platform,
  sku: string,
  quantity: number,
  orderId: string
): Promise<void> {
  const bsaleCreds = await getCredentials("bsale");
  if (!bsaleCreds?.accessToken) throw new Error("Bsale no configurado");

  // Resolve SKU to variantId if not cached
  let stockItem = await prisma.stockItem.findUnique({ where: { sku } });

  if (!stockItem?.bsaleVariantId) {
    const variantId = await resolveSkuToVariantId(bsaleCreds.accessToken, sku);
    if (!variantId) throw new Error(`SKU ${sku} no encontrado en Bsale`);

    stockItem = await prisma.stockItem.upsert({
      where: { sku },
      update: { bsaleVariantId: String(variantId) },
      create: { sku, bsaleVariantId: String(variantId), bsaleStock: 0 },
    });
  }

  const variantId = parseInt(stockItem.bsaleVariantId!);
  const previousQty = stockItem.bsaleStock;

  // Use Bsale stock consumption endpoint (correct way to discount stock)
  await consumeBsaleStock(
    bsaleCreds.accessToken,
    variantId,
    quantity,
    bsaleCreds.officeId ? parseInt(bsaleCreds.officeId) : undefined,
    `Venta ${platform} orden ${orderId}`
  );

  const newQty = Math.max(0, previousQty - quantity);
  await prisma.stockItem.update({
    where: { sku },
    data: { bsaleStock: newQty },
  });

  await prisma.syncEvent.create({
    data: {
      source: platform,
      eventType: "order",
      sku,
      quantity,
      previousQty,
      newQty,
      orderId,
      processed: true,
    },
  });

  await logSync("webhook", platform, "success",
    `Orden ${orderId}: ${sku} -${quantity} (${previousQty} → ${newQty})`);
}

// Called when Bsale webhook fires for a stock change
// NOTE: Bsale webhook does NOT include the new quantity in the payload.
// We receive variantId + officeId, then must fetch the current quantity.
export async function handleBsaleStockChange(
  variantId: number,
  officeId: number,
  accessToken: string
): Promise<void> {
  // Fetch the actual current stock from Bsale
  const stockItems = await getBsaleStockByVariantId(
    accessToken,
    variantId,
    officeId || undefined
  );

  // Sum all offices or use the specific one
  const newQty = officeId
    ? stockItems.find((s) => String(s.office.id) === String(officeId))?.quantityAvailable ?? 0
    : stockItems.reduce((sum, s) => sum + (s.quantityAvailable || 0), 0);

  // Find stockItem by variantId
  const stockItem = await prisma.stockItem.findFirst({
    where: { bsaleVariantId: String(variantId) },
  });

  if (!stockItem) {
    // Unknown variant, skip
    return;
  }

  await prisma.stockItem.update({
    where: { sku: stockItem.sku },
    data: { bsaleStock: newQty, lastSyncAt: new Date() },
  });

  const updatedItem = [{ sku: stockItem.sku, quantity: newQty }];

  // Push updated stock to all marketplaces
  const parisCreds = await getCredentials("paris");
  if (parisCreds?.apiKey && parisCreds?.sellerId && parisCreds?.baseUrl) {
    await batchUpdateParisStock(
      parisCreds.apiKey, parisCreds.sellerId, parisCreds.baseUrl, updatedItem
    ).catch(() => {});
  }

  const falabellaCreds = await getCredentials("falabella");
  if (falabellaCreds?.apiKey && falabellaCreds?.userId) {
    await batchUpdateFalabellaStock(
      falabellaCreds.apiKey, falabellaCreds.userId, updatedItem, falabellaCreds.country || "CL"
    ).catch(() => {});
  }

  const ripleyCreds = await getCredentials("ripley");
  if (ripleyCreds?.apiKey && ripleyCreds?.instanceUrl) {
    await batchUpdateRipleyStock(
      ripleyCreds.apiKey, ripleyCreds.instanceUrl, updatedItem
    ).catch(() => {});
  }

  await logSync("webhook", "bsale", "success",
    `Stock actualizado: ${stockItem.sku} → ${newQty}`);
}

async function logSync(
  type: string,
  platform: string,
  status: string,
  message: string,
  details?: object,
  duration?: number
) {
  await prisma.syncLog.create({
    data: { type, platform, status, message, details, duration },
  });
}
