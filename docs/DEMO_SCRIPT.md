# Skrip video demo (target 4 menit)

Rekam layar dengan UI publik. Siapkan sebelum merekam: klik **Reset semua unit**, pastikan peran **Teknisi**, Agent otomatis **aktif**.

| Waktu | Aksi | Yang dikatakan |
|---|---|---|
| 0:00–0:25 | Tab Ringkasan, empat unit normal | Masalah: koordinasi maintenance lambat dan manual. ManualMechanic memantau sensor unit hidrolik dan bertindak sendiri dalam batas aman. Sebut tema Enterprise Productivity |
| 0:25–1:15 | Klik **Mulai skenario demo**. Tunggu Pump-02 berubah Waspada | Pump-02: efisiensi pendingin turun bertahap. Model ML mendeteksi, agent terpicu otomatis tanpa ada yang melapor |
| 1:15–2:00 | Tab Kasus, buka kasus Pump-02 | Tunjukkan jejak: baca sensor, cek validitas, anomali, klasifikasi, riwayat, manual bersitasi. Keyakinan tinggi dan risiko sedang, jadi agent langsung cek stok, buat work order, jadwalkan teknisi, kirim notifikasi |
| 2:00–2:50 | Kasus Pump-03 (kebocoran pompa berat, risiko tinggi). Ganti peran ke **Supervisor**, klik **Setujui dan jalankan** | Risiko tinggi: agent hanya merekomendasikan dan menunggu persetujuan. Guardrail ada di lapisan tool, jadi tetap berlaku walau memakai LLM |
| 2:50–3:20 | Tab Asisten, kirim "Unit 3 oli cepat panas dan tekanan sulit naik" | Laporan teknisi dikaitkan ke kasus Pump-03 yang sudah dibuka oleh sensor, bukan membuat kasus ganda |
| 3:20–3:45 | Di Ringkasan: **Matikan sensor getaran** pada Pump-04, tunggu, lalu **Analisis unit ini** | Sensor mati tidak dituduh sebagai kerusakan mesin; agent membuat tiket periksa sensor |
| 3:45–4:00 | Tab Work order, **Selesaikan** satu work order dengan akar masalah | Hasil ditutup masuk ke riwayat dan dipakai RAG di kasus berikutnya. Tutup dengan batasan jujur: data dari dataset UCI, estimasi dampak berupa asumsi |

Tips: untuk jalur "tanya balik", beri keluhan yang ambigu pada unit yang baru memasuki tahap awal gangguan; keputusan ini bergantung pada probabilitas model, jadi jangan menjanjikannya di naskah kecuali sudah dicoba pada model yang Anda pakai.
