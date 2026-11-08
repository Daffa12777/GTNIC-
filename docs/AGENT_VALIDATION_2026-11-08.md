# Perbaikan dan validasi agent — 8 November 2026

Laporan ini menjelaskan perubahan setelah tinjauan awal. Perubahan diuji pada checkout lokal; push, merge, dan deployment bukan bagian dari hasil verifikasi ini. Google Docs dan PDF proposal telah diselaraskan dengan bukti ini, dengan keterangan bahwa perbaikan belum diverifikasi pada deployment publik.

Acuan kode yang divalidasi: `8e11389` beserta rangkaian commit perbaikannya.

## Perubahan dan dampak

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
| Foto tambahan saat kasus menunggu keputusan | Sistem menyatakan foto belum dianalisis; rencana pending tidak ditimpa. |
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
- Backend: `npm.cmd test`, dengan `ML_URL` menunjuk layanan ML proyek — **74 tes lulus**, termasuk 14 tes integrasi aplikasi dan 9 tes alur agent/monitor.
- Build frontend: `npm.cmd run build` — lulus; peringatan ukuran chunk 3D masih ada.
- Build backend biasa dan Vercel diuji; build Vercel memakai `npm.cmd run build:vercel`.

Suite integrasi melakukan inferensi terhadap layanan ML proyek, termasuk profil sehat dan pendingin. Kasus policy tertentu memakai diagnosis fixture agar percabangan keputusan deterministik. Tes Gemini menggunakan respons terkontrol; hasil ini bukan klaim validasi Gemini live atau akurasi foto kerusakan.

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

- Production belum diverifikasi dengan versi perbaikan ini. Setelah deploy, periksa login dua peran, chat unit/foto, kasus pending, persetujuan, dan hasil WO pada data demo terkontrol.
- Timer otonomi masih membutuhkan backend persisten. Konfigurasi Vercel tetap menonaktifkan simulator dan agent otomatis; tes monitor tidak menyatakan timer itu berjalan di production.
- Uji visual browser, heap ponsel, pytest ML, penggunaan oleh teknisi lapangan, dan benchmark produktivitas belum dilakukan pada putaran ini.
- Angka penghematan 14 jam/bulan tetap estimasi skenario. Video publik, surat keaslian, dan validasi bisnis tidak digantikan oleh tes kode.
