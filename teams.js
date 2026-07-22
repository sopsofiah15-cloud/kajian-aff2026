/**
 * teams.js
 * Konfigurasi bersama untuk ASEAN Championship (Piala AFF) 2026 di ESPN.
 * Dipakai oleh espn-api.js dan semua halaman (beranda, jadwal, klasmen, topscore).
 *
 * PENTING - bug yang diperbaiki di sini:
 *   Sebelumnya beranda.html menge-hardcode slug 'aff.aff' yang TIDAK VALID.
 *   Slug yang benar dan sudah diverifikasi (dipakai langsung oleh espn.com untuk
 *   scoreboard/stats ASEAN Championship) adalah 'aff.championship'.
 */

const ESPN_LEAGUE_SLUG = 'aff.championship';

// Endpoint scoreboard & statistik pemain ada di /apis/site/v2/
const ESPN_BASE = `https://site.api.espn.com/apis/site/v2/sports/soccer/${ESPN_LEAGUE_SLUG}`;

// Endpoint klasemen (standings) HARUS pakai /apis/v2/ — /apis/site/v2/.../standings
// selalu mengembalikan objek kosong {} untuk soccer di ESPN.
const ESPN_STANDINGS_BASE = `https://site.api.espn.com/apis/v2/sports/soccer/${ESPN_LEAGUE_SLUG}`;

// Rentang tanggal turnamen dipakai untuk fetch jadwal/scoreboard.
// Jadwal resmi ASEAN Championship (Piala AFF) 2026 sudah dikonfirmasi:
//   - Babak grup   : 24 Juli - 8 Agustus 2026
//   - Semifinal     : 15 - 19 Agustus 2026
//   - Final          : 23 - 26 Agustus 2026
// Rentang diberi sedikit buffer di kedua sisi supaya tetap aman kalau ada
// penyesuaian jadwal kecil dari AFF/ESPN.
const TOURNAMENT_DATE_RANGE = { start: '20260720', end: '20260831' };

// Dipakai oleh contoh di auto-refresh.js / klasemen per grup.
const AFF_DATES = {
  group: TOURNAMENT_DATE_RANGE,
};
