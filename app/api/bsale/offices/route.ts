import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tokenParam = searchParams.get("token");

  // Use provided token or fall back to stored credentials
  let accessToken = tokenParam;
  if (!accessToken) {
    const cred = await prisma.apiCredential.findUnique({ where: { platform: "bsale" } });
    accessToken = (cred?.config as Record<string, string>)?.accessToken;
  }

  if (!accessToken) {
    return NextResponse.json({ error: "No access token" }, { status: 400 });
  }

  try {
    const { data } = await axios.get("https://api.bsale.io/v1/offices.json", {
      headers: { access_token: accessToken },
      params: { limit: 50 },
      timeout: 10000,
    });

    const offices = (data.list || data.items || []).map((o: { id: number; name: string }) => ({
      id: o.id,
      name: o.name,
    }));

    return NextResponse.json({ offices });
  } catch (err) {
    const status = axios.isAxiosError(err) ? (err.response?.status ?? 500) : 500;
    const message = axios.isAxiosError(err)
      ? (err.response?.data?.error || err.message)
      : (err as Error).message;
    return NextResponse.json({ error: message }, { status });
  }
}
