/**
 * auto-refresh.js
 * Mesin "update otomatis" yang dipakai semua halaman (home.js, klasemen.js,
 * bagan.js, dst) supaya data ESPN ter-refresh sendiri tanpa perlu pengguna
 * menekan F5.
 *
 * Cara pakai di halaman lain, contoh (klasemen.js):
 *
 *   startAutoRefresh(async () => {
 *     const matches = await getMatches(AFF_DATES.group); // dari espn-api.js
 *     // ...render ke DOM...
 *     return matches.some((m) => m.status === 'live');
 *   }, indicatorEl);
 *
 * Interval dibuat ADAPTIF supaya hemat request ke ESPN:
 *  - Ada pertandingan live      -> refresh tiap 30 detik
 *  - Tidak ada yang live        -> refresh tiap 2 menit
 *  - Fetch/render gagal (error) -> coba lagi lebih cepat, 15 detik
 *
 * Juga otomatis refresh saat tab dibuka kembali (visibilitychange), jadi
 * kalau pengguna sempat pindah tab lalu balik lagi, data langsung disegarkan.
 */

function startAutoRefresh(renderFn, indicatorEl) {
  let timer = null;

  function setIndicator(status) {
    if (!indicatorEl) return;
    indicatorEl.classList.remove('indicator-ok', 'indicator-live', 'indicator-error');

    if (status === 'error') {
      indicatorEl.classList.add('indicator-error');
      indicatorEl.textContent = '🔴 Gagal Terhubung';
    } else if (status === true) {
      indicatorEl.classList.add('indicator-live');
      indicatorEl.textContent = '🔴 LIVE UPDATE';
    } else {
      indicatorEl.classList.add('indicator-ok');
      indicatorEl.textContent = '🟢 LIVE UPDATE';
    }
  }

  /**
   * @param {() => Promise<boolean|'error'>} renderFn fungsi yang fetch + render halaman.
   *   Harus mengembalikan:
   *     - true    -> ada pertandingan live saat ini
   *     - false   -> berhasil, tidak ada yang live
   *     - 'error' -> fetch/render gagal
   */
  async function tick() {
    let status = false;
    try {
      status = await renderFn();
    } catch (err) {
      console.error('Auto-refresh gagal:', err);
      status = 'error';
    }

    setIndicator(status);

    clearTimeout(timer);
    const delay = status === 'error' ? 15 * 1000 : status === true ? 30 * 1000 : 120 * 1000;
    timer = setTimeout(tick, delay);
  }

  // Jalankan pertama kali segera
  tick();

  // Refresh instan begitu tab dibuka lagi setelah sempat disembunyikan
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      clearTimeout(timer);
      tick();
    }
  });
}
