# Perbaikan dan validasi agent — 8 November 2026

Laporan ini menjelaskan perubahan setelah tinjauan awal. Perubahan diuji pada checkout lokal; push, merge, dan deployment bukan bagian dari hasil verifikasi ini. Google Docs dan PDF proposal merupakan snapshot perbaikan awal dengan 131 tes. Regresi pertanyaan lanjutan yang ditemukan sesudahnya, hasil 133 tes, dan smoke Gemini live dicatat pada laporan ini.

Acuan perbaikan awal: `8e11389` beserta rangkaian commit-nya; perbaikan percakapan baca saja dan regresinya merupakan tindak lanjut setelah snapshot tersebut.

## Tindak lanjut: Tugas saya, ringkasan chat, dan uji dua peran

- Commit penugasan supervisor `6fc9386` sudah di-push ke `origin/farras`. Perubahan sesudahnya dalam bagian ini belum di-push atau di-deploy pada saat pencatatan.
- Menu `/tasks` hanya ditampilkan untuk supervisor. Tiga antrean memakai data kasus/WO yang sudah ada: persetujuan, pekerjaan aktif tanpa teknisi, dan eskalasi. Masing-masing lima entri, total sebenarnya, tautan daftar lengkap, serta retry independen. Penugasan memakai form dan endpoint supervisor yang sama.
- Controller chat menambahkan snapshot hasil dari database: status kasus, jumlah/daftar WO, teknisi/jadwal, dan pengajuan part. Snapshot dibatasi ID kasus tepat dan ditandai dapat mencakup pekerjaan lama. Kegagalan pembacaan ringkasan mempertahankan jawaban chat yang sudah berhasil. Snapshot tidak disimpan dalam riwayat session storage.
- Panduan [uji dua peran](USER_TEST.md) memuat tujuh skenario, tanda keberhasilan, dan lembar hasil untuk juri. **Belum ada peserta atau hasil uji pengguna manusia.**

Validasi akhir: **86 tes backend pada 14 suite dan 66 tes frontend pada 26 file lulus**. Build frontend, backend Node, serta backend Vercel lulus. Tes tambahan memeriksa filter pekerjaan aktif tanpa teknisi, pemisahan data ringkasan berdasarkan kasus, kegagalan query ringkasan tanpa menjalankan ulang agent, pembatasan tampilan, error/retry antrean, navigasi `/tasks`, serta ringkasan frontend. Dua ketergantungan urutan tes diperbaiki: fixture LLM kini menyediakan teknisi senior sendiri, dan tes penugasan membuat akun uniknya sendiri alih-alih mengasumsikan bootstrap akan mengisi database yang sudah berakun. Perilaku autentikasi production tidak diubah.

Browser headless lokal memeriksa lebar **1440, 768, dan 380 px** dengan API fixture: antrean tampil, penugasan gagal lalu retry mempertahankan pilihan dan memperbarui antrean, ringkasan chat menampilkan hasil tersimpan, serta teknisi ditolak dari halaman supervisor. Tidak ditemukan overflow horizontal atau exception JavaScript pada alur tersebut; screenshot desktop/ponsel diperiksa. Uji browser ini memverifikasi tampilan/klien dengan data terkontrol. Pengujian backend memakai PGlite lokal dan inferensi ML proyek; ini tidak menggantikan uji production, kontensi PostgreSQL nyata, perangkat fisik, atau percobaan juri. Tidak ada dependency atau migrasi baru.

## Perubahan dan dampak

### Tindak lanjut: penugasan oleh supervisor

Supervisor kini dapat menugaskan atau mengganti teknisi pada pekerjaan aktif melalui menu Work order. Form menawarkan pilihan manual atau otomatis, menampilkan kebutuhan keahlian/senior serta alasan kandidat tidak tersedia. Kegagalan tetap tampil inline dan tidak melepas penugasan lama. Pemilihan otomatis tetap tersedia pada agent; fitur ini bukan perubahan menjadi persetujuan wajib untuk seluruh tindakan otomatis.

