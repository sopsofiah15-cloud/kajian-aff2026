/**
 * espn-api.js
 * Wrapper untuk mengambil data ASEAN Championship 2026 langsung dari
 * endpoint publik ESPN (tidak perlu API key).
 *
 * Endpoint ESPN yang dipakai:
 *  - /apis/site/v2/.../scoreboard?dates=YYYYMMDD-YYYYMMDD  -> jadwal + skor
 *  - /apis/v2/.../standings                                -> klasemen
 *      (catatan: /apis/site/v2/.../standings SELALU balikin {} kosong untuk
 *       soccer, makanya klasemen wajib pakai path /apis/v2/, lihat teams.js)
 *  - /apis/site/v2/.../statistics                          -> statistik pemain
 *      (dipakai untuk daftar top skor / assist)
 *
 * PRASYARAT: file ini butuh teams.js dimuat SEBELUMNYA (menyediakan
 * ESPN_BASE, ESPN_STANDINGS_BASE, ESPN_LEAGUE_SLUG, TOURNAMENT_DATE_RANGE).
 *
 * Hasil di-cache sebentar di sessionStorage supaya pindah halaman tidak
 * fetch ulang terus-menerus, tapi tetap "segar" (auto expired 25 detik).
 *
 * Mesin auto-refresh (polling berkala) ADA DI FILE TERPISAH: auto-refresh.js
 */

const ESPN_CACHE_TTL_MS = 25 * 1000; // 25 detik (lebih pendek dari interval polling live)

/**
 * Fetch JSON dari ESPN dengan cache sessionStorage.
 *
 * Prioritas jalur fetch:
 *  1. Lewat serverless proxy sendiri (/api/espn?url=...) — ini yang dipakai saat
 *     situs sudah di-deploy ke Vercel (lihat api/espn.js). Proxy ini menghindari
 *     kemungkinan masalah CORS/rate-limit kalau browser fetch langsung ke ESPN,
 *     dan juga bisa memanfaatkan cache Edge Vercel.
 *  2. Kalau proxy gagal/tidak tersedia (misal dibuka sebagai file statis biasa,
 *     atau dev server tanpa serverless function), langsung fallback fetch ke
 *     ESPN dari browser.
 */
async function espnFetchJSON(url) {
  const cacheKey = 'espn_cache_' + url;
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < ESPN_CACHE_TTL_MS) {
        return parsed.data;
      }
    }
  } catch (e) {
    /* sessionStorage tidak tersedia, lanjut fetch biasa */
  }

  const data = await espnFetchJSONNoCache(url);

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    /* storage penuh / tidak tersedia, abaikan */
  }

  return data;
}

async function espnFetchJSONNoCache(url) {
  const proxyUrl = '/api/espn?url=' + encodeURIComponent(url);

  try {
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('Proxy HTTP ' + res.status);
    return await res.json();
  } catch (proxyError) {
    // Fallback: fetch langsung ke ESPN (misal proxy /api tidak tersedia,
    // contoh saat dibuka sebagai file statis tanpa Vercel).
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('ESPN API error: HTTP ' + res.status);
    }
    return await res.json();
  }
}

/* =========================================================================
 * JADWAL & SKOR (scoreboard)
 * ========================================================================= */

/**
 * Ambil semua event (pertandingan) ESPN dalam rentang tanggal tertentu.
 * @param {{start: string, end: string}} range format YYYYMMDD
 * @returns {Promise<Array>} array event mentah dari ESPN
 */
async function fetchEspnEvents(range) {
  const url = `${ESPN_BASE}/scoreboard?dates=${range.start}-${range.end}&limit=200`;
  const data = await espnFetchJSON(url);
  return Array.isArray(data.events) ? data.events : [];
}

/**
 * Ubah 1 event mentah ESPN jadi objek pertandingan yang lebih ringkas
 * dan gampang dipakai buat render UI.
 */
function normalizeEspnEvent(ev) {
  const comp = (ev.competitions && ev.competitions[0]) || {};
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home') || {};
  const away = competitors.find((c) => c.homeAway === 'away') || {};

  const statusType = (comp.status && comp.status.type) || {};
  const state = statusType.state || 'pre'; // pre | in | post
  let status = 'scheduled';
  if (state === 'in') status = 'live';
  else if (state === 'post') status = statusType.completed ? 'finished' : 'finished';

  const venue = comp.venue || {};
  const groupNote = comp.altGameNote || (comp.notes && comp.notes[0] && comp.notes[0].headline) || '';
  const groupMatch = groupNote.match(/Group\s+([A-Z])/i);

  return {
    id: ev.id,
    date: ev.date, // ISO string UTC
    status,
    statusDetail: statusType.shortDetail || statusType.detail || '',
    home: {
      name: home.team ? home.team.displayName : '',
      score: home.score !== undefined ? parseInt(home.score, 10) : null,
      winner: !!home.winner,
      logo: home.team ? home.team.logo : '',
    },
    away: {
      name: away.team ? away.team.displayName : '',
      score: away.score !== undefined ? parseInt(away.score, 10) : null,
      winner: !!away.winner,
      logo: away.team ? away.team.logo : '',
    },
    venueName: venue.fullName || '',
    venueCity: venue.address ? venue.address.city : '',
    venueCountry: venue.address ? venue.address.country : '',
    group: groupMatch ? groupMatch[1] : (groupNote.toLowerCase().includes('semifinal') ? 'SF' :
      (groupNote.toLowerCase().includes('final') ? 'F' : null)),
    note: groupNote,
    details: comp.details || [],
    raw: ev,
  };
}

