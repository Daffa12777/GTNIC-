# Referensi API — ManualMechanic

Tanggal acuan: 1 November 2026. Referensi berdasarkan controller dan DTO backend saat dokumentasi disusun. Belum ada spesifikasi OpenAPI yang dihasilkan otomatis; kode controller/DTO tetap menjadi kontrak utama.

## Konvensi

Base URL pengembangan: `http://localhost:8000/api`. Frontend mengakses `/api` melalui proxy pada origin web yang sama.

- Body mutasi berupa JSON dengan `Content-Type: application/json`.
- Pada mode autentikasi, kirim cookie sesi dan header `x-mm-client: web` untuk mutasi, termasuk login.
- `Origin`, bila dikirim, harus termasuk daftar `FRONTEND_ORIGIN`.
- `credentials: 'include'` diperlukan pada pemanggilan browser dengan cookie.
- Role berasal dari akun backend. Header `x-role` hanya untuk simulasi peran pada mode demo tanpa login; tidak dapat menaikkan izin akun yang login.
- Timestamp sensor/kasus umumnya epoch detik, sedangkan waktu status layanan memakai epoch milidetik. Ikuti tipe respons masing-masing.
- Endpoint POST umumnya memakai default NestJS HTTP 201, kecuali perilaku handler mengubahnya. Klien sebaiknya menerima seluruh status sukses 2xx.
- Field ekstra ditolak pada DTO yang memakai whitelist ketat. Jangan mengirim `approved` dari klien ke `/diagnose`.

## Sesi dan profil

| Metode | Path | Body / fungsi | Akses |
| --- | --- | --- | --- |
| GET | `/auth/session` | `{enabled, user}` | Publik; user dapat null |
| POST | `/auth/login` | `{username, password}`; menetapkan cookie | Publik dengan proteksi mutasi |
| POST | `/auth/refresh` | Refresh lewat cookie; rotasi token | Publik dengan proteksi mutasi |
| POST | `/auth/logout` | Mencabut sesi, menghapus cookie | Publik dengan proteksi mutasi |
| GET | `/profile` | Profil akun | Akun login |
| POST | `/profile` | `{name, email, username}` | Akun login |
| POST | `/profile/password` | `{currentPassword, newPassword}` | Akun login; password baru 12–256 karakter |
| POST | `/profile/delete` | `{currentPassword}` | Akun login; supervisor terakhir dilindungi |
| GET | `/inbox` | Notifikasi, unread, approvalCount, approvals | Akun login |
| POST | `/inbox/read` | `{through: number}` | Akun login; penanda dibaca per akun |

Nama profil 1–100 karakter, email valid maksimal 254 karakter, username 3–100 karakter dengan huruf/angka/`_`/`.`/`-`. Endpoint profil/inbox tetap membutuhkan identitas akun meskipun instalasi menggunakan mode demo tanpa login.

## Monitoring dan diagnosis

| Metode | Path | Fungsi | Akses normal |
| --- | --- | --- | --- |
| GET | `/health` | `{ok, db, time}` | Publik |
| GET | `/overview` | Unit, status, jumlah WO, kasus, metadata ML/konfigurasi | Teknisi/supervisor |
| GET | `/ml/meta` | Metadata melalui backend ke ML | Teknisi/supervisor |
| GET | `/pumps/:id/readings?limit=60` | Pembacaan, metadata sensor, nominal, status, komponen | Teknisi/supervisor |
| GET | `/services` | Status database, ML, dan hasil uji LLM | Teknisi/supervisor |
| POST | `/services/llm/check` | Mengirim probe Gemini; memakai kuota | Teknisi/supervisor |
| POST | `/diagnose` | Diagnosis satu unit | Teknisi/supervisor |
| POST | `/chat` | Percakapan dan tool calling | Teknisi/supervisor |
| POST | `/triage` | Ranking dan pemrosesan unit prioritas | Teknisi/supervisor |

