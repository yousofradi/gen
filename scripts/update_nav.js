const fs = require('fs');
const path = require('path');

const frontendDir = path.join(__dirname, 'frontend');
const htmlFiles = fs.readdirSync(frontendDir).filter(f => f.endsWith('.html') && !f.startsWith('admin'));

const bottomNavRegex = /<nav class="mobile-bottom-nav">[\s\S]*?<\/nav>/;

const newBottomNav = `<nav class="mobile-bottom-nav">
    <div class="nav-items">
      <a href="index" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>الرئيسية</span>
      </a>
      <a href="index#collections-section" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        <span>متجر</span>
      </a>
      <a href="#" class="nav-item" id="mobile-cart-link" onclick="Cart.openCart(); return false;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span>السلة</span>
        <span class="mobile-nav-badge" id="mobile-cart-count" style="display:none">0</span>
      </a>
      <a href="https://wa.me/+201016612519" target="_blank" class="nav-item">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21"/><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1"/></svg>
        <span>واتساب</span>
      </a>
      <a href="#" class="nav-item" onclick="api.openMenu(); return false;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        <span>القائمة</span>
      </a>
    </div>
  </nav>`;

htmlFiles.forEach(file => {
  const filePath = path.join(frontendDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  if (bottomNavRegex.test(content)) {
    content = content.replace(bottomNavRegex, newBottomNav);
    fs.writeFileSync(filePath, content);
    console.log('Updated', file);
  }
});
