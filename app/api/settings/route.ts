import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const credentials = await prisma.apiCredential.findMany();
    // Mask sensitive fields
    const SENSITIVE_KEYS = new Set(["accessToken", "apiKey"]);
    const safe = credentials.map((c) => {
      const config = c.config as Record<string, string>;
      const masked: Record<string, string> = {};
      for (const key of Object.keys(config)) {
        const val = config[key];
        if (SENSITIVE_KEYS.has(key) && val) {
          masked[key] = val.length > 8
            ? val.slice(0, 4) + "••••••••" + val.slice(-4)
            : "••••••••";
        } else {
          masked[key] = val || "";
        }
      }
      return { ...c, config: masked };
    });
    return NextResponse.json(safe);
  } catch {
    // DB not available — return empty list so UI still loads
    return NextResponse.json([]);
  }
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

  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    const isDbConfig = message.includes("DATABASE_URL") || message.includes("nonempty URL");
    return NextResponse.json(
      { error: isDbConfig ? "Base de datos no configurada. Verifica DATABASE_URL en Railway." : message },
      { status: 503 }
    );
  }
}
