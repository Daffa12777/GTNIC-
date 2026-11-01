# ManualMechanic: AI Agent Diagnosis & Tindak Lanjut Perawatan Pompa Industri

> Arsip konsep awal. Dokumen ini memuat rancangan pompa sentrifugal, jumlah unit, dan teknologi yang tidak semuanya sesuai implementasi web sekarang. Untuk spesifikasi terkini gunakan [PRD](PRD.md), [dokumentasi teknis](TECHNICAL.md), dan [README](../README.md). Jangan memakai target/manfaat atau jadwal di arsip ini sebagai hasil yang telah terverifikasi.

> Proyek untuk **GTNIC 2026 (Garda Tech National Innovation Competition)**, kategori **AI Agent Development**
> Sub-tema: *Building Intelligent AI Agents for Enterprise Productivity* (Enterprise & Industry)

---

## 1. Ringkasan Singkat

**ManualMechanic** adalah AI agent untuk tim maintenance pabrik yang:

1. **Memantau** data sensor pompa industri secara terus-menerus,
2. **Mendeteksi** anomali dan mengenali jenis gangguan dengan model ML,
3. **Bernalar** mencari penyebab menggunakan manual mesin dan riwayat perbaikan (RAG),
4. **Bertindak** secara nyata: cek stok spare part, buat work order, jadwalkan teknisi, dan kirim notifikasi,
5. **Mengeskalasi** ke teknisi senior bila keyakinan rendah atau risiko tinggi.

Bedanya dengan chatbot biasa: agent ini tidak berhenti di jawaban teks. Ia berjalan dari **gejala sampai tindakan**, dengan jejak penalaran dan sumber yang bisa diperiksa.

**Ruang lingkup prototype:** satu jenis mesin (**pompa sentrifugal**), 3-5 unit pompa simulasi, 4 pola gangguan utama, satu set manual.

---

## 2. Latar Belakang Masalah

Di pabrik manufaktur, pompa adalah komponen kritis (pendingin, transfer fluida, proses produksi). Ketika pompa bermasalah, yang terjadi di lapangan biasanya:

| Masalah | Dampak |
|---|---|
| Teknisi mencari solusi di manual yang tebal (ratusan halaman) | Diagnosis lambat, downtime memanjang |
| Pengetahuan ada di kepala teknisi senior dan tidak terdokumentasi | Teknisi junior bergantung, risiko saat senior pindah atau resign |
| Data sensor tersedia tetapi tidak terhubung ke manual dan tindakan | Anomali baru ditangani setelah mesin rusak |
| Pengecekan stok spare part, pembuatan work order, dan penjadwalan dilakukan manual | Banyak langkah administratif, rawan terlambat atau terlewat |
| Perawatan bersifat reaktif (tunggu rusak) | Biaya perbaikan darurat dan kehilangan produksi |

**Kesenjangan utamanya:** data sensor, manual, inventory, dan sistem work order hidup terpisah, dan manusia yang menjadi penghubungnya. Hal ini lambat dan bergantung pada individu.

---

## 3. Tujuan dan Manfaat

### Tujuan
- Mempercepat diagnosis kerusakan pompa dari "puluhan menit" menjadi "hitungan menit".
- Mengurangi ketergantungan pada teknisi senior dengan memusatkan pengetahuan manual dan riwayat perbaikan.
- Mengotomatisasi rantai tindakan setelah diagnosis (stok, work order, jadwal, notifikasi).
- Mendorong perawatan prediktif (menangani sebelum rusak total).

### Manfaat bagi perusahaan
- **Downtime lebih singkat** karena diagnosis dan penugasan lebih cepat.
- **Biaya perawatan lebih terkontrol** karena penanganan dini dan stok spare part terpantau.
- **Pengetahuan terdokumentasi**: setiap kasus tersimpan sebagai riwayat dan memperkaya diagnosis berikutnya.
- **Keselamatan lebih baik** karena tindakan berisiko selalu melalui persetujuan manusia.

### Target pengguna
- Teknisi dan supervisor maintenance
- Manajer produksi dan plant manager
- Perusahaan manufaktur, pengolahan makanan/minuman, kimia, dan utilitas yang banyak memakai pompa

---

## 4. Ruang Lingkup Prototype

