# ASTRA — Penjelajah Antariksa 3D

Game web luar angkasa berdasarkan `PRD-GAME.md`: terbang bebas, dekati beberapa planet yang berbeda, pilih pesawat, lihat HUD navigasi, dan lanjutkan posisi terakhir. Seluruh rendering, kontrol dan penyimpanan berjalan di browser; tidak perlu akun atau database.

Proyek ini **terpisah dari Palm Grove/kebun sawit**. Di workspace pengembangan, lokasinya `game-proj/space-explorer/`. ZIP ini hanya berisi proyek ASTRA, bukan folder induk atau game sawit.

## 1. Yang tersedia

- Ruang 3D dengan bintang, nebula, serta planet berbeda ukuran/tampilan.
- Pesawat terlihat dengan kamera mengikuti dari belakang, bebas bergerak maju/mundur, naik/turun, kiri/kanan.
- Pencegahan pesawat menembus planet, termasuk saat bergerak cepat.
- HUD: nama dan jarak planet terdekat dari permukaannya, kecepatan, koordinat XYZ, arah hadap, dan indikator performa.
- Tiga tampilan pesawat: Arrow, Manta, dan Dart; pilihan disimpan lokal.
- Kontrol keyboard/mouse dan layar sentuh multi-pointer.
- Jeda, pengaturan, simpan manual, autosave, dan tombol lanjutkan.
- Kualitas Hemat GPU, Seimbang, dan HD. Hemat GPU merupakan pilihan awal.
- Three.js **0.128.0** dibundel di `public/vendor/` beserta lisensi MIT, menggunakan WebGL 1.
- Workflow GitHub Actions untuk **test → build → deploy Pages otomatis saat push**.

Tidak ada combat, multiplayer, landing di permukaan, atau misi wajib. Kebebasan eksplorasi tidak berarti semua koordinat tak terhingga dapat direpresentasikan tanpa batas presisi floating point.

## 2. Menjalankan lokal

### Prasyarat

- Python **3.10 atau lebih baru** untuk server statis dan script build.
- Browser dengan JavaScript modules dan WebGL 1 (Chrome, Edge, Firefox, atau Safari yang kompatibel).
- Node.js **22 atau lebih baru** hanya untuk tes/check JavaScript dan CI.

Tidak perlu `npm install`, `pip install`, atau API key untuk memainkan game. Paket `requirements.txt` tidak memiliki dependency runtime.

### Windows

Ekstrak ZIP, buka PowerShell pada folder `space-explorer`:

```powershell
py -3 server.py
```

Buka **http://127.0.0.1:8791/**. Bila perintah `py` tidak tersedia, gunakan `python server.py` sesuai instalasi Python Anda.

### Linux/macOS

```bash
cd space-explorer
bash setup.sh
bash run-game.sh
```

Atau langsung:

```bash
python3 server.py
```

Hentikan server dengan `Ctrl+C`. Jangan membuka `index.html` melalui `file://`, karena ES modules harus disajikan melalui HTTP(S).

### Port lain

```bash
python3 server.py --port 8080
```

Untuk membuka dari Android pada Wi-Fi yang sama:

```bash
python3 server.py --host 0.0.0.0 --port 8791
```

Buka `http://IP-LAN-KOMPUTER:8791/` di ponsel; izinkan port tersebut di firewall jaringan lokal bila diperlukan. Perintah ini sengaja membuka akses LAN, sedangkan default server hanya loopback. Fitur fullscreen dapat bergantung pada browser. HTTPS GitHub Pages direkomendasikan untuk penggunaan publik.

## 3. Build lokal

Game tidak memakai bundler atau framework. Build berarti memvalidasi referensi aset dan menyiapkan direktori rilis statis.

```bash
node --test tests/core.test.mjs
node --check public/game.js
node --check public/core.mjs
python3 scripts/build.py
python3 server.py --built
```

Pada Windows ganti `python3` dengan `py -3`. Script build:

1. Memeriksa keberadaan file wajib, ID HTML duplikat, dan referensi aset lokal.
2. Menolak symlink dan path aset yang keluar dari `public/`.
3. Membuat ulang **hanya direktori `dist/` proyek ini** dari `public/`.
4. Menambahkan `.nojekyll` dan `asset-manifest.json` dengan SHA-256.
5. Memastikan file hasil build sama dengan sumber.

Gunakan `python3 scripts/build.py --check` untuk validasi tanpa menulis `dist/`. Jangan menyimpan file penting manual di `dist/`, karena direktori tersebut adalah output build yang dapat dibuat ulang.

Alias opsional: `npm test`, `npm run check`, `npm run build`, `npm start`. Alias build/start memakai `python3`; di Windows lebih mudah memakai perintah Python langsung.

