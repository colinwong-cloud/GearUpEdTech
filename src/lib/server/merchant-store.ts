import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  dueDateForTerm,
  invoiceTotal,
  isMerchantPaymentTerm,
  isMerchantSettlementMethod,
  normalizeChequeNumber,
  normalizeLines,
  normalizePaidOn,
  type MerchantInvoiceStatus,
  type MerchantLineInput,
  type MerchantPaymentTerm,
  type MerchantSettlementMethod,
} from "@/lib/server/merchant-logic";

export type MerchantVendor = {
  id: string;
  name: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
};

export type MerchantInvoiceItem = {
  description: string;
  qty: number;
  unit_cost: number;
  amount: number;
};

export type MerchantInvoice = {
  id: string;
  invoice_number: string;
  vendor_id: string;
  vendor_name: string;
  vendor_address: string;
  vendor_contact_name: string;
  vendor_email: string;
  issue_date: string;
  due_date: string;
  payment_terms: MerchantPaymentTerm;
  vendor_po_number: string;
  notes: string;
  status: MerchantInvoiceStatus;
  paid_at: string | null;
  payment_method: MerchantSettlementMethod | null;
  cheque_number: string;
  paid_on: string | null;
  currency: string;
  total: number;
  items: MerchantInvoiceItem[];
};

function adminClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !key) {
    throw new Error("Set SUPABASE_SERVICE_ROLE_KEY in Vercel");
  }
  return createClient(url, key);
}

function dateOnly(value: string): string {
  return String(value || "").slice(0, 10);
}

export async function listVendors(): Promise<MerchantVendor[]> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("mer_vendors")
    .select("id,name,address,contact_name,contact_phone,contact_email")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as MerchantVendor[];
}

export async function createVendor(input: Omit<MerchantVendor, "id">): Promise<MerchantVendor> {
  const supabase = adminClient();
  const row = {
    name: input.name.trim(),
    address: input.address.trim(),
    contact_name: input.contact_name.trim(),
    contact_phone: input.contact_phone.trim(),
    contact_email: input.contact_email.trim().toLowerCase(),
  };
  if (!row.name || !row.address || !row.contact_name || !row.contact_phone || !row.contact_email) {
    throw new Error("Vendor name, address, contact name, phone, and email are required");
  }
  const { data, error } = await supabase.from("mer_vendors").insert(row).select("*").single();
  if (error) throw error;
  return data as MerchantVendor;
}