| Aspek | Keputusan |
|---|---|
| Jenis mesin | Pompa sentrifugal (satu jenis) |
| Jumlah unit simulasi | 3-5 unit (Pump-01 s.d. Pump-04/05) dengan kondisi berbeda |
| Pola gangguan | 4 pola utama (lihat bagian 5) |
| Sumber data | Simulasi sendiri + dataset publik sebagai pelengkap |
| Sumber manual (RAG) | Manual pompa dari vendor yang PDF-nya tersedia publik + dokumen riwayat perbaikan buatan sendiri |
| Tool eksternal | Inventory, work order, notifikasi (database sendiri dan Telegram/email nyata) |

> **Catatan kejujuran untuk proposal:** prototype memakai data simulasi dan dataset publik. Arsitektur dirancang agar siap dihubungkan ke sensor nyata (misalnya melalui MQTT/OPC-UA) pada tahap pengembangan lanjutan.

---

## 5. Data Sensor dan Pola Gangguan

### 5.1 Sensor yang digunakan

| Sensor | Satuan | Makna |
|---|---|---|
| Getaran | mm/s | Naik saat bearing aus, poros tidak sejajar, atau kavitasi |
| Suhu bearing/motor | °C | Naik saat pelumasan kurang atau beban berlebih |
| Tekanan discharge | bar | Turun saat impeller aus, kebocoran, atau kavitasi |
| Arus motor | Ampere | Naik saat beban berlebih atau ada sumbatan |
| Debit aliran (opsional) | m³/jam | Turun saat filter atau saluran tersumbat |

### 5.2 Empat pola gangguan utama

| # | Gangguan | Pola sensor | Penyebab umum |
|---|---|---|---|
| 1 | **Bearing aus / kurang pelumas** | Getaran naik bertahap, suhu bearing naik | Pelumas habis, bearing sudah lama dipakai |
| 2 | **Impeller aus / tersumbat** | Tekanan turun, debit turun, arus naik | Kotoran, korosi, partikel |
| 3 | **Kavitasi** | Getaran acak/berfluktuasi, tekanan tidak stabil, bunyi kasar | Tekanan hisap terlalu rendah, suction tersumbat |
| 4 | **Overload motor** | Arus naik, suhu motor naik | Beban berlebih, tegangan tidak stabil |

### 5.3 Sumber data
- **Simulasi sendiri (utama):** generator data sensor kondisi normal (nilai dasar + noise), lalu injeksi pola gangguan secara bertahap (drift, lonjakan, fluktuasi). Paling aman karena terkontrol untuk demo dan pengujian.
- **Dataset publik (pelengkap):** dataset predictive maintenance di Kaggle, serta dataset getaran bearing seperti CWRU Bearing Dataset atau NASA IMS Bearing, untuk validasi model.
- **Manual (RAG):** manual pompa sentrifugal dari vendor yang tersedia publik (PDF), dipotong per bagian troubleshooting, spesifikasi, dan prosedur perawatan.

---

## 6. Cara Kerja Sistem (Alur Agent)

```
Data sensor / keluhan teknisi
            │
            ▼
   [1] Deteksi anomali + klasifikasi gangguan (Model ML)
            │
            ▼
   [2] Pencarian manual & riwayat perbaikan (RAG + sitasi halaman)
            │
            ▼
   [3] Penalaran Agent: hipotesis penyebab + tingkat keyakinan
            │
      ┌─────┴───────────────┐
      │ keyakinan tinggi     │ keyakinan rendah / risiko tinggi
      ▼                      ▼
 [4] Eksekusi tindakan   Tanya balik ke teknisi / eskalasi ke senior
   - cek stok spare part
   - buat work order
   - jadwalkan teknisi
   - kirim notifikasi
      │
      ▼
 [5] Simpan hasil ke riwayat (memori jangka panjang)
```

### Penjelasan tiap tahap

**Tahap 1: Deteksi (ML)**
- Anomali dideteksi dari deviasi terhadap kondisi normal (contoh: Isolation Forest atau autoencoder sederhana pada fitur seperti rata-rata, standar deviasi, dan tren per jendela waktu).
- Klasifikasi jenis gangguan (contoh: Random Forest/XGBoost pada fitur jendela waktu) menghasilkan label gangguan dan skor probabilitas.

