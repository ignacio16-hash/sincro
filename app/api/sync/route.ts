import { NextResponse } from "next/server";
import { runFullSync } from "@/lib/sync";

export async function POST() {
  try {
    const result = await runFullSync();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
