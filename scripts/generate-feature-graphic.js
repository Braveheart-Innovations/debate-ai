const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '../assets/feature-graphic.svg');
const outputPath = path.join(__dirname, '../assets/play-store-feature-graphic.png');

// Read the SVG file
const svgBuffer = fs.readFileSync(svgPath);

// Convert to PNG at 1024x500
sharp(svgBuffer)
  .resize(1024, 500)
  .png()
  .toFile(outputPath)
  .then(() => {
    console.log('✅ Feature graphic generated successfully!');
    console.log(`📍 Location: ${outputPath}`);
    console.log('📐 Dimensions: 1024x500px');
    console.log('\n📱 You can now upload this to Google Play Console');
  })
  .catch(err => {
    console.error('❌ Error generating feature graphic:', err);
    console.log('\nAlternative: Use an online SVG to PNG converter:');
    console.log('1. https://svgtopng.com/');
    console.log('2. https://cloudconvert.com/svg-to-png');
    console.log('3. Upload assets/feature-graphic.svg');
    console.log('4. Set dimensions to 1024x500');
  });