Validasi tambahan: enam tes backend memeriksa sesi/peran supervisor, input tidak sah, penugasan manual dan audit akun, form usang, penggantian gagal/berhasil, persyaratan senior/keahlian, pekerjaan ditutup, alasan ketiadaan teknisi, pilihan otomatis, serta dua request yang memperebutkan satu teknisi. Database tes menggunakan PGlite dan pool satu koneksi; hasil ini tidak mengukur kontensi pada PostgreSQL production. Tiga tes frontend memeriksa visibilitas berdasarkan peran, pilihan otomatis/manual, alasan kandidat, pesan gagal persisten, retry, serta snapshot penugasan saat penggantian.

Hasil akhir lokal: **60 tes frontend dan 82 tes backend lulus**. Pada percobaan penuh pertama, 68 tes backend lulus dan 14 tes integrasi terhenti karena layanan ML tidak terjangkau dari sandbox; 14 tes tersebut kemudian lulus saat dijalankan ulang dengan akses jaringan ke layanan ML proyek. Build frontend, backend Node, dan backend Vercel lulus. Tidak ada migrasi atau dependency baru. Kontrol browser tidak tersedia, sehingga tampilan aktual desktop/ponsel dan penggunaan fitur ini di production belum diverifikasi. Fitur penugasan ini belum di-push atau di-deploy pada saat laporan ditulis.

| Perbaikan | Sebelum | Sesudah dan dampak |
| --- | --- | --- |
| Risiko tindakan | Argumen LLM yang menyebut risiko rendah dapat melewati persetujuan | Tool mempertimbangkan kasus, rencana backend, dan ML terbaru. LLM tidak bisa memberi persetujuan sendiri. Kasus harus milik unit yang sama; pemeriksaan sensor/ML gagal menahan perbaikan. |
| Rencana persetujuan LLM | Status pending dapat tersimpan tanpa rencana yang bisa dijalankan | Diagnosis, probabilitas, risiko, sitasi, dan saran tersimpan. Supervisor memakai rantai eksekusi yang sama dengan policy. Persetujuan ulang ditolak. |
| Konteks chat | ID kasus tidak diteruskan; laporan unit yang sama dapat terpisah | Pertanyaan lanjutan mempertahankan kasus. Unit baru yang disebut eksplisit memindahkan konteks. Kasus sensor/policy dan WO aktif dipakai kembali; judul baru tidak menggandakan WO kasus yang sama. |
| Waktu dan kegagalan | Satu panggilan provider dapat menunggu 120 detik | Anggaran interaksi LLM 45 detik, retry memakai sisa waktu, dan tool baru memerlukan cadangan 12 detik. Progres tersimpan setiap tool; jawaban kosong/batas langkah menjadi kegagalan yang terlihat. |
| Memori foto | Array pesan dan byte gambar tumbuh sepanjang sesi | Maksimal 100 pesan dan tiga pratinjau foto terakhir di memori. Teks/nama foto tetap ada; foto gagal kirim tetap dapat dicoba ulang. Byte foto tidak masuk session storage. |

Jalur inspeksi sensor dan eskalasi senior tetap tersedia sebagai pemeriksaan awal, dengan keterangan bahwa perbaikan berisiko memerlukan persetujuan. Parameter inspeksi merupakan argumen internal backend, bukan field tool yang bisa diaktifkan LLM.

## Bukti skenario

Tes memakai PostgreSQL-compatible PGlite lokal terisolasi. Pada `llm-workflow.spec.ts`, respons Gemini dan analisis ML dibuat terkontrol; tool, transaksi kasus/WO, stok, penjadwalan, manual RAG, serta persetujuan memakai implementasi proyek.

