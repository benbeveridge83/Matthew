// For GitHub Pages, paste your Supabase Project URL and publishable key here.
// You may also leave these blank and configure them from the app's Settings panel.
window.MATTHEW_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: ''
};

// Category Matrix enhancement: the arrow expands the saved passage sentences,
// while the passage name still opens the category-assignment dialog.
window.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.type = 'module';
  script.src = `matrix-expand.js?v=1.3.1-${Date.now()}`;
  document.body.append(script);
}, { once: true });
