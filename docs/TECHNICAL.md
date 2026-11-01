# Dokumentasi teknis — ManualMechanic

Tanggal acuan: 1 November 2026. Dokumen ini mengikuti kode web React + backend NestJS + layanan ML pada checkout saat penyusunan. Konfigurasi hosting dan data runtime dapat berubah.

## Struktur proyek

```text
frontend/
  src/App.tsx                    shell, navbar, polling overview, routing layar
  src/components/FacilityMap.tsx dashboard 3D dan panel mesin
  src/components/FacilityScene.tsx render GLB, kamera, indikator status
  src/components/Dashboard.tsx   detail/operasional unit pada /units/:id
  public/models/                 aset GLB yang dikirim ke browser
  scripts/build_hydraulic_model.py sumber generator model Blender
  test/                          regresi frontend
backend/
  src/api/                       overview, diagnosis, records, layanan
  src/auth/                      akun, sesi, profil, inbox
  src/agent/                     orkestrasi policy/LLM dan kasus
  src/tools/                     operasi maintenance dan guardrail
  src/ml/                        klien ML dan agregasi hasil komponen
  src/monitor/                   status unit dan pemicu otomatis
  src/sim/                       bank profil dan ring buffer sensor
  src/rag/                       pencarian TF-IDF manual/riwayat
  src/db/                        Prisma, seed, definisi dua unit tambahan
  src/scripts/                   setup akun, seed demo, pendaftaran dua unit
  knowledge/                     manual hidrolik Markdown
  assets/                        profil simulator dan metrik ML
  prisma/                        schema dan migrasi
ml/
  app.py                         API inferensi FastAPI
  train.py                       training dan ekspor artefak
  data.py                        dataset, fitur, komponen
  artifacts/                     model, profil, metrik
docs/                            PRD dan dokumentasi
```

Folder `app/`, `data/manuals/`, Dockerfile root, dan `requirements.txt` root merupakan jalur implementasi Python terpisah/awal. Panduan web ini memakai `frontend/`, `backend/`, dan `ml/`; gunakan Compose untuk menjalankan stack tersebut bersama-sama.

## Arsitektur dan alur data

1. Backend membaca daftar unit dari tabel `pumps`.
2. Saat bootstrap, simulator memuat pembacaan tersimpan dan mengisi bank pembacaan awal jika kurang. Data pengisi berasal dari profil model.
3. Monitor memvalidasi sensor, meminta inferensi ML, dan menyimpan status unit dalam `StatusStore` di memori proses.
4. Jika `SIM_ENABLED=true`, timer menambahkan siklus sensor, memperbarui status, dan dapat memicu agent bila diaktifkan.
5. `/api/overview` menggabungkan data master, status, kasus terbuka, jumlah WO, serta metadata ML.
6. Frontend melakukan polling overview setiap 15 detik. Peta dan panel membaca objek `pumps` yang sama.
7. Diagnosis menghubungkan sensor, ML, manual, riwayat, dan tool; hasilnya disimpan sebagai kasus serta jejak langkah.

Ini adalah polling, bukan streaming WebSocket. Timer simulator default tiga detik tidak berarti browser menerima pembaruan tiap tiga detik. Saat tab berada di latar belakang, polling query tidak dipaksakan berjalan.

`SIM_ENABLED=false` menonaktifkan timer; ini belum merupakan mode akuisisi sensor fisik. Bootstrap simulator masih dapat membangun pembacaan contoh dari profil. Status, ring buffer, dan indeks RAG berada dalam memori proses, sedangkan pembacaan dan catatan operasional disimpan di database. Beberapa instance backend tidak berbagi simulator/status secara otomatis.

## Peta 3D dan navigasi

| URL | Tampilan |
| --- | --- |
| `/` | Dashboard 3D; belum ada pilihan mesin pada awal kunjungan |
| `/units/:id` | Detail/operasional unit, grafik sensor, diagnosis, work order, kontrol demo sesuai izin |
| `/cases`, `/cases/:id` | Daftar dan detail kasus |
| `/work-orders` | Pekerjaan dan penyelesaiannya |
| `/inventory` | Inventaris serta manajemen stok supervisor |
| `/assistant` | Asisten maintenance |
| `/profile` | Profil akun yang login |
| `/3d`, `/3d/:id` | Kompatibilitas tautan lama ke peta; tidak ada menu 3D terpisah |

