# Checklist kesesuaian Guide Book GTNIC 2026 (AI Agent)

Status: Siap = sudah ada di repo. Anda = harus dikerjakan tim sebelum pengumpulan (batas 10 November 2026, 23.59 WIB).

## Syarat teknis karya
| Syarat | Status | Bukti |
|---|---|---|
| Bukan ChatGPT wrapper (reasoning, tool calling, atau RAG) | Siap | 12 tool bertipe di `backend/src/tools`, RAG di `backend/src/rag`, ML di `ml/`, loop function calling Gemini di `backend/src/agent/llm.service.ts` |
| Menjalankan tindakan nyata, bukan hanya menjawab | Siap | Work order, jadwal teknisi, permintaan pembelian, notifikasi Telegram, tersimpan di PostgreSQL |
| Otonomi dengan batas yang jelas | Siap | Keyakinan ≥ 80% dan risiko bukan tinggi → otomatis; 50–79% → tanya balik; < 50% → eskalasi; risiko tinggi → persetujuan supervisor (dipaksa di lapisan tool) |
| UI publik yang dapat diakses | Anda | Deploy mengikuti `docs/DEPLOY.md`, isi tautan di proposal |
| Repo GitHub publik | Anda | Push repo ini; pastikan `.env` tidak ikut dan API key lama dicabut |
| Video demo 3–5 menit, akses publik | Anda | Ikuti `docs/DEMO_SCRIPT.md` |
| Surat Pernyataan Keaslian | Anda | Template di `docs/Surat_Pernyataan_Keaslian_Karya_TEMPLATE.md`, sesuaikan dengan lampiran resmi |
| Proposal PDF (maks. 15 halaman, A4, TNR 12, spasi 1,5, margin kiri 4 cm dan lainnya 3 cm, logo GTNIC di sampul) | Anda | Gunakan proposal yang sudah dibuat; sesuaikan nama dataset dan arsitektur dengan dokumen ini (lihat catatan di bawah) |
| Nama file `GTNIC2026_AIAgent_NamaTim.pdf` | Anda | Ganti NamaTim |

## Pemetaan ke kriteria penilaian
| Kriteria (bobot) | Di mana terlihat |
|---|---|
| Kapabilitas dan otonomi agent (25) | Rantai tindakan otomatis, tanya balik, eskalasi, persetujuan; dua jalur masuk (sensor dan laporan teknisi) menuju kasus yang sama; pemicu otomatis oleh monitor |
| Penalaran, perencanaan, keputusan (15) | Jejak 13–17 langkah per kasus; penggabungan probabilitas model, keluhan teknisi (dengan negasi), riwayat; deteksi gangguan majemuk; sensor mati tidak dituduh sebagai kerusakan mesin |
| Penggunaan alat dan eksekusi (15) | 12 tool dengan validasi parameter, pencegahan duplikasi work order, error dikembalikan ke agent |
| Arsitektur teknis (15) | React + NestJS + PostgreSQL (Supabase) + layanan ML FastAPI; RAG bersitasi; mode policy dan mode LLM dengan fallback; 10 tes backend dan 4 tes ML |
| Inovasi dan orisinalitas (10) | Sensor dan keluhan lapangan disatukan; guardrail di lapisan tool; riwayat pekerjaan yang ditutup masuk kembali ke indeks RAG |
| Dampak dan relevansi (10) | Tema Enterprise Productivity: otomatisasi koordinasi maintenance dan triase. Estimasi waktu hemat harus diberi label asumsi, bukan hasil ukur |
| UX (5) | UI minimalis, jejak penalaran terbaca, peran Teknisi/Supervisor |
| Demo dan dokumentasi (5) | README, `docs/`, video demo |

## Catatan penting untuk proposal
- Dataset dan domain berubah dari pompa sentrifugal sintetis menjadi **unit tenaga hidrolik dengan pompa** (dataset UCI). Perbarui bagian latar belakang, arsitektur ML, daftar sensor, tabel fitur, daftar pustaka, dan screenshot agar sama dengan sistem ini.
- Angka akurasi: tulis hanya angka dari `ml/artifacts/metrics.json` hasil training dengan dataset asli, sebut metode split-nya, dan sebut bahwa data berasal dari satu test rig.
- Jangan menyebut peran Teknisi/Supervisor sebagai autentikasi.
- Telegram bersifat simulasi (pesan dicatat) sampai `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` diisi.
