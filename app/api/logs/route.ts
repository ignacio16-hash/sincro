import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = parseInt(searchParams.get("page") || "1");
  const platform = searchParams.get("platform") || "";
  const status = searchParams.get("status") || "";
  const limit = 50;
  const skip = (page - 1) * limit;

  const where: Record<string, string> = {};
  if (platform) where.platform = platform;
  if (status) where.status = status;

  const [logs, total] = await Promise.all([
    prisma.syncLog.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
    }),
    prisma.syncLog.count({ where }),
  ]);

  return NextResponse.json({ logs, total, page, pages: Math.ceil(total / limit) });
}
