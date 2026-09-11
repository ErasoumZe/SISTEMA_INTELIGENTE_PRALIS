import { and, asc, eq, inArray } from "drizzle-orm";
import { transferencias, transferenciasConferenciasRecusadas } from "@padaria/db/schema/transferencia";
import { paraCentavos } from "@padaria/shared/dinheiro";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

/**
 * A regra canonica de "esta transferencia e uma entrega do Caixa para o Cofre" — nos dois dialetos.
 *
 * Modulo PROPRIO, e nao um pedaco de `transferencias.repository.ts`, por duas razoes:
 *
 *  1. **Fonte unica.** A listagem usa o predicado para a tela saber qual regra aplicar; a conferencia
 *     usa para escolher entre o fluxo estrito e o generico; e o fechamento usa para saber se ha
 *     dinheiro na rua. Duas copias divergiriam, e a tela passaria a oferecer uma acao que a API
 *     recusa — que foi exatamente o defeito ja corrigido aqui uma vez.
 *  2. **Sem ciclo.** `transferencias.repository` alcanca `caixa.service` por
 *     `lancamentos.dominio`, entao o Caixa nao pode importar de la. Este arquivo so conhece Drizzle,
 *     o schema e a conexao — qualquer camada pode depender dele.
 *
 * Os tres criterios sao necessarios JUNTOS: nenhum sozinho distingue os fluxos.
 */
export function ehRetornoDoCaixa(linha: { caixaId: string | null; tipo: string }): boolean {
  return linha.caixaId !== null && (linha.tipo === "sangria" || linha.tipo === "retorno");
}

/**
 * P1/#101 · o mesmo fato visto pelo CAMINHO DO DINHEIRO, e nao pelo `tipo` da linha.
 *
 * `ehEntregaCaixaParaCofre` acima pergunta "esta linha e uma entrega ao cofre?" e responde pelo
 * `tipo`, que so o escritor unico do Caixa grava. Esta funcao pergunta outra coisa: "este movimento
 * TIRA dinheiro do caixa e leva ao cofre?" — e responde pelas duas pontas, sem olhar `tipo`.
 *
 * A distincao existe porque foi exatamente por ela que o caminho antigo escapou: a rota generica
 * nunca escreve `tipo` (a linha nasce `suprimento`), entao o predicado por tipo nao a via, embora o
 * dinheiro fizesse o percurso identico. Pela D9/R-179 esse percurso tem UM caminho — o fluxo do
 * proprio Caixa. Quem valida criacao e edicao de transferencia comum usa esta funcao para recusar.
 *
 * As duas pontas sao necessarias juntas: sair da conta do PDV para qualquer outro lugar e
 * transferencia comum, e vir do cofre PARA o caixa e suprimento. So o par exato e entrega.
 */
export function ehMovimentoDoCaixaParaOCofre(movimento: {
  contaOrigemId: string;
  contaDestinoId: string;
  pdvContaId: string | null;
  contaCofreId: string | null;
}): boolean {
  return (
    movimento.pdvContaId !== null &&
    movimento.contaCofreId !== null &&
    movimento.contaOrigemId === movimento.pdvContaId &&
    movimento.contaDestinoId === movimento.contaCofreId
  );
}

/**
 * G1/R-171 · as entregas ao cofre deste caixa que JA SAIRAM e ainda esperam conferencia.
 *
 * A metade SQL do predicado acima, com os mesmos tres criterios na mesma ordem.
 * `isNotNull(empresas.contaCofreId)` e redundante em SQL — a igualdade com NULL ja nao casa — e fica
 * escrito assim de proposito: apagar um dos criterios daqui faria o par divergir sem nenhum teste
 * ficar vermelho.
 */
export async function listarRetornosPendentesRepository(
  caixaId: string,
  db: ExecutorBanco = banco
): Promise<Array<{ id: string; tipo: string; valorCentavos: number; lacre: string | null; criadoEm: Date | null }>> {
  const linhas = await db
    .select({
      id: transferencias.id,
      tipo: transferencias.tipo,
      valorOriginal: transferencias.valorOriginal,
      lacre: transferencias.nLacreDoc,
      criadoEm: transferencias.criadoEm
    })
    .from(transferencias)
    .where(
      and(
        eq(transferencias.caixaId, caixaId),
        eq(transferencias.status, "pendente"),
        inArray(transferencias.tipo, ["sangria", "retorno"])
      )
    )
    .orderBy(asc(transferencias.criadoEm));

  return linhas.map((linha) => ({
    id: linha.id,
    tipo: linha.tipo,
    valorCentavos: paraCentavos(linha.valorOriginal),
    lacre: linha.lacre,
    criadoEm: linha.criadoEm
  }));
}

// R-183 · a ULTIMA tentativa de conferencia de cada entrega. "Ultima" desempata por
// `(criado_em, id)`: duplo clique grava duas linhas no mesmo instante, e sem o id o desfecho ficaria
// nao-deterministico — o `uuid_generate_v7()` e monotonico, entao ele resolve.
//
// Uma consulta so para a lista inteira; o agrupamento fica em memoria porque sao unidades de linhas
// por caixa, e um lateral por transferencia pagaria mais caro do que carrega.
export async function ultimasRecusasPorTransferenciaRepository(
  transferenciaIds: string[],
  db: ExecutorBanco = banco
): Promise<Map<string, { id: string; valorInformadoCentavos: number | null }>> {
  if (!transferenciaIds.length) return new Map();
  const linhas = await db
    .select({
      id: transferenciasConferenciasRecusadas.id,
      transferenciaId: transferenciasConferenciasRecusadas.transferenciaId,
      valorInformado: transferenciasConferenciasRecusadas.valorInformado,
      criadoEm: transferenciasConferenciasRecusadas.criadoEm
    })
    .from(transferenciasConferenciasRecusadas)
    .where(inArray(transferenciasConferenciasRecusadas.transferenciaId, transferenciaIds))
    .orderBy(asc(transferenciasConferenciasRecusadas.criadoEm), asc(transferenciasConferenciasRecusadas.id));

  const ultimas = new Map<string, { id: string; valorInformadoCentavos: number | null }>();
  for (const linha of linhas) {
    ultimas.set(linha.transferenciaId, {
      id: linha.id,
      valorInformadoCentavos: linha.valorInformado === null ? null : paraCentavos(linha.valorInformado)
    });
  }
  return ultimas;
}