**Tahap 2: Pengetahuan (RAG)**
- Manual dan riwayat perbaikan dipecah menjadi potongan, di-embed, dan disimpan di vector database.
- Agent mengambil potongan paling relevan dan wajib menyertakan sitasi (nama dokumen dan halaman).

**Tahap 3: Penalaran (Agent)**
- Menggabungkan hasil ML (label, skor, tren) dan hasil RAG (penyebab dan prosedur menurut manual).
- Menghasilkan daftar hipotesis berperingkat beserta alasan dan keyakinan gabungan.
- Bila informasi kurang (misalnya dua hipotesis hampir seimbang), agent **bertanya balik** ke teknisi (contoh: "Apakah terdengar bunyi seperti kerikil dari pompa?").

**Tahap 4: Tindakan (Tool Calling)**
- Memanggil beberapa tool secara berantai sesuai rencana (lihat bagian 8).

**Tahap 5: Pembelajaran dari riwayat**
- Hasil perbaikan (penyebab sebenarnya, tindakan, durasi) disimpan sehingga bisa ditemukan lewat RAG pada kasus berikutnya.

---

## 7. Logika Keputusan dan Keselamatan

### 7.1 Ambang keyakinan (contoh nilai awal, disesuaikan saat pengujian)

| Keyakinan gabungan | Tindakan agent |
|---|---|
| Tinggi (≥ 80%) dan risiko rendah/sedang | Eksekusi otomatis: work order, cek stok, notifikasi |
| Sedang (50-80%) | Rekomendasi + minta konfirmasi teknisi sebelum eksekusi, atau ajukan pertanyaan klarifikasi |
| Rendah (< 50%) | Eskalasi ke teknisi senior dengan ringkasan data dan hipotesis |

### 7.2 Tingkat risiko dan persetujuan manusia

| Tingkat risiko | Contoh | Perlakuan |
|---|---|---|
| Rendah | Pelumasan ulang, pembersihan filter | Boleh otomatis dibuatkan work order |
| Sedang | Penggantian bearing terjadwal | Work order otomatis, jadwal perlu konfirmasi |
| Tinggi | Mematikan pompa, overload parah, indikasi bahaya | **Agent hanya merekomendasikan, manusia yang menyetujui** |

### 7.3 Mitigasi risiko
- **Halusinasi:** jawaban harus berbasis hasil RAG dengan sitasi; bila tidak ada sumber, agent menyatakan tidak yakin.
- **Validasi parameter tool:** setiap pemanggilan tool divalidasi (skema input, rentang nilai, ID yang ada) sebelum dieksekusi.
- **Pemulihan kegagalan:** bila tool gagal (misalnya notifikasi tidak terkirim), agent mencoba ulang atau memakai kanal cadangan, lalu mencatat kegagalan.
- **Audit trail:** seluruh keputusan, sumber, dan tindakan dicatat agar bisa ditelusuri.
- **Kebocoran data:** manual dan data perusahaan tidak dikirim ke luar tanpa kontrol; kunci API disimpan di environment variable; akses dibatasi per peran.

---

## 8. Tool yang Dipanggil Agent

| Tool | Fungsi | Implementasi prototype |
|---|---|---|
| `get_sensor_data(pump_id, window)` | Ambil data sensor terbaru | API/database data simulasi |
| `detect_anomaly(pump_id)` | Jalankan model deteksi anomali | Endpoint model ML |
| `classify_fault(pump_id)` | Prediksi jenis gangguan + probabilitas | Endpoint model ML |
| `search_manual(query, pump_model)` | RAG ke manual dan riwayat | Vector DB + sitasi halaman |
| `check_inventory(part_name)` | Cek stok spare part | Tabel inventory (database) |
| `create_work_order(...)` | Buat work order | Tabel work order (database) |
| `schedule_technician(...)` | Jadwalkan teknisi | Tabel jadwal / Google Calendar |
| `send_notification(...)` | Kirim pesan ke teknisi/supervisor | Telegram bot atau email nyata |
| `escalate_to_senior(...)` | Eskalasi dengan ringkasan lengkap | Notifikasi + tiket prioritas |
| `save_case_history(...)` | Simpan kasus selesai | Database + masuk ke indeks RAG |

---

## 9. Arsitektur Sistem

