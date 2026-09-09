const sharp = require('sharp');
const path = require('path');

const outputDir = path.join(__dirname, '../assets/images');
const sourcePath = path.join(outputDir, 'abc.jpg');

// Fundo do app (mesmo usado no app.json)
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE_THRESHOLD = 235; // pixels mais claros que isso viram transparentes

// ---------------------------------------------------------------------------
// Extrai a logo da "Sacolão ABC Goiânia" (abc.jpg), removendo o fundo branco
// e recortando na bounding box do conteúdo.
// ---------------------------------------------------------------------------
async function readSourceMask() {
  const { data, info } = await sharp(sourcePath)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const alpha = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * channels;
    const isWhite =
      data[o] > WHITE_THRESHOLD &&
      data[o + 1] > WHITE_THRESHOLD &&
      data[o + 2] > WHITE_THRESHOLD;
    alpha[i] = isWhite ? 0 : 255;
  }

  return { rgb: data, alpha, width, height, channels };
}

async function extractLogo() {
  const { rgb, alpha, width, height, channels } = await readSourceMask();
  const rgba = await sharp(rgb, { raw: { width, height, channels } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(rgba).trim();
}

async function extractSilhouette(color) {
  const { alpha, width, height } = await readSourceMask();
  const solid = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    solid[i * 3] = color[0];
    solid[i * 3 + 1] = color[1];
    solid[i * 3 + 2] = color[2];
  }
  const rgba = await sharp(solid, { raw: { width, height, channels: 3 } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(rgba).trim();
}

async function placeOnCanvas(logoSharp, { size, background, margin, sharpen }) {
  const target = Math.round(size * (1 - margin * 2));
  let pipeline = logoSharp.resize(target, target, {
    fit: 'inside',
    kernel: sharp.kernel.lanczos3,
  });
  if (sharpen) pipeline = pipeline.sharpen();
  const resized = await pipeline.png().toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: resized, gravity: 'center' }])
    .png();
}

async function generateIcons() {
  console.log('🎨 Gerando ícones do "Sacolão ABC Goiânia" a partir de abc.jpg...\n');

  // 1. Ícone principal — fundo branco sangrando até a borda (o sistema arredonda)
  console.log('✓ icon.png (1024x1024)');
  await (await placeOnCanvas(await extractLogo(), { size: 1024, background: WHITE, margin: 0.06, sharpen: true }))
    .flatten({ background: WHITE })
    .toFile(path.join(outputDir, 'icon.png'));

  // 2. Android adaptive — background (cor chapada)
  console.log('✓ android-icon-background.png (1024x1024)');
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } })
    .png()
    .toFile(path.join(outputDir, 'android-icon-background.png'));

  // 3. Android adaptive — foreground (dentro da safe area de 66%)
  console.log('✓ android-icon-foreground.png (1024x1024)');
  await (await placeOnCanvas(await extractLogo(), { size: 1024, background: TRANSPARENT, margin: 0.19, sharpen: true }))
    .toFile(path.join(outputDir, 'android-icon-foreground.png'));

  // 4. Android monochrome — silhueta preta vazada, o sistema aplica a cor
  console.log('✓ android-icon-monochrome.png (1024x1024)');
  await (await placeOnCanvas(await extractSilhouette([0, 0, 0]), { size: 1024, background: TRANSPARENT, margin: 0.19 }))
    .toFile(path.join(outputDir, 'android-icon-monochrome.png'));

  // 5. Notificação Android — o sistema usa só o canal alpha, então a arte vai
  //    branca e vazada; a cor vem do `color` do plugin expo-notifications
  console.log('✓ notification-icon.png (96x96)');
  await (await placeOnCanvas(await extractSilhouette([255, 255, 255]), { size: 96, background: TRANSPARENT, margin: 0.12 }))
    .toFile(path.join(outputDir, 'notification-icon.png'));

  // 6. Favicon
  console.log('✓ favicon.png (48x48)');
  const faviconBuffer = await (
    await placeOnCanvas(await extractLogo(), { size: 256, background: WHITE, margin: 0.06, sharpen: true })
  )
    .png()
    .toBuffer();
  await sharp(faviconBuffer).resize(48, 48).toFile(path.join(outputDir, 'favicon.png'));

  // 7. Splash — sem fundo (o backgroundColor do app.json já é branco)
  console.log('✓ splash-icon.png (1024x1024)');
  await (await placeOnCanvas(await extractLogo(), { size: 1024, background: TRANSPARENT, margin: 0.22, sharpen: true }))
    .toFile(path.join(outputDir, 'splash-icon.png'));

  console.log('\n✅ Ícones gerados em assets/images/');
  console.log('🎨 Fonte: abc.jpg (logo Sacolão ABC Goiânia) / fundo #ffffff\n');
}

generateIcons().catch((error) => {
  console.error('❌ Erro ao gerar ícones:', error);
  process.exit(1);
});
