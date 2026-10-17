# ManualMechanic

AI Agent untuk perawatan unit tenaga hidrolik (pompa) di pabrik. Agent membaca sensor, menjalankan model ML, mencari panduan perawatan (RAG), lalu mengambil tindakan nyata: cek stok, buat work order, jadwalkan teknisi, ajukan pembelian, kirim notifikasi. Bila yakin dan risikonya rendah ia bertindak sendiri; bila ragu ia bertanya balik, meminta persetujuan supervisor, atau eskalasi ke teknisi senior.

GTNIC 2026, kategori AI Agent, sub-tema *Building Intelligent AI Agents for Enterprise Productivity*.

## Arsitektur

```
Teknisi / Supervisor ─► React (Vite)  ──►  NestJS API ──┬─► PostgreSQL (Supabase)   work order, kasus, stok, riwayat
                         font Inter        agent + 12 tool ├─► Layanan ML (FastAPI)    Isolation Forest + Random Forest
Sensor (simulator ───────────────────────► monitor ────────┼─► RAG (TF-IDF)            manual bersitasi + riwayat
 memutar siklus UCI)                                       ├─► Gemini (opsional)       function calling
                                                           └─► Telegram (opsional)     notifikasi
```

- `frontend/` React 18 + TypeScript + Vite, font Inter, tanpa library UI.
- `backend/` NestJS 10 + TypeScript. Agent (`src/agent`), tool (`src/tools`), RAG (`src/rag`), simulator (`src/sim`), monitor (`src/monitor`).
- `ml/` Python: pemuat dan pelatih dataset UCI, layanan inferensi FastAPI.
- Database: PostgreSQL + Prisma 7. `DATABASE_URL` wajib diisi; schema dan relasi ada di `backend/prisma/schema.prisma`, perubahan database lewat Prisma Migrate. PGlite hanya digunakan sebagai database terisolasi dalam tes.

## Logika keputusan

| Kondisi | Tindakan agent |
|---|---|
| Sensor mengirim nol sementara sensor lain normal | Tidak menuduh mesin; buat tiket periksa sensor |
| Keyakinan ≥ 80% dan risiko rendah/sedang | Cek stok → work order → (pembelian bila stok kosong) → jadwal teknisi → notifikasi |
| Keyakinan 50–79% | Tanya balik ke teknisi, perbarui hipotesis dari jawaban |
| Keyakinan < 50% atau komponen rusak majemuk | Eskalasi ke teknisi senior |
| Risiko tinggi (komponen mendekati gagal total) | Hanya merekomendasikan; menunggu persetujuan supervisor. Dipaksa di tool `create_work_order`, berlaku juga untuk mode LLM |

Dua jalur masuk menuju kasus yang sama: anomali dari sensor (otomatis) dan laporan teknisi (Asisten). Satu unit hanya punya satu kasus terbuka.

## Menjalankan di Windows (PowerShell)

Prasyarat: Node.js 22.18+ (diuji 24), Python 3.10+, PostgreSQL atau koneksi Supabase.

```powershell
# 1) Layanan ML
cd ml
pip install -r requirements.txt
python train.py --download        # dataset UCI asli (butuh internet, 73 MB). Alternatif cepat: python train.py --demo
python -m uvicorn app:app --port 8100

# 2) Backend (terminal baru)
cd backend
npm install
copy .env.example .env            # isi DATABASE_URL; DIRECT_URL opsional untuk migrasi
npm run db:migrate                # terapkan schema sebelum menjalankan backend
npm run start:dev

# 3) Frontend (terminal baru)
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Atau jalankan ketiganya sekaligus: `.\scripts\dev.ps1`. Dengan Docker: `docker compose up --build` lalu buka http://localhost:8080.

Periksa sumber model melalui `http://localhost:8100/meta`. File model bergantung pada versi scikit-learn; bila layanan ML menjawab "model tidak dapat dimuat", latih ulang dengan `python train.py --download`. `--demo` hanya untuk mencoba data sintetis dan akan menimpa artefak aktif. UI menampilkan peringatan selama model memakai data sintetis.

