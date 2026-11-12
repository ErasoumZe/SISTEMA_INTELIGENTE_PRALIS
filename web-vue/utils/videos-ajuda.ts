// Videos de ajuda do painel: um video curto por duvida ("Como abro o caixa?"), com legenda gravada no
// proprio video. Os arquivos ficam em `public/videos/<grupo>/`.
//
// A ORDEM DA LISTA E A ORDEM DA TELA: primeiro o passo a passo inteiro, depois as duvidas na ordem
// em que aparecem na abertura (bloco 1, lacre, malote, maquininha, resumo, caixa aberto). O player
// segue essa ordem: quando um video acaba, o proximo comeca sozinho.
//
// QUEM VE CADA GRUPO E A MESMA LISTA DO MENU. O grupo declara a tela a que pertence; se a tela nao
// chegou na lista do menu, o grupo nao aparece. Nao ha filtro de cargo aqui: seria uma segunda
// fonte de verdade sobre permissao (mesma regra do `dashboard.ts`).
import type { ItemMenu } from "~/types/padaria";

export type VideoAjuda = {
  id: string;
  titulo: string;
  resumo: string;
  /** Segundos, arredondados para mostrar no card. */
  duracao: number;
  /** Palavras do jeito que o operador pergunta; entram na busca. */
  palavras: string;
  /** O que a legenda do video diz, passo a passo. Vai para o leitor de tela e para a busca. */
  passos: string[];
  /** Segundo em que cada passo (barrinha gravada no video) comeca. Um por passo, crescente. */
  inicios: number[];
};

export type GrupoVideos = {
  id: string;
  titulo: string;
  /** Tela do menu que libera o grupo. */
  telaId: string;
  videos: VideoAjuda[];
};

export const GRUPOS_VIDEOS: GrupoVideos[] = [
  {
    id: "caixa",
    titulo: "Abrir o caixa",
    telaId: "caixa",
    videos: [
      {
        id: "como-abrir-o-caixa",
        titulo: "Como abrir o caixa",
        resumo: "Do lacre do malote até o caixa aberto",
        duracao: 51,
        palavras: "abrir caixa abertura comecar turno iniciar",
        passos: [
          "Na tela do Caixa, aparece Abrir caixa. São 3 blocos.",
          "Digite o número do lacre do malote.",
          "Contou e bateu? Toque em Sim, confere.",
          "Digite o nome de quem fica no caixa.",
          "Digite o nome do supervisor.",
          "Escolha a maquininha do seu PDV.",
          "Toque em Conferir e abrir caixa.",
          "Confira o resumo e toque em Confirmar e abrir.",
          "Pronto: caixa aberto. Pode vender."
        ],
        inicios: [0, 4.21, 10.94, 16.57, 23.36, 29.7, 35.01, 40.31, 46.4]
      },
      {
        id: "o-pdv-nao-e-o-meu",
        titulo: "O PDV que aparece não é o meu",
        resumo: "Posto e turno vêm do login",
        duracao: 9,
        palavras: "pdv errado posto turno manha tarde login outro caixa",
        passos: [
          "O PDV e o turno vêm do login do posto.",
          "Não é o seu? Não abra. Saia e entre com o login do seu posto."
        ],
        inicios: [0, 3.44]
      },
      {
        id: "onde-digito-o-lacre",
        titulo: "Onde digito o lacre do malote?",
        resumo: "O lacre que veio da Tesouraria",
        duracao: 17,
        palavras: "lacre malote numero abertura tesouraria",
        passos: [
          "No bloco 2, Conferir malote de abertura.",
          "Digite o número do lacre do malote que você recebeu.",
          "Não é o lacre de fechamento. O sistema acha o malote e mostra o valor."
        ],
        inicios: [0, 3.55, 11.21]
      },
      {
        id: "o-malote-nao-bateu",
        titulo: "O malote não bateu. E agora?",
        resumo: "Quando falta ou sobra dinheiro no malote",
        duracao: 18,
        palavras: "malote nao bateu nao confere falta sobra diferente valor errado contagem",
        passos: [
          "Conte o malote e compare com o valor esperado.",
          "Não bateu? Toque em Não confere.",
          "Digite o que você contou: notas e moedas.",
          "Siga a abertura. A Tesouraria é avisada da diferença."
        ],
        inicios: [0, 3.88, 9.19, 12.79]
      },
      {
        id: "como-escolher-a-maquininha",
        titulo: "Como escolho a maquininha?",
        resumo: "A maquininha de cartão do seu PDV",
        duracao: 17,
        palavras: "maquininha cartao pagbank terminal escolher pos",
        passos: [
          "No bloco 3, toque em Maquininha de cartão.",
          "Escolha a maquininha que está no seu PDV.",
          "Ela vale para o turno todo e é usada no fechamento."
        ],
        inicios: [0, 5.86, 11.66]
      },
      {
        id: "errei-antes-de-abrir",
        titulo: "Errei algo antes de abrir",
        resumo: "Voltar e revisar",
        duracao: 15,
        palavras: "errei errado corrigir voltar revisar nome lacre confirmar",
        passos: [
          "Antes de abrir, o sistema mostra um resumo.",
          "Algo errado? Toque em Voltar e revisar.",
          "Corrija e toque de novo em Conferir e abrir caixa."
        ],
        inicios: [0, 3.71, 9.41]
      },
      {
        id: "como-sei-que-o-caixa-abriu",
        titulo: "Como sei que o caixa abriu?",
        resumo: "A tela do caixa aberto",
        duracao: 8,
        palavras: "caixa aberto abriu vendas entradas turno",
        passos: ["Aparece Caixa aberto, em verde.", "Aqui você vê quantas vendas o PDV fez no turno."],
        inicios: [0, 3.06]
      }
    ]
  }
];

