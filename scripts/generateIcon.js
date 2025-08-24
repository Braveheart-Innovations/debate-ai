const fs = require('fs');
const path = require('path');

// SVG content based on AppIconGenerator design
const size = 1024;
const centerX = size * 0.5;
const centerY = size * 0.5;
const circleRadius = size * 0.16;
const orbitRadius = size * 0.17;

// AI provider colors
const aiColors = [
  '#C15F3C', // Claude
  '#10A37F', // ChatGPT
  '#4888F8', // Gemini
  '#20808D', // Perplexity
  '#FA520F', // Mistral
  '#FF7759', // Cohere
  '#0F6FFF', // Together
  '#4D6BFE', // DeepSeek
  '#1DA1F2', // Grok
];

// Generate circle positions
const circles = [];
for (let i = 0; i < 9; i++) {
  const angle = (i * 40) * Math.PI / 180;
  const x = centerX + Math.cos(angle) * orbitRadius;
  const y = centerY + Math.sin(angle) * orbitRadius;
  circles.push({ x, y, color: aiColors[i] });
}

// Create SVG string
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Dark background with rounded corners -->
  <rect x="0" y="0" width="${size}" height="${size}" fill="#1A1A1A" rx="${size * 0.08}" ry="${size * 0.08}"/>
  
  <!-- Overlapping circles with glow -->
  ${circles.map((circle, index) => `
  <g>
    <!-- Outer glow -->
    <circle cx="${circle.x}" cy="${circle.y}" r="${circleRadius * 1.05}" fill="${circle.color}" opacity="0.15"/>
    <!-- Main circle -->
    <circle cx="${circle.x}" cy="${circle.y}" r="${circleRadius}" fill="${circle.color}" opacity="0.65"/>
  </g>`).join('')}
  
  <!-- Center dark circle -->
  <circle cx="${centerX}" cy="${centerY}" r="${size * 0.06}" fill="#1A1A1A"/>
</svg>`;

// Save SVG file
const svgPath = path.join(__dirname, '..', 'assets', 'symposium-logo.svg');
fs.writeFileSync(svgPath, svgContent);
console.log('✅ SVG icon generated at:', svgPath);
console.log('\n⚠️  Next steps:');
console.log('1. Convert SVG to PNG using an online tool or image editor');
console.log('2. Save as assets/icon.png at 1024x1024 resolution');
console.log('3. Copy to other required files:');
console.log('   - assets/adaptive-icon.png (for Android)');
console.log('   - assets/splash-icon.png (for splash screen)');
console.log('   - assets/favicon.png (resize to 48x48 for web)');
console.log('4. Run: npx expo prebuild --clear');