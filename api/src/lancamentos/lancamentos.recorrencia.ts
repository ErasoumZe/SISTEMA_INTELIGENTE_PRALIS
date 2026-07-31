// Recorrencia de lancamento (PROJECT_BRAIN/17, D3): registra a definicao e devolve as ocorrencias
// que o servico vai gravar. A aritmetica de datas e pura e mora no shared; aqui ficam a permissao,
// a gravacao da definicao e as regras de o que muda de uma ocorrencia para a outra.
import { diferencaEmDias, somarDias } from "@padaria/shared";
import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import { datasDaRecorrencia, type Recorrencia } from "@padaria/shared/recorrencia";
import { lancamentosRecorrencias } from "@padaria/db/schema/lancamento";
import type { ExecutorBanco } from "../banco/conexao.js";
import { exigirPermissaoLancamento } from "./lancamentos.dominio.js";

export type DominioRecorrencia = "despesa" | "mercadoria" | "retirada";

export type VinculoRecorrencia = { id: string; ordem: number };

export type OcorrenciaRecorrencia = {
  vinculo: VinculoRecorrencia;
  dataReferencia: string;
  dataVencimento: string;
  // A PRIMEIRA e o lancamento que a pessoa esta criando: mantem tudo o que ela digitou (inclusive
  // pagamento e o caixa aberto). As demais sao futuras — nascem NAO PAGAS e SEM caixa (D3).
  ehPrimeira: boolean;
};

export type PlanoRecorrencia = {
  ocorrencias: OcorrenciaRecorrencia[];
  // A serie pedida nao coube no teto da frequencia; o servico usa isso para responder quantos criou.
  limitadaPeloTeto: boolean;
};

/**
 * Autorizacao de criar SERIE (D3: so Admin, Gerencia e Financeiro).
 *
 * Chamada no inicio do servico, junto das demais permissoes — e nao la dentro, na hora de gravar.
 * Autorizacao e decisao de REQUISICAO: checada tarde, quem nao pode receberia primeiro um erro de
 * outra coisa (ex.: "abra um caixa") e nunca saberia que o problema era a permissao.
 */
export function exigirPermissaoRecorrencia(perfil: PerfilUsuario, recorrencia: Recorrencia | undefined) {
  if (!recorrencia) return;
  exigirPermissaoLancamento(perfil.permissoes, "lancamentos_recorrencia_criar");
}

/**
 * Registra a recorrencia e planeja as ocorrencias. `null` quando nao ha serie a criar.
 *
 * A permissao ja foi exigida por exigirPermissaoRecorrencia no inicio do servico; a checagem e
 * repetida aqui de proposito, para a funcao nao depender de quem a chama para ser segura.
 */
export async function planejarRecorrencia(
  input: {
    empresaId: string;
    dominio: DominioRecorrencia;
    dataReferencia: string;
    dataVencimento: string;
    recorrencia: Recorrencia | undefined;
    perfil: PerfilUsuario;
  },
  db: ExecutorBanco
): Promise<PlanoRecorrencia | null> {
  if (!input.recorrencia) return null;
  exigirPermissaoLancamento(input.perfil.permissoes, "lancamentos_recorrencia_criar");

  // Dias da semana so significam algo na frequencia semanal — "toda terca" numa serie mensal nao
  // quer dizer nada. Descartados aqui para nao ficarem gravados sugerindo uma regra que nao existe.
  const diasSemana = input.recorrencia.frequencia === "semana" ? input.recorrencia.diasSemana : undefined;
  const serie = datasDaRecorrencia(input.dataVencimento, { ...input.recorrencia, diasSemana });
  // Uma data so = a pessoa pediu "repetir 1 vez", que e o mesmo que nao repetir. Nao vale gravar
  // uma definicao de recorrencia que nao gerou serie nenhuma.
  if (serie.datas.length <= 1) return null;

  const [registro] = await db
    .insert(lancamentosRecorrencias)
    .values({
      empresaId: input.empresaId,
      dominio: input.dominio,
      frequencia: input.recorrencia.frequencia,
      diasSemana: diasSemana?.length ? [...new Set(diasSemana)].sort((a, b) => a - b).join(",") : null,
      repeticoes: input.recorrencia.repeticoes,
      dataInicial: input.dataVencimento,
      criadoPor: input.perfil.usuarioId
    })
    .returning({ id: lancamentosRecorrencias.id });
  if (!registro) throw new Error("Recorrencia nao registrada");

  // A distancia entre lancar e vencer e uma decisao da pessoa ("lanco 6 dias antes de vencer") e
  // vale para a serie toda: cada ocorrencia mantem o MESMO intervalo. Colocar dataReferencia = hoje
  // em todas jogaria 12 lancamentos no dia de hoje e estouraria o resumo do dia.
  const diasAntesDoVencimento = diferencaEmDias(input.dataReferencia, input.dataVencimento);

  return {
    limitadaPeloTeto: serie.limitadaPeloTeto,
    ocorrencias: serie.datas.map((dataVencimento, indice) => ({
      vinculo: { id: registro.id, ordem: indice + 1 },
      dataVencimento,
      dataReferencia: somarDias(dataVencimento, -diasAntesDoVencimento),
      ehPrimeira: indice === 0
    }))
  };
}

/**
 * Payload de UMA ocorrencia, a partir do que a pessoa digitou.
 *
 * As futuras nascem NAO PAGAS (D3: "como nao-pagos, vencendo na data") — mesmo que o lancamento
 * inicial esteja pago, o de setembro nao esta. E nascem sem foto: o comprovante e daquele mes.
 */
// T exige dataPagamento: os servicos ja normalizam (`dataPagamento ?? null`) antes de chamar, e
// pedir o campo no tipo e o que deixa a funcao ZERAR o pagamento das futuras sem precisar de cast.
export function payloadDaOcorrencia<
  T extends { dataReferencia: string; dataVencimento: string; dataPagamento: string | null }
>(dados: T, ocorrencia: OcorrenciaRecorrencia): T {
  const base = { ...dados, dataReferencia: ocorrencia.dataReferencia, dataVencimento: ocorrencia.dataVencimento };
  if (ocorrencia.ehPrimeira) return base;
  return {
    ...base,
    dataPagamento: null,
    // A foto e o comprovante DAQUELE mes: copiar para as futuras anexaria a nota errada em 11
    // lancamentos. Condicional porque retirada nao tem o campo.
    ...("fotoDocumentoUrl" in dados ? { fotoDocumentoUrl: null } : {})
  };
}

/**
 * Caixa da ocorrencia. So a PRIMEIRA entra no caixa aberto: as futuras nao pertencem ao caixa de
 * hoje e prende-las nele somaria 12 despesas no fechamento desta noite.
 */
export function caixaDaOcorrencia(caixaId: string | null | undefined, ocorrencia: OcorrenciaRecorrencia) {
  return ocorrencia.ehPrimeira ? (caixaId ?? null) : null;
}