Brand ManualMechanic membawa pengguna kembali ke dashboard dan membersihkan pilihan mesin. Pilihan mesin pada dashboard normal disimpan di state halaman, bukan URL khusus setiap klik.

`FacilityScene` membuat satu objek untuk setiap ID yang dikirim backend. Landasan dan zona disusun secara ilustratif berdasarkan jumlah unit; dinding rendah, rak, tangki, palet, drum, jalur kabel, dan marka merupakan dekorasi statis, bukan mesin tambahan atau denah fisik. Posisi dekorasi disaring agar tidak bertabrakan dengan landasan dan jalur utama. Kamera menyesuaikan skala terhadap jumlah unit dan ukuran kanvas. Semua unit memakai model hidrolik yang sama, bukan model yang dipilih berdasarkan field `model`.

- Lampu hijau: `normal`.
- Lampu kuning dan denyut: `waspada`.
- Lampu merah dan denyut: `kritis`.
- Lampu netral: `sensor`, `ml_error`, atau `tidak ada data`.

Status kartu teks dapat memakai badge warna berbeda untuk menegaskan kegagalan layanan. Denyut lampu adalah sinyal perhatian, bukan simulasi pergerakan komponen. Reduced motion mematikannya. Render menggunakan mode demand ketika tidak ada animasi perhatian, dengan DPR maksimum 1,5.

Model dimuat dari `/models/hydraulic-unit.glb` melalui GLTFLoader dan di-clone untuk tiap unit. Decoder meshopt disertakan dalam bundle aplikasi; render tidak perlu mengunduh decoder atau HDR dari CDN. Setiap mesin mempunyai label HTML yang dapat difokuskan dan diklik, sementara ring serta lampu mengikuti status dan pilihan unit. Error boundary menyediakan pesan fallback; pengguna dapat membuka daftar unit. Aset dan modul render dimuat ketika peta dipakai.

Ringkasan menampilkan jumlah kondisi dari `overview.pumps`. Waktu pembaruan berasal dari `dataUpdatedAt` query overview, yaitu saat browser terakhir berhasil menerima data, bukan waktu pengukuran sensor. Status offline dan kegagalan polling ditampilkan oleh `RequestState`.

Pencahayaan menggunakan ACES, hemisphere light, shadow map statis, contact shadow satu frame, dan environment yang dibuat secara lokal dengan Lightformer. Shadow diperbarui ketika tata letak/objek berubah. Garis warna pada landasan mengikuti kategori lokasi Produksi, Fabrikasi, atau Gudang; posisinya tetap ilustratif. Kamera bergerak halus ke pilihan dan menghormati reduced motion. Resolusi shadow 1024 dan contact shadow 512 dipilih untuk mengurangi biaya dibanding pengaturan resolusi penuh; performa perangkat nyata tetap perlu diuji.

Drum, bollard, dan tiang rak pipa memakai instancing; marka lantai menggunakan satu tekstur kanvas. Dalam satu pemeriksaan lokal enam unit dengan Chrome headless dan SwiftShader pada server pengembangan, penghitung WebGL mencatat 267 pemanggilan draw selama satu klik zoom sebelum perubahan dan 253 sesudahnya; waktu dari navigasi hingga label pertama sekitar 1.009 ms dan 967 ms. Ini pengukuran terbatas yang mencakup seluruh pass selama interaksi, bukan draw call per frame atau tolok ukur perangkat fisik. FPS, memori, dan waktu muat pada ponsel nyata masih perlu diukur.

### Mengubah model Blender

Sumber generator: `frontend/scripts/build_hydraulic_model.py`. Model ilustratif berisi reservoir, motor, cooling fins, valve manifold, hose, gauge, dan kabinet kontrol.

```powershell
Set-Location .\frontend
# Sesuaikan path executable Blender di komputer pengembang.
& 'C:\path\to\blender.exe' --background --python scripts\build_hydraulic_model.py
```

Output: `frontend/public/models/hydraulic-unit.glb`. Blender diperlukan untuk membangun ulang aset, tetapi tidak diperlukan untuk menjalankan website. Blender portabel/cache pengembangan bukan dependensi runtime dan tidak perlu diunggah ke GitHub. Setelah mengubah ukuran model, tinjau kamera, posisi lampu status, serta hit area pada desktop dan ponsel.

Generator melakukan bevel dan bake ambient occlusion ke vertex color. Untuk membuat kembali versi terkompresi seperti aset yang dipakai, jalankan dari `frontend/` setelah ekspor Blender:

