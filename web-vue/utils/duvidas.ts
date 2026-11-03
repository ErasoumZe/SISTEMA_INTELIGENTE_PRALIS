// Painel de duvidas (perguntas e respostas prontas). Sem IA: o texto e fixo, revisado contra o codigo, e
// nunca mostra valor do caixa (a contagem do malote e cega para o operador — R-232).

export type TemaDuvida =
  | "abertura"
  | "turno"
  | "vendas"
  | "maquininha"
  | "relatorio-final"
  | "fechamento"
  | "quebra"
  | "depois"
  | "acessos";

export type Duvida = {
  id: string;
  tema: TemaDuvida;
  pergunta: string;
  resposta: string;
  /** Jeitos de falar que nao aparecem no texto ("errei", "digitei errado"...), so para a busca. */
  palavras?: string[];
};

export const TEMAS_DUVIDA: ReadonlyArray<{ id: TemaDuvida; titulo: string }> = [
  { id: "abertura", titulo: "Abertura" },
  { id: "turno", titulo: "Durante o turno" },
  { id: "vendas", titulo: "Fechamento · Vendas" },
  { id: "maquininha", titulo: "Fechamento · Maquininha" },
  { id: "relatorio-final", titulo: "Fechamento · Relatório final" },
  { id: "fechamento", titulo: "Fechamento · Encerrar" },
  { id: "quebra", titulo: "Falta e sobra" },
  { id: "depois", titulo: "Depois de fechar" },
  { id: "acessos", titulo: "Quem pode o quê" }
];

// Sem acento e em minusculas: o operador digita "comprovante" ou "contagem" do jeito que der.
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Palavras que toda pergunta tem ("o que eu faco se a...") e nao dizem o assunto.
const PALAVRAS_VAZIAS = new Set(
  (
    "a o as os um uma uns umas de da do das dos e em no na nos nas por pra para com sem que se eu me meu minha " +
    "voce ele ela isso esse essa este esta aqui ali la ja nao sim mas como qual quais quando onde porque por que " +
    "faco fazer faz agora tem ter ta esta estou foi ser sou era pode posso consigo devo preciso deu da dar"
  ).split(" ")
);

// Corta o fim da palavra para "recebi" achar "recebimento" e "lacres" achar "lacre". Palavra curta fica inteira.
const raiz = (palavra: string) => (palavra.length <= 4 ? palavra : palavra.slice(0, Math.max(4, palavra.length - 2)));

// O operador escreve a duvida como fala, em frase inteira. Conta quantas palavras com assunto aparecem na
// pergunta (vale o dobro), na resposta ou nas palavras-chave; precisa casar pelo menos metade delas. As
// mais parecidas vem primeiro.
export function buscarDuvidas(duvidas: readonly Duvida[], termo: string): Duvida[] {
  const raizes = [
    ...new Set(
      normalizarBusca(termo)
        .split(/[^a-z0-9]+/)
        .filter((palavra) => palavra.length > 1 && !PALAVRAS_VAZIAS.has(palavra))
        .map(raiz)
    )
  ];
  if (!raizes.length) return [];
  const minimo = Math.ceil(raizes.length / 2);
  const pontuadas: Array<{ duvida: Duvida; pontos: number }> = [];
  for (const duvida of duvidas) {
    const titulo = normalizarBusca(duvida.pergunta);
    const corpo = normalizarBusca([duvida.resposta, ...(duvida.palavras ?? [])].join(" "));
    let casadas = 0;
    let pontos = 0;
    for (const r of raizes) {
      if (titulo.includes(r)) {
        casadas += 1;
        pontos += 2;
      } else if (corpo.includes(r)) {
        casadas += 1;
        pontos += 1;
      }
    }
    if (casadas >= minimo) pontuadas.push({ duvida, pontos });
  }
  return pontuadas.sort((a, b) => b.pontos - a.pontos).map((item) => item.duvida);
}