Untuk mengisi instalasi kosong dengan data presentasi, pastikan layanan ML aktif dan hentikan backend sementara, lalu jalankan `npm run demo:seed` dari folder `backend`. Perintah ini mengisi 4 unit, 7 spare part, 6 teknisi, 4 riwayat perawatan, serta pembacaan sensor dari bank profil model. Kasus dan work order dihasilkan oleh diagnosis ML/policy yang sebenarnya; status dan jumlah tindakan mengikuti hasil prediksi, bukan dipaksakan. Akun pengguna tidak diubah dan notifikasi eksternal tidak dikirim selama seed. Menjalankan ulang tidak menggandakan data master atau diagnosis untuk unit yang sudah memiliki kasus berhasil.

Untuk presentasi yang terus bergerak, isi `SIM_ENABLED=true`, `AUTO_AGENT=true`, dan `DEMO_SCENARIO=true` di `backend/.env`, lalu jalankan ulang backend. Pump-01 tetap normal, Pump-02 mengalami penurunan pendingin bertahap, dan Pump-03 mengalami kebocoran pompa berat; prediksi dapat mencerminkan beberapa gangguan dalam satu siklus UCI. Flag skenario hanya memulai simulasi gangguan dan tidak menyetujui kasus berisiko tinggi. Tetap gunakan `SEED_DEMO_DATA=false` setelah pengisian awal. Kembalikan `DEMO_SCENARIO=false` untuk startup tanpa skenario otomatis; kontrol simulator juga tersedia di dashboard.

### Docker (empat layanan)

```powershell
Set-Location C:\GTNIC-
docker compose up --build -d
docker compose ps
docker compose logs -f backend ml
# Berhenti tanpa menghapus data PostgreSQL:
docker compose down
```

Buka `http://localhost:8080`. Frontend meneruskan `/api` ke backend melalui Nginx, sehingga akses dari perangkat lain memakai alamat host yang sama tanpa URL API `localhost` dalam bundle. Startup backend menunggu database dan model ML siap. `/health` ML memuat dan mencoba model; file yang ada tetapi rusak tetap menghasilkan HTTP 503.

Build ML memeriksa kompatibilitas artefak dengan dependency dalam image. Jika tidak kompatibel atau hilang, build melatih ulang dari UCI asli (butuh internet). Model dan profil simulator dibagikan lewat volume `ml_profiles` agar backend memakai hasil training yang sama. Gunakan `docker compose up --build --force-recreate` setelah mengganti artefak, agar seluruh layanan memuat ulang data. Dockerfile root menjalankan implementasi Python terpisah di `app/`; gunakan Compose untuk React + NestJS + ML.

### Navigasi dan status data

URL `/units/Pump-02`, `/cases/<id>`, `/work-orders`, `/inventory`, dan `/assistant` dapat dibuka langsung. Vite dan Nginx menyediakan fallback SPA. Dashboard menampilkan antrean tindakan, filter, waktu pembaruan, serta peringatan bila data lama sedang ditampilkan. Kontrol simulasi berada dalam panel Mode demo. Daftar kasus dan work order mencakup maksimal 40/60 data terbaru; filter berlaku pada daftar tersebut.

### Login opsional

Login aktif secara default. Jalankan `.\scripts\hash-password.ps1` dua kali dari root (kata sandi berbeda untuk setiap akun), lalu isi username dan hash di `backend/.env` sesuai `backend/.env.example`. Untuk Compose, letakkan variabel tersebut di `.env` root; Compose meneruskannya ke backend. `AUTH_ENABLED=false` hanya untuk demo lokal. Jangan commit kata sandi atau hash.

