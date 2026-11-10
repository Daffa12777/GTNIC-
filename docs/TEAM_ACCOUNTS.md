# Akun dan penugasan tim

Owner mendapat seluruh akses supervisor serta dapat membuat dan menonaktifkan supervisor. Supervisor hanya dapat membuat akun teknisi. Teknisi tidak dapat membuat akun lain atau mengubah perannya melalui Profil. Agent tidak memiliki tool pengelolaan akun.

## Membuat akun

1. Login sebagai Owner atau supervisor dan buka **Tim** di navbar.
2. Isi nama, username, kata sandi awal minimal 12 karakter. Untuk teknisi, pilih keahlian dan tingkat junior/senior.
3. Klik **Buat akun teknisi**. Owner juga dapat memilih **Supervisor** pada peran akun baru.
4. Bagikan kredensial secara pribadi. Pemilik akun dapat mengganti kata sandinya melalui Profil.

Kata sandi tidak ditampilkan kembali setelah akun dibuat. Username yang sudah dipakai ditolak; akun dan profil teknisi dibuat dalam satu transaksi.

## Akun teknisi lama

Profil demo seperti Andi/Budi/Citra terpisah dari akun login. Pada **Tim → Hubungkan akun yang sudah ada**, pilih profil dan akun teknisi aktif yang benar. Penautan membawa riwayat penugasan profil tersebut ke akun itu. Satu akun hanya dapat terhubung ke satu profil. Owner/supervisor tidak dapat ditautkan sebagai teknisi.

Profil lama tetap dipertahankan untuk riwayat. Pada mode autentikasi, profil tanpa akun aktif tidak menerima penugasan baru. Tidak ada pemetaan nama yang ditebak otomatis.

## Menguji penugasan

1. Owner/supervisor membuka WO aktif lalu **Tugaskan teknisi**.
2. Pilih teknisi dengan akun aktif, keahlian sesuai, tingkat sesuai, dan tersedia.
3. Logout lalu login sebagai teknisi tersebut. Buka **Tugas saya**; daftar berasal dari penugasan akun yang login.
4. Isi hasil pemeriksaan dan selesaikan WO. Teknisi lain tidak dapat menyelesaikannya melalui UI maupun permintaan API langsung.
5. Jika WO mencantumkan part, penyelesaian mengurangi satu unit stok dan menyimpan riwayat mutasi. Stok kosong menolak penutupan.

## Owner pertama

Operator instalasi menjalankan migrasi terlebih dahulu, kemudian dari folder backend:

```powershell
npm.cmd run db:migrate
npm.cmd run owner:setup -- <username-supervisor>
```

Jalankan pada database yang telah diverifikasi sebagai target instalasi. Setup pertama hanya berlaku jika belum ada Owner dan target adalah supervisor aktif. Sesi lama target dicabut sehingga perlu login ulang. Tidak ada endpoint publik untuk membuat Owner. Owner terakhir tidak dapat dihapus, dan endpoint penonaktifan supervisor tidak menerima akun Owner.

Pembuatan akun, penautan profil, penonaktifan supervisor, dan setup Owner tercatat di audit. Penonaktifan supervisor mencabut seluruh sesi akun target. Migrasi tidak menghapus akun, profil teknisi, maupun WO lama.
