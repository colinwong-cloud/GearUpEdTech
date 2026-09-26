"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MERCHANT_COMPANY_NAME,
  cashflowInvoiceSummary,
  dueDateForTerm,
  formatHkDate,
  isMerchantPaymentTerm,
  invoiceMatchesPaySearch,
  lineAmount,
  merchantEmailTemplate,
  paymentTermLabel,
  settlementMethodLabel,
} from "@/lib/server/merchant-logic";

const fieldClass = "rounded border border-slate-300 bg-white text-slate-900 p-2";
const cardClass = "rounded border border-slate-200 bg-white p-4 text-slate-900";

function InvoiceSheet(props: {
  invoiceNumber: string;
  vendorName: string;
  address: string;
  contactName: string;
  email: string;
  poNumber: string;
  issueDate: string;
  dueDate: string;
  paymentTerms: string;
  currency: string;
  items: Array<{ description: string; qty: number; unitCost: number; amount: number }>;
  notes: string;
  total: number;
}) {
  return (
    <div className="relative mt-3 overflow-hidden rounded border border-slate-200 bg-white text-slate-900">
      <div className="absolute inset-y-0 left-0 w-3 bg-gradient-to-b from-lime-300 via-amber-200 to-sky-300" />
      <div className="space-y-4 p-4 pl-6 text-sm">
        <div>
          <p className="text-xl font-bold text-[#1e3d66]">{MERCHANT_COMPANY_NAME}</p>
          <p className="font-bold text-[#387399]">INVOICE</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-wide text-[#387399]">BILL TO</p>
            <p className="font-semibold">{props.vendorName || "—"}</p>
            <p>{props.address || "—"}</p>
            <p>{props.contactName || "—"}</p>
            <p>{props.email || "—"}</p>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="font-bold text-[#387399]">INVOICE #</dt>
            <dd className="text-right">{props.invoiceNumber}</dd>
            <dt className="font-bold text-[#387399]">INVOICE DATE</dt>
            <dd className="text-right">{formatHkDate(props.issueDate)}</dd>
            <dt className="font-bold text-[#387399]">P.O.#</dt>
            <dd className="text-right">{props.poNumber || "—"}</dd>
            <dt className="font-bold text-[#387399]">DUE DATE</dt>
            <dd className="text-right">{props.dueDate ? formatHkDate(props.dueDate) : "—"}</dd>
          </dl>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-y border-slate-300 text-[#387399]">
              <th className="py-1 font-bold">QTY</th>
              <th className="font-bold">DESCRIPTION</th>
              <th className="font-bold">UNIT PRICE</th>
              <th className="text-right font-bold">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {props.items.map((item, index) => (
              <tr key={`${item.description}-${index}`} className="border-b border-slate-200">
                <td className="py-1">{item.qty}</td>
                <td>{item.description}</td>
                <td>{item.unitCost.toFixed(2)}</td>
                <td className="text-right">{item.amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto w-56 space-y-1">
          <p className="flex justify-between"><span>Subtotal</span><span>{props.total.toFixed(2)}</span></p>
          <p className="flex justify-between text-base font-bold text-[#1e3d66]"><span>TOTAL</span><span>{props.currency} {props.total.toFixed(2)}</span></p>
        </div>
        <div>
          <p className="font-bold text-[#387399]">TERMS & CONDITIONS</p>
          <p>Payment terms: {props.paymentTerms}.</p>
          <p className="whitespace-pre-wrap">{props.notes || "Please arrange payment by the due date."}</p>
        </div>
        <img src="/mer/gearup-stamp.png" alt="GearUp EduTech Limited stamp" className="ml-auto h-28 w-28 object-contain" />
      </div>
    </div>
  );
}

type Vendor = {
  id: string;
  name: string;
  address: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
};

type InvoiceItem = { description: string; qty: number; unit_cost: number; amount: number };

type Invoice = {
  id: string;
  invoice_number: string;
  vendor_id: string;
  vendor_name: string;
  vendor_address: string;
  vendor_contact_name: string;
  vendor_email: string;
  issue_date: string;
  due_date: string;
  payment_terms: "cash_with_order" | "net_30" | "net_60" | "net_90" | "blank";
  vendor_po_number: string;
  notes: string;
  status: "paid" | "unpaid";
  payment_method: "cash" | "cheque" | "bank_transfer" | null;
  cheque_number: string;
  paid_on: string | null;
  currency: string;
  total: number;
  items: InvoiceItem[];
};

type StatementRow = {
  vendor_name: string;
  invoice_count: number;
  paid: number;
  unpaid: number;
};

type Cashflow = {
  vendor_name: string;
  paid: number;
  unpaid: number;
  count: number;
  invoices: Invoice[];
};

const TERMS = [
  { value: "cash_with_order", label: "Cash with order" },
  { value: "net_30", label: "Net 30" },
  { value: "net_60", label: "Net 60" },
  { value: "net_90", label: "Net 90" },
  { value: "blank", label: "Leave blank" },
] as const;

async function readError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Request failed";
}

async function download(url: string, filename: string) {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(href);
}

export default function MerchantPage() {
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tab, setTab] = useState<"vendors" | "invoices" | "cash" | "report">("vendors");
  const [msg, setMsg] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorQuery, setVendorQuery] = useState("");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [vendorForm, setVendorForm] = useState({
    name: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
  });
  const [invoiceForm, setInvoiceForm] = useState({
    vendor_id: "",
    issue_date: new Date().toISOString().slice(0, 10),
    payment_terms: "net_30",
    vendor_po_number: "",
    notes: "",
    description: "",
    qty: "1",
    unit_cost: "",
  });
  const [lines, setLines] = useState<Array<{ description: string; qty: number; unit_cost: number }>>([]);
  const [sendTemplate, setSendTemplate] = useState<"initial" | "overdue">("initial");
  const [editingVendorId, setEditingVendorId] = useState<string | null>(null);
  const [editVendor, setEditVendor] = useState({
    name: "",
    address: "",
    contact_name: "",
    contact_phone: "",
    contact_email: "",
  });
  const [listFrom, setListFrom] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [listTo, setListTo] = useState(new Date().toISOString().slice(0, 10));
  const [sendNotice, setSendNotice] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [cashVendor, setCashVendor] = useState("");
  const [cashFrom, setCashFrom] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [cashTo, setCashTo] = useState(new Date().toISOString().slice(0, 10));
  const [cash, setCash] = useState<Cashflow | null>(null);
  const [payQuery, setPayQuery] = useState("");
  const [payMethod, setPayMethod] = useState<Record<string, "cash" | "cheque" | "bank_transfer">>({});
  const [payCheque, setPayCheque] = useState<Record<string, string>>({});
  const [payDate, setPayDate] = useState<Record<string, string>>({});
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [statement, setStatement] = useState<StatementRow[]>([]);

  const loadData = useCallback(async () => {
    const [vendorRes, invoiceRes] = await Promise.all([
      fetch("/api/mer/vendors", { cache: "no-store" }),
      fetch("/api/mer/invoices", { cache: "no-store" }),
    ]);
    if (!vendorRes.ok || !invoiceRes.ok) throw new Error(await readError(vendorRes.ok ? invoiceRes : vendorRes));
    const vendorJson = (await vendorRes.json()) as { vendors: Vendor[] };
    const invoiceJson = (await invoiceRes.json()) as { invoices: Invoice[] };
    setVendors(vendorJson.vendors);
    setInvoices(invoiceJson.invoices);
  }, []);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/mer/session", { cache: "no-store" });
      setAuthed(res.ok);
      setReady(true);
      if (res.ok) {
        try {
          await loadData();
        } catch (err) {
          setMsg(err instanceof Error ? err.message : "Load failed");
        }
      }
    })();
  }, [loadData]);

  async function login() {
    setMsg("");
    const res = await fetch("/api/mer/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      setMsg(await readError(res));
      return;
    }
    setPassword("");
    setAuthed(true);
    await loadData();
  }

  async function logout() {
    await fetch("/api/mer/session", { method: "DELETE" });
    setAuthed(false);
  }

  const payMatches = useMemo(
    () => invoices.filter((invoice) => invoiceMatchesPaySearch(invoice.invoice_number, invoice.vendor_name, payQuery)),
    [invoices, payQuery]
  );

  const sortedVendors = useMemo(
    () => [...vendors].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })),
    [vendors]
  );
  const visibleVendors = sortedVendors.filter((vendor) => {
    const query = vendorQuery.trim().toLowerCase();
    if (!query) return true;
    return [vendor.name, vendor.address, vendor.contact_name, vendor.contact_phone, vendor.contact_email]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const previewVendor = vendors.find((vendor) => vendor.id === invoiceForm.vendor_id) || null;
  const previewTerm = isMerchantPaymentTerm(invoiceForm.payment_terms) ? invoiceForm.payment_terms : "net_30";
  const previewDue = useMemo(() => {
    try {
      return dueDateForTerm(invoiceForm.issue_date, previewTerm) || "";
    } catch {
      return invoiceForm.issue_date;
    }
  }, [invoiceForm.issue_date, previewTerm]);
  const previewTotal = lines.reduce((sum, line) => sum + lineAmount(line.qty, line.unit_cost), 0);
  const emailPreview = merchantEmailTemplate({
    template: sendTemplate,
    invoiceNumber: "Draft",
    vendorName: previewVendor?.name || "Vendor",
    total: Math.round(previewTotal * 100) / 100,
    currency: "HKD",
    dueDate: previewDue,
    paymentTerm: previewTerm,
  });

  if (!ready) return <main className="p-8 text-sm text-slate-500">Loading merchant module…</main>;

  if (!authed) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold text-slate-900">{MERCHANT_COMPANY_NAME}</h1>
        <p className="mt-2 text-sm text-slate-600">Merchant sign-in. There is no public registration.</p>
        <form
          className="mt-6 space-y-3 rounded border border-slate-200 bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <input className={`w-full ${fieldClass}`} placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className={`w-full ${fieldClass}`} placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">Sign in</button>
        </form>
        {msg && <p className="mt-3 text-sm text-red-600">{msg}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{MERCHANT_COMPANY_NAME}</h1>
          <p className="text-sm text-slate-500">Vendors, invoices, cash flow, and monthly statements.</p>
        </div>
        <button className="text-sm underline" onClick={() => void logout()}>Sign out</button>
      </header>
      <nav className="flex gap-2">
        {(
          [
            ["vendors", "Vendors"],
            ["invoices", "Invoices"],
            ["cash", "Cash flow"],
            ["report", "Monthly statement"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`rounded px-3 py-1 text-sm ${tab === key ? "bg-slate-900 text-white" : "bg-slate-100"}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {msg && (
        <p className={`inline-block rounded border border-slate-300 bg-white px-3 py-2 text-sm ${msg.includes("updated") || msg.includes("marked paid") ? "text-emerald-700" : "text-red-600"}`}>
          {msg}
        </p>
      )}

      {tab === "vendors" && (
        <section className="space-y-4">
          <form
            className={`grid gap-2 sm:grid-cols-2 ${cardClass}`}
            onSubmit={async (event) => {
              event.preventDefault();
              setMsg("");
              const res = await fetch("/api/mer/vendors", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(vendorForm),
              });
              if (!res.ok) return setMsg(await readError(res));
              setVendorForm({ name: "", address: "", contact_name: "", contact_phone: "", contact_email: "" });
              await loadData();
            }}
          >
            <input className={fieldClass} placeholder="Vendor name" required value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
            <input className={fieldClass} placeholder="Vendor address" required value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} />
            <input className={fieldClass} placeholder="Contact person" required value={vendorForm.contact_name} onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })} />
            <input className={fieldClass} placeholder="Contact phone" required value={vendorForm.contact_phone} onChange={(e) => setVendorForm({ ...vendorForm, contact_phone: e.target.value })} />
            <input className={`${fieldClass} sm:col-span-2`} placeholder="Contact email" type="email" required value={vendorForm.contact_email} onChange={(e) => setVendorForm({ ...vendorForm, contact_email: e.target.value })} />
            <button className="rounded bg-slate-900 px-4 py-2 text-white sm:col-span-2" type="submit">Create vendor</button>
          </form>
          <details className={cardClass}>
            <summary className="cursor-pointer font-semibold">Search vendors</summary>
            <input
              className={`mt-3 w-full ${fieldClass}`}
              placeholder="Name, address, contact, phone, or email"
              value={vendorQuery}
              onChange={(e) => setVendorQuery(e.target.value)}
            />
          </details>
          <ul className="space-y-2">
            {visibleVendors.map((vendor) => (
              <li key={vendor.id} className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{vendor.name}</p>
                  <button
                    className="rounded border px-2 py-1"
                    type="button"
                    onClick={() => {
                      setEditingVendorId(vendor.id);
                      setEditVendor({
                        name: vendor.name,
                        address: vendor.address,
                        contact_name: vendor.contact_name,
                        contact_phone: vendor.contact_phone,
                        contact_email: vendor.contact_email,
                      });
                    }}
                  >
                    Modify
                  </button>
                </div>
                {editingVendorId === vendor.id ? (
                  <form
                    className="mt-2 grid gap-2 sm:grid-cols-2"
                    onSubmit={async (event) => {
                      event.preventDefault();
                      setMsg("");
                      const res = await fetch("/api/mer/vendors", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: vendor.id, ...editVendor }),
                      });
                      if (!res.ok) return setMsg(await readError(res));
                      setEditingVendorId(null);
                      setMsg("Vendor updated");
                      await loadData();
                    }}
                  >
                    <input className={fieldClass} required value={editVendor.name} onChange={(e) => setEditVendor({ ...editVendor, name: e.target.value })} />
                    <input className={fieldClass} required value={editVendor.address} onChange={(e) => setEditVendor({ ...editVendor, address: e.target.value })} />
                    <input className={fieldClass} required value={editVendor.contact_name} onChange={(e) => setEditVendor({ ...editVendor, contact_name: e.target.value })} />
                    <input className={fieldClass} required value={editVendor.contact_phone} onChange={(e) => setEditVendor({ ...editVendor, contact_phone: e.target.value })} />
                    <input className={`${fieldClass} sm:col-span-2`} type="email" required value={editVendor.contact_email} onChange={(e) => setEditVendor({ ...editVendor, contact_email: e.target.value })} />
                    <button className="rounded bg-slate-900 px-3 py-2 text-white" type="submit">Save vendor</button>
                  </form>
                ) : (
                  <>
                    <p>{vendor.address}</p>
                    <p>{vendor.contact_name} · {vendor.contact_phone} · {vendor.contact_email}</p>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "invoices" && (
        <section className="space-y-4">
          <form
            className={`space-y-2 ${cardClass}`}
            onSubmit={async (event) => {
              event.preventDefault();
              setMsg("");
              const res = await fetch("/api/mer/invoices", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  vendor_id: invoiceForm.vendor_id,
                  issue_date: invoiceForm.issue_date,
                  payment_terms: invoiceForm.payment_terms,
                  vendor_po_number: invoiceForm.vendor_po_number,
                  notes: invoiceForm.notes,
                  items: lines,
                }),
              });
              if (!res.ok) return setMsg(await readError(res));
              setLines([]);
              setInvoiceForm({ ...invoiceForm, notes: "", vendor_po_number: "" });
              await loadData();
            }}
          >
            <select className={`w-full ${fieldClass}`} required value={invoiceForm.vendor_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, vendor_id: e.target.value })}>
              <option value="">Select vendor</option>
              {sortedVendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <input className={fieldClass} placeholder="Vendor PO number" value={invoiceForm.vendor_po_number} onChange={(e) => setInvoiceForm({ ...invoiceForm, vendor_po_number: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <input className={fieldClass} type="date" value={invoiceForm.issue_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })} />
              <select className={fieldClass} value={invoiceForm.payment_terms} onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_terms: e.target.value })}>
                {TERMS.map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <input className={`${fieldClass} sm:col-span-2`} placeholder="Item purchased" value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} />
              <input className={fieldClass} placeholder="Qty" value={invoiceForm.qty} onChange={(e) => setInvoiceForm({ ...invoiceForm, qty: e.target.value })} />
              <input className={fieldClass} placeholder="Unit cost" value={invoiceForm.unit_cost} onChange={(e) => setInvoiceForm({ ...invoiceForm, unit_cost: e.target.value })} />
            </div>
            <button
              className="rounded border px-3 py-1 text-sm"
              type="button"
              onClick={() => {
                if (!invoiceForm.description.trim()) return;
                setLines([...lines, { description: invoiceForm.description.trim(), qty: Number(invoiceForm.qty), unit_cost: Number(invoiceForm.unit_cost) }]);
                setInvoiceForm({ ...invoiceForm, description: "", unit_cost: "" });
              }}
            >
              Add item
            </button>
            <ul className="space-y-1 text-sm">
              {lines.map((line, index) => (
                <li key={`${line.description}-${index}`} className="flex items-center justify-between gap-2">
                  <span>{line.description} × {line.qty} @ {line.unit_cost}</span>
                  <button
                    className="rounded border px-2 py-1"
                    type="button"
                    onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <textarea className={`w-full ${fieldClass}`} rows={3} placeholder="Notes printed at the bottom of the invoice" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
            <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">Generate invoice</button>
          </form>
          <label className="block rounded border border-slate-200 bg-white p-3 text-sm text-slate-900">
            Email template
            <select className={`ml-2 ${fieldClass}`} value={sendTemplate} onChange={(e) => setSendTemplate(e.target.value as "initial" | "overdue")}>
              <option value="initial">Initial invoice — polite</option>
              <option value="overdue">Overdue follow-up — serious</option>
            </select>
          </label>
          <details open className={cardClass}>
            <summary className="cursor-pointer font-semibold">Invoice preview</summary>
            <InvoiceSheet
              invoiceNumber="Draft"
              vendorName={previewVendor?.name || "Select a vendor"}
              address={previewVendor?.address || ""}
              contactName={previewVendor?.contact_name || ""}
              email={previewVendor?.contact_email || ""}
              poNumber={invoiceForm.vendor_po_number}
              issueDate={invoiceForm.issue_date}
              dueDate={previewDue}
              paymentTerms={paymentTermLabel(previewTerm)}
              currency="HKD"
              total={Math.round(previewTotal * 100) / 100}
              notes={invoiceForm.notes}
              items={lines.map((line) => ({
                description: line.description,
                qty: line.qty,
                unitCost: Number(line.unit_cost),
                amount: lineAmount(line.qty, line.unit_cost),
              }))}
            />
          </details>
          <details open className={cardClass}>
            <summary className="cursor-pointer font-semibold">Email preview</summary>
            <div className="mt-3 space-y-2 text-sm">
              <p><span className="font-semibold">Subject:</span> {emailPreview.subject}</p>
              <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3">{emailPreview.text}</pre>
            </div>
          </details>
          <div className={`${cardClass} flex flex-wrap items-end gap-2 text-sm`}>
            <label>
              From
              <input className={`mt-1 block ${fieldClass}`} type="date" value={listFrom} onChange={(e) => setListFrom(e.target.value)} />
            </label>
            <label>
              To
              <input className={`mt-1 block ${fieldClass}`} type="date" value={listTo} onChange={(e) => setListTo(e.target.value)} />
            </label>
          </div>
          <ul className="space-y-3">
            {invoices
              .filter((invoice) => invoice.issue_date >= listFrom && invoice.issue_date <= listTo)
              .map((invoice) => {
                const savedEmail = merchantEmailTemplate({
                  template: sendTemplate,
                  invoiceNumber: invoice.invoice_number,
                  vendorName: invoice.vendor_name,
                  total: invoice.total,
                  currency: invoice.currency,
                  dueDate: invoice.due_date,
                  paymentTerm: invoice.payment_terms,
                });
                const notice = sendNotice[invoice.id];
                return (
              <li key={invoice.id} className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-900">
                <p className="font-semibold">{invoice.invoice_number} · {invoice.vendor_name} · {invoice.currency} {invoice.total.toFixed(2)}</p>
                <p>{invoice.issue_date}{invoice.due_date ? ` due ${invoice.due_date}` : " · no due date"} · PO {invoice.vendor_po_number || "—"} · {paymentTermLabel(invoice.payment_terms)} · {invoice.status}</p>
                {invoice.status === "paid" && (
                  <p>Paid {invoice.paid_on || "—"} · {invoice.payment_method ? settlementMethodLabel(invoice.payment_method) : "—"}{invoice.payment_method === "cheque" ? ` · Cheque ${invoice.cheque_number || "—"}` : ""}</p>
                )}
                {invoice.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{invoice.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="rounded border px-2 py-1" onClick={() => void download(`/api/mer/invoices/${invoice.id}/pdf`, `${invoice.invoice_number}.pdf`)}>Download PDF</button>
                  {invoice.status === "paid" && (
                    <button
                      className="rounded border px-2 py-1"
                      onClick={async () => {
                        const res = await fetch("/api/mer/invoices", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: invoice.id, status: "unpaid" }),
                        });
                        if (!res.ok) return setMsg(await readError(res));
                        setMsg("Invoice updated");
                        await loadData();
                      }}
                    >
                      Mark unpaid
                    </button>
                  )}
                </div>
                <details className="mt-3 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer font-semibold">Invoice preview</summary>
                  <InvoiceSheet
                    invoiceNumber={invoice.invoice_number}
                    vendorName={invoice.vendor_name}
                    address={invoice.vendor_address}
                    contactName={invoice.vendor_contact_name}
                    email={invoice.vendor_email}
                    poNumber={invoice.vendor_po_number}
                    issueDate={invoice.issue_date}
                    dueDate={invoice.due_date}
                    paymentTerms={paymentTermLabel(invoice.payment_terms)}
                    currency={invoice.currency}
                    total={invoice.total}
                    notes={invoice.notes}
                    items={invoice.items.map((item) => ({
                      description: item.description,
                      qty: item.qty,
                      unitCost: item.unit_cost,
                      amount: item.amount,
                    }))}
                  />
                </details>
                <details className="mt-2 rounded border border-slate-200 p-3">
                  <summary className="cursor-pointer font-semibold">Email preview</summary>
                  <div className="mt-2 space-y-2">
                    <label>
                      Template
                      <select className={`ml-2 ${fieldClass}`} value={sendTemplate} onChange={(e) => setSendTemplate(e.target.value as "initial" | "overdue")}>
                        <option value="initial">Initial invoice — polite</option>
                        <option value="overdue">Overdue follow-up — serious</option>
                      </select>
                    </label>
                    <p><span className="font-semibold">To:</span> {invoice.vendor_email || "No vendor email"}</p>
                    <p><span className="font-semibold">Subject:</span> {savedEmail.subject}</p>
                    <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3">{savedEmail.text}</pre>
                    <button
                      className="rounded bg-slate-900 px-3 py-2 text-white"
                      type="button"
                      onClick={async () => {
                        setSendNotice((current) => ({ ...current, [invoice.id]: { ok: true, text: "Sending…" } }));
                        try {
                          const res = await fetch(`/api/mer/invoices/${invoice.id}/send`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ template: sendTemplate }),
                          });
                          if (!res.ok) {
                            const text = await readError(res);
                            setSendNotice((current) => ({ ...current, [invoice.id]: { ok: false, text } }));
                            return;
                          }
                          const body = (await res.json()) as { to?: string };
                          setSendNotice((current) => ({
                            ...current,
                            [invoice.id]: { ok: true, text: `Sent to ${body.to || invoice.vendor_email}` },
                          }));
                        } catch (err) {
                          setSendNotice((current) => ({
                            ...current,
                            [invoice.id]: { ok: false, text: err instanceof Error ? err.message : "Send failed" },
                          }));
                        }
                      }}
                    >
                      Send this email
                    </button>
                    {notice && (
                      <p className={notice.ok ? "text-emerald-700" : "text-red-600"}>{notice.text}</p>
                    )}
                  </div>
                </details>
              </li>
                );
              })}
          </ul>
        </section>
      )}

      {tab === "cash" && (
        <section className="space-y-3">
          <div className={`${cardClass} space-y-3`}>
            <label className="block text-sm">
              Search vendor or invoice number
              <input
                className={`mt-1 block w-full ${fieldClass}`}
                value={payQuery}
                onChange={(e) => setPayQuery(e.target.value)}
                placeholder="Substring of vendor or invoice number"
              />
            </label>
            {payQuery.trim() && payMatches.length === 0 && <p className="text-sm">No matching invoices.</p>}
            <ul className="space-y-3">
              {payMatches.map((invoice) => {
                const method = payMethod[invoice.id] || "cash";
                const paidOn = payDate[invoice.id] || new Date().toISOString().slice(0, 10);
                return (
                  <li key={invoice.id} className="rounded border border-slate-200 p-3 text-sm">
                    <p className="font-semibold">{invoice.invoice_number} · {invoice.vendor_name} · {invoice.currency} {invoice.total.toFixed(2)}</p>
                    <p>{invoice.status}{invoice.status === "paid" ? ` · ${invoice.payment_method ? settlementMethodLabel(invoice.payment_method) : "—"} · ${invoice.paid_on || "—"}` : ""}{invoice.payment_method === "cheque" ? ` · Cheque ${invoice.cheque_number}` : ""}</p>
                    {invoice.status === "unpaid" ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label>
                          Payment method
                          <select
                            className={`mt-1 block ${fieldClass}`}
                            value={method}
                            onChange={(e) => setPayMethod((current) => ({ ...current, [invoice.id]: e.target.value as "cash" | "cheque" | "bank_transfer" }))}
                          >
                            <option value="cash">Cash</option>
                            <option value="cheque">Cheque</option>
                            <option value="bank_transfer">Bank transfer</option>
                          </select>
                        </label>
                        {method === "cheque" && (
                          <label>
                            Cheque number
                            <input
                              className={`mt-1 block ${fieldClass}`}
                              value={payCheque[invoice.id] || ""}
                              onChange={(e) => setPayCheque((current) => ({ ...current, [invoice.id]: e.target.value }))}
                            />
                          </label>
                        )}
                        <label>
                          Paid date
                          <input
                            className={`mt-1 block ${fieldClass}`}
                            type="date"
                            value={paidOn}
                            onChange={(e) => setPayDate((current) => ({ ...current, [invoice.id]: e.target.value }))}
                          />
                        </label>
                        <button
                          className="rounded bg-slate-900 px-3 py-2 text-white"
                          type="button"
                          onClick={async () => {
                            setMsg("");
                            const res = await fetch("/api/mer/invoices", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                id: invoice.id,
                                status: "paid",
                                payment_method: method,
                                cheque_number: payCheque[invoice.id] || "",
                                paid_on: paidOn,
                              }),
                            });
                            if (!res.ok) return setMsg(await readError(res));
                            setMsg("Invoice marked paid");
                            await loadData();
                            if (cashVendor && cashFrom && cashTo) {
                              const summary = await fetch(`/api/mer/cashflow?vendor_id=${cashVendor}&from=${cashFrom}&to=${cashTo}`);
                              if (summary.ok) setCash((await summary.json()) as Cashflow);
                            }
                          }}
                        >
                          Mark paid
                        </button>
                      </div>
                    ) : (
                      <button
                        className="mt-2 rounded border px-2 py-1"
                        type="button"
                        onClick={async () => {
                          const res = await fetch("/api/mer/invoices", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: invoice.id, status: "unpaid" }),
                          });
                          if (!res.ok) return setMsg(await readError(res));
                          setMsg("Invoice updated");
                          await loadData();
                        }}
                      >
                        Mark unpaid
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <select className={fieldClass} value={cashVendor} onChange={(e) => setCashVendor(e.target.value)}>
              <option value="">Vendor</option>
              {sortedVendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <input className={fieldClass} type="date" value={cashFrom} onChange={(e) => setCashFrom(e.target.value)} />
            <input className={fieldClass} type="date" value={cashTo} onChange={(e) => setCashTo(e.target.value)} />
            <button
              className="rounded bg-slate-900 px-3 py-2 text-white"
              onClick={async () => {
                setMsg("");
                const res = await fetch(`/api/mer/cashflow?vendor_id=${cashVendor}&from=${cashFrom}&to=${cashTo}`);
                if (!res.ok) return setMsg(await readError(res));
                setCash((await res.json()) as Cashflow);
              }}
            >
              Summarize
            </button>
          </div>
          {cash && (
            <div className={`${cardClass} text-sm`}>
              <p className="font-semibold">{cash.vendor_name}</p>
              <p>Paid HKD {cash.paid.toFixed(2)}</p>
              <p>Unpaid HKD {cash.unpaid.toFixed(2)}</p>
              <ul className="mt-3 space-y-2">
                {cash.invoices.map((invoice) => (
                  <li key={invoice.id}>
                    {cashflowInvoiceSummary({
                      invoiceNumber: invoice.invoice_number,
                      vendorName: invoice.vendor_name,
                      issueDate: invoice.issue_date,
                      dueDate: invoice.due_date,
                      status: invoice.status,
                      total: invoice.total,
                      currency: invoice.currency,
                      paymentMethod: invoice.status === "paid" && invoice.payment_method ? settlementMethodLabel(invoice.payment_method) : "",
                      chequeNumber: invoice.status === "paid" && invoice.payment_method === "cheque" ? invoice.cheque_number : "",
                      paidOn: invoice.status === "paid" ? invoice.paid_on || "" : "",
                    })}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <button className="rounded border px-2 py-1" onClick={() => void download(`/api/mer/cashflow?vendor_id=${cashVendor}&from=${cashFrom}&to=${cashTo}&format=csv`, "cashflow.csv")}>CSV</button>
                <button className="rounded border px-2 py-1" onClick={() => void download(`/api/mer/cashflow?vendor_id=${cashVendor}&from=${cashFrom}&to=${cashTo}&format=pdf`, "cashflow.pdf")}>PDF</button>
              </div>
            </div>
          )}
        </section>
      )}

      {tab === "report" && (
        <section className="space-y-3">
          <div className="flex gap-2">
            <input className={fieldClass} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            <button
              className="rounded bg-slate-900 px-3 py-2 text-white"
              onClick={async () => {
                const res = await fetch(`/api/mer/reports?month=${month}`);
                if (!res.ok) return setMsg(await readError(res));
                const body = (await res.json()) as { rows: StatementRow[] };
                setStatement(body.rows);
              }}
            >
              Build statement
            </button>
            <button className="rounded border px-3 py-2" onClick={() => void download(`/api/mer/reports?month=${month}&format=pdf`, `statement-${month}.pdf`)}>Download PDF</button>
          </div>
          <table className="w-full rounded border border-slate-200 bg-white p-3 text-left text-sm text-slate-900">
            <thead>
              <tr className="border-b">
                <th className="py-2">Vendor</th>
                <th>Invoices</th>
                <th>Paid HKD</th>
                <th>Outstanding HKD</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((row) => (
                <tr key={row.vendor_name} className="border-b">
                  <td className="py-2">{row.vendor_name}</td>
                  <td>{row.invoice_count}</td>
                  <td>{row.paid.toFixed(2)}</td>
                  <td>{row.unpaid.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
