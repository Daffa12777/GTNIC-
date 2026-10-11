# Panduan Troubleshooting Unit Tenaga Hidrolik (Pompa Hidrolik)

Dokumen internal ringkas yang ditulis sendiri untuk keperluan prototipe lomba. Isinya pengetahuan teknik umum tentang unit tenaga hidrolik; ambang dan langkah harus disesuaikan dengan manual pabrikan dan prosedur K3 perusahaan. Nama sensor mengikuti dataset UCI Condition Monitoring of Hydraulic Systems: PS = tekanan, EPS1 = daya motor, FS = debit, TS = suhu, VS1 = getaran, CE = efisiensi pendingin, CP = daya pendingin, SE = faktor efisiensi.

## 1.1 Kebocoran internal pompa
Gejala sensor: tekanan PS1 turun, debit FS1 turun, daya motor EPS1 naik, suhu TS1 naik, faktor efisiensi SE turun, getaran VS1 sedikit naik. Gejala fisik: pompa berisik, oli cepat panas, waktu siklus mesin memanjang.
Penyebab: keausan piston, pelat katup, atau permukaan kontak pompa; seal aus; oli terkontaminasi partikel yang mengikis celah internal.
Pemeriksaan: ukur aliran drain casing pompa dan bandingkan dengan batas pabrikan, cek kebersihan oli dan filter, bandingkan debit pada tekanan kerja dengan data pompa baru.
Tindakan: jadwalkan penggantian seal kit pompa atau overhaul pompa. Lakukan LOTO dan lepaskan tekanan sistem termasuk akumulator sebelum membuka pompa. Ganti filter oli dan periksa kontaminasi.
Spare part terkait: Seal kit pompa hidrolik, filter oli.
Risiko: sedang. Naik menjadi tinggi bila kebocoran berat karena pompa dapat macet dan merusak motor.

## 1.2 Katup proporsional lambat atau aus
Gejala sensor: fluktuasi tekanan PS1 membesar, tekanan sisi hilir turun, debit FS2 berubah, daya motor EPS1 sedikit naik. Gejala fisik: gerak aktuator tersendat atau terlambat, hentakan saat berpindah posisi.
Penyebab: spool kotor atau aus, kumparan (coil) melemah, sinyal kontrol terganggu, oli terkontaminasi.
Pemeriksaan: uji respons katup terhadap sinyal langkah, ukur tahanan dan arus kumparan, periksa kebersihan oli.
Tindakan: bersihkan atau ganti spool, ganti kumparan katup proporsional, periksa kabel dan konektor. Lakukan LOTO dan lepaskan tekanan sebelum membongkar katup.
Spare part terkait: Kumparan katup proporsional, filter oli.
Risiko: sedang. Tinggi bila respons mendekati gagal total karena gerak mesin menjadi tidak terkendali.

## 1.3 Pendingin oli tidak efisien
Gejala sensor: suhu TS1 sampai TS4 naik, efisiensi pendingin CE turun, daya pendingin CP turun, faktor efisiensi SE turun. Gejala fisik: oli panas, kipas atau aliran air pendingin lemah.
Penyebab: elemen pendingin kotor atau tersumbat, aliran media pendingin kurang, kipas bermasalah, kebocoran internal elemen.
Pemeriksaan: periksa aliran dan suhu media pendingin, kebersihan sirip atau pipa pendingin, kerja kipas.
Tindakan: bersihkan elemen pendingin, perbaiki aliran media pendingin, ganti elemen bila tersumbat parah. Oli yang terlalu panas mempercepat keausan pompa, jadi segera tangani.
Spare part terkait: Elemen pendingin oli.
Risiko: sedang. Tinggi bila efisiensi mendekati gagal total karena oli dapat melewati batas suhu dan merusak seal.

## 1.4 Tekanan akumulator turun
Gejala sensor: denyut tekanan PS1 membesar, tekanan sisi sistem turun, getaran VS1 sedikit naik. Gejala fisik: hentakan tekanan saat aktuator bergerak, pompa lebih sering bekerja.
Penyebab: tekanan pengisian awal (pre-charge) nitrogen berkurang, bladder atau diafragma bocor atau rusak.
Pemeriksaan: periksa pre-charge dengan alat pengisi, hanya setelah sisi hidrolik dilepaskan tekanannya, oleh teknisi yang berkompeten.
Tindakan: isi ulang nitrogen sesuai spesifikasi atau ganti bladder. Jangan pernah membuka akumulator bertekanan. Lakukan LOTO dan pastikan tekanan sisi oli nol.
Spare part terkait: Bladder akumulator, kit pengisi nitrogen.
Risiko: sedang. Tinggi bila pre-charge mendekati gagal total karena peredam tekanan hilang dan komponen lain menerima lonjakan.

## 1.5 Sensor bermasalah
Gejala sensor: nilai nol, nilai tetap (flatline), lonjakan tidak masuk akal, atau pembacaan hilang pada satu sensor sementara sensor lain tidak menunjukkan pola gangguan.
Penyebab: kabel putus, konektor longgar, sensor rusak, gangguan sinyal.
Pemeriksaan: periksa kabel dan konektor, bandingkan dengan pengukuran manual, uji sensor dengan nilai acuan.
Tindakan: jangan menyimpulkan kerusakan pompa dari satu sensor. Buat tiket pemeriksaan sensor dan verifikasi dengan alat ukur manual.
Spare part terkait: Sensor getaran VS1.
Risiko: rendah sampai sedang.
