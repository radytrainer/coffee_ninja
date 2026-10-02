#!/usr/bin/env node
// Generates the SVG product illustrations served by the API at /static/products/*.svg.
// Re-run after editing: node scripts/generate-product-art.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'products',
);
mkdirSync(outDir, { recursive: true });

const wrap = (
  bg1,
  bg2,
  body,
) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="70%">
      <stop offset="0%" stop-color="${bg1}"/>
      <stop offset="100%" stop-color="${bg2}"/>
    </radialGradient>
    <linearGradient id="shine" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0.35"/>
      <stop offset="45%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#2b1a10" flood-opacity="0.28"/>
    </filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  <circle cx="330" cy="70" r="90" fill="#fff" opacity="0.07"/>
  <circle cx="60" cy="350" r="110" fill="#fff" opacity="0.05"/>
  <ellipse cx="200" cy="338" rx="130" ry="18" fill="#2b1a10" opacity="0.18"/>
  ${body}
</svg>
`;

const steam = `<g fill="none" stroke="#fff" stroke-linecap="round" stroke-width="7" opacity="0.55">
    <path d="M170 110c-14-18 14-30 0-50"/><path d="M200 102c-14-18 14-30 0-50"/><path d="M230 110c-14-18 14-30 0-50"/>
  </g>`;

// Ceramic cup with saucer; `foam` = crema colour, `art` draws latte art.
function hotCup({ cup, foam, liquid, art = true, small = false }) {
  const s = small ? 0.78 : 1;
  const t = `translate(${200 - 200 * s} ${40 + (1 - s) * 180}) scale(${s})`;
  return `<g transform="${t}" filter="url(#soft)">
    ${steam}
    <ellipse cx="200" cy="318" rx="140" ry="26" fill="#f4ede6"/>
    <ellipse cx="200" cy="312" rx="110" ry="16" fill="#e6dbd0"/>
    <path d="M282 180c52 0 56 74 0 78" fill="none" stroke="${cup}" stroke-width="20"/>
    <path d="M100 150h200l-18 138c-4 22-22 30-44 30h-76c-22 0-40-8-44-30z" fill="${cup}"/>
    <path d="M100 150h200l-18 138c-4 22-22 30-44 30h-76c-22 0-40-8-44-30z" fill="url(#shine)"/>
    <ellipse cx="200" cy="150" rx="100" ry="24" fill="${liquid}"/>
    <ellipse cx="200" cy="152" rx="88" ry="18" fill="${foam}"/>
    ${art ? `<path d="M200 138c-22 0-30 14-16 20 8 3 16 4 16 12 0-8 8-9 16-12 14-6 6-20-16-20z" fill="#fff" opacity="0.9"/>` : ''}
  </g>`;
}

// Tall glass for iced drinks; layers from bottom to top.
function icedGlass({ layers, straw = '#e85d4a', cream = false }) {
  const heights = layers.map((l) => l.h);
  const total = heights.reduce((a, b) => a + b, 0);
  let y = 320;
  const bands = layers
    .map((l) => {
      y -= (l.h / total) * 180;
      return `<rect x="120" y="${y}" width="160" height="${(l.h / total) * 180 + 2}" fill="${l.c}"/>`;
    })
    .join('');
  return `<g filter="url(#soft)">
    <rect x="232" y="40" width="14" height="150" rx="7" fill="${straw}" transform="rotate(12 239 115)"/>
    <clipPath id="glass"><path d="M112 118h176l-14 196c-1 12-10 18-22 18H148c-12 0-21-6-22-18z"/></clipPath>
    <g clip-path="url(#glass)">
      <rect x="100" y="110" width="200" height="230" fill="#ffffff" opacity="0.25"/>
      ${bands}
      <g fill="#fff" opacity="0.55">
        <rect x="140" y="170" width="44" height="40" rx="8" transform="rotate(-12 162 190)"/>
        <rect x="200" y="196" width="44" height="40" rx="8" transform="rotate(14 222 216)"/>
        <rect x="160" y="236" width="40" height="36" rx="8" transform="rotate(6 180 254)"/>
      </g>
    </g>
    <path d="M112 118h176l-14 196c-1 12-10 18-22 18H148c-12 0-21-6-22-18z" fill="url(#shine)" stroke="#fff" stroke-opacity="0.6" stroke-width="4"/>
    ${cream ? '<ellipse cx="200" cy="118" rx="88" ry="22" fill="#fff8ef"/><circle cx="200" cy="100" r="30" fill="#fff8ef"/>' : '<ellipse cx="200" cy="118" rx="88" ry="12" fill="#fff" opacity="0.5"/>'}
  </g>`;
}

const croissant = `<g filter="url(#soft)">
    <path d="M70 250c20-80 90-120 130-120s110 40 130 120c-30-10-50-6-60 8-20-30-50-40-70-40s-50 10-70 40c-10-14-30-18-60-8z" fill="#d98f3c"/>
    <path d="M150 160c10 50 10 80 4 100M200 136v120M250 160c-10 50-10 80-4 100" stroke="#a65f1f" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M70 250c20-80 90-120 130-120s110 40 130 120" fill="none" stroke="#f3c07a" stroke-width="6" opacity="0.7"/>
  </g>`;

const muffin = `<g filter="url(#soft)">
    <path d="M120 220h160l-20 100H140z" fill="#c8553d"/>
    <path d="M140 220l10 100M170 220l4 100M200 220v100M230 220l-4 100M260 220l-10 100" stroke="#9e3b27" stroke-width="5"/>
    <path d="M100 230c-10-70 50-110 100-110s110 40 100 110z" fill="#e7a95b"/>
    <g fill="#4a2a6b"><circle cx="160" cy="170" r="10"/><circle cx="215" cy="150" r="10"/><circle cx="245" cy="195" r="10"/><circle cx="180" cy="205" r="9"/></g>
  </g>`;

const cake = (sponge, frosting, top) => `<g filter="url(#soft)">
    <path d="M90 220l220-60v140l-220 30z" fill="${sponge}"/>
    <path d="M90 220l220-60v26l-220 58z" fill="${frosting}"/>
    <path d="M90 270l220-50v14l-220 50z" fill="${frosting}"/>
    <path d="M90 220l220-60-60-30L90 190z" fill="${frosting}"/>
    <circle cx="200" cy="160" r="18" fill="${top}"/>
    <path d="M90 190v140" stroke="#000" stroke-opacity="0.12" stroke-width="4"/>
  </g>`;

const teaCup = (liquid) => `<g filter="url(#soft)">
    ${steam}
    <ellipse cx="200" cy="310" rx="140" ry="24" fill="#eef3ea"/>
    <path d="M280 190c46 4 42 64-6 66" fill="none" stroke="#f7faf5" stroke-width="18"/>
    <path d="M90 170h220c0 80-40 136-110 136S90 250 90 170z" fill="#f7faf5"/>
    <path d="M90 170h220c0 80-40 136-110 136S90 250 90 170z" fill="url(#shine)"/>
    <ellipse cx="200" cy="170" rx="110" ry="22" fill="${liquid}"/>
    <path d="M150 190c30 20 70 20 100 0" stroke="#6b8f4e" stroke-width="5" fill="none" opacity="0.4"/>
    <path d="M300 130l30-60" stroke="#c9b27c" stroke-width="3"/><rect x="318" y="60" width="26" height="32" rx="4" fill="#e6c36a" transform="rotate(20 331 76)"/>
  </g>`;

const art = {
  latte: wrap('#c89f7a', '#6f4a33', hotCup({ cup: '#f6efe8', foam: '#d9b48c', liquid: '#9c6b43' })),
  cappuccino: wrap(
    '#b58a67',
    '#5a3a26',
    hotCup({ cup: '#2f5d62', foam: '#ecd9c0', liquid: '#8a5a36' }),
  ),
  americano: wrap(
    '#8d6a52',
    '#3b2519',
    hotCup({ cup: '#1f1f1f', foam: '#5a3520', liquid: '#3b2014', art: false }),
  ),
  mocha: wrap('#a8735a', '#4a2a1c', hotCup({ cup: '#b5523b', foam: '#7a4127', liquid: '#5b2e1a' })),
  espresso: wrap(
    '#9a7458',
    '#3e271b',
    hotCup({ cup: '#f2e8de', foam: '#b8743d', liquid: '#4b2716', art: false, small: true }),
  ),
  'matcha-latte': wrap(
    '#b7c9a0',
    '#55704a',
    hotCup({ cup: '#fbf8f2', foam: '#9cbf6e', liquid: '#6f9447' }),
  ),
  'iced-latte': wrap(
    '#d8b793',
    '#7a5438',
    icedGlass({
      layers: [
        { c: '#7a4a2a', h: 1 },
        { c: '#c79a6d', h: 1.2 },
        { c: '#f3e6d6', h: 1 },
      ],
    }),
  ),
  'iced-americano': wrap(
    '#a98670',
    '#43291c',
    icedGlass({
      layers: [
        { c: '#3a1f12', h: 3 },
        { c: '#5a3322', h: 1 },
      ],
      straw: '#2a9d8f',
    }),
  ),
  'iced-caramel-macchiato': wrap(
    '#e2b77f',
    '#8a5a2b',
    icedGlass({
      layers: [
        { c: '#f4e7d6', h: 1.5 },
        { c: '#8a5230', h: 1 },
        { c: '#d9922e', h: 0.3 },
      ],
      straw: '#f4a261',
    }),
  ),
  'green-tea': wrap('#c5d8a9', '#5d7d45', teaCup('#a9c26a')),
  'jasmine-tea': wrap('#efe2b0', '#9a8440', teaCup('#e0c768')),
  'mango-smoothie': wrap(
    '#ffcf70',
    '#d9822b',
    icedGlass({
      layers: [
        { c: '#f4a300', h: 2 },
        { c: '#ffc94a', h: 1 },
      ],
      straw: '#e63946',
      cream: true,
    }),
  ),
  'berry-smoothie': wrap(
    '#e7a1c1',
    '#8c2f5b',
    icedGlass({
      layers: [
        { c: '#8e2c6f', h: 1.2 },
        { c: '#d05596', h: 1.3 },
      ],
      straw: '#ffd166',
      cream: true,
    }),
  ),
  croissant: wrap('#f3d19c', '#b7793a', croissant),
  'blueberry-muffin': wrap('#e8c3a2', '#8c5a3c', muffin),
  'chocolate-cake': wrap('#c08a6c', '#4a241a', cake('#5a2d1c', '#3a1a10', '#c1121f')),
  cheesecake: wrap('#f2dfc3', '#b58d5c', cake('#f7e7c4', '#d9a66b', '#d62839')),
};

for (const [name, svg] of Object.entries(art)) {
  writeFileSync(path.join(outDir, `${name}.svg`), svg);
}
console.log(`Generated ${Object.keys(art).length} product illustrations in ${outDir}`);