`/health` bukan pemeriksaan lengkap inferensi dan sesi. `readings.limit` dibatasi 2–240. Overview tidak membatasi jumlah unit menjadi enam.

Contoh bentuk satu unit pada overview, **data ilustratif**:

```json
{
  "id": "Pump-05",
  "name": "HPU Press Line 3",
  "location": "Produksi, Line 3",
  "model": "HPU-75",
  "criticality": "tinggi",
  "status": { "state": "tidak ada data" },
  "open_work_orders": 0,
  "open_case": null
}
```

Status yang didukung: `normal`, `waspada`, `kritis`, `sensor`, `ml_error`, `tidak ada data`. Field status opsional antara lain `label`, `confidence`, `components`, `flags`, `probs`, dan `error`.

Contoh request diagnosis:

```json
{
  "pump_id": "Pump-05",
  "complaint": "Tekanan sulit naik dan waktu siklus memanjang.",
  "use_llm": false
}
```

`pump_id` 1–80 karakter, `complaint` maksimal 4000, `use_llm` boolean. Respons berupa kasus yang dibuat/dilanjutkan oleh agent; jangan mengasumsikan hasil selalu work order otomatis.

Contoh request chat:

```json
{
  "message": "Periksa kondisi Pump-05.",
  "case_id": null,
  "use_llm": false,
  "history": []
}
```

Pesan 1–8000 karakter. Maksimal delapan entri history, masing-masing `{from: 'user' | 'agent', text}` dengan teks 1–1500 karakter. Respons chat memuat jawaban/kasus dan dapat menyertakan error LLM; tinjau isi respons, bukan hanya status HTTP.

## Kasus dan work order

| Metode | Path | Body / fungsi |
| --- | --- | --- |
| GET | `/cases` | Maksimal 40 kasus terbaru |
| GET | `/cases/:id` | Detail kasus, jejak, dan state terkait |
| GET | `/cases/:id/context` | Maksimal 10 kasus terkait, 50 work order aktif, 10 pekerjaan selesai/dibatalkan, dan pratinjau berbasis stok saat diminta; bukan reservasi stok atau teknisi |
| POST | `/cases/:id/answer` | `{text}`; 1–4000 karakter |
| POST | `/cases/:id/approve` | Persetujuan, supervisor saja |
| POST | `/cases/:id/reject` | `{note}` maksimal 2000 karakter; supervisor saja; alasan tidak boleh kosong untuk risiko tinggi |
| GET | `/work-orders` | Maksimal 60 pekerjaan terbaru |
| POST | `/work-orders/:id/complete` | `{root_cause, action, duration_min?}` |
| GET | `/records/cases` | Daftar berpaginasi, keputusan tertunda diutamakan, dengan hitungan filter berdasarkan pencarian saat ini |
| GET | `/records/work-orders` | Daftar berpaginasi + pilihan teknisi/unit |
| GET | `/technicians` | Daftar teknisi |
| GET | `/purchase-requests` | Maksimal 40 pengajuan pembelian terbaru |

Penyelesaian WO memerlukan `root_cause` dan `action` yang tidak kosong, masing-masing maksimal 2000 karakter; durasi opsional 0–100000 menit, default backend 60. Tidak ada endpoint umum untuk membuat WO manual melalui controller ini; pembuatan terjadi melalui alur tool agent.

Query `/records/*`: `page` default 1, `pageSize` default 20 (rentang API 5–50), `q`, `status`, `unit`; work order juga menggunakan `priority` dan `technician` (`unassigned` untuk belum ditugaskan).

```text
GET /api/records/work-orders?page=1&pageSize=20&unit=Pump-05&status=terjadwal
```

Respons dasar: `{items, total, page, pageSize}`. Respons WO menambah `technicians` dan `units`. UI memberi pilihan ukuran 10/20/50. Endpoint daftar lama yang terbatas tetap dipakai di beberapa panel ringkas; gunakan `/records/*` untuk menjelajah data lama.

## Inventaris dan notifikasi