```powershell
npx.cmd --yes @gltf-transform/cli@4.5.1 optimize public/models/hydraulic-unit.glb public/models/hydraulic-unit.optimized.glb --compress meshopt --palette false --simplify false
Move-Item -LiteralPath public/models/hydraulic-unit.optimized.glb -Destination public/models/hydraulic-unit.glb -Force
```

Perintah tersebut mengganti GLB hasil ekspor dengan hasil optimasi dan membutuhkan jaringan bila CLI belum ada di cache npm. Palette dimatikan agar optimasi tidak membuat tekstur `blob:` yang diblokir CSP, dan simplifikasi dimatikan untuk menjaga detail. Decoder meshopt memerlukan WebAssembly; CSP Nginx dan Vercel mengizinkan `'wasm-unsafe-eval'`, tanpa mengizinkan `'unsafe-eval'` untuk JavaScript. Uji kembali pemuatan model dengan CSP setelah optimasi; exporter Blender sendiri menghasilkan GLB tanpa meshopt.

## Model ML dan asal data

Model memproses fitur agregat sensor per siklus. Kunci sensor yang ditampilkan web adalah `PS1`, `EPS1`, `FS1`, `TS1`, `VS1`, `CE`, `CP`, dan `SE`; metadata nama/satuan berasal dari profil. Payload inferensi memerlukan seluruh fitur yang ada di metadata model, bukan hanya delapan angka tampilan.

Training memakai split acak stratifikasi 75/25 dengan seed 42. Random Forest dilatih per komponen (`pump`, `valve`, `cooler`, `accumulator`); Isolation Forest mendeteksi anomali. Profil untuk simulator diekspor dari bank data evaluasi, dengan fallback tertentu ke seluruh dataset jika siklus sehat terlalu sedikit.

| Nilai sumber | Makna |
| --- | --- |
| `uci_real` | Pipeline menandai dataset unduhan UCI |
| `demo_synthetic` | Data buatan untuk demo |
| `unverified` | Folder dataset tanpa penanda asal yang dapat dibaca |

Penanda asal berasal dari proses lokal dan bukan pemeriksaan independen isi data. Metrik dapat dibaca melalui `/meta` dan artefak metrik, tetapi tidak boleh dipromosikan sebagai akurasi lapangan atau evaluasi independen terhadap simulator yang memutar data terkait.

Artefak utama `ml/artifacts/model.joblib`, `profiles.json`, dan `metrics.json` dibuat bersama. Training juga mengekspor profil/metrik untuk backend. Periksa tujuan ekspor di `ml/train.py` jika mengubah pipeline.

Backend menggabungkan peluang komponen dengan asumsi independensi untuk ranking normal/gangguan tunggal. Gangguan majemuk dinilai dari hasil komponen secara terpisah. Skor gabungan belum dikalibrasi pada mesin nyata.

ML mengembalikan HTTP 503 bila model hilang, rusak, atau scikit-learn tidak kompatibel. `/health` mencoba memuat dan menjalankan model; adanya berkas saja tidak menjamin siap. `/meta` dan `/predict` memakai `x-api-key` jika `ML_API_KEY` diisi. Versi dependency mengikuti `ml/requirements.txt`; jangan melakukan upgrade terpisah tanpa mengevaluasi artefak.

## Agent dan RAG

Mode policy tersedia tanpa API LLM. Mode Gemini bersifat opsional dan memakai function calling. Tool backend tetap memberlakukan aturan risiko/persetujuan, stok, dan transaksi.

RAG menggunakan TF-IDF + cosine similarity, bukan embedding atau vector database. Manual `backend/knowledge/*.md` dipotong berdasarkan heading bagian; indeks juga memuat `case_history`. Sitasi menyebut dokumen dan bagian/ID riwayat. Menyelesaikan WO menambah riwayat untuk pencarian; tidak melatih ulang model secara otomatis.

Panduan maintenance adalah pengetahuan teknik umum yang ditulis untuk prototipe. Penggunaan lapangan memerlukan penyesuaian terhadap manual produsen dan prosedur perusahaan.

## Database

Sumber schema: `backend/prisma/schema.prisma` dan migrasi di `backend/prisma/migrations/`.