```
┌──────────────────────────── WEB (Frontend) ────────────────────────────┐
│ Dashboard sensor │ Alert │ Chat dengan Agent │ Work Order │ Riwayat    │
└───────────────────────────────▲────────────────────────────────────────┘
                                │ REST / WebSocket
┌───────────────────────────────┴────────────────────────────────────────┐
│                          BACKEND (FastAPI)                              │
│  ┌───────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ Agent         │  │ ML Service       │  │ RAG Service              │  │
│  │ Orchestrator  │◄─┤ anomaly + fault  │  │ embed + vector search    │  │
│  │ (LLM + tools) │  │ classification   │  │ + sitasi halaman         │  │
│  └──────┬────────┘  └──────────────────┘  └──────────────────────────┘  │
│         │ tool calling                                                   │
│  ┌──────▼────────────────────────────────────────────────────────────┐  │
│  │ Tools: inventory │ work order │ jadwal │ notifikasi │ eskalasi     │  │
│  └──────┬────────────────────────────────────────────────────────────┘  │
└─────────┼───────────────────────────────────────────────────────────────┘
          ▼
 PostgreSQL (sensor, inventory, work order, riwayat) │ Vector DB │ Telegram/Email
          ▲
 Simulator data sensor (generator pola normal + injeksi gangguan)
```

### Prinsip rancangan (untuk poin Arsitektur Teknis)
- **Modular:** ML, RAG, agent, dan tool berupa modul terpisah; menambah jenis mesin cukup menambah manual dan profil sensor.
- **Skalabel:** simulator dapat diganti sumber nyata (MQTT/OPC-UA) tanpa mengubah logika agent.
- **Aman:** validasi input tool, pembatasan aksi berisiko, audit log.
- **Teramati:** setiap langkah penalaran dan pemanggilan tool ditampilkan di UI.

### Usulan tech stack

| Lapisan | Pilihan |
|---|---|
| LLM | Gemini atau OpenAI (via API) |
| Orkestrasi agent | LangChain/LangGraph atau implementasi function calling sendiri |
| ML | Python, scikit-learn, XGBoost (opsional PyTorch untuk autoencoder) |
| RAG | Embedding + ChromaDB/FAISS/pgvector |
| Backend | FastAPI |
| Database | PostgreSQL (atau SQLite untuk prototype) |
| Frontend | Next.js/React (Vercel) atau Streamlit/Gradio |
| Notifikasi | Telegram Bot API / SMTP email |
| Deployment | Vercel (frontend), Render/Railway/HF Spaces (backend) |

---

## 10. Fitur Utama

1. **Dashboard pemantauan multi-pompa:** grafik sensor, status (normal/waspada/kritis), dan prioritas.
2. **Deteksi dini anomali** sebelum kegagalan total.
3. **Diagnosis berbasis sumber:** hipotesis penyebab dengan keyakinan dan sitasi halaman manual.
4. **Percakapan dengan agent:** teknisi bertanya atau memberi info tambahan, agent bertanya balik bila perlu.
5. **Eksekusi tindakan otomatis:** stok, work order, jadwal, notifikasi.
6. **Prioritisasi lintas pompa:** agent menentukan unit mana yang paling mendesak.
7. **Eskalasi cerdas:** ke teknisi senior dengan ringkasan data dan hipotesis.
8. **Memori kasus:** riwayat perbaikan meningkatkan kualitas diagnosis berikutnya.
9. **Jejak penalaran dan audit log** yang bisa dibuka di UI.

---

## 11. Studi Kasus yang Dapat Ditangani

### Kasus 1: Bearing aus (kondisi paling klasik)
- **Kondisi:** Pump-02. Getaran naik pelan dari 2,5 menjadi 6 mm/s dalam beberapa jam, suhu bearing naik dari 55 °C menjadi 78 °C.
- **Proses agent:**
  1. Model ML menandai anomali dan mengklasifikasi "bearing aus/kurang pelumas".
  2. RAG menemukan bagian manual tentang perawatan bearing dan pelumasan.
  3. Agent menyimpulkan: bearing aus (keyakinan tinggi), merujuk halaman manual.
  4. Cek stok: bearing tersedia 2 unit.
  5. Buat work order (prioritas sedang), jadwalkan teknisi, kirim notifikasi Telegram.
- **Hasil:** pompa ditangani sebelum bearing macet total.

