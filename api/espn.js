/**
 * api/espn.js
 * Serverless function (Vercel) yang jadi proxy antara frontend dan ESPN.
 *
 * Kenapa perlu proxy, bukan fetch langsung dari browser?
 *  - Menghindari kemungkinan masalah CORS kalau ESPN sewaktu-waktu mengetatkan
 *    header Access-Control-Allow-Origin mereka.
 *  - Semua request ESPN "lewat" satu titik server, jadi lebih gampang di-cache
 *    di Edge Vercel (mengurangi jumlah request ke ESPN & mempercepat load).
 *  - Origin yang dikirim ke ESPN adalah origin server Vercel, bukan browser
 *    tiap pengguna, sehingga lebih kecil kemungkinan kena rate-limit per-IP.
 *
 * Cara pakai (dipanggil otomatis oleh espn-api.js di frontend):
 *   GET /api/espn?url=<url ESPN yang sudah di-encode>
 *
 * Demi keamanan, hanya host ESPN yang di-whitelist di bawah ini yang boleh
 * diteruskan (mencegah endpoint ini disalahgunakan sebagai open proxy / SSRF).
 */

const ALLOWED_HOSTS = new Set([
  'site.api.espn.com',
  'site.web.api.espn.com',
]);

module.exports = async function handler(req, res) {
  // Izinkan dipanggil dari mana saja (frontend kita sendiri, atau kalau mau
  // dites langsung dari domain lain saat development).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    res.status(400).json({ error: 'Parameter "url" wajib diisi.' });
    return;
  }

  let target;
  try {
    target = new URL(rawUrl);
  } catch (e) {
    res.status(400).json({ error: 'URL tidak valid.' });
    return;
  }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    res.status(403).json({ error: 'Host tidak diizinkan: ' + target.hostname });
    return;
  }

  try {
    const espnRes = await fetch(target.toString(), {
      headers: { accept: 'application/json' },
    });

    const bodyText = await espnRes.text();

    // Cache singkat di Edge Vercel supaya banyak pengguna yang buka halaman
    // bersamaan tidak masing-masing memicu request baru ke ESPN.
    res.setHeader('Cache-Control', 's-maxage=20, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(espnRes.status).send(bodyText);
  } catch (err) {
    res.status(502).json({
      error: 'Gagal mengambil data dari ESPN.',
      detail: err && err.message ? err.message : String(err),
    });
  }
};
