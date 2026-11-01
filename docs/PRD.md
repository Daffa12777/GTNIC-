# PRD — ManualMechanic

Versi dokumen: 1.0. Tanggal: 1 November 2026. Status: spesifikasi berbasis implementasi checkout saat dokumentasi disusun, termasuk perubahan lokal yang belum di-commit.

## Ringkasan produk

ManualMechanic membantu teknisi dan supervisor maintenance memantau unit tenaga hidrolik dan menindaklanjuti dugaan gangguan. Dashboard menampilkan peta 3D; informasi unit muncul setelah mesin dipilih. Analisis sensor, manual perawatan, kasus, inventaris, serta work order saling terhubung melalui backend.

Produk merupakan prototipe demo untuk GTNIC. Registrasi enam unit tidak berarti enam mesin fisik telah terhubung. Data sensor berasal dari simulator dan model dapat memakai data UCI atau sintetis sesuai artefaknya.

## Masalah dan hipotesis nilai

Tim maintenance perlu menggabungkan data sensor, pengetahuan manual, ketersediaan suku cadang, dan keputusan penugasan. Perpindahan antar sumber dapat memperlambat penanganan dan menyulitkan teknisi memahami langkah berikutnya.

Hipotesis produk: peta kondisi yang interaktif serta alur kasus yang terintegrasi dapat mengurangi waktu pencarian informasi dan pekerjaan administratif. Dampak terhadap downtime, biaya, dan produktivitas belum diukur pada pengguna atau pabrik nyata.

## Pengguna dan tanggung jawab

| Pengguna | Kebutuhan utama | Hak operasional |
| --- | --- | --- |
| Teknisi | Memeriksa unit, melaporkan gejala, menjawab klarifikasi, menyelesaikan pekerjaan | Membaca kondisi dan inventaris, memulai diagnosis, mengisi hasil work order |
| Supervisor | Menilai rekomendasi dan mengelola resource | Persetujuan/penolakan kasus, kelola stok, agent otomatis, kontrol demo yang diizinkan |
| Pengelola instalasi | Menyiapkan data, akun, model, dan layanan | CLI/database/deployment; bukan peran UI terpisah |

Dalam mode autentikasi, peran berasal dari akun backend. Pemilih peran pada demo lokal bukan autentikasi pengguna.

## Tujuan

1. Menjadikan kondisi unit mudah dikenali melalui dashboard 3D.
2. Membuka informasi relevan sesuai mesin yang dipilih, tanpa memenuhi halaman awal dengan tabel.
3. Menghubungkan hasil diagnosis dengan kasus dan tindakan yang dapat ditinjau.
4. Membatasi tindakan berisiko melalui persetujuan manusia dan validasi backend.
5. Menampilkan kegagalan sensor/ML serta asal data secara jujur.

## Ruang lingkup saat ini

| Area | Tersedia |
| --- | --- |
| Mesin | Unit tenaga hidrolik dengan komponen pompa, katup, pendingin, akumulator |
| Data master demo | Enam unit, inventaris, teknisi, dan riwayat awal |
| Dashboard | Peta 3D, pemilihan mesin, zoom/reset, panel kontekstual, pilihan unit berbasis teks |
| Detail | Sensor, kondisi komponen, tindakan berikutnya, work order, kontrol demo sesuai izin |
| Agent | Policy; Gemini function calling opsional; jejak langkah dan sitasi |
| Operasional | Kasus, persetujuan, work order, inventaris, pembelian melalui tool, notifikasi |
| Akun | Login/logout, refresh sesi, profil, ubah password, hapus akun sesuai batasan |

Di luar ruang lingkup: kontrol PLC/aktuator, sensor fisik, prediksi sisa umur mesin, posisi teknisi live, peta multi-site, denah akurat, penjadwalan berbasis kalender lengkap, ERP eksternal, unggah aset melalui UI, dan registrasi mesin umum melalui UI/API.

## Alur utama

