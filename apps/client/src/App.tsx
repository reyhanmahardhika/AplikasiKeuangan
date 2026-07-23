import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ArrowUp,
  Bell,
  Bot,
  Briefcase,
  Bus,
  Camera,
  ChevronRight,
  CheckCircle2,
  CircleDollarSign,
  CircleMinus,
  CirclePlus,
  CreditCard,
  Download,
  FileSpreadsheet,
  Film,
  GraduationCap,
  HeartPulse,
  Home,
  LayoutDashboard,
  LineChart,
  Loader2,
  LogOut,
  Plus,
  ReceiptText,
  Search,
  Settings,
  Sparkles,
  ShoppingBag,
  Store,
  Tags,
  Trash2,
  TrendingUp,
  Upload,
  Utensils,
  UserRound,
  Wallet,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { ApiError, apiFetch, downloadUrl, type Session } from "./lib/api";
import { isoDateInput, localDate, rupiah } from "./lib/format";

type View =
  | "dashboard"
  | "manual"
  | "receipt"
  | "history"
  | "transactionDetail"
  | "accounts"
  | "categories"
  | "budgets"
  | "manage"
  | "reports"
  | "assistant"
  | "profile";

type Account = {
  id: string;
  name: string;
  accountType: string;
  currentBalance: string;
  initialBalance: string;
  currency: string;
  allowNegative: boolean;
  isActive: boolean;
};

type Category = {
  id: string;
  name: string;
  categoryType: "income" | "expense";
  icon: string;
  isDefault: boolean;
};

type Transaction = {
  id: string;
  transactionType: "income" | "expense";
  transactionDate: string;
  amount: string;
  categoryName?: string;
  accountName?: string;
  merchantName?: string;
  paymentMethod?: string;
  notes?: string;
  sourceType?: string;
};

type TransactionDetail = Transaction & {
  accountId: string;
  categoryId?: string;
  items?: Array<{ itemName: string; quantity: string; unitPrice: string; totalPrice: string }>;
};

type DashboardSummary = {
  balance: string;
  incomeThisMonth: string;
  expenseThisMonth: string;
  daily: Array<{ date: string; income: string; expense: string }>;
  expenseByCategory: Array<{ category: string; total: string }>;
  lastTransactions: Transaction[];
  budgetAlerts: Array<{ id: string; category: string; usagePercent: string }>;
};

type ManualDraft = {
  accountId: string;
  transactionDate: string;
  amount: string;
  categoryId: string;
  merchantName: string;
  paymentMethod: string;
  notes: string;
};

type ParsedManualTransaction = {
  transactionType: "income" | "expense";
  transactionDate: string;
  amount: string;
  categoryId: string | null;
  categoryName: string | null;
  accountId: string | null;
  accountName: string | null;
  merchantName: string | null;
  paymentMethod: string | null;
  notes: string;
  confidenceScore: number;
  reviewFields: string[];
  interpretedText: string;
};

const savedSession = localStorage.getItem("finance-session");

function moneyInputValue(value: string | null | undefined) {
  return value?.replace(/\.00$/, "") ?? "";
}

function dateFilterIso(value: string, boundary: "start" | "end") {
  const date = new Date(`${value}T00:00:00`);
  if (boundary === "end") date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

const navigation: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "manual", label: "Tambah", icon: Plus },
  { id: "receipt", label: "Scan struk", icon: Camera },
  { id: "history", label: "Riwayat", icon: ReceiptText },
  { id: "accounts", label: "Akun", icon: Wallet },
  { id: "categories", label: "Kategori", icon: Tags },
  { id: "budgets", label: "Anggaran", icon: CircleDollarSign },
  { id: "reports", label: "Laporan", icon: LineChart },
  { id: "assistant", label: "Assistant", icon: Bot },
  { id: "profile", label: "Profil", icon: Settings }
];

const mobileNavigation: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Beranda", icon: Home },
  { id: "history", label: "Transaksi", icon: ReceiptText },
  { id: "reports", label: "Insight", icon: LineChart },
  { id: "manage", label: "Kelola", icon: Wallet }
];

