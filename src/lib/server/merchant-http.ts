import { NextRequest, NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/server/merchant-auth";

export function requireMerchant(req: NextRequest): NextResponse | null {
  if (!getMerchantSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function merchantError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "Merchant request failed";
  const status = /required|Invalid|at least one/i.test(message) ? 400 : 500;
  return NextResponse.json({ error: message }, { status });
}
