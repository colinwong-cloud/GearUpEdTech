import { NextRequest, NextResponse } from "next/server";
import { merchantError, requireMerchant } from "@/lib/server/merchant-http";
import { createVendor, listVendors, updateVendor } from "@/lib/server/merchant-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ vendors: await listVendors() });
  } catch (err) {
    return merchantError(err);
  }
}

export async function POST(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as {
      name?: string;
      address?: string;
      contact_name?: string;
      contact_phone?: string;
      contact_email?: string;
    };
    const vendor = await createVendor({
      name: String(body.name || ""),
      address: String(body.address || ""),
      contact_name: String(body.contact_name || ""),
      contact_phone: String(body.contact_phone || ""),
      contact_email: String(body.contact_email || ""),
    });
    return NextResponse.json({ vendor });
  } catch (err) {
    return merchantError(err);
  }
}

export async function PATCH(req: NextRequest) {
  const denied = requireMerchant(req);
  if (denied) return denied;
  try {
    const body = (await req.json()) as {
      id?: string;
      name?: string;
      address?: string;
      contact_name?: string;
      contact_phone?: string;
      contact_email?: string;
    };
    await updateVendor(String(body.id || ""), {
      name: String(body.name || ""),
      address: String(body.address || ""),
      contact_name: String(body.contact_name || ""),
      contact_phone: String(body.contact_phone || ""),
      contact_email: String(body.contact_email || ""),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return merchantError(err);
  }
}