| Metode | Path | Body / fungsi | Akses |
| --- | --- | --- | --- |
| GET | `/inventory` | Daftar part | Teknisi/supervisor |
| POST | `/inventory` | `{part_id, name, location, stock, min_stock}` | Supervisor |
| POST | `/inventory/:id/stock` | `{operationId, delta, expectedStock, reason}` | Supervisor |
| GET | `/inventory/:id/movements` | Riwayat mutasi part | Teknisi/supervisor |
| GET | `/notifications` | Maksimal 40 notifikasi terbaru | Teknisi/supervisor |

`operationId` berupa UUID. `delta` bilangan bulat, `expectedStock` bilangan bulat nonnegatif, dan alasan 5–500 karakter. Backend memeriksa saldo, duplikasi operasi, dan konflik. Notifikasi dapat memuat catatan simulasi atau pengiriman, bukan jaminan pesan diterima pihak luar.

## Agent otomatis dan simulator

Semua endpoint berikut memerlukan supervisor. Endpoint `/scenario/*` juga memerlukan `SCENARIO_CONTROLS_ENABLED=true`.

| Metode | Path | Body / fungsi |
| --- | --- | --- |
| POST | `/auto` | `{enabled: boolean}` |
| POST | `/scenario/start` | Memulai skenario Pump-02/03 |
| POST | `/scenario/fault` | `{pump_id, fault, rate?, severity?}` |
| POST | `/scenario/dropout` | `{pump_id, sensor}`; null menghapus dropout |
| POST | `/scenario/reset` | Reset state simulasi; tidak menghapus kasus/WO |
| POST | `/scenario/tick` | Menjalankan satu tick monitor |

`fault`: `pump`, `valve`, `cooler`, atau `accumulator`. `rate` dan `severity` 0–1. Kontrol ini memodifikasi data demo; bukan perintah ke perangkat fisik.

Pendaftaran `Pump-05`/`Pump-06` dilakukan melalui `npm.cmd run demo:add-pumps`, bukan endpoint HTTP. Tidak ada CRUD mesin publik saat ini.

## API ML terpisah

Base URL lokal `http://localhost:8100`, tanpa prefix `/api`.

| Metode | Path | Fungsi |
| --- | --- | --- |
| GET | `/health` | Memuat/menguji model, menghasilkan ok dan source |
| GET | `/meta` | Source, trained_at, seluruh nama fitur, dan metrik |
| POST | `/predict` | `{features: Record<string, number>}` |

Jika `ML_API_KEY` diisi, `/meta` dan `/predict` memerlukan `x-api-key`. Jangan meletakkan key ini di frontend. Sumber fitur dan urutannya ditentukan model; gunakan seluruh daftar dari `/meta`.

Respons inferensi memuat `anomaly: {score, threshold, is_anomaly}`, `components` per komponen, serta `source`. Setiap komponen memuat `level`, `severity`, `confidence`, `probs`, dan `p_degraded`. Backend mengubahnya menjadi ranking hipotesis serta status monitoring.

## Error dan batas akses

| Status | Makna umum |
| --- | --- |
| 400 | Input/alur tidak valid, field ekstra, status kasus tidak cocok |
| 401 | Tidak login/sesi berakhir; API key ML tidak cocok |
| 403 | Role/origin/header klien/izin simulator tidak sesuai |
| 404 | Resource tidak ditemukan |
| 409 | Konflik operasi/data sesuai handler |
| 415 | Format body tidak diterima |
| 422 | Fitur ML kurang/tidak valid |
| 429 | Batas request; periksa `Retry-After` |
| 503 | Model/dependency/store belum siap |

Respons dapat memakai `detail` atau `message`. Tidak semua kegagalan domain dipetakan ke status yang sama; beberapa alur agent mengembalikan informasi kegagalan pada payload. Catat `X-Request-Id` jika tersedia, tanpa membagikan cookie atau secret. Jangan mengulang mutasi berulang kali tanpa memeriksa apakah tindakan sebelumnya sudah tercatat.