## 4. GitHub Pages: build dan deploy otomatis

### Struktur repository yang benar

**Ekstrak ZIP, lalu masukkan ISI folder `space-explorer/` ke root repository GitHub.** Folder `.github` termasuk file tersembunyi dan harus ikut di-commit.

```text
repository/
├── .github/workflows/pages.yml
├── public/index.html
├── public/game.js
├── public/core.mjs
├── public/vendor/three.module.js
├── scripts/build.py
├── tests/core.test.mjs
├── server.py
├── package.json
└── README.md
```

Jangan mengunggah ZIP sebagai satu file lalu berharap GitHub mengekstraknya. Jangan meletakkan workflow di `repository/space-explorer/.github/`: GitHub hanya membaca workflow dari **root `.github/workflows/`**.

Jika game sawit sudah ada di repository lain, gunakan repository baru untuk ASTRA. Tidak perlu menimpa folder/file game sawit. Hosting beberapa proyek dalam satu repository membutuhkan perubahan path workflow tersendiri dan bukan konfigurasi default ZIP ini.

### Langkah pertama

1. Buat repository GitHub baru, misalnya `astra-space-explorer`. Repository publik adalah pilihan paling sederhana untuk Pages; ketersediaan Pages repository privat bergantung pada paket akun GitHub.
2. Push isi proyek ke branch `main` (atau `master`).
3. Buka **Settings → Pages → Build and deployment → Source → GitHub Actions**. Aktifkan GitHub Actions bila dinonaktifkan oleh repository/organisasi.
4. Buka tab **Actions → Test, Build and Deploy ASTRA to Pages**. Jika run pertama gagal karena Pages belum diaktifkan, pilih **Re-run all jobs** setelah langkah 3 atau jalankan **Run workflow**.
5. Setelah job `build` dan `deploy` berhasil, URL terlihat pada environment `github-pages` dan Settings → Pages.

Contoh URL untuk repository proyek:

```text
https://USERNAME.github.io/astra-space-explorer/
```

`USERNAME` dan nama repository adalah placeholder; ZIP tidak terikat akun GitHub tertentu. Aset memakai URL relatif sehingga tetap bisa dimuat di subpath `/nama-repository/`.

Contoh upload melalui Git (ganti URL remote):

```bash
git init
git branch -M main
git add .
git commit -m "Add ASTRA space explorer"
git remote add origin https://github.com/USERNAME/astra-space-explorer.git
git push -u origin main
```

Autentikasi Git dilakukan oleh pengguna melalui credential manager/SSH/GitHub CLI; jangan menyimpan token di source, README, atau workflow.

### Auto redeploy berikutnya

```bash
git add .
git commit -m "Update game"
git push
```

Setiap push ke **main/master** memicu:

1. Checkout kode.
2. Menyiapkan Node 22 dan Python 3.12 pada runner.
3. Menjalankan tes core serta pemeriksaan sintaks.
4. Menjalankan `scripts/build.py`.
5. Mengunggah `dist/` sebagai Pages artifact.
6. Deploy ke Pages hanya jika tahap sebelumnya berhasil.

Pull request ke main/master menjalankan test/build, **tanpa deploy**. `workflow_dispatch` memungkinkan build/deploy manual. Jika branch produksi berbeda, ubah daftar `branches` di workflow. Workflow memakai token otomatis GitHub dengan izin `contents: read`, `pages: write`, `id-token: write`; tidak perlu membuat personal access token untuk deploy ini.

**Status paket:** konfigurasi disertakan dan build lokal diuji; tidak ada repository remote atau URL GitHub Pages pengguna yang dibuat/deploy oleh pembuatan ZIP ini.

## 5. Kendali dan HUD

| Kendali desktop | Aksi |
|---|---|
| W / S | Maju / mundur |
| A / D | Geser kiri / kanan |
| Q / E | Naik / turun |
| Panah / drag mouse | Arahkan pesawat |
| Shift sambil bergerak | Boost |
| Space | Rem |
| Escape | Jeda/lanjut |

Android: joystick kiri mengarahkan pesawat; tombol kanan mengatur translasi, naik/turun, boost dan rem. Beberapa sentuhan dapat digunakan bersamaan. Tidak ada APK; ini game web yang dimainkan di browser Android/desktop.

Kecepatan menggunakan unit dunia per detik (`u/s`), bukan simulasi fisika astronomis. Jarak planet merupakan jarak ke permukaan, bukan pusatnya. Untuk mengganti pesawat/kualitas saat bermain, buka **Jeda → Pesawat & pengaturan → Lanjutkan petualangan**.

## 6. Save dan preferensi

Bentuk snapshot mengikuti PRD:

```json
{
  "position": {"x": 0, "y": 0, "z": 140},
  "rotation": {"x": 0, "y": 0, "z": 0},
  "lastSaved": "2026-01-01T00:00:00.000Z"
}
```

Snapshot memiliki tambahan `version: 1` dan `world: "astra-space-explorer"` untuk menolak data game lain/rusak. Tanggal/koordinat di atas hanya contoh. Snapshot aktual ditulis game sesuai posisi/waktu sesi. Preferensi yang tersimpan menggunakan `selectedShip`, `soundEnabled`, `hudOpacity` dan `quality`; engine memetakan nama itu ke state internalnya.

Kunci nyata dibuat spesifik: **`spaceExplorer.gameState`** dan **`spaceExplorer.playerSettings`**. Ini sengaja mengganti nama generik PRD agar save game lain, seperti Palm Grove, tidak tertimpa. Repository GitHub Pages milik pengguna yang sama dapat berbagi origin `USERNAME.github.io` meskipun path berbeda.

- Autosave berkala, saat halaman disembunyikan/ditinggalkan, dan tombol simpan manual.
- Save hanya berada di browser/origin yang sama; tidak sinkron antarperangkat atau localhost/Pages.
- Private mode, blokir storage, atau penghapusan data browser dapat menghilangkan progres.
- Menutup aplikasi secara paksa bisa melewatkan event penutupan; autosave periodik membatasi kehilangan progres, bukan menjamin setiap frame tersimpan.
- Save rusak ditolak; saat resume kecepatan direset agar pesawat tidak langsung meluncur.

## 7. Performa dan kompatibilitas

Mode awal Hemat GPU menggunakan resolusi terbatas, objek low-poly, tanpa shadow map atau postprocessing berat. HD adalah opsi untuk perangkat lebih kuat, bukan janji FPS tertentu. Three.js r128 dipertahankan untuk WebGL 1; ini tidak melewati pembatasan browser/driver pada GPU lama.

Belum ada pengujian langsung pada Intel HD 3000 maupun HP Android fisik. Browser emulasi server bukan benchmark GPU perangkat pengguna. Turunkan kualitas bila frame rate rendah, perangkat panas, atau memori terbatas. Jika WebGL gagal, periksa dukungan browser/driver dan pesan pada layar.

## 8. Pengujian dan struktur

Tes core tidak memerlukan dependency npm. Untuk pengujian browser opsional:

```bash
python3 -m pip install -r requirements-dev.txt
python3 -m playwright install chromium
GAME_URL=http://127.0.0.1:8791 python3 tests/browser_smoke.py
```

Jika memiliki executable Chromium sendiri, set `CHROME_EXECUTABLE=/path/to/chrome`. Lihat `VERIFICATION.md` untuk pemeriksaan yang benar-benar dijalankan pada paket ini. Tes browser tidak berjalan otomatis di workflow ringan ini; CI menjalankan tes logika, sintaks, dan build aset.

- `public/`: seluruh runtime client dan lisensi Three.js; satu-satunya direktori yang menjadi situs.
- `scripts/build.py`: validator dan builder statis.
- `server.py`: server HTTP lokal, bukan backend data game.
- `tests/`: tes core dan browser.
- `.github/workflows/pages.yml`: pipeline test/build/deploy.
- `PRD-GAME.md`: salinan PRD asli.
- `requirements.txt`: tidak ada dependency Python runtime.

ZIP tidak memuat cache, profile browser, cookie, credential, node_modules, atau game sawit.

## 9. Troubleshooting

- **Halaman 404 di Pages:** periksa workflow sukses dan Source adalah GitHub Actions; gunakan URL dengan path repository yang benar.
- **Workflow tidak muncul:** pastikan `.github/workflows/pages.yml` ada di root repository, bukan di dalam satu folder tambahan.
- **Deploy ditolak:** pastikan Pages aktif serta GitHub Actions dan permission deploy diizinkan repository/organisasi. Baca job gagal di tab Actions.
- **Layar kosong/module error:** gunakan HTTP(S), bukan file://; jangan menghapus vendor Three.js; cek Console browser.
- **Versi lama masih terlihat:** refresh/cache reload browser setelah deployment sukses.
- **Tidak bisa mengontrol di HP:** mulai game terlebih dahulu; pastikan overlay jeda ditutup; gunakan tombol/joystick dalam viewport dan browser dengan Pointer Events.
- **Save berbeda di URL baru:** localStorage memang terikat origin; ini perilaku browser.

## 10. Lisensi komponen

Three.js 0.128.0 berlisensi MIT; teks lisensi disertakan pada `public/vendor/THREE-LICENSE.txt`. Planet, pesawat, tekstur dan ikon proyek dibuat prosedural/lokal. Tidak ada model 3D berbayar atau layanan AI eksternal yang dibutuhkan saat memainkan game.