export async function updateVendor(id: string, input: Omit<MerchantVendor, "id">): Promise<void> {
  const row = {
    name: input.name.trim(),
    address: input.address.trim(),
    contact_name: input.contact_name.trim(),
    contact_phone: input.contact_phone.trim(),
    contact_email: input.contact_email.trim().toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  if (!id || !row.name || !row.address || !row.contact_name || !row.contact_phone || !row.contact_email) {
    throw new Error("Vendor name, address, contact name, phone, and email are required");
  }
  const supabase = adminClient();
  const { error } = await supabase.from("mer_vendors").update(row).eq("id", id);
  if (error) throw error;
}

async function nextInvoiceNumber(supabase: SupabaseClient, issueDate: string): Promise<string> {
  const stamp = issueDate.replace(/-/g, "").slice(0, 6);
  const prefix = `GU-M-${stamp}-`;
  const { data, error } = await supabase
    .from("mer_invoices")
    .select("invoice_number")
    .like("invoice_number", `${prefix}%`)
    .order("invoice_number", { ascending: false })
    .limit(1);
  if (error) throw error;
  const latest = String(data?.[0]?.invoice_number || "");
  const seq = Number(latest.slice(prefix.length) || "0") + 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function createInvoice(input: {
  vendorId: string;
  issueDate: string;
  paymentTerms: string;
  vendorPoNumber: string;
  notes: string;
  items: MerchantLineInput[];
}): Promise<MerchantInvoice> {
  if (!isMerchantPaymentTerm(input.paymentTerms)) throw new Error("Invalid payment terms");
  const lines = normalizeLines(input.items);
  if (lines.length === 0) throw new Error("Add at least one item with quantity and cost");
  const issueDate = dateOnly(input.issueDate);
  const dueDate = dueDateForTerm(issueDate, input.paymentTerms);
  const supabase = adminClient();
  const invoiceNumber = await nextInvoiceNumber(supabase, issueDate);
  const { data: invoice, error } = await supabase
    .from("mer_invoices")
    .insert({
      invoice_number: invoiceNumber,
      vendor_id: input.vendorId,
      issue_date: issueDate,
      due_date: dueDate,
      payment_terms: input.paymentTerms,
      vendor_po_number: input.vendorPoNumber.trim(),
      notes: input.notes.trim(),
      status: "unpaid",
      currency: "HKD",
    })
    .select("id")
    .single();
  if (error) throw error;
  const { error: itemError } = await supabase.from("mer_invoice_items").insert(
    lines.map((line, index) => ({
      invoice_id: invoice.id,
      description: line.description,
      qty: line.qty,
      unit_cost: line.unitCost,
      amount: line.amount,
      sort_order: index,
    }))
  );
  if (itemError) throw itemError;
  const created = await getInvoice(invoice.id);
  if (!created) throw new Error("Invoice was not saved");
  return created;
}

type InvoiceRow = {
  id: string;
  invoice_number: string;
  vendor_id: string;
  issue_date: string;
  due_date: string;
  payment_terms: MerchantPaymentTerm;
  vendor_po_number: string | null;
  notes: string;
  status: MerchantInvoiceStatus;
  paid_at: string | null;
  payment_method: string | null;
  cheque_number: string | null;
  paid_on: string | null;
  currency: string;
  mer_vendors: {
    name: string;
    address: string;
    contact_name: string;
    contact_email: string;
  } | null;
  mer_invoice_items: Array<{
    description: string;
    qty: number;
    unit_cost: number;
    amount: number;
    sort_order: number;
  }>;
};

function mapInvoice(row: InvoiceRow): MerchantInvoice {
  const items = [...(row.mer_invoice_items || [])]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((item) => ({
      description: item.description,
      qty: Number(item.qty),
      unit_cost: Number(item.unit_cost),
      amount: Number(item.amount),
    }));
  return {
    id: row.id,
    invoice_number: row.invoice_number,
    vendor_id: row.vendor_id,
    vendor_name: row.mer_vendors?.name || "",
    vendor_address: row.mer_vendors?.address || "",
    vendor_contact_name: row.mer_vendors?.contact_name || "",
    vendor_email: row.mer_vendors?.contact_email || "",
    issue_date: dateOnly(row.issue_date),
    due_date: dateOnly(row.due_date),
    payment_terms: row.payment_terms,
    vendor_po_number: row.vendor_po_number || "",
    notes: row.notes || "",
    status: row.status,
    paid_at: row.paid_at,
    payment_method: row.payment_method && isMerchantSettlementMethod(row.payment_method) ? row.payment_method : null,
    cheque_number: row.cheque_number || "",
    paid_on: row.paid_on ? dateOnly(row.paid_on) : null,
    currency: row.currency || "HKD",
    total: invoiceTotal(items),
    items,
  };
}

const INVOICE_SELECT =
  "id,invoice_number,vendor_id,issue_date,due_date,payment_terms,vendor_po_number,notes,status,paid_at,payment_method,cheque_number,paid_on,currency,mer_vendors(name,address,contact_name,contact_email),mer_invoice_items(description,qty,unit_cost,amount,sort_order)";

export async function listInvoices(): Promise<MerchantInvoice[]> {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from("mer_invoices")
    .select(INVOICE_SELECT)
    .order("issue_date", { ascending: false });
  if (error) throw error;
  return ((data || []) as unknown as InvoiceRow[]).map(mapInvoice);
}

export async function getInvoice(id: string): Promise<MerchantInvoice | null> {
  const supabase = adminClient();
  const { data, error } = await supabase.from("mer_invoices").select(INVOICE_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapInvoice(data as unknown as InvoiceRow);
}

export async function markInvoicePaid(input: {
  id: string;
  method: string;
  chequeNumber: string;
  paidOn: string;
}): Promise<void> {
  if (!input.id) throw new Error("Invoice is required");
  if (!isMerchantSettlementMethod(input.method)) throw new Error("Invalid payment method");
  const chequeNumber = normalizeChequeNumber(input.method, input.chequeNumber);
  const paidOn = normalizePaidOn(input.paidOn);
  const supabase = adminClient();
  const { error } = await supabase
    .from("mer_invoices")
    .update({
      status: "paid",
      payment_method: input.method,
      cheque_number: chequeNumber || null,
      paid_on: paidOn,
      paid_at: `${paidOn}T00:00:00.000Z`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);
  if (error) throw error;
}

export async function markInvoiceUnpaid(id: string): Promise<void> {
  if (!id) throw new Error("Invoice is required");
  const supabase = adminClient();
  const { error } = await supabase
    .from("mer_invoices")
    .update({
      status: "unpaid",
      payment_method: null,
      cheque_number: null,
      paid_on: null,
      paid_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
