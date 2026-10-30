# Deployment web tanpa ML

- Frontend: https://manualmechanic-gtnic.vercel.app
- API: https://manualmechanic-api.vercel.app/api
- Database: PostgreSQL Supabase yang sudah ada.
- Kedua project memakai akun Vercel Hobby. Tidak membuat resource Azure atau Render.

Frontend mem-proxy `/api/*` ke API sehingga cookie tetap pada origin frontend.
Environment production API berisi `DATABASE_URL`, `JWT_SECRET`, `AUTH_ENABLED=true`,
`SESSION_COOKIE_SECURE=true`, dan `FRONTEND_ORIGIN=https://manualmechanic-gtnic.vercel.app`.
Secret dikelola di Vercel dan tidak disimpan dalam repo atau bundle frontend.

Simulator, agent otomatis, skenario, dan seeding dinonaktifkan lewat konfigurasi
deployment. Tidak ada layanan ML atau Gemini yang di-deploy/dikonfigurasi.
Diagnosis ML belum tersedia; data operasional tetap berasal dari database.

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