Alternatif setup lokal: dari folder `backend`, jalankan `npm run auth:setup`. Perintah ini mempertahankan konfigurasi database/API yang sudah ada, membuat JWT_SECRET serta kata sandi acak jika belum tersedia, dan mengaktifkan login. Kredensial awal disimpan di `.auth-bootstrap.json` yang diabaikan Git dan Docker; jangan dibagikan atau ditaruh di frontend. Restart backend untuk memasukkan hash akun ke PostgreSQL. Setelah mencatat kredensial dengan aman, file tersebut dapat dihapus. Perintah ini tidak merotasi hash atau secret yang sudah terisi.

Saat login aktif, access JWT (15 menit) dan refresh token acak (7 hari) dikirim dalam cookie HttpOnly. Refresh token disimpan sebagai hash di PostgreSQL, dirotasi secara atomik, dan pemakaian ulang token lama mencabut sesi terkait. Logout langsung mencabut sesi; restart backend tidak menghapus login. Peran dan status aktif pengguna selalu dibaca dari database, sehingga header `x-role` tidak memberi hak supervisor. Frontend memperbarui token otomatis dan mengoordinasikan refresh lintas tab dengan Web Locks bila tersedia.

Isi `JWT_SECRET` dengan nilai acak minimal 32 karakter (contoh: hasil `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`). Jangan mengganti secret pada setiap startup. Bootstrap username/hash hanya membuat akun saat tabel `app_users` masih kosong. Setelah itu database menjadi sumber utama; perubahan `.env` tidak menimpa akun yang sudah ada. `FRONTEND_ORIGIN` harus eksplisit. Gunakan `SESSION_COOKIE_SECURE=true` pada HTTPS dan sajikan frontend/API pada origin yang sama. Mode demo (`AUTH_ENABLED=false`) tetap hanya untuk demo lokal; halaman `/profile` tersedia untuk akun yang login: edit nama/email/username, role hanya-baca, ubah password (minimal 12 karakter), hapus akun dengan konfirmasi password, serta Logout merah. Perubahan password mencabut seluruh sesi. Supervisor aktif terakhir tidak dapat dihapus. Email dinormalisasi lowercase dan diberi indeks unik; nama/email akun lama tetap NULL sampai diisi.

Folder PGlite lama `backend/.pgdata` tidak digunakan atau dihapus oleh migrasi ini. Data lama di sana tidak otomatis dipindahkan ke PostgreSQL.

### Integritas dan migrasi database

`npm run db:migrate` menjalankan Prisma Migrate menggunakan `DIRECT_URL` bila diisi, selain itu memakai `DATABASE_URL`. Supabase Session pooler port 5432 dapat dipakai; jangan memakai transaction pooler untuk migrasi. Pada database kosong, cukup jalankan perintah tersebut. Jika database sudah memiliki schema GTNIC lama dan belum memiliki riwayat Prisma, verifikasi kesesuaiannya lalu jalankan `npx prisma migrate resolve --applied 20261017000100_baseline` sebelum deploy migration berikutnya. Jangan menandai baseline pada schema yang belum sesuai.

Migrasi menambah foreign key, check constraint, indeks foreign key dan riwayat, serta unique index parsial untuk kasus terbuka, WO aktif, penugasan teknisi, dan pembelian tertunda. Data duplikat atau referensi yatim lama menyebabkan migration gagal dan perlu ditinjau, bukan dihapus otomatis. `SEED_DEMO_DATA=true` mengisi contoh unit/teknisi hanya jika tabel unit kosong.

Mutasi utama memakai Prisma model API dan interactive transaction. Query baca/analitik lama tetap memakai SQL berparameter melalui Prisma; aplikasi tidak lagi membuat `pg.Pool` sendiri. Penutupan WO, pelepasan teknisi, riwayat, dan status kasus berada dalam satu transaksi. Approval mengunci kasus; pembuatan WO/pembelian dan penugasan dapat diulang tanpa menghasilkan tindakan ganda. Telegram memakai outbox persisten setelah commit dengan maksimal tiga percobaan; pengiriman eksternal bersifat at-least-once, sehingga timeout/crash dapat menyebabkan notifikasi terkirim ulang.

