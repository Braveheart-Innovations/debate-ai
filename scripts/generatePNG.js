const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');
const svgPath = path.join(assetsDir, 'symposium-logo.svg');

async function generateIcons() {
  try {
    // Read SVG file
    const svgBuffer = fs.readFileSync(svgPath);
    
    // Generate main icon (1024x1024)
    console.log('Generating icon.png...');
    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(assetsDir, 'icon.png'));
    
    // Generate adaptive icon for Android (1024x1024)
    console.log('Generating adaptive-icon.png...');
    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(assetsDir, 'adaptive-icon.png'));
    
    // Generate splash icon (512x512 - will be centered on splash screen)
    console.log('Generating splash-icon.png...');
    await sharp(svgBuffer)
      .resize(512, 512)
      .png()
      .toFile(path.join(assetsDir, 'splash-icon.png'));
    
    // Generate favicon for web (48x48)
    console.log('Generating favicon.png...');
    await sharp(svgBuffer)
      .resize(48, 48)
      .png()
      .toFile(path.join(assetsDir, 'favicon.png'));
    
    // Also replace the app-logo.png
    console.log('Updating app-logo.png...');
    await sharp(svgBuffer)
      .resize(1024, 1024)
      .png()
      .toFile(path.join(assetsDir, 'app-logo.png'));
    
    console.log('\n✅ All icons generated successfully!');
    console.log('\n📱 Icons created:');
    console.log('  - assets/icon.png (1024x1024) - Main app icon');
    console.log('  - assets/adaptive-icon.png (1024x1024) - Android adaptive icon');
    console.log('  - assets/splash-icon.png (512x512) - Splash screen logo');
    console.log('  - assets/favicon.png (48x48) - Web favicon');
    console.log('  - assets/app-logo.png (1024x1024) - App logo');
    
    console.log('\n🚀 Next steps:');
    console.log('1. Run: npx expo prebuild --clear');
    console.log('2. Run: npx expo run:ios --device');
    
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();