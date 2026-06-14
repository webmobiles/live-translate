/**
 * Run once to generate icon.png and adaptive-icon.png
 *   node assets/generate-icons.mjs
 * Requires: npm install canvas  (run in the mobile/ folder)
 */
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function drawIcon(size) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const s = size / 1024; // scale factor

  // Background
  ctx.fillStyle = '#5B21B6';
  const r = 180 * s;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  const cx = size / 2;
  const cy = size * 0.42;

  // Globe circle
  ctx.strokeStyle = 'rgba(237,233,254,0.35)';
  ctx.lineWidth = 6 * s;
  ctx.beginPath();
  ctx.arc(cx, cy, 210 * s, 0, Math.PI * 2);
  ctx.stroke();

  // Globe meridian ellipse
  ctx.save();
  ctx.scale(0.53, 1);
  ctx.beginPath();
  ctx.arc(cx / 0.53, cy, 210 * s, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(237,233,254,0.22)';
  ctx.lineWidth = 5 * s;
  ctx.stroke();
  ctx.restore();

  // Globe horizontal lines
  ctx.strokeStyle = 'rgba(237,233,254,0.22)';
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.moveTo(cx - 210 * s, cy); ctx.lineTo(cx + 210 * s, cy); ctx.stroke();
  ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(cx - 175 * s, cy - 100 * s); ctx.lineTo(cx + 175 * s, cy - 100 * s); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 175 * s, cy + 100 * s); ctx.lineTo(cx + 175 * s, cy + 100 * s); ctx.stroke();

  // Speech bubble left
  const bw = 220 * s, bh = 130 * s, br = 30 * s;
  const bx = cx - 260 * s, by = cy - 190 * s;
  ctx.fillStyle = '#7C3AED';
  ctx.beginPath();
  ctx.moveTo(bx + br, by);
  ctx.lineTo(bx + bw - br, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
  ctx.lineTo(bx + bw, by + bh - br);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
  ctx.lineTo(bx + 100 * s, by + bh);
  ctx.lineTo(bx + 70 * s, by + bh + 50 * s);
  ctx.lineTo(bx + 50 * s, by + bh);
  ctx.lineTo(bx + br, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
  ctx.lineTo(bx, by + br);
  ctx.quadraticCurveTo(bx, by, bx + br, by);
  ctx.closePath();
  ctx.fill();

  // Lines inside left bubble
  ctx.fillStyle = 'rgba(237,233,254,0.85)';
  ctx.beginPath(); ctx.roundRect(bx + 30 * s, by + 30 * s, 140 * s, 18 * s, 9 * s); ctx.fill();
  ctx.fillStyle = 'rgba(237,233,254,0.5)';
  ctx.beginPath(); ctx.roundRect(bx + 30 * s, by + 62 * s, 90 * s, 18 * s, 9 * s); ctx.fill();

  // Speech bubble right
  const bx2 = cx + 40 * s, by2 = cy + 30 * s;
  ctx.fillStyle = '#A78BFA';
  ctx.beginPath();
  ctx.moveTo(bx2 + br, by2);
  ctx.lineTo(bx2 + bw - br, by2);
  ctx.quadraticCurveTo(bx2 + bw, by2, bx2 + bw, by2 + br);
  ctx.lineTo(bx2 + bw, by2 + bh - br);
  ctx.quadraticCurveTo(bx2 + bw, by2 + bh, bx2 + bw - br, by2 + bh);
  ctx.lineTo(bx2 + 170 * s, by2 + bh);
  ctx.lineTo(bx2 + 190 * s, by2 + bh + 50 * s);
  ctx.lineTo(bx2 + 210 * s, by2 + bh);
  ctx.lineTo(bx2 + br, by2 + bh);
  ctx.quadraticCurveTo(bx2, by2 + bh, bx2, by2 + bh - br);
  ctx.lineTo(bx2, by2 + br);
  ctx.quadraticCurveTo(bx2, by2, bx2 + br, by2);
  ctx.closePath();
  ctx.fill();

  // Lines inside right bubble
  ctx.fillStyle = 'rgba(30,27,75,0.65)';
  ctx.beginPath(); ctx.roundRect(bx2 + 30 * s, by2 + 30 * s, 140 * s, 18 * s, 9 * s); ctx.fill();
  ctx.fillStyle = 'rgba(30,27,75,0.45)';
  ctx.beginPath(); ctx.roundRect(bx2 + 30 * s, by2 + 62 * s, 90 * s, 18 * s, 9 * s); ctx.fill();

  // HV in white, T in green
  ctx.font = `bold ${200 * s}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#EDE9FE';
  ctx.fillText('HV', cx - 110 * s, size * 0.84);
  ctx.fillStyle = '#10B981';
  ctx.fillText('T', cx + 120 * s, size * 0.84);

  return c.toBuffer('image/png');
}

const icon = drawIcon(1024);
writeFileSync('assets/icon.png', icon);
writeFileSync('assets/adaptive-icon.png', icon);

// Splash: dark background, centered logo
const splash = createCanvas(1284, 2778);
const sctx = splash.getContext('2d');
sctx.fillStyle = '#0A0A0F';
sctx.fillRect(0, 0, 1284, 2778);
const splashIcon = drawIcon(400);
// re-draw icon centered on splash
const sc = createCanvas(400, 400);
const scc = sc.getContext('2d');
scc.drawImage(createCanvas(1024, 1024), 0, 0, 400, 400);
writeFileSync('assets/splash.png', splash.toBuffer('image/png'));

console.log('✓ assets/icon.png');
console.log('✓ assets/adaptive-icon.png');
console.log('Done — check the mobile/assets/ folder.');