## Konfigurasi (`backend/.env`)

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Wajib: koneksi PostgreSQL runtime |
| `DIRECT_URL` | Opsional: koneksi khusus Prisma Migrate; fallback ke DATABASE_URL |
| `SEED_DEMO_DATA` | true untuk mengisi data demo pada database kosong |
| `JWT_SECRET` | Secret acak minimal 32 karakter untuk access JWT |
| `ML_URL`, `ML_API_KEY` | Alamat dan kunci layanan ML |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Mengaktifkan mode LLM (function calling). Kosong = mode policy |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Notifikasi sungguhan. Kosong = pesan hanya dicatat |
| `FRONTEND_ORIGIN` | Origin yang diizinkan CORS |
| `TICK_SECONDS`, `AUTO_AGENT`, `SIM_ENABLED` | Kecepatan simulator, pemicu agent otomatis, simulator |

Frontend: `VITE_API_URL` (default `/api`, melalui proxy Vite/Nginx).

## Demo cepat
1. Buka tab Ringkasan, klik **Mulai skenario demo**.
2. Pump-02 (pendingin menurun bertahap) ditangani agent otomatis; Pump-03 (kebocoran pompa berat) menunggu persetujuan. Lihat tab Kasus.
3. Ganti peran ke Supervisor, setujui. Selesaikan work order di tab Work order: hasilnya masuk riwayat dan indeks RAG.
Skrip rekaman lengkap: `docs/DEMO_SCRIPT.md`.

## Tes

```powershell
Set-Location C:\GTNIC-\ml
python -m pytest -q                      # 5 tes ML, termasuk model hilang/rusak
Set-Location C:\GTNIC-\backend
npm.cmd test                            # tes Prisma, JWT, rollback, idempotensi, dan agent; ML wajib aktif
Set-Location C:\GTNIC-\frontend
npm.cmd test                            # tes regresi polling, URL, form, dan refresh token
```
Tes backend menjalankan Prisma melalui protokol PostgreSQL ke PGlite terisolasi; DATABASE_URL asli tidak dipakai oleh tes. Pool tes dibatasi satu koneksi karena PGlite memiliki satu engine koneksi. Tes ini memverifikasi rollback dan idempotensi, tetapi bukan pengganti uji beban multi-koneksi pada PostgreSQL produksi. Jalur agent, RAG, dan loop Gemini mock tetap diuji.

## Batasan yang jujur
- Dataset UCI adalah satu test rig hidrolik; angka evaluasi tidak menjamin performa di pabrik lain. Lihat `docs/DATASET.md`.
- Urutan "memburuk bertahap" pada simulator dirangkai dari siklus nyata per tingkat kerusakan, bukan rekaman degradasi.
- Mode demo memakai pemilih peran; login sesi server tersedia lewat `AUTH_ENABLED=true`. Akun masih dikonfigurasi lewat environment, dan belum ada deteksi bentrok jadwal berbasis slot.
- Notifikasi Telegram disimulasikan sampai token diisi. Mode LLM butuh `GEMINI_API_KEY`; hasilnya bervariasi antar model dan hanya diuji dengan respons mock di tes otomatis.
- Panduan perawatan di `backend/knowledge` ditulis sendiri sebagai pengetahuan teknik umum; ambang dan prosedur harus disesuaikan dengan manual pabrikan dan K3 perusahaan.

## Dokumen
`docs/DEPLOY.md` (Supabase, Render, Vercel) · `docs/DATASET.md` · `docs/GUIDEBOOK_CHECKLIST.md` · `docs/DEMO_SCRIPT.md` · `docs/Surat_Pernyataan_Keaslian_Karya_TEMPLATE.md`

Dataset: Helwig, N., Pignanelli, E., & Schütze, A. (2015). Condition monitoring of hydraulic systems. UCI Machine Learning Repository. https://doi.org/10.24432/C5CW21 (CC BY 4.0).
