# Deploy (UI publik + backend + database)

Guide Book mensyaratkan UI yang dapat diakses publik, repo GitHub publik, dan video demo 3–5 menit. Susunan yang disarankan, semuanya punya tier gratis:

| Bagian | Layanan | Catatan |
|---|---|---|
| Database | Supabase (PostgreSQL) | Backend terhubung langsung lewat connection string |
| Layanan ML | Render (Web Service, Docker) | Folder `ml` |
| Backend NestJS | Render (Web Service, Node) | Folder `backend` |
| Frontend React | Vercel atau Render Static Site | Folder `frontend` |

Tier gratis Render tidur setelah beberapa menit tanpa trafik; akses sekali sebelum demo agar terbangun. Backend menjalankan simulator di dalam proses, jadi bila tidur, simulasi ikut berhenti.

## 1. Supabase
1. Buat project di https://supabase.com.
2. Buka Project Settings > Database > Connection string, pilih **Session pooler** (port 5432), salin URL, ganti `[YOUR-PASSWORD]`. Pooler dipakai karena koneksi langsung Supabase hanya IPv6, sedangkan banyak host hanya IPv4.
3. Tidak perlu membuat tabel manual: backend menjalankan `backend/schema.sql` otomatis saat start (idempoten). Salinan ada di `supabase/schema.sql` jika ingin menempel di SQL Editor.
4. Skema mengaktifkan Row Level Security tanpa kebijakan, sehingga tabel tidak terbuka lewat API publik Supabase. Backend memakai peran owner dari connection string dan tidak terpengaruh.

## 2. Layanan ML (Render)
1. New > Web Service, pilih repo, Root Directory `ml`, Runtime Docker.
2. Environment: `ML_API_KEY` = string acak panjang (opsional tetapi disarankan).
3. Pastikan `ml/artifacts/model.joblib` ikut di repo (hasil `python train.py --download`). Jika file melebihi 100 MB, kurangi `n_estimators` di `train.py`.
4. Catat URL, misalnya `https://mm-ml.onrender.com`.

## 3. Backend (Render)
1. New > Web Service, Root Directory `backend`, Build `npm install && npm run build`, Start `npm run start`.
2. Environment:
   - `DATABASE_URL` = connection string Supabase
   - `ML_URL` = URL layanan ML, `ML_API_KEY` = sama dengan di atas
   - `FRONTEND_ORIGIN` = URL frontend (tanpa garis miring akhir). Beberapa origin dipisah koma.
   - `GEMINI_API_KEY` (opsional, mengaktifkan mode LLM), `GEMINI_MODEL`
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (opsional)
3. Cek `https://<backend>/api/health` dan `/api/overview`.

## 4. Frontend (Vercel)
1. Import repo, Root Directory `frontend`, Framework Vite.
2. Environment: `VITE_API_URL` = `https://<backend>/api`.
3. Deploy, lalu masukkan URL ke tabel tautan di proposal.

## 5. Keamanan sebelum repo dipublikasikan
- Jangan commit `.env`. Semua `.env` sudah ada di `.gitignore`.
- Jika API key pernah tertulis di berkas yang ter-commit, anggap bocor: cabut dan buat baru.
- Peran Teknisi/Supervisor pada UI adalah pemisah hak untuk demo (header `x-role`), bukan autentikasi. Jangan menyebutnya autentikasi di proposal; sebut sebagai pemisahan hak persetujuan tingkat prototipe.

## Menjalankan dengan Docker
`docker compose up --build` menjalankan ML (8100), backend (8000), dan frontend (8080) dengan PostgreSQL lokal. Isi `GEMINI_API_KEY` di shell bila ingin mode LLM.
