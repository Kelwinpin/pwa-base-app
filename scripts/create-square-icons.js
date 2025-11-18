const sharp = require('sharp');
const path = require('path');

const inputImage = path.join(__dirname, '../assets/images/new-icon.png');
const outputDir = path.join(__dirname, '../assets/images');

async function createSquareIcons() {
  try {
    console.log('🎨 Criando ícones com fundo quadrado completo...\n');

    // Etapa 1: Extrair apenas o logo branco (remover o fundo laranja com cantos arredondados)
    console.log('📋 Extraindo logo branco...');

    const originalImage = await sharp(inputImage).raw().toBuffer({ resolveWithObject: true });
    const { data, info } = originalImage;

    // Criar uma nova imagem só com as partes brancas/claras
    const logoBuffer = Buffer.from(data);

    // Processar pixels para manter apenas o logo branco
    for (let i = 0; i < logoBuffer.length; i += 4) {
      const r = logoBuffer[i];
      const g = logoBuffer[i + 1];
      const b = logoBuffer[i + 2];

      // Se for laranja/amarelo (fundo), tornar transparente
      if (r > 200 && g > 100 && b < 100) {
        logoBuffer[i] = 255;     // R
        logoBuffer[i + 1] = 255; // G
        logoBuffer[i + 2] = 255; // B
        logoBuffer[i + 3] = 0;   // A (transparente)
      }
      // Se for branco, manter
      else if (r > 200 && g > 200 && b > 200) {
        logoBuffer[i + 3] = 255; // A (opaco)
      }
      // Caso contrário, tornar transparente
      else {
        logoBuffer[i + 3] = 0;
      }
    }

    const whiteLogoBuffer = await sharp(logoBuffer, {
      raw: {
        width: info.width,
        height: info.height,
        channels: 4
      }
    })
    .trim()
    .resize(700, 700, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

    // Etapa 2: Criar fundo quadrado com gradiente laranja
    console.log('🟧 Criando fundo gradiente laranja quadrado...');

    const orangeSquare = Buffer.from(
      `<svg width="1024" height="1024" viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="orangeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#FFB800;stop-opacity:1" />
            <stop offset="50%" style="stop-color:#FFA500;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#FF9500;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#orangeGrad)" />
      </svg>`
    );

    // Etapa 3: Compor logo branco sobre fundo laranja
    console.log('✓ Gerando icon.png (1024x1024)');
    await sharp(orangeSquare)
      .composite([{
        input: whiteLogoBuffer,
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(outputDir, 'icon.png'));

    // Android Adaptive - Foreground (apenas logo branco, maior)
    console.log('✓ Gerando android-icon-foreground.png (1024x1024)');
    const foregroundLogo = await sharp(whiteLogoBuffer)
      .resize(800, 800, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();

    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{
        input: foregroundLogo,
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(outputDir, 'android-icon-foreground.png'));

    // Android Adaptive - Background (gradiente laranja)
    console.log('✓ Gerando android-icon-background.png (1024x1024)');
    await sharp(orangeSquare)
      .png()
      .toFile(path.join(outputDir, 'android-icon-background.png'));

    // Android monochrome
    console.log('✓ Gerando android-icon-monochrome.png (1024x1024)');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite([{
        input: foregroundLogo,
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(outputDir, 'android-icon-monochrome.png'));

    // Favicon
    console.log('✓ Gerando favicon.png (48x48)');
    await sharp(orangeSquare)
      .composite([{
        input: await sharp(whiteLogoBuffer).resize(36, 36, { fit: 'inside' }).png().toBuffer(),
        gravity: 'center'
      }])
      .resize(48, 48)
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));

    // Splash icon (logo branco sem fundo)
    console.log('✓ Gerando splash-icon.png (1024x1024)');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      }
    })
      .composite([{
        input: await sharp(whiteLogoBuffer).resize(600, 600, { fit: 'inside' }).png().toBuffer(),
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(outputDir, 'splash-icon.png'));

    console.log('\n✅ Ícones criados com sucesso!');
    console.log('📱 Agora o gradiente laranja preenche todo o quadrado!');
    console.log('🎯 Os cantos arredondados serão aplicados corretamente pelo sistema\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
    process.exit(1);
  }
}

createSquareIcons();
