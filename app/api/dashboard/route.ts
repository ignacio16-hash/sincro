import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const [
    totalSkus,
    lastSync,
    recentLogs,
    errorCount,
    credentials,
  ] = await Promise.all([
    prisma.stockItem.count(),
    prisma.syncLog.findFirst({ orderBy: { createdAt: "desc" }, where: { type: "full_sync" } }),
    prisma.syncLog.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.syncLog.count({ where: { status: "error", createdAt: { gte: new Date(Date.now() - 86400000) } } }),
    prisma.apiCredential.findMany(),
  ]);

  const platforms = ["bsale", "paris", "falabella", "ripley"].map((p) => {
    const cred = credentials.find((c) => c.platform === p);
    return { platform: p, isActive: cred?.isActive ?? false };
  });

  return NextResponse.json({
    totalSkus,
    lastSync: lastSync?.createdAt ?? null,
    lastSyncStatus: lastSync?.status ?? null,
    recentLogs,
    errorCount,
    platforms,
  });
}
