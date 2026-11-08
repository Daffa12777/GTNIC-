# Panduan pengguna — ManualMechanic

Panduan ini menjelaskan website dengan dashboard 3D. Untuk instalasi dan konfigurasi, lihat [README](../README.md) dan [dokumentasi teknis](TECHNICAL.md).

## Masuk

Gunakan username dan password dari pengelola instalasi. Akun memiliki peran teknisi atau supervisor. Pada demo tanpa autentikasi, pemilih peran hanya memperagakan batas antarmuka; gunakan login sungguhan untuk pemakaian tim.

Login baru yang berhasil membuka dashboard, termasuk setelah logout dari Profil lalu memakai akun berbeda. Memuat ulang halaman saat sesi masih sah tetap mempertahankan tautan halaman yang sedang dibuka.

Sesi otomatis berakhir setelah **30 menit tanpa interaksi** atau **maksimal delapan jam sejak login**, termasuk saat masih aktif. Klik/sentuhan, pengetikan, dan gerakan roda scroll pada tab yang terlihat memperbarui aktivitas. Polling data serta animasi tidak membuat sesi terus hidup. Bila waktu habis, aplikasi meminta login kembali; simpan laporan pekerjaan secara berkala karena isian yang belum tersimpan dapat hilang.

Cookie mengikuti sesi browser. Menutup satu tab saja tidak menjamin langsung logout, dan pemulihan sesi browser dapat mengembalikan cookie. Untuk langsung mengakhiri akses, tetap gunakan **Profil → Logout**. Batas waktu backend tetap berlaku setelah browser/aplikasi ditutup. Ketika kebijakan ini pertama kali dipasang, pengguna dengan sesi tujuh hari dari versi lama perlu login ulang.

## Dashboard 3D

Halaman awal menampilkan seluruh unit yang dikirim backend. Tidak ada mesin yang dipilih secara otomatis.

1. Klik objek mesin atau label ID di atasnya untuk memilih unit. Titik pada label menunjukkan status.
2. Panel menampilkan nama, lokasi/model, status, dugaan ML, keyakinan, kasus terbuka, dan jumlah work order.
3. Gunakan **Buka kasus** jika kasus tersedia, **Analisis unit ini** jika belum ada kasus, atau **Lihat detail unit** untuk melihat data lebih lengkap.
4. Klik **Tutup** untuk menutup panel dan kembali melihat peta penuh.

Memilih unit memusatkan dan memperbesar peta. Gunakan `+` dan `−` untuk mengatur skala, lalu geser dengan mouse atau sentuhan ketika peta diperbesar. Pada skala awal, geser di ponsel tetap menggulir halaman. Tombol putar kiri/kanan mengubah arah peta 90°, sedangkan **Reset tampilan** mengembalikan sudut dan skala awal tanpa menutup panel unit. **Pilih dari daftar unit** menyediakan pilihan teks untuk keyboard atau bila memilih objek terasa sulit. Jika render gagal, daftar ini tetap dapat digunakan.

Garis warna di landasan membantu membedakan kategori lokasi Produksi, Fabrikasi, dan Gudang sesuai informasi unit. Susunannya tetap bukan denah sebenarnya.

Brand ManualMechanic di kiri atas mengembalikan pengguna ke dashboard. Tidak ada menu Tampilan 3D terpisah. Menu lainnya: Kasus, Work order, Inventaris, dan Asisten; avatar membuka Profil pada akun yang login.

### Membaca indikator

| Status | Arti |
| --- | --- |
| Normal | Analisis terbaru tidak memenuhi kondisi perhatian pada monitor |
| Waspada | Model/anomali memerlukan pemeriksaan; lampu kuning berdenyut |
| Kritis | Analisis menemukan flag kritis; lampu merah berdenyut |
| Sensor bermasalah | Validasi sensor gagal; kondisi mesin belum dapat disimpulkan dari sensor tersebut |
| ML tidak tersedia | Analisis tidak dapat dijalankan; jangan menganggap mesin normal atau rusak |
| Tidak ada data | Belum tersedia pembacaan untuk dinilai |

