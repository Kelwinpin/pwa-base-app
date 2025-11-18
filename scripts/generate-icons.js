const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const inputImage = path.join(__dirname, '../assets/images/new-icon.png');
const outputDir = path.join(__dirname, '../assets/images');

async function generateIcons() {
  try {
    console.log('📱 Gerando ícones do app...\n');

    // 1. Ícone principal (1024x1024)
    console.log('✓ Gerando icon.png (1024x1024)');
    await sharp(inputImage)
      .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'icon.png'));

    // 2. Android foreground (1024x1024)
    console.log('✓ Gerando android-icon-foreground.png (1024x1024)');
    await sharp(inputImage)
      .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'android-icon-foreground.png'));

    // 3. Android background (branco sólido)
    console.log('✓ Gerando android-icon-background.png (1024x1024)');
    await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      }
    })
      .png()
      .toFile(path.join(outputDir, 'android-icon-background.png'));

    // 4. Android monochrome (versão em branco e preto)
    console.log('✓ Gerando android-icon-monochrome.png (1024x1024)');
    await sharp(inputImage)
      .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .grayscale()
      .png()
      .toFile(path.join(outputDir, 'android-icon-monochrome.png'));

    // 5. Favicon (48x48)
    console.log('✓ Gerando favicon.png (48x48)');
    await sharp(inputImage)
      .resize(48, 48, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'favicon.png'));

    // 6. Splash icon (1024x1024)
    console.log('✓ Gerando splash-icon.png (1024x1024)');
    await sharp(inputImage)
      .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .png()
      .toFile(path.join(outputDir, 'splash-icon.png'));

    console.log('\n✅ Todos os ícones foram gerados com sucesso!');
    console.log('🎨 Arquivos criados em: assets/images/\n');

  } catch (error) {
    console.error('❌ Erro ao gerar ícones:', error);
    process.exit(1);
  }
}

generateIcons();
