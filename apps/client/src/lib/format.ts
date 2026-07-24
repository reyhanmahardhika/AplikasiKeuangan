export function rupiah(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(number);
}

export function localDate(value: string | Date | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(value));
}

export function isoDateInput(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function formatRupiahInput(value: string | number | null | undefined) {
  const raw = String(value ?? "").replace(/[^\d]/g, "");
  if (!raw) return "";
  return new Intl.NumberFormat("id-ID").format(Number(raw));
}
