const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = 'c:/Users/YousofRady/.gemini/antigravity/scratch/ecommerce/frontend';

const filesToFix = ['product.html', 'collection.html'];

for (const file of filesToFix) {
  const fullPath = path.join(FRONTEND_DIR, file);
  if (!fs.existsSync(fullPath)) continue;
  
  let content = fs.readFileSync(fullPath, 'utf8');

  // Fix assets
  content = content.replace(/href="css\//g, 'href="/css/');
  content = content.replace(/src="js\//g, 'src="/js/');

  // Fix navigation
  content = content.replace(/href="products"/g, 'href="/products"');
  content = content.replace(/href="collections"/g, 'href="/collections"');
  content = content.replace(/href="cart"/g, 'href="/cart"');
  
  fs.writeFileSync(fullPath, content);
}
console.log('Fixed relative paths');
