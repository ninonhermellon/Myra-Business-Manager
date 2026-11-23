(() => {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(err => console.warn('PWA service worker:', err)));
  }
  let installPrompt = null;
  const btn = document.getElementById('installAppBtn');
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event; if (btn) btn.classList.remove('hidden');
  });
  if (btn) btn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; btn.classList.add('hidden');
  });
  window.addEventListener('appinstalled', () => { if (btn) btn.classList.add('hidden'); });
})();
