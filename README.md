# ASEAN Championship (Piala AFF) 2026 — Jadwal, Klasemen & Top Skor

Situs statis (HTML/CSS/JS biasa, tanpa framework/build step) yang menampilkan
jadwal pertandingan, klasemen, dan daftar top skor ASEAN Championship 2026,
datanya diambil **langsung dari API publik ESPN** (tanpa API key).

## Struktur file

| File               | Fungsi                                                        |
| ------------------ | --------------------------------------------------------------|
| `beranda.html`     | Halaman utama (ringkasan jadwal, klasemen, top skor)           |
| `jadwal.html`      | Jadwal lengkap semua pertandingan                              |
| `klasmen.html`     | Klasemen per grup                                              |
| `topscore.html`    | Daftar top skor & top assist                                   |
| `index.html`       | Entry point `/` yang mengarah ke `beranda.html`                |
| `teams.js`         | Konfigurasi bersama (slug liga ESPN, rentang tanggal turnamen) |
| `espn-api.js`      | Wrapper fetch + normalisasi data dari ESPN                     |
| `auto-refresh.js`  | Mesin polling otomatis (adaptif: 30 detik saat live, 2 menit saat tidak) |
| `api/espn.js`      | Serverless function (Vercel) — proxy ke ESPN, menghindari isu CORS/rate-limit |
| `vercel.json`      | Konfigurasi routing & cache untuk Vercel                       |

## Sumber data

Semua data (jadwal, skor, klasemen, top skor) diambil langsung dari endpoint
publik ESPN (`site.api.espn.com`), liga: **`aff.championship`**. Tidak ada data
dummy/hardcode — semua container di HTML kosong sampai diisi oleh JavaScript
saat halaman dimuat.

Jadwal turnamen 2026 sudah dikonfirmasi AFF:
- Babak grup: 24 Juli – 8 Agustus 2026
- Semifinal: 15–19 Agustus 2026
- Final: 23–26 Agustus 2026

Rentang tanggal fetch (`TOURNAMENT_DATE_RANGE` di `teams.js`) sudah diatur
sesuai jadwal ini (dengan sedikit buffer). Kalau AFF/ESPN mengubah jadwal,
cukup ubah nilai `start`/`end` di file itu.

## Cara kerja proxy `/api/espn`

Browser tidak langsung fetch ke `site.api.espn.com`, melainkan lewat
`/api/espn?url=...` (serverless function di `api/espn.js`). Alasannya:

1. Menghindari kemungkinan masalah CORS kalau ESPN mengubah kebijakan mereka.
2. Request dari banyak pengguna bisa di-cache sebentar di Edge Vercel
   (`s-maxage=20`), jadi tidak semua orang memicu request baru ke ESPN.
3. Kalau proxy gagal (misalnya situs dibuka sebagai file statis biasa tanpa
   Vercel), `espn-api.js` otomatis **fallback** fetch langsung ke ESPN dari
   browser — jadi tetap jalan meski di luar Vercel.

## Deploy ke Vercel dari GitHub

1. Push seluruh folder ini ke sebuah repo GitHub.
2. Buka [vercel.com](https://vercel.com) → **Add New... → Project** → pilih
   repo tersebut.
3. Framework preset: pilih **Other** (situs ini statis + 1 serverless
   function, tidak perlu build step apa pun). Build Command & Output
   Directory boleh dikosongkan/default.
4. Klik **Deploy**. Selesai — tidak ada environment variable yang diperlukan
   karena ESPN API publik tidak butuh API key.
5. Setelah deploy, buka domain Vercel kamu:
   - `/` akan otomatis menampilkan `beranda.html` (lihat rewrite di
     `vercel.json`).
   - `/api/espn?url=...` adalah endpoint proxy yang dipakai otomatis oleh
     frontend, tidak perlu diakses manual.

### Coba lokal dengan Vercel CLI (opsional)

```bash
npm i -g vercel
vercel dev
```

Ini akan menjalankan situs statis **dan** serverless function `api/espn.js`
sekaligus secara lokal, jadi perilakunya sama persis seperti di production.

## Auto-refresh

Setiap halaman melakukan polling otomatis ke ESPN lewat `auto-refresh.js`:
- Ada pertandingan live → refresh tiap 30 detik.
- Tidak ada yang live → refresh tiap 2 menit.
- Kalau fetch gagal → coba lagi lebih cepat (15 detik) dan indikator berubah
  merah ("Gagal Terhubung").

Indikator status ada di pojok kanan atas tiap halaman.
