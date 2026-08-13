const sharp = require('sharp');
const path = require('path');

const outputDir = path.join(__dirname, '../assets/images');

// Paleta do "Anota aí" (mesma do splash em app.json)
const CREAM = '#f2e9d6';
const INK = '#2a5580';

// ---------------------------------------------------------------------------
// Helpers de geometria (usados para o check com ponta afiada)
// ---------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (v, k) => [v[0] * k, v[1] * k];
const norm = (v) => {
  const len = Math.hypot(v[0], v[1]);
  return [v[0] / len, v[1] / len];
};
const perp = (v) => [-v[1], v[0]];

function intersect(p1, d1, p2, d2) {
  const den = d1[0] * d2[1] - d1[1] * d2[0];
  const t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / den;
  return addv(p1, mul(d1, t));
}

const fmt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;

/**
 * Check mark como shape preenchido: base reta na ponta esquerda,
 * ponta afiada na direita (igual ao desenho de referência).
 */
function checkPath(left, bottom, right, halfLeft, halfRight) {
  const d1 = norm(sub(bottom, left));
  const d2 = norm(sub(right, bottom));
  const n1 = perp(d1); // lado externo (inferior) do braço curto
  const n2 = perp(d2); // lado externo (inferior) do braço longo

  const outerL = addv(left, mul(n1, halfLeft));
  const innerL = addv(left, mul(n1, -halfLeft));
  const outerB = intersect(outerL, d1, addv(bottom, mul(n2, halfRight)), d2);
  const innerB = intersect(innerL, d1, addv(bottom, mul(n2, -halfRight)), d2);

  return [
    `M ${fmt(outerL)}`,
    `L ${fmt(outerB)}`,
    `L ${fmt(right)}`,
    `L ${fmt(innerB)}`,
    `L ${fmt(innerL)}`,
    'Z',
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Desenho do ícone
// ---------------------------------------------------------------------------
const PAD = { x: 175, y: 155, w: 615, h: 675, r: 30 };
const SPIRAL_Y = [265, 385, 505, 625, 745];

/**
 * @param {object} opts
 * @param {number} opts.size      lado do PNG final
 * @param {string|null} opts.background cor de fundo (null = transparente)
 * @param {string} opts.ink       cor dos traços
 * @param {string} opts.paper     preenchimento interno ('none' para silhueta vazada)
 * @param {number} opts.scale     escala da arte dentro do quadrado (safe area)
 */
function buildSvg({ size, background, ink, paper, scale }) {
  const stroke = `fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"`;

  const spirals = SPIRAL_Y.map(
    (y) =>
      `<path d="M 245 ${y - 42} C 118 ${y - 74}, 98 ${y + 74}, 245 ${y + 42}" ${stroke} stroke-width="26" />`
  ).join('\n      ');

  const lines = [
    [330, 300, 618],
    [330, 388, 578],
    [330, 476, 538],
  ]
    .map(
      ([x1, y, x2]) =>
        `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" ${stroke} stroke-width="30" />`
    )
    .join('\n      ');

  const scribble =
    'M 400 592 C 425 505, 452 500, 468 572 C 480 618, 500 628, 520 592 ' +
    'C 534 566, 548 552, 574 562 C 598 571, 618 546, 658 500';

  const check = checkPath([412, 648], [560, 795], [858, 432], 54, 62);

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  ${background ? `<rect width="1024" height="1024" fill="${background}" />` : ''}
  <g transform="translate(17 12) translate(512 512) scale(${scale}) translate(-512 -512)">

    <!-- Bloco de notas -->
    <g transform="rotate(-4 480 490)">
      <rect x="${PAD.x}" y="${PAD.y}" width="${PAD.w}" height="${PAD.h}" rx="${PAD.r}"
            fill="${paper}" stroke="${ink}" stroke-width="30" />
      ${lines}
      <path d="${scribble}" ${stroke} stroke-width="24" />
      ${spirals}
    </g>

    <!-- Caneta -->
    <g transform="translate(722 296) rotate(45)">
      <path d="M -54 120 L -54 -166 A 54 54 0 0 1 54 -166 L 54 120 Z"
            fill="${paper}" stroke="${ink}" stroke-width="26" stroke-linejoin="round" />
      <circle cx="0" cy="-128" r="17" fill="${paper}" stroke="${ink}" stroke-width="14" />
      <path d="M -54 120 L 0 288 L 54 120"
            fill="${paper}" stroke="${ink}" stroke-width="26" stroke-linejoin="round" />
      <path d="M -20 205 L 0 290 L 20 205 Z" fill="${ink}" />
    </g>

    <!-- Check -->
    <path d="${check}" fill="${ink}" />
  </g>
</svg>`);
}

const render = (opts) => sharp(buildSvg(opts)).png();

async function generateIcons() {
  console.log('🎨 Gerando ícones do "Anota aí"...\n');

  // 1. Ícone principal — fundo creme sangrando até a borda (o sistema arredonda)
  console.log('✓ icon.png (1024x1024)');
  await render({ size: 1024, background: CREAM, ink: INK, paper: CREAM, scale: 0.9 })
    .toFile(path.join(outputDir, 'icon.png'));

  // 2. Android adaptive — background (cor chapada)
  console.log('✓ android-icon-background.png (1024x1024)');
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: CREAM },
  })
    .png()
    .toFile(path.join(outputDir, 'android-icon-background.png'));

  // 3. Android adaptive — foreground (dentro da safe area de 66%)
  console.log('✓ android-icon-foreground.png (1024x1024)');
  await render({ size: 1024, background: null, ink: INK, paper: CREAM, scale: 0.62 })
    .toFile(path.join(outputDir, 'android-icon-foreground.png'));

  // 4. Android monochrome — silhueta vazada, o sistema aplica a cor
  console.log('✓ android-icon-monochrome.png (1024x1024)');
  await render({ size: 1024, background: null, ink: '#000000', paper: 'none', scale: 0.62 })
    .toFile(path.join(outputDir, 'android-icon-monochrome.png'));

  // 5. Notificação Android — o sistema usa só o canal alpha, então a arte vai
  //    branca e vazada; a cor vem do `color` do plugin expo-notifications
  console.log('✓ notification-icon.png (96x96)');
  await render({ size: 96, background: null, ink: '#ffffff', paper: 'none', scale: 0.82 })
    .toFile(path.join(outputDir, 'notification-icon.png'));

  // 6. Favicon
  console.log('✓ favicon.png (48x48)');
  await render({ size: 256, background: CREAM, ink: INK, paper: CREAM, scale: 0.86 })
    .resize(48, 48)
    .toFile(path.join(outputDir, 'favicon.png'));

  // 7. Splash — sem fundo (o backgroundColor do app.json já é creme)
  console.log('✓ splash-icon.png (1024x1024)');
  await render({ size: 1024, background: null, ink: INK, paper: CREAM, scale: 0.82 })
    .toFile(path.join(outputDir, 'splash-icon.png'));

  console.log('\n✅ Ícones gerados em assets/images/');
  console.log(`🎨 Paleta: papel ${CREAM} / traço ${INK}\n`);
}

generateIcons().catch((error) => {
  console.error('❌ Erro ao gerar ícones:', error);
  process.exit(1);
});
