// Modo claro/escuro global. Seta data-theme no <html> (o CSS em main.css faz o resto, vencendo
// via !important o estilo inline que a aparencia da empresa injeta). Persiste em localStorage.
const CHAVE = "padaria.modoEscuro";

export function useModoEscuro() {
  const escuro = useState("padaria.modo-escuro", () => false);

  function aplicar() {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", escuro.value ? "dark" : "light");
  }

  function inicializar() {
    if (typeof window === "undefined") return;
    const salvo = window.localStorage?.getItem(CHAVE);
    escuro.value =
      salvo === "1" || (salvo === null && Boolean(window.matchMedia?.("(prefers-color-scheme: dark)").matches));
    aplicar();
  }

  function alternar() {
    escuro.value = !escuro.value;
    aplicar();
    if (typeof window !== "undefined") window.localStorage?.setItem(CHAVE, escuro.value ? "1" : "0");
  }

  return { escuro, inicializar, alternar };
}
