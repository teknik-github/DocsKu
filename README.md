# Docsku

Situs dokumentasi bergaya [platform.claude.com/docs](https://platform.claude.com/docs) dengan dashboard penulisan seperti Ghost/WordPress. Konten disimpan di PostgreSQL dan ditulis lewat editor blok di `/admin`.

## Fitur

- Situs dokumentasi: tab header, sidebar, daftar isi otomatis, pencarian (Ctrl+K), mode gelap, blok kode berwarna, dan tiga tema tampilan yang bisa dipilih.
- Dashboard `/admin`: editor blok (menu `/`), simpan otomatis, terbit/perbarui/jadwalkan, pratinjau draf, riwayat revisi, unggah gambar, navigasi, pengaturan situs.
- Pengguna dengan peran **Admin** (semua akses) dan **Editor** (halaman dan media).

## Menjalankan

Butuh Node.js 20+, pnpm, dan Docker.

```bash
pnpm install
cp .env.example .env         # isi POSTGRES_PASSWORD
cp .env.example .env.local   # isi DATABASE_URL (password yang sama) dan CRON_SECRET
pnpm db:up                   # PostgreSQL di 127.0.0.1:5491
pnpm db:migrate
pnpm db:seed                 # halaman contoh, navigasi, pengaturan
pnpm dev -H 0.0.0.0
```

Buka `/admin`. Saat pertama kali, Anda diarahkan ke `/admin/setup` untuk membuat akun admin.

`CRON_SECRET` bisa dibuat dengan `openssl rand -hex 24`.

## Beranda

Buka **Beranda** di dashboard untuk mengedit halaman depan (`/`) dengan editor blok. Blok **Hero** (judul besar, tombol, kolom pencarian, contoh kode) tersedia di menu `/`. Judul `##` di beranda tampil sebagai pembatas bagian. Selama beranda belum diterbitkan, situs memakai beranda bawaan.

## Tema dokumentasi

Buka **Tema** di dashboard (khusus admin) untuk memilih tampilan `/docs`:

- **Dokumentasi:** sidebar kiri dan daftar isi di kanan, seperti platform.claude.com.
- **Hibrida:** halaman `/docs` berisi kartu per bagian. Artikel di tengah dengan breadcrumb, menu **Di bagian ini**, dan halaman terkait. Tab di header membuka menu dropdown.
- **Ghost (blog):** hero, filter topik, dan grid kartu dengan halaman unggulan di depan. Artikel bergaya blog dengan sampul lebar dan bagian **Tulisan lain**.

Setiap halaman bisa diberi **gambar sampul** (di atas judul pada editor) dan ditandai **Halaman unggulan** (di panel Pengaturan halaman). Halaman tanpa sampul memakai gambar gradasi otomatis.

## Otomatisasi

Atur di **Pengaturan → Otomatisasi**. Semua langkah berjalan saat Anda menerbitkan atau menjadwalkan halaman. AI tidak pernah menerbitkan sendiri.

- **Navigasi otomatis:** halaman yang pertama kali terbit masuk ke bagian navigasi yang dipilih di panel **Pengaturan halaman**. Jika dibiarkan **Otomatis**, AI memilih bagian yang paling cocok (tanpa AI: bagian pertama). Pilih **Jangan tambahkan ke navigasi** untuk halaman yang tidak perlu tampil di sidebar.
- **Slug otomatis:** URL sementara `tanpa-judul…` diganti dengan URL dari judul.
- **Deskripsi & SEO otomatis:** deskripsi, meta title, dan meta description yang masih kosong ditulis AI dari isi halaman.
- **Sampul otomatis:** halaman tanpa sampul memakai gambar buatan (gradasi dengan judul) di kartu dan pratinjau media sosial. Warnanya bisa dipilih dari palet, **Bervariasi** (warna berbeda per halaman), atau warna sendiri.

Di **AI Chat**, minta rencana konten (mis. "buat 4 tulisan tentang X, terbit tiap Senin"). Agen mengusulkan beberapa halaman sekaligus lengkap dengan bagian navigasi dan jadwal terbit. Anda yang memutuskan: **Buat & jadwalkan**, **Draf saja**, atau **Buat semua & jadwalkan**. Usulan tanpa jadwal bisa langsung diterbitkan dengan **Buat & terbitkan**.

## AI Write (DeepSeek)

1. Buat API key di [platform.deepseek.com](https://platform.deepseek.com).
2. Di dashboard, buka **Pengaturan → AI Write**: centang **Aktif**, pilih penyedia **DeepSeek**, isi API key (daftar model terdeteksi otomatis), lalu klik **Tes koneksi** dan **Simpan**.
3. Di editor: ketik `/ai` (atau `/tulis`), pilih teks lalu klik **AI**, atau klik **Buat deskripsi dengan AI** di bawah judul.

API key disimpan terenkripsi dengan `ENCRYPTION_KEY` dan tidak pernah dikirim ke browser. Alternatifnya, isi `AI_API_KEY` di `.env.local`. Penyedia lain yang kompatibel dengan OpenAI (OpenAI, OpenRouter, Ollama) juga bisa dipilih.

## AI Chat

Agen penulis di **AI Chat** (menu dashboard) dan di panel **AI Chat** pada editor. Agen bisa memberi ide topik dan kerangka, menulis draf halaman baru, mengusulkan perubahan judul, isi, dan SEO halaman yang terbuka, serta membaca halaman lain untuk konteks. Semua perubahan berupa usulan: klik **Terapkan**, **Buat draf**, atau **Buat & jadwalkan** untuk memakainya. Agen tidak pernah menerbitkan sendiri.

- **Riwayat:** percakapan tersimpan per pengguna di database. Buat baru, buka lagi, ganti nama, atau hapus dari daftar riwayat.
- **Model:** pilih model per percakapan dari daftar yang terdeteksi otomatis.
- **Ringkas otomatis:** percakapan panjang diringkas sendiri agar tetap hemat token. Bisa juga lewat tombol **Ringkas sekarang**.
- **Hemat token:** prompt disusun agar memanfaatkan *prompt caching* DeepSeek. Jumlah token, termasuk yang diambil dari cache, tampil di bawah setiap jawaban. Aksi AI Write yang sama persis dijawab dari cache server tanpa memakai token.

## SEO

Panel **Pengaturan halaman** di editor berisi meta title, meta description, gambar pratinjau sosial (Open Graph), dan noindex, lengkap dengan pratinjau hasil pencarian. Isi `SITE_URL` di `.env.local` (mis. `https://docs.contoh.com`) agar gambar pratinjau sosial memakai alamat lengkap.

## Produksi (Docker)

Aplikasi berjalan di container (`Dockerfile`, `docker-compose.prod.yml`) di atas PostgreSQL yang sama (`docker-compose.yml`). HTTPS diurus oleh reverse proxy Anda sendiri.

1. `cp .env.production.example .env.production`, lalu isi:
   - `SITE_URL`: alamat publik situs, mis. `https://docs.contoh.com`.
   - `POSTGRES_PASSWORD`: sama dengan `.env`. `CRON_SECRET` dan `ENCRYPTION_KEY`: sama dengan `.env.local`, supaya API key AI yang tersimpan tetap bisa dibaca.
2. Jalankan `pnpm prod:deploy` (atau `sh deploy/deploy.sh`). Urutannya: PostgreSQL, migrasi, build image, lalu menjalankan aplikasi. Jalankan ulang perintah ini setiap ada perubahan kode atau `SITE_URL`.
3. Arahkan reverse proxy Anda ke `http://127.0.0.1:3020` (ubah lewat `APP_PORT`). Proxy wajib:
   - **menimpa** `X-Forwarded-For` dengan IP klien (jangan meneruskan nilai dari klien), serta mengirim `X-Forwarded-Proto: https` dan `Host` asli (atau `X-Forwarded-Host`);
   - mematikan buffering, supaya jawaban AI dan halaman tampil bertahap;
   - menerima body sampai ±12 MB (upload gambar maks. 10 MB).

   Contoh Nginx:

   ```nginx
   location / {
       proxy_pass http://127.0.0.1:3020;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_buffering off;
       client_max_body_size 12m;
   }
   ```

`pnpm prod:logs` menampilkan log aplikasi, `pnpm prod:stop` menghentikannya. Cek kesehatan: `GET /api/health`.

Catatan:

- Aplikasi hanya mendengar di `127.0.0.1` dan memercayai header `X-Forwarded-*` (`TRUST_PROXY=1`). Jangan buka port-nya langsung ke internet.
- Build membaca halaman dari database lewat `127.0.0.1:5491`, jadi PostgreSQL harus berjalan saat deploy. `deploy.sh` sudah menyalakannya.
- Gambar upload memakai folder `storage/uploads` yang sama dengan mode dev. Container berjalan sebagai uid 10001, yang tidak dipakai akun mana pun di host; `deploy.sh` menyesuaikan pemilik folder itu.
- Jangan menjalankan server dev dan produksi bersamaan untuk jangka panjang. Keduanya memakai database yang sama tetapi cache-nya terpisah, jadi perubahan dari satu sisi baru terlihat di sisi lain setelah restart.

## Perintah

| Perintah | Fungsi |
| --- | --- |
| `pnpm dev` | Server pengembangan |
| `pnpm build` / `pnpm start` | Build dan jalankan produksi (database harus aktif saat build) |
| `pnpm db:up` | Menjalankan container PostgreSQL |
| `pnpm db:generate` | Membuat migrasi dari perubahan `db/schema.ts` |
| `pnpm db:migrate` | Menerapkan migrasi |
| `pnpm db:seed` | Mengimpor konten contoh (hanya jika belum ada halaman) |
| `pnpm db:seed --force` | Mengganti semua halaman, navigasi, dan pengaturan dengan contoh |
| `pnpm db:studio` | Drizzle Studio untuk melihat isi database |
| `pnpm prod:deploy` | Migrasi, build, dan jalankan versi produksi di Docker |
| `pnpm prod:logs` / `pnpm prod:stop` | Log / hentikan aplikasi produksi |

## Catatan

- Gambar yang diunggah disimpan di `UPLOAD_DIR` (bawaan `./storage/uploads`). Sertakan folder ini dalam backup bersama database.
- Halaman terjadwal diterbitkan oleh server setiap menit. Di platform tanpa server yang berjalan terus (serverless), panggil `POST /api/internal/publish-scheduled` dengan header `Authorization: Bearer $CRON_SECRET` dari cron eksternal, lalu set `DISABLE_SCHEDULER=1`.
- Keamanan: jalankan produksi (`pnpm build && pnpm start`) di belakang reverse proxy berHTTPS (Caddy/Nginx), lalu set `TRUST_PROXY=1` agar batas percobaan login juga dihitung per IP. Tanpa proxy, header `X-Forwarded-*` diabaikan karena bisa dipalsukan klien.
- Jika situs diakses lewat domain atau tunnel saat mode dev, tambahkan `DEV_ORIGINS=nama.domain` agar halaman bisa ter-hydrate.
