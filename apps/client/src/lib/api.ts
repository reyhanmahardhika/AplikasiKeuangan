const configuredApiUrl = String(import.meta.env.VITE_API_URL ?? "http://localhost:4000/api").trim().replace(/\/+$/, "");
const API_URL = configuredApiUrl.endsWith("/api") ? configuredApiUrl : `${configuredApiUrl}/api`;

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

export type Session = {
  user: {
    id: string;
    fullName: string;
    email: string;
    currency?: string;
    nickname?: string | null;
    title?: string | null;
    avatarUrl?: string | null;
  };
  accessToken: string;
  refreshToken: string;
};

export async function apiFetch<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Koneksi gagal" }));
    throw new ApiError(response.status, error.message ?? "Request gagal", error.details);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function downloadUrl(path: string) {
  return `${API_URL}${path}`;
}
