# Hasil pengujian GTNIC / ManualMechanic

Tanggal: 1 November 2026 (Asia/Jakarta). Checkout: branch `farras`, commit dasar `ec3012c`, termasuk perubahan ML lokal yang belum di-commit.

## Tes otomatis dan build

| Pemeriksaan | Hasil |
| --- | --- |
| Frontend: `npm.cmd test` | 15 file, 31 tes lulus |
| Backend: `npm.cmd test` | 7 suite, 53 tes lulus |
| Layanan ML: `python -m pytest tests/test_ml.py -q` dari `ml/` | 8 tes lulus |
| Implementasi Python terpisah: `tests/test_pipeline.py` | 15 tes lulus |
| Frontend: `npm.cmd run build` | Lulus |
| Backend: `npm.cmd run build` | Lulus |
| Backend: `npm.cmd run build:vercel` | Lulus; tidak melakukan deployment |
| HTTP smoke test: `dist/scripts/verify-web.js` | Lulus pada API dan database sementara |
| `git diff --check` | Lulus |

Total: **107 tes otomatis lulus**. Tes policy yang menggunakan mock tidak dianggap bukti akurasi model. Ada tes integrasi tambahan yang benar-benar mengirim profil sehat dan pendingin rusak ke layanan inferensi tanpa mock prediksi.

Tes backend menggunakan PGlite sebagai PostgreSQL sementara, bukan database operasional. Layanan ML tes memakai port 18100 dan artefak sintetis sementara yang dilatih dengan runtime scikit-learn lokal. Artefak bawaan di `ml/artifacts/` dan `backend/assets/` tidak diganti.

Tes Python terpisah dijalankan dengan `DB_PATH`, `DISABLE_LOOP=1`, dan integrasi eksternal kosong sebelum import `app.config`; folder model juga diarahkan ke folder sementara. Percobaan awal mengimpor konfigurasi terlalu dini sehingga membaca SQLite repo. Hasil percobaan awal dibuang, file SQLite dipulihkan, dan pengujian diulang dengan isolasi yang benar. Hasil akhir 15 tes lulus dan SQLite repo tidak berubah.

## Cakupan HTTP dan keamanan

Smoke test HTTP menjalankan backend tersendiri pada port 18000 dengan database terisolasi. Akun, part, kasus, work order, dan notifikasi fixture dibersihkan dalam `finally`.

- Header keamanan, batas MIME, dan penolakan Origin asing.
- Login dengan cookie, hak akses supervisor/teknisi, dan profil.
- Rate limiter bersama dan 20 operasi konkuren.
- Inventaris dan idempotensi transaksi stok.
- Pencarian/pagination kasus dan work order.
- Status baca notifikasi terpisah antar akun.
- Koneksi database dan ML berhasil. Gemini sengaja tidak dikonfigurasi pada lingkungan tes ini.

Suite backend juga memeriksa sesi kedaluwarsa, refresh, replay refresh token, logout, otorisasi, perubahan password dan pencabutan sesi, perlindungan supervisor terakhir, rollback transaksi, guardrail risiko tinggi, approval, eskalasi, dan gangguan sensor. Operasi ini diuji pada fixture sementara.

## Pemeriksaan browser lokal

Browser: Brave, aplikasi `http://localhost:5173`, memakai sesi pengguna yang sudah login.

- Dashboard, daftar kasus, detail diagnosis/jejak kasus, work order, inventaris/tim, Asisten, dan profil berhasil ditampilkan.
- Asisten mode policy berhasil menjawab saran pertanyaan `Stok seal kit pompa` dengan hasil `Seal kit pompa hidrolik = 2`.
- Profil hanya dibuka; identitas, password, dan akun asli tidak diubah.
- Approval, penyelesaian work order, perubahan stok, dan logout akun asli tidak dilakukan di browser; alurnya diuji otomatis dengan fixture.

## Masalah runtime yang masih ditemukan

1. Backend lokal memakai `ML_URL=http://127.0.0.1:8100`, tetapi health endpoint pada port tersebut tidak dapat dihubungi. Browser menampilkan `fetch failed` dan `ML tidak tersedia`. Layanan tes pada port 18100 terpisah dari konfigurasi aplikasi pengguna.
2. Environment lokal memakai scikit-learn 1.7.2, sedangkan artefak bawaan dibuat dengan 1.9.1. Kode sekarang menolak ketidakcocokan tersebut. Environment perlu disamakan dengan dependency artefak, atau model demo dilatih ulang pada runtime yang akan menjalankannya sesuai README.
3. Probe `Uji Gemini` pada aplikasi lokal mengembalikan `HTTP_401`: key yang dikonfigurasi ditolak. Mode LLM belum berhasil diverifikasi; mode policy berhasil merespons. Key tidak dicetak atau diubah.
4. Respons 502 sempat muncul pada polling overview/status layanan di browser. Pemeriksaan berikutnya pada `/api/health` langsung dan melalui proxy Vite sama-sama HTTP 200, dan status database kemudian kembali `Terhubung`. Penyebab 502 belum terbukti dari log runtime; jangan menyimpulkan database rusak atau menganggap gangguan sudah terselesaikan.

## Batas hasil

Hasil ini membuktikan suite otomatis dan smoke test terisolasi lulus, serta halaman utama bisa dibuka. Ini belum menyatakan instance lokal siap dipakai penuh selama koneksi ML dan Gemini masih bermasalah. Tidak ada commit, push, deployment, migrasi database operasional, pengujian beban produksi, pengiriman Telegram sungguhan, atau pengujian perangkat seluler fisik/Safari pada pengujian ini. Data sintetis tidak membuktikan akurasi pada mesin nyata.
