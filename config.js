// For GitHub Pages, paste your Supabase Project URL and publishable key here.
// You may also leave these blank and configure them from the app's Settings panel.
window.MATTHEW_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: ''
};

// Category Matrix enhancements:
// 1) the arrow expands the saved passage sentences while the passage name opens categories;
// 2) the category-assignment window can create a brand-new category without leaving the row.
window.addEventListener('DOMContentLoaded', () => {
  [
    `matrix-expand.js?v=1.3.2-${Date.now()}`,
    `category-quick-add.js?v=1.0.0-${Date.now()}`,
  ].forEach((src) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = src;
    document.body.append(script);
  });
}, { once: true });