### Kasus 2: Impeller tersumbat
- **Kondisi:** Pump-03. Tekanan discharge turun, debit turun, arus motor naik.
- **Proses agent:** klasifikasi "impeller tersumbat/aus", RAG memberi prosedur pembersihan dan inspeksi impeller. Karena stok impeller kosong, agent membuat **permintaan pembelian** sekaligus work order pembersihan sebagai tindakan sementara.
- **Hasil:** agent menangani dua jalur sekaligus (perbaikan sementara dan pengadaan), menunjukkan kemampuan merencanakan.

### Kasus 3: Kavitasi (ambigu, agent bertanya balik)
- **Kondisi:** Pump-01. Getaran berfluktuasi acak, tekanan tidak stabil. Pola mirip bearing aus dan kavitasi, keyakinan terbelah (misalnya 48% vs 45%).
- **Proses agent:** karena keyakinan tidak cukup, agent bertanya ke teknisi: "Apakah terdengar bunyi seperti kerikil, dan bagaimana kondisi katup/saringan sisi hisap?" Setelah teknisi menjawab, agent memperbarui hipotesis menjadi kavitasi dan merujuk bagian manual terkait tekanan hisap.
- **Hasil:** menunjukkan penanganan ambiguitas dan menjaga konteks percakapan (kriteria Penalaran).

### Kasus 4: Overload motor (risiko tinggi, manusia menyetujui)
- **Kondisi:** Pump-04. Arus motor melonjak dan suhu motor mendekati batas.
- **Proses agent:** menilai risiko tinggi, **tidak mematikan pompa sendiri**. Agent mengirim peringatan prioritas tinggi ke supervisor, merekomendasikan penghentian sementara, dan menunggu persetujuan sebelum membuat work order darurat.
- **Hasil:** menunjukkan batas otonomi yang aman (human-in-the-loop).

### Kasus 5: Teknisi melapor lewat keluhan teks
- **Kondisi:** teknisi mengetik "Pompa 3 bunyi kasar dan agak panas."
- **Proses agent:** agent mengambil data sensor Pump-03, menggabungkannya dengan keluhan, menjalankan klasifikasi, mencari manual, lalu memberi diagnosis dan langkah awal. Bila data sensor normal tetapi keluhan menunjukkan masalah, agent menyarankan inspeksi fisik dan membuat tiket pemeriksaan.
- **Hasil:** mendukung dua jalur masuk (data otomatis dan laporan manusia).

### Kasus 6: Banyak alert bersamaan (prioritisasi)
- **Kondisi:** dua pompa waspada dan satu kritis, hanya ada satu teknisi tersedia.
- **Proses agent:** mengurutkan berdasarkan tingkat keparahan, kritikalitas pompa, dan ketersediaan teknisi, lalu menjadwalkan: kritis dulu, yang waspada diberi jadwal berikutnya.
- **Hasil:** menunjukkan perencanaan dan pengambilan keputusan lintas unit.

### Kasus 7: Kasus berulang (belajar dari riwayat)
- **Kondisi:** Pump-02 mengalami gejala yang mirip dengan perbaikan bulan lalu.
- **Proses agent:** RAG menemukan riwayat kasus sebelumnya, agent menyadari ini kemungkinan **kegagalan berulang** dan menyarankan pemeriksaan akar masalah (misalnya ketidaksejajaran poros), bukan sekadar mengganti bearing lagi.
- **Hasil:** menunjukkan nilai memori kasus dan analisis yang melampaui manual.

### Kasus 8: Data tidak lengkap / sensor bermasalah
- **Kondisi:** salah satu sensor mengirim nilai nol atau hilang.
- **Proses agent:** mendeteksi data tidak valid, tidak memaksakan diagnosis, menandai kemungkinan sensor rusak, dan membuat tiket pengecekan sensor.
- **Hasil:** menunjukkan penanganan kesalahan dan pemulihan.

---

## 12. Skenario Demo (Video 3-5 Menit)

