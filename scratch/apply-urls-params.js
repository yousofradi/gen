const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = 'c:/Users/YousofRady/.gemini/antigravity/scratch/ecommerce/frontend';

const replaceInFile = (relPath, replacements) => {
  const fullPath = path.join(FRONTEND_DIR, relPath);
  if (!fs.existsSync(fullPath)) return;
  let content = fs.readFileSync(fullPath, 'utf8');
  for (const {from, to} of replacements) {
    content = content.replace(from, to);
  }
  fs.writeFileSync(fullPath, content);
};

// 1. api.js
replaceInFile('js/api.js', [
  { from: /href="collection\?id=\$\{c\._id\}"/g, to: 'href="collection/${c.urlName || c._id}"' },
  { from: /href="\$\{p\.handle \? `product\/\$\{p\.handle\}` : `product\?id=\$\{p\._id\}`\}"/g, to: 'href="product/${p.handle || p._id}"' }
]);

// 2. collections.html
replaceInFile('collections.html', [
  { from: /const link = c\.urlName \? `collection\/\$\{c\.urlName\}` : `collection\?id=\$\{c\._id\}`;/g, to: 'const link = `collection/${c.urlName || c._id}`;' },
  { from: /const link = c\.urlName \? `collection\?handle=\$\{c\.urlName\}` : `collection\?id=\$\{c\._id\}`;/g, to: 'const link = `collection/${c.urlName || c._id}`;' }
]);

// 3. products.js
replaceInFile('js/products.js', [
  { from: /const link = c\.urlName \? `collection\?handle=\$\{c\.urlName\}` : `collection\?id=\$\{c\._id\}`;/g, to: 'const link = `collection/${c.urlName || c._id}`;' },
  { from: /if \(type === 'collection' && val\) return `collection\?id=\$\{val\}`;/g, to: "if (type === 'collection' && val) return `collection/${val}`;" },
  { from: /const productLink = p\.handle \? `product\?handle=\$\{p\.handle\}` : `product\?id=\$\{p\._id\}`;/g, to: 'const productLink = `product/${p.handle || p._id}`;' }
]);

// 4. product-detail.js
replaceInFile('js/product-detail.js', [
  { 
    from: /const params = new URLSearchParams\(window\.location\.search\);\s*let productId = params\.get\('id'\);/g, 
    to: `const params = new URLSearchParams(window.location.search);
  let productId = params.get('id') || params.get('handle');
  if (!productId && window.location.pathname.includes('/product/')) {
    productId = window.location.pathname.split('/').filter(Boolean).pop();
  }`
  }
]);

// 5. collection.js
replaceInFile('js/collection.js', [
  { 
    from: /const params = new URLSearchParams\(window\.location\.search\);\s*let collectionId = params\.get\('id'\);/g, 
    to: `const params = new URLSearchParams(window.location.search);
  let collectionId = params.get('id') || params.get('handle');
  if (!collectionId && window.location.pathname.includes('/collection/')) {
    collectionId = window.location.pathname.split('/').filter(Boolean).pop();
  }`
  }
]);

console.log("Done");
