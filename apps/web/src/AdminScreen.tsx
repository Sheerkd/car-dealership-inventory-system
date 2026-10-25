import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Vehicle = { id: string; make: string; model: string; category: string; price: string; quantity: number };
type Session = { accessToken: string; user: { name: string; role: "USER" | "ADMIN" } };
type VehicleForm = { make: string; model: string; category: string; price: string; quantity: string };
type Action = { kind: "create" } | { kind: "edit" | "restock" | "delete"; vehicle: Vehicle };

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
const blankForm: VehicleForm = { make: "", model: "", category: "", price: "", quantity: "0" };

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function api<T>(path: string, token: string, options: { method?: string; body?: object; signal?: AbortSignal } = {}): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: options.method || "GET",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error?.message || "Something went wrong. Please try again.");
  return data as T;
}

function normalizedPrice(input: string) {
  const value = input.trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fractional = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  if (normalizedWhole === "0" && Number(fractional || "0") === 0) return null;
  return `${normalizedWhole}.${fractional.padEnd(2, "0")}`;
}

function quantityValue(input: string, minimum: number) {
  const value = input.trim();
  if (!/^(?:0|[1-9]\d*)$/.test(value)) return null;
  const amount = Number(value);
  return Number.isInteger(amount) && amount >= minimum && amount <= 1_000_000 ? amount : null;
}

function currency(value: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
}

function VehicleFields({ form, setForm, editing }: { form: VehicleForm; setForm: (next: VehicleForm) => void; editing: boolean }) {
  function change(key: keyof VehicleForm, value: string) { setForm({ ...form, [key]: value }); }
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-semibold">Make<input className="form-input mt-2" data-initial-focus required maxLength={80} value={form.make} onChange={(event) => change("make", event.target.value)} placeholder="e.g. Toyota" /></label>
    <label className="text-sm font-semibold">Model<input className="form-input mt-2" required maxLength={80} value={form.model} onChange={(event) => change("model", event.target.value)} placeholder="e.g. Corolla" /></label>
    <label className="text-sm font-semibold">Category<input className="form-input mt-2" required maxLength={80} value={form.category} onChange={(event) => change("category", event.target.value)} placeholder="e.g. Sedan" /></label>
    <label className="text-sm font-semibold">Price<input className="form-input mt-2" type="number" min="0.01" max="9999999999.99" step="0.01" required value={form.price} onChange={(event) => change("price", event.target.value)} placeholder="₹ 0.00" /></label>
    {!editing && <label className="text-sm font-semibold">Quantity<input className="form-input mt-2" type="number" min="0" max="1000000" step="1" required value={form.quantity} onChange={(event) => change("quantity", event.target.value)} /></label>}
  </div>;
}

