// For GitHub Pages, paste your Supabase Project URL and publishable key here.
// You may also leave these blank and configure them from the app's Settings panel.
window.MATTHEW_CONFIG = {
  supabaseUrl: '',
  supabasePublishableKey: ''
};

// Category Matrix enhancements.
window.addEventListener('DOMContentLoaded', () => {
  const matrixScript = document.createElement('script');
  matrixScript.type = 'module';
  matrixScript.src = `matrix-expand.js?v=1.3.2-${Date.now()}`;
  document.body.append(matrixScript);

  const quickAddScript = document.createElement('script');
  quickAddScript.type = 'module';
  quickAddScript.src = `category-quick-add.js?v=1.3.3-${Date.now()}`;
  document.body.append(quickAddScript);

  const hierarchyScript = document.createElement('script');
  hierarchyScript.type = 'module';
  hierarchyScript.src = `category-hierarchy.js?v=1.5.0-${Date.now()}`;
  document.body.append(hierarchyScript);
}, { once: true });
