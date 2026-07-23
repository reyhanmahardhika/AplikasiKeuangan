import { badRequest } from "./errors.js";

function normalizeMoneyInput(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    value = value.toString();
  }

  if (typeof value !== "string") {
    throw badRequest("Nominal harus berupa angka");
  }

  const cleaned = value
    .trim()
    .replace(/\s+/g, "")
    .replace(/^(rp|idr)/i, "")
    .replace(/(rp|idr)$/i, "");

  if (!/^\d+(?:[.,]\d+)*$/.test(cleaned)) {
    throw badRequest("Format nominal tidak valid");
  }

  const lastDot = cleaned.lastIndexOf(".");
  const lastComma = cleaned.lastIndexOf(",");

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparator = lastDot > lastComma ? "." : ",";
    const decimalIndex = Math.max(lastDot, lastComma);
    const whole = cleaned.slice(0, decimalIndex).replace(/[.,]/g, "");
    const fractional = cleaned.slice(decimalIndex + 1);
    return `${whole}.${fractional}`;
  }

  const separator = lastDot >= 0 ? "." : lastComma >= 0 ? "," : null;
  if (!separator) return cleaned;

  const parts = cleaned.split(separator);
  const fractional = parts.at(-1) ?? "";
  const isThousandsGrouped = parts.length > 1 && parts.slice(1).every((part) => part.length === 3);

  if (parts.length > 2 || (fractional.length === 3 && isThousandsGrouped)) {
    return parts.join("");
  }

  return `${parts[0]}.${fractional}`;
}

export function isValidPositiveMoney(value: unknown) {
  try {
    return toCents(normalizeMoneyInput(value)) > 0n;
  } catch {
    return false;
  }
}

export function normalizeMoney(value: unknown): string {
  const cleaned = normalizeMoneyInput(value);
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw badRequest("Format nominal tidak valid");
  }

  const cents = toCents(cleaned);
  if (cents <= 0n) {
    throw badRequest("Nominal wajib lebih besar dari nol");
  }

  return fromCents(cents);
}

export function normalizeNonNegativeMoney(value: unknown): string {
  const cleaned = normalizeMoneyInput(value);
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw badRequest("Format nominal tidak valid");
  }

  return fromCents(toCents(cleaned));
}

export function toCents(value: string | number): bigint {
  const raw = String(value).trim();
  const negative = raw.startsWith("-");
  const normalized = negative ? raw.slice(1) : raw;
  const [whole, fractional = ""] = normalized.split(".");
  const cents = BigInt(whole || "0") * 100n + BigInt((fractional + "00").slice(0, 2));
  return negative ? -cents : cents;
}

export function fromCents(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 100n;
  const cents = absolute % 100n;
  return `${negative ? "-" : ""}${whole}.${cents.toString().padStart(2, "0")}`;
}

export function negate(value: string) {
  return value.startsWith("-") ? value.slice(1) : `-${value}`;
}

export function isNegative(value: string | number) {
  return toCents(value) < 0n;
}

export function formatRupiah(value: string | number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(Number(value));
}
