import { prisma } from "./db";
import {
  getAllBsaleSkus,
  consumeBsaleStock,
  getBsaleStockByVariantId,
  resolveSkuToVariantId,
} from "./bsale";
import { batchUpdateParisStock } from "./paris";
import { batchUpdateFalabellaStock } from "./falabella";
import { batchUpdateRipleyStock } from "./ripley";

export type Platform = "paris" | "falabella" | "ripley";

async function getCredentials(platform: string) {
  const cred = await prisma.apiCredential.findUnique({ where: { platform } });
  if (!cred || !cred.isActive) return null;
  return cred.config as Record<string, string>;
}

export async function runFullSync(): Promise<{
  status: string;
  synced: number;
  errors: string[];
  duration: number;
}> {
  const start = Date.now();
  const errors: string[] = [];
  let synced = 0;

  const bsaleCreds = await getCredentials("bsale");
  if (!bsaleCreds?.accessToken) {
    await logSync("full_sync", "all", "error", "Bsale no configurado");
    return { status: "error", synced: 0, errors: ["Bsale no configurado"], duration: 0 };
  }

  let skus: { sku: string; variantId: number; name: string; stock: number }[] = [];
  try {
    const officeId = bsaleCreds.officeId ? parseInt(bsaleCreds.officeId) : undefined;
    skus = await getAllBsaleSkus(bsaleCreds.accessToken, officeId);
  } catch (e) {
    const msg = `Error obteniendo SKUs de Bsale: ${(e as Error).message}`;
    errors.push(msg);
    await logSync("full_sync", "bsale", "error", msg);
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
    try {
      const result = await batchUpdateParisStock(
        parisCreds.apiKey,
        parisCreds.sellerId,
        parisCreds.baseUrl,
        stockItems
      );
      const status = result.failed.length === 0 ? "success" : "partial";
      await logSync("full_sync", "paris", status,
        `${result.success.length} ok, ${result.failed.length} fallaron`);
      if (result.failed.length > 0) errors.push(`Paris: ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Paris: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "paris", "error", msg);
    }
  }

  // Sync Falabella
  const falabellaCreds = await getCredentials("falabella");
  if (falabellaCreds?.apiKey && falabellaCreds?.userId) {
    try {
      const result = await batchUpdateFalabellaStock(
        falabellaCreds.apiKey,
        falabellaCreds.userId,
        stockItems,
        falabellaCreds.country || "CL"
      );
      const status = result.failed.length === 0 ? "success" : "partial";
      await logSync("full_sync", "falabella", status,
        `${result.success.length} ok, ${result.failed.length} fallaron`);
      if (result.failed.length > 0) errors.push(`Falabella: ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Falabella: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "falabella", "error", msg);
    }
  }

  // Sync Ripley
  const ripleyCreds = await getCredentials("ripley");
  if (ripleyCreds?.apiKey && ripleyCreds?.instanceUrl) {
    try {
      const result = await batchUpdateRipleyStock(
        ripleyCreds.apiKey,
        ripleyCreds.instanceUrl,
        stockItems
      );
      const status = result.failed.length === 0 ? "success" : "partial";
      await logSync("full_sync", "ripley", status,
        `${result.success.length} ok, ${result.failed.length} fallaron`);
      if (result.failed.length > 0) errors.push(`Ripley: ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Ripley: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "ripley", "error", msg);
    }
  }

  const duration = Date.now() - start;
  const overallStatus = errors.length === 0 ? "success" : errors.length < 3 ? "partial" : "error";
  await logSync("full_sync", "all", overallStatus,
    `Sync completado: ${synced} SKUs`, { errors, synced }, duration);

  return { status: overallStatus, synced, errors, duration };
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
