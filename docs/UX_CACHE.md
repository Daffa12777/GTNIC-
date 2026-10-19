# UX dan cache frontend

TanStack Query menyimpan respons API hanya dalam memori. Tidak ada persistence
ke localStorage, IndexedDB, atau service worker. Password dan token tidak masuk cache.

| Resource | Masa fresh | Refresh saat halaman aktif |
|---|---|---|
| Overview | 10 detik | 15 detik |
| Readings per unit | 10 detik | Minimum 10 detik, mengikuti tick backend bila lebih lama |
| Kasus, detail, work order | 30 detik | 30 detik |
| Inventaris, pembelian, notifikasi | 30 detik | 60 detik |
| Profil, daftar teknisi | 5 menit | 5 menit |

Cache tanpa observer dibuang setelah 5 menit. Polling berhenti pada tab background.
Query stale diperiksa ulang saat fokus kembali atau koneksi tersambung.
Key mencakup ID resource, pagination, dan filter agar data tidak tertukar.
Mutasi yang berhasil menginvalidasi resource terkait, termasuk halaman yang sedang
tidak terbuka. Mutasi tidak diulang atau diantrekan saat offline.

Logout/pergantian identitas membatalkan request dan menghapus cache privat.
BroadcastChannel memberi tahu tab lain tentang perubahan sesi tanpa mengirim
identitas, token, atau respons API. Browser tanpa BroadcastChannel tetap memeriksa
sesi setiap 30 detik.

Pemuatan pertama menggunakan skeleton dengan dukungan reduced motion. Data yang
sudah tampil tetap tersedia saat background refresh gagal, dilengkapi waktu
pembaruan dan tombol coba lagi. Offline tanpa cache menampilkan pesan eksplisit.

Pencarian memiliki debounce 300 ms. Filter dan pagination tersimpan di URL;
Back/Forward, refresh, serta membuka detail mempertahankan parameter.
Input profil, inventaris, klarifikasi kasus, dan laporan penyelesaian dilindungi
saat meninggalkan halaman. Perubahan part/filter/penutupan form yang membuang
draft juga meminta konfirmasi. Draft chat tetap disimpan di sessionStorage seperti
sebelumnya; bila penyimpanan gagal, refresh browser diberi peringatan.
