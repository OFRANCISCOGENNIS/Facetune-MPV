'use strict';
(() => {
  const button = document.getElementById('install-app');
  const dialog = document.getElementById('install-dialog');
  const badge = document.getElementById('connection-status');
  const standaloneFile = document.documentElement.dataset.bundle === 'single';
  let installPrompt, offlineReady = standaloneFile;
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function updateStatus() {
    const online = navigator.onLine !== false;
    badge.textContent = online ? (offlineReady ? 'Pronto para offline' : 'Online') : (offlineReady ? 'Modo offline' : 'Sem conexão');
    badge.dataset.online = String(online);
    badge.title = offlineReady ? 'O app está salvo neste navegador. Suas fotos continuam locais.' : 'O acesso inicial à versão online requer conexão.';
    button.hidden = standaloneFile || location.protocol === 'file:' || installed();
  }
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; updateStatus(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; updateStatus(); });
  button.onclick = async () => {
    if (installPrompt) {
      const prompt = installPrompt; installPrompt = null;
      try { await prompt.prompt(); await prompt.userChoice; } catch { dialog.showModal(); }
    } else { dialog.showModal(); }
  };
  document.getElementById('close-install').onclick = () => dialog.close();
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  updateStatus();
  if (standaloneFile || !('serviceWorker' in navigator) || !window.isSecureContext || !/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'});
      const ready = await navigator.serviceWorker.ready;
      offlineReady = Boolean(ready.active); updateStatus();
      // Never force reload or activation over a current photo editing session.
      if (registration.waiting) badge.title += ' Uma atualização será aplicada quando as abas do app forem fechadas.';
    } catch {
      badge.title = 'O app funciona online. Este navegador não permitiu salvar a versão offline.';
    }
  });
})();
