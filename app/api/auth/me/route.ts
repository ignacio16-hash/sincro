import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";

// GET /api/auth/me — returns the current session user or null
export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}
