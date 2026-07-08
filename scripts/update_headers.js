const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, 'frontend');
const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html') && !f.startsWith('admin'));

const headerRegex = /<header class="store-header">[\s\S]*?<\/header>/;

htmlFiles.forEach(file => {
  const filePath = path.join(frontendDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  const isHomepage = file === 'index.html';
  
  const leftIcons = `
      <div class="header-icons">
        <button class="header-icon search-icon-btn" onclick="api.openSearch()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <a href="#" onclick="Cart.openCart(); return false;" class="nav-item" id="header-cart-link">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          <span class="mobile-nav-badge" id="cart-count" style="display:none">0</span>
        </a>
      </div>`;

  const rightBtn = isHomepage 
    ? `<button class="header-icon hamburger-btn" onclick="api.openMenu()">☰</button>`
    : `<a href="index" class="header-icon back-btn" onclick="if(history.length > 1) { history.back(); return false; }">←</a>`;

  const newHeader = `<header class="store-header">
    <div class="container">
      ${rightBtn}
      <a href="index" class="store-logo-link"><img src="https://assets.wuiltstore.com/cmo1fsgmc060f01lwhwpn6ga7__D8_B3_D9_86_D8_AF_D9_88_D8_B1.webp" alt="Sundura" class="store-logo-img"></a>
      ${leftIcons}
    </div>
  </header>`;

  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, newHeader);
    
    // Also ensure the bottom nav cart count uses the same class for styling
    content = content.replace('id="mobile-cart-count" style="display:none">0</span>', 'id="mobile-cart-count" class="mobile-nav-badge" style="display:none">0</span>');
    
    fs.writeFileSync(filePath, content);
    console.log('Updated', file);
  }
});
