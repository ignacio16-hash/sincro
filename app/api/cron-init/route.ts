import { NextResponse } from "next/server";
import { startCronSync } from "@/lib/cron";

// Called once on app start via instrumentation
export async function GET() {
  startCronSync();
  return NextResponse.json({ ok: true, message: "Cron initialized" });
}
