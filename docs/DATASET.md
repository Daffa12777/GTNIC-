# Dataset

## Dataset yang dipakai: UCI Condition Monitoring of Hydraulic Systems

- Halaman: https://archive.ics.uci.edu/dataset/447/condition+monitoring+of+hydraulic+systems
- Unduhan langsung (73 MB): https://archive.ics.uci.edu/static/public/447/condition+monitoring+of+hydraulic+systems.zip
- Sitasi: Helwig, N., Pignanelli, E., & Schütze, A. (2015). Condition monitoring of hydraulic systems [Dataset]. UCI Machine Learning Repository. https://doi.org/10.24432/C5CW21
- Lisensi: Creative Commons Attribution 4.0 (CC BY 4.0). Boleh dipakai dengan mencantumkan sumber.
- Isi: 2.205 siklus beban 60 detik dari test rig hidrolik (sirkuit utama dengan pompa, sirkuit pendingin/filter). Sensor: PS1–PS6 tekanan (100 Hz), EPS1 daya motor (100 Hz), FS1–FS2 debit (10 Hz), TS1–TS4 suhu (1 Hz), VS1 getaran (1 Hz), CE/CP/SE nilai turunan (1 Hz).
- Label (`profile.txt`, satu baris per siklus): pendingin (100 / 20 / 3 persen), katup (100 / 90 / 80 / 73 persen), kebocoran internal pompa (0 / 1 / 2), tekanan akumulator (130 / 115 / 100 / 90 bar), dan flag kestabilan.

### Mengapa dataset ini
- Terbuka tanpa akun (tidak perlu login Kaggle) dan berlisensi jelas.
- Sensor beragam (tekanan, daya, debit, suhu, getaran) dan label tingkat kerusakan bertahap per komponen, cocok untuk agent yang menimbang keyakinan dan risiko.
- Mencakup pompa (kebocoran internal), jadi relevan dengan tema perawatan pompa industri.

### Batasan yang harus disampaikan jujur
- Ini test rig hidrolik, bukan pompa sentrifugal lapangan. Proyek ini memposisikan target sebagai unit tenaga hidrolik (hydraulic power unit) dengan pompa.
- Skenario simulasi di UI memutar ulang siklus nyata dari split uji dataset, tetapi urutan gangguan "memburuk bertahap" dirangkai oleh simulator, bukan rekaman degradasi nyata.
- Angka akurasi berlaku untuk dataset ini pada split acak 75/25 dan tidak menjamin performa di pabrik lain. Siklus pada kondisi yang sama saling mirip sehingga split acak dapat menghasilkan angka optimistis.

## Cara melatih

```powershell
cd ml
pip install -r requirements.txt
python train.py --download      # unduh dataset UCI asli lalu latih (butuh internet)
# atau, jika sudah punya folder hasil ekstrak zip:
python train.py --data data\uci
```

Keluaran: `ml/artifacts/model.joblib`, `metrics.json`, `profiles.json`. Skrip otomatis menyalin `profiles.json` dan `metrics.json` ke `backend/assets/`. Muat ulang layanan ML dan backend setelah training.

`python train.py --demo` melatih dari data sintetis berformat UCI (`make_demo_data.py`) hanya agar proyek dapat dijalankan dan diuji tanpa unduhan. UI menampilkan peringatan selama model berasal dari data demo. Metrik dari data demo (hampir sempurna) bukan bukti kinerja.

## Model
- Isolation Forest (scikit-learn), dilatih hanya pada siklus sehat, untuk deteksi anomali. Ambang = persentil ke-2 skor siklus sehat.
- Random Forest per komponen (pendingin, katup, pompa, akumulator) untuk tingkat kerusakan dan probabilitasnya. Fitur: rata-rata dan simpangan baku tiap sensor per siklus (34 fitur).
- Agent menggabungkan keluaran per komponen menjadi hipotesis: normal atau salah satu komponen bermasalah, lalu menimbang keluhan teknisi, riwayat, dan manual (RAG).

## Dataset lain yang dipertimbangkan
| Dataset | Catatan |
|---|---|
| Kaggle "Pump Sensor Data" (nphantawee) | Banyak dipakai untuk prediksi kegagalan pompa, tetapi sensor anonim (sensor_00..51) dan butuh akun Kaggle. |
| NASA IMS Bearing (Prognostics Data Repository) | Run-to-failure bearing, getaran saja. Cocok untuk prognosis RUL, bukan klasifikasi multi-komponen. |
| Paderborn University Bearing | Bearing dengan arus motor dan getaran; mengunduh dari server KAt DataCenter, formatnya MATLAB. |
| Data pompa sentrifugal (4TU, Zenodo, Mendeley) | Sinyal mentah frekuensi tinggi untuk satu pompa; butuh ekstraksi fitur dan tidak berlabel tingkat kerusakan bertahap. |

Dataset-dataset ini dapat ditambahkan dengan menulis pemuat baru di `ml/data.py` yang menghasilkan matriks fitur dan label per komponen yang sama.