| Waktu | Isi |
|---|---|
| 0:00-0:30 | Perkenalan tim dan masalah downtime pompa di pabrik |
| 0:30-1:00 | Tampilkan dashboard 4 pompa (satu mulai memburuk) |
| 1:00-2:30 | **Demo utama (Kasus 1):** alert muncul, agent menganalisis, menampilkan penalaran, sumber halaman manual, dan keyakinan |
| 2:30-3:30 | Agent mengeksekusi tindakan: cek stok, buat work order, notifikasi Telegram yang benar-benar masuk ke ponsel |
| 3:30-4:15 | **Demo singkat Kasus 3 atau 4:** tanya balik atau eskalasi risiko tinggi |
| 4:15-5:00 | Arsitektur singkat, metrik dampak, dan rencana pengembangan |

**Tips:** pastikan tindakan terlihat nyata (pesan Telegram masuk, work order muncul di tabel), karena kriteria Penggunaan Alat dan Eksekusi Tindakan menilai hasil yang benar-benar dijalankan.

---

## 13. Metrik Keberhasilan

> Angka di bawah adalah **target pengujian prototype**, bukan klaim hasil lapangan. Ukur di simulasi, lalu laporkan apa adanya di proposal.

| Metrik | Cara mengukur | Contoh target |
|---|---|---|
| Waktu diagnosis | Dari alert sampai diagnosis + work order, dibandingkan alur manual (diukur dengan skenario uji) | Turun signifikan dibanding manual |
| Akurasi klasifikasi gangguan | Precision/recall/F1 pada data uji simulasi dan dataset publik | Contoh: F1 ≥ 0,85 |
| Deteksi dini | Selisih waktu deteksi vs titik gangguan parah pada skenario simulasi | Terdeteksi sebelum fase kritis |
| Kualitas sitasi | Persentase jawaban yang menyertakan sumber relevan | Contoh: ≥ 90% |
| Keberhasilan tool calling | Persentase pemanggilan tool dengan parameter valid dan hasil benar | Contoh: ≥ 95% |
| Tingkat eskalasi tepat | Kasus ambigu/berisiko tinggi yang benar-benar dieskalasi | Tinggi pada skenario uji |

---

## 14. Pemetaan ke Kriteria Penilaian Lomba

| Kriteria (bobot) | Bagaimana ManualMechanic menjawabnya |
|---|---|
| **Kapabilitas & Otonomi Agen (25%)** | Dari gejala sampai work order dan notifikasi tanpa intervensi manual, dengan batas otonomi yang aman |
| **Penalaran, Perencanaan, Keputusan (15%)** | Hipotesis berperingkat, tanya balik saat ambigu, prioritisasi lintas pompa, pemulihan saat tool gagal |
| **Penggunaan Alat & Eksekusi (15%)** | 8-10 tool berantai (ML, RAG, inventory, work order, jadwal, notifikasi) dengan validasi parameter |
| **Arsitektur Teknis (15%)** | Modular, skalabel, database terstruktur, audit log, keamanan, penanganan error |
| **Inovasi & Kreativitas (10%)** | Menggabungkan data sensor, manual (RAG), dan tindakan operasional dalam satu agent; memori kasus |
| **Dampak & Nilai Bisnis (10%)** | Masalah downtime nyata, metrik terukur, jalur ke produk komersial |
| **UX (5%)** | Dashboard jelas, status berwarna, jejak penalaran mudah dibaca, pesan error informatif |
| **Demo & Dokumentasi (5%)** | Demo live end-to-end, README repo lengkap, proposal sesuai format |

---

## 15. Rencana Pengerjaan (19 Okt - 10 Nov 2026)

| Minggu | Fokus | Output |
|---|---|---|
| **Minggu 1** (19-25 Okt) | Fondasi | Simulator data sensor, database, indeks RAG dari manual, model ML versi awal, kerangka UI dan backend |
| **Minggu 2** (26 Okt - 1 Nov) | Agent inti | Agent orchestrator dengan tool calling, integrasi ML + RAG, notifikasi Telegram, dashboard terhubung ke backend |
| **Minggu 3** (2-8 Nov) | Penyempurnaan | Kasus ambigu dan eskalasi, pengujian metrik, deployment publik, README, perekaman video demo |
| **Buffer** (9-10 Nov) | Pengumpulan | Proposal PDF (maks 15 halaman), surat keaslian, cek link publik, submit sebelum **10 Nov 2026 pukul 23:59 WIB** |

> **Saran:** mulai menyiapkan simulator, indeks RAG, dan draf proposal sebelum 19 Oktober (Technical Meeting 18 Okt) agar waktu pengerjaan tidak terlalu padat.