1. Pengguna login dan membuka dashboard `/`.
2. Peta menampilkan seluruh unit dari backend tanpa memilih unit otomatis.
3. Pengguna memilih mesin melalui objek 3D atau daftar alternatif.
4. Panel menampilkan identitas, status, dugaan model, keyakinan, kasus, dan jumlah work order.
5. Pengguna membuka kasus atau detail unit untuk meninjau bukti dan menjalankan diagnosis.
6. Agent mengolah data sensor, mencari manual/riwayat, lalu menindaklanjuti berdasarkan keyakinan dan risiko.
7. Kasus dapat menunggu klarifikasi atau persetujuan; tindakan terpilih menghasilkan pekerjaan dan pencatatan.
8. Teknisi menyelesaikan work order dengan hasil lapangan; riwayat dapat dipakai kembali dalam RAG.

## Kebutuhan fungsional

| ID | Kebutuhan | Kriteria penerimaan |
| --- | --- | --- |
| FR-01 | Dashboard utama berupa peta 3D | `/` menampilkan peta; menu Tampilan 3D tidak muncul di navbar |
| FR-02 | Informasi hanya setelah unit dipilih | Tanpa pilihan tidak ada panel unit; klik membuka panel; Tutup mengembalikan peta penuh |
| FR-03 | Daftar objek berasal dari backend | Setiap ID di `overview.pumps` memiliki objek/pilihan terkait; jumlah tidak dikunci empat atau enam |
| FR-04 | Visual mengikuti status | Normal hijau; waspada kuning; kritis merah; sensor/ML/data tidak tersedia netral pada indikator 3D |
| FR-05 | Animasi menyampaikan perhatian | Indikator waspada/kritis berdenyut; preferensi reduced motion mematikan denyut |
| FR-06 | Gangguan render tidak menutup operasional | Pesan kegagalan dan daftar unit tetap tersedia jika model/WebGL gagal |
| FR-07 | Informasi detail dapat diakses | Panel membuka kasus yang benar atau `/units/:id` dengan detail unit yang benar |
| FR-08 | Diagnosis terhubung ke kasus | Analisis unit membuat/mengambil kasus; hasil, alasan, dan sitasi dapat ditinjau |
| FR-09 | Klarifikasi dan persetujuan | Kasus yang menunggu memiliki tindakan sesuai status; persetujuan/penolakan supervisor diperiksa backend |
| FR-10 | Tindakan aman diulang | Constraint dan transaksi mencegah duplikasi tindakan aktif sesuai aturan database |
| FR-11 | Pekerjaan terdokumentasi | Penyelesaian WO mencatat akar masalah, tindakan, dan durasi; data terkait diperbarui dalam transaksi |
| FR-12 | Inventaris terkendali | Supervisor dapat membuat part/mutasi stok; stok negatif, konflik saldo, dan pengulangan operasi ditangani |
| FR-13 | Pencarian data operasional | Kasus dan WO mendukung query/filter serta paginasi server |
| FR-14 | Sesi dan profil | Login, refresh, logout, pembaruan profil/password, dan batasan hapus akun tersedia |
| FR-15 | Asal dan kesegaran data jelas | Mode simulasi/sintetis, pembaruan terakhir, offline, dan kegagalan layanan diinformasikan |
| FR-16 | Penambahan dua unit demo | CLI menambah Pump-05/06 secara idempoten tanpa menimpa record lama; restart memuat unit ke simulator |

## Aturan keputusan dan keselamatan

Status pada peta berasal dari monitor backend, bukan keputusan yang dihitung ulang di browser.

| Kondisi | Perlakuan |
| --- | --- |
| Tidak ada pembacaan | Status `tidak ada data` |
| Validasi sensor gagal | Status `sensor`; jalur pemeriksaan sensor |
| Inferensi gagal | Status `ml_error`; tidak dinyatakan mesin rusak |
| Flag komponen kritis | Status `kritis` |
| Gangguan berkeyakinan cukup/anomali kuat | Status `waspada` sesuai aturan monitor |
| Keyakinan agent tinggi dan risiko tidak tinggi | Rantai tindakan otomatis sesuai policy |
| Keyakinan menengah | Klarifikasi dan/atau konfirmasi manusia |
| Keyakinan rendah atau gangguan majemuk | Eskalasi ke senior |
| Risiko tinggi | Persetujuan sebelum tindakan berisiko; guardrail berlaku juga pada tool |

