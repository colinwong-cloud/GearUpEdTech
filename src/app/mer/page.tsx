"use client";

import { useCallback, useEffect, useState } from "react";

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
  issue_date: string;
  due_date: string;
  payment_terms: "cash_with_order" | "net_30" | "net_60";
  notes: string;
  status: "paid" | "unpaid";
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
    notes: "",
    description: "",
    qty: "1",
    unit_cost: "",
  });
  const [lines, setLines] = useState<Array<{ description: string; qty: number; unit_cost: number }>>([]);
  const [sendTemplate, setSendTemplate] = useState<"initial" | "overdue">("initial");
  const [cashVendor, setCashVendor] = useState("");
  const [cashFrom, setCashFrom] = useState(new Date().toISOString().slice(0, 8) + "01");
  const [cashTo, setCashTo] = useState(new Date().toISOString().slice(0, 10));
  const [cash, setCash] = useState<Cashflow | null>(null);
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

  if (!ready) return <main className="p-8 text-sm text-slate-500">Loading merchant module…</main>;

  if (!authed) {
    return (
      <main className="mx-auto max-w-md p-8">
        <h1 className="text-2xl font-semibold text-slate-900">GearUp Trading</h1>
        <p className="mt-2 text-sm text-slate-600">Merchant sign-in. There is no public registration.</p>
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void login();
          }}
        >
          <input className="w-full rounded border p-2" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input className="w-full rounded border p-2" placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
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
          <h1 className="text-2xl font-semibold">GearUp Trading</h1>
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
      {msg && <p className="text-sm text-red-600">{msg}</p>}

      {tab === "vendors" && (
        <section className="space-y-4">
          <form
            className="grid gap-2 rounded border p-4 sm:grid-cols-2"
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
            <input className="rounded border p-2" placeholder="Vendor name" required value={vendorForm.name} onChange={(e) => setVendorForm({ ...vendorForm, name: e.target.value })} />
            <input className="rounded border p-2" placeholder="Vendor address" required value={vendorForm.address} onChange={(e) => setVendorForm({ ...vendorForm, address: e.target.value })} />
            <input className="rounded border p-2" placeholder="Contact person" required value={vendorForm.contact_name} onChange={(e) => setVendorForm({ ...vendorForm, contact_name: e.target.value })} />
            <input className="rounded border p-2" placeholder="Contact phone" required value={vendorForm.contact_phone} onChange={(e) => setVendorForm({ ...vendorForm, contact_phone: e.target.value })} />
            <input className="rounded border p-2 sm:col-span-2" placeholder="Contact email" type="email" required value={vendorForm.contact_email} onChange={(e) => setVendorForm({ ...vendorForm, contact_email: e.target.value })} />
            <button className="rounded bg-slate-900 px-4 py-2 text-white sm:col-span-2" type="submit">Create vendor</button>
          </form>
          <ul className="space-y-2">
            {vendors.map((vendor) => (
              <li key={vendor.id} className="rounded border p-3 text-sm">
                <p className="font-semibold">{vendor.name}</p>
                <p>{vendor.address}</p>
                <p>{vendor.contact_name} · {vendor.contact_phone} · {vendor.contact_email}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "invoices" && (
        <section className="space-y-4">
          <form
            className="space-y-2 rounded border p-4"
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
                  notes: invoiceForm.notes,
                  items: lines,
                }),
              });
              if (!res.ok) return setMsg(await readError(res));
              setLines([]);
              setInvoiceForm({ ...invoiceForm, notes: "" });
              await loadData();
            }}
          >
            <select className="w-full rounded border p-2" required value={invoiceForm.vendor_id} onChange={(e) => setInvoiceForm({ ...invoiceForm, vendor_id: e.target.value })}>
              <option value="">Select vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <input className="rounded border p-2" type="date" value={invoiceForm.issue_date} onChange={(e) => setInvoiceForm({ ...invoiceForm, issue_date: e.target.value })} />
              <select className="rounded border p-2" value={invoiceForm.payment_terms} onChange={(e) => setInvoiceForm({ ...invoiceForm, payment_terms: e.target.value })}>
                {TERMS.map((term) => (
                  <option key={term.value} value={term.value}>{term.label}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2 sm:grid-cols-4">
              <input className="rounded border p-2 sm:col-span-2" placeholder="Item purchased" value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} />
              <input className="rounded border p-2" placeholder="Qty" value={invoiceForm.qty} onChange={(e) => setInvoiceForm({ ...invoiceForm, qty: e.target.value })} />
              <input className="rounded border p-2" placeholder="Unit cost" value={invoiceForm.unit_cost} onChange={(e) => setInvoiceForm({ ...invoiceForm, unit_cost: e.target.value })} />
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
            <ul className="text-sm">
              {lines.map((line, index) => (
                <li key={`${line.description}-${index}`}>{line.description} × {line.qty} @ {line.unit_cost}</li>
              ))}
            </ul>
            <textarea className="w-full rounded border p-2" rows={3} placeholder="Notes printed at the bottom of the invoice" value={invoiceForm.notes} onChange={(e) => setInvoiceForm({ ...invoiceForm, notes: e.target.value })} />
            <button className="rounded bg-slate-900 px-4 py-2 text-white" type="submit">Generate invoice</button>
          </form>
          <label className="block text-sm">
            Email template
            <select className="ml-2 rounded border p-1" value={sendTemplate} onChange={(e) => setSendTemplate(e.target.value as "initial" | "overdue")}>
              <option value="initial">Initial invoice — polite</option>
              <option value="overdue">Overdue follow-up — serious</option>
            </select>
          </label>
          <ul className="space-y-3">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="rounded border p-3 text-sm">
                <p className="font-semibold">{invoice.invoice_number} · {invoice.vendor_name} · {invoice.currency} {invoice.total.toFixed(2)}</p>
                <p>{invoice.issue_date} due {invoice.due_date} · {invoice.payment_terms} · {invoice.status}</p>
                {invoice.notes && <p className="mt-1 whitespace-pre-wrap text-slate-600">{invoice.notes}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className="rounded border px-2 py-1" onClick={() => void download(`/api/mer/invoices/${invoice.id}/pdf`, `${invoice.invoice_number}.pdf`)}>Download PDF</button>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={async () => {
                      setMsg("");
                      const res = await fetch(`/api/mer/invoices/${invoice.id}/send`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ template: sendTemplate }),
                      });
                      setMsg(res.ok ? `Sent ${invoice.invoice_number}` : await readError(res));
                    }}
                  >
                    Send with selected template
                  </button>
                  <button
                    className="rounded border px-2 py-1"
                    onClick={async () => {
                      await fetch("/api/mer/invoices", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ id: invoice.id, status: invoice.status === "paid" ? "unpaid" : "paid" }),
                      });
                      await loadData();
                    }}
                  >
                    Mark {invoice.status === "paid" ? "unpaid" : "paid"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {tab === "cash" && (
        <section className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-4">
            <select className="rounded border p-2" value={cashVendor} onChange={(e) => setCashVendor(e.target.value)}>
              <option value="">Vendor</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
              ))}
            </select>
            <input className="rounded border p-2" type="date" value={cashFrom} onChange={(e) => setCashFrom(e.target.value)} />
            <input className="rounded border p-2" type="date" value={cashTo} onChange={(e) => setCashTo(e.target.value)} />
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
            <div className="rounded border p-4 text-sm">
              <p className="font-semibold">{cash.vendor_name}</p>
              <p>Paid HKD {cash.paid.toFixed(2)}</p>
              <p>Unpaid HKD {cash.unpaid.toFixed(2)}</p>
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
            <input className="rounded border p-2" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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
          <table className="w-full text-left text-sm">
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
