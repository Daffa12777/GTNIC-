# Interpretasi Sensor dan Kebijakan Agent

Dokumen internal tentang cara agent membaca data dan mengambil keputusan.

## 7.1 Sensor dan satuan
Dataset acuan memuat 17 sensor per siklus 60 detik: PS1 sampai PS6 tekanan (bar), EPS1 daya motor (W), FS1 dan FS2 debit (L/menit), TS1 sampai TS4 suhu (derajat C), VS1 getaran (mm/s), serta CE, CP, SE sebagai nilai turunan efisiensi pendingin, daya pendingin, dan faktor efisiensi. Agent memakai rata-rata dan simpangan baku tiap sensor pada satu siklus.

## 7.2 Kebijakan keputusan
Keyakinan diagnosis 80 persen atau lebih dan risiko bukan tinggi: agent menjalankan rantai tindakan otomatis (cek stok, work order, pembelian bila stok kosong, jadwal teknisi, notifikasi). Keyakinan 50 sampai 79 persen: agent bertanya balik ke teknisi atau meminta konfirmasi. Keyakinan di bawah 50 persen: eskalasi ke teknisi senior. Risiko tinggi: tidak ada tindakan tanpa persetujuan supervisor.

## 7.3 Risiko
Risiko ditentukan dari tingkat kerusakan komponen. Tingkat paling parah (mendekati gagal total atau kebocoran berat) adalah risiko tinggi. Tingkat menengah adalah risiko sedang. Tingkat awal adalah risiko rendah.

## 7.4 Sensor mencurigakan
Bila satu sensor mengirim nol atau tidak ada data sementara sensor lain normal, agent tidak menyimpulkan kerusakan mesin. Agent membuat tiket pemeriksaan sensor.
