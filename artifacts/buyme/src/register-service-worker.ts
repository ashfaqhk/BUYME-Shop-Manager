// The preview uses Vite's live assets; only published builds should cache the app.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error: unknown) => {
      console.warn('BUYME offline app could not be installed', error);
    });
  });
}