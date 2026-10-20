export function dataHoraLocal(valor: Date | string = new Date()) {
  const data = new Date(valor);
  data.setMinutes(data.getMinutes() - data.getTimezoneOffset());
  return data.toISOString().slice(0, 16);
}

export function dataHoraParaUtc(valor: Date | string) {
  return new Date(valor).toISOString();
}

export function formatarDataHora(valor: Date | string) {
  return new Date(valor).toLocaleString("pt-BR");
}

/**
 * Exibe quantidades sem zeros decimais artificiais vindos de colunas `numeric(14, 3)`.
 * Exemplos: `40.000` -> `40`, `4.500` -> `4,5`, `4.010` -> `4,01`.
 */
export function formatarQuantidade(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "-";
  const numero = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  if (!Number.isFinite(numero)) return "-";
  return numero.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Mesma regra de quantidade em formato aceito por `<input type="number">` (separador ponto). */
export function normalizarQuantidadeEditavel(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(typeof valor === "string" ? valor.replace(",", ".") : valor);
  if (!Number.isFinite(numero)) return "";
  return String(Number(numero.toFixed(3)));
}

// UNICA forma de exibir campo date-only (coluna `date` do Postgres: data_referencia, data_movimento,
// data_vencimento, data_pagamento, data_nascimento...). Chega como "yyyy-MM-dd" e NAO tem hora.
//
// NAO passa por Date de proposito: new Date("2026-07-16") e lido como meia-noite UTC e, em fuso
// negativo (BRT), volta um dia — era o que fazia o detalhe do caixa mostrar "15/07/2026, 21:00:00"
// numa venda do dia 16. Campo date-only nunca deve encostar em new Date()/toLocaleString.
//
// Para timestamp real (data_hora_abertura, data_venda, criado_em...) use formatarDataHora, que
// converte para o fuso local corretamente.
export function formatarDataSomenteDia(valor: string | null | undefined) {
  if (!valor) return "-";
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

// Dia LOCAL de um timestamp real (nao date-only). Diferente de fatiar o ISO, que devolveria o dia
// em UTC: uma emissao as 22h de 15/07 em BRT esta em "2026-07-16T01:00Z" e seria exibida como 16.
export function formatarDiaDeTimestamp(valor: string | Date | null | undefined) {
  return valor ? new Date(valor).toLocaleDateString("pt-BR") : "-";
}

// Hora real (HH:mm:ss) de um timestamp. Usada na coluna "Hora" do relatorio de vendas.
export function formatarHora(valor: string | Date | null | undefined) {
  return valor ? new Date(valor).toLocaleTimeString("pt-BR") : "-";
}

export function apenasDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

export function mascararCpf(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 11);
  return digitos
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function mascararCnpj(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 14);
  return digitos
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function mascararDocumento(valor: string) {
  return apenasDigitos(valor).length > 11 ? mascararCnpj(valor) : mascararCpf(valor);
}

export function documentoEhCpf(valor: string) {
  const digitos = apenasDigitos(valor);
  return digitos.length > 0 && digitos.length <= 11;
}

export function mascararWhatsapp(valor: string) {
  const todos = apenasDigitos(valor);
  // Numero que nao tem forma brasileira sai CRU, sem truncar: DDD + numero (10 ou 11 digitos), ou o
  // mesmo com DDI 55 (12 ou 13). Qualquer outro comprimento era cortado para 11 digitos — invisivel
  // enquanto o telefone nao voltava para o formulario, mas desde que o WhatsApp do usuario passou a
  // ser carregado na edicao (migration 0060) o salvar seguinte gravava o numero mutilado em cima do
  // numero certo. O banco aceita de 10 a 15 digitos.
  const formaBrasileira =
    todos.length === 10 ||
    todos.length === 11 ||
    ((todos.length === 12 || todos.length === 13) && todos.startsWith("55"));
  if (todos.length > 2 && !formaBrasileira) return todos;
  const recebidos = todos;
  const temDdiBrasil = recebidos.startsWith("55") && recebidos.length > 11;
  const digitos = temDdiBrasil ? recebidos.slice(2) : recebidos.slice(0, 11);
  if (digitos.length <= 2) return temDdiBrasil ? `+55 ${digitos}` : digitos;
  const prefixo = digitos.length > 10 ? digitos.slice(2, 7) : digitos.slice(2, 6);
  const sufixo = digitos.length > 10 ? digitos.slice(7) : digitos.slice(6);
  return `${temDdiBrasil ? "+55 " : ""}(${digitos.slice(0, 2)}) ${prefixo}${sufixo ? `-${sufixo}` : ""}`;
}

export function normalizarWhatsappParaLink(valor: string) {
  const digitos = apenasDigitos(valor);
  return digitos.length <= 11 ? `55${digitos}` : digitos;
}

export function mascararCep(valor: string) {
  const digitos = apenasDigitos(valor).slice(0, 8);
  return digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
}
