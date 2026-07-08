const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = 'c:/Users/YousofRady/.gemini/antigravity/scratch/ecommerce/frontend';

const FAVICON_URL = 'https://res.cloudinary.com/sundura/image/upload/v1778758433/ecommerce-uploads/1778758432917-917399313.png';
const OG_IMAGE_URL = 'https://res.cloudinary.com/sxvrwatl/image/upload/f_auto,q_85/v1783524407/ecommerce-uploads/1783524407085-724484340.webp';
const STORE_URL = 'https://sundura.onrender.com';

const processFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');

  // 1. Hide .html in hrefs
  content = content.replace(/href="([a-zA-Z0-9_-]+)\.html(\?[^"]*)?"/g, 'href="$1$2"');
  
  // 2. Hide .html in JS location redirects
  content = content.replace(/window\.location\.href\s*=\s*['"]([a-zA-Z0-9_-]+)\.html(\?[^'"]*)?['"]/g, "window.location.href = '$1$2'");
  content = content.replace(/window\.location\.replace\(['"]([a-zA-Z0-9_-]+)\.html(\?[^'"]*)?['"]\)/g, "window.location.replace('$1$2')");
  content = content.replace(/window\.location\s*=\s*['"]([a-zA-Z0-9_-]+)\.html(\?[^'"]*)?['"]/g, "window.location = '$1$2'");

  // 3. Favicon
  content = content.replace(/<link\s+rel="icon"\s+href="[^"]*">/g, `<link rel="icon" href="${FAVICON_URL}">`);

  // 4. OG Image and Twitter Image
  content = content.replace(/<meta\s+property="og:image"\s+content="[^"]*">/g, `<meta property="og:image" content="${OG_IMAGE_URL}">`);
  content = content.replace(/<meta\s+name="twitter:image"\s+content="[^"]*">/g, `<meta name="twitter:image" content="${OG_IMAGE_URL}">`);

  // 5. Store URL (in admin store preview)
  content = content.replace(/<a\s+href="[^"]*"\s+class="admin-store-preview"/g, `<a href="${STORE_URL}" class="admin-store-preview"`);

  fs.writeFileSync(filePath, content);
};

const processDirectory = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (file.endsWith('.html') || file.endsWith('.js')) {
      processFile(fullPath);
    }
  }
};

processDirectory(FRONTEND_DIR);
console.log("Done");
