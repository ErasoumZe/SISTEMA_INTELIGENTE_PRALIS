// O service worker existe apenas para habilitar a instalação do PWA. Ele não guarda HTML, API ou
// dados de caixa em cache: uma versão antiga desses dados seria pior que uma página sem cache.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => undefined);
