const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walk(dirPath, callback) : callback(path.join(dir, f));
  });
};

walk(path.join(__dirname, 'frontend'), (filePath) => {
    if (!filePath.endsWith('.html')) return;
    
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace href="index" and href="index.html" with href="/"
    // But only if it's a standalone word to avoid issues with collection-index etc.
    content = content.replace(/href="index\.html"/g, 'href="/"');
    content = content.replace(/href="index"/g, 'href="/"');
    
    fs.writeFileSync(filePath, content);
});

console.log('Successfully replaced index links with /');
