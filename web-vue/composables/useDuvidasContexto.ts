import type { TemaDuvida } from "~/utils/duvidas";

// Em que parte do sistema a pessoa esta, para o painel de duvidas abrir ja no assunto certo. O wizard do
// fechamento marca a etapa; ao sair dele, volta para o que a rota indicar.
export function useDuvidasContexto() {
  const tema = useState<TemaDuvida | null>("duvidas.tema", () => null);
  function marcar(novo: TemaDuvida | null) {
    tema.value = novo;
  }
  return { tema, marcar };
}