| Skenario | Hasil yang diperiksa |
| --- | --- |
| Risiko tinggi dengan `risk=rendah`, `approved=true`, dan argumen inspeksi palsu | Belum ada WO sebelum persetujuan sah; rencana risiko tinggi tersimpan. |
| Teknisi mencoba approve, supervisor menyetujui, approve diulang | Teknisi ditolak, supervisor berhasil, hanya satu WO dibuat. |
| Pertanyaan alasan, stok, atau foto pada kasus pending/dieskalasi | Gemini menjawab lewat tool baca saja; tool mutasi ditolak dan rencana/status kasus dipertahankan. Pertanyaan stok tidak menghapus pertanyaan klarifikasi. |
| Diagnosis risiko sedang berkeyakinan tinggi | WO tersimpan dan teknisi terjadwal; pertanyaan berikutnya memakai kasus yang sama. |
| Percakapan baru untuk unit dengan WO aktif, judul WO berubah | Kasus dan WO aktif digunakan kembali; tidak ada WO tambahan. |
| Kasus sensor/policy telah menunggu persetujuan | Chat LLM mempertahankan keputusan dan kasus policy tersebut. |
| Laporan berpindah dari Pump-91 ke Pump-92 | Kasus berbeda; panggilan tool yang menunjuk unit lama ditahan. |
| Diagnosis berkeyakinan 60%, lalu eskalasi inspeksi | Meminta klarifikasi tanpa WO perbaikan; bila inspeksi senior dijadwalkan, status menjadi `dieskalasi`. |
| Deadline terlewati, respons kosong, loop tidak selesai | Kegagalan tercatat dan tindakan baru tidak dijalankan. |
| Monitor otomatis aktif dengan fixture diagnosis risiko sedang | Satu siklus monitor membuat kasus, WO, dan jadwal tanpa request chat/diagnosis; siklus berikutnya melewati WO aktif. |
| Empat foto dikirim | Tiga pratinjau terbaru tetap ada; pratinjau pertama dilepas tetapi laporannya tetap terbaca. |

## Pemeriksaan yang dijalankan

- Frontend: `npm.cmd test` — **57 tes lulus**.
- Backend: `npm.cmd test`, dengan `ML_URL` menunjuk layanan ML proyek — **76 tes lulus**, termasuk 14 tes integrasi aplikasi dan 10 tes alur agent/monitor.
- Build frontend: `npm.cmd run build` — lulus; peringatan ukuran chunk 3D masih ada.
- Build backend biasa dan Vercel diuji; build Vercel memakai `npm.cmd run build:vercel`.

Suite integrasi melakukan inferensi terhadap layanan ML proyek, termasuk profil sehat dan pendingin. Kasus policy tertentu memakai diagnosis fixture agar percabangan keputusan deterministik. Tes Gemini menggunakan respons terkontrol; hasil ini bukan klaim validasi Gemini live atau akurasi foto kerusakan.

Smoke terpisah dengan Gemini live mereproduksi urutan screenshot: kasus policy berstatus `dieskalasi`, pertanyaan “kenapa gitu?”, lalu “Stok seal kit pompa”. Pada database uji lokal, Gemini memberikan penjelasan, memanggil `check_inventory`, serta menyebut stok fixture; kasus tetap sama dan tidak ada work order baru. Ini satu smoke percakapan, bukan validasi menyeluruh seluruh tindakan Gemini atau foto kerusakan.

## Reproduksi (PowerShell)

```powershell
Set-Location C:\GTNIC-\backend
$env:ML_URL = 'https://manualmechanic-ml.vercel.app'
npm.cmd test
npm.cmd run build:vercel

Set-Location C:\GTNIC-\frontend
npm.cmd test
npm.cmd run build
```

Jangan memakai database production untuk fixture. Setup Jest membuat database lokal terisolasi secara otomatis.

## Batas yang masih berlaku

- Versi `7b11c9b` telah dideploy pada 8 November 2026. Login dua peran, overview/ML, serta chat alasan dan stok pada kasus production `C-0052` berhasil tanpa perubahan kasus atau WO baru. Rincian deployment ada di [panduan Vercel](VERCEL_WEB.md#redeploy-perbaikan-agent--8-november-2026). Persetujuan dan foto masih perlu pemeriksaan production tersendiri.
- Timer otonomi masih membutuhkan backend persisten. Konfigurasi Vercel tetap menonaktifkan simulator dan agent otomatis; tes monitor tidak menyatakan timer itu berjalan di production.
- Uji visual browser, heap ponsel, pytest ML, penggunaan oleh teknisi lapangan, dan benchmark produktivitas belum dilakukan pada putaran ini.
- Angka penghematan 14 jam/bulan tetap estimasi skenario. Video publik, surat keaslian, dan validasi bisnis tidak digantikan oleh tes kode.
