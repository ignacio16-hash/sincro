import { NextResponse } from "next/server";

// Simple healthcheck endpoint — no DB required
// Railway uses this to verify the service is up
export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() });
}