export function AdminScreen({ session, onLogout, onBrowse }: { session: Session; onLogout: () => void; onBrowse: () => void }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState<VehicleForm>(blankForm);
  const [stockAmount, setStockAmount] = useState("1");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!action) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      const trigger = triggerRef.current;
      (trigger?.isConnected ? trigger : addButtonRef.current)?.focus();
    };
  }, [action]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    api<{ vehicles: Vehicle[] }>("/api/vehicles", session.accessToken, { signal: controller.signal })
      .then(({ vehicles: next }) => setVehicles(next))
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) { onLogout(); return; }
        setLoadError(failure instanceof Error ? failure.message : "Could not load vehicles.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [session.accessToken, refresh, onLogout]);

  function open(next: Action, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setAction(next); setActionError(""); setNotice(""); setBusy(false);
    if (next.kind === "create") setForm(blankForm);
    if (next.kind === "edit") setForm({ ...next.vehicle, quantity: String(next.vehicle.quantity) });
    if (next.kind === "restock") setStockAmount("1");
  }

  function close() { if (!busy) { setAction(null); setActionError(""); } }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) { event.preventDefault(); dialogRef.current?.focus(); return; }
    if (!dialogRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function fail(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 401) { onLogout(); return; }
    setActionError(failure instanceof Error ? failure.message : "The change could not be saved.");
    if (failure instanceof ApiError && failure.status === 404) setRefresh((count) => count + 1);
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || (action.kind !== "create" && action.kind !== "edit") || busy) return;
    const make = form.make.trim(); const model = form.model.trim(); const category = form.category.trim();
    const price = normalizedPrice(form.price);
    if (![make, model, category].every((value) => value.length >= 1 && value.length <= 80) || !price) {
      setActionError("Enter a make, model, category, and a positive price with up to two decimal places."); return;
    }
    const details = { make, model, category, price };
    let body: typeof details | (typeof details & { quantity: number }) = details;
    if (action.kind === "create") {
      const quantity = quantityValue(form.quantity, 0);
      if (quantity === null) { setActionError("Quantity must be a whole number from 0 to 1,000,000."); return; }
      body = { ...details, quantity };
    }
    setBusy(true); setActionError("");
    try {
      if (action.kind === "create") {
        await api("/api/vehicles", session.accessToken, { method: "POST", body });
        setNotice(`${make} ${model} added to inventory.`);
      } else {
        await api(`/api/vehicles/${action.vehicle.id}`, session.accessToken, { method: "PUT", body });
        setNotice(`${make} ${model} updated.`);
      }
      setAction(null); setRefresh((count) => count + 1);
    } catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }

  async function addStock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || action.kind !== "restock" || busy) return;
    const quantity = quantityValue(stockAmount, 1);
    if (quantity === null) { setActionError("Units to add must be a whole number from 1 to 1,000,000."); return; }
    setBusy(true); setActionError("");
    try {
      await api(`/api/vehicles/${action.vehicle.id}/restock`, session.accessToken, { method: "POST", body: { quantity } });
      setNotice(`${quantity} ${quantity === 1 ? "unit" : "units"} added to ${action.vehicle.make} ${action.vehicle.model}.`);
      setAction(null); setRefresh((count) => count + 1);
    } catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }

  async function deleteVehicle() {
    if (!action || action.kind !== "delete" || busy) return;
    const vehicle = action.vehicle;
    setBusy(true); setActionError("");
    try {
      await api(`/api/vehicles/${vehicle.id}`, session.accessToken, { method: "DELETE" });
      setNotice(`${vehicle.make} ${vehicle.model} deleted.`);
      setAction(null); setRefresh((count) => count + 1);
    } catch (failure) { fail(failure); }
    finally { setBusy(false); }
  }

  const visible = vehicles.filter((vehicle) => `${vehicle.make} ${vehicle.model} ${vehicle.category}`.toLowerCase().includes(query.trim().toLowerCase()));
  const stockUnits = vehicles.reduce((sum, vehicle) => sum + vehicle.quantity, 0);
  const soldOut = vehicles.filter((vehicle) => vehicle.quantity === 0).length;

  return <div className="min-h-screen bg-[#f6f8f5] text-[#17312d]">
    <header className="border-b border-[#e1e8e2] bg-white"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#173c38] text-[#d9ed82]" aria-hidden="true">◆</span><span className="text-lg font-bold tracking-[-0.04em]">motive<span className="text-[#527237]">.</span></span><span className="ml-2 rounded-full bg-[#edf3e9] px-3 py-1 text-xs font-bold uppercase tracking-[0.1em] text-[#436b55]">Admin</span></div>
      <div className="flex items-center gap-3"><span className="hidden text-sm text-[#526e65] md:block">Hello, <strong className="text-[#17312d]">{session.user.name.split(" ")[0]}</strong></span><button type="button" onClick={onBrowse} className="rounded-xl border border-[#d8e2da] px-4 py-2.5 text-sm font-semibold hover:bg-[#f3f7f1]">Browse inventory</button><button type="button" onClick={onLogout} className="rounded-xl border border-[#d8e2da] px-4 py-2.5 text-sm font-semibold hover:bg-[#f3f7f1]">Sign out</button></div>
    </div></header>
    <main><section className="bg-[#173c38] text-white"><div className="mx-auto max-w-[1280px] px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d9ed82]">ADMIN WORKSPACE</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.05em] sm:text-5xl">Manage inventory</h1><p className="mt-4 max-w-xl text-[#bdd3ce]">Keep vehicle details, availability, and stock levels up to date.</p></div></section>
      <div className="mx-auto max-w-[1280px] px-5 pb-20 sm:px-8"><div className="relative -mt-6 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#526e65]">Listings</p><p className="mt-2 text-3xl font-semibold">{vehicles.length}</p></div><div className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#526e65]">Units in stock</p><p className="mt-2 text-3xl font-semibold">{stockUnits}</p></div><div className="rounded-2xl border border-[#e2e9e3] bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#526e65]">Sold out</p><p className="mt-2 text-3xl font-semibold">{soldOut}</p></div></div>
        <div className="mt-9 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#526e65]">YOUR CATALOGUE</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Vehicle listings</h2></div><button ref={addButtonRef} type="button" onClick={(event) => open({ kind: "create" }, event.currentTarget)} className="primary-button">Add vehicle<span aria-hidden="true">＋</span></button></div>
        <label className="mt-6 block max-w-lg text-sm font-semibold">Find a vehicle<input className="form-input mt-2" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search make, model, or category" /></label>
        {notice && <p role="status" className="mt-6 rounded-2xl border border-[#cde7cd] bg-[#edf8e9] px-5 py-4 text-sm font-medium text-[#286348]">{notice}</p>}
        {loadError && <div role="alert" className="mt-6 rounded-2xl border border-[#f0d5cd] bg-[#fff2ed] px-5 py-4 text-sm text-[#a43925]">{loadError} <button type="button" onClick={() => setRefresh((count) => count + 1)} className="ml-2 font-semibold underline">Try again</button></div>}
        {loading ? <p role="status" className="py-16 text-center text-[#526e65]">Loading vehicles...</p> : visible.length === 0 ? <div className="mt-6 rounded-[24px] border border-dashed border-[#cad9ce] bg-white px-6 py-16 text-center"><h3 className="text-xl font-semibold">No vehicles found</h3><p className="mt-2 text-[#526e65]">{vehicles.length === 0 ? "Add the first vehicle to get started." : "Try another search term."}</p></div> : <div className="mt-6 grid gap-5 lg:grid-cols-2">{visible.map((vehicle) => <article key={vehicle.id} aria-label={`${vehicle.make} ${vehicle.model}`} className="rounded-[24px] border border-[#e0e8e2] bg-white p-6 shadow-[0_15px_40px_-25px_rgba(18,49,41,0.35)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#526e65]">{vehicle.make} · {vehicle.category}</p><h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{vehicle.model}</h3></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${vehicle.quantity === 0 ? "bg-[#f8eeeb] text-[#a65441]" : "bg-[#eaf4e4] text-[#377b43]"}`}>{vehicle.quantity === 0 ? "Out of stock" : `${vehicle.quantity} available`}</span></div><div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-[#edf1ed] pt-5"><div><p className="text-xs text-[#526e65]">Price</p><p className="mt-1 text-xl font-bold">{currency(vehicle.price)}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={(event) => open({ kind: "edit", vehicle }, event.currentTarget)} aria-label={`Edit ${vehicle.make} ${vehicle.model}`} className="rounded-xl border border-[#d8e2da] px-4 py-2.5 text-sm font-semibold hover:bg-[#f3f7f1]">Edit</button><button type="button" onClick={(event) => open({ kind: "restock", vehicle }, event.currentTarget)} aria-label={`Restock ${vehicle.make} ${vehicle.model}`} className="rounded-xl border border-[#d8e2da] px-4 py-2.5 text-sm font-semibold hover:bg-[#f3f7f1]">Restock</button><button type="button" onClick={(event) => open({ kind: "delete", vehicle }, event.currentTarget)} aria-label={`Delete ${vehicle.make} ${vehicle.model}`} className="rounded-xl border border-[#efd7d0] px-4 py-2.5 text-sm font-semibold text-[#a43925] hover:bg-[#fff2ed]">Delete</button></div></div></article>)}</div>}
      </div></main>
    {action && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#122e2a]/65 px-4 py-8 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="admin-action-title" aria-describedby={action.kind === "delete" ? "admin-action-description" : undefined} tabIndex={-1} onKeyDown={handleDialogKeyDown} className="w-full max-w-[620px] rounded-[26px] bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#526e65]">INVENTORY ACTION</p><h2 id="admin-action-title" className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{action.kind === "create" ? "Add vehicle" : action.kind === "edit" ? "Edit vehicle" : action.kind === "restock" ? `Restock ${action.vehicle.make} ${action.vehicle.model}` : `Delete ${action.vehicle.make} ${action.vehicle.model}?`}</h2></div><button type="button" onClick={close} disabled={busy} aria-label="Close dialog" className="rounded-full px-2 py-1 text-2xl leading-none text-[#526e65] hover:bg-[#f1f5f0]">×</button></div>
      {action.kind === "create" || action.kind === "edit" ? <form onSubmit={saveVehicle} className="mt-6"><VehicleFields form={form} setForm={setForm} editing={action.kind === "edit"} />{actionError && <p role="alert" className="mt-5 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a43925]">{actionError}</p>}<div className="mt-7 flex flex-wrap justify-end gap-3"><button type="button" onClick={close} disabled={busy} className="rounded-xl border border-[#d8e2da] px-5 py-3 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy} className="primary-button disabled:opacity-60">{busy ? "Saving..." : action.kind === "create" ? "Create vehicle" : "Save changes"}</button></div></form> : action.kind === "restock" ? <form onSubmit={addStock} className="mt-6"><p className="text-sm text-[#526e65]">Current stock: <strong className="text-[#17312d]">{action.vehicle.quantity}</strong></p><label className="mt-5 block text-sm font-semibold">Units to add<input data-initial-focus className="form-input mt-2" type="number" min="1" max="1000000" step="1" required value={stockAmount} onChange={(event) => setStockAmount(event.target.value)} /></label>{actionError && <p role="alert" className="mt-5 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a43925]">{actionError}</p>}<div className="mt-7 flex flex-wrap justify-end gap-3"><button type="button" onClick={close} disabled={busy} className="rounded-xl border border-[#d8e2da] px-5 py-3 text-sm font-semibold">Cancel</button><button type="submit" disabled={busy} className="primary-button disabled:opacity-60">{busy ? "Adding..." : "Add stock"}</button></div></form> : <div className="mt-6"><p id="admin-action-description" className="leading-7 text-[#526e65]">This removes the listing from the catalogue. This action cannot be undone from the app.</p>{actionError && <p role="alert" className="mt-5 rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a43925]">{actionError}</p>}<div className="mt-7 flex flex-wrap justify-end gap-3"><button type="button" data-initial-focus onClick={close} disabled={busy} className="rounded-xl border border-[#d8e2da] px-5 py-3 text-sm font-semibold">Cancel</button><button type="button" onClick={deleteVehicle} disabled={busy} className="rounded-xl bg-[#a43925] px-5 py-3 text-sm font-semibold text-white hover:bg-[#8e2d1b] disabled:opacity-60">{busy ? "Deleting..." : "Confirm delete"}</button></div></div>}
    </div></div>}
  </div>;
}
