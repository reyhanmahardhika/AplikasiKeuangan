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
import heic2any from "heic2any";
import { ApiError, apiFetch, downloadUrl, type Session } from "./lib/api";
import { formatRupiahInput, isoDateInput, localDate, rupiah } from "./lib/format";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (options: Record<string, unknown>) => void;
        signIn: () => Promise<{ authorization: { id_token: string }; user?: { name?: { firstName?: string; lastName?: string } } }>;
      };
    };
  }
}

type View =
  | "dashboard"
  | "manual"
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

type Schedule = {
  id: string;
  title: string;
  scheduleType: "transaction" | "transfer" | "topup";
  dueDay: number;
  nextDueDate: string;
  amount?: string | null;
  accountId?: string | null;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  paymentMethod?: string | null;
  notes?: string | null;
  accountName?: string | null;
  destinationAccountName?: string | null;
  categoryName?: string | null;
  daysUntilDue: number;
  reminderStatus: "overdue" | "soon" | "upcoming";
};

type TransactionDetail = Transaction & {
  accountId: string;
  categoryId?: string;
  receiptId?: string | null;
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

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const savedSession = localStorage.getItem("finance-session");

function successMessageFor(path: string, method: string) {
  if (path.includes("/assistant/") || path.includes("/receipts/upload") || path.includes("/process")) return null;
  if (path === "/transactions" && method === "POST") return "Berhasil menambah transaksi";
  if (path.startsWith("/transactions/") && method === "PUT") return "Berhasil mengubah transaksi";
  if (path.startsWith("/transactions/") && method === "DELETE") return "Berhasil menghapus transaksi";
  if (path === "/transfers" && method === "POST") return "Berhasil transfer saldo";
  if (path.includes("/receipts/") && path.endsWith("/confirm") && method === "POST") return "Berhasil menambah transaksi dari struk";
  if (path === "/accounts" && method === "POST") return "Berhasil menambah akun";
  if (path.startsWith("/accounts/") && method === "PUT") return "Berhasil mengubah akun";
  if (path === "/categories" && method === "POST") return "Berhasil menambah kategori";
  if (path.startsWith("/categories/") && method === "PUT") return "Berhasil mengubah kategori";
  if (path === "/budgets" && method === "POST") return "Berhasil menyimpan budget";
  if (path.startsWith("/budgets/") && method === "PUT") return "Berhasil mengubah budget";
  if (path === "/schedules" && method === "POST") return "Berhasil menambah jadwal";
  if (path.startsWith("/schedules/") && method === "PUT") return "Berhasil mengubah jadwal";
  if (path.startsWith("/schedules/") && method === "DELETE") return "Berhasil menghapus jadwal";
  return null;
}

function moneyInputValue(value: string | number | null | undefined) {
  return formatRupiahInput(String(value ?? "").replace(/\.00$/, ""));
}

function dateFilterIso(value: string, boundary: "start" | "end") {
  const date = new Date(`${value}T00:00:00`);
  if (boundary === "end") date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

const navigation: Array<{ id: View; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "manual", label: "Tambah", icon: Plus },
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
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [editing, setEditing] = useState<TransactionDetail | null>(null);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionDetail | null>(null);
  const [historyFocusTransactionId, setHistoryFocusTransactionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installedAsApp, setInstalledAsApp] = useState(() => window.matchMedia("(display-mode: standalone)").matches);
  const notifiedScheduleIds = useRef(new Set<string>());
  const token = session?.accessToken;

  const clearSession = (message?: string) => {
    setSession(null);
    setAccounts([]);
    setCategories([]);
    setSchedules([]);
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
    const method = String(options.method ?? "GET").toUpperCase();
    try {
      const result = await apiFetch<T>(path, session?.accessToken, options);
      const message = successMessageFor(path, method);
      if (message) setNotice(message);
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401 && session?.refreshToken && path !== "/auth/refresh-token") {
        try {
          const refreshedToken = await refreshAccessToken();
          const result = await apiFetch<T>(path, refreshedToken, options);
          const message = successMessageFor(path, method);
          if (message) setNotice(message);
          return result;
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
    const [nextAccounts, nextCategories, nextDashboard, nextSchedules] = await Promise.all([
      request<Account[]>("/accounts"),
      request<Category[]>("/categories"),
      request<DashboardSummary>("/dashboard/summary"),
      request<Schedule[]>("/schedules").catch(() => [])
    ]);
    setAccounts(nextAccounts);
    setCategories(nextCategories);
    setDashboard(nextDashboard);
    setSchedules(nextSchedules);
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

  useEffect(() => {
    const captureInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const markInstalled = () => {
      setInstalledAsApp(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", captureInstallPrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", captureInstallPrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const installApp = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setInstallPrompt(null);
      return;
    }
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
      window.alert("Di Safari, ketuk tombol Bagikan lalu pilih Tambahkan ke Layar Utama.");
      return;
    }
    window.alert("Buka menu browser lalu pilih Instal aplikasi atau Tambahkan ke layar utama.");
  };

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const dueSchedules = schedules.filter((schedule) => schedule.reminderStatus !== "upcoming" && !notifiedScheduleIds.current.has(schedule.id));
    if (!dueSchedules.length) return;
    dueSchedules.forEach((schedule) => notifiedScheduleIds.current.add(schedule.id));
    setNotice(`${dueSchedules.length} jadwal perlu diperhatikan`);
  }, [schedules]);

  if (!session) {
    return <AuthView onSignedIn={setSession} onInstall={installApp} showInstall={!installedAsApp} />;
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

        <MobileTopBar user={session.user} onProfile={() => navigate("profile")} />

        {notice && (
          <div className="fixed left-4 right-4 top-4 z-50 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-[0_18px_44px_rgba(15,23,42,0.16)] lg:left-auto lg:right-6 lg:w-96 lg:rounded-lg">
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
              onAssistant={() => navigate("assistant")}
            />
          )}
          {view === "manual" && (
            <ManualTransactionView
              accounts={accounts}
              categories={categories}
              editing={editing}
              request={request}
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
              token={token!}
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
            <ManageView accounts={accounts} categories={categories} request={request} onNavigate={navigate} onChanged={refreshCore} />
          )}
          {view === "reports" && <ReportsView request={request} />}
          {view === "assistant" && <AssistantView request={request} />}
          {view === "profile" && (
            <ProfileView
              session={session}
              request={request}
              onProfileUpdated={(user) => setSession((current) => {
                if (!current) return current;
                const nextSession = { ...current, user };
                localStorage.setItem("finance-session", JSON.stringify(nextSession));
                return nextSession;
              })}
              onInstall={installApp}
              showInstall={!installedAsApp}
              onLogout={() => clearSession()}
            />
          )}
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

function MobileTopBar({ user, onProfile }: { user: Session["user"]; onProfile: () => void }) {
  return (
    <header className="sticky top-0 z-20 bg-[#f4f8ff]/95 px-4 pb-2 pt-4 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-400 via-violet-500 to-emerald-400 text-sm font-semibold text-white shadow-sm">
            F
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold leading-tight">Finly AI</p>
            <p className="truncate text-xs text-slate-500">Hai, {user.nickname || user.fullName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="mobile-icon-btn" aria-label="Notifikasi" title="Notifikasi">
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          </button>
          <button className="mobile-avatar-btn" aria-label="Profil" title="Profil" onClick={onProfile}>
            {user.avatarUrl ? (
              <img className="h-full w-full rounded-full object-cover" src={user.avatarUrl} alt="" />
            ) : (
              <UserRound size={18} />
            )}
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

function loadAuthScript(id: string, src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => reject(new Error("Provider login gagal dimuat")));
    document.head.appendChild(script);
  });
}

function AuthView({
  onSignedIn,
  onInstall,
  showInstall
}: {
  onSignedIn: (session: Session) => void;
  onInstall: () => Promise<void>;
  showInstall: boolean;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
  const appleClientId = import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined;

  const completeSocialLogin = async (provider: "google" | "apple", idToken: string, fullName?: string) => {
    setSocialLoading(provider);
    setError(null);
    try {
      onSignedIn(await apiFetch<Session>("/auth/social", undefined, {
        method: "POST",
        body: JSON.stringify({ provider, idToken, fullName: fullName || null })
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Login ${provider} gagal`);
    } finally {
      setSocialLoading(null);
    }
  };

  useEffect(() => {
    if (!googleClientId || !googleButtonRef.current) return;
    let active = true;
    loadAuthScript("google-identity-script", "https://accounts.google.com/gsi/client")
      .then(() => {
        if (!active || !window.google || !googleButtonRef.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (response) => completeSocialLogin("google", response.credential)
        });
        googleButtonRef.current.innerHTML = "";
        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: mode === "login" ? "signin_with" : "signup_with",
          shape: "rectangular",
          width: 360
        });
      })
      .catch((err) => active && setError(err.message));
    return () => { active = false; };
  }, [googleClientId, mode]);

  const signInWithApple = async () => {
    if (!appleClientId) {
      setError("Login Apple belum dikonfigurasi. Isi VITE_APPLE_CLIENT_ID dan APPLE_CLIENT_ID.");
      return;
    }
    setSocialLoading("apple");
    setError(null);
    try {
      await loadAuthScript("apple-identity-script", "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js");
      window.AppleID!.auth.init({
        clientId: appleClientId,
        scope: "name email",
        redirectURI: import.meta.env.VITE_APPLE_REDIRECT_URI || window.location.origin,
        usePopup: true
      });
      const response = await window.AppleID!.auth.signIn();
      const name = response.user?.name;
      const fullName = [name?.firstName, name?.lastName].filter(Boolean).join(" ");
      await completeSocialLogin("apple", response.authorization.id_token, fullName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login Apple dibatalkan");
      setSocialLoading(null);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const payload = mode === "register"
        ? { fullName: String(form.get("fullName")), email: String(form.get("email")), password: String(form.get("password")), currency: "IDR" }
        : { email: String(form.get("email")), password: String(form.get("password")) };
      onSignedIn(await apiFetch<Session>(`/auth/${mode === "register" ? "register" : "login"}`, undefined, {
        method: "POST",
        body: JSON.stringify(payload)
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal masuk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f8ff] px-4 py-8">
      <main className="w-full max-w-md overflow-hidden rounded-[26px] border border-white bg-white shadow-[0_24px_70px_rgba(15,23,42,0.12)] lg:rounded-lg">
        <header className="border-b border-emerald-100 bg-emerald-50/70 px-6 py-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00b817] text-white shadow-[0_12px_26px_rgba(0,184,23,0.24)] lg:rounded-md">
            <Wallet size={23} />
          </span>
          <h1 className="mt-3 text-xl font-semibold text-slate-950">Keuangan AI</h1>
          <p className="mt-1 text-sm text-slate-500">{mode === "login" ? "Masuk untuk melanjutkan pencatatanmu." : "Buat akun dan mulai kelola keuanganmu."}</p>
          {showInstall && (
            <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#00b817]" onClick={onInstall}>
              <Download size={14} /> Pasang aplikasi
            </button>
          )}
        </header>

        <section className="p-5 sm:p-6">
          <div className="mb-5 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} onClick={() => { setMode("login"); setError(null); }}>Masuk</button>
            <button type="button" className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === "register" ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`} onClick={() => { setMode("register"); setError(null); }}>Daftar</button>
          </div>

          <div className="space-y-2">
            {googleClientId ? (
              <div className="flex min-h-10 w-full items-center justify-center overflow-hidden" ref={googleButtonRef} />
            ) : (
              <button type="button" className="btn-secondary w-full" onClick={() => setError("Login Google belum dikonfigurasi. Isi VITE_GOOGLE_CLIENT_ID dan GOOGLE_CLIENT_ID.")}>Lanjutkan dengan Google</button>
            )}
            <button type="button" className="flex w-full items-center justify-center rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800" onClick={signInWithApple} disabled={socialLoading === "apple"}>
              {socialLoading === "apple" ? <Loader2 className="animate-spin" size={16} /> : null}
              Lanjutkan dengan Apple
            </button>
          </div>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-slate-200" /><span>atau gunakan email</span><span className="h-px flex-1 bg-slate-200" /></div>

          <form className="space-y-3" onSubmit={submit}>
            {mode === "register" && <Field label="Nama lengkap"><input className="input" name="fullName" autoComplete="name" required minLength={2} /></Field>}
            <Field label="Email"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
            <Field label="Password"><input className="input" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} /></Field>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            <button className="btn-primary w-full" disabled={loading || Boolean(socialLoading)}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
              {mode === "login" ? "Masuk" : "Buat akun"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

const categoryPalette = ["#16c784", "#f6a90b", "#60a5fa", "#2dd4bf", "#8b5cf6", "#ec4899"];

function handleMoneyInput(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatRupiahInput(event.currentTarget.value);
}

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
              <span className="text-sm font-semibold">{rupiah(dashboard.expenseThisMonth)}</span>
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
  onAssistant
}: {
  dashboard: DashboardSummary | null;
  onAdd: () => void;
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
              <p className="text-[11px] font-semibold uppercase text-white/65">Saldo aktif</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-normal sm:text-3xl">{rupiah(balance)}</h2>
              <p className="mt-1 text-xs font-semibold text-white/70">Update dari semua akun aktif</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthClass}`}>
              {healthLabel}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[11px] font-semibold text-white/65">Net bulan ini</p>
              <p className={`mt-0.5 text-sm font-semibold ${net >= 0 ? "text-emerald-100" : "text-rose-100"}`}>
                {net >= 0 ? "+" : "-"}{rupiah(Math.abs(net))}
              </p>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[11px] font-semibold text-white/65">Rata-rata keluar</p>
              <p className="mt-0.5 text-sm font-semibold">{rupiah(averageExpense)}/hari</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-xs font-semibold text-[#008f12] shadow-sm transition hover:bg-emerald-50 lg:rounded-md" onClick={onAdd}>
              <Plus size={15} /> Tambah
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
                <span className="block text-sm font-semibold text-slate-950">Virtual Assistant</span>
                <span className="mt-0.5 block text-xs font-semibold text-slate-500">Tanya kondisi uangmu dengan bahasa bebas.</span>
              </span>
            </span>
            <ChevronRight size={17} className="mt-1 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#00b817]" />
          </span>
          <span className="mt-3 flex flex-wrap gap-1.5">
            {["Saldo", "Budget", "Boros apa?"].map((item) => (
              <span key={item} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
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
              <p className="text-[10px] font-semibold uppercase text-slate-400">{monthLabel}</p>
              <h3 className="text-sm font-semibold text-slate-950">Ringkasan bulan ini</h3>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${healthClass}`}>{ratioLabel}</span>
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
              <span className="font-semibold text-slate-900">{ratioLabel}</span>
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
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{topCategory?.category ?? "Belum ada"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{topCategory ? rupiah(topCategory.total) : "Belum ada pengeluaran"}</p>
          </div>
          <div className="rounded-[22px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
            <p className="text-[11px] font-bold text-slate-400">Anggaran</p>
            <p className={`mt-1 text-sm font-semibold ${alertCount > 0 ? "text-amber-700" : "text-[#00b817]"}`}>
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
              <h3 className="text-sm font-semibold text-slate-950">Arus kas harian</h3>
              <p className="text-xs font-semibold text-slate-500">Aktivitas bulan berjalan</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
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
          <h3 className="mb-4 text-sm font-semibold text-slate-950">Aktivitas terbaru</h3>
          <TransactionList rows={dashboard.lastTransactions} />
        </div>
        <div className="card p-4 lg:p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-950">Notifikasi anggaran</h3>
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
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p>
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
      <p className="mt-3 text-xl font-semibold tracking-normal sm:text-2xl lg:mt-4">{value}</p>
    </div>
  );
}

function ManualTransactionView({
  accounts,
  categories,
  editing,
  request,
  onCancel,
  onDone
}: {
  accounts: Account[];
  categories: Category[];
  editing: TransactionDetail | null;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
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
  const [attachmentLoading, setAttachmentLoading] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentReceiptId, setAttachmentReceiptId] = useState<string | null>(editing?.receiptId ?? null);
  const [attachmentMessage, setAttachmentMessage] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<BudgetRow[]>([]);
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
    setAttachmentName("");
    setAttachmentReceiptId(editing?.receiptId ?? null);
    setAttachmentMessage(null);
    setError(null);
    setErrorContext(null);
  }, [editing?.id, initialDraft]);

  useEffect(() => {
    request<BudgetRow[]>("/budgets")
      .then(setBudgets)
      .catch(() => setBudgets([]));
  }, []);

  const uploadAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setAttachmentLoading(true);
    setAttachmentName(file.name);
    setAttachmentMessage("Mengunggah attachment...");
    setError(null);
    setErrorContext(null);

    try {
      const uploadForm = new FormData();
      uploadForm.set("receipt", file);
      try {
        const uploaded = await request<{ id: string }>("/receipts/upload", { method: "POST", body: uploadForm });
        setAttachmentReceiptId(uploaded.id);
      } catch (err) {
        const duplicateId = err instanceof ApiError && err.status === 409 && err.details && typeof err.details === "object"
          ? String((err.details as { receiptId?: unknown }).receiptId ?? "")
          : "";
        if (!duplicateId) throw err;
        setAttachmentReceiptId(duplicateId);
      }
      setAttachmentMessage("Attachment berhasil diunggah.");
    } catch {
      setAttachmentMessage("Attachment gagal diunggah. Pastikan file berupa gambar atau video.");
    } finally {
      setAttachmentLoading(false);
      event.target.value = "";
    }
  };

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

  const updateAmount = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const cursor = input.selectionStart ?? input.value.length;
    const digitsBeforeCursor = input.value.slice(0, cursor).replace(/\D/g, "").length;
    const formatted = formatRupiahInput(input.value);

    setDraft((current) => ({ ...current, amount: formatted }));
    window.requestAnimationFrame(() => {
      if (document.activeElement !== input) return;
      if (!digitsBeforeCursor) {
        input.setSelectionRange(0, 0);
        return;
      }

      let seenDigits = 0;
      let nextCursor = formatted.length;
      for (let index = 0; index < formatted.length; index += 1) {
        if (/\d/.test(formatted[index])) seenDigits += 1;
        if (seenDigits === digitsBeforeCursor) {
          nextCursor = index + 1;
          break;
        }
      }
      input.setSelectionRange(nextCursor, nextCursor);
    });
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
      receiptId: attachmentReceiptId,
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
  const selectedAccount = accounts.find((account) => account.id === draft.accountId);
  const selectedAccountName = selectedAccount?.name ?? parseResult?.accountName ?? "Pilih akun";
  const selectedCategoryName = categories.find((category) => category.id === draft.categoryId)?.name ?? parseResult?.categoryName ?? "Tanpa kategori";
  const selectedBudget = budgets.find((budget) => budget.categoryId === draft.categoryId);
  const nextExpenseAmount = transactionType === "expense" ? Number(String(draft.amount).replace(/[^\d]/g, "")) : 0;
  const budgetAfterUse = selectedBudget ? moneyValue(selectedBudget.used) + nextExpenseAmount : 0;
  const budgetAfterPercent = selectedBudget && moneyValue(selectedBudget.budgetAmount) > 0 ? Math.round((budgetAfterUse / moneyValue(selectedBudget.budgetAmount)) * 100) : 0;

  return (
    <section className="mx-auto max-w-4xl space-y-3 lg:space-y-5">
      {!editing && (
        <div className="overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-soft lg:rounded-lg lg:border-slate-200">
          <div className="border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-white px-4 py-4 lg:px-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold uppercase text-[#00b817] shadow-sm">
                  <Sparkles size={12} /> AI quick add
                </span>
                <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">Tambah transaksi</h2>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                  Ketik bebas, AI bantu isi nominal, kategori, akun, dan metode pembayaran.
                </p>
              </div>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#00b817] text-white shadow-[0_10px_20px_rgba(0,184,23,0.18)] lg:rounded-md">
                <Bot size={19} />
              </span>
            </div>
          </div>

          <div className="space-y-3 p-4 lg:p-5">
            <label className="block text-xs font-semibold text-slate-600">
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
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
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
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00b817] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(0,184,23,0.22)] transition hover:bg-[#009714] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto lg:rounded-md"
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
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-950">
                    <CheckCircle2 size={16} className="text-[#00b817]" /> Hasil AI
                  </span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#00b817]">
                    {Math.round(parseResult.confidenceScore * 100)}% yakin
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Tipe</p>
                    <p className="font-semibold text-slate-950">{parseResult.transactionType === "income" ? "Pemasukan" : "Pengeluaran"}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Nominal</p>
                    <p className="font-semibold text-slate-950">{rupiah(parseResult.amount)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Kategori</p>
                    <p className="truncate font-semibold text-slate-950">{selectedCategoryName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase text-slate-400">Akun</p>
                    <p className="truncate font-semibold text-slate-950">{selectedAccountName}</p>
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
              className="mb-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
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
                <p className="text-[10px] font-semibold uppercase text-slate-400">{editing ? "Edit" : parseResult ? "Konfirmasi AI" : "Detail"}</p>
                <h2 className="mt-0.5 text-base font-semibold tracking-normal text-slate-950">{editing ? "Edit transaksi" : "Detail transaksi"}</h2>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {editing ? "Ubah data yang diperlukan lalu simpan." : parseResult ? "Hasil AI sudah masuk, cek sebelum simpan." : "Isi manual atau mulai dari AI di atas."}
                </p>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 rounded-2xl bg-slate-100 p-1 sm:w-fit lg:rounded-md">
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition lg:rounded-md ${
                  transactionType === "income" ? "bg-white text-[#008f12] shadow-sm" : "text-slate-500"
                }`}
                onClick={() => setTransactionType("income")}
              >
                Pemasukan
              </button>
              <button
                type="button"
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition lg:rounded-md ${
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
            <input
              className="input"
              name="amount"
              inputMode="numeric"
              min="1"
              value={draft.amount}
              onChange={updateAmount}
              required
            />
          </Field>
          <Field label="Akun">
            <div>
              <select
                className="input"
                name="accountId"
                value={draft.accountId}
                onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))}
                required
              >
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name} - {rupiah(account.currentBalance)}</option>
                ))}
              </select>
              {selectedAccount && (
                <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-slate-500">
                  <span>Saldo saat ini</span>
                  <span className="font-semibold text-slate-900">{rupiah(selectedAccount.currentBalance)}</span>
                </div>
              )}
            </div>
          </Field>
          <Field label="Kategori">
            <select className="input" name="categoryId" defaultValue={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: event.target.value }))}>
              <option value="">Tanpa kategori</option>
              {filteredCategories.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </Field>
          {transactionType === "expense" && selectedBudget && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2.5 text-xs md:col-span-2 lg:rounded-md">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-600">Budget {selectedBudget.category}</span>
                <span className={`font-semibold ${budgetAfterPercent > 100 ? "text-rose-600" : "text-[#00b817]"}`}>{budgetAfterPercent}% setelah transaksi</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                <div className={`h-full rounded-full ${budgetAfterPercent > 100 ? "bg-rose-500" : "bg-[#00b817]"}`} style={{ width: `${Math.min(budgetAfterPercent, 100)}%` }} />
              </div>
              <p className="mt-2 font-semibold text-slate-500">
                Terpakai {rupiah(selectedBudget.used)} + transaksi ini {rupiah(nextExpenseAmount)} dari {rupiah(selectedBudget.budgetAmount)}.
              </p>
            </div>
          )}
          <Field label="Sumber atau merchant">
            <input className="input" name="merchantName" defaultValue={draft.merchantName} />
          </Field>
          <Field label="Metode pembayaran">
            <input className="input" name="paymentMethod" defaultValue={draft.paymentMethod} placeholder="Tunai, QRIS, debit" />
          </Field>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 md:col-span-2 lg:rounded-md">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-700">Attachment transaksi</p>
                <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                  Tambahkan gambar atau video sebagai bukti pendukung transaksi.
                </p>
              </div>
              <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#00b817] shadow-sm ring-1 ring-slate-200 transition hover:bg-emerald-50 lg:rounded-md">
                {attachmentLoading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                {attachmentReceiptId ? "Ganti" : "Pilih file"}
                <input className="sr-only" type="file" accept="image/*,video/*,.heic,.heif" onChange={uploadAttachment} disabled={attachmentLoading} />
              </label>
            </div>
            {(attachmentName || editing?.receiptId) && (
              <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 lg:rounded-md">
                <ReceiptText className="shrink-0 text-[#00b817]" size={14} />
                <span className="truncate">{attachmentName || "Attachment transaksi tersimpan"}</span>
              </div>
            )}
            {attachmentMessage && (
              <p className={`mt-2 text-[11px] leading-4 ${attachmentMessage.includes("berhasil") ? "text-[#008f12]" : "text-slate-500"}`}>
                {attachmentMessage}
              </p>
            )}
          </div>
          <label className="block text-xs font-semibold text-slate-600 md:col-span-2">
            Catatan
            <div className="mt-1">
              <textarea
                className="input min-h-28 whitespace-pre-wrap"
                name="notes"
                value={draft.notes}
                onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
              />
            </div>
          </label>
          {error && errorContext === "submit" && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 md:col-span-2 lg:rounded-md">{error}</p>}
          <div className="md:col-span-2">
            <button className="btn-primary w-full" disabled={loading || attachmentLoading || accounts.length === 0}>
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
  token,
  onBack,
  onEdit,
  onDelete
}: {
  transaction: TransactionDetail;
  token: string;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isIncome = transaction.transactionType === "income";
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState<string | null>(null);
  const [attachmentOriginalUrl, setAttachmentOriginalUrl] = useState<string | null>(null);
  const [attachmentPreviewLoading, setAttachmentPreviewLoading] = useState(Boolean(transaction.receiptId));
  const [attachmentContentType, setAttachmentContentType] = useState("");

  useEffect(() => {
    if (!transaction.receiptId) {
      setAttachmentPreviewUrl(null);
      setAttachmentOriginalUrl(null);
      setAttachmentPreviewLoading(false);
      return;
    }

    let active = true;
    const objectUrls: string[] = [];
    setAttachmentPreviewLoading(true);
    const loadAttachment = async () => {
      try {
        const response = await fetch(downloadUrl(`/receipts/${transaction.receiptId}/file`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Attachment tidak dapat dimuat");
        const blob = await response.blob();
        const contentType = response.headers.get("content-type") ?? blob.type;
        const fileSignature = new TextDecoder("ascii").decode(await blob.slice(4, 16).arrayBuffer());
        const isHeic = /image\/hei[cf]/i.test(contentType) || /ftyp(?:heic|heix|hevc|hevx|mif1|msf1)/i.test(fileSignature);
        const originalUrl = URL.createObjectURL(blob);
        objectUrls.push(originalUrl);
        if (!active) return;
        setAttachmentOriginalUrl(originalUrl);

        if (isHeic) {
          try {
            const converted = await heic2any({ blob, toType: "image/jpeg", quality: 0.9 });
            const previewBlob = Array.isArray(converted) ? converted[0] : converted;
            const previewUrl = URL.createObjectURL(previewBlob);
            objectUrls.push(previewUrl);
            if (!active) return;
            setAttachmentContentType("image/jpeg");
            setAttachmentPreviewUrl(previewUrl);
          } catch {
            setAttachmentContentType(contentType);
            setAttachmentPreviewUrl(null);
          }
        } else {
          setAttachmentContentType(contentType);
          setAttachmentPreviewUrl(originalUrl);
        }
      } catch {
        if (active) {
          setAttachmentPreviewUrl(null);
          setAttachmentOriginalUrl(null);
        }
      } finally {
        if (active) setAttachmentPreviewLoading(false);
      }
    };
    loadAttachment();

    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [transaction.receiptId, token]);

  const detailRows = [
    ["Tanggal", localDate(transaction.transactionDate)],
    ["Akun", transaction.accountName ?? "-"],
    ["Metode", transaction.paymentMethod ?? "-"],
    ["Kategori", transaction.categoryName ?? "Tanpa kategori"],
    ["Sumber", transaction.sourceType ?? "Manual"],
    ...(transaction.receiptId ? [["Attachment", "File tersimpan"]] : [])
  ];

  return (
    <section className="mx-auto max-w-3xl space-y-3">
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
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
                <h2 className="truncate text-lg font-semibold text-slate-950">{transactionTitle(transaction)}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{transaction.accountName ?? "-"}{transaction.paymentMethod ? ` - ${transaction.paymentMethod}` : ""}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-lg font-semibold ${isIncome ? "text-[#00b817]" : "text-slate-950"}`}>
                {isIncome ? "+" : "-"}{rupiah(transaction.amount)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-400">{isIncome ? "Pemasukan" : "Pengeluaran"}</p>
            </div>
          </div>
        </div>

        <dl className="grid gap-3 p-5 sm:grid-cols-2">
          {detailRows.map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 px-3 py-2.5 lg:rounded-md">
              <dt className="text-[11px] font-semibold uppercase text-slate-400">{label}</dt>
              <dd className="mt-1 text-sm font-bold text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>

        {transaction.notes && (
          <div className="border-t border-slate-100 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase text-slate-400">Catatan</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{transaction.notes}</p>
          </div>
        )}

        {transaction.receiptId && (
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase text-slate-400">Attachment</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">File attachment transaksi</p>
              </div>
              {attachmentOriginalUrl && (
                <button
                  type="button"
                  className="text-xs font-semibold text-[#00b817]"
                  onClick={() => window.open(attachmentOriginalUrl, "_blank", "noopener,noreferrer")}
                >
                  Buka file
                </button>
              )}
            </div>
            {attachmentPreviewLoading ? (
              <div className="flex h-44 items-center justify-center rounded-2xl bg-slate-50 text-slate-400 lg:rounded-md">
                <Loader2 className="animate-spin" size={22} />
              </div>
            ) : attachmentPreviewUrl && attachmentContentType.startsWith("video/") ? (
              <video className="max-h-[520px] w-full rounded-2xl bg-black lg:rounded-md" src={attachmentPreviewUrl} controls preload="metadata">
                Browser tidak mendukung preview video ini.
              </video>
            ) : attachmentPreviewUrl && attachmentContentType.startsWith("image/") ? (
              <button
                type="button"
                className="block w-full overflow-hidden rounded-2xl bg-slate-100 lg:rounded-md"
                onClick={() => window.open(attachmentPreviewUrl, "_blank", "noopener,noreferrer")}
                aria-label="Buka attachment ukuran penuh"
              >
                <img className="max-h-[520px] w-full object-contain" src={attachmentPreviewUrl} alt="Attachment transaksi" />
              </button>
            ) : attachmentOriginalUrl ? (
              <button
                type="button"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-50 px-4 py-8 text-sm font-semibold text-[#00b817] lg:rounded-md"
                onClick={() => window.open(attachmentOriginalUrl, "_blank", "noopener,noreferrer")}
              >
                <ReceiptText size={18} /> Buka attachment
              </button>
            ) : (
              <p className="rounded-2xl bg-rose-50 px-3 py-3 text-xs text-rose-700 lg:rounded-md">
                Attachment tidak dapat dimuat.
              </p>
            )}
          </div>
        )}

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
            <p className="text-[10px] font-semibold uppercase text-[#00b817]">Scan struk</p>
            <h2 className="mt-0.5 text-lg font-semibold text-slate-950">Upload atau foto struk</h2>
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
          <button type="button" className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-[#00b817] lg:rounded-md" onClick={() => cameraInputRef.current?.click()}>
            <Camera size={18} /> Kamera
          </button>
          <button type="button" className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-[#00b817] lg:rounded-md" onClick={() => galleryInputRef.current?.click()}>
            <ReceiptText size={18} /> Galeri
          </button>
          <button type="button" className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs font-semibold text-slate-700 transition hover:border-emerald-100 hover:bg-emerald-50 hover:text-[#00b817] lg:rounded-md" onClick={() => fileInputRef.current?.click()}>
            <Upload size={18} /> File
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-[22px] border border-dashed border-slate-200 bg-slate-50 lg:rounded-md">
          {preview ? (
            <img className="max-h-96 w-full object-contain" src={preview} alt="Preview struk" />
          ) : selectedFile ? (
            <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
              <ReceiptText className="mb-3 text-[#00b817]" size={28} />
              <p className="text-sm font-semibold text-slate-950">{selectedFile.name}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">PDF siap diproses.</p>
            </div>
          ) : (
            <div className="flex min-h-44 flex-col items-center justify-center px-4 py-8 text-center">
              <Upload className="mb-3 text-slate-400" size={28} />
              <p className="text-sm font-semibold text-slate-700">Belum ada struk</p>
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
            <p className="text-[10px] font-semibold uppercase text-[#00b817]">Transaksi</p>
            <h2 className="mt-0.5 text-base font-semibold tracking-normal text-slate-950">Riwayat transaksi</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{rows.length} transaksi tampil</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-[#00b817]">
            {type === "income" ? "Masuk" : type === "expense" ? "Keluar" : "Semua"}
          </span>
        </div>
        <div className="mt-3 rounded-2xl bg-[#00b817] px-4 py-3 text-white lg:rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-white/75">Net transaksi</p>
              <p className="mt-0.5 text-[11px] font-semibold text-white/65">Sesuai filter aktif</p>
            </div>
            <p className="shrink-0 text-base font-semibold">{netTotal >= 0 ? "+" : "-"}{rupiah(Math.abs(netTotal))}</p>
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-emerald-50 px-3 py-2 lg:rounded-md">
            <p className="text-[11px] font-bold text-[#008f12]">Masuk</p>
            <p className="mt-0.5 text-[13px] font-semibold leading-tight text-[#008f12]">{rupiah(totalIncome)}</p>
          </div>
          <div className="rounded-2xl bg-rose-50 px-3 py-2 lg:rounded-md">
            <p className="text-[11px] font-bold text-rose-700">Keluar</p>
            <p className="mt-0.5 text-[13px] font-semibold leading-tight text-rose-700">{rupiah(totalExpense)}</p>
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
              className={`rounded-xl px-3 py-2 text-xs font-semibold transition lg:rounded-md ${
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
            <span className="text-[10px] font-semibold uppercase text-slate-400">Dari</span>
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
            <span className="text-[10px] font-semibold uppercase text-slate-400">Sampai</span>
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
            <button className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => exportFile("csv")}><Download size={13} /> CSV</button>
            <button className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50" onClick={() => exportFile("excel")}><FileSpreadsheet size={13} /> Excel</button>
          </div>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="sticky top-16 z-20 rounded-[22px] border border-emerald-100 bg-white/95 p-3 shadow-soft backdrop-blur lg:top-20 lg:rounded-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-950">{selectedCount} dipilih</p>
              <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">Tap transaksi lain untuk tambah pilihan.</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                onClick={clearSelection}
              >
                Batal
              </button>
              <button
                type="button"
                className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#00b817] transition hover:bg-emerald-100"
                onClick={allVisibleSelected ? clearSelection : selectAllVisible}
              >
                {allVisibleSelected ? "Batal semua" : "Pilih semua"}
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600"
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
          <div className="flex min-w-max items-center gap-2 text-[11px] font-semibold text-slate-500">
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
                  <h3 className="text-sm font-semibold text-slate-950">{group.label}</h3>
                  <p className="text-xs font-semibold text-slate-500">{group.rows.length} transaksi</p>
                </div>
                <p className={`text-sm font-semibold ${group.net >= 0 ? "text-[#00b817]" : "text-slate-900"}`}>
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

type ManageTab = "budgets" | "accounts" | "categories" | "schedules";
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
        <h3 className="text-sm font-semibold text-slate-950">{title}</h3>
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
  onNavigate,
  onChanged
}: {
  accounts: Account[];
  categories: Category[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onNavigate: (view: View) => void;
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
    { id: "categories", label: "Kategori", icon: Tags, meta: `${expenseCategoryCount} pengeluaran` },
    { id: "schedules", label: "Jadwal", icon: Bell, meta: "Pengingat bayar" }
  ];

  return (
    <section className="mx-auto max-w-6xl space-y-3 lg:space-y-5">
      <div className="grid gap-3 lg:grid-cols-[1.05fr_1.35fr]">
        <div className="rounded-[26px] bg-[#003d12] p-4 text-white shadow-[0_18px_42px_rgba(0,184,23,0.18)] lg:rounded-lg lg:p-5">
          <p className="text-[10px] font-semibold uppercase text-white/60">Kelola</p>
          <h2 className="mt-1 text-xl font-semibold tracking-normal">Dompet & aturan</h2>
          <p className="mt-1 text-xs font-semibold text-white/70">Atur akun, kategori, dan batas budget dari satu tempat.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[10px] font-bold text-white/60">Saldo akun</p>
              <p className="mt-1 truncate text-sm font-semibold">{rupiah(totalBalance)}</p>
            </div>
            <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
              <p className="text-[10px] font-bold text-white/60">Kategori</p>
              <p className="mt-1 truncate text-sm font-semibold">{categories.length} aktif</p>
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
                    <span className="block text-sm font-semibold">{tab.label}</span>
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
      {activeTab === "schedules" && <SchedulesView accounts={accounts} categories={categories} request={request} onNavigate={onNavigate} onTransfer={() => setActiveTab("accounts")} />}
    </section>
  );
}

function scheduleTone(status: Schedule["reminderStatus"]) {
  if (status === "overdue") return "bg-rose-50 text-rose-700";
  if (status === "soon") return "bg-amber-50 text-amber-700";
  return "bg-emerald-50 text-[#00b817]";
}

function SchedulesView({
  accounts,
  categories,
  request,
  onNavigate,
  onTransfer
}: {
  accounts: Account[];
  categories: Category[];
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onNavigate: (view: View) => void;
  onTransfer: () => void;
}) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);
  const [scheduleView, setScheduleView] = useState<"list" | "form">("list");
  const expenseCategories = categories.filter((category) => category.categoryType === "expense");

  const load = async () => {
    setLoading(true);
    try {
      setSchedules(await request<Schedule[]>("/schedules"));
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
      await request(editingSchedule ? `/schedules/${editingSchedule.id}` : "/schedules", {
        method: editingSchedule ? "PUT" : "POST",
        body: JSON.stringify({
          title: String(form.get("title")),
          scheduleType: String(form.get("scheduleType")),
          dueDay: Number(form.get("dueDay")),
          nextDueDate: String(form.get("nextDueDate")),
          amount: String(form.get("amount") || "") || null,
          accountId: String(form.get("accountId") || "") || null,
          destinationAccountId: String(form.get("destinationAccountId") || "") || null,
          categoryId: String(form.get("categoryId") || "") || null,
          paymentMethod: String(form.get("paymentMethod") || "") || null,
          notes: String(form.get("notes") || "") || null
        })
      });
      formElement.reset();
      setEditingSchedule(null);
      await load();
      setScheduleView("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Jadwal gagal disimpan");
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Hapus jadwal ini?")) return;
    await request(`/schedules/${id}`, { method: "DELETE" });
    await load();
  };

  return (
    <div className="space-y-3">
      {scheduleView === "list" && (
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader
          title="Jadwal & pemberitahuan"
          caption="Pengingat pembayaran, top up, atau transfer rutin."
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00b817]"
              onClick={() => {
                setError(null);
                setEditingSchedule(null);
                setScheduleView("form");
              }}
            >
              <Plus size={14} /> Tambah
            </button>
          )}
        />
        {loading ? <LoadingState /> : schedules.length === 0 ? (
          <EmptyState text="Belum ada jadwal. Tambahkan pengingat rutin pertama Anda." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {schedules.map((schedule) => (
              <article key={schedule.id} className="rounded-2xl border border-slate-100 bg-white px-3 py-3 lg:rounded-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{schedule.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {localDate(schedule.nextDueDate)} {schedule.amount ? `- ${rupiah(schedule.amount)}` : ""}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${scheduleTone(schedule.reminderStatus)}`}>
                    {schedule.reminderStatus === "overdue" ? "Lewat" : schedule.reminderStatus === "soon" ? `${schedule.daysUntilDue} hari` : "Aktif"}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {schedule.scheduleType === "transfer" || schedule.scheduleType === "topup"
                    ? `${schedule.accountName ?? "Akun"} ke ${schedule.destinationAccountName ?? "tujuan"}`
                    : `${schedule.categoryName ?? "Transaksi"} dari ${schedule.accountName ?? "akun"}`}
                </p>
                <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-[#00b817] transition hover:bg-emerald-100"
                    onClick={() => schedule.scheduleType === "transaction" ? onNavigate("manual") : onTransfer()}
                  >
                    Buat sekarang
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                    onClick={() => {
                      setError(null);
                      setEditingSchedule(schedule);
                      setScheduleView("form");
                    }}
                    aria-label={`Edit jadwal ${schedule.title}`}
                  >
                    <Settings size={13} />
                  </button>
                  <button type="button" className="rounded-full bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600" onClick={() => remove(schedule.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      )}

      {scheduleView === "form" && (
      <form key={editingSchedule?.id ?? "new-schedule"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
        <SectionHeader
          title={editingSchedule ? "Edit jadwal" : "Tambah jadwal"}
          caption={editingSchedule ? "Sesuaikan pengingat dan detail transaksi terjadwal." : "Contoh: bayar SPP tiap tanggal 1 atau top up GoPay."}
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              onClick={() => {
                setEditingSchedule(null);
                setError(null);
                setScheduleView("list");
              }}
            >
              <ArrowLeft size={14} /> Kembali
            </button>
          )}
        />
        <div className="space-y-3">
          <Field label="Judul">
            <input className="input" name="title" placeholder="Bayar SPP sekolah" defaultValue={editingSchedule?.title ?? ""} required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Tipe">
              <select className="input" name="scheduleType" defaultValue={editingSchedule?.scheduleType ?? "transaction"}>
                <option value="transaction">Transaksi</option>
                <option value="transfer">Transfer</option>
                <option value="topup">Top up</option>
              </select>
            </Field>
            <Field label="Tanggal rutin">
              <input className="input" name="dueDay" type="number" min={1} max={31} defaultValue={editingSchedule?.dueDay ?? 1} required />
            </Field>
          </div>
          <Field label="Jatuh tempo berikutnya">
            <input className="input" name="nextDueDate" type="date" defaultValue={editingSchedule?.nextDueDate ? isoDateInput(new Date(editingSchedule.nextDueDate)) : isoDateInput()} required />
          </Field>
          <Field label="Nominal">
            <input className="input" name="amount" inputMode="numeric" placeholder="Opsional" defaultValue={moneyInputValue(editingSchedule?.amount)} onInput={handleMoneyInput} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Akun sumber">
              <select className="input" name="accountId" defaultValue={editingSchedule?.accountId ?? ""}>
                <option value="">Pilih akun</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
            <Field label="Akun tujuan">
              <select className="input" name="destinationAccountId" defaultValue={editingSchedule?.destinationAccountId ?? ""}>
                <option value="">Opsional</option>
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Kategori">
            <select className="input" name="categoryId" defaultValue={editingSchedule?.categoryId ?? ""}>
              <option value="">Opsional</option>
              {expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </Field>
          <input className="input" name="paymentMethod" placeholder="Metode pembayaran, misalnya BCA atau GoPay" defaultValue={editingSchedule?.paymentMethod ?? ""} />
          <input className="input" name="notes" placeholder="Catatan singkat" defaultValue={editingSchedule?.notes ?? ""} />
          <button className="btn-primary w-full"><Bell size={16} /> {editingSchedule ? "Simpan perubahan" : "Simpan jadwal"}</button>
          {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 lg:rounded-md">{error}</p>}
        </div>
      </form>
      )}
    </div>
  );
}

function AccountsView({ accounts, request, onChanged }: { accounts: Account[]; request: <T>(path: string, options?: RequestInit) => Promise<T>; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accountView, setAccountView] = useState<"list" | "account-form" | "transfer-form">("list");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [transferAttachmentId, setTransferAttachmentId] = useState<string | null>(null);
  const [transferAttachmentName, setTransferAttachmentName] = useState("");
  const [transferAttachmentLoading, setTransferAttachmentLoading] = useState(false);
  const [transferAttachmentMessage, setTransferAttachmentMessage] = useState<string | null>(null);
  const sourceAccount = accounts.find((account) => account.id === sourceAccountId);
  const destinationAccount = accounts.find((account) => account.id === destinationAccountId);
  const totalBalance = accounts.reduce(
    (sum, account) => sum + (account.accountType === "credit_card" ? -moneyValue(account.currentBalance) : moneyValue(account.currentBalance)),
    0
  );

  useEffect(() => {
    if (!accounts.length) {
      setSourceAccountId("");
      setDestinationAccountId("");
      return;
    }

    setSourceAccountId((current) => accounts.some((account) => account.id === current) ? current : accounts[0].id);
    setDestinationAccountId((current) => {
      if (accounts.some((account) => account.id === current && account.id !== sourceAccountId)) return current;
      return accounts.find((account) => account.id !== sourceAccountId)?.id ?? accounts[0].id;
    });
  }, [accounts, sourceAccountId]);

  const uploadTransferAttachment = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTransferAttachmentLoading(true);
    setTransferAttachmentName(file.name);
    setTransferAttachmentMessage("Mengunggah attachment...");
    setError(null);

    try {
      const uploadForm = new FormData();
      uploadForm.set("receipt", file);
      try {
        const uploaded = await request<{ id: string }>("/receipts/upload", { method: "POST", body: uploadForm });
        setTransferAttachmentId(uploaded.id);
      } catch (err) {
        const duplicateId = err instanceof ApiError && err.status === 409 && err.details && typeof err.details === "object"
          ? String((err.details as { receiptId?: unknown }).receiptId ?? "")
          : "";
        if (!duplicateId) throw err;
        setTransferAttachmentId(duplicateId);
      }
      setTransferAttachmentMessage("Attachment berhasil diunggah.");
    } catch {
      setTransferAttachmentId(null);
      setTransferAttachmentMessage("Attachment gagal diunggah. Pastikan file berupa gambar atau video.");
    } finally {
      setTransferAttachmentLoading(false);
      event.target.value = "";
    }
  };

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
      setAccountView("list");
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
          feeAmount: String(form.get("feeAmount") || "0"),
          transferDate: new Date(String(form.get("transferDate"))).toISOString(),
          notes: String(form.get("notes") || "") || null,
          receiptId: transferAttachmentId
        })
      });
      formElement.reset();
      setTransferAttachmentId(null);
      setTransferAttachmentName("");
      setTransferAttachmentMessage(null);
      await onChanged();
      setAccountView("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer gagal");
    }
  };

  return (
    <div className="space-y-3">
      {accountView === "list" && (
        <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader
          title="Akun & saldo"
          caption={`${accounts.length} akun aktif - total ${rupiah(totalBalance)}`}
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00b817]"
              onClick={() => {
                setError(null);
                setEditingAccount(null);
                setAccountView("account-form");
              }}
            >
              <Plus size={14} /> Tambah
            </button>
          )}
        />
        <button
          type="button"
          className="btn-primary mb-3 w-full"
          disabled={accounts.length < 2}
          onClick={() => {
            setError(null);
            setAccountView("transfer-form");
          }}
        >
          <ArrowLeftRight size={16} /> Transfer saldo
        </button>
        {accounts.length === 0 ? (
          <EmptyState text="Belum ada akun. Tambahkan kas, rekening, atau e-wallet pertama Anda." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {accounts.map((account) => (
              <div key={account.id} className="rounded-2xl border border-slate-100 bg-white px-3 py-3 lg:rounded-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">{account.name}</p>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">{accountTypeLabel(account.accountType)}</p>
                  </div>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#00b817] lg:rounded-md">
                    <CreditCard size={16} />
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold tracking-normal text-slate-950">{rupiah(account.currentBalance)}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-slate-500">Saldo awal {rupiah(account.initialBalance)}</p>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                    onClick={() => {
                      setError(null);
                      setEditingAccount(account);
                      setAccountView("account-form");
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
      )}

      {accountView === "account-form" && (
        <form key={editingAccount?.id ?? "new-account"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
          <SectionHeader
            title={editingAccount ? "Edit akun" : "Tambah akun"}
            caption={editingAccount ? "Ubah nama, tipe, atau aturan saldo minus." : "Pisahkan kas, rekening, e-wallet, atau kartu kredit."}
            action={(
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setEditingAccount(null);
                  setError(null);
                  setAccountView("list");
                }}
              >
                <ArrowLeft size={14} /> Kembali
              </button>
            )}
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
                <input className="input" name="initialBalance" inputMode="numeric" placeholder="Contoh: 500000" onInput={handleMoneyInput} required />
              </Field>
            )}
            <label className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 lg:rounded-md">
              <input className="mt-0.5" name="allowNegative" type="checkbox" defaultChecked={editingAccount?.allowNegative ?? false} />
              Izinkan saldo minus untuk akun ini
            </label>
            <button className="btn-primary w-full">{editingAccount ? <CheckCircle2 size={16} /> : <Plus size={16} />} {editingAccount ? "Simpan perubahan" : "Simpan akun"}</button>
          </div>
        </form>
      )}

      {accountView === "transfer-form" && (
        <form className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={transfer}>
          <SectionHeader
            title="Transfer saldo"
            caption="Pindahkan uang antar akun tanpa membuat pengeluaran."
            action={(
              <button
                type="button"
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
                onClick={() => {
                  setError(null);
                  setAccountView("list");
                }}
              >
                <ArrowLeft size={14} /> Kembali
              </button>
            )}
          />
          <div className="space-y-3">
            <Field label="Dari akun">
              <div>
                <select
                  className="input"
                  name="sourceAccountId"
                  value={sourceAccountId}
                  onChange={(event) => {
                    const nextSourceId = event.target.value;
                    setSourceAccountId(nextSourceId);
                    if (destinationAccountId === nextSourceId) {
                      setDestinationAccountId(accounts.find((account) => account.id !== nextSourceId)?.id ?? "");
                    }
                  }}
                  required
                  disabled={accounts.length < 2}
                >
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {rupiah(account.currentBalance)}</option>)}
                </select>
                {sourceAccount && (
                  <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-slate-500">
                    <span>Saldo tersedia</span>
                    <span className="font-semibold text-slate-900">{rupiah(sourceAccount.currentBalance)}</span>
                  </div>
                )}
              </div>
            </Field>
            <Field label="Ke akun">
              <div>
                <select
                  className="input"
                  name="destinationAccountId"
                  value={destinationAccountId}
                  onChange={(event) => setDestinationAccountId(event.target.value)}
                  required
                  disabled={accounts.length < 2}
                >
                  {accounts.filter((account) => account.id !== sourceAccountId).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} - {rupiah(account.currentBalance)}</option>
                  ))}
                </select>
                {destinationAccount && (
                  <div className="mt-1.5 flex items-center justify-between px-1 text-xs text-slate-500">
                    <span>Saldo saat ini</span>
                    <span className="font-semibold text-slate-900">{rupiah(destinationAccount.currentBalance)}</span>
                  </div>
                )}
              </div>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Nominal">
                <input className="input" name="amount" inputMode="numeric" placeholder="100000" onInput={handleMoneyInput} required />
              </Field>
              <Field label="Tanggal">
                <input className="input" name="transferDate" type="date" defaultValue={isoDateInput()} required />
              </Field>
            </div>
            <Field label="Fee/admin">
              <input className="input" name="feeAmount" inputMode="numeric" placeholder="Opsional, contoh: 2500" onInput={handleMoneyInput} />
            </Field>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 lg:rounded-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">Attachment transfer</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Tambahkan gambar atau video sebagai bukti transfer.</p>
                </div>
                <label className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#00b817] shadow-sm ring-1 ring-slate-200 transition hover:bg-emerald-50 lg:rounded-md">
                  {transferAttachmentLoading ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                  {transferAttachmentId ? "Ganti" : "Pilih file"}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/*,video/*,.heic,.heif"
                    onChange={uploadTransferAttachment}
                    disabled={transferAttachmentLoading}
                  />
                </label>
              </div>
              {transferAttachmentName && (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-slate-600 lg:rounded-md">
                  <ReceiptText className="shrink-0 text-[#00b817]" size={14} />
                  <span className="truncate">{transferAttachmentName}</span>
                </div>
              )}
              {transferAttachmentMessage && (
                <p className={`mt-2 text-[11px] leading-4 ${transferAttachmentMessage.includes("berhasil") ? "text-[#008f12]" : "text-slate-500"}`}>
                  {transferAttachmentMessage}
                </p>
              )}
            </div>
            <input className="input" name="notes" placeholder="Catatan transfer (opsional)" />
            <button className="btn-secondary w-full" disabled={accounts.length < 2 || transferAttachmentLoading}><ArrowLeftRight size={16} /> Transfer</button>
          </div>
        </form>
      )}
      {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 lg:rounded-md">{error}</p>}
    </div>
  );
}

function CategoriesView({ categories, request, onChanged }: { categories: Category[]; request: <T>(path: string, options?: RequestInit) => Promise<T>; onChanged: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryView, setCategoryView] = useState<"list" | "form">("list");
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
      setCategoryView("list");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kategori gagal disimpan");
    }
  };

  return (
    <div className="space-y-3">
      {categoryView === "list" && (
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader
          title="Kategori transaksi"
          caption={`${expenseCategories.length} pengeluaran - ${incomeCategories.length} pemasukan`}
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00b817]"
              onClick={() => {
                setError(null);
                setEditingCategory(null);
                setCategoryView("form");
              }}
            >
              <Plus size={14} /> Tambah
            </button>
          )}
        />
        <div className="space-y-4">
          <CategoryGroup title="Pengeluaran" rows={expenseCategories} tone="expense" onEdit={(category) => {
            setError(null);
            setEditingCategory(category);
            setCategoryView("form");
          }} />
          <CategoryGroup title="Pemasukan" rows={incomeCategories} tone="income" onEdit={(category) => {
            setError(null);
            setEditingCategory(category);
            setCategoryView("form");
          }} />
        </div>
      </section>
      )}

      {categoryView === "form" && (
      <form key={editingCategory?.id ?? "new-category"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
        <SectionHeader
          title={editingCategory ? "Edit kategori" : "Kategori baru"}
          caption={editingCategory ? "Ubah nama atau tipe kategori transaksi." : "Buat kategori yang mudah dipilih oleh AI dan form manual."}
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              onClick={() => {
                setEditingCategory(null);
                setError(null);
                setCategoryView("list");
              }}
            >
              <ArrowLeft size={14} /> Kembali
            </button>
          )}
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
      )}
    </div>
  );
}

function CategoryGroup({ title, rows, tone, onEdit }: { title: string; rows: Category[]; tone: "income" | "expense"; onEdit?: (category: Category) => void }) {
  const toneClass = tone === "income" ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-600";
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500">{title}</p>
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
                  <p className="truncate text-sm font-semibold text-slate-950">{category.name}</p>
                  <p className="text-[11px] font-semibold text-slate-500">{category.isDefault ? "Default" : "Custom"}</p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
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
  const [budgetView, setBudgetView] = useState<"list" | "form">("list");
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
      setBudgetView("list");
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
    <div className="space-y-3">
      {budgetView === "list" && (
      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <SectionHeader
          title="Budget bulan ini"
          caption={budgets.length > 0 ? `${budgets.length} kategori dipantau - ${totalPercent}% terpakai` : "Belum ada batas pengeluaran"}
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#00b817]"
              onClick={() => {
                setError(null);
                setEditingBudget(null);
                setBudgetView("form");
              }}
            >
              <Plus size={14} /> Tambah
            </button>
          )}
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
                      <p className="truncate text-sm font-semibold text-slate-950">{budget.category}</p>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">Sisa {rupiah(budget.remaining)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${budgetTone(budget.status)}`}>
                      {budget.status}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p className="text-base font-semibold text-slate-950">{rupiah(budget.used)}</p>
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
                      className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-emerald-50 hover:text-[#00b817]"
                      onClick={() => {
                        setError(null);
                        setEditingBudget(budget);
                        setBudgetView("form");
                      }}
                    >
                      <Settings size={12} /> Edit
                    </button>
                    <p className="text-[11px] font-semibold text-slate-400">{percent}%</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {budgetView === "form" && (
      <form key={editingBudget?.id ?? "new-budget"} className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submit}>
        <SectionHeader
          title={editingBudget ? "Edit budget" : "Atur budget"}
          caption={editingBudget ? "Sesuaikan kategori, periode, atau batas nominal." : "Pilih kategori pengeluaran, periode, lalu isi batas nominal."}
          action={(
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
              onClick={() => {
                setEditingBudget(null);
                setError(null);
                setBudgetView("list");
              }}
            >
              <ArrowLeft size={14} /> Kembali
            </button>
          )}
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
            <input className="input" name="budgetAmount" inputMode="numeric" placeholder="Contoh: 1000000" defaultValue={moneyInputValue(editingBudget?.budgetAmount)} onInput={handleMoneyInput} required />
          </Field>
          <button className="btn-primary w-full" disabled={expenseCategories.length === 0}><CheckCircle2 size={16} /> {editingBudget ? "Simpan perubahan" : "Simpan budget"}</button>
          {expenseCategories.length === 0 && <p className="text-xs font-semibold text-slate-500">Buat kategori pengeluaran dulu sebelum menambahkan budget.</p>}
          {error && <p className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 lg:rounded-md">{error}</p>}
        </div>
      </form>
      )}
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
            <p className="text-[10px] font-semibold uppercase text-white/60">Insight</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal">Laporan keuangan</h2>
            <p className="mt-1 text-xs font-semibold text-white/70">Ringkasan dari transaksi bulan berjalan dan perbandingan bulanan.</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
            totalNet >= 0 ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-700"
          }`}>
            {totalNet >= 0 ? "Surplus" : "Defisit"}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
            <p className="text-[10px] font-bold text-white/60">Masuk</p>
            <p className="mt-1 truncate text-sm font-semibold">{rupiah(totalIncome)}</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
            <p className="text-[10px] font-bold text-white/60">Keluar</p>
            <p className="mt-1 truncate text-sm font-semibold">{rupiah(totalExpense)}</p>
          </div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md">
            <p className="text-[10px] font-bold text-white/60">Net</p>
            <p className="mt-1 truncate text-sm font-semibold">{totalNet >= 0 ? "+" : "-"}{rupiah(Math.abs(totalNet))}</p>
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
              <h3 className="text-sm font-semibold text-slate-950">Arus kas</h3>
              <p className="text-xs font-semibold text-slate-500">{cashFlow.length} hari tercatat</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-[#00b817]">Harian</span>
          </div>
          <CashFlowInsightList rows={cashFlow} />
        </section>

        <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Kategori</h3>
              <p className="text-xs font-semibold text-slate-500">Pengeluaran terbesar</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">{expenseCategories.length} kategori</span>
          </div>
          <CategoryInsightList rows={expenseCategories} />
        </section>
      </div>

      <section className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Antarbulan</h3>
            <p className="text-xs font-semibold text-slate-500">Masuk, keluar, dan net per bulan</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">{months.length} bulan</span>
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
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">{value}</p>
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
                <p className="text-xs font-semibold text-slate-950">{localDate(row.date)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Net {net >= 0 ? "+" : "-"}{rupiah(Math.abs(net))}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[11px] font-semibold text-[#00b817]">{rupiah(row.income)}</p>
                <p className="text-[11px] font-semibold text-rose-500">{rupiah(row.expense)}</p>
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
                <span className="truncate text-xs font-semibold text-slate-950">{row.category ?? "Tanpa kategori"}</span>
                <span className="shrink-0 text-[10px] font-bold text-slate-400">{row.count}x</span>
              </div>
              <span className="shrink-0 text-xs font-semibold text-slate-900">{rupiah(row.total)}</span>
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
                <p className="text-xs font-semibold text-slate-950">{monthYearLabel(row.month)}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">Ringkasan bulanan</p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                net >= 0 ? "bg-emerald-50 text-[#00b817]" : "bg-rose-50 text-rose-600"
              }`}>
                {net >= 0 ? "Surplus" : "Defisit"}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-emerald-50 px-2.5 py-2 lg:rounded-md">
                <p className="text-[10px] font-semibold uppercase text-[#008f12]">Masuk</p>
                <p className="mt-1 truncate text-xs font-semibold text-[#00b817]">{rupiah(income)}</p>
              </div>
              <div className="rounded-2xl bg-rose-50 px-2.5 py-2 lg:rounded-md">
                <p className="text-[10px] font-semibold uppercase text-rose-600">Keluar</p>
                <p className="mt-1 truncate text-xs font-semibold text-rose-600">{rupiah(expense)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-2.5 py-2 lg:rounded-md">
                <p className="text-[10px] font-semibold uppercase text-slate-500">Net</p>
                <p className={`mt-1 truncate text-xs font-semibold ${net >= 0 ? "text-[#00b817]" : "text-rose-600"}`}>
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
            <h2 className="text-base font-semibold leading-tight">Virtual Assistant</h2>
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
                          className="rounded-full border border-emerald-100 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#00b817] shadow-sm transition hover:bg-emerald-50 disabled:opacity-50"
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
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-2xl bg-[#00b817] px-4 text-sm font-semibold text-white shadow-[0_10px_22px_rgba(0,184,23,0.22)] transition hover:bg-[#009714] disabled:cursor-not-allowed disabled:opacity-60 lg:rounded-md"
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
  onProfileUpdated,
  onInstall,
  showInstall,
  onLogout
}: {
  session: Session;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  onProfileUpdated: (user: Session["user"]) => void;
  onInstall: () => Promise<void>;
  showInstall: boolean;
  onLogout?: () => void;
}) {
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(session.user.avatarUrl ?? "");

  useEffect(() => {
    request<Session["user"]>("/auth/profile")
      .then((user) => {
        onProfileUpdated(user);
        setAvatarUrl(user.avatarUrl ?? "");
      })
      .catch(() => undefined);
  }, []);

  const chooseAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setProfileMessage("Foto profil harus berupa gambar.");
      return;
    }
    let avatarBlob: Blob = file;
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      avatarBlob = Array.isArray(converted) ? converted[0] : converted;
    }
    const source = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Foto gagal dibaca"));
      reader.readAsDataURL(avatarBlob);
    });
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image();
      nextImage.onload = () => resolve(nextImage);
      nextImage.onerror = () => reject(new Error("Foto tidak valid"));
      nextImage.src = source;
    });
    const size = Math.min(512, Math.max(image.width, image.height));
    const scale = size / Math.max(image.width, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    setAvatarUrl(canvas.toDataURL("image/jpeg", 0.85));
    setProfileMessage(null);
    event.target.value = "";
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileMessage(null);
    const form = new FormData(event.currentTarget);
    try {
      const user = await request<Session["user"]>("/auth/profile", {
        method: "PUT",
        body: JSON.stringify({
          fullName: String(form.get("fullName")),
          nickname: String(form.get("nickname") || "") || null,
          title: String(form.get("title") || "") || null,
          avatarUrl: avatarUrl || null
        })
      });
      onProfileUpdated(user);
      setProfileMessage("Profil berhasil diperbarui.");
    } catch (err) {
      setProfileMessage(err instanceof Error ? err.message : "Profil gagal diperbarui");
    }
  };

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
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
      setPasswordMessage("Password berhasil diubah.");
      formElement.reset();
    } catch (err) {
      setPasswordMessage(err instanceof Error ? err.message : "Password gagal diubah");
    }
  };
  return (
    <div className="mx-auto grid max-w-5xl gap-3 xl:grid-cols-[0.85fr_1.15fr]">
      <section className="rounded-[26px] bg-[#003d12] p-4 text-white shadow-[0_18px_42px_rgba(0,184,23,0.18)] lg:rounded-lg lg:p-5">
        <div className="flex items-start gap-3">
          {avatarUrl ? (
            <img className="h-14 w-14 shrink-0 rounded-2xl object-cover ring-2 ring-white/20 lg:rounded-lg" src={avatarUrl} alt="Foto profil" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-semibold lg:rounded-lg">{session.user.fullName.slice(0, 1).toUpperCase()}</span>
          )}
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase text-white/60">Profil</p>
            <h2 className="mt-1 truncate text-xl font-semibold">{session.user.nickname || session.user.fullName}</h2>
            {session.user.title && <p className="truncate text-xs text-emerald-100">{session.user.title}</p>}
            <p className="mt-0.5 truncate text-xs font-semibold text-white/70">{session.user.email}</p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md"><dt className="font-bold text-white/60">Mata uang</dt><dd className="mt-1 font-semibold">IDR</dd></div>
          <div className="rounded-2xl bg-white/12 px-3 py-2 lg:rounded-md"><dt className="font-bold text-white/60">Akun</dt><dd className="mt-1 font-semibold">Aktif</dd></div>
        </dl>
        {showInstall && (
          <button
            type="button"
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-white/15 lg:rounded-md"
            onClick={onInstall}
          >
            <Download size={15} /> Pasang aplikasi
          </button>
        )}
        {onLogout && (
          <button
            type="button"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-[#003d12] transition hover:bg-emerald-50 lg:hidden"
            onClick={onLogout}
          >
            <LogOut size={16} /> Logout
          </button>
        )}
      </section>
      <div className="space-y-3">
        <form className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={saveProfile}>
          <SectionHeader title="Edit profil" caption="Atur identitas yang tampil di aplikasi." />
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 lg:rounded-md">
              {avatarUrl ? <img className="h-12 w-12 rounded-xl object-cover" src={avatarUrl} alt="" /> : <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-400"><UserRound size={20} /></span>}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-700">Foto profil</p>
                <p className="text-[11px] text-slate-500">Gambar akan dirapikan otomatis.</p>
              </div>
              <label className="cursor-pointer rounded-xl bg-white px-3 py-2 text-xs font-semibold text-[#00b817] shadow-sm">
                Pilih
                <input className="sr-only" type="file" accept="image/*,.heic,.heif" onChange={chooseAvatar} />
              </label>
            </div>
            <Field label="Nama lengkap"><input className="input" name="fullName" defaultValue={session.user.fullName} required minLength={2} /></Field>
            <Field label="Nickname"><input className="input" name="nickname" defaultValue={session.user.nickname ?? ""} placeholder="Nama panggilan" /></Field>
            <Field label="Title"><input className="input" name="title" defaultValue={session.user.title ?? ""} placeholder="Contoh: Student, Freelancer" /></Field>
            <button className="btn-primary w-full"><CheckCircle2 size={16} /> Simpan profil</button>
            {profileMessage && <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600 lg:rounded-md">{profileMessage}</p>}
          </div>
        </form>

        <form className="rounded-[26px] border border-white/80 bg-white p-4 shadow-soft lg:rounded-lg lg:border-slate-200" onSubmit={submitPassword}>
          <SectionHeader title="Keamanan akun" caption="Ubah password secara berkala agar akun tetap aman." />
          <div className="space-y-3">
            <Field label="Password saat ini"><input className="input" name="currentPassword" type="password" placeholder="Masukkan password lama" required /></Field>
            <Field label="Password baru"><input className="input" name="newPassword" type="password" placeholder="Minimal 8 karakter" minLength={8} required /></Field>
            <button className="btn-secondary w-full"><CheckCircle2 size={16} /> Simpan password</button>
            {passwordMessage && <p className="rounded-2xl bg-slate-50 px-3 py-2 text-sm text-slate-600 lg:rounded-md">{passwordMessage}</p>}
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: JSX.Element }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
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
              <p className="truncate text-sm font-semibold text-slate-950">{transactionTitle(row)}</p>
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              {row.accountName}{row.paymentMethod ? ` - ${row.paymentMethod}` : ""}
            </p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-1">
            <p className={`text-sm font-semibold ${isIncome ? "text-[#00b817]" : "text-slate-950"}`}>
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
            <p className={`font-semibold ${row.transactionType === "income" ? "text-[#00b817]" : "text-slate-950"}`}>
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




