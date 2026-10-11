# Dataset Publik untuk ManualMechanic

Prototype ini dilatih dan didemokan dengan **data simulasi** (`app/simulator.py`) karena data sensor pompa
dengan label empat jenis gangguan (bearing, impeller, kavitasi, overload) yang lengkap tidak tersedia terbuka.
Dataset publik di bawah dipakai sebagai **pelengkap validasi** dan sebagai rujukan bahwa pola yang disimulasikan
sesuai praktik di bidang predictive maintenance. Tautan diambil dari hasil pencarian dan rujukan makalah, tetapi tidak saya unduh atau buka satu per satu dari lingkungan build
(akses jaringan terbatas), jadi cek ulang sebelum dipakai. Beberapa situs (Kaggle) mewajibkan login untuk mengunduh.

| Dataset | Isi | Cocok untuk | Tautan |
|---|---|---|---|
| Pump Sensor Data (Kaggle) | Sekitar 52 sensor pompa air, label status NORMAL/RECOVERING/BROKEN | Uji deteksi anomali pada data sensor pompa nyata | https://www.kaggle.com/datasets/nphantawee/pump-sensor-data |
| CWRU Bearing Data Center | Getaran bearing sehat dan rusak (inner race, outer race, ball) pada beban berbeda | Validasi pola getaran bearing aus | https://engineering.case.edu/bearingdatacenter |
| CWRU, halaman unduh data | File .mat per kondisi | Unduhan langsung | https://engineering.case.edu/bearingdatacenter/download-data-file |
| NASA Bearing Dataset (Kaggle) | Run-to-failure bearing (data IMS) | Studi kemunculan gejala bertahap sebelum gagal | https://www.kaggle.com/datasets/vinayak123tyagi/bearing-dataset |
| NASA Prognostics Data Repository | Repositori resmi dataset prognostik NASA | Sumber primer NASA/IMS | https://www.nasa.gov/content/prognostics-center-of-excellence-data-set-repository |
| MFPT Bearing Fault Data | Data kesalahan bearing | Validasi tambahan | https://www.mfpt.org/fault-data-sets |
| Pump dataset IoT (MDPI Data, 2025) | Delapan file CSV getaran, suhu, tekanan fluida dari pompa | Data operasi normal pompa | DOI: https://doi.org/10.3390/data10060091 |

## Catatan penggunaan
- Roboflow berfokus pada dataset gambar (deteksi objek), jadi tidak relevan untuk sensor deret waktu pada proyek ini.
- Dataset di atas tidak memiliki skema yang sama dengan lima sensor di aplikasi (getaran, suhu bearing, tekanan, arus, debit).
  Jika ingin melatih ulang dengan data tersebut, petakan kolom ke lima sensor itu, bentuk jendela 30 pembacaan, lalu gunakan
  fungsi `ml.window_features` dan `ml.train` sebagai acuan.
- Cantumkan sumber dataset dan sifat data simulasi dengan jujur di proposal (bagian Batasan Sistem).
