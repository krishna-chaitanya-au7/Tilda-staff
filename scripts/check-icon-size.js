/**
 * Script to verify icon file dimensions
 * Run with: node scripts/check-icon-size.js
 */

const fs = require('fs');
const path = require('path');

// Note: This is a simple check. For actual image dimensions, you'd need a library like 'sharp' or 'jimp'
// But this will at least verify the file exists and show file size

const iconPath = path.join(__dirname, '../assets/images/icon.png');
const androidForeground = path.join(__dirname, '../assets/images/android-icon-foreground.png');
const androidBackground = path.join(__dirname, '../assets/images/android-icon-background.png');
const androidMonochrome = path.join(__dirname, '../assets/images/android-icon-monochrome.png');

console.log('🔍 Checking icon files...\n');

function checkFile(filePath, name) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(2);
    console.log(`✅ ${name}:`);
    console.log(`   Path: ${filePath}`);
    console.log(`   File size: ${sizeKB} KB`);
    console.log(`   ⚠️  Note: To check actual pixel dimensions, open in an image editor or use an image processing library\n`);
    return true;
  } else {
    console.log(`❌ ${name}: File not found at ${filePath}\n`);
    return false;
  }
}

const icons = [
  { path: iconPath, name: 'iOS Icon (icon.png)' },
  { path: androidForeground, name: 'Android Foreground' },
  { path: androidBackground, name: 'Android Background' },
  { path: androidMonochrome, name: 'Android Monochrome' }
];

let allExist = true;
icons.forEach(icon => {
  if (!checkFile(icon.path, icon.name)) {
    allExist = false;
  }
});

console.log('\n📋 Requirements:');
console.log('   - All icons must be exactly 1024x1024 pixels');
console.log('   - Icons must be finalized, professional designs (NOT placeholders)');
console.log('   - Icons should be consistent and recognizable');
console.log('\n💡 Apple rejected the app because the icon looks like a placeholder.');
console.log('   Even though the size is correct (1024x1024), the design needs to be finalized and professional.');
console.log('   Check ICON_REQUIREMENTS.md for detailed guidance on creating proper icons.');

if (!allExist) {
  console.log('\n⚠️  Some icon files are missing!');
  process.exit(1);
} else {
  console.log('\n✅ All icon files exist (but verify dimensions are 1024x1024)');
}

