# Checklist kesesuaian Guide Book GTNIC 2026 (AI Agent)

Acuan tinjauan 8 November 2026. Status tersedia menunjukkan keberadaan implementasi, sedangkan temuan terbuka dan batas bukti dicatat pada [laporan tinjauan](REVIEW_2026-11-08.md). Tenggat serta format berkas perlu dicocokkan kembali dengan guidebook resmi panitia.

## Syarat teknis karya
| Syarat | Status | Bukti |
|---|---|---|
| Bukan ChatGPT wrapper (reasoning, tool calling, atau RAG) | Siap | 12 tool bertipe di `backend/src/tools`, RAG di `backend/src/rag`, ML di `ml/`, loop function calling Gemini di `backend/src/agent/llm.service.ts` |
| Menjalankan tindakan operasional | Tersedia | Work order, jadwal, pembelian, dan notifikasi tercatat di PostgreSQL. Pengiriman Telegram nyata memerlukan konfigurasi dan bukti terpisah. |
| Otonomi dengan batas yang jelas | Diuji lokal; production menyusul | Risiko tepercaya, rencana persetujuan, konteks kasus, dan monitor otomatis diuji pada database terisolasi; lihat validasi agent. Timer production tetap membutuhkan backend persisten. |
| UI publik yang dapat diakses | Terverifikasi 8 November | Domain utama merespons; dua akun demo dapat login dengan peran yang sesuai. |
| Repo GitHub publik | Anda | Push repo ini; pastikan `.env` tidak ikut dan API key lama dicabut |
| Video demo 3–5 menit, akses publik | Anda | Ikuti `docs/DEMO_SCRIPT.md` |
| Surat Pernyataan Keaslian | Anda | Template di `docs/Surat_Pernyataan_Keaslian_Karya_TEMPLATE.md`, sesuaikan dengan lampiran resmi |
| Proposal PDF sesuai format panitia | Revisi 14 halaman tersedia | A4, Times New Roman 12 pada isi, spasi 1,5, margin kiri 4 cm/lainnya 3 cm, serta logo di sampul. Memuat hasil 131 tes dan membedakan verifikasi lokal dari production; tautan video masih perlu dilengkapi. |
| Nama file `GTNIC2026_AIAgent_NamaTim.pdf` | Anda | Ganti NamaTim |

## Pemetaan ke kriteria penilaian
| Kriteria (bobot) | Di mana terlihat |
|---|---|
| Kapabilitas dan otonomi agent (25) | Rantai tindakan otomatis, tanya balik, eskalasi, persetujuan; dua jalur masuk (sensor dan laporan teknisi) menuju kasus yang sama; pemicu otomatis oleh monitor |
| Penalaran, perencanaan, keputusan (15) | Jejak tool dan keputusan, probabilitas komponen, keluhan dengan negasi, riwayat, serta gangguan majemuk. Jumlah langkah mengikuti kasus dan mode. |
| Penggunaan alat dan eksekusi (15) | 12 tool dengan validasi parameter, pencegahan duplikasi work order, error dikembalikan ke agent |
| Arsitektur teknis (15) | React + NestJS + PostgreSQL + FastAPI; RAG bersitasi; chat multimodal. Sebanyak 57 tes frontend dan 74 backend lulus, termasuk integrasi ML; lihat `AGENT_VALIDATION_2026-11-08.md`. |
| Inovasi dan orisinalitas (10) | Sensor dan keluhan lapangan disatukan; guardrail di lapisan tool; riwayat pekerjaan yang ditutup masuk kembali ke indeks RAG |
| Dampak dan relevansi (10) | Tema Enterprise Productivity: otomatisasi koordinasi maintenance dan triase. Estimasi waktu hemat harus diberi label asumsi, bukan hasil ukur |
| UX (5) | Peta 3D interaktif, fokus/rotasi, panel unit, konfirmasi persetujuan, chat gambar, serta peran Teknisi/Supervisor. Uji pengguna lapangan masih diperlukan. |
| Demo dan dokumentasi (5) | README, `docs/`, video demo |

## Catatan penting untuk proposal
- Dataset dan domain berubah dari pompa sentrifugal sintetis menjadi **unit tenaga hidrolik dengan pompa** (dataset UCI). Perbarui bagian latar belakang, arsitektur ML, daftar sensor, tabel fitur, daftar pustaka, dan screenshot agar sama dengan sistem ini.
- Angka akurasi: tulis hanya angka dari `ml/artifacts/metrics.json` hasil training dengan dataset asli, sebut metode split-nya, dan sebut bahwa data berasal dari satu test rig.
- Mode demo dengan pemilih peran bukan autentikasi. Mode JWT memakai login dan role guard server; jelaskan mode yang benar-benar digunakan dalam demo/proposal.
- Telegram bersifat simulasi (pesan dicatat) sampai `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` diisi.
- Fitur foto sudah tersedia pada chat LLM. Video pada proposal CPESS masih berupa placeholder; akun demo dan panduan uji sudah ada di README.
