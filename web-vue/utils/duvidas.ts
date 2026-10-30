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

// Toda palavra digitada precisa aparecer na pergunta, na resposta ou nas palavras-chave. Pergunta que
// casa no titulo vem antes da que so casa na resposta.
export function buscarDuvidas(duvidas: readonly Duvida[], termo: string): Duvida[] {
  const palavras = normalizarBusca(termo).split(/\s+/).filter(Boolean);
  if (!palavras.length) return [...duvidas];
  const pontuadas: Array<{ duvida: Duvida; pontos: number }> = [];
  for (const duvida of duvidas) {
    const titulo = normalizarBusca(duvida.pergunta);
    const corpo = normalizarBusca([duvida.resposta, ...(duvida.palavras ?? [])].join(" "));
    if (!palavras.every((palavra) => titulo.includes(palavra) || corpo.includes(palavra))) continue;
    pontuadas.push({ duvida, pontos: palavras.filter((palavra) => titulo.includes(palavra)).length });
  }
  return pontuadas.sort((a, b) => b.pontos - a.pontos).map((item) => item.duvida);
}