| Kelompok | Tabel |
| --- | --- |
| Mesin/sensor | `pumps`, `sensor_readings` |
| Kasus dan pekerjaan | `cases`, `work_orders`, `case_history`, `agent_logs` |
| Resource | `inventory`, `stock_movements`, `technicians`, `purchase_requests` |
| Notifikasi | `notifications` |
| Akun/sesi | `app_users`, `refresh_sessions`, `consumed_refresh_tokens` |
| Infrastruktur | `counters`, `request_limits` |

Status live unit bukan kolom `pumps`; sumbernya adalah monitor memori. Referensi antar tabel memakai foreign key. Constraint dan unique index parsial membatasi kasus terbuka/pekerjaan aktif tertentu. Operasi utama memakai transaksi Prisma. Penutupan WO menghubungkan status pekerjaan, ketersediaan teknisi, kasus, dan riwayat.

`DATABASE_URL` untuk runtime, `DIRECT_URL` opsional untuk migrasi. Jalankan `npm.cmd run db:migrate` sebelum startup Node pada database baru. Database GTNIC lama yang belum memiliki riwayat Prisma memerlukan pemeriksaan schema sebelum baseline ditandai; jangan menandai baseline secara otomatis hanya agar migrasi lolos.

### Data demo dan pendaftaran unit

`SEED_DEMO_DATA=true` mengisi data awal hanya jika tabel mesin kosong. Ini tidak menambahkan mesin ke instalasi yang sudah berisi data. Data awal berisi enam unit, tujuh part, enam teknisi, dan empat riwayat perawatan. Akun dikelola oleh bootstrap autentikasi terpisah.

| ID | Nama demo | Lokasi |
| --- | --- | --- |
| Pump-01 | HPU Press Line 1 | Produksi, Line 1 |
| Pump-02 | HPU Injeksi Plastik | Produksi, Line 2 |
| Pump-03 | HPU Pengepres Logam | Fabrikasi, Area B |
| Pump-04 | HPU Conveyor Hidrolik | Gudang, Area C |
| Pump-05 | HPU Press Line 3 | Produksi, Line 3 |
| Pump-06 | HPU Lift Table | Gudang, Area D |

Perintah `npm.cmd run demo:add-pumps` memakai `createMany` dengan `skipDuplicates` untuk menambahkan dua ID terakhir. Jalankan pada database target yang benar; record lama tidak diubah. Restart backend setelah pendaftaran agar `SimService.init()` memuat ID baru. Backend overview sudah membaca daftar dari database sehingga objek muncul saat frontend memperbarui data, walaupun statusnya dapat sementara `tidak ada data`.

Belum ada endpoint `POST /pumps` atau form umum pendaftaran mesin. Untuk menambah ID lain, diperlukan perubahan data master/CLI yang ditinjau dan pemuatan ulang simulator. Jangan memasukkan jenis mesin berbeda tanpa memvalidasi kesesuaian fitur dan model ML.

`npm.cmd run demo:seed` mengaktifkan seed master, menonaktifkan timer/agent otomatis dan notifikasi eksternal pada proses CLI, lalu menghasilkan skenario melalui inferensi. Perintah dapat menambah kasus, WO, pembelian, jadwal, dan catatan notifikasi. Jalankan dengan backend berhenti dan ML aktif, pada database demo yang disengaja.

## Konfigurasi dan startup