Indikator waspada/kritis berdenyut sebentar lalu tetap menyala; denyut berhenti ketika tab tidak aktif. Preferensi gerakan minimal perangkat mematikan denyut. Denah dan model masih ilustrasi. Lampu tidak menyatakan mesin fisik sedang berputar atau berhenti.

## Detail unit dan diagnosis

Detail unit membuka layar operasional dengan grafik sensor, komponen, langkah berikutnya, dan work order. Ringkasan armada dapat dibuka jika diperlukan; **Kembali ke peta** kembali ke dashboard. Garis putus-putus pada grafik menunjukkan nilai nominal sehat dari profil. Persentase perubahan grafik bukan persentase kerusakan mesin.

Gunakan **Analisis unit ini** untuk memulai diagnosis. Jika unit memiliki kasus terbuka, buka kasus tersebut untuk melanjutkan penanganan. Analisis prioritas dapat memproses beberapa unit yang perlu perhatian dan dapat membuat catatan/tindakan; ini bukan sekadar refresh visual.

Nilai keyakinan menunjukkan skor hasil model/aturan yang digunakan sistem. Nilai tinggi tidak menggantikan inspeksi lapangan atau persetujuan keselamatan perusahaan.

## Kasus

Daftar kasus mendukung pencarian, filter cepat, dan paginasi. Kasus yang menunggu persetujuan diurutkan lebih dulu. Buka kasus untuk meninjau umur kasus, status unit yang terakhir diterima, bukti diagnosis, kasus terkait, dan work order aktif.

- **Menunggu klarifikasi:** baca pertanyaan lalu jawab berdasarkan pengamatan lapangan. Jangan menebak kondisi yang belum diperiksa.
- **Menunggu persetujuan:** supervisor meninjau hipotesis, bukti dan rencana, lalu membuka konfirmasi sebelum menyetujui. Penolakan risiko tinggi memerlukan alasan.
- **Dieskalasi:** periksa work order terkait untuk mengetahui teknisi dan jadwal. Jika belum ada penanggung jawab, koordinasikan dengan supervisor.
- **Gagal:** periksa kegagalan layanan/operasi sebelum mengulangi tindakan.

Persetujuan dapat membuat atau menggunakan work order aktif, mengajukan pembelian jika stok kosong, mencoba penjadwalan teknisi, dan membuat notifikasi. Pratinjau tidak mencadangkan stok atau teknisi; hasil akhir tersedia pada jejak kasus. Status kasus lama dapat berbeda dari kondisi sensor terbaru pada peta.

## Work order

Supervisor memiliki menu **Tugas saya** (`/tasks`) untuk melihat persetujuan, pekerjaan aktif tanpa teknisi, dan kasus eskalasi. Antrean ini berlaku untuk tanggung jawab peran supervisor dalam tim. Setiap bagian menampilkan maksimal lima entri beserta jumlah total dan tautan ke daftar lengkap. Tombol **Tinjau keputusan** membuka kasus; **Tugaskan WO-…** membuka form penugasan pada halaman tersebut. Teknisi menggunakan daftar Work order dan filter teknisi.

Cari/filter pekerjaan berdasarkan data yang tersedia, termasuk unit, status, prioritas, dan teknisi. Tinjau judul, instruksi, part, jadwal, serta kasus terkait.

Untuk menugaskan atau mengganti teknisi, login sebagai **supervisor**:

