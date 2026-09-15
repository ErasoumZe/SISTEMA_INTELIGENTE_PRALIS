// R-127 — o texto do movimento vive em `observacao`.
//
// As quatro tabelas de movimento tinham DUAS colunas de texto: `descricao` (era o que a tela
// gravava) e `observacao` (sem uso). Decisao do Jose (01/08/2026): o texto e OBSERVACAO. A 0027 fez
// o backfill e tirou o NOT NULL de `descricao`; a coluna sai numa migration futura, depois de
// producao rodar estavel.
//
// Este modulo fica SOZINHO, sem importar nada do dominio, de proposito: `caixa.repository` precisa
// do helper de leitura, e `lancamentos.dominio` importa de `caixa.service`, que importa de
// `caixa.repository`. Pendurar isto no dominio fecharia um ciclo de import.
import { sql, type SQL } from "drizzle-orm";
import type { DadosExternos } from "@padaria/shared/api";
import { podeLancarSemCaixa, type PerfilUsuario } from "@padaria/shared/autenticacao";
import { dataPagamentoNoPassado, diaNegocio } from "@padaria/shared/datas";

// LEITURA: o novo campo com reserva no antigo. A 0027 ja preencheu o historico, entao o fallback e
// rede de seguranca para o que escapou — nao a fonte do dado.
export function textoDoMovimento(tabela: { descricao: DadosExternos; observacao: DadosExternos }): SQL<string> {
  return sql<string>`coalesce(nullif(${tabela.observacao}, ''), ${tabela.descricao}, '')`;
}

// ESCRITA: o texto vem de `observacao`; `descricao` e aceita como reserva para nao quebrar chamada
// antiga (a tela velha ainda manda `descricao`). Vazio nos dois e recusa — movimento sem texto e o
// que ninguem consegue auditar depois. Devolve o payload com `observacao` ja resolvida, para o
// repositorio gravar um lugar so.
export function resolverObservacaoDoLancamento<
  T extends { observacao?: string | null | undefined; descricao?: string | null | undefined }
>(dados: T): T & { observacao: string } {
  const texto = (dados.observacao ?? "").trim() || (dados.descricao ?? "").trim();
  if (!texto) throw new Error("Observação obrigatória");
  return { ...dados, observacao: texto };
}

// R-129 — a data de pagamento nao pode ser anterior a HOJE na CRIACAO do lancamento.
//
// Tres excecoes deliberadas, senao a regra trava trabalho legitimo:
//  1. EDICAO de lancamento antigo — uma despesa da semana passada, paga na semana passada, precisa
//     continuar editavel. Por isso o `dataPagamentoAnterior`: so valida quando a data MUDA.
//  2. OCORRENCIAS de recorrencia — nascem com data futura e passam naturalmente; a regra nao e
//     aplicada em lote sobre serie ja existente.
//  3. PERFIL DE RETAGUARDA — Tesouraria/Financeiro registrando pagamento retroativo. NAO tratado
//     aqui de proposito: a regra vale para todos ate o Jose decidir (ver relatorio).
//
// "Hoje" e o dia contabil no fuso do negocio (`dataPagamentoNoPassado`), nao UTC — senao quem lanca
// as 21h em Sao Paulo levaria erro num pagamento marcado para hoje.
export function exigirDataPagamentoNaoRetroativa(
  dataPagamento: string | null | undefined,
  dataPagamentoAnterior?: string | null
): void {
  const nova = dataPagamento?.trim().slice(0, 10) || null;
  if (!nova) return;
  // Edicao que NAO mexeu na data de pagamento: o registro antigo continua editavel.
  const anterior = dataPagamentoAnterior?.trim().slice(0, 10) || null;
  if (anterior && anterior === nova) return;
  if (dataPagamentoNoPassado(nova)) throw new Error("Data de pagamento não pode ser anterior a hoje");
}

// R-203 — Despesa e mercadoria registradas pelo Caixa representam ato do dia. A API é a fonte de
// verdade: limitar só o calendário deixaria qualquer cliente HTTP retroagir o caixa. O Administrador
// Geral (`usuario_admin`) mantém a exceção aprovada; a retaguarda não retroage, mas pode programar.
// Uma data histórica inalterada continua editável para preservar o histórico.
export function exigirDataPagamentoDeDespesaOuMercadoria(
  dataPagamento: string | null | undefined,
  perfil: PerfilUsuario,
  dataPagamentoAnterior?: string | null
): void {
  const nova = dataPagamento?.trim().slice(0, 10) || null;
  if (!nova) return;
  const anterior = dataPagamentoAnterior?.trim().slice(0, 10) || null;
  if (anterior && anterior === nova) return;
  // A exceção não é uma permissão herdável: somente o role de Administrador Geral
  // (`usuario_admin`) pode registrar uma quitação retroativa. O `admin` legado segue
  // as mesmas travas de data dos demais perfis.
  if (perfil.role === "usuario_admin") return;
  if (dataPagamentoNoPassado(nova)) throw new Error("Data de pagamento não pode ser anterior a hoje");
  if (!podeLancarSemCaixa(perfil) && nova !== diaNegocio(new Date())) {
    throw new Error("Operador de caixa só pode registrar pagamento na data de hoje");
  }
}
