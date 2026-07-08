const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = 'c:/Users/YousofRady/.gemini/antigravity/scratch/ecommerce/frontend';

const LOGO_URL = 'https://res.cloudinary.com/sundura/image/upload/f_auto,q_auto/v1779328561/ecommerce-uploads/1779328561151-334345189.webp';
const BRAND_NAME = 'SunduraShop';

const replaceInFile = (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');

  // Title tags
  content = content.replace(/<title>\s*\|\s*/g, `<title>${BRAND_NAME} | `);
  content = content.replace(/<title>\|\s*الرئيسية<\/title>/g, `<title>${BRAND_NAME} | الرئيسية</title>`);
  content = content.replace(/<title>Admin Dashboard<\/title>/g, `<title>${BRAND_NAME} Admin</title>`);
  content = content.replace(/<title>Login \| Admin<\/title>/g, `<title>${BRAND_NAME} | Login</title>`);

  // Meta tags
  content = content.replace(/content="\s*—\s*/g, `content="${BRAND_NAME} — `);
  content = content.replace(/<meta property="og:title" content="Shop">/g, `<meta property="og:title" content="${BRAND_NAME} Shop">`);
  content = content.replace(/<meta property="og:image" content="">/g, `<meta property="og:image" content="${LOGO_URL}">`);
  content = content.replace(/<meta name="twitter:image" content="">/g, `<meta name="twitter:image" content="${LOGO_URL}">`);

  // Logos (store-logo-img)
  // Find all store-logo-img and replace entire tag
  content = content.replace(/<img[^>]*class="store-logo-img"[^>]*>/g, `<img src="${LOGO_URL}" alt="${BRAND_NAME} Logo" class="store-logo-img">`);
  
  // Login logo
  content = content.replace(/<div id="login-brand-logo">.*?<\/div>/g, `<div id="login-brand-logo"><img src="${LOGO_URL}" style="max-height:100%; max-width:150px; display:block; margin:0 auto;"></div>`);
  // And if it is empty:
  content = content.replace(/<div id="login-brand-logo"><\/div>/g, `<div id="login-brand-logo"><img src="${LOGO_URL}" style="max-height:100%; max-width:150px; display:block; margin:0 auto;"></div>`);

  // Admin Brand Title
  content = content.replace(/<div class="admin-brand-title"><\/div>/g, `<div class="admin-brand-title">${BRAND_NAME}</div>`);
  content = content.replace(/<div class="admin-brand-title">.*?<\/div>/g, `<div class="admin-brand-title">${BRAND_NAME}</div>`);

  // Footer
  content = content.replace(/© \d{4} \. جميع الحقوق محفوظة\./g, `© 2026 ${BRAND_NAME}. جميع الحقوق محفوظة.`);
  content = content.replace(/© \d{4} \. All rights reserved\./g, `© 2026 ${BRAND_NAME}. All rights reserved.`);

  // Social Links
  content = content.replace(/href="https:\/\/wa\.me\/"/g, `href="https://wa.me/201039317393"`);
  content = content.replace(/<a href="#" target="_blank" class="nav-item" id="nav-tg-link"/g, `<a href="https://t.me/sundura_shop" target="_blank" class="nav-item" id="nav-tg-link"`);
  
  // Inject Social Icons into Footer if they don't exist
  if (!content.includes('footer-socials')) {
    const socialHtml = `
    <div class="footer-socials" style="display:flex;gap:16px;justify-content:center;margin-top:16px;margin-bottom:16px;">
      <a href="https://www.facebook.com/profile.php?id=61574475453631&locale=ar_AR" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg></a>
      <a href="https://t.me/sundura_shop" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path></svg></a>
      <a href="https://wa.me/201039317393" target="_blank" style="color:inherit"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg></a>
    </div>`;
    content = content.replace(/(<\/nav>)([\s\n]*)<div class="footer-bottom-bar">/g, `$1$2${socialHtml}\n$2<div class="footer-bottom-bar">`);
  }

  // Store name placeholders
  content = content.replace(/class="store-name-text">.*?<\/span>/g, `class="store-name-text">${BRAND_NAME}</span>`);
  content = content.replace(/class="store-name-text">.*?<\/div>/g, `class="store-name-text">${BRAND_NAME}</div>`);

  fs.writeFileSync(filePath, content);
};

const processDirectory = (dir) => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file === 'admin') processDirectory(fullPath);
    } else if (file.endsWith('.html')) {
      replaceInFile(fullPath);
      console.log(`Updated ${fullPath}`);
    }
  }
};

processDirectory(FRONTEND_DIR);

// CSS Replacement
const CSS_FILE = path.join(FRONTEND_DIR, 'css', 'style.css');
if (fs.existsSync(CSS_FILE)) {
  let css = fs.readFileSync(CSS_FILE, 'utf8');
  // Need to replace existing --primary variables
  // Since we don't know exactly what they are, let's insert them at the top of :root or add to root if it exists
  const colorVars = `--primary: #916c4f;
  --primary-hover: rgb(123, 91, 67);
  --primary-light: rgba(145, 108, 79, 0.08);
  --primary-dark: rgb(123, 91, 67);`;
  
  if (css.includes(':root {')) {
    // Replace inside :root
    css = css.replace(/:root\s*{([^}]+)}/, (match, rootContent) => {
      // Remove any existing primary colors
      let newRoot = rootContent.replace(/--primary[^;]+;/g, '');
      return `:root {\n  ${colorVars}\n${newRoot}}`;
    });
  } else {
    css = `:root {\n  ${colorVars}\n}\n\n` + css;
  }
  fs.writeFileSync(CSS_FILE, css);
  console.log(`Updated ${CSS_FILE}`);
}

const STORE_CSS_FILE = path.join(FRONTEND_DIR, 'css', 'store.css');
if (fs.existsSync(STORE_CSS_FILE)) {
  let css = fs.readFileSync(STORE_CSS_FILE, 'utf8');
  if (css.includes(':root {')) {
    css = css.replace(/:root\s*{([^}]+)}/, (match, rootContent) => {
      let newRoot = rootContent.replace(/--primary[^;]+;/g, '');
      return `:root {\n  ${colorVars}\n${newRoot}}`;
    });
    fs.writeFileSync(STORE_CSS_FILE, css);
    console.log(`Updated ${STORE_CSS_FILE}`);
  }
}

console.log('Branding applied successfully.');