### Pembagian kerja tim (2 orang)

| Anggota | Tanggung jawab |
|---|---|
| **ML/AI** | Simulator data, model anomali + klasifikasi, RAG, agent orchestrator, tool backend, evaluasi metrik |
| **Web** | Dashboard, halaman chat agent, work order dan riwayat, deployment, integrasi API, video demo (bersama) |
| **Bersama** | Proposal, skenario demo, pengujian end-to-end |

---

## 16. Struktur Repositori yang Disarankan

```
manualmechanic/
├── README.md
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── agent/          # orchestrator, prompt, aturan keputusan
│   │   ├── tools/          # inventory, work_order, notify, schedule
│   │   ├── ml/             # anomaly, classifier, training
│   │   ├── rag/            # ingest, retriever, sitasi
│   │   └── db/             # model dan migrasi
│   └── tests/
├── simulator/              # generator data sensor + injeksi gangguan
├── data/
│   ├── manuals/            # PDF manual pompa
│   └── history/            # dokumen riwayat perbaikan
├── frontend/               # dashboard dan chat
├── docs/                   # arsitektur, hasil evaluasi, screenshot
└── .env.example
```

---

## 17. Skema Database Ringkas

| Tabel | Kolom utama |
|---|---|
| `pumps` | id, nama, lokasi, model, status, kritikalitas |
| `sensor_readings` | pump_id, timestamp, vibration, bearing_temp, pressure, current, flow |
| `faults` | id, pump_id, jenis, keyakinan, waktu_deteksi, status |
| `inventory` | part_id, nama_part, stok, lokasi, kompatibel_dengan |
| `work_orders` | id, pump_id, fault_id, deskripsi, prioritas, status, teknisi, jadwal |
| `technicians` | id, nama, keahlian, ketersediaan, kontak |
| `case_history` | id, pump_id, gejala, penyebab_aktual, tindakan, durasi |
| `agent_logs` | id, waktu, langkah, tool, input, output, sumber_rag |

---

## 18. Batasan Sistem

- Prototype memakai data simulasi dan dataset publik, sehingga akurasi di lapangan perlu divalidasi pada data pabrik sebenarnya.
- Fokus pada satu jenis mesin (pompa sentrifugal) dan empat pola gangguan utama.
- Integrasi sistem perusahaan (ERP/CMMS) disimulasikan dengan database sendiri.
- Keputusan berisiko tinggi tetap membutuhkan persetujuan manusia.

---

## 19. Rencana Pengembangan Lanjutan (Future Development)

1. **Integrasi sensor nyata** via MQTT/OPC-UA/IoT gateway.
2. **Integrasi CMMS/ERP** (SAP PM, Maximo, atau sistem lokal) untuk work order dan inventory sungguhan.
3. **Perluasan jenis mesin:** kompresor, motor listrik, conveyor, dengan menambah manual dan profil sensor tanpa mengubah logika agent.
4. **Estimasi sisa umur pakai (RUL)** untuk perawatan prediktif yang lebih presisi.
5. **Input multimodal:** foto kerusakan dan rekaman suara mesin.
6. **Asisten suara/WhatsApp** untuk teknisi di lapangan.
7. **Pembelajaran dari umpan balik teknisi** untuk meningkatkan akurasi seiring waktu.
8. **Dashboard analitik manajemen:** tren downtime, biaya perawatan, dan efektivitas agent.

---

## 20. Checklist Syarat Lomba

- [ ] Bukan sekadar ChatGPT wrapper (ada ML, RAG, dan tool calling)
- [ ] UI dideploy publik (live demo)
- [ ] Repo GitHub di-set public
- [ ] Proposal PDF maks 15 halaman, A4, Times New Roman 12 pt, spasi 1,5, margin kiri 4 cm dan lainnya 3 cm
- [ ] Logo GTNIC 2026 di cover proposal
- [ ] Nama file: `GTNIC2026_AIAgent_NamaTim.pdf`
- [ ] Video demo 3-5 menit (YouTube/Drive, akses publik)
- [ ] Surat pernyataan keaslian karya
- [ ] Submit via Google Form sebelum **10 November 2026, 23:59 WIB**
- [ ] Karya orisinal dan belum pernah dipublikasikan atau menang di lomba lain