1. Buka **Work order**, lalu klik **Tugaskan teknisi** atau **Ubah teknisi** pada pekerjaan aktif.
2. Pilih nama teknisi yang tersedia dan sesuai keahlian, atau **Pilih otomatis** untuk pekerjaan tanpa penanggung jawab. Pekerjaan berisiko tinggi dan inspeksi eskalasi memerlukan teknisi senior. Pilihan otomatis pada pekerjaan yang sudah ditugaskan mempertahankan teknisi saat ini.
3. Klik **Simpan penugasan**. Nama, status terjadwal, dan jadwal pekerjaan diperbarui setelah berhasil. Jadwal mengikuti aturan prioritas yang sudah digunakan agent; form ini tidak menyediakan kalender shift.

Teknisi yang sibuk, tidak tersedia, atau tidak memenuhi keahlian ditampilkan beserta alasannya. Jika penyimpanan gagal, pesan tetap terlihat dalam form dan penugasan lama tetap berlaku. Klik **Perbarui pilihan** jika penugasan atau ketersediaan berubah. Dropdown **Teknisi** pada bagian filter hanya menyaring daftar, bukan menugaskan pekerjaan.

Saat pekerjaan benar-benar selesai, isi akar masalah, tindakan, dan durasi. Penyelesaian memperbarui catatan pekerjaan/kasus serta riwayat; riwayat dapat ditemukan oleh pencarian berikutnya. Ini tidak otomatis melatih ulang model ML.

## Inventaris

Teknisi dapat membaca inventaris. Supervisor dapat membuka pengelolaan inventaris untuk membuat part dan menambah/mengoreksi stok.

Isi alasan perubahan stok secara jelas. Jika saldo sudah berubah sejak form dibuka, muat data terbaru sebelum mengulang. Jangan membuat transaksi baru hanya karena respons sebelumnya lambat; periksa riwayat terlebih dahulu.

Pengajuan pembelian dibuat oleh alur tool saat dibutuhkan. Aplikasi belum terintegrasi dengan pemesanan vendor atau ERP eksternal.

## Asisten dan mode agent

Pertanyaan stok teks dibaca langsung dari inventaris walaupun Mode LLM aktif, sehingga tidak menunggu provider untuk pencarian stok sederhana. Kasus percakapan tetap dipertahankan. Foto dan pertanyaan analisis/penjelasan lainnya tetap dapat membutuhkan layanan LLM. Riwayat jawaban lama tidak diperbarui otomatis setelah aplikasi diperbaiki; gunakan Percakapan baru untuk memulai sesi bersih bila diperlukan.

Jawaban yang terhubung ke kasus menampilkan **Hasil tercatat**: snapshot status kasus, maksimal sepuluh work order terkait, penugasan/jadwal, serta pengajuan part yang tersimpan. Snapshot dapat mencakup pekerjaan sebelum pesan terakhir; jangan menyimpulkan pekerjaan baru dibuat hanya karena muncul di blok ini. Buka **Periksa jejak kasus** untuk memeriksa bukti terkini. Snapshot tambahan hanya berada pada percakapan yang masih terbuka; setelah refresh, teks riwayat dan tautan kasus tetap tersedia. Bila pembacaan ringkasan gagal, jawaban chat tetap ditampilkan disertai pemberitahuan agar tindakan yang sudah berhasil tidak diulang.

Skenario pengujian dua peran tersedia di [panduan uji pengguna](USER_TEST.md).

Masukkan ID unit dan gejala yang jelas, misalnya: “Pump-02 oli panas dan respons aktuator melambat.” Asisten dapat menanyakan klarifikasi atau menghubungkan percakapan dengan kasus.

Buka **Pengaturan agent** di navbar untuk mengubah peran demo atau mode yang tersedia. **Mode LLM** mengubah cara Asisten menyusun jawaban/memilih tool dan membutuhkan Gemini yang terkonfigurasi. **Agent otomatis** adalah kontrol berbeda: monitor dapat memulai penanganan ketika pola perhatian ditemukan. Perubahan agent otomatis hanya untuk supervisor.

Riwayat/draft Asisten disimpan dalam sesi browser per username dan dibersihkan saat logout. Riwayat tidak disinkronkan antarperangkat.

