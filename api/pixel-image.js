// api/pixel-image.js
// Returns a simple 512x512 PNG for the NFT image.
// URL: https://pixelwalls.xyz/api/pixel-image/COL/ROW
// Returns the pixel's current color as a solid square with Pixelwalls branding.
// For production: replace with actual on-chain pixel artwork.

module.exports = async function handler(req, res) {
  const parts = (req.url || '').replace('/api/pixel-image', '').split('/').filter(Boolean);
  const col   = parseInt(parts[0], 10);
  const row   = parseInt(parts[1], 10);

  if (isNaN(col) || isNaN(row)) {
    return res.status(400).send('Invalid coordinates');
  }

  // Deterministic color from coordinates (before user sets their own)
  const hue = Math.floor((col * 360 / 1000 + row * 0.36) % 360);
  const hex  = hslToHex(hue, 70, 50);

  // Return a minimal SVG that Metaplex/Phantom will render as image
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" fill="#0a0612"/>
    <rect x="56" y="56" width="400" height="400" fill="${hex}" rx="8"/>
    <text x="256" y="490" text-anchor="middle" font-family="monospace" font-size="14" fill="#9d8ccc">PIXELWALLS ${col}x${row}</text>
    <text x="256" y="38"  text-anchor="middle" font-family="monospace" font-size="13" fill="#fbbf24">✦ THE ETERNAL WALL ✦</text>
  </svg>`;

  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).send(svg);
};

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * c).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