function App() {
  const [session, setSession] = useState<Session | null>(() => (savedSession ? JSON.parse(savedSession) : null));
  const [view, setView] = useState<View>("dashboard");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [editing, setEditing] = useState<TransactionDetail | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [historyFocusTransactionId, setHistoryFocusTransactionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const token = session?.accessToken;

  const clearSession = (message?: string) => {
    setSession(null);
    setAccounts([]);
    setCategories([]);
    setDashboard(null);
    if (message) setNotice(message);
  };

  const refreshAccessToken = async () => {
    if (!session?.refreshToken) {
      throw new Error("Refresh token tidak tersedia");
    }

    const refreshed = await apiFetch<{ user: Session["user"]; accessToken: string }>("/auth/refresh-token", undefined, {
      method: "POST",
      body: JSON.stringify({ refreshToken: session.refreshToken })
    });
    const nextSession = {
      ...session,
      user: refreshed.user,
      accessToken: refreshed.accessToken
    };
    setSession(nextSession);
    localStorage.setItem("finance-session", JSON.stringify(nextSession));
    return nextSession.accessToken;
  };

  const request = async <T,>(path: string, options: RequestInit = {}) => {
    try {
      return await apiFetch<T>(path, session?.accessToken, options);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && session?.refreshToken && path !== "/auth/refresh-token") {
        try {
          const refreshedToken = await refreshAccessToken();
          return await apiFetch<T>(path, refreshedToken, options);
        } catch {
          clearSession("Sesi sudah berakhir. Silakan login kembali.");
          throw new Error("Sesi sudah berakhir. Silakan login kembali.");
        }
      }
      throw error;
    }
  };

  const refreshCore = async () => {
    if (!token) return;
    const [nextAccounts, nextCategories, nextDashboard] = await Promise.all([
      request<Account[]>("/accounts"),
      request<Category[]>("/categories"),
      request<DashboardSummary>("/dashboard/summary")
    ]);
    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setDashboard(nextDashboard);
  };

  useEffect(() => {
    if (session) {
      localStorage.setItem("finance-session", JSON.stringify(session));
      refreshCore().catch((error) => setNotice(error.message));
    } else {
      localStorage.removeItem("finance-session");
    }
  }, [session?.accessToken]);

  useEffect(() => {
    const updateScrollButton = () => setShowScrollTop(window.scrollY > 360);
    updateScrollButton();
    window.addEventListener("scroll", updateScrollButton, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollButton);
  }, []);

  if (!session) {
    return <AuthView onSignedIn={setSession} />;
  }

  const navigate = (nextView: View) => {
    if (nextView === "manual" || view === "manual" || nextView !== "transactionDetail") {
      setEditing(null);
    }
    if (nextView !== "transactionDetail") {
      setSelectedTransaction(null);
    }
    setView(nextView);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openTransactionDetail = async (id: string) => {
    const detail = await request<TransactionDetail>(`/transactions/${id}`);
    setSelectedTransaction(detail);
    setEditing(null);
    setView("transactionDetail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startEditingTransaction = () => {
    if (!selectedTransaction) return;
    setEditing(selectedTransaction);
    setView("manual");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const removeTransaction = async (id: string) => {
    if (!window.confirm("Hapus transaksi ini?")) return;
    await request(`/transactions/${id}`, { method: "DELETE" });
    setSelectedTransaction(null);
    await refreshCore();
    setView("history");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pageTitle =
    navigation.find((item) => item.id === view)?.label ??
    mobileNavigation.find((item) => item.id === view)?.label ??
    "Detail transaksi";

  return (
    <div className="min-h-screen bg-[#f4f8ff] text-slate-950 lg:bg-slate-100 lg:text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#00b817] text-white">
            <Wallet size={22} />
          </div>
          <div>
            <p className="text-sm font-bold">Keuangan AI</p>
            <p className="text-xs text-slate-500">Ledger pribadi</p>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition ${
                  active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 hidden border-b border-slate-200 bg-white/95 backdrop-blur lg:block">
          <div className="flex min-h-16 items-center justify-between px-8 py-3">
            <div>
              <h1 className="text-xl font-bold">{pageTitle}</h1>
              <p className="text-sm text-slate-500">{session.user.fullName} Â· {session.user.email}</p>
            </div>
            <button
              className="btn-secondary"
              onClick={() => {
                clearSession();
              }}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        </header>

        <MobileTopBar userName={session.user.fullName} onProfile={() => navigate("profile")} />

        {notice && (
          <div className="mx-4 mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:mx-8">
            {notice}
          </div>
        )}

        <main
          className={
            view === "assistant"
              ? "fixed inset-x-0 bottom-24 top-[4.25rem] overflow-hidden px-4 py-2 lg:static lg:inset-auto lg:overflow-visible lg:px-8 lg:py-6"
              : "px-4 pb-28 pt-3 lg:px-8 lg:py-6"
          }
        >
          {view === "dashboard" && (
            <DashboardView
              dashboard={dashboard}
              onAdd={() => navigate("manual")}
              onScan={() => navigate("receipt")}
              onAssistant={() => navigate("assistant")}
            />
          )}
          {view === "manual" && (
            <ManualTransactionView
              accounts={accounts}
              categories={categories}
              editing={editing}
              request={request}
              onScan={() => navigate("receipt")}
              onCancel={() => {
                if (editing && selectedTransaction) {
                  navigate("transactionDetail");
                } else {
                  navigate("history");
                }
              }}
              onDone={async () => {
                const editedId = editing?.id;
                setEditing(null);
                await refreshCore();
                if (editedId) {
                  const updated = await request<TransactionDetail>(`/transactions/${editedId}`);
                  setSelectedTransaction(updated);
                  setView("transactionDetail");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                } else {
                  navigate("history");
                }
              }}
            />
          )}
          {view === "receipt" && (
            <ReceiptView accounts={accounts} categories={categories} request={request} onDone={async () => {
              await refreshCore();
              navigate("history");
            }} />
          )}
          {view === "history" && (
            <HistoryView
              request={request}
              onOpen={openTransactionDetail}
              onChanged={refreshCore}
              token={token!}
              focusTransactionId={historyFocusTransactionId}
              onFocused={() => setHistoryFocusTransactionId(null)}
            />
          )}
          {view === "transactionDetail" && selectedTransaction && (
            <TransactionDetailView
              transaction={selectedTransaction}
              onBack={() => {
                setHistoryFocusTransactionId(selectedTransaction.id);
                navigate("history");
              }}
              onEdit={startEditingTransaction}
              onDelete={() => removeTransaction(selectedTransaction.id)}
            />
          )}
          {view === "accounts" && <AccountsView accounts={accounts} request={request} onChanged={refreshCore} />}
          {view === "categories" && <CategoriesView categories={categories} request={request} onChanged={refreshCore} />}
          {view === "budgets" && <BudgetsView categories={categories} request={request} onChanged={refreshCore} />}
          {view === "manage" && (
            <ManageView accounts={accounts} categories={categories} request={request} onChanged={refreshCore} />
          )}
          {view === "reports" && <ReportsView request={request} />}
          {view === "assistant" && <AssistantView request={request} />}
          {view === "profile" && <ProfileView session={session} request={request} onLogout={() => clearSession()} />}
        </main>

        <MobileBottomNav view={view} onNavigate={navigate} />
        {showScrollTop && view !== "assistant" && (
          <button
            type="button"
            className="fixed bottom-24 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-[#00b817] text-white shadow-[0_12px_24px_rgba(0,184,23,0.26)] transition hover:bg-[#009714] active:scale-95 lg:bottom-6 lg:right-6"
            aria-label="Kembali ke atas"
            title="Kembali ke atas"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function MobileTopBar({ userName, onProfile }: { userName: string; onProfile: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-[#f4f8ff]/95 px-4 pb-2 pt-4 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 via-violet-500 to-emerald-400 text-sm font-black text-white shadow-sm">
            F
          </div>
          <div className="min-w-0">
            <p className="text-base font-black leading-tight">Finly AI</p>
            <p className="truncate text-xs text-slate-500">Hai, {userName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="mobile-icon-btn" aria-label="Notifikasi" title="Notifikasi">
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
          <button className="mobile-avatar-btn" aria-label="Profil" title="Profil" onClick={onProfile}>
            <UserRound size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}

function MobileBottomNav({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const plusActive = view === "manual";
  const isActive = (item: { id: View }) =>
    item.id === "manage"
      ? view === "manage" || view === "accounts" || view === "categories" || view === "budgets"
      : view === item.id;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-3 pb-3 pt-2 shadow-[0_-18px_45px_rgba(15,23,42,0.10)] backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end">
        {mobileNavigation.slice(0, 2).map((item) => (
          <MobileNavButton key={item.id} item={item} active={isActive(item)} onNavigate={onNavigate} />
        ))}
        <button
          className={`mx-auto flex items-center justify-center rounded-full transition active:scale-95 ${
            plusActive
              ? "-mt-7 h-14 w-14 bg-[#00b817] text-white shadow-[0_14px_28px_rgba(0,184,23,0.30)] ring-4 ring-emerald-100"
              : "-mt-5 h-12 w-12 border border-emerald-100 bg-white text-[#00b817] shadow-[0_10px_22px_rgba(15,23,42,0.12)]"
          }`}
          aria-label="Tambah transaksi"
          title="Tambah transaksi"
          onClick={() => onNavigate("manual")}
        >
          <Plus size={plusActive ? 26 : 22} strokeWidth={plusActive ? 2.6 : 2.4} />
        </button>
        {mobileNavigation.slice(2).map((item) => (
          <MobileNavButton key={item.id} item={item} active={isActive(item)} onNavigate={onNavigate} />
        ))}
      </div>
    </nav>
  );
}

function MobileNavButton({
  item,
  active,
  onNavigate
}: {
  item: { id: View; label: string; icon: LucideIcon };
  active: boolean;
  onNavigate: (view: View) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      className={`flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-bold transition ${
        active ? "text-[#00b817]" : "text-slate-400"
      }`}
      onClick={() => onNavigate(item.id)}
    >
      <span className={`flex h-8 w-8 items-center justify-center rounded-2xl transition ${
        active ? "bg-emerald-50" : "bg-transparent"
      }`}>
        <Icon size={18} strokeWidth={active ? 2.6 : 2} />
      </span>
      <span>{item.label}</span>
    </button>
  );
}

function AuthView({ onSignedIn }: { onSignedIn: (session: Session) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload =
        mode === "register"
          ? {
              fullName: String(form.get("fullName")),
              email: String(form.get("email")),
              password: String(form.get("password")),
              currency: "IDR"
            }
          : { email: String(form.get("email")), password: String(form.get("password")) };
      onSignedIn(
        await apiFetch<Session>(`/auth/${mode === "register" ? "register" : "login"}`, undefined, {
          method: "POST",
          body: JSON.stringify(payload)
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-soft lg:grid-cols-[1.1fr_0.9fr]">
        <section className="bg-slate-900 p-8 text-white lg:p-12">
          <div className="mb-16 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md bg-[#00b817]">
              <Wallet size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Keuangan AI</h1>
              <p className="text-sm text-slate-300">Pencatatan keuangan berbasis struk dan data pribadi</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
            {[
              ["Saldo", "Rp12.450.000", "Rekening aktif"],
              ["Pengeluaran", "Rp3.210.000", "Bulan berjalan"],
              ["Confidence", "91%", "Hasil scan terakhir"]
            ].map(([label, value, caption]) => (
              <div key={label} className="rounded-lg border border-white/15 bg-white/10 p-4">
                <p className="text-sm text-slate-300">{label}</p>
                <p className="mt-2 text-2xl font-bold">{value}</p>
                <p className="text-xs text-slate-400">{caption}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="p-6 sm:p-8 lg:p-12">
          <div className="mb-6 flex rounded-md bg-slate-100 p-1">
            <button className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold ${mode === "login" ? "bg-white shadow-sm" : "text-slate-500"}`} onClick={() => setMode("login")}>
              Login
            </button>
            <button className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold ${mode === "register" ? "bg-white shadow-sm" : "text-slate-500"}`} onClick={() => setMode("register")}>
              Registrasi
            </button>
          </div>
          <form className="space-y-4" onSubmit={submit}>
            {mode === "register" && (
              <label className="block text-sm font-medium">
                Nama lengkap
                <input className="input mt-1" name="fullName" required minLength={2} />
              </label>
            )}
            <label className="block text-sm font-medium">
              Email
              <input className="input mt-1" name="email" type="email" required />
            </label>
            <label className="block text-sm font-medium">
              Password
              <input className="input mt-1" name="password" type="password" required minLength={8} />
            </label>
            {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              {mode === "login" ? "Masuk" : "Buat akun"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}

const categoryPalette = ["#16c784", "#f6a90b", "#60a5fa", "#2dd4bf", "#8b5cf6", "#ec4899"];

function ExpenseDonut({ dashboard }: { dashboard: DashboardSummary }) {
  const rows = dashboard.expenseByCategory.slice(0, 5);
  const total = Math.max(Number(dashboard.expenseThisMonth), 1);
  let cursor = 0;
  const segments = rows.map((row, index) => {
    const size = (Number(row.total) / total) * 100;
    const segment = `${categoryPalette[index % categoryPalette.length]} ${cursor}% ${Math.min(cursor + size, 100)}%`;
    cursor += size;
    return segment;
  });
  const donutBackground = segments.length ? `conic-gradient(${segments.join(", ")}, #eef2f7 ${cursor}% 100%)` : "#eef2f7";

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="font-bold">Ringkasan Pengeluaran</h3>
          <p className="text-xs text-slate-500">Bulan ini</p>
        </div>
        <span className="text-xs font-semibold text-[#00b817]">Top 5</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState text="Kategori akan muncul setelah ada pengeluaran." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
          <div className="relative mx-auto h-40 w-40 rounded-full" style={{ background: donutBackground }}>
            <div className="absolute inset-9 flex flex-col items-center justify-center rounded-full bg-white text-center shadow-inner">
              <span className="text-[11px] font-semibold text-slate-500">Total</span>
              <span className="text-sm font-black">{rupiah(dashboard.expenseThisMonth)}</span>
            </div>
          </div>
          <div className="space-y-2.5">
            {rows.map((item, index) => {
              const percent = Math.round((Number(item.total) / total) * 100);
              return (
                <div key={item.category ?? index} className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryPalette[index % categoryPalette.length] }} />
                    <span className="truncate text-slate-700">{item.category ?? "Tanpa kategori"}</span>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-slate-900">{percent}%</p>
                    <p className="text-xs text-slate-400">{rupiah(item.total)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardView({
  dashboard,
  onAdd,
  onScan,
  onAssistant
}: {
  dashboard: DashboardSummary | null;
  onAdd: () => void;
  onScan: () => void;
  onAssistant: () => void;
}) {
  if (!dashboard) return <LoadingState />;
  const income = Number(dashboard.incomeThisMonth);
  const expense = Number(dashboard.expenseThisMonth);
  const balance = Number(dashboard.balance);
  const net = income - expense;
  const expenseRatio = Math.round((expense / Math.max(income, 1)) * 100);
  const ratioLabel = expenseRatio > 999 ? ">999%" : `${expenseRatio}%`;
  const topCategory = dashboard.expenseByCategory[0];
  const alertCount = dashboard.budgetAlerts.length;
  const monthLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" }).format(new Date());
  const averageExpense = expense / Math.max(new Date().getDate(), 1);
  const runwayDays = averageExpense > 0 ? Math.max(Math.floor(balance / averageExpense), 0) : null;
  const healthLabel = expenseRatio <= 50 ? "Sehat" : expenseRatio <= 80 ? "Aman" : expenseRatio <= 100 ? "Waspada" : "Ketat";
  const healthClass =
    expenseRatio <= 80
      ? "bg-emerald-50 text-[#00b817]"
      : expenseRatio <= 100
        ? "bg-amber-50 text-amber-700"
        : "bg-rose-50 text-rose-700";

  return (
    <div className="space-y-3 lg:space-y-5">
      <section className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden rounded-[26px] bg-[#003d12] p-4 text-white shadow-[0_18px_42px_rgba(0,184,23,0.24)] lg:rounded-lg lg:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-black uppercase text-white/65">Saldo aktif</p>
              <h2 className="mt-1 text-2xl font-black tracking-normal sm:text-3xl">{rupiah(balance)}</h2>
              <p className="mt-1 text-xs font-semibold text-white/70">Update dari semua akun aktif</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${healthClass}`}>
              {healthLabel}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[11px] font-semibold text-white/65">Net bulan ini</p>
              <p className={`mt-0.5 text-sm font-black ${net >= 0 ? "text-emerald-100" : "text-rose-100"}`}>
                {net >= 0 ? "+" : "-"}{rupiah(Math.abs(net))}
              </p>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[11px] font-semibold text-white/65">Rata-rata keluar</p>
              <p className="mt-0.5 text-sm font-black">{rupiah(averageExpense)}/hari</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-black text-[#008f12] shadow-sm transition hover:bg-emerald-50 lg:rounded-md" onClick={onAdd}>
              <Plus size={15} /> Tambah
            </button>
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-black text-white transition hover:bg-white/18 lg:rounded-md" onClick={onScan}>
              <Camera size={15} /> Scan struk
            </button>
          </div>
        </div>

        <button
          type="button"
          className="group flex min-h-[128px] w-full flex-col justify-between rounded-[26px] border border-emerald-100 bg-white p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50/40 lg:rounded-lg"
          onClick={onAssistant}
        >
          <span className="flex items-start justify-between gap-3">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#00b817] text-white shadow-[0_12px_24px_rgba(0,184,23,0.18)] lg:rounded-lg">
                <Bot size={20} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-950">Virtual Assistant</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">Tanya kondisi uangmu dengan bahasa bebas.</span>
              </span>
            </span>
            <ChevronRight size={17} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#00b817]" />
          </span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            {["Saldo", "Budget", "Boros apa?"].map((item) => (
              <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                {item}
              </span>
            ))}
          </span>
        </button>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-soft lg:rounded-lg lg:border-slate-200">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">{monthLabel}</p>
              <h3 className="text-sm font-black text-slate-950">Ringkasan bulan ini</h3>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${healthClass}`}>{ratioLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4">
            <DashboardMetric label="Masuk" value={rupiah(income)} helper="Pemasukan" tone="income" icon={<ArrowDownLeft size={16} />} />
            <DashboardMetric label="Keluar" value={rupiah(expense)} helper="Pengeluaran" tone="expense" icon={<ArrowUpRight size={16} />} />
            <DashboardMetric label="Net" value={`${net >= 0 ? "+" : "-"}${rupiah(Math.abs(net))}`} helper="Masuk - keluar" tone={net >= 0 ? "income" : "expense"} icon={<LineChart size={16} />} />
            <DashboardMetric label="Daya tahan" value={runwayDays !== null ? `${runwayDays} hari` : "Aman"} helper="Estimasi saldo" tone="neutral" icon={<Wallet size={16} />} />
          </div>
          <div className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-500">Rasio pengeluaran</span>
              <span className="font-black text-slate-900">{ratioLabel}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${expenseRatio <= 80 ? "bg-[#00b817]" : expenseRatio <= 100 ? "bg-amber-400" : "bg-rose-500"}`}
                style={{ width: `${Math.min(expenseRatio, 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-1">
          <div className="rounded-[22px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
            <p className="text-[11px] font-bold text-slate-400">Kategori teratas</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{topCategory?.category ?? "Belum ada"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{topCategory ? rupiah(topCategory.total) : "Belum ada pengeluaran"}</p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
            <p className="text-[11px] font-bold text-slate-400">Anggaran</p>
            <p className={`mt-1 text-sm font-black ${alertCount > 0 ? "text-amber-700" : "text-[#00b817]"}`}>
              {alertCount > 0 ? `${alertCount} perlu dicek` : "Terkendali"}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              {alertCount > 0 ? `${dashboard.budgetAlerts[0].category} ${dashboard.budgetAlerts[0].usagePercent}%` : "Tidak ada peringatan"}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200 lg:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black text-slate-950">Arus kas harian</h3>
              <p className="text-xs font-semibold text-slate-500">Aktivitas bulan berjalan</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">
              <span className="h-2 w-2 rounded-full bg-[#00b817]" /> Masuk
              <span className="ml-1 h-2 w-2 rounded-full bg-rose-400" /> Keluar
            </span>
          </div>
          <MiniCashFlowChart daily={dashboard.daily} />
        </div>
        <div className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200 lg:p-5">
          <ExpenseDonut dashboard={dashboard} />
        </div>
      </section>

      <section className="grid gap-3 lg:gap-5 xl:grid-cols-2">
        <div className="card p-4 lg:p-5">
          <h3 className="mb-4 text-sm font-black text-slate-950">Aktivitas terbaru</h3>
          <TransactionList rows={dashboard.lastTransactions} />
        </div>
        <div className="card p-4 lg:p-5">
          <h3 className="mb-4 text-sm font-black text-slate-950">Notifikasi anggaran</h3>
          {dashboard.budgetAlerts.length === 0 ? <EmptyState text="Tidak ada peringatan anggaran." /> : (
            <div className="space-y-3">
              {dashboard.budgetAlerts.map((alert) => (
                <div key={alert.id} className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {alert.category} mencapai {alert.usagePercent}% penggunaan.
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function DashboardMetric({
  label,
  value,
  helper,
  tone,
  icon
}: {
  label: string;
  value: string;
  helper: string;
  tone: "income" | "expense" | "neutral";
  icon: JSX.Element;
}) {
  const tones = {
    income: "bg-emerald-50 text-[#00b817]",
    expense: "bg-rose-50 text-rose-600",
    neutral: "bg-sky-50 text-sky-700"
  };

  return (
    <div className="bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-slate-400">{label}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl lg:rounded-md ${tones[tone]}`}>
          {icon}
        </span>
      </div>
      <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function MiniCashFlowChart({ daily }: { daily: DashboardSummary["daily"] }) {
  const rows = daily.slice(-10);
  const maxDaily = Math.max(...rows.map((item) => Number(item.income) + Number(item.expense)), 1);

  if (rows.length === 0) {
    return <EmptyState text="Belum ada transaksi bulan ini." />;
  }

  return (
    <div className="flex h-40 items-end gap-2">
      {rows.map((item) => {
        const incomeHeight = Math.max((Number(item.income) / maxDaily) * 100, Number(item.income) > 0 ? 5 : 0);
        const expenseHeight = Math.max((Number(item.expense) / maxDaily) * 100, Number(item.expense) > 0 ? 5 : 0);
        return (
          <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <div className="flex h-28 w-full items-end justify-center gap-1 rounded-xl bg-slate-50 px-1.5 pb-1.5">
              <div className="w-2 rounded-full bg-[#00b817]" style={{ height: `${incomeHeight}%` }} />
              <div className="w-2 rounded-full bg-rose-400" style={{ height: `${expenseHeight}%` }} />
            </div>
            <span className="text-[10px] font-bold text-slate-400">{new Date(item.date).getDate()}</span>
          </div>
        );
      })}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
  className = ""
}: {
  label: string;
  value: string;
  tone: "income" | "expense" | "neutral";
  icon: JSX.Element;
  className?: string;
}) {
  const tones = {
    income: "bg-emerald-50 text-[#008f12]",
    expense: "bg-rose-50 text-rose-700",
    neutral: "bg-emerald-50 text-[#008f12]"
  };
  return (
    <div className={`card p-4 lg:p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl lg:h-10 lg:w-10 lg:rounded-md ${tones[tone]}`}>{icon}</span>
      </div>
      <p className="mt-3 text-xl font-black tracking-normal sm:text-2xl lg:mt-4">{value}</p>
    </div>
  );
}

function ManualTransactionView({
  accounts,
  categories,
  editing,
  request,
  onScan,
  onCancel,
  onDone
}: {
  accounts: Account[];
  categories: Category[];
  editing: TransactionDetail | null;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onScan: () => void;
  onCancel: () => void;
  onDone: () => Promise<void>;
}) {
  const [transactionType, setTransactionType] = useState<"income" | "expense">(editing?.transactionType ?? "expense");
  const initialDraft = useMemo<ManualDraft>(
    () => ({
      accountId: editing?.accountId ?? accounts[0]?.id ?? "",
      transactionDate: editing ? editing.transactionDate.slice(0, 10) : isoDateInput(),
      amount: moneyInputValue(editing?.amount),
      categoryId: editing?.categoryId ?? "",
      merchantName: editing?.merchantName ?? "",
      paymentMethod: editing?.paymentMethod ?? "",
      notes: editing?.notes ?? ""
    }),
    [accounts[0]?.id, editing?.id]
  );
  const [draft, setDraft] = useState<ManualDraft>(initialDraft);
  const [formVersion, setFormVersion] = useState(0);
  const [freeText, setFreeText] = useState("");
  const [parseResult, setParseResult] = useState<ParsedManualTransaction | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorContext, setErrorContext] = useState<"parse" | "submit" | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const examples = [
    "beli kopi fore 15.000 cash",
    "paid mrt 14k emoney",
    "gaji bulan ini 7jt mandiri"
  ];

  useEffect(() => {
    setTransactionType(editing?.transactionType ?? "expense");
    setDraft(initialDraft);
    setFormVersion((current) => current + 1);
    setParseResult(null);
    setError(null);
    setErrorContext(null);
  }, [editing?.id, initialDraft]);

  const parseFreeText = async () => {
    if (!freeText.trim()) {
      setError("Tulis transaksi dulu, misalnya: beli kopi fore 15.000 cash");
      setErrorContext("parse");
      return;
    }

    setParseLoading(true);
    setError(null);
    setErrorContext(null);
    try {
      const parsed = await request<ParsedManualTransaction>("/assistant/parse-transaction", {
        method: "POST",
        body: JSON.stringify({
          text: freeText,
          defaultAccountId: draft.accountId || accounts[0]?.id || null
        })
      });
      setParseResult(parsed);
      setTransactionType(parsed.transactionType);
      setDraft({
        accountId: parsed.accountId ?? draft.accountId ?? accounts[0]?.id ?? "",
        transactionDate: parsed.transactionDate.slice(0, 10),
        amount: moneyInputValue(parsed.amount),
        categoryId: parsed.categoryId ?? "",
        merchantName: parsed.merchantName ?? "",
        paymentMethod: parsed.paymentMethod ?? "",
        notes: parsed.notes
      });
      setFormVersion((current) => current + 1);
      window.setTimeout(() => {
        formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Teks transaksi gagal dibaca");
      setErrorContext("parse");
    } finally {
      setParseLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setErrorContext(null);
    const form = new FormData(event.currentTarget);
    const payload = {
      accountId: String(form.get("accountId")),
      transactionType,
      transactionDate: new Date(String(form.get("transactionDate"))).toISOString(),
      amount: String(form.get("amount")),
      categoryId: String(form.get("categoryId") || "") || null,
      merchantName: String(form.get("merchantName") || "") || null,
      paymentMethod: String(form.get("paymentMethod") || "") || null,
      notes: String(form.get("notes") || "") || null,
      sourceType: "manual",
      items: []
    };
    try {
      await request(editing ? `/transactions/${editing.id}` : "/transactions", {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload)
      });
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaksi gagal disimpan");
      setErrorContext("submit");
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter((category) => category.categoryType === transactionType);
  const selectedAccountName = accounts.find((account) => account.id === draft.accountId)?.name ?? parseResult?.accountName ?? "Pilih akun";
  const selectedCategoryName = categories.find((category) => category.id === draft.categoryId)?.name ?? parseResult?.categoryName ?? "Tanpa kategori";

  return (
    <section className="mx-auto max-w-4xl space-y-3 lg:space-y-5">
      {!editing && (
        <div className="overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-soft lg:rounded-lg lg:border-slate-200">
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-4 lg:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase text-[#00b817] shadow-sm">
                  <Sparkles size={12} /> AI quick add
                </span>
                <h2 className="mt-2 text-xl font-black tracking-normal text-slate-950">Tambah transaksi</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Ketik bebas, AI bantu isi nominal, kategori, akun, dan metode pembayaran.
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#00b817] text-white shadow-[0_10px_20px_rgba(0,184,23,0.18)] lg:rounded-md">
                <Bot size={19} />
              </span>
            </div>
            <button
              type="button"
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-white px-3 py-2.5 text-xs font-black text-[#008f12] shadow-sm transition hover:bg-emerald-50 sm:w-auto lg:rounded-md"
              onClick={onScan}
            >
              <Camera size={15} /> Scan struk
            </button>
          </div>

          <div className="space-y-3 p-4 lg:p-5">
            <label className="block text-xs font-black text-slate-600">
              Tulis transaksi
              <textarea
                className="mt-1 min-h-24 w-full resize-none rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 lg:rounded-md"
              value={freeText}
              onChange={(event) => setFreeText(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  parseFreeText();
                }
              }}
              placeholder="Contoh: beli kopi fore 15.000 cash"
            />
          </label>
            <div className="flex flex-wrap gap-2">
              {examples.map((example) => (
                <button
                  type="button"
                  key={example}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                  onClick={() => setFreeText(example)}
                >
                  {example}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] font-semibold text-slate-500">
                {accounts.length === 0 ? "Tambahkan akun dulu sebelum menyimpan transaksi." : "AI akan scroll ke detail setelah berhasil membaca teks."}
              </p>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00b817] px-4 py-3 text-sm font-black text-white shadow-[0_12px_24px_rgba(0,184,23,0.22)] transition hover:bg-[#009714] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto lg:rounded-md"
                onClick={parseFreeText}
                disabled={parseLoading || accounts.length === 0}
              >
                {parseLoading ? <Loader2 className="animate-spin" size={17} /> : <Sparkles size={17} />}
                Terjemahkan
              </button>
            </div>

            {error && errorContext === "parse" && (
              <p className="rounded-2xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 lg:rounded-md">{error}</p>
            )}

            {parseResult && (
              <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/70 p-3 text-sm lg:rounded-md">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 font-black text-slate-950">
                    <CheckCircle2 size={16} className="text-[#00b817]" /> Hasil AI
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-black text-[#00b817]">
                    {Math.round(parseResult.confidenceScore * 100)}% yakin
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400">Tipe</p>
                    <p className="font-black text-slate-950">{parseResult.transactionType === "income" ? "Pemasukan" : "Pengeluaran"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400">Nominal</p>
                    <p className="font-black text-slate-950">{rupiah(parseResult.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400">Kategori</p>
                    <p className="truncate font-black text-slate-950">{selectedCategoryName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-slate-400">Akun</p>
                    <p className="truncate font-black text-slate-950">{selectedAccountName}</p>
                  </div>
                </div>
                {parseResult.reviewFields.length > 0 && (
                  <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 lg:rounded-md">
                    Cek ulang: {parseResult.reviewFields.join(", ")}.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={formCardRef} className="scroll-mt-24 overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-soft lg:rounded-lg lg:border-slate-200">
        <div className="border-b border-slate-100 bg-white px-4 py-4 lg:px-5">
          {editing && (
            <button
              type="button"
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"
              onClick={onCancel}
            >
              <ArrowLeft size={15} /> Kembali
            </button>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl lg:rounded-md ${
                transactionType === "income" ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-600"
              }`}>
                {transactionType === "income" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase text-slate-400">{editing ? "Edit" : parseResult ? "Konfirmasi AI" : "Detail"}</p>
                <h2 className="mt-0.5 text-base font-black tracking-normal text-slate-950">{editing ? "Edit transaksi" : "Detail transaksi"}</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {editing ? "Ubah data yang diperlukan lalu simpan." : parseResult ? "Hasil AI sudah masuk, cek sebelum simpan." : "Isi manual atau mulai dari AI di atas."}
                </p>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 sm:w-fit lg:rounded-md">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-black transition lg:rounded-md ${
                  transactionType === "income" ? "bg-white text-[#008f12] shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setTransactionType("income")}
              >
                Pemasukan
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-black transition lg:rounded-md ${
                  transactionType === "expense" ? "bg-white text-rose-700 shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setTransactionType("expense")}
              >
                Pengeluaran
              </button>
            </div>
          </div>
        </div>
        <form key={formVersion} className="grid gap-3 p-4 md:grid-cols-2 lg:p-5" onSubmit={submit}>
          <Field label="Tanggal">
            <input className="input" name="transactionDate" type="date" defaultValue={draft.transactionDate} required />
          </Field>
          <Field label="Nominal">
            <input className="input" name="amount" inputMode="decimal" min="1" defaultValue={draft.amount} required />
          </Field>
          <Field label="Akun">
            <select className="input" name="accountId" defaultValue={draft.accountId} required>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>{account.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Kategori">
            <select className="input" name="categoryId" defaultValue={draft.categoryId}>
              <option value="">Tanpa kategori</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Sumber atau merchant">
            <input className="input" name="merchantName" defaultValue={draft.merchantName} />
          </Field>
          <Field label="Metode pembayaran">
            <input className="input" name="paymentMethod" defaultValue={draft.paymentMethod} placeholder="Tunai, QRIS, debit" />
          </Field>
          <label className="block text-xs font-black text-slate-600 md:col-span-2">
            Catatan
            <div className="mt-1">
              <textarea className="input min-h-20" name="notes" defaultValue={draft.notes} />
            </div>
          </label>
          {error && errorContext === "submit" && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 md:col-span-2 lg:rounded-md">{error}</p>}
          <div className="md:col-span-2">
            <button className="btn-primary w-full" disabled={loading || accounts.length === 0}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              Simpan transaksi
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function TransactionDetailView({
  transaction,
  onBack,
  onEdit,
  onDelete
}: {
  transaction: TransactionDetail;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = transaction.transactionType === "income";
  const detailRows = [
    ["Tanggal", localDate(transaction.transactionDate)],
    ["Akun", transaction.accountName ?? "-"],
    ["Metode", transaction.paymentMethod ?? "-"],
    ["Kategori", transaction.categoryName ?? "Tanpa kategori"],
    ["Sumber", transaction.sourceType ?? "Manual"]
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-3">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
        onClick={onBack}
      >
        <ArrowLeft size={15} /> Kembali
      </button>

      <div className="overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-soft lg:rounded-lg lg:border-slate-200">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${transactionIconClass(transaction)}`}>
                {transactionCategoryIcon(transaction)}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-black text-slate-950">{transactionTitle(transaction)}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{transaction.accountName ?? "-"}{transaction.paymentMethod ? ` - ${transaction.paymentMethod}` : ""}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-lg font-black ${isIncome ? "text-[#00b817]" : "text-slate-950"}`}>
                {isIncome ? "+" : "-"}{rupiah(transaction.amount)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{isIncome ? "Pemasukan" : "Pengeluaran"}</p>
            </div>
          </div>
        </div>

        <dl className="grid gap-3 p-5 sm:grid-cols-2">
          {detailRows.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 px-3 py-2.5 lg:rounded-md">
              <dt className="text-[11px] font-black uppercase text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-slate-100 p-5">
          <button type="button" className="btn-primary" onClick={onEdit}>
            <Settings size={15} /> Edit transaksi
          </button>
          <button type="button" className="btn-danger px-3" onClick={onDelete} aria-label="Hapus transaksi">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

function ReceiptView({
  accounts,
  categories,
  request,
  onDone
}: {
  accounts: Account[];
  categories: Category[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onDone: () => Promise<void>;
}) {
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<any>(null);
  const [rawText, setRawText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const expenseCategories = categories.filter((category) => category.categoryType === "expense");

  const selectFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessage("Ukuran file terlalu besar.");
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
    setReceiptId(null);
    setParsed(null);
    setRawText("");
    setMessage(null);
    setPreview((currentPreview) => {
      if (currentPreview) URL.revokeObjectURL(currentPreview);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    event.target.value = "";
  };

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const processSelectedFile = async () => {
    if (!selectedFile) {
      setMessage("Pilih atau foto struk dulu.");
      return;
    }
    const form = new FormData();
    form.set("receipt", selectedFile);
    setLoading(true);
    setMessage(null);
    try {
      const uploaded = await request<{ id: string }>("/receipts/upload", { method: "POST", body: form });
      setReceiptId(uploaded.id);
      const processed = await request<{ parsed: any; rawOcrText: string; message?: string }>(`/receipts/${uploaded.id}/process`, { method: "POST" });
      setParsed(processed.parsed);
      setRawText(processed.rawOcrText);
      setMessage(processed.message ?? null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Struk gagal diproses");
    } finally {
      setLoading(false);
    }
  };

  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!receiptId) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      accountId: String(form.get("accountId")),
      categoryId: String(form.get("categoryId") || "") || null,
      merchantName: String(form.get("merchantName")),
      transactionDate: new Date(String(form.get("transactionDate"))).toISOString(),
      amount: String(form.get("amount")),
      paymentMethod: String(form.get("paymentMethod") || "") || null,
      notes: String(form.get("notes") || "") || null,
      items: (parsed?.items ?? []).map((item: any) => ({
        itemName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice
      }))
    };
    setLoading(true);
    try {
      await request(`/receipts/${receiptId}/confirm`, { method: "POST", body: JSON.stringify(payload) });
      await onDone();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Konfirmasi gagal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200 lg:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase text-[#00b817]">Scan struk</p>
            <h2 className="mt-0.5 text-lg font-black text-slate-950">Upload atau foto struk</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">Pilih sumber, cek preview, lalu proses OCR.</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#00b817] lg:rounded-md">
            <Camera size={18} />
          </span>
        </div>

        <input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={selectFile} />
        <input ref={galleryInputRef} className="sr-only" type="file" accept="image/jpeg,image/png" onChange={selectFile} />
        <input ref={fileInputRef} className="sr-only" type="file" accept="image/jpeg,image/png,application/pdf" onChange={selectFile} />

        <div className="grid grid-cols-3 gap-2">
          <button type="button" className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-black text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-[#00b817] lg:rounded-md" onClick={() => cameraInputRef.current?.click()}>
            <Camera size={18} /> Kamera
          </button>
          <button type="button" className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-black text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-[#00b817] lg:rounded-md" onClick={() => galleryInputRef.current?.click()}>
            <ReceiptText size={18} /> Galeri
          </button>
          <button type="button" className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-black text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-[#00b817] lg:rounded-md" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} /> File
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-[22px] border border-dashed border-slate-200 bg-slate-50 lg:rounded-md">
          {preview ? (
            <img className="max-h-96 w-full object-contain" src={preview} alt="Preview struk" />
          ) : selectedFile ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
              <ReceiptText className="mb-3 text-[#00b817]" size={28} />
              <p className="text-sm font-black text-slate-950">{selectedFile.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">PDF siap diproses.</p>
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
              <Upload className="mb-3 text-slate-400" size={28} />
              <p className="text-sm font-black text-slate-700">Belum ada struk</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">JPG, PNG, atau PDF maksimal 8 MB.</p>
            </div>
          )}
        </div>

        <button type="button" className="btn-primary mt-4 w-full" disabled={loading || !selectedFile} onClick={processSelectedFile}>
          {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
          {loading ? "Memproses struk..." : "Proses struk"}
        </button>
        {message && <p className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{message}</p>}
        {rawText && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">Teks OCR</summary>
            <pre className="mt-2 max-h-52 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-white">{rawText}</pre>
          </details>
        )}
      </section>

      <section className="card p-5">
        <h2 className="mb-4 text-lg font-bold">Konfirmasi hasil scan</h2>
        {!parsed ? (
          <EmptyState text="Hasil OCR akan tampil di sini." />
        ) : (
          <form className="grid gap-4 md:grid-cols-2" onSubmit={confirm}>
            <Field label="Merchant">
              <input className="input" name="merchantName" defaultValue={parsed.merchantName ?? ""} required />
            </Field>
            <Field label="Tanggal">
              <input className="input" type="date" name="transactionDate" defaultValue={parsed.transactionDate ?? isoDateInput()} required />
            </Field>
            <Field label="Total pembayaran">
              <input className="input" name="amount" defaultValue={parsed.total ?? ""} required />
            </Field>
            <Field label="Confidence">
              <input className="input" value={`${Math.round((parsed.confidenceScore ?? 0) * 100)}%`} readOnly />
            </Field>
            <Field label="Akun pembayaran">
              <select className="input" name="accountId" required>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Kategori">
              <select className="input" name="categoryId" defaultValue={expenseCategories.find((category) => category.name === parsed.suggestedCategory)?.id ?? ""}>
                <option value="">Tanpa kategori</option>
                {expenseCategories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Metode pembayaran">
              <input className="input" name="paymentMethod" defaultValue={parsed.paymentMethod ?? ""} />
            </Field>
            <Field label="Nomor struk">
              <input className="input" value={parsed.receiptNumber ?? ""} readOnly />
            </Field>
            <label className="block text-sm font-medium md:col-span-2">
              Catatan
              <textarea className="input mt-1 min-h-20" name="notes" defaultValue={parsed.reviewFields?.length ? "Perlu cek ulang: " + parsed.reviewFields.join(", ") : ""} />
            </label>
            <div className="md:col-span-2">
              <h3 className="mb-2 text-sm font-semibold">Item struk</h3>
              <div className="max-h-56 overflow-auto rounded-md border border-slate-200">
                {(parsed.items ?? []).length === 0 ? (
                  <p className="p-3 text-sm text-slate-500">Item belum terdeteksi.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr><th className="px-3 py-2">Nama</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Total</th></tr>
                    </thead>
                    <tbody>
                      {parsed.items.map((item: any, index: number) => (
                        <tr key={`${item.name}-${index}`} className="border-t">
                          <td className="px-3 py-2">{item.name}</td>
                          <td className="px-3 py-2">{item.quantity}</td>
                          <td className="px-3 py-2">{rupiah(item.totalPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <button className="btn-primary" disabled={loading || accounts.length === 0}>
                {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                Simpan transaksi dari struk
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function HistoryView({
  request,
  onOpen,
  onChanged,
  token,
  focusTransactionId,
  onFocused
}: {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
  token: string;
  focusTransactionId?: string | null;
  onFocused?: () => void;
}) {
  const [rows, setRows] = useState<Transaction[]>([]);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [highlightedTransactionId, setHighlightedTransactionId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const transactionRefs = useRef(new Map<string, HTMLDivElement>());

  const load = async (nextSearch = search, nextType = type, nextFromDate = fromDate, nextToDate = toDate) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextType) params.set("type", nextType);
    if (nextFromDate) params.set("from", dateFilterIso(nextFromDate, "start"));
    if (nextToDate) params.set("to", dateFilterIso(nextToDate, "end"));
    const result = await request<{ data: Transaction[] }>(`/transactions?${params.toString()}`);
    setRows(result.data);
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load(search, type, fromDate, toDate).catch(console.error);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, type, fromDate, toDate]);

  useEffect(() => {
    if (loading || !focusTransactionId) return;
    const timer = window.setTimeout(() => {
      const target = transactionRefs.current.get(focusTransactionId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedTransactionId(focusTransactionId);
        window.setTimeout(() => setHighlightedTransactionId(null), 1600);
      }
      onFocused?.();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loading, rows, focusTransactionId, onFocused]);

  const remove = async (id: string) => {
    if (!window.confirm("Hapus transaksi ini?")) return;
    await request(`/transactions/${id}`, { method: "DELETE" });
    await load(search, type, fromDate, toDate);
    await onChanged();
  };

  const exportFile = async (format: string) => {
    const params = new URLSearchParams({ format });
    if (search.trim()) params.set("search", search.trim());
    if (type) params.set("type", type);
    if (fromDate) params.set("from", dateFilterIso(fromDate, "start"));
    if (toDate) params.set("to", dateFilterIso(toDate, "end"));
    const response = await fetch(downloadUrl(`/transactions/export?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token}` }
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `transaksi.${format === "excel" ? "xlsx" : format}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const applyType = (nextType: string) => {
    setType(nextType);
  };

  const totalIncome = rows.reduce((sum, row) => sum + (row.transactionType === "income" ? Number(row.amount) : 0), 0);
  const totalExpense = rows.reduce((sum, row) => sum + (row.transactionType === "expense" ? Number(row.amount) : 0), 0);
  const netTotal = totalIncome - totalExpense;
  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const selectedCount = selectedIds.size;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const typeOptions = [
    { value: "", label: "Semua" },
    { value: "income", label: "Masuk" },
    { value: "expense", label: "Keluar" }
  ];
  const groupedRows = groupTransactionsByDate(rows);

  useEffect(() => {
    const visible = new Set(visibleIds);
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => visible.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [visibleIds]);

  const toggleSelected = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const selectAllVisible = () => setSelectedIds(new Set(visibleIds));

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Hapus ${ids.length} transaksi terpilih?`)) return;
    await Promise.all(ids.map((id) => request(`/transactions/${id}`, { method: "DELETE" })));
    setSelectedIds(new Set());
    await load(search, type, fromDate, toDate);
    await onChanged();
  };

  return (
    <section className="mx-auto max-w-6xl space-y-3 lg:space-y-4">
      <div className="rounded-[22px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase text-[#00b817]">Transaksi</p>
            <h2 className="mt-0.5 text-base font-black tracking-normal text-slate-950">Riwayat transaksi</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{rows.length} transaksi tampil</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black text-[#00b817]">
            {type === "income" ? "Masuk" : type === "expense" ? "Keluar" : "Semua"}
          </span>
        </div>
        <div className="mt-3 rounded-2xl bg-[#00b817] px-4 py-3 text-white lg:rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-white/75">Net transaksi</p>
              <p className="mt-0.5 text-[11px] font-semibold text-white/65">Sesuai filter aktif</p>
            </div>
            <p className="shrink-0 text-base font-black">{netTotal >= 0 ? "+" : "-"}{rupiah(Math.abs(netTotal))}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-50 px-3 py-2 lg:rounded-md">
            <p className="text-[11px] font-bold text-[#008f12]">Masuk</p>
            <p className="mt-0.5 text-[13px] font-black leading-tight text-[#008f12]">{rupiah(totalIncome)}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 px-3 py-2 lg:rounded-md">
            <p className="text-[11px] font-bold text-rose-700">Keluar</p>
            <p className="mt-0.5 text-[13px] font-black leading-tight text-rose-700">{rupiah(totalExpense)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-[22px] border border-white/80 bg-white p-3 shadow-soft lg:rounded-lg lg:border-slate-200">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 text-slate-400" size={15} />
          <input
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-9 py-2.5 text-[13px] font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 lg:rounded-md"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari transaksi"
          />
          {search && (
            <button
              type="button"
              className="absolute right-2 top-1.5 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Bersihkan pencarian"
              title="Bersihkan pencarian"
              onClick={() => setSearch("")}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 rounded-2xl bg-slate-100 p-1 lg:max-w-sm lg:rounded-md">
          {typeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`rounded-xl px-3 py-2 text-xs font-black transition lg:rounded-md ${
                type === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"
              }`}
              onClick={() => applyType(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="relative block rounded-2xl border border-slate-200 bg-white px-3 py-2 lg:rounded-md">
            <span className="text-[10px] font-black uppercase text-slate-400">Dari</span>
            <input
              className="mt-1 w-full bg-transparent text-xs font-bold text-slate-800 outline-none"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              aria-label="Tanggal mulai"
            />
            {fromDate && (
              <button type="button" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus tanggal mulai" onClick={() => setFromDate("")}>
                <X size={13} />
              </button>
            )}
          </label>
          <label className="relative block rounded-2xl border border-slate-200 bg-white px-3 py-2 lg:rounded-md">
            <span className="text-[10px] font-black uppercase text-slate-400">Sampai</span>
            <input
              className="mt-1 w-full bg-transparent text-xs font-bold text-slate-800 outline-none"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              aria-label="Tanggal akhir"
            />
            {toDate && (
              <button type="button" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hapus tanggal akhir" onClick={() => setToDate("")}>
                <X size={13} />
              </button>
            )}
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
          <p className="text-[11px] font-bold text-slate-400">Export</p>
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-50" onClick={() => exportFile("csv")}><Download size={13} /> CSV</button>
            <button className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 transition hover:bg-slate-50" onClick={() => exportFile("excel")}><FileSpreadsheet size={13} /> Excel</button>
          </div>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-16 z-20 rounded-[22px] border border-emerald-100 bg-white/95 p-3 shadow-soft backdrop-blur lg:top-20 lg:rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-950">{selectedCount} dipilih</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">Tap transaksi lain untuk tambah pilihan.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600 transition hover:bg-slate-50"
                onClick={clearSelection}
              >
                Batal
              </button>
              <button
                type="button"
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-black text-[#00b817] transition hover:bg-emerald-100"
                onClick={allVisibleSelected ? clearSelection : selectAllVisible}
              >
                {allVisibleSelected ? "Batal semua" : "Pilih semua"}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-black text-white transition hover:bg-rose-600"
                onClick={deleteSelected}
              >
                <Trash2 size={13} /> Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && rows.length > 0 && selectedCount === 0 && (
        <div className="overflow-x-auto rounded-[20px] border border-white/80 bg-white/85 px-3 py-2 shadow-soft backdrop-blur lg:rounded-lg">
          <div className="flex min-w-max items-center gap-2 text-[11px] font-black text-slate-500">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[#00b817]">
              <ChevronRight size={12} /> Tap detail
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              <CheckCircle2 size={12} /> Tahan pilih
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-rose-500">
              <ArrowLeft size={12} /> Swipe hapus
            </span>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {loading ? <LoadingState /> : rows.length === 0 ? <EmptyState text="Tidak ada transaksi." /> : (
          groupedRows.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-soft lg:rounded-lg lg:border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <div>
                  <h3 className="text-sm font-black text-slate-950">{group.label}</h3>
                  <p className="text-xs font-semibold text-slate-500">{group.rows.length} transaksi</p>
                </div>
                <p className={`text-sm font-black ${group.net >= 0 ? "text-[#00b817]" : "text-slate-900"}`}>
                  {group.net >= 0 ? "+" : "-"}{rupiah(Math.abs(group.net))}
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    ref={(node) => {
                      if (node) {
                        transactionRefs.current.set(row.id, node);
                      } else {
                        transactionRefs.current.delete(row.id);
                      }
                    }}
                    className={`transition ${highlightedTransactionId === row.id ? "bg-emerald-50 ring-2 ring-emerald-200" : "bg-white"}`}
                  >
                    <TransactionHistoryItem
                      row={row}
                      onOpen={() => onOpen(row.id)}
                      onRemove={() => remove(row.id)}
                      selected={selectedIds.has(row.id)}
                      selectionMode={selectedCount > 0}
                      onToggleSelect={() => toggleSelected(row.id)}
                      onLongPress={() => toggleSelected(row.id)}
                    />
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </section>
  );
}

type ManageTab = "budgets" | "accounts" | "categories";
type BudgetRow = {
  id: string;
  categoryId: string;
  category: string;
  month: number;
  year: number;
  budgetAmount: string;
  used: string;
  remaining: string;
  usagePercent: string;
  status: string;
};

function moneyValue(value: string | number | null | undefined) {
  return Number(value ?? 0);
}

function accountTypeLabel(type: string) {
  const labels: Record<string, string> = {
    cash: "Tunai",
    bank: "Rekening",
    e_wallet: "E-wallet",
    credit_card: "Kartu kredit",
    other: "Lainnya"
  };
  return labels[type] ?? type;
}

function budgetTone(status: string) {
  if (status === "Aman") return "bg-emerald-50 text-[#00b817]";
  if (status === "Peringatan") return "bg-amber-50 text-amber-700";
  return "bg-rose-50 text-rose-700";
}

function SectionHeader({ title, caption, action }: { title: string; caption?: string; action?: JSX.Element }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        {caption && <p className="mt-0.5 text-xs font-semibold text-slate-500">{caption}</p>}
      </div>
      {action}
    </div>
  );
}

function ManageView({
  accounts,
  categories,
  request,
  onChanged
}: {
  accounts: Account[];
  categories: Category[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onChanged: () => Promise<void>;
}) {
  const [activeTab, setActiveTab] = useState<ManageTab>("budgets");
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (account.accountType === "credit_card" ? -moneyValue(account.currentBalance) : moneyValue(account.currentBalance)),
    0
  );
  const expenseCategoryCount = categories.filter((category) => category.categoryType === "expense").length;
  const tabs: Array<{ id: ManageTab; label: string; icon: LucideIcon; meta: string }> = [
    { id: "budgets", label: "Budget", icon: CircleDollarSign, meta: "Batas bulanan" },
    { id: "accounts", label: "Akun", icon: Wallet, meta: `${accounts.length} aktif` },
    { id: "categories", label: "Kategori", icon: Tags, meta: `${expenseCategoryCount} pengeluaran` }
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-3 lg:space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1.05fr_1.35fr]">
        <div className="rounded-[26px] bg-[#003d12] p-4 text-white shadow-[0_18px_42px_rgba(0,184,23,0.18)] lg:rounded-lg lg:p-5">
          <p className="text-[10px] font-black uppercase text-white/60">Kelola</p>
          <h2 className="mt-1 text-xl font-black tracking-normal">Dompet & aturan</h2>
          <p className="mt-1 text-xs font-semibold text-white/70">Atur akun, kategori, dan batas budget dari satu tempat.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[10px] font-bold text-white/60">Saldo akun</p>
              <p className="mt-1 truncate text-sm font-black">{rupiah(totalBalance)}</p>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[10px] font-bold text-white/60">Kategori</p>
              <p className="mt-1 truncate text-sm font-black">{categories.length} aktif</p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 rounded-[26px] border border-white/80 bg-white p-2 shadow-soft lg:rounded-lg lg:border-slate-200">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                className={`flex items-center justify-between gap-3 rounded-[18px] px-3 py-3 text-left transition lg:rounded-md ${
                  active ? "bg-emerald-50 text-slate-950" : "text-slate-500 hover:bg-slate-50"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl lg:rounded-md ${
                    active ? "bg-[#00b817] text-white" : "bg-slate-100 text-slate-500"
                  }`}>
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black">{tab.label}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold opacity-70">{tab.meta}</span>
                  </span>
                </span>
                {active && <CheckCircle2 size={16} className="shrink-0 text-[#00b817]" />}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === "budgets" && <BudgetsView categories={categories} request={request} onChanged={onChanged} />}
      {activeTab === "accounts" && <AccountsView accounts={accounts} request={request} onChanged={onChanged} />}
      {activeTab === "categories" && <CategoriesView categories={categories} request={request} onChanged={onChanged} />}
    </section>
  );
}

function AccountsView({ accounts, request, onChanged }: { accounts: Account[]; request: <T>(path: string, options?: RequestInit) => Promise<T>; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (account.accountType === "credit_card" ? -moneyValue(account.currentBalance) : moneyValue(account.currentBalance)),
    0
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const payload = {
        name: String(form.get("name")),
        accountType: String(form.get("accountType")),
        currency: "IDR",
        allowNegative: form.get("allowNegative") === "on"
      };
      await request(editingAccount ? `/accounts/${editingAccount.id}` : "/accounts", {
        method: editingAccount ? "PUT" : "POST",
        body: JSON.stringify(editingAccount ? payload : {
          ...payload,
          initialBalance: String(form.get("initialBalance")),
        })
      });
      formElement.reset();
      setEditingAccount(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Akun gagal disimpan");
    }
  };

  const transfer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request("/transfers", {
        method: "POST",
        body: JSON.stringify({
          sourceAccountId: String(form.get("sourceAccountId")),
          destinationAccountId: String(form.get("destinationAccountId")),
          amount: String(form.get("amount")),
          transferDate: new Date(String(form.get("transferDate"))).toISOString(),
          notes: String(form.get("notes") || "") || null
        })
      });
      formElement.reset();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer gagal");
    }
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader title="Akun & saldo" caption={`${accounts.length} akun aktif - total ${rupiah(totalBalance)}`} />
        {accounts.length === 0 ? (
          <EmptyState text="Belum ada akun. Tambahkan kas, rekening, atau e-wallet pertama Anda." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-2xl border border-slate-100 bg-white px-3 py-3 lg:rounded-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">{account.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{accountTypeLabel(account.accountType)}</p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#00b817] lg:rounded-md">
                    <CreditCard size={16} />
                  </span>
                </div>
                <p className="mt-3 text-lg font-black tracking-normal text-slate-950">{rupiah(account.currentBalance)}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-slate-500">Saldo awal {rupiah(account.initialBalance)}</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                    onClick={() => {
                      setError(null);
                      setEditingAccount(account);
                    }}
                  >
                    <Settings size={12} /> Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <aside className="space-y-3">
        <form key={editingAccount?.id ?? "new-account"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
          <SectionHeader
            title={editingAccount ? "Edit akun" : "Tambah akun"}
            caption={editingAccount ? "Ubah nama, tipe, atau aturan saldo minus." : "Pisahkan kas, rekening, e-wallet, atau kartu kredit."}
            action={editingAccount ? (
              <button type="button" className="text-xs font-black text-slate-500 hover:text-slate-900" onClick={() => setEditingAccount(null)}>
                Batal
              </button>
            ) : undefined}
          />
          <div className="space-y-3">
            <Field label="Nama akun">
              <input className="input" name="name" placeholder="Contoh: BCA utama" defaultValue={editingAccount?.name ?? ""} required />
            </Field>
            <Field label="Tipe akun">
              <select className="input" name="accountType" defaultValue={editingAccount?.accountType ?? "bank"}>
                <option value="cash">Tunai</option>
                <option value="bank">Rekening bank</option>
                <option value="e_wallet">E-wallet</option>
                <option value="credit_card">Kartu kredit</option>
                <option value="other">Lainnya</option>
              </select>
            </Field>
            {editingAccount ? (
              <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 lg:rounded-md">
                Saldo akun tetap mengikuti transaksi dan transfer. Saldo sekarang {rupiah(editingAccount.currentBalance)}.
              </p>
            ) : (
              <Field label="Saldo awal">
                <input className="input" name="initialBalance" inputMode="decimal" placeholder="Contoh: 500000" required />
              </Field>
            )}
            <label className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 lg:rounded-md">
              <input className="mt-0.5" name="allowNegative" type="checkbox" defaultChecked={editingAccount?.allowNegative ?? false} />
              Izinkan saldo minus untuk akun ini
            </label>
            <button className="btn-primary w-full">{editingAccount ? <CheckCircle2 size={16} /> : <Plus size={16} />} {editingAccount ? "Simpan perubahan" : "Simpan akun"}</button>
          </div>
        </form>

        <form className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={transfer}>
          <SectionHeader title="Transfer saldo" caption="Pindahkan uang antar akun tanpa membuat pengeluaran." />
          <div className="space-y-3">
            <Field label="Dari akun">
              <select className="input" name="sourceAccountId" required disabled={accounts.length < 2}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
            <Field label="Ke akun">
              <select className="input" name="destinationAccountId" required disabled={accounts.length < 2}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nominal">
                <input className="input" name="amount" inputMode="decimal" placeholder="100000" required />
              </Field>
              <Field label="Tanggal">
                <input className="input" name="transferDate" type="date" defaultValue={isoDateInput()} required />
              </Field>
            </div>
            <input className="input" name="notes" placeholder="Catatan transfer (opsional)" />
            <button className="btn-secondary w-full" disabled={accounts.length < 2}><ArrowLeftRight size={16} /> Transfer</button>
          </div>
        </form>
        {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 lg:rounded-md">{error}</p>}
      </aside>
    </div>
  );
}

function CategoriesView({ categories, request, onChanged }: { categories: Category[]; request: <T>(path: string, options?: RequestInit) => Promise<T>; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const expenseCategories = categories.filter((category) => category.categoryType === "expense");
  const incomeCategories = categories.filter((category) => category.categoryType === "income");

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request(editingCategory ? `/categories/${editingCategory.id}` : "/categories", {
        method: editingCategory ? "PUT" : "POST",
        body: JSON.stringify({
          name: String(form.get("name")),
          categoryType: String(form.get("categoryType")),
          icon: editingCategory?.icon ?? "Circle"
        })
      });
      formElement.reset();
      setEditingCategory(null);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori gagal disimpan");
    }
  };

  return (
    <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader title="Kategori transaksi" caption={`${expenseCategories.length} pengeluaran - ${incomeCategories.length} pemasukan`} />
        <div className="space-y-4">
          <CategoryGroup title="Pengeluaran" rows={expenseCategories} tone="expense" onEdit={(category) => {
            setError(null);
            setEditingCategory(category);
          }} />
          <CategoryGroup title="Pemasukan" rows={incomeCategories} tone="income" onEdit={(category) => {
            setError(null);
            setEditingCategory(category);
          }} />
        </div>
      </section>

      <form key={editingCategory?.id ?? "new-category"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
        <SectionHeader
          title={editingCategory ? "Edit kategori" : "Kategori baru"}
          caption={editingCategory ? "Ubah nama atau tipe kategori transaksi." : "Buat kategori yang mudah dipilih oleh AI dan form manual."}
          action={editingCategory ? (
            <button type="button" className="text-xs font-black text-slate-500 hover:text-slate-900" onClick={() => setEditingCategory(null)}>
              Batal
            </button>
          ) : undefined}
        />
        <div className="space-y-3">
          <Field label="Nama kategori">
            <input className="input" name="name" placeholder="Contoh: Kopi & cafe" defaultValue={editingCategory?.name ?? ""} required />
          </Field>
          <Field label="Tipe">
            <select className="input" name="categoryType" defaultValue={editingCategory?.categoryType ?? "expense"}>
              <option value="expense">Pengeluaran</option>
              <option value="income">Pemasukan</option>
            </select>
          </Field>
          <button className="btn-primary w-full">{editingCategory ? <CheckCircle2 size={16} /> : <Plus size={16} />} {editingCategory ? "Simpan perubahan" : "Tambah kategori"}</button>
          {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 lg:rounded-md">{error}</p>}
        </div>
      </form>
    </div>
  );
}

function CategoryGroup({ title, rows, tone, onEdit }: { title: string; rows: Category[]; tone: "income" | "expense"; onEdit?: (category: Category) => void }) {
  const toneClass = tone === "income" ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-600";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-black text-slate-500">{title}</p>
        <span className="text-[11px] font-bold text-slate-400">{rows.length} kategori</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState text={`Belum ada kategori ${title.toLowerCase()}.`} />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((category) => (
            <div key={category.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-3 py-2.5 lg:rounded-md">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl lg:rounded-md ${toneClass}`}>
                  <Tags size={15} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{category.name}</p>
                  <p className="text-[11px] font-semibold text-slate-500">{category.isDefault ? "Default" : "Custom"}</p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                onClick={() => onEdit?.(category)}
              >
                <Settings size={12} /> Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegacyCategoriesView({ categories, request, onChanged }: { categories: Category[]; request: <T>(path: string, options?: RequestInit) => Promise<T>; onChanged: () => Promise<void> }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request("/categories", {
      method: "POST",
      body: JSON.stringify({
        name: String(form.get("name")),
        categoryType: String(form.get("categoryType")),
        icon: "Circle"
      })
    });
    event.currentTarget.reset();
    await onChanged();
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {categories.map((category) => (
          <div key={category.id} className="card p-4">
            <p className="font-semibold">{category.name}</p>
            <p className="mt-1 text-sm text-slate-500">{category.categoryType === "income" ? "Pemasukan" : "Pengeluaran"} {category.isDefault ? "Â· Default" : ""}</p>
          </div>
        ))}
      </section>
      <form className="card space-y-3 p-5" onSubmit={submit}>
        <h2 className="font-bold">Kategori baru</h2>
        <input className="input" name="name" placeholder="Nama kategori" required />
        <select className="input" name="categoryType">
          <option value="expense">Pengeluaran</option>
          <option value="income">Pemasukan</option>
        </select>
        <button className="btn-primary w-full"><Plus size={16} /> Tambah kategori</button>
      </form>
    </div>
  );
}

function BudgetsView({
  categories,
  request,
  onChanged
}: {
  categories: Category[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onChanged?: () => Promise<void>;
}) {
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingBudget, setEditingBudget] = useState<BudgetRow | null>(null);
  const expenseCategories = categories.filter((category) => category.categoryType === "expense");
  const load = async () => {
    setLoading(true);
    try {
      setBudgets(await request<BudgetRow[]>("/budgets"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load().catch(console.error); }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request(editingBudget ? `/budgets/${editingBudget.id}` : "/budgets", {
        method: editingBudget ? "PUT" : "POST",
        body: JSON.stringify({
          categoryId: String(form.get("categoryId")),
          month: Number(form.get("month")),
          year: Number(form.get("year")),
          budgetAmount: String(form.get("budgetAmount"))
        })
      });
      formElement.reset();
      setEditingBudget(null);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anggaran gagal disimpan");
    }
  };

  const now = new Date();
  const totalBudget = budgets.reduce((sum, budget) => sum + moneyValue(budget.budgetAmount), 0);
  const totalUsed = budgets.reduce((sum, budget) => sum + moneyValue(budget.used), 0);
  const totalPercent = totalBudget > 0 ? Math.round((totalUsed / totalBudget) * 100) : 0;
  const sortedBudgets = [...budgets].sort((a, b) => moneyValue(b.usagePercent) - moneyValue(a.usagePercent));

  return (
    <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader
          title="Budget bulan ini"
          caption={budgets.length > 0 ? `${budgets.length} kategori dipantau - ${totalPercent}% terpakai` : "Belum ada batas pengeluaran"}
          action={<span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-[#00b817]">{rupiah(totalUsed)}</span>}
        />
        <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${totalPercent <= 80 ? "bg-[#00b817]" : totalPercent <= 100 ? "bg-amber-400" : "bg-rose-500"}`}
            style={{ width: `${Math.min(totalPercent, 100)}%` }}
          />
        </div>
        {loading ? (
          <LoadingState />
        ) : sortedBudgets.length === 0 ? (
          <EmptyState text="Buat budget pertama agar pengeluaran lebih mudah dipantau." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {sortedBudgets.map((budget) => {
              const percent = Math.round(moneyValue(budget.usagePercent));
              return (
                <div key={budget.id} className="rounded-2xl border border-slate-100 bg-white px-3 py-3 lg:rounded-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{budget.category}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">Sisa {rupiah(budget.remaining)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${budgetTone(budget.status)}`}>
                      {budget.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-base font-black text-slate-950">{rupiah(budget.used)}</p>
                    <p className="text-xs font-bold text-slate-500">/ {rupiah(budget.budgetAmount)}</p>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${percent <= 80 ? "bg-[#00b817]" : percent <= 100 ? "bg-amber-400" : "bg-rose-500"}`}
                      style={{ width: `${Math.min(percent, 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                      onClick={() => {
                        setError(null);
                        setEditingBudget(budget);
                      }}
                    >
                      <Settings size={12} /> Edit
                    </button>
                    <p className="text-[11px] font-black text-slate-400">{percent}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <form key={editingBudget?.id ?? "new-budget"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
        <SectionHeader
          title={editingBudget ? "Edit budget" : "Atur budget"}
          caption={editingBudget ? "Sesuaikan kategori, periode, atau batas nominal." : "Pilih kategori pengeluaran, periode, lalu isi batas nominal."}
          action={editingBudget ? (
            <button type="button" className="text-xs font-black text-slate-500 hover:text-slate-900" onClick={() => setEditingBudget(null)}>
              Batal
            </button>
          ) : undefined}
        />
        <div className="space-y-3">
          <Field label="Kategori">
            <select className="input" name="categoryId" defaultValue={editingBudget?.categoryId ?? expenseCategories[0]?.id ?? ""} required disabled={expenseCategories.length === 0}>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Bulan">
              <input className="input" name="month" type="number" min={1} max={12} defaultValue={editingBudget?.month ?? now.getMonth() + 1} required />
            </Field>
            <Field label="Tahun">
              <input className="input" name="year" type="number" min={2000} max={2100} defaultValue={editingBudget?.year ?? now.getFullYear()} required />
            </Field>
          </div>
          <Field label="Nilai budget">
            <input className="input" name="budgetAmount" inputMode="decimal" placeholder="Contoh: 1000000" defaultValue={editingBudget?.budgetAmount ?? ""} required />
          </Field>
          <button className="btn-primary w-full" disabled={expenseCategories.length === 0}><CheckCircle2 size={16} /> {editingBudget ? "Simpan perubahan" : "Simpan budget"}</button>
          {expenseCategories.length === 0 && <p className="text-xs font-semibold text-slate-500">Buat kategori pengeluaran dulu sebelum menambahkan budget.</p>}
          {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 lg:rounded-md">{error}</p>}
        </div>
      </form>
    </div>
  );
}

function LegacyBudgetsView({ categories, request }: { categories: Category[]; request: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const [budgets, setBudgets] = useState<any[]>([]);
  const expenseCategories = categories.filter((category) => category.categoryType === "expense");
  const load = async () => setBudgets(await request<any[]>("/budgets"));
  useEffect(() => { load().catch(console.error); }, []);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await request("/budgets", {
      method: "POST",
      body: JSON.stringify({
        categoryId: String(form.get("categoryId")),
        month: Number(form.get("month")),
        year: Number(form.get("year")),
        budgetAmount: String(form.get("budgetAmount"))
      })
    });
    event.currentTarget.reset();
    await load();
  };
  const now = new Date();
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <section className="grid gap-4 md:grid-cols-2">
        {budgets.length === 0 ? <EmptyState text="Belum ada anggaran." /> : budgets.map((budget) => (
          <div key={budget.id} className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{budget.category}</h3>
              <span className={`rounded px-2 py-1 text-xs font-bold ${budget.status === "Aman" ? "bg-emerald-50 text-[#008f12]" : budget.status === "Peringatan" ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{budget.status}</span>
            </div>
            <p className="mt-3 text-2xl font-bold">{rupiah(budget.used)} / {rupiah(budget.budgetAmount)}</p>
            <div className="mt-4 h-3 rounded bg-slate-100">
              <div className="h-3 rounded bg-sky-600" style={{ width: `${Math.min(Number(budget.usagePercent), 100)}%` }} />
            </div>
            <p className="mt-2 text-sm text-slate-500">Sisa {rupiah(budget.remaining)}</p>
          </div>
        ))}
      </section>
      <form className="card space-y-3 p-5" onSubmit={submit}>
        <h2 className="font-bold">Anggaran bulanan</h2>
        <select className="input" name="categoryId" required>{expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" name="month" type="number" min={1} max={12} defaultValue={now.getMonth() + 1} required />
          <input className="input" name="year" type="number" min={2000} max={2100} defaultValue={now.getFullYear()} required />
        </div>
        <input className="input" name="budgetAmount" placeholder="Nilai anggaran" required />
        <button className="btn-primary w-full"><CheckCircle2 size={16} /> Simpan anggaran</button>
      </form>
    </div>
  );
}

type CashFlowReportRow = { date: string; income: string; expense: string; net: string };
type CategoryReportRow = { category: string | null; transactionType: "income" | "expense"; total: string; count: number };
type MonthlyReportRow = { month: string; income: string; expense: string };

function monthYearLabel(value: string | Date) {
  return new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric" }).format(new Date(value));
}

function ReportsView({ request }: { request: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const [cashFlow, setCashFlow] = useState<CashFlowReportRow[]>([]);
  const [categories, setCategories] = useState<CategoryReportRow[]>([]);
  const [months, setMonths] = useState<MonthlyReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      request<CashFlowReportRow[]>("/reports/cash-flow"),
      request<CategoryReportRow[]>("/reports/category-summary"),
      request<MonthlyReportRow[]>("/reports/monthly-comparison")
    ])
      .then(([nextCashFlow, nextCategories, nextMonths]) => {
        if (!active) return;
        setCashFlow(nextCashFlow);
        setCategories(nextCategories);
        setMonths(nextMonths);
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <LoadingState />;

  const totalIncome = cashFlow.reduce((sum, row) => sum + Number(row.income), 0);
  const totalExpense = cashFlow.reduce((sum, row) => sum + Number(row.expense), 0);
  const totalNet = totalIncome - totalExpense;
  const expenseCategories = categories
    .filter((row) => row.transactionType === "expense")
    .sort((a, b) => Number(b.total) - Number(a.total));
  const incomeCategories = categories
    .filter((row) => row.transactionType === "income")
    .sort((a, b) => Number(b.total) - Number(a.total));
  const topExpense = expenseCategories[0];
  const topIncome = incomeCategories[0];
  const latestMonth = months[months.length - 1];
  const previousMonth = months[months.length - 2];
  const latestNet = latestMonth ? Number(latestMonth.income) - Number(latestMonth.expense) : 0;
  const expenseTrend = latestMonth && previousMonth ? Number(latestMonth.expense) - Number(previousMonth.expense) : null;
  const latestMonthLabel = latestMonth ? monthYearLabel(latestMonth.month) : "Belum ada data";
  const trendLabel =
    expenseTrend === null
      ? "Belum ada pembanding"
      : expenseTrend > 0
        ? `Naik ${rupiah(expenseTrend)}`
        : expenseTrend < 0
          ? `Turun ${rupiah(Math.abs(expenseTrend))}`
          : "Tidak berubah";
  const trendHelper = previousMonth ? `Dibanding ${monthYearLabel(previousMonth.month)}` : "Butuh minimal 2 bulan data";

  return (
    <section className="mx-auto max-w-6xl space-y-3 lg:space-y-5">
      <div className="rounded-[26px] bg-[#003d12] p-4 text-white shadow-[0_18px_42px_rgba(0,184,23,0.20)] lg:rounded-lg lg:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase text-white/60">Insight</p>
            <h2 className="mt-1 text-xl font-black tracking-normal">Laporan keuangan</h2>
            <p className="mt-1 text-xs font-semibold text-white/70">Ringkasan dari transaksi bulan berjalan dan perbandingan bulanan.</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
            totalNet >= 0 ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-700"
          }`}>
            {totalNet >= 0 ? "Surplus" : "Defisit"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
            <p className="text-[10px] font-bold text-white/60">Masuk</p>
            <p className="mt-1 truncate text-sm font-black">{rupiah(totalIncome)}</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
            <p className="text-[10px] font-bold text-white/60">Keluar</p>
            <p className="mt-1 truncate text-sm font-black">{rupiah(totalExpense)}</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
            <p className="text-[10px] font-bold text-white/60">Net</p>
            <p className="mt-1 truncate text-sm font-black">{totalNet >= 0 ? "+" : "-"}{rupiah(Math.abs(totalNet))}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ReportInsightCard
          label="Pengeluaran terbesar"
          value={topExpense?.category ?? "Belum ada"}
          helper={topExpense ? `Bulan ini - ${rupiah(topExpense.total)}` : "Belum ada pengeluaran"}
          tone="expense"
          icon={<ShoppingBag size={16} />}
        />
        <ReportInsightCard
          label="Pemasukan terbesar"
          value={topIncome?.category ?? "Belum ada"}
          helper={topIncome ? `Bulan ini - ${rupiah(topIncome.total)}` : "Belum ada pemasukan"}
          tone="income"
          icon={<Wallet size={16} />}
        />
        <ReportInsightCard
          label="Net bulan terakhir"
          value={`${latestNet >= 0 ? "+" : "-"}${rupiah(Math.abs(latestNet))}`}
          helper={latestMonthLabel}
          tone={latestNet >= 0 ? "income" : "expense"}
          icon={<LineChart size={16} />}
        />
        <ReportInsightCard
          label="Perubahan pengeluaran"
          value={trendLabel}
          helper={trendHelper}
          tone={expenseTrend === null ? "neutral" : expenseTrend > 0 ? "expense" : "income"}
          icon={expenseTrend === null ? <LineChart size={16} /> : expenseTrend > 0 ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-950">Arus kas</h3>
              <p className="text-xs font-semibold text-slate-500">{cashFlow.length} hari tercatat</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-[#00b817]">Harian</span>
          </div>
          <CashFlowInsightList rows={cashFlow} />
        </section>

        <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-slate-950">Kategori</h3>
              <p className="text-xs font-semibold text-slate-500">Pengeluaran terbesar</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">{expenseCategories.length} kategori</span>
          </div>
          <CategoryInsightList rows={expenseCategories} />
        </section>
      </div>

      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-slate-950">Antarbulan</h3>
            <p className="text-xs font-semibold text-slate-500">Masuk, keluar, dan net per bulan</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500">{months.length} bulan</span>
        </div>
        <MonthlyInsightList rows={months} />
      </section>
    </section>
  );
}

function ReportInsightCard({
  label,
  value,
  helper,
  tone,
  icon
}: {
  label: string;
  value: string;
  helper: string;
  tone: "income" | "expense" | "neutral";
  icon: JSX.Element;
}) {
  const toneClass =
    tone === "income"
      ? "bg-emerald-50 text-[#00b817]"
      : tone === "expense"
        ? "bg-rose-50 text-rose-600"
        : "bg-slate-100 text-slate-500";
  return (
    <div className="rounded-[22px] border border-white/80 bg-white p-3 shadow-soft lg:rounded-lg lg:border-slate-200">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold leading-tight text-slate-400">{label}</p>
          <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
        </div>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl lg:rounded-md ${toneClass}`}>{icon}</span>
      </div>
      <p className="mt-1 truncate text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

function CashFlowInsightList({ rows }: { rows: CashFlowReportRow[] }) {
  const visibleRows = rows.slice(-7).reverse();
  const maxValue = Math.max(...visibleRows.map((row) => Number(row.income) + Number(row.expense)), 1);

  if (visibleRows.length === 0) return <EmptyState text="Belum ada data arus kas." />;

  return (
    <div className="space-y-2">
      {visibleRows.map((row) => {
        const net = Number(row.net);
        const incomePercent = Math.max((Number(row.income) / maxValue) * 100, Number(row.income) > 0 ? 5 : 0);
        const expensePercent = Math.max((Number(row.expense) / maxValue) * 100, Number(row.expense) > 0 ? 5 : 0);
        return (
          <div key={row.date} className="rounded-2xl border border-slate-100 bg-white px-3 py-2.5 lg:rounded-md">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-950">{localDate(row.date)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Net {net >= 0 ? "+" : "-"}{rupiah(Math.abs(net))}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-black text-[#00b817]">{rupiah(row.income)}</p>
                <p className="text-[11px] font-black text-rose-500">{rupiah(row.expense)}</p>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-emerald-50">
                <div className="h-full rounded-full bg-[#00b817]" style={{ width: `${incomePercent}%` }} />
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-rose-50">
                <div className="h-full rounded-full bg-rose-400" style={{ width: `${expensePercent}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CategoryInsightList({ rows }: { rows: CategoryReportRow[] }) {
  const visibleRows = rows.slice(0, 6);
  const maxValue = Math.max(...visibleRows.map((row) => Number(row.total)), 1);

  if (visibleRows.length === 0) return <EmptyState text="Belum ada data kategori." />;

  return (
    <div className="space-y-2.5">
      {visibleRows.map((row, index) => {
        const percent = Math.round((Number(row.total) / maxValue) * 100);
        return (
          <div key={`${row.category}-${index}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: categoryPalette[index % categoryPalette.length] }} />
                <span className="truncate text-xs font-black text-slate-950">{row.category ?? "Tanpa kategori"}</span>
                <span className="shrink-0 text-[10px] font-bold text-slate-400">{row.count}x</span>
              </div>
              <span className="shrink-0 text-xs font-black text-slate-900">{rupiah(row.total)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full"
                style={{ width: `${percent}%`, backgroundColor: categoryPalette[index % categoryPalette.length] }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MonthlyInsightList({ rows }: { rows: MonthlyReportRow[] }) {
  const visibleRows = rows.slice(-6).reverse();

  if (visibleRows.length === 0) return <EmptyState text="Belum ada data antarbulan." />;

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {visibleRows.map((row) => {
        const income = Number(row.income);
        const expense = Number(row.expense);
        const net = income - expense;
        const expenseRatio = Math.round((expense / Math.max(income, 1)) * 100);
        const ratioTone = expenseRatio <= 80 ? "bg-[#00b817]" : expenseRatio <= 100 ? "bg-amber-400" : "bg-rose-500";
        return (
          <div key={row.month} className="rounded-2xl border border-slate-100 bg-white p-3 lg:rounded-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black text-slate-950">{monthYearLabel(row.month)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Ringkasan bulanan</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${
                net >= 0 ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-600"
              }`}>
                {net >= 0 ? "Surplus" : "Defisit"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-emerald-50 px-2.5 py-2 lg:rounded-md">
                <p className="text-[10px] font-black uppercase text-[#008f12]">Masuk</p>
                <p className="mt-1 truncate text-xs font-black text-[#00b817]">{rupiah(income)}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 px-2.5 py-2 lg:rounded-md">
                <p className="text-[10px] font-black uppercase text-rose-600">Keluar</p>
                <p className="mt-1 truncate text-xs font-black text-rose-600">{rupiah(expense)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-2.5 py-2 lg:rounded-md">
                <p className="text-[10px] font-black uppercase text-slate-500">Net</p>
                <p className={`mt-1 truncate text-xs font-black ${net >= 0 ? "text-[#00b817]" : "text-rose-600"}`}>
                  {net >= 0 ? "+" : "-"}{rupiah(Math.abs(net))}
                </p>
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-500">Rasio keluar dari pemasukan</span>
                <span className="text-slate-900">{income > 0 ? `${expenseRatio}%` : "Tidak ada pemasukan"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${ratioTone}`} style={{ width: `${Math.min(expenseRatio, 100)}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type AssistantMessage = {
  role: "user" | "assistant";
  text: string;
  disclaimer?: string | null;
  suggestions?: string[];
};

function AssistantView({ request }: { request: <T>(path: string, options?: RequestInit) => Promise<T> }) {
  const initialSuggestions = [
    "Saldo sekarang",
    "Pengeluaran bulan ini",
    "Kategori paling boros",
    "Prediksi akhir bulan"
  ];
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      role: "assistant",
      text: "Halo, aku siap bantu baca kondisi keuanganmu. Tulis bebas, bisa satu kata seperti saldo, budget, kategori, atau pertanyaan lengkap.",
      suggestions: initialSuggestions
    }
  ]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  const sendMessage = async (rawMessage: string) => {
    const message = rawMessage.trim();
    if (!message || loading) return;

    setMessages((current) => [...current, { role: "user", text: message }]);
    setLoading(true);
    try {
      const answer = await request<{ answer: string; disclaimer?: string | null; suggestions?: string[] }>("/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message })
      });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: answer.answer,
          disclaimer: answer.disclaimer,
          suggestions: answer.suggestions
        }
      ]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Assistant sedang tidak bisa menjawab. Coba lagi sebentar.",
          suggestions: initialSuggestions
        }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const message = String(data.get("message") ?? "");
    form.reset();
    await sendMessage(message);
  };

  return (
    <section className="mx-auto flex h-full min-h-0 max-w-3xl flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-soft lg:h-[calc(100vh-8rem)] lg:rounded-lg lg:border-slate-200">
      <div className="shrink-0 bg-[#00b817] px-4 py-3 text-white lg:px-5 lg:py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/18 text-white lg:rounded-lg">
            <Bot size={20} />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-black leading-tight">Virtual Assistant</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-white/75">Tanya saldo, spending, budget, atau insight singkat</p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-4 lg:px-5">
        <div className="space-y-3">
          {messages.map((message, index) => {
            const isUser = message.role === "user";
            return (
              <div key={index} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[86%] ${isUser ? "items-end" : "items-start"}`}>
                  <div
                    className={`rounded-[18px] px-3.5 py-2.5 text-sm leading-relaxed shadow-sm lg:rounded-lg ${
                      isUser
                        ? "rounded-br-md bg-[#0078a8] text-white"
                        : "rounded-bl-md border border-slate-100 bg-white text-slate-800"
                    }`}
                  >
                    <p>{message.text}</p>
                    {message.disclaimer && <p className="mt-2 text-[11px] font-semibold opacity-70">{message.disclaimer}</p>}
                  </div>
                  {!isUser && message.suggestions && message.suggestions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {message.suggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          type="button"
                          className="rounded-full border border-emerald-100 bg-white px-2.5 py-1.5 text-[11px] font-black text-[#00b817] shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
                          onClick={() => sendMessage(suggestion)}
                          disabled={loading}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-[18px] rounded-bl-md border border-slate-100 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-500 shadow-sm lg:rounded-lg">
                <Loader2 className="animate-spin text-[#00b817]" size={15} /> Menghitung...
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      <form className="shrink-0 border-t border-slate-100 bg-white p-3" onSubmit={submit}>
        <div className="flex items-center gap-2">
          <input
            className="min-w-0 flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[13px] font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 lg:rounded-md"
            name="message"
            placeholder="Tulis: saldo, budget, spending..."
            autoComplete="off"
            disabled={loading}
          />
          <button
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#00b817] px-4 text-sm font-black text-white shadow-[0_10px_22px_rgba(0,184,23,0.22)] transition hover:bg-[#009714] disabled:cursor-not-allowed disabled:opacity-60 lg:rounded-md"
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={16} /> : <Bot size={16} />}
            Kirim
          </button>
        </div>
      </form>
    </section>
  );
}

function ProfileView({
  session,
  request,
  onLogout
}: {
  session: Session;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onLogout?: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await request("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: String(form.get("currentPassword")),
          newPassword: String(form.get("newPassword"))
        })
      });
      setMessage("Password berhasil diubah.");
      formElement.reset();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Password gagal diubah");
    }
  };
  return (
    <div className="mx-auto grid max-w-5xl gap-3 xl:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-[26px] bg-[#003d12] p-4 text-white shadow-[0_18px_42px_rgba(0,184,23,0.18)] lg:rounded-lg lg:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-black lg:rounded-lg">
            {session.user.fullName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase text-white/60">Profil</p>
            <h2 className="mt-1 truncate text-xl font-black">{session.user.fullName}</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-white/70">{session.user.email}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md"><dt className="font-bold text-white/60">Mata uang</dt><dd className="mt-1 font-black">IDR</dd></div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md"><dt className="font-bold text-white/60">Akun</dt><dd className="mt-1 font-black">Aktif</dd></div>
        </dl>
        {onLogout && (
          <button
            type="button"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-black text-[#003d12] transition hover:bg-emerald-50 lg:hidden"
            onClick={onLogout}
          >
            <LogOut size={16} /> Logout
          </button>
        )}
      </section>
      <form className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
        <SectionHeader title="Keamanan akun" caption="Ubah password secara berkala agar akun tetap aman." />
        <div className="space-y-3">
          <Field label="Password saat ini">
            <input className="input" name="currentPassword" type="password" placeholder="Masukkan password lama" required />
          </Field>
          <Field label="Password baru">
            <input className="input" name="newPassword" type="password" placeholder="Minimal 8 karakter" minLength={8} required />
          </Field>
          <button className="btn-primary w-full"><CheckCircle2 size={16} /> Simpan password</button>
          {message && <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600 lg:rounded-md">{message}</p>}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <label className="block text-xs font-black text-slate-600">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

function transactionDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function transactionDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tanggal tidak valid";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const current = new Date(date);
  current.setHours(0, 0, 0, 0);

  if (current.getTime() === today.getTime()) return "Hari ini";
  if (current.getTime() === yesterday.getTime()) return "Kemarin";
  return localDate(value);
}

function groupTransactionsByDate(rows: Transaction[]) {
  const groups: Array<{ key: string; label: string; rows: Transaction[]; net: number }> = [];
  const byKey = new Map<string, { key: string; label: string; rows: Transaction[]; net: number }>();

  for (const row of rows) {
    const key = transactionDateKey(row.transactionDate);
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: transactionDateLabel(row.transactionDate), rows: [], net: 0 };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
    group.net += row.transactionType === "income" ? Number(row.amount) : -Number(row.amount);
  }

  return groups;
}

function transactionTitle(row: Transaction) {
  return row.merchantName ?? row.categoryName ?? "Transaksi";
}

function transactionCategoryIcon(row: Transaction) {
  const category = row.categoryName?.toLowerCase() ?? "";
  if (row.transactionType === "income") {
    if (category.includes("gaji")) return <Wallet size={18} />;
    if (category.includes("bonus")) return <Sparkles size={18} />;
    if (category.includes("penjualan")) return <Store size={18} />;
    if (category.includes("investasi")) return <TrendingUp size={18} />;
    if (category.includes("usaha")) return <Briefcase size={18} />;
    return <CirclePlus size={18} />;
  }
  if (category.includes("makan")) return <Utensils size={18} />;
  if (category.includes("transport")) return <Bus size={18} />;
  if (category.includes("belanja")) return <ShoppingBag size={18} />;
  if (category.includes("tagihan")) return <ReceiptText size={18} />;
  if (category.includes("kesehatan")) return <HeartPulse size={18} />;
  if (category.includes("pendidikan")) return <GraduationCap size={18} />;
  if (category.includes("hiburan")) return <Film size={18} />;
  if (category.includes("cicilan")) return <CreditCard size={18} />;
  if (category.includes("investasi")) return <TrendingUp size={18} />;
  return <CircleMinus size={18} />;
}

function transactionIconClass(row: Transaction) {
  if (row.transactionType === "income") return "bg-emerald-50 text-[#00b817]";
  const category = row.categoryName?.toLowerCase() ?? "";
  if (category.includes("makan")) return "bg-orange-50 text-orange-600";
  if (category.includes("transport")) return "bg-[#00b817]/10 text-[#00b817]";
  if (category.includes("belanja")) return "bg-violet-50 text-violet-600";
  return "bg-slate-100 text-slate-700";
}

function TransactionHistoryItem({
  row,
  onOpen,
  onRemove,
  compact = false,
  selected = false,
  selectionMode = false,
  onToggleSelect,
  onLongPress
}: {
  row: Transaction;
  onOpen?: () => void;
  onRemove?: () => void;
  compact?: boolean;
  selected?: boolean;
  selectionMode?: boolean;
  onToggleSelect?: () => void;
  onLongPress?: () => void;
}) {
  const isIncome = row.transactionType === "income";
  const [deleteRevealed, setDeleteRevealed] = useState(false);
  const dragStartX = useRef<number | null>(null);
  const dragStartY = useRef<number | null>(null);
  const dragged = useRef(false);
  const suppressClickUntil = useRef(0);
  const holdTimer = useRef<number | null>(null);
  const canSwipeDelete = Boolean(onRemove) && !compact && !selectionMode;

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!compact && !selectionMode && onLongPress) {
      holdTimer.current = window.setTimeout(() => {
        suppressClickUntil.current = Date.now() + 350;
        setDeleteRevealed(false);
        onLongPress();
      }, 520);
    }
    if (canSwipeDelete || (!compact && !selectionMode && onLongPress)) {
      dragStartX.current = event.clientX;
      dragStartY.current = event.clientY;
    }
    dragged.current = false;
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragStartX.current === null) return;
    const delta = event.clientX - dragStartX.current;
    const verticalDelta = dragStartY.current === null ? 0 : event.clientY - dragStartY.current;
    if (Math.abs(delta) > 8 || Math.abs(verticalDelta) > 8) {
      dragged.current = true;
      clearHoldTimer();
    }
    if (!canSwipeDelete) return;
    if (delta < -42) setDeleteRevealed(true);
    if (delta > 42) setDeleteRevealed(false);
  };

  const handlePointerUp = () => {
    clearHoldTimer();
    if (dragged.current) suppressClickUntil.current = Date.now() + 250;
    dragStartX.current = null;
    dragStartY.current = null;
    dragged.current = false;
  };

  const handleOpen = () => {
    if (Date.now() < suppressClickUntil.current) return;
    if (selectionMode) {
      onToggleSelect?.();
      return;
    }
    if (deleteRevealed) {
      setDeleteRevealed(false);
      return;
    }
    onOpen?.();
  };

  return (
    <div className="relative overflow-hidden bg-white">
      {canSwipeDelete && deleteRevealed && (
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-20 items-center justify-center bg-rose-500 text-white"
          onClick={onRemove}
          aria-label="Hapus transaksi"
        >
          <Trash2 size={18} />
        </button>
      )}
      <article
        className={`relative select-none px-4 py-3.5 transition hover:bg-slate-50 ${selected ? "bg-emerald-50/80" : "bg-white"} ${deleteRevealed ? "-translate-x-20" : "translate-x-0"} ${compact ? "lg:px-3" : "lg:px-5"} ${onOpen || selectionMode ? "cursor-pointer" : ""}`}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={handleOpen}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && (onOpen || selectionMode)) {
            event.preventDefault();
            if (selectionMode) {
              onToggleSelect?.();
            } else {
              onOpen?.();
            }
          }
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition ${
            selected ? "bg-[#00b817] text-white shadow-[0_10px_20px_rgba(0,184,23,0.18)]" : transactionIconClass(row)
          }`}>
            {selected ? <CheckCircle2 size={18} /> : transactionCategoryIcon(row)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <p className="truncate text-sm font-black text-slate-950">{transactionTitle(row)}</p>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              {row.accountName}{row.paymentMethod ? ` - ${row.paymentMethod}` : ""}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1">
            <p className={`text-sm font-black ${isIncome ? "text-[#00b817]" : "text-slate-950"}`}>
              {isIncome ? "+" : "-"}{rupiah(row.amount)}
            </p>
            {!compact && <ChevronRight size={14} className="text-slate-300" />}
          </div>
          <p className="mt-1 text-[11px] font-semibold text-slate-400">{isIncome ? "Pemasukan" : "Pengeluaran"}</p>
        </div>
      </div>
      </article>
    </div>
  );
}

function TransactionList({ rows }: { rows: Transaction[] }) {
  if (rows.length === 0) return <EmptyState text="Belum ada transaksi." />;
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white lg:rounded-lg">
      {rows.map((row) => (
        <TransactionHistoryItem key={row.id} row={row} compact />
      ))}
    </div>
  );
}

function LegacyTransactionList({ rows }: { rows: Transaction[] }) {
  if (rows.length === 0) return <EmptyState text="Belum ada transaksi." />;
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white p-3 lg:rounded-md">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              row.transactionType === "income" ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-600"
            }`}>
              {row.transactionType === "income" ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold">{row.merchantName ?? row.categoryName ?? "Transaksi"}</p>
              <p className="truncate text-xs text-slate-500">{row.categoryName ?? row.sourceType ?? "Manual"} Â· {row.accountName}</p>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={`font-black ${row.transactionType === "income" ? "text-[#00b817]" : "text-slate-950"}`}>
              {row.transactionType === "income" ? "+" : "-"}{rupiah(row.amount)}
            </p>
            <p className="text-xs text-slate-400">{localDate(row.transactionDate)}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-56 items-center justify-center text-slate-500">
      <Loader2 className="mr-2 animate-spin" size={18} /> Memuat data...
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">{text}</div>;
}

export default App;



