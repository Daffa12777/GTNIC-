# Akun teknisi dan penugasan

Rancangan mengikuti alur yang disetujui pengguna, dilanjutkan persetujuan role Owner. Owner mendapat seluruh akses supervisor dan endpoint khusus membuat/menonaktifkan supervisor. Supervisor membuat akun teknisi, menentukan keahlian dan tingkat, serta dapat menghubungkan profil teknisi lama ke akun teknisi yang sudah ada. Endpoint pembuatan akun menentukan peran di server; profil tidak dapat mengubah peran. Pengguna secara eksplisit memilih `mumtaz` sebagai Owner pertama. Setup dilakukan melalui skrip backend satu kali, mencatat audit dan mencabut sesi lama.

**Goal:** Hubungkan identitas login dengan penugasan dan tampilkan pekerjaan milik teknisi.

**Architecture:** Tambah relasi opsional unik `technicians.userId` ke `app_users`. Pertahankan data demo dan riwayatnya. Dalam mode autentikasi, penugasan baru hanya menerima teknisi dengan akun aktif. Gunakan autentikasi sesi dan transaksi yang sudah ada, tanpa Supabase Auth tambahan.

**Tech Stack:** NestJS, Prisma/PostgreSQL, React/TypeScript, Jest, Vitest.

- [x] Tambah tes regresi pembuatan akun khusus supervisor, penolakan eskalasi peran, duplikat, pengaitan profil lama, dan filter pekerjaan sendiri.
- [x] Tambah migrasi relasi, endpoint pengelolaan teknisi dengan DTO ketat, hash scrypt, transaksi dan audit tanpa password.
- [x] Hubungkan pemilihan teknisi dengan akun aktif serta batasi penyelesaian WO ke Owner/supervisor atau teknisi yang ditugaskan.
- [x] Tambah halaman Tim untuk pengelolaan akun; gunakan kembali WorkOrders untuk Tugas saya teknisi dengan filter backend.
- [x] Uji database sementara, frontend, build, browser desktop/ponsel. Pisahkan hasil lokal dan production.

Validasi lokal mencakup 109 tes backend di luar suite ML, 14 tes integrasi dengan inferensi ML deployment dan database sementara, 82 tes frontend, build frontend/Node/Vercel, dan browser 1280px/380px. Browser membuktikan pembuatan dua peran, penautan profil, penugasan, penyelesaian WO milik teknisi, pemotongan stok, dan penolakan pemalsuan Owner. Runtime Python lokal 1.7.2 tidak sesuai artefak scikit-learn 1.9.1; lingkungan ML lokal pengguna tidak diubah.

Tidak ada migrasi otomatis yang menebak bahwa akun tertentu adalah Andi/Budi/Citra. Supervisor memilih hubungan profil lama secara eksplisit. Tidak menyediakan pendaftaran publik, promosi Owner melalui UI, atau reset password tim pada perubahan ini. Akun Owner terakhir dilindungi dari penghapusan; endpoint penonaktifan hanya menerima target supervisor.
