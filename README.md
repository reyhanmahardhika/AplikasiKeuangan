# Aplikasi Keuangan AI

Aplikasi full-stack untuk mencatat pemasukan, pengeluaran, saldo akun, scan struk, anggaran, laporan, dan assistant keuangan berbasis data pengguna yang sedang login.

## Teknologi

- Frontend: React, Vite, Tailwind CSS.
- Backend: Node.js, Express, TypeScript.
- Database: PostgreSQL.
- Auth: JWT access token dan refresh token.
- OCR: Tesseract OCR untuk gambar, ekstraksi teks PDF untuk PDF berbasis teks.
- AI parsing: parser terstruktur berbasis heuristik yang siap diganti provider AI melalui service adapter.
- Export: CSV, XLSX, PDF.

## Struktur Folder

```text
apps/
  client/        React + Tailwind
  server/        Express API
database/
  migrations/    PostgreSQL migration SQL
docker-compose.yml
.env.example
```

## Menjalankan Lokal

1. Install dependency:

```bash
npm install
```

2. Salin environment:

```bash
cp .env.example .env
```

Di Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Jalankan PostgreSQL:

```bash
docker compose up -d
```

4. Jalankan migration dan seed demo:

```bash
npm run db:migrate
npm run db:seed
```

5. Jalankan aplikasi:

```bash
npm run dev
```

Frontend berjalan di `http://localhost:5173`, API di `http://localhost:4000/api`.

Akun demo setelah seed:

```text
Email: demo@keuangan.ai
Password: password123
```

## Endpoint Utama

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh-token`
- `GET /api/dashboard/summary`
- `GET|POST|PUT|DELETE /api/accounts`
- `GET|POST|PUT|DELETE /api/transactions`
- `POST /api/receipts/upload`
- `POST /api/receipts/:id/process`
- `GET /api/receipts/:id/result`
- `POST /api/receipts/:id/confirm`
- `GET|POST /api/categories`
- `GET|POST|PUT /api/budgets`
- `POST /api/transfers`
- `GET /api/reports/cash-flow`
- `GET /api/reports/category-summary`
- `GET /api/reports/monthly-comparison`
- `POST /api/assistant/chat`

## Aturan Bisnis yang Diimplementasikan

- Nominal transaksi wajib lebih besar dari nol.
- Nominal uang disimpan sebagai `NUMERIC(18,2)` di PostgreSQL.
- Pemasukan dan pengeluaran mengubah saldo akun secara otomatis.
- Akun kartu kredit diperlakukan sebagai akun utang.
- Transfer memindahkan saldo dalam database transaction.
- Edit dan hapus transaksi membalik saldo lama terlebih dahulu.
- Setiap query utama difilter berdasarkan `user_id`.
- File struk hanya dapat dibuka lewat endpoint terautentikasi pemilik file.
- Struk tidak langsung disimpan sebagai transaksi sebelum pengguna melakukan konfirmasi.
- Duplikasi struk dicegah dengan hash file per pengguna.

## OCR dan AI

OCR lokal memakai Tesseract untuk JPG/PNG. PDF yang memiliki lapisan teks akan diekstrak langsung. Hasil OCR dibersihkan dan dipetakan menjadi data terstruktur:

- Merchant.
- Tanggal dan jam.
- Nomor struk.
- Subtotal, pajak, diskon, total.
- Metode pembayaran.
- Item belanja.
- Kategori yang disarankan.
- Confidence score dan field yang perlu dicek.

Untuk memakai provider AI eksternal, tambahkan adapter di `apps/server/src/services/receiptParser.ts` atau ganti pemanggilan parser di `receiptService.ts`.

## Pengujian

```bash
npm test
```

Test yang disediakan memverifikasi normalisasi uang dan aturan delta saldo akun biasa/kartu kredit.
