// api/pixel-image.js
// Returns a branded SVG image for each pixel NFT.
// URL: /api/pixel-image/COL/ROW
// Also handles clusters: /api/pixel-image/cluster/C1/R1/C2/R2

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

module.exports = async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  const path  = (req.url || '').replace(/^\/api\/pixel-image\/?/, '');
  const parts = path.split('/').filter(Boolean);
  let svg;

  if (parts[0] === 'cluster') {
    // Cluster image: /api/pixel-image/cluster/c1/r1/c2/r2
    const c1 = parseInt(parts[1], 10);
    const r1 = parseInt(parts[2], 10);
    const c2 = parseInt(parts[3], 10);
    const r2 = parseInt(parts[4], 10);

    if ([c1, r1, c2, r2].some(isNaN)) {
      return res.status(400).send('Invalid cluster coordinates');
    }

    const w = c2 - c1 + 1;
    const h = r2 - r1 + 1;
    const hue = Math.floor((c1 * 360 / 1000 + r1 * 0.36) % 360);
    const col1 = hslToHex(hue, 70, 40);
    const col2 = hslToHex((hue + 60) % 360, 70, 55);

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${col1}"/>
      <stop offset="100%" stop-color="${col2}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="#0a0612"/>
  <rect x="32" y="32" width="448" height="448" fill="url(#g)" rx="8"/>
  <rect x="32" y="32" width="448" height="448" fill="none" stroke="#e879f9" stroke-width="3" rx="8"/>
  <text x="256" y="230" text-anchor="middle" font-family="monospace" font-size="18" fill="#fbbf24" font-weight="bold">CLUSTER ${w}×${h}</text>
  <text x="256" y="268" text-anchor="middle" font-family="monospace" font-size="13" fill="#f5f0ff">(${c1},${r1}) → (${c2},${r2})</text>
  <text x="256" y="490" text-anchor="middle" font-family="monospace" font-size="12" fill="#9d8ccc">PIXELWALLS ETERNAL WALL</text>
  <text x="256" y="38"  text-anchor="middle" font-family="monospace" font-size="11" fill="#fbbf24">✦ THE ETERNAL WALL ✦</text>
</svg>`;

  } else {
    // Single pixel: /api/pixel-image/COL/ROW
    const col = parseInt(parts[0], 10);
    const row = parseInt(parts[1], 10);

    if (isNaN(col) || isNaN(row) || col < 0 || col > 999 || row < 0 || row > 999) {
      return res.status(400).send('Invalid pixel coordinates (0–999)');
    }

    // Deterministic color per pixel — unique for every coordinate
    const hue  = Math.floor((col * 360 / 1000 + row * 0.36) % 360);
    const hex  = hslToHex(hue, 70, 50);
    const hex2 = hslToHex((hue + 30) % 360, 60, 35);

    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0612"/>
      <stop offset="100%" stop-color="#110d22"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect x="56" y="56" width="400" height="400" fill="${hex2}" rx="6"/>
  <rect x="80" y="80" width="352" height="352" fill="${hex}" rx="4"/>
  <rect x="56" y="56" width="400" height="400" fill="none" stroke="${hex}" stroke-width="2" rx="6" opacity="0.6"/>
  <text x="256" y="490" text-anchor="middle" font-family="monospace" font-size="13" fill="#9d8ccc">PIXELWALLS ${col}×${row}</text>
  <text x="256" y="38"  text-anchor="middle" font-family="monospace" font-size="11" fill="#fbbf24">✦ THE ETERNAL WALL ✦</text>
</svg>`;
  }

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=300');
  return res.status(200).send(svg);
};
