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
- Database: PostgreSQL. Dengan `DATABASE_URL` kosong backend memakai PGlite (Postgres WASM, tanpa instalasi); dengan URL Supabase memakai Postgres sungguhan. SQL-nya sama (`backend/schema.sql`).

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

Prasyarat: Node.js 20+ (diuji 22), Python 3.10+.

```powershell
# 1) Layanan ML
cd ml
pip install -r requirements.txt
python train.py --download        # dataset UCI asli (butuh internet, 73 MB). Alternatif cepat: python train.py --demo
python -m uvicorn app:app --port 8100

# 2) Backend (terminal baru)
cd backend
npm install
copy .env.example .env            # isi bila perlu; semua opsional untuk lokal
npm run start:dev

# 3) Frontend (terminal baru)
cd frontend
npm install
npm run dev                       # http://localhost:5173
```

Atau jalankan ketiganya sekaligus: `.\scripts\dev.ps1`. Dengan Docker: `docker compose up --build` lalu buka http://localhost:8080.

Repo ini menyertakan model hasil `--demo`, tetapi file model bergantung pada versi scikit-learn; bila layanan ML menjawab "model tidak dapat dimuat", jalankan `python train.py --demo` (atau `--download`) di mesin Anda. UI menampilkan peringatan kuning selama model belum dilatih dari dataset asli. **Latih ulang dengan `--download` sebelum mengambil angka evaluasi atau merekam demo.**

Data lokal PGlite tersimpan di `backend/.pgdata`; hapus folder itu untuk mengosongkan database.

## Konfigurasi (`backend/.env`)

| Variabel | Fungsi |
|---|---|
| `DATABASE_URL` | Connection string Supabase (Session pooler). Kosong = PGlite lokal |
| `ML_URL`, `ML_API_KEY` | Alamat dan kunci layanan ML |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Mengaktifkan mode LLM (function calling). Kosong = mode policy |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Notifikasi sungguhan. Kosong = pesan hanya dicatat |
| `FRONTEND_ORIGIN` | Origin yang diizinkan CORS |
| `TICK_SECONDS`, `AUTO_AGENT`, `SIM_ENABLED` | Kecepatan simulator, pemicu agent otomatis, simulator |

Frontend: `VITE_API_URL` (default `http://localhost:8000/api`).

## Demo cepat
1. Buka tab Ringkasan, klik **Mulai skenario demo**.
2. Pump-02 (pendingin menurun bertahap) ditangani agent otomatis; Pump-03 (kebocoran pompa berat) menunggu persetujuan. Lihat tab Kasus.
3. Ganti peran ke Supervisor, setujui. Selesaikan work order di tab Work order: hasilnya masuk riwayat dan indeks RAG.
Skrip rekaman lengkap: `docs/DEMO_SCRIPT.md`.

## Tes

```powershell
cd ml;      python -m pytest -q          # 4 tes: pemuat UCI, pelatihan, API inferensi
cd backend; npm test                     # 10 tes end-to-end (butuh layanan ML aktif di ML_URL)
```
Tes backend mencakup jalur otomatis, tanya balik, eskalasi, persetujuan dan penolakan peran, guardrail risiko tinggi, sensor mati, pencegahan kasus ganda, RAG bersitasi, dan loop function calling (Gemini di-mock). Telah dijalankan pada PGlite dan PostgreSQL 16 sungguhan.

## Batasan yang jujur
- Dataset UCI adalah satu test rig hidrolik; angka evaluasi tidak menjamin performa di pabrik lain. Lihat `docs/DATASET.md`.
- Urutan "memburuk bertahap" pada simulator dirangkai dari siklus nyata per tingkat kerusakan, bukan rekaman degradasi.
- Peran Teknisi/Supervisor adalah pemisah hak untuk demo, bukan autentikasi. Belum ada login, izin per pengguna, atau deteksi bentrok jadwal berbasis slot.
- Notifikasi Telegram disimulasikan sampai token diisi. Mode LLM butuh `GEMINI_API_KEY`; hasilnya bervariasi antar model dan hanya diuji dengan respons mock di tes otomatis.
- Panduan perawatan di `backend/knowledge` ditulis sendiri sebagai pengetahuan teknik umum; ambang dan prosedur harus disesuaikan dengan manual pabrikan dan K3 perusahaan.

## Dokumen
`docs/DEPLOY.md` (Supabase, Render, Vercel) · `docs/DATASET.md` · `docs/GUIDEBOOK_CHECKLIST.md` · `docs/DEMO_SCRIPT.md` · `docs/Surat_Pernyataan_Keaslian_Karya_TEMPLATE.md`

Dataset: Helwig, N., Pignanelli, E., & Schütze, A. (2015). Condition monitoring of hydraulic systems. UCI Machine Learning Repository. https://doi.org/10.24432/C5CW21 (CC BY 4.0).
