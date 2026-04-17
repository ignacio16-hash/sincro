import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const credentials = await prisma.apiCredential.findMany();
  // Mask sensitive fields
  const safe = credentials.map((c) => {
    const config = c.config as Record<string, string>;
    const masked: Record<string, string> = {};
    for (const key of Object.keys(config)) {
      const val = config[key];
      masked[key] = val
        ? val.length > 8
          ? val.slice(0, 4) + "••••••••" + val.slice(-4)
          : "••••••••"
        : "";
    }
    return { ...c, config: masked };
  });
  return NextResponse.json(safe);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { platform, config } = body as {
    platform: string;
    config: Record<string, string>;
  };

  if (!platform || !config) {
    return NextResponse.json({ error: "Missing platform or config" }, { status: 400 });
  }

  // Merge with existing to preserve fields not being updated
  const existing = await prisma.apiCredential.findUnique({ where: { platform } });
  const existingConfig = (existing?.config as Record<string, string>) || {};

  const mergedConfig: Record<string, string> = { ...existingConfig };
  for (const key of Object.keys(config)) {
    // Only update if not a masked value
    if (config[key] && !config[key].includes("••••")) {
      mergedConfig[key] = config[key];
    }
  }

  const hasValues = Object.values(mergedConfig).some((v) => v && v.length > 0);

  const credential = await prisma.apiCredential.upsert({
    where: { platform },
    update: { config: mergedConfig, isActive: hasValues },
    create: { platform, config: mergedConfig, isActive: hasValues },
  });

  return NextResponse.json({ ok: true, isActive: credential.isActive });
}
