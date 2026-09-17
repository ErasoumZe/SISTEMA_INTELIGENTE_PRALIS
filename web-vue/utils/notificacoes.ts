import type { Notificacao, TipoNotificacao } from "@padaria/shared/notificacoes";

export type FiltroNotificacoes = {
  tipo: TipoNotificacao | "";
  dataInicio: string;
  dataFim: string;
};

function dataLocalIso(valor: string) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

export function filtrarNotificacoes(itens: Notificacao[], filtro: FiltroNotificacoes) {
  return itens.filter((item) => {
    if (filtro.tipo && item.tipo !== filtro.tipo) return false;
    const data = dataLocalIso(item.criadoEm);
    if (filtro.dataInicio && (!data || data < filtro.dataInicio)) return false;
    if (filtro.dataFim && (!data || data > filtro.dataFim)) return false;
    return true;
  });
}

export function paginaNotificacoes(itens: Notificacao[], pagina: number, porPagina: number) {
  const tamanho = Math.max(1, porPagina);
  const totalPaginas = Math.max(1, Math.ceil(itens.length / tamanho));
  const paginaSegura = Math.min(Math.max(1, pagina), totalPaginas);
  const inicio = (paginaSegura - 1) * tamanho;
  return { itens: itens.slice(inicio, inicio + tamanho), pagina: paginaSegura, totalPaginas };
}