Panduan tiga terminal ada di [README](../README.md#mulai-di-windows--powershell). File lokal: `backend/.env`; Compose memakai `.env` root. Variabel environment yang sudah terpasang pada proses menang atas nilai `.env`.

`.env.example` root masih memuat `DB_PATH` untuk jalur Python lama; backend NestJS tetap menggunakan `DATABASE_URL`. Jangan menganggap perubahan `DB_PATH` mengganti database web.

| Variabel | Default / penggunaan |
| --- | --- |
| `PORT` | Backend 8000 |
| `ML_URL` | `http://127.0.0.1:8100` |
| `ML_API_KEY` | Kosong; samakan dengan environment layanan ML bila digunakan |
| `FRONTEND_ORIGIN` | Isi origin eksplisit; contoh backend memakai `http://localhost:5173` |
| `TICK_SECONDS` | 3 pada konfigurasi backend |
| `SIM_ENABLED`, `AUTO_AGENT` | Default backend true; periksa override deployment |
| `DEMO_SCENARIO` | false; memulai gangguan Pump-02/03 ketika simulator aktif |
| `SCENARIO_CONTROLS_ENABLED` | Default false di production, true selain itu; contoh env dapat menimpanya |
| `SEED_DEMO_DATA` | Hanya aktif bila bernilai `true` |
| `ASSETS_DIR` | Default `backend/assets`; Compose memakai profil bersama |
| `AUTH_ENABLED`, `JWT_SECRET` | Login default aktif; secret minimal 32 karakter |
| `AUTH_*_USERNAME`, `AUTH_*_PASSWORD_HASH` | Bootstrap akun ketika tabel akun kosong |
| `SESSION_COOKIE_SECURE` | Aktifkan pada HTTPS sesuai konfigurasi autentikasi |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Opsional; model default dalam contoh `gemini-2.5-flash` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Opsional; kosong berarti tidak mengirim Telegram nyata |
| `DB_POOL_MAX` | Pool runtime default 5; tes membatasi 1 |
| `TRUST_PROXY`, `RATE_*` | Proxy tepercaya dan batas request; lihat source security |
| `VITE_API_URL` | Frontend default `/api`; ini nilai publik saat build |
| `ML_ARTIFACTS` | Direktori artefak layanan ML bila di-override |

Perubahan `.env` backend memerlukan restart; perubahan `VITE_*` pada produksi memerlukan build/deploy frontend ulang. `ML_API_KEY` layanan FastAPI dibaca dari environment proses, bukan otomatis dari `backend/.env`.

## Akun dan keamanan

`npm.cmd run auth:setup` membantu menyiapkan `.env` backend dan kredensial bootstrap lokal. File `.auth-bootstrap.json` tidak untuk source control. Bootstrap username/hash hanya membuat akun ketika tabel akun kosong; perubahan env berikutnya tidak menimpa akun yang sudah ada. Gunakan Profil untuk perubahan akun berikutnya.

Access JWT berlaku 15 menit dan refresh token tujuh hari. Cookie HttpOnly digunakan untuk transport. Refresh token disimpan sebagai hash, dirotasi, dan dapat dicabut; penggunaan ulang token lama dapat mencabut sesi terkait. Password baru mencabut seluruh sesi. Supervisor aktif terakhir tidak dapat dihapus.

API memvalidasi JSON, origin, header klien, dan izin peran. Dalam mode autentikasi role dibaca dari sesi/database, bukan dipercaya dari `x-role`. Mode `AUTH_ENABLED=false` hanya untuk demo lokal dan ditolak untuk production publik sesuai validasi konfigurasi.

Mutasi inventaris menggunakan `operationId`, saldo harapan, dan alasan. Stok negatif, saldo yang berubah sejak form dibuka, serta pengiriman ulang operasi ditangani backend. Rate limiter memakai database bersama dan dapat mengembalikan 503 bila store gagal. Tidak ada klaim bahwa penerapan ini telah melalui audit keamanan independen.

Telegram menggunakan outbox persisten dengan percobaan ulang terbatas; timeout/crash dapat menghasilkan pengiriman ulang. Notifikasi UI bersifat operasional tim, dengan penanda dibaca per akun.

## Deployment

### Docker Compose

Empat layanan: PostgreSQL, ML, backend, dan frontend/Nginx. UI pada 8080, backend dan ML dibatasi ke loopback host, database tidak mempublikasikan port. Backend Docker menerapkan migrasi sebelum start dan menunggu healthcheck dependency.

Untuk autentikasi Compose, isi `JWT_SECRET` serta username/hash bootstrap pada `.env` root. Jalankan `scripts/hash-password.ps1` dari root untuk membuat hash setiap password secara lokal, lalu salin hasilnya ke variabel akun yang sesuai. Gunakan password berbeda untuk tiap akun. `auth:setup` menyiapkan environment backend lokal; file itu tidak otomatis menjadi environment Compose.

Build ML mencoba artefak lalu melatih ulang dari UCI jika perlu; tahap ini membutuhkan internet bila training dipicu. Profil/metrik disalin ke volume `ml_profiles` untuk backend. Kredensial database contoh Compose hanya untuk pengembangan dan perlu diganti untuk instalasi publik.

`docker compose down` mempertahankan named volume. Jangan menambahkan `-v` kecuali memang bermaksud menghapus data.

### Frontend statis dan backend persisten

Frontend perlu proxy `/api` ke backend dengan origin yang sama dan fallback SPA untuk URL aplikasi. `FRONTEND_ORIGIN` backend harus sesuai domain frontend. Perbarui tujuan rewrite di `frontend/vercel.json` untuk lingkungan sendiri; alamat yang tersimpan dalam repositori bukan konfigurasi universal.

Backend persisten diperlukan untuk timer simulasi yang terus bergerak. Gunakan hosting yang menjalankan proses Node berumur panjang, database yang aktif, dan layanan ML terpisah. Periksa kebijakan hosting yang digunakan secara langsung; dokumentasi ini tidak menetapkan harga atau jaminan uptime provider.

### Backend serverless Vercel

`backend/vercel.json` menonaktifkan `SIM_ENABLED`, `AUTO_AGENT`, `DEMO_SCENARIO`, `SCENARIO_CONTROLS_ENABLED`, dan `SEED_DEMO_DATA`. Simulator/monitor dalam memori proses bukan worker terdistribusi. Jangan mengharapkan kondisi mesin bergerak terus di antara request serverless.

Detail build/rewrite tersedia di [VERCEL_WEB.md](VERCEL_WEB.md). Jalankan smoke login, refresh, overview, ML melalui backend, dan alur kasus setelah deploy; status READY tidak cukup. Deployment tidak dilakukan sebagai bagian penyusunan dokumentasi ini.

## Pengujian

- `frontend`: `npm.cmd test` dan `npm.cmd run build`.
- `backend`: `npm.cmd test` dan `npm.cmd run build`. Keduanya menjalankan Prisma generate, sehingga jangan menjalankan bersamaan pada direktori generated yang sama.
- `ml`: environment ML + `pytest`; dependensi pytest terpisah dari requirements runtime.
- Tes backend memakai PGlite lewat protokol PostgreSQL dengan migrasi aktual. Pengujian tersebut tidak mewakili konkurensi multi-koneksi atau beban produksi.
- Suite `e2e.spec.ts` memerlukan ML aktif. Tes LLM tertentu memakai respons terkontrol dan tidak membuktikan API key Gemini live valid.
- Uji browser menggunakan API terkontrol membuktikan render/pemilihan/status pada skenario itu; uji sesi produksi dan mesin nyata tetap terpisah.

## Troubleshooting

| Gejala | Pemeriksaan / tindakan |
| --- | --- |
| Backend dan ML dianggap bertabrakan | Backend 8000, ML 8100, web 5173; cek port pada command yang dijalankan |
| ML HTTP 503 | Baca detail model hilang/rusak/beda versi; periksa environment dan latih ulang pasangan artefak |
| `fetch failed` ke ML | Cek ML_URL dari proses backend; localhost container berbeda dari host |
| Backend gagal konek database | Periksa project aktif, connection string, password, jaringan, pooler, dan migrasi; jangan mencetak secret |
| API 401 | Login/refresh sesi; health publik tidak membuktikan sesi pengguna valid |
| API 403 | Periksa role, origin, `x-mm-client`, dan izin kontrol demo |
| API 429 | Tunggu waktu pada `Retry-After`; hindari mengulang mutasi tanpa memeriksa hasil sebelumnya |
| Peta kosong atau pesan gagal render | Pastikan WebGL tersedia, aset GLB HTTP 200, modul JS termuat; gunakan daftar unit |
| Model masih berbentuk sederhana | Pastikan checkout/build memuat GLB terbaru, lalu hard refresh; periksa request `/models/hydraulic-unit.glb` |
| Mesin baru muncul tetapi belum punya status | Restart backend agar simulator memuat ID; perbarui overview |
| Dashboard tidak berubah | Periksa timestamp, offline/cache, timer simulator, dan konfigurasi serverless |
| Kasus lama berbeda dari status peta | Kasus merekam diagnosis pada waktu tertentu; peta memakai status monitor terbaru |
| Gemini belum siap | Isi key backend lalu gunakan Uji Gemini; pemeriksaan ini mengonsumsi request API |
| Prisma generate `EEXIST` saat verifikasi | Hentikan proses generate yang tumpang tindih, lalu jalankan build/test secara berurutan |

## Pemeliharaan dokumentasi

Perubahan fitur memperbarui [PRD](PRD.md), [panduan pengguna](USER_GUIDE.md), dan [API](API.md) jika relevan. Rahasia, hash password, session cookie, dan snapshot data pribadi tidak boleh masuk dokumentasi. Jangan mengubah hasil pengujian historis menjadi klaim hasil terbaru tanpa menjalankan pengujian kembali.
