import { ref } from "vue";
import { buscarDuvidas, TEMAS_DUVIDA, type Duvida, type TemaDuvida } from "~/utils/duvidas";

// A conversa do chat de duvidas. Nao ha IA: cada "resposta" e uma pergunta pronta escolhida pelo operador
// (toque) ou achada pela busca (texto). O formato de chat e so a forma de mostrar.
export type MensagemChat = {
  id: number;
  de: "cicluz" | "voce";
  texto: string;
  /** A pergunta respondida, quando a busca achou uma so (para a pessoa conferir que e a dela). */
  titulo?: string;
  /** Perguntas para tocar logo abaixo da mensagem. */
  sugestoes?: Duvida[];
  /** Assuntos para tocar (mensagem "Escolha um assunto"). */
  temas?: TemaDuvida[];
};

const MAX_SUGESTOES_BUSCA = 5;
const MAX_RELACIONADAS = 3;

export function useChatDuvidas(duvidas: readonly Duvida[]) {
  const mensagens = ref<MensagemChat[]>([]);
  let proximoId = 1;
  const falar = (mensagem: Omit<MensagemChat, "id">) => mensagens.value.push({ id: proximoId++, ...mensagem });

  const temasComPergunta = TEMAS_DUVIDA.filter((tema) => duvidas.some((d) => d.tema === tema.id));
  const doTema = (tema: TemaDuvida) => duvidas.filter((d) => d.tema === tema);
  const tituloDoTema = (tema: TemaDuvida) => TEMAS_DUVIDA.find((t) => t.id === tema)?.titulo ?? "";

  // Toda abertura recomeca a conversa no assunto da tela; sem assunto, oferece a lista de assuntos.
  function iniciar(tema: TemaDuvida | null) {
    mensagens.value = [];
    if (tema && doTema(tema).length) {
      falar({ de: "cicluz", texto: `Oi! Dúvidas sobre ${tituloDoTema(tema)}:`, sugestoes: doTema(tema) });
      return;
    }
    falar({ de: "cicluz", texto: "Oi! Sobre o que é a sua dúvida?", temas: temasComPergunta.map((t) => t.id) });
  }

  function escolherDuvida(duvida: Duvida) {
    falar({ de: "voce", texto: duvida.pergunta });
    const relacionadas = doTema(duvida.tema)
      .filter((d) => d.id !== duvida.id)
      .slice(0, MAX_RELACIONADAS);
    falar({ de: "cicluz", texto: duvida.resposta, sugestoes: relacionadas.length ? relacionadas : undefined });
  }

  function escolherTema(tema: TemaDuvida) {
    falar({ de: "voce", texto: tituloDoTema(tema) });
    falar({ de: "cicluz", texto: "Escolha a pergunta:", sugestoes: doTema(tema) });
  }

  function verAssuntos() {
    falar({ de: "cicluz", texto: "Escolha um assunto:", temas: temasComPergunta.map((t) => t.id) });
  }

  // Busca em todos os assuntos. Uma so resposta certeira ja vem respondida; varias viram opcoes.
  function perguntar(texto: string) {
    const limpo = texto.trim();
    if (!limpo) return;
    falar({ de: "voce", texto: limpo });
    const achadas = buscarDuvidas(duvidas, limpo).slice(0, MAX_SUGESTOES_BUSCA);
    if (!achadas.length) {
      falar({ de: "cicluz", texto: "Não achei essa dúvida. Tente outras palavras ou chame o gerente do turno." });
      return;
    }
    if (achadas.length === 1 && achadas[0]) {
      falar({ de: "cicluz", titulo: achadas[0].pergunta, texto: achadas[0].resposta });
      return;
    }
    falar({ de: "cicluz", texto: "Achei estas. Toque na que é a sua:", sugestoes: achadas });
  }

  return { mensagens, iniciar, escolherDuvida, escolherTema, verAssuntos, perguntar, tituloDoTema };
}
