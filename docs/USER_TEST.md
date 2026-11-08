# Uji dua peran — ManualMechanic

Dokumen ini adalah panduan uji untuk juri/penguji. **Belum ada hasil uji pengguna nyata.** Tes otomatis dan pemeriksaan browser oleh pengembang dicatat terpisah dalam laporan validasi.

## Persiapan

- Gunakan dua sesi browser terpisah: satu akun supervisor dan satu teknisi. Akun demo tersedia pada README; pastikan mengakses versi deployment yang memuat fitur terbaru.
- Catat commit/deployment, perangkat, lebar layar, waktu, serta mode policy/LLM. Untuk chat bergambar, aktifkan Mode LLM.
- Gunakan data demonstrasi. Persetujuan, penugasan, dan penyelesaian pekerjaan mengubah data tim; catat ID kasus dan pekerjaan yang dipakai. Jangan menutup pekerjaan lapangan sungguhan untuk keperluan uji.
- Siapkan satu kasus menunggu persetujuan, satu kasus eskalasi, dan satu pekerjaan aktif tanpa teknisi. Kondisi data dapat berbeda antarsesi; bila antrean kosong, catat sebagai prasyarat belum tersedia.
- Penguji bekerja tanpa diberi urutan klik oleh pendamping terlebih dahulu. Catat saat bantuan diperlukan. Ulangi tugas utama pada ponsel sekitar 380 px.

## Skenario

| ID | Peran dan tujuan | Tanda tugas berhasil | Bukti yang dicatat |
| --- | --- | --- | --- |
| S1 | Supervisor mencari pekerjaan yang perlu ditindaklanjuti dari Tugas saya | Menemukan antrean persetujuan, pekerjaan tanpa teknisi, serta eskalasi; memahami bahwa antrean mewakili tanggung jawab peran dalam tim | Waktu menemukan tugas; ID kasus/WO; bagian yang membingungkan |
| S2 | Supervisor meninjau keputusan agent | Membuka kasus, membaca bukti/risiko, lalu menemukan pilihan setuju/tolak. Keputusan hanya diberikan bila bukti cukup | ID kasus; alasan keputusan; status sesudahnya |
| S3 | Supervisor menugaskan teknisi | Memilih teknisi sesuai keahlian/senior dan menyimpan; nama/jadwal tampil serta WO keluar dari antrean tanpa teknisi setelah refresh | ID WO; nama teknisi; status; waktu penyelesaian tugas |
| S4 | Supervisor menghadapi kandidat tidak tersedia | Menemukan alasan kandidat tidak dapat dipilih. Jika ketersediaan berubah saat menyimpan, memahami pesan gagal dan dapat memperbarui pilihan; penugasan lama tetap berlaku | Pesan yang terlihat; pilihan sesudah gagal; bantuan yang diperlukan |
| T1 | Teknisi mencari pekerjaan tim dan memahami batas peran | Menemukan WO/teknisi/jadwal melalui Work order; tidak menemukan tombol penugasan. Membuka `/tasks` menampilkan pemberitahuan khusus supervisor | Screenshot batas akses; pencarian/filter yang digunakan |
| T2 | Teknisi melaporkan gejala dan memeriksa hasil chat | Mengirim keluhan ber-ID unit; membedakan jawaban agent dengan blok Hasil tercatat; memeriksa WO, penugasan, dan jejak kasus | Teks pertanyaan; ID kasus/WO; kecocokan ringkasan dengan data tersimpan |
| T3 | Teknisi mengajukan pertanyaan lanjutan | Bertanya alasan keputusan atau stok; jawaban relevan, tetap terkait kasus yang benar, dan tidak mengaku membuat tindakan baru hanya karena membaca snapshot | Pesan sebelum/sesudah; ID kasus; jumlah WO sebelum/sesudah |

S4 dengan kegagalan saat penyimpanan memerlukan dua penguji yang mengubah ketersediaan secara bersamaan; jika tidak dilakukan, tandai **belum diuji**, bukan lulus. Aplikasi saat ini menyediakan antrean peran supervisor, bukan pemetaan akun teknisi ke daftar penugasan pribadi. T1 menggunakan daftar pekerjaan tim dan filter teknisi.

## Lembar hasil

Gunakan kode peserta, jangan menyimpan password. Status tugas: berhasil tanpa bantuan / berhasil dengan bantuan / gagal / belum diuji. Waktu diukur dari membaca tujuan sampai tanda berhasil tercapai.

| Peserta | Peran | Perangkat / deployment | ID tugas | Status | Waktu | Bantuan / kesalahan | Catatan pengguna |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Belum diisi | | | | Belum diuji | | | |

Setelah mencoba, minta penilaian 1–5 untuk kemudahan menemukan tugas, kejelasan status/alasan gagal, dan kemampuan membedakan rekomendasi agent dengan tindakan tersimpan. Tanyakan: “Bagian mana yang membuat Anda ragu?” dan “Apa yang Anda kira akan terjadi setelah menekan tombol itu?”

Laporkan jumlah peserta, peran/perangkat, keberhasilan per tugas, waktu aktual, serta masalah yang ditemukan. Jangan mengubah tes otomatis menjadi klaim validasi lapangan, peningkatan produktivitas, atau persentase kepuasan sebelum hasil manusia terkumpul.
