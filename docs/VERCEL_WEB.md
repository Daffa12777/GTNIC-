# Deployment web dan koneksi layanan ML

> Catatan lingkungan deployment saat verifikasi historis yang disebut di dokumen. URL, konfigurasi provider, dan status layanan tidak diperiksa ulang saat dokumentasi baru disusun. Untuk arsitektur serta setup checkout terbaru lihat [dokumentasi teknis](TECHNICAL.md#deployment); jangan menganggap perubahan lokal sudah ada di production sebelum deploy dan smoke test.

- Frontend: https://manualmechanic-gtnic.vercel.app
- API: https://manualmechanic-api.vercel.app/api
- ML eksternal: https://manualmechanic-ml.vercel.app (`ML_URL` pada backend)
- Database: PostgreSQL Supabase yang sudah ada.
- Kedua project memakai akun Vercel Hobby. Tidak membuat resource Azure atau Render.

Frontend mem-proxy `/api/*` ke API sehingga cookie tetap pada origin frontend.
Environment production API berisi `DATABASE_URL`, `JWT_SECRET`, `AUTH_ENABLED=true`,
`SESSION_COOKIE_SECURE=true`, dan `FRONTEND_ORIGIN=https://manualmechanic-gtnic.vercel.app`.
Secret dikelola di Vercel dan tidak disimpan dalam repo atau bundle frontend.

Simulator, agent otomatis, skenario, dan seeding dinonaktifkan lewat konfigurasi
deployment. Backend mengakses layanan ML eksternal melalui `ML_URL`;
redeploy web tidak melakukan training atau deployment layanan ML tersebut.
Model yang dilaporkan endpoint saat integrasi 30 Oktober 2026 adalah
`demo_synthetic`, sehingga bukan model yang dilatih dari dataset UCI asli.
Gemini belum dikonfigurasi. Data operasional tetap berasal dari database;
simulator dan agent otomatis tidak diaktifkan oleh penambahan URL ML.

## Update dari PowerShell

Deployment saat ini menggunakan Vercel CLI dari checkout branch `farras`.
Push GitHub saja belum memicu deployment otomatis karena integrasi repo belum terhubung.
Jalankan dari root repo setelah commit perubahan:

```powershell
Set-Location backend
npm.cmd ci
npm.cmd run build:vercel
npx.cmd --yes vercel@64.5.0 deploy --prod --yes
Set-Location ../frontend
npm.cmd ci
npm.cmd run build
npx.cmd --yes vercel@64.5.0 deploy --prod --yes
```

Build backend menghasilkan `api/index.mjs` sebelum upload. Bundle ini memakai ESM
untuk NestJS 12, menyertakan metadata decorator, dan memakai aset/certificate yang
dibutuhkan pada runtime. Bundle hasil build, `.env*`, dan metadata `.vercel` tidak
di-commit. `.vercelignore` mengecualikan semua file secret lokal dari upload.

Untuk checkout baru, lakukan `vercel login` lalu `vercel link --project
manualmechanic-api` dari backend dan `vercel link --project manualmechanic-gtnic`
dari frontend. Jangan mengaktifkan paket Pro atau add-on berbayar untuk deployment ini.

## Verifikasi

```powershell
Set-Location backend
npm.cmd run build
$env:VERIFY_API_BASE='https://manualmechanic-gtnic.vercel.app/api'
$env:VERIFY_ORIGIN='https://manualmechanic-gtnic.vercel.app'
node dist/scripts/verify-web.js
```

Smoke test membuat akun dan data uji sementara, menguji login/cookie serta izin
operasional, lalu menghapus fixture dalam `finally`. Akun pengguna asli dipertahankan.
Perubahan skema tetap harus melalui Prisma Migrate, bukan startup Function.

## Gangguan koneksi database pada startup

Jika semua route termasuk `/api/health` gagal, periksa log runtime project API
di Vercel. Error shared pooler `tenant/user ... not found` berarti host/username
tidak dapat dipetakan ke project; cek status project dan salin ulang connection
string dari dialog Connect Supabase. Jangan menebak indeks host pooler atau
mereset password sebelum memastikan penyebabnya.

Jika status project Paused, pemilik project perlu menjalankan Restore/Resume
dan menunggu status Active. Jika connection string berubah, perbarui
`DATABASE_URL` production Vercel secara privat lalu redeploy API.
Tidak perlu mengubah schema, menghapus data, atau menjalankan seeding.

Adapter serverless menutup aplikasi yang gagal startup dan mengembalikan HTTP
503, `Retry-After`, serta ID permintaan tanpa detail database. Aplikasi akan
mencoba inisialisasi kembali pada request berikutnya setelah koneksi pulih.