Ambang policy saat ini `CONF_ACT=0.8` dan `CONF_CONFIRM=0.5`; pemeriksaan normal, sensor, majemuk, dan risiko membuat alurnya lebih kaya daripada satu tabel ambang sederhana. Sumber aturan: `backend/src/agent/agent.service.ts`, `backend/src/monitor/monitor.service.ts`, dan `backend/src/tools/`.

Warna dan animasi tidak menyatakan motor benar-benar berputar atau berhenti. Status kritis adalah hasil analisis yang perlu diverifikasi, bukan konfirmasi kerusakan fisik.

## Kebutuhan nonfungsional

- **Aksesibilitas:** pilihan unit berbasis tombol, label kontrol, fokus keyboard bawaan browser, reduced motion, dan pesan kegagalan.
- **Responsif:** peta serta panel dapat digunakan di desktop dan ponsel; panel menyusun ulang pada layar sempit.
- **Performa:** aset GLB dimuat sesuai kebutuhan, DPR dibatasi, render berjalan saat perlu kecuali animasi perhatian aktif. Belum ada target FPS terukur pada perangkat pengguna.
- **Konsistensi:** panel dan peta menggunakan data overview yang sama; hasil kasus lama dapat berbeda dari kondisi sensor terbaru.
- **Ketahanan:** data cache dapat tetap terlihat saat offline/error, dengan informasi kesegaran. Mutasi tidak dikirim otomatis saat offline.
- **Keamanan:** cookie HttpOnly, sesi dapat dicabut, role backend, validasi input, batas request, rate limiting database, dan HTTPS pada deployment publik.
- **Auditabilitas:** jejak agent, riwayat stok, hasil pekerjaan, dan notifikasi tersimpan sesuai implementasi.

## Ukuran keberhasilan yang perlu dikumpulkan

Metrik berikut adalah rencana evaluasi, bukan hasil yang sudah dicapai:

| Metrik | Cara mengukur |
| --- | --- |
| Waktu menemukan unit prioritas | Uji tugas pengguna dari dashboard ke unit yang tepat |
| Waktu mencapai keputusan | Durasi dari kasus dibuat sampai keputusan supervisor/teknisi |
| Keberhasilan tugas | Proporsi tugas buka mesin, jawab kasus, dan selesaikan WO yang selesai tanpa bantuan |
| Kesesuaian diagnosis | Bandingkan prediksi dengan label independen/hasil inspeksi nyata |
| Keamanan alur | Pastikan tindakan berisiko tidak berjalan tanpa persetujuan dan request ulang tidak menggandakan pekerjaan |
| Performa 3D | Catat waktu muat, FPS, penggunaan memori, dan kegagalan WebGL per perangkat |

## Rencana verifikasi dan batas bukti

Uji frontend memeriksa pemilihan/penutupan panel, perubahan status, navigasi, sesi, cache, dan form. Tes backend memeriksa operasi lewat Prisma pada PGlite terisolasi; suite integrasi memerlukan layanan ML. Uji browser dengan respons API terkontrol memeriksa tampilan dan interaksi, tetapi tidak menggantikan uji login pengguna dan layanan produksi.

Laporan lama di `docs/TEST_REPORT_2026-11-01.md` adalah snapshot pada waktunya. Jumlah tes dan hasil harus diperbarui dari eksekusi nyata, bukan diperlakukan sebagai jaminan permanen.

## Pengembangan berikutnya

Prioritas setelah prototipe: pengujian pengguna untuk dashboard, denah/model yang sesuai fasilitas, pengukuran performa perangkat, administrasi mesin dengan validasi tipe/fitur sensor, serta pipeline sensor yang berjalan independen dari proses web. Integrasi fisik dan perluasan jenis mesin memerlukan data serta validasi model baru.

Keputusan yang masih terbuka: denah sebenarnya, SLA pembaruan, spesifikasi perangkat minimum, kebijakan retensi data, target akurasi lapangan, dan lisensi kode. Tidak ada tanggal pengiriman atau klaim kesiapan produksi yang ditetapkan oleh PRD ini.