/**
 * Ambil & normalisasi semua pertandingan dalam satu rentang tanggal.
 * Fungsi inilah yang dipanggil oleh startAutoRefresh() (lihat auto-refresh.js)
 * di setiap tick-nya untuk mendapat data terbaru dari ESPN.
 */
async function getMatches(range) {
  const events = await fetchEspnEvents(range);
  return events.map(normalizeEspnEvent).sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* =========================================================================
 * KLASEMEN (standings)
 * ========================================================================= */

/**
 * Cari nilai statistik entry standings berdasarkan beberapa kemungkinan nama
 * field (ESPN tidak selalu konsisten nama field antar liga).
 */
function pickStat(stats, names, fallback = 0) {
  if (!Array.isArray(stats)) return fallback;
  for (const n of names) {
    const found = stats.find((s) => (s.name || s.abbreviation || '').toLowerCase() === n.toLowerCase());
    if (found) {
      const v = found.value !== undefined ? found.value : found.displayValue;
      const num = typeof v === 'string' ? parseFloat(v) : v;
      return Number.isNaN(num) ? (found.displayValue ?? fallback) : num;
    }
  }
  return fallback;
}

function normalizeStandingsEntry(entry) {
  const team = entry.team || {};
  const stats = entry.stats || [];
  return {
    teamId: team.id,
    name: team.displayName || team.name || '',
    abbreviation: team.abbreviation || '',
    logo: (team.logos && team.logos[0] && team.logos[0].href) || team.logo || '',
    played: pickStat(stats, ['gamesPlayed', 'GP']),
    win: pickStat(stats, ['wins', 'W']),
    draw: pickStat(stats, ['ties', 'draws', 'D']),
    loss: pickStat(stats, ['losses', 'L']),
    goalsFor: pickStat(stats, ['pointsFor', 'goalsFor', 'GF']),
    goalsAgainst: pickStat(stats, ['pointsAgainst', 'goalsAgainst', 'GA']),
    goalDiff: pickStat(stats, ['pointDifferential', 'goalDifferential', 'GD']),
    points: pickStat(stats, ['points', 'Pts']),
    rank: pickStat(stats, ['rank']) || (entry.note && entry.note.rank) || null,
  };
}

/**
 * Ambil klasemen mentah dari ESPN dan kelompokkan per grup (kalau ada).
 * @returns {Promise<Array<{groupName: string|null, teams: Array}>>}
 */
async function getStandings() {
  const url = `${ESPN_STANDINGS_BASE}/standings`;
  const data = await espnFetchJSON(url);

  // Liga dengan grup: data.children[] masing-masing punya standings.entries[]
  if (Array.isArray(data.children) && data.children.length > 0) {
    return data.children.map((child) => ({
      groupName: child.name || child.abbreviation || null,
      teams: ((child.standings && child.standings.entries) || [])
        .map(normalizeStandingsEntry)
        .sort((a, b) => (b.points - a.points) || (b.goalDiff - a.goalDiff)),
    }));
  }

  // Liga tanpa grup: data.standings.entries[] langsung di top-level
  const entries = (data.standings && data.standings.entries) || [];
  if (entries.length > 0) {
    return [{
      groupName: null,
      teams: entries.map(normalizeStandingsEntry).sort((a, b) => (b.points - a.points) || (b.goalDiff - a.goalDiff)),
    }];
  }

  return [];
}

/* =========================================================================
 * TOP SKOR (statistics / leaders)
 * ========================================================================= */

/**
 * Cari kategori leaders yang berkaitan dengan gol/assist di dalam struktur
 * statistics ESPN (struktur bisa dalam-bercabang, jadi kita telusuri rekursif).
 */
function findLeaderCategory(node, keywords, depth) {
  depth = depth || 0;
  if (!node || typeof node !== 'object' || depth > 6) return null;

  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findLeaderCategory(item, keywords, depth + 1);
      if (found) return found;
    }
    return null;
  }

  const label = `${node.name || ''} ${node.displayName || ''} ${node.shortDisplayName || ''}`.toLowerCase();
  if (Array.isArray(node.leaders) && keywords.some((k) => label.includes(k))) {
    return node.leaders;
  }

  for (const key of Object.keys(node)) {
    if (key === 'leaders') continue; // sudah dicek di atas
    const found = findLeaderCategory(node[key], keywords, depth + 1);
    if (found) return found;
  }
  return null;
}

function normalizeLeader(item) {
  const athlete = item.athlete || {};
  const team = item.team || {};
  return {
    athleteId: athlete.id || null,
    name: athlete.displayName || athlete.fullName || athlete.shortName || 'Pemain',
    position: (athlete.position && (athlete.position.abbreviation || athlete.position.name)) || '',
    headshot: (athlete.headshot && athlete.headshot.href) || '',
    team: team.displayName || team.name || '',
    teamLogo: (team.logos && team.logos[0] && team.logos[0].href) || team.logo || '',
    value: item.value !== undefined ? item.value : (parseFloat(item.displayValue) || 0),
    displayValue: item.displayValue !== undefined ? item.displayValue : String(item.value || ''),
  };
}

/**
 * Ambil daftar top skor (dan, jika tersedia, top assist) dari endpoint
 * /statistics ESPN.
 * @returns {Promise<{goals: Array, assists: Array}>}
 */
async function getTopScorers() {
  const url = `${ESPN_BASE}/statistics`;
  const data = await espnFetchJSON(url);

  const goalsRaw = findLeaderCategory(data, ['goal']) || [];
  const assistsRaw = findLeaderCategory(data, ['assist']) || [];

  return {
    goals: goalsRaw.map(normalizeLeader).sort((a, b) => b.value - a.value),
    assists: assistsRaw.map(normalizeLeader).sort((a, b) => b.value - a.value),
  };
}
