const fs = require('fs');
const path = require('path');

const adminDir = path.join(__dirname, 'frontend', 'admin');
const files = fs.readdirSync(adminDir).filter(f => f.endsWith('.html'));

files.forEach(file => {
  const filePath = path.join(adminDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Replace the corrupted text with "العملاء"
  // We look for the link with href="customers"
  const regex = /<a href="customers">[\s\S]*?<\/a>/g;
  
  const updatedContent = content.replace(regex, (match) => {
    // Keep the SVG but replace the text
    return match.replace(/>\s*[\s\S]*?\s*<\/a>/, '>العملاء</a>').replace('العملاء</a>', '\n          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>\n          العملاء\n        </a>');
  });

  if (content !== updatedContent) {
    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`Fixed ${file}`);
  }
});
