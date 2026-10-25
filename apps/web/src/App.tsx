import { useEffect, useState, type FormEvent } from "react";
import { AdminScreen } from "./AdminScreen";

type User = { id: string; name: string; email: string; role: "USER" | "ADMIN" };
type Vehicle = { id: string; make: string; model: string; category: string; price: string; quantity: number };
type SearchResult = { vehicles: Vehicle[]; total: number; page: number; pageSize: number; totalPages: number };
type Filters = { make: string; model: string; category: string; minPrice: string; maxPrice: string; inStock: boolean; sort: string };
type Session = { accessToken: string; user: User };

const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "");
const emptyFilters: Filters = { make: "", model: "", category: "", minPrice: "", maxPrice: "", inStock: false, sort: "newest" };

class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function api<T>(path: string, options: { method?: string; body?: object; token?: string; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      signal: options.signal,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (failure) {
    if (options.signal?.aborted) throw failure;
    throw new Error("Could not connect to the server. Please try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, data?.error?.message || "Something went wrong. Please try again.");
  return data as T;
}

function inventoryPath(filters: Filters, page: number) {
  const query = new URLSearchParams({ page: String(page), pageSize: "12", sort: filters.sort });
  for (const key of ["make", "model", "category", "minPrice", "maxPrice"] as const) {
    const value = filters[key].trim();
    if (value) query.set(key, value);
  }
  if (filters.inStock) query.set("inStock", "true");
  return `/api/vehicles/search?${query.toString()}`;
}

function formatPrice(value: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
}

function Brand({ light = false }: { light?: boolean }) {
  return <div className={`flex items-center gap-3 ${light ? "text-white" : "text-[#162522]"}`}>
    <span className={`flex h-10 w-10 items-center justify-center rounded-[14px] ${light ? "bg-[#d9ed82] text-[#163b36]" : "bg-[#173c38] text-[#d9ed82]"}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 21h22M8 21l2-8a3 3 0 0 1 3-2h6a3 3 0 0 1 3 2l2 8M10 11l-2 3M22 11l2 3" /><circle cx="10" cy="22" r="2" fill="currentColor" /><circle cx="22" cy="22" r="2" fill="currentColor" /></svg>
    </span><span className="text-lg font-bold tracking-[-0.04em]">motive<span className={light ? "text-[#d9ed82]" : "text-[#527237]"}>.</span></span>
  </div>;
}

function CarIllustration({ color = "#1d5753" }: { color?: string }) {
  return <svg viewBox="0 0 360 160" aria-hidden="true" className="mx-auto w-full max-w-[310px] drop-shadow-xl">
    <ellipse cx="183" cy="133" rx="139" ry="11" fill="#183c38" opacity=".12" />
    <path d="M37 99c4-7 18-11 31-13l31-6 26-34c5-7 13-10 23-10h89c10 0 16 4 21 11l21 32 31 7c12 3 19 10 20 20l2 14H31l2-12c0-4 1-7 4-9Z" fill={color} />
    <path d="m115 77 22-28c3-4 8-6 14-6h32v34Zm76 0V43h43c6 0 9 2 12 6l17 28Z" fill="#c9e4df" opacity=".88" />
    <path d="M45 90h269" stroke="#fff" strokeOpacity=".24" strokeWidth="2" /><rect x="35" y="100" width="23" height="7" rx="3" fill="#e6d8ac" /><rect x="307" y="100" width="17" height="7" rx="3" fill="#f5b8a2" />
    <path d="M30 119h305" stroke="#15312e" strokeWidth="5" strokeLinecap="round" /><circle cx="93" cy="119" r="18" fill="#1b272a" /><circle cx="93" cy="119" r="9" fill="#dce4e2" /><circle cx="277" cy="119" r="18" fill="#1b272a" /><circle cx="277" cy="119" r="9" fill="#dce4e2" />
  </svg>;
}

function AuthScreen({ onLogin, initialNotice }: { onLogin: (session: Session) => void; initialNotice: string }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(initialNotice);

  function changeMode(next: "login" | "register") { setMode(next); setError(""); setNotice(""); setPassword(""); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      if (mode === "register") {
        await api("/api/auth/register", { method: "POST", body: { name, email, password } });
        setPassword(""); setMode("login"); setNotice("Account created. Sign in to continue.");
      } else {
        onLogin(await api<Session>("/api/auth/login", { method: "POST", body: { email, password } }));
      }
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Unable to continue. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="min-h-screen bg-[#f6f8f5] text-[#17312d]"><div className="mx-auto flex min-h-screen max-w-[1600px] flex-col lg:flex-row">
    <section className="relative flex min-h-[330px] flex-col justify-between overflow-hidden bg-[#173c38] px-7 py-7 text-white sm:px-10 lg:min-h-screen lg:w-[52%] lg:px-16 lg:py-11">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full border border-white/10" /><div className="pointer-events-none absolute -right-20 top-20 h-96 w-96 rounded-full border border-white/10" />
      <Brand light /><div className="relative z-10 mb-3 mt-16 max-w-[620px] lg:my-auto">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#d9ed82]"><span className="h-1.5 w-1.5 rounded-full bg-[#d9ed82]" /> A better way to browse</div>
        <h1 className="max-w-[600px] text-4xl font-semibold leading-[1.08] tracking-[-0.055em] sm:text-5xl lg:text-[clamp(3.6rem,5.2vw,5.8rem)]">Find a car that feels like yours.</h1>
        <p className="mt-5 max-w-lg text-base leading-7 text-[#bdd3ce] sm:text-lg">Explore available vehicles, compare what matters, and take the next step with confidence.</p>
        <div className="hidden max-w-[550px] pt-4 sm:block"><CarIllustration color="#d6e78b" /></div>
      </div><p className="relative z-10 hidden text-sm text-[#bdd3ce] lg:block">A simpler route to your next drive.</p>
    </section>
    <section className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:px-16"><div className="w-full max-w-[460px]">
      <div className="mb-9 flex items-center gap-2 text-sm font-semibold text-[#526b63]"><span className="h-[1px] w-8 bg-[#93aa9e]" /> YOUR JOURNEY STARTS HERE</div>
      <h2 className="text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
      <p className="mt-3 text-[#526b63]">{mode === "login" ? "Sign in to explore the latest inventory." : "Join to browse and purchase available vehicles."}</p>
      <div className="mt-8 flex rounded-2xl bg-[#e8eee9] p-1" aria-label="Account options">
        <button type="button" aria-pressed={mode === "login"} onClick={() => changeMode("login")} className={`w-1/2 rounded-[13px] px-4 py-3 text-sm font-semibold transition ${mode === "login" ? "bg-white text-[#173c38] shadow-sm" : "text-[#526b63] hover:text-[#173c38]"}`}>Sign in</button>
        <button type="button" aria-pressed={mode === "register"} onClick={() => changeMode("register")} className={`w-1/2 rounded-[13px] px-4 py-3 text-sm font-semibold transition ${mode === "register" ? "bg-white text-[#173c38] shadow-sm" : "text-[#526b63] hover:text-[#173c38]"}`}>Register</button>
      </div>
      <form onSubmit={submit} className="mt-8 space-y-5">
        {mode === "register" && <label className="block text-sm font-semibold">Name<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(event) => setName(event.target.value)} className="form-input mt-2" placeholder="Your full name" /></label>}
        <label className="block text-sm font-semibold">Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="form-input mt-2" placeholder="you@example.com" /></label>
        <label className="block text-sm font-semibold">Password<input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 12 : 1} maxLength={mode === "register" ? 128 : undefined} value={password} onChange={(event) => setPassword(event.target.value)} className="form-input mt-2" placeholder={mode === "register" ? "At least 12 characters" : "Enter your password"} /></label>
        {error && <p role="alert" className="rounded-xl bg-[#fff0eb] px-4 py-3 text-sm text-[#a43925]">{error}</p>}{notice && <p role="status" className="rounded-xl bg-[#e9f4e8] px-4 py-3 text-sm text-[#286348]">{notice}</p>}
        <button type="submit" disabled={busy} className="primary-button w-full disabled:cursor-wait disabled:opacity-60">{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Register"}<span aria-hidden="true">→</span></button>
      </form>
    </div></section>
  </div></div>;
}

function VehicleCard({ vehicle, purchasing, onPurchase }: { vehicle: Vehicle; purchasing: boolean; onPurchase: (vehicle: Vehicle) => void }) {
  const soldOut = vehicle.quantity === 0;
  const hue = vehicle.category.toLowerCase().includes("suv") ? "from-[#e8edf4] to-[#d4e3e8]" : vehicle.category.toLowerCase().includes("hatch") ? "from-[#f2ebdf] to-[#e1ded3]" : "from-[#e7f0e8] to-[#dce8da]";
  return <article className="overflow-hidden rounded-[24px] border border-[#e0e8e2] bg-white shadow-[0_15px_40px_-25px_rgba(18,49,41,0.35)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_45px_-25px_rgba(18,49,41,0.45)]">
    <div className={`relative flex h-48 items-center justify-center bg-gradient-to-br ${hue} px-6`}><span className="absolute left-5 top-5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#365e54]">{vehicle.category}</span><CarIllustration /></div>
    <div className="p-6"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#526b63]">{vehicle.make}</p><h3 className="mt-1 text-2xl font-semibold tracking-[-0.04em] text-[#17312d]">{vehicle.model}</h3></div><span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${soldOut ? "bg-[#f8eeeb] text-[#a65441]" : "bg-[#eaf4e4] text-[#377b43]"}`}>{soldOut ? "Out of stock" : `${vehicle.quantity} available`}</span></div>
      <div className="mt-6 flex items-end justify-between gap-3 border-t border-[#edf1ed] pt-5"><div><p className="text-xs text-[#526b63]">Starting at</p><p className="mt-0.5 text-xl font-bold tracking-[-0.04em] text-[#17312d]">{formatPrice(vehicle.price)}</p></div><button type="button" aria-label={`${purchasing ? "Purchasing" : "Purchase"} ${vehicle.make} ${vehicle.model}`} onClick={() => onPurchase(vehicle)} disabled={soldOut || purchasing} className="rounded-xl bg-[#173c38] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#28564e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173c38] disabled:cursor-not-allowed disabled:bg-[#dbe3dc] disabled:text-[#4e665e]">{purchasing ? "Purchasing..." : "Purchase"}</button></div>
    </div>
  </article>;
}

function InventoryScreen({ session, onLogout, onManage }: { session: Session; onLogout: (reason?: string) => void; onManage?: () => void }) {
  const [draft, setDraft] = useState<Filters>(emptyFilters);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchaseError, setPurchaseError] = useState("");
  const [notice, setNotice] = useState("");
  const [purchasingId, setPurchasingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setResult(null);
    api<SearchResult>(inventoryPath(filters, page), { token: session.accessToken, signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, next.totalPages);
        if (page > lastPage) { setPage(lastPage); return; }
        setResult(next);
      })
      .catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiError && failure.status === 401) { onLogout("Your session expired. Sign in again."); return; }
        setError(failure instanceof Error ? failure.message : "Could not load inventory.");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, page, refresh, session.accessToken, onLogout]);

  function updateDraft(key: keyof Filters, value: string | boolean) { setDraft((current) => ({ ...current, [key]: value })); }
  function search(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setNotice(""); setPurchaseError(""); setPage(1); setFilters({ ...draft }); }
  function clearFilters() { setDraft(emptyFilters); setFilters(emptyFilters); setPurchaseError(""); setPage(1); }

  async function purchase(vehicle: Vehicle) {
    setPurchasingId(vehicle.id); setError(""); setPurchaseError(""); setNotice("");
    try {
      const updated = await api<{ vehicle: Vehicle }>(`/api/vehicles/${vehicle.id}/purchase`, { method: "POST", token: session.accessToken });
      setResult((current) => current ? { ...current, vehicles: current.vehicles.map((item) => item.id === vehicle.id ? updated.vehicle : item) } : current);
      setNotice(`${vehicle.make} ${vehicle.model} purchased. Inventory updated.`);
      setRefresh((count) => count + 1);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 401) { onLogout("Your session expired. Sign in again."); return; }
      setPurchaseError(failure instanceof Error ? failure.message : "Purchase could not be completed.");
      if (failure instanceof ApiError && (failure.status === 409 || failure.status === 404)) setRefresh((count) => count + 1);
    } finally { setPurchasingId(null); }
  }

  return <div className="min-h-screen bg-[#f6f8f5] text-[#17312d]">
    <header className="border-b border-[#e1e8e2] bg-white/90"><div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-4 sm:px-8"><Brand /><div className="flex items-center gap-4"><span className="hidden text-sm text-[#526b63] sm:block">Hello, <strong className="text-[#17312d]">{session.user.name.split(" ")[0]}</strong></span>{onManage && <button type="button" onClick={onManage} className="rounded-xl border border-[#d8e2da] px-4 py-2.5 text-sm font-semibold transition hover:bg-[#f3f7f1]">Manage inventory</button>}<button type="button" onClick={() => onLogout()} className="rounded-xl border border-[#d8e2da] px-4 py-2.5 text-sm font-semibold transition hover:bg-[#f3f7f1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173c38]">Sign out</button></div></div></header>
    <main><section className="overflow-hidden bg-[#173c38] text-white"><div className="relative mx-auto max-w-[1280px] px-5 py-14 sm:px-8 sm:py-16"><div className="pointer-events-none absolute -right-16 -top-32 h-96 w-96 rounded-full border border-white/10" /><p className="text-xs font-bold uppercase tracking-[0.2em] text-[#d9ed82]">THE COLLECTION</p><h1 className="mt-4 max-w-[660px] text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">Explore inventory</h1><p className="mt-4 max-w-[540px] text-base leading-7 text-[#bdd3ce]">Browse the cars currently available and find the right fit for your next journey.</p></div></section>
      <div className="mx-auto max-w-[1280px] px-5 pb-20 sm:px-8">
        <form onSubmit={search} className="relative -mt-7 rounded-[24px] border border-[#e2e9e3] bg-white p-5 shadow-[0_20px_50px_-30px_rgba(18,49,41,0.36)] sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-[-0.03em]">Find your fit</h2><p className="mt-1 text-sm text-[#526b63]">Search by the details that matter to you.</p></div><button type="button" onClick={clearFilters} className="text-sm font-semibold text-[#397568] underline-offset-4 hover:underline">Clear filters</button></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-sm font-semibold">Make<input className="form-input mt-2" value={draft.make} onChange={(event) => updateDraft("make", event.target.value)} placeholder="e.g. Toyota" /></label>
            <label className="text-sm font-semibold">Model<input className="form-input mt-2" value={draft.model} onChange={(event) => updateDraft("model", event.target.value)} placeholder="e.g. Corolla" /></label>
            <label className="text-sm font-semibold">Category<input className="form-input mt-2" value={draft.category} onChange={(event) => updateDraft("category", event.target.value)} placeholder="e.g. Sedan" /></label>
            <label className="text-sm font-semibold">Min price<input type="number" min="0" step="0.01" className="form-input mt-2" value={draft.minPrice} onChange={(event) => updateDraft("minPrice", event.target.value)} placeholder="₹ Min" /></label>
            <label className="text-sm font-semibold">Max price<input type="number" min="0" step="0.01" className="form-input mt-2" value={draft.maxPrice} onChange={(event) => updateDraft("maxPrice", event.target.value)} placeholder="₹ Max" /></label>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-[#edf1ed] pt-5"><div className="flex flex-wrap items-center gap-5"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={draft.inStock} onChange={(event) => updateDraft("inStock", event.target.checked)} className="h-4 w-4 accent-[#173c38]" />In stock</label><label className="flex items-center gap-2 text-sm font-semibold">Sort by<select value={draft.sort} onChange={(event) => updateDraft("sort", event.target.value)} className="rounded-lg border border-[#dce6de] bg-white px-3 py-2 text-sm font-medium text-[#17312d]"><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label></div><button type="submit" className="primary-button min-w-36">Search<span aria-hidden="true">→</span></button></div>
        </form>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#526b63]">AVAILABLE VEHICLES</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">Discover your next car</h2></div><p aria-live="polite" className="text-sm text-[#526b63]">{result ? `${result.total} ${result.total === 1 ? "vehicle" : "vehicles"} found` : ""}</p></div>
        {notice && <p role="status" className="mt-6 rounded-2xl border border-[#cde7cd] bg-[#edf8e9] px-5 py-4 text-sm font-medium text-[#286348]">{notice}</p>}
        {purchaseError && <p role="alert" className="mt-6 rounded-2xl border border-[#f0d5cd] bg-[#fff2ed] px-5 py-4 text-sm text-[#a43925]">{purchaseError}</p>}
        {error && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#f0d5cd] bg-[#fff2ed] px-5 py-4 text-sm text-[#a43925]"><span>{error}</span><button type="button" onClick={() => setRefresh((count) => count + 1)} className="font-semibold underline underline-offset-4">Try again</button></div>}
        {loading && <p role="status" className="py-14 text-center text-[#526b63]">Loading vehicles...</p>}
        {!loading && result?.vehicles.length === 0 && <div className="mt-6 rounded-[24px] border border-dashed border-[#cad9ce] bg-white px-6 py-16 text-center"><h3 className="text-xl font-semibold">No vehicles found</h3><p className="mt-2 text-[#526b63]">Try adjusting your filters to see more options.</p></div>}
        {!loading && result && result.vehicles.length > 0 && <div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{result.vehicles.map((vehicle) => <VehicleCard key={vehicle.id} vehicle={vehicle} purchasing={purchasingId === vehicle.id} onPurchase={purchase} />)}</div>}
        {!loading && result && result.totalPages > 1 && <nav aria-label="Inventory pages" className="mt-9 flex items-center justify-center gap-4"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-xl border border-[#d8e2da] bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="text-sm text-[#526b63]">Page {page} of {result.totalPages}</span><button type="button" disabled={page >= result.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-xl border border-[#d8e2da] bg-white px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button></nav>}
      </div>
    </main>
  </div>;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [adminView, setAdminView] = useState<"manage" | "browse">("manage");
  const [authNotice, setAuthNotice] = useState("");
  function logout(reason?: string) { setAuthNotice(reason ?? ""); setSession(null); setAdminView("manage"); }
  function login(next: Session) { setAuthNotice(""); setSession(next); setAdminView("manage"); }
  if (!session) return <AuthScreen onLogin={login} initialNotice={authNotice} />;
  if (session.user.role === "ADMIN" && adminView === "manage") {
    return <AdminScreen session={session} onLogout={() => logout()} onBrowse={() => setAdminView("browse")} />;
  }
  return <InventoryScreen session={session} onLogout={logout} onManage={session.user.role === "ADMIN" ? () => setAdminView("manage") : undefined} />;
}

export default App;
