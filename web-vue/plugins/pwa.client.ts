export default defineNuxtPlugin(() => {
  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      // Instalar o atalho jamais pode bloquear login ou o sistema.
      console.warn("Nao foi possivel registrar o atalho do aplicativo", error);
    });
  }
});
