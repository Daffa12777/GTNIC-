# Deployment web dan koneksi layanan ML

> Acuan pemeriksaan terbaru: 8 November 2026. Login kedua peran, overview, dan metadata ML diperiksa melalui domain frontend. Konfigurasi hosting serta kondisi layanan dapat berubah. Untuk arsitektur lihat [dokumentasi teknis](TECHNICAL.md#deployment).

- Frontend: https://manualmechanic-gtnic.vercel.app
- API: https://manualmechanic-api.vercel.app/api
- ML eksternal: https://manualmechanic-ml.vercel.app (`ML_URL` pada backend)
- Database: PostgreSQL Supabase yang sudah ada.
- Kedua project memakai akun Vercel Hobby. Tidak membuat resource Azure atau Render.

Frontend mem-proxy `/api/*` ke API sehingga cookie tetap pada origin frontend.

## Redeploy perbaikan agent — 8 November 2026

### Rilis terbaru: kebijakan sesi 30 menit / 8 jam

Source backend dan frontend: `5782bdc`, sudah berada pada `farras` serta `main`. Rilis ini tidak memerlukan migrasi atau perubahan environment. Sesi versi lama yang memakai deadline tujuh hari harus login ulang.

| Project | Deployment terbaru | Hasil |
| --- | --- | --- |
| API | `dpl_5iY6EDADPpHAWFn98W4y4CFQscKY` | READY, alias `manualmechanic-api.vercel.app` |
| Frontend | `dpl_EnaNm31XgskEJ1pqib7VhbHeMWeS` | READY, alias `manualmechanic-gtnic.vercel.app` |

Verifikasi HTTP production dengan akun demo supervisor dan teknisi: login berhasil; cookie access/refresh memakai Secure/HttpOnly tanpa Max-Age/Expires; `/auth/session` mengembalikan idle 30 menit serta batas absolut delapan jam dari login; dua pembacaan sesi dan rotasi refresh mempertahankan deadline; `/auth/activity` memperpanjang idle tanpa mengubah batas absolut. Seluruh sesi uji diakhiri dengan logout. Kasus, WO, stok, dan akun tidak diubah.

Browser production juga berhasil login sebagai supervisor lalu teknisi, masing-masing kembali ke dashboard `/`, membuka Profil, dan logout tanpa exception JavaScript. Waktu login hingga dashboard pada satu run sekitar 5,4 dan 5,2 detik; ini bukan benchmark cold start. Pemeriksaan kedaluwarsa yang menunggu 30 menit/delapan jam penuh dan perilaku pemulihan sesi setelah browser ditutup tidak dilakukan di production. Penolakan sesi idle/absolut dan batasan antar-tab sudah diuji pada database tes serta fixture browser lokal. Validasi source: 93 tes backend dan 75 frontend, build Node/Vercel/frontend lulus.

### Rilis sebelumnya: supervisor, chat, dan sesi

Branch `farras` berhasil digabung ke `main` melalui `fed2402`. Source backend production adalah commit tersebut; frontend final memakai `974575c`, termasuk perbaikan sinkronisasi sesi `49e0be2` dan pengaman login saat cleanup logout masih berjalan. Kedua branch kemudian diselaraskan. Rilis memakai checkout terpisah agar edit chat lokal dan penghapusan model lokal tidak ikut terpublikasi.

| Project | Deployment terbaru | Hasil |
| --- | --- | --- |
| API | `dpl_4UjZ8od2VoJnTB9vCM45a4bM9W3r` | READY, alias `manualmechanic-api.vercel.app` |
| Frontend | `dpl_HckCTmok52j5dJEv5iicAbcn6Q8u` | READY, alias `manualmechanic-gtnic.vercel.app` |

Verifikasi HTTP production melalui domain frontend berhasil: `/`, `/tasks`, `/assistant`, `/profile`, health, model GLB, login/logout kedua peran, sesi, layanan database, overview enam unit dengan ML `uci_real`, antrean supervisor, dan penolakan akses endpoint penugasan bagi teknisi. Simulator dan agent otomatis tetap nonaktif. Satu pertanyaan stok dalam Mode LLM menjawab langsung dari inventaris sekitar 2,48 detik, membawa `action_summary`, tanpa fallback LLM, tanpa perubahan kasus atau penambahan WO. Pengujian ini tidak memberi persetujuan atau mengganti penugasan pekerjaan production.

Uji browser production final benar-benar login sebagai supervisor, membuka Profil dan logout, lalu login sebagai teknisi: keduanya kembali ke `/` dengan dashboard tampil; kedua sesi diakhiri dan tidak ada exception JavaScript. Waktu login sampai dashboard tampil dalam satu run sekitar 10,9 dan 5,9 detik. Ini mencakup pembacaan data dan pemuatan/render UI; bukan benchmark cold start atau jaminan latensi. Pada percobaan awal sebelum fix sesi, terdapat request dibatalkan serta respons 500/503; log runtime mencatat kode database `P2039` yang disanitasi. Penyebab internal kode tersebut belum dipastikan dan kestabilan database tetap perlu dipantau. Smoke final yang berhasil bukan uji beban.

Bug tambahan yang ditemukan saat smoke: publisher BroadcastChannel memakai objek channel berbeda sehingga tab yang sama menerima pemberitahuannya sendiri dan menghapus cache saat login. Pesan sekarang membawa penanda sumber tab, dan penerima mengabaikan sumbernya sendiri. Perubahan dari tab lain tetap diterima. Tombol Masuk juga menunggu cleanup logout selesai. Validasi frontend akhir: 69 tes lulus, build lokal/cloud lulus. Backend terakhir: 88 tes serta build Node/Vercel lulus.

### Rilis sebelumnya

Source aplikasi yang dideploy: `7b11c9b` pada checkout `farras`, melalui Vercel CLI.

| Project | Deployment | Hasil |
| --- | --- | --- |
| API | `dpl_G6Xapiw833wEQynYoiUoW3niXNTB` | READY, alias `manualmechanic-api.vercel.app` |
| Frontend | `dpl_FaNvLzhuG9jXBWRVVD1FXMpyKQ3T` | READY, alias `manualmechanic-gtnic.vercel.app` |

Pemeriksaan melalui domain frontend mengonfirmasi health 200, login 201 dan sesi 200 untuk supervisor/teknisi, overview enam unit dengan ML `uci_real` tersedia, serta simulator/agent otomatis tetap nonaktif. Route `/assistant`, aset JavaScript yang dirujuk HTML production, dan `/models/hydraulic-unit.glb` merespons 200. Bundle production memuat pembatasan tiga pratinjau foto; hash bundle cloud dapat berbeda dari build lokal.

Chat live pada kasus existing `C-0052` diuji berurutan dengan “kenapa gitu?” dan “Stok seal kit pompa”. Keduanya merespons 201 tanpa fallback LLM; jawaban alasan berbeda dari ringkasan lama dan jawaban stok membaca inventaris. Snapshot kasus tetap sama serta tidak ada WO baru untuk kasus itu. Sesi uji logout setelah selesai. Persetujuan dan unggahan foto belum diuji ulang pada production ini; verifikasi HTTP/asset tidak menggantikan pemeriksaan visual browser.

Environment production API berisi `DATABASE_URL`, `JWT_SECRET`, `AUTH_ENABLED=true`,
`SESSION_COOKIE_SECURE=true`, dan `FRONTEND_ORIGIN=https://manualmechanic-gtnic.vercel.app`.
Secret dikelola di Vercel dan tidak disimpan dalam repo atau bundle frontend.

Simulator, agent otomatis, skenario, dan seeding dinonaktifkan lewat konfigurasi
deployment. Backend mengakses layanan ML eksternal melalui `ML_URL`;
redeploy web tidak melakukan training atau deployment layanan ML tersebut.
Pada pemeriksaan 8 November 2026, metadata ML production melaporkan `uci_real`,
training `2026-11-07 02:07:53`, serta 2.205 siklus dan 552 siklus uji.
Overview melaporkan Gemini tersedia dengan model `gemini-3.1-flash-lite`.
Data operasional berasal dari database; simulator dan agent otomatis tetap nonaktif.
Nilai model yang dipakai ditentukan environment deployment, sehingga contoh default
di `.env.example` dapat berbeda.

`GEMINI_API_KEY` dan `GEMINI_MODEL` dipasang pada environment **Production** project
`manualmechanic-api`. File `.env` lokal diabaikan saat upload. Mengubah `ML_URL`
memperbarui layanan sensor ML, sedangkan koneksi Gemini diatur terpisah.

Pertahankan pula pengaturan project Production berikut, sesuai `backend/vercel.json`:

```text
SIM_ENABLED=false
AUTO_AGENT=false
DEMO_SCENARIO=false
SCENARIO_CONTROLS_ENABLED=false
SEED_DEMO_DATA=false
DB_POOL_MAX=2
```

Pada pemulihan 7 November 2026, runtime hasil redeploy sempat menjalankan simulator
dan mengalami timeout database. Flag di atas kemudian dipasang pada environment
project, diikuti deployment dari source terbaru. Setelah setiap redeploy, pastikan
overview melaporkan simulator/agent otomatis nonaktif dan periksa log jika muncul 503.
Limiter memakai database; respons 503 dapat terjadi sebelum request mencapai Gemini.

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

Jalankan **Status layanan → Uji Gemini** melalui akun yang login untuk menguji
koneksi dari backend. Uji satu pesan teks dan satu gambar kecil setelah perubahan
chat. Lampiran JPG/PNG/WebP dibatasi 2 MiB, dengan batas JSON chat 3 MiB.

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
