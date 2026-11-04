/**
 * Doc 59 (Rodrigo, 29/10/2026): o pedido só vai sozinho para fornecedor com WhatsApp. Fornecedor sem WhatsApp é
 * cadastro pendente; a lista deles é por onde quem compra começa a completar o cadastro.
 */
export function fornecedorPendente(linha: Record<string, string | undefined>): boolean {
  return (linha.whatsapp ?? "").replace(/\D/g, "").length < 10;
}

export function filtrarFornecedores<T extends Record<string, string | undefined>>(
  linhas: T[],
  filtros: { busca: string; whatsapp: "todos" | "com" | "sem"; situacao: "todos" | "ativos" | "inativos" }
): T[] {
  const termo = (filtros.busca ?? "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
  return linhas.filter((linha) => {
    if (filtros.whatsapp === "sem" && !fornecedorPendente(linha)) return false;
    if (filtros.whatsapp === "com" && fornecedorPendente(linha)) return false;
    if (filtros.situacao === "ativos" && linha.ativo === "Não") return false;
    if (filtros.situacao === "inativos" && linha.ativo !== "Não") return false;
    if (!termo) return true;
    return [linha.nome, linha.documento, linha.whatsapp, linha.categoria].some((valor) =>
      (valor ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .includes(termo)
    );
  });
}