### Mengirim gambar

1. Aktifkan **Mode LLM** di **Pengaturan agent**.
2. Klik **Tambah gambar**, lalu pilih satu JPG, PNG, atau WebP maksimal 2 MB.
3. Periksa pratinjau. Gunakan **Hapus gambar** untuk membatalkan lampiran, atau tambahkan pesan yang menyebut ID mesin dan bagian yang ingin diperiksa.
4. Klik **Kirim**. Gambar beserta pesan dikirim ke Gemini. Pesan tanpa teks memperoleh permintaan penjelasan bawaan.
5. Jika permintaan gagal, lampiran dan pesan tetap tersedia untuk dicoba ulang. Periksa hasil tindakan pada jejak kasus sebelum mengulang permintaan yang dapat membuat pekerjaan.

Gambar berfungsi sebagai bukti visual. Pemeriksaan fisik dan pembacaan sensor tetap diperlukan untuk memastikan kerusakan. Isi gambar tidak masuk ke riwayat sesi yang disimpan; setelah reload, yang tersisa adalah nama lampiran dan teks percakapan. Unggah ulang gambar untuk pemeriksaan visual berikutnya.

Tinjauan 8 November 2026 menemukan keterbatasan pada penyatuan kasus chat LLM serta rencana persetujuannya. Jika kasus LLM menunggu persetujuan tetapi tidak memiliki rencana, alur approve akan menolak. Rincian dan tindak lanjut ada di [laporan tinjauan](REVIEW_2026-11-08.md).

## Notifikasi dan profil

Lonceng menampilkan notifikasi operasional. Pada akun yang login, lonceng juga menampilkan persetujuan dan penanda dibaca berlaku untuk akun tersebut; daftar ini merupakan informasi tim, bukan kotak pesan pribadi teknisi. Pada mode demo notifikasi hanya dapat dilihat dan status dibaca tidak disimpan.

Avatar membuka Profil. Pengguna dapat memperbarui nama/email/username, mengganti password, dan logout. Role ditampilkan sebagai informasi, bukan diedit sendiri. Mengganti password mencabut sesi sehingga perlu login kembali. Penghapusan akun memerlukan konfirmasi password; supervisor aktif terakhir tidak dapat dihapus.

## Kesegaran data dan layanan

Perhatikan waktu pembaruan terakhir. **Perbarui data** mengambil overview terbaru; ini berbeda dari memicu diagnosis. Saat offline atau permintaan gagal, cache terakhir dapat tetap terlihat dengan pemberitahuan.

**Status layanan** membantu meninjau database, ML, dan Gemini. **Uji Gemini** mengirim satu permintaan dan memakai kuota API. Hasil terakhir berhasil tidak menjamin request berikutnya berhasil.

Jika model memakai data sintetis atau sensor memakai simulator, website menampilkan keterangannya. Jangan menganggap tampilan yang bergerak sebagai telemetri pabrik nyata.

## Demo dan penambahan unit

Kontrol simulasi tersedia di detail/operasional unit, dalam panel Mode demo, hanya bila instalasi mengizinkan dan pengguna supervisor. Mulai skenario memberi pola gangguan pada Pump-02/03. Reset mengembalikan simulasi, tetapi kasus serta work order tidak dihapus.

Pump-05 dan Pump-06 adalah tambahan demo. Pendaftaran dilakukan pengelola melalui CLI backend, bukan form website. Setelah backend memuat ulang daftar dan dashboard diperbarui, objek unit baru muncul otomatis. Untuk jenis mesin berbeda diperlukan pemeriksaan kesesuaian model/sensor, bukan hanya mengganti nama objek.

Jika peta atau diagnosis tidak tersedia, gunakan daftar unit, buka kasus yang ada, dan laporkan masalah beserta status layanan/waktu pembaruan kepada pengelola. Jangan membagikan password, cookie, atau isi `.env`.
