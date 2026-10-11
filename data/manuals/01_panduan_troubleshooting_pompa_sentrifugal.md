# Panduan Troubleshooting Pompa Sentrifugal

Dokumen referensi internal untuk prototype ManualMechanic. Ringkasan praktik umum perawatan pompa sentrifugal, ditulis sendiri oleh tim (bukan salinan manual vendor). Ganti atau tambahkan manual vendor resmi (PDF) ke folder data/manuals untuk penggunaan nyata.

## 1.1 Bearing aus atau kurang pelumas
Gejala sensor: getaran naik bertahap, suhu bearing naik bersamaan, tekanan dan debit relatif stabil, arus motor hampir tidak berubah.
Gejala fisik: suara menggeram atau gemuruh dari rumah bearing, rumah bearing terasa lebih panas dari biasanya.
Penyebab umum: pelumas habis, kurang, atau terkontaminasi; interval pelumasan terlewat; poros tidak lurus; bearing sudah melewati umur pakai; pelumas berlebihan yang membuat suhu naik.
Pemeriksaan: periksa kondisi dan jumlah grease, ukur getaran pada rumah bearing sisi penggerak dan sisi bebas, periksa kelurusan kopling, dengarkan suara bearing.
Tindakan: isi ulang atau ganti grease sesuai spesifikasi; bila getaran dan suhu tetap tinggi, jadwalkan penggantian bearing dan cek kelurusan poros. Spare part terkait: Bearing 6309, Grease NLGI 2, Mechanical seal bila bocor.
Risiko: bearing yang dibiarkan dapat macet dan merusak poros. Jika suhu bearing mencapai batas kritis atau getaran sangat tinggi, hentikan pompa melalui prosedur resmi dan persetujuan supervisor.

## 1.2 Impeller aus atau tersumbat
Gejala sensor: tekanan discharge turun, debit turun, arus motor naik, getaran sedikit naik.
Gejala fisik: aliran berkurang, katup keluaran terbuka tetapi tekanan rendah.
Penyebab umum: kotoran atau partikel tersangkut di impeller, korosi atau erosi sudu, strainer rusak sehingga kotoran masuk, celah wear ring terlalu besar.
Pemeriksaan: periksa strainer dan saluran hisap, bandingkan kurva pompa dengan kondisi aktual, inspeksi impeller saat pompa dibongkar.
Tindakan: bersihkan impeller dan strainer; ganti impeller bila sudu aus atau retak; ganti wear ring bila celah berlebih. Spare part terkait: Impeller, Strainer sisi hisap, Mechanical seal.
Risiko: sedang. Pompa tetap berjalan tetapi efisiensi turun dan motor bekerja lebih berat.

## 1.3 Kavitasi
Gejala sensor: getaran berfluktuasi acak, tekanan discharge tidak stabil, debit turun dan berfluktuasi, arus motor berfluktuasi.
Gejala fisik: suara berderak seperti kerikil atau kelereng di dalam pompa, getaran terasa tidak teratur.
Penyebab umum: tekanan hisap terlalu rendah (NPSH tersedia kurang dari NPSH dibutuhkan), strainer atau saluran hisap tersumbat sebagian, katup hisap tidak terbuka penuh, level tangki hisap rendah, suhu fluida terlalu tinggi, pipa hisap terlalu panjang atau banyak tikungan.
Pemeriksaan: cek level tangki hisap, kondisi strainer, posisi katup hisap, suhu fluida, dan tekanan sisi hisap.
Tindakan: buka katup hisap penuh, bersihkan strainer, naikkan level hisap, turunkan suhu fluida bila mungkin. Hindari mengatur debit dengan katup sisi hisap. Spare part terkait: Strainer sisi hisap.
Risiko: sedang. Kavitasi berkepanjangan mengikis impeller dan merusak seal serta bearing.

## 1.4 Overload motor
Gejala sensor: arus motor naik jauh di atas nominal, suhu motor dan bearing naik, getaran naik sedikit.
Gejala fisik: motor panas, kemungkinan trip overload, bau terbakar pada kasus parah.
Penyebab umum: beban hidrolik berlebih, viskositas atau massa jenis fluida lebih tinggi dari desain, tegangan suplai tidak stabil atau turun, bearing atau seal menahan putaran, impeller bergesekan dengan rumah pompa.
Pemeriksaan: ukur tegangan dan arus tiap fasa, bandingkan dengan pelat nama motor, periksa setelan overload relay, periksa beban proses dan kondisi mekanis.
Tindakan: kurangi beban proses, perbaiki sumber tegangan, setel ulang atau ganti overload relay sesuai spesifikasi oleh teknisi listrik berwenang. Spare part terkait: Overload relay.
Risiko: tinggi bila arus dan suhu mendekati batas. Keputusan menghentikan pompa harus disetujui supervisor dan mengikuti prosedur LOTO.

## 1.5 Sensor bermasalah
Bila satu sensor menunjukkan nilai nol, tetap, atau tidak masuk akal sementara sensor lain normal, curigai sensor atau kabel. Jangan menyimpulkan kerusakan pompa dari satu sensor yang mencurigakan. Buat tiket pemeriksaan sensor dan verifikasi dengan pengukuran manual.
