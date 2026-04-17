import { prisma } from "./db";
import { getAllBsaleSkus, discountBsaleStock } from "./bsale";
import { batchUpdateParisStock } from "./paris";
import { batchUpdateFalabellaStock } from "./falabella";
import { batchUpdateRipleyStock } from "./ripley";

export type Platform = "paris" | "falabella" | "ripley";

async function getCredentials(platform: string) {
  const cred = await prisma.apiCredential.findUnique({
    where: { platform },
  });
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
    await logSync("full_sync", "all", "error", "Bsale credentials not configured");
    return { status: "error", synced: 0, errors: ["Bsale no configurado"], duration: 0 };
  }

  let skus: { sku: string; variantId: number; name: string; stock: number }[] = [];
  try {
    skus = await getAllBsaleSkus(bsaleCreds.accessToken);
  } catch (e) {
    const msg = `Error obteniendo SKUs de Bsale: ${(e as Error).message}`;
    errors.push(msg);
    await logSync("full_sync", "bsale", "error", msg);
    return { status: "error", synced: 0, errors, duration: Date.now() - start };
  }

  // Update DB stock items
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
  if (parisCreds?.apiKey && parisCreds?.sellerId) {
    try {
      const result = await batchUpdateParisStock(
        parisCreds.apiKey,
        parisCreds.sellerId,
        stockItems
      );
      if (result.failed.length > 0) {
        errors.push(`Paris: ${result.failed.length} SKUs fallaron`);
      }
      await logSync("full_sync", "paris", result.failed.length === 0 ? "success" : "partial",
        `${result.success.length} ok, ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Paris sync error: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "paris", "error", msg);
    }
  }

  // Sync Falabella
  const falabellaCreds = await getCredentials("falabella");
  if (falabellaCreds?.apiKey && falabellaCreds?.sellerId) {
    try {
      const result = await batchUpdateFalabellaStock(
        falabellaCreds.apiKey,
        falabellaCreds.sellerId,
        stockItems
      );
      if (result.failed.length > 0) {
        errors.push(`Falabella: ${result.failed.length} SKUs fallaron`);
      }
      await logSync("full_sync", "falabella", result.failed.length === 0 ? "success" : "partial",
        `${result.success.length} ok, ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Falabella sync error: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "falabella", "error", msg);
    }
  }

  // Sync Ripley
  const ripleyCreds = await getCredentials("ripley");
  if (ripleyCreds?.apiKey) {
    try {
      const result = await batchUpdateRipleyStock(ripleyCreds.apiKey, stockItems);
      if (result.failed.length > 0) {
        errors.push(`Ripley: ${result.failed.length} SKUs fallaron`);
      }
      await logSync("full_sync", "ripley", result.failed.length === 0 ? "success" : "partial",
        `${result.success.length} ok, ${result.failed.length} fallaron`);
    } catch (e) {
      const msg = `Ripley sync error: ${(e as Error).message}`;
      errors.push(msg);
      await logSync("full_sync", "ripley", "error", msg);
    }
  }

  const duration = Date.now() - start;
  const status = errors.length === 0 ? "success" : errors.length < 3 ? "partial" : "error";

  await logSync("full_sync", "all", status, `Sync completado: ${synced} SKUs`, {
    errors,
    synced,
  }, duration);

  return { status, synced, errors, duration };
}

export async function handleMarketplaceOrder(
  platform: Platform,
  sku: string,
  quantity: number,
  orderId: string
): Promise<void> {
  const bsaleCreds = await getCredentials("bsale");
  if (!bsaleCreds?.accessToken) throw new Error("Bsale no configurado");

  const stockItem = await prisma.stockItem.findUnique({ where: { sku } });
  if (!stockItem?.bsaleVariantId) throw new Error(`SKU ${sku} no encontrado en Bsale`);

  const previousQty = stockItem.bsaleStock;
  const result = await discountBsaleStock(
    bsaleCreds.accessToken,
    parseInt(stockItem.bsaleVariantId),
    quantity
  );

  await prisma.stockItem.update({
    where: { sku },
    data: { bsaleStock: result.newQty },
  });

  await prisma.syncEvent.create({
    data: {
      source: platform,
      eventType: "order",
      sku,
      quantity,
      previousQty,
      newQty: result.newQty,
      orderId,
      processed: true,
    },
  });

  await logSync("webhook", platform, "success",
    `Orden ${orderId}: ${sku} -${quantity} → Bsale (${previousQty} → ${result.newQty})`);
}

export async function handleBsaleStockChange(
  sku: string,
  variantId: number,
  newQty: number
): Promise<void> {
  await prisma.stockItem.upsert({
    where: { sku },
    update: { bsaleStock: newQty, bsaleVariantId: String(variantId), lastSyncAt: new Date() },
    create: { sku, bsaleStock: newQty, bsaleVariantId: String(variantId), lastSyncAt: new Date() },
  });

  const stockItem = [{ sku, quantity: newQty }];

  const parisCreds = await getCredentials("paris");
  if (parisCreds?.apiKey && parisCreds?.sellerId) {
    await batchUpdateParisStock(parisCreds.apiKey, parisCreds.sellerId, stockItem).catch(() => {});
  }

  const falabellaCreds = await getCredentials("falabella");
  if (falabellaCreds?.apiKey && falabellaCreds?.sellerId) {
    await batchUpdateFalabellaStock(falabellaCreds.apiKey, falabellaCreds.sellerId, stockItem).catch(() => {});
  }

  const ripleyCreds = await getCredentials("ripley");
  if (ripleyCreds?.apiKey) {
    await batchUpdateRipleyStock(ripleyCreds.apiKey, stockItem).catch(() => {});
  }

  await logSync("webhook", "bsale", "success",
    `Stock Bsale actualizado: ${sku} → ${newQty}`);
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
