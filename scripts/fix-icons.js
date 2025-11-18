const sharp = require('sharp');
const path = require('path');

const inputImage = path.join(__dirname, '../assets/images/icon-square.png');
const outputDir = path.join(__dirname, '../assets/images');

async function fixIcons() {
  try {
    console.log('🔧 Corrigindo ícones...\n');

    // Primeiro, vamos extrair as dimensões e criar uma versão com cantos retos
    const metadata = await sharp(inputImage).metadata();
    console.log(`Dimensões originais: ${metadata.width}x${metadata.height}`);

    // 1. Criar ícone principal (1024x1024) - versão com fundo laranja sólido até as bordas
    console.log('✓ Gerando icon.png (1024x1024) - fundo completo');

    // Criar fundo laranja com gradiente
    const orangeGradient = Buffer.from(
      `<svg width="1024" height="1024">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:#FFB800;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#FF9500;stop-opacity:1" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#grad)"/>
      </svg>`
    );

    // Criar logo branco (apenas a letra "n" com pessoa)
    const whiteLogo = Buffer.from(
      `<svg width="600" height="600" viewBox="0 0 1024 1024">
        <path fill="white" d="M280 235 Q280 200 305 200 Q330 200 330 235 Q330 270 305 270 Q280 270 280 235 Z M270 310 L340 310 Q355 310 365 320 L420 450 Q480 580 520 650 L520 850 Q520 870 500 870 L480 870 Q460 870 460 850 L460 680 Q460 670 455 660 L400 530 L400 850 Q400 870 380 870 L360 870 Q340 870 340 850 L340 450 Q340 440 345 430 L360 390 Q370 370 380 355 L390 340 Q400 325 410 318 L420 312 Q430 307 440 305 L280 305 Q270 305 270 315 Z M520 310 Q580 310 630 335 Q680 360 720 400 Q760 440 785 490 Q810 540 810 600 Q810 660 785 710 Q760 760 720 800 Q680 840 630 865 Q580 890 520 890 L520 870 Q520 850 540 850 L560 850 Q610 850 650 830 Q690 810 720 780 Q750 750 770 710 Q790 670 790 620 L790 600 Q790 560 775 525 Q760 490 735 465 Q710 440 675 425 Q640 410 595 410 L570 410 Q550 410 540 420 L520 440 L520 310 Z"/>
      </svg>`
    );

    await sharp(orangeGradient)
      .composite([{
        input: await sharp(whiteLogo).png().toBuffer(),
        gravity: 'center'
      }])
      .png()
      .toFile(path.join(outputDir, 'icon.png'));

    // 2. Android Adaptive Icon - Foreground (apenas logo branco)
    console.log('✓ Gerando android-icon-foreground.png (1024x1024)');
    await sharp(whiteLogo)
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'android-icon-foreground.png'));

    // 3. Android Adaptive Icon - Background (gradiente laranja)
    console.log('✓ Gerando android-icon-background.png (1024x1024)');
    await sharp(orangeGradient)
      .png()
      .toFile(path.join(outputDir, 'android-icon-background.png'));

    // 4. Android monochrome (logo branco em preto)
    console.log('✓ Gerando android-icon-monochrome.png (1024x1024)');
    await sharp(whiteLogo)
      .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'android-icon-monochrome.png'));

    // 5. Favicon (pequeno com fundo laranja)
    console.log('✓ Gerando favicon.png (48x48)');
    await sharp(orangeGradient)
      .composite([{
        input: await sharp(whiteLogo).resize(36, 36, { fit: 'contain' }).png().toBuffer(),
        gravity: 'center'
      }])
      .resize(48, 48)
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));

    // 6. Splash icon
    console.log('✓ Gerando splash-icon.png (1024x1024)');
    await sharp(whiteLogo)
      .resize(600, 600, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({
        top: 212,
        bottom: 212,
        left: 212,
        right: 212,
        background: { r: 255, g: 255, b: 255, alpha: 0 }
      })
      .png()
      .toFile(path.join(outputDir, 'splash-icon.png'));

    console.log('\n✅ Ícones corrigidos com sucesso!');
    console.log('📱 Agora os cantos arredondados serão aplicados corretamente pelo sistema\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('\n⚠️  Vou tentar uma abordagem alternativa...\n');

    // Fallback: usar a imagem original e remover transparência
    await fallbackMethod();
  }
}

async function fallbackMethod() {
  try {
    // Carregar imagem original e adicionar fundo laranja onde há transparência
    const image = sharp(inputImage);
    const metadata = await image.metadata();

    // Criar fundo laranja
    const background = await sharp({
      create: {
        width: metadata.width,
        height: metadata.height,
        channels: 4,
        background: { r: 255, g: 149, b: 0, alpha: 1 }
      }
    }).png().toBuffer();

    // Compor imagem sobre fundo laranja
    const composed = await sharp(background)
      .composite([{ input: inputImage }])
      .png()
      .toBuffer();

    // 1. Ícone principal
    console.log('✓ Gerando icon.png (1024x1024)');
    await sharp(composed)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'icon.png'));

    // 2. Android foreground
    console.log('✓ Gerando android-icon-foreground.png');
    await sharp(composed)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'android-icon-foreground.png'));

    // 3. Android background
    console.log('✓ Gerando android-icon-background.png');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 255, g: 149, b: 0, alpha: 1 }
      }
    })
      .png()
      .toFile(path.join(outputDir, 'android-icon-background.png'));

    // 4. Monochrome
    console.log('✓ Gerando android-icon-monochrome.png');
    await sharp(composed)
      .resize(1024, 1024, { fit: 'cover' })
      .grayscale()
      .png()
      .toFile(path.join(outputDir, 'android-icon-monochrome.png'));

    // 5. Favicon
    console.log('✓ Gerando favicon.png');
    await sharp(composed)
      .resize(48, 48, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));

    // 6. Splash
    console.log('✓ Gerando splash-icon.png');
    await sharp(composed)
      .resize(1024, 1024, { fit: 'cover' })
      .png()
      .toFile(path.join(outputDir, 'splash-icon.png'));

    console.log('\n✅ Ícones gerados com sucesso (método alternativo)!\n');

  } catch (err) {
    console.error('❌ Erro no método alternativo:', err);
    process.exit(1);
  }
}

fixIcons();
