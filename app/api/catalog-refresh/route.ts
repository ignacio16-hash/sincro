import { NextResponse } from "next/server";
import { refreshBsaleCatalog } from "@/lib/sync";

export async function POST() {
  try {
    const result = await refreshBsaleCatalog();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