/** Os grupos cuja tela chegou na lista do menu. Grupo sem tela liberada some, com titulo e tudo. */
export function gruposVisiveis(telas: Pick<ItemMenu, "id">[], grupos: GrupoVideos[] = GRUPOS_VIDEOS): GrupoVideos[] {
  const liberadas = new Set(telas.map((tela) => tela.id));
  return grupos.filter((grupo) => liberadas.has(grupo.telaId));
}

const semAcento = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Busca por palavras soltas, sem acento: "malote bateu" acha "O malote não bateu". */
export function filtrarVideos(grupos: GrupoVideos[], termo: string): GrupoVideos[] {
  const palavras = semAcento(termo.trim()).split(/\s+/).filter(Boolean);
  if (!palavras.length) return grupos;
  return grupos
    .map((grupo) => ({
      ...grupo,
      videos: grupo.videos.filter((video) => {
        const texto = semAcento([video.titulo, video.resumo, video.palavras, ...video.passos].join(" "));
        return palavras.every((palavra) => texto.includes(palavra));
      })
    }))
    .filter((grupo) => grupo.videos.length > 0);
}

/* SETAS DO PLAYER, como stories. `inicios` = segundo em que cada barrinha (passo) comeca no video.
   Voltar: se ja passou 1 s do passo atual, recomeca ele; senao, vai para o anterior (no primeiro,
   recomeca o primeiro). Avancar: o proximo passo; `null` quando ja esta no ultimo (quem chama passa
   para o proximo video). */
const FOLGA = 0.05;
export function passoAnterior(inicios: number[], agora: number): number {
  const atual = inicios.reduce((achado, inicio, posicao) => (agora + FOLGA >= inicio ? posicao : achado), 0);
  const inicioAtual = inicios[atual] ?? 0;
  if (agora - inicioAtual > 1) return inicioAtual;
  return inicios[Math.max(0, atual - 1)] ?? 0;
}
export function proximoPasso(inicios: number[], agora: number): number | null {
  return inicios.find((inicio) => inicio > agora + FOLGA) ?? null;
}

export const arquivoDoVideo = (grupo: string, video: string) => `/videos/${grupo}/${video}.mp4`;
export const capaDoVideo = (grupo: string, video: string) => `/videos/${grupo}/${video}.webp`;
