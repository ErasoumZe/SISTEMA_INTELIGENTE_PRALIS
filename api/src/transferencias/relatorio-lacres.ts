import type { LacreRelatorio, SituacaoMalote } from "@padaria/shared/transferencias";

// Regras PURAS do relatorio de Transferencias: nada aqui le banco nem grava. Recebem o que o
// repositorio ja leu e DERIVAM a situacao do malote e de cada lacre.
//
// Modelo (tabela `lacres`):
//  - origem 'saida'      + transferencia_id = T            -> lacre de ABERTURA do malote T
//  - origem 'fechamento' + transferencia_id = T            -> lacre de FECHAMENTO reservado no malote T
//  - origem 'retorno'    + transferencia_distribuicao_id=T -> BOLSA de sangria enviada dentro do malote T;
//                          transferencia_id fica nulo ate a sangria usar a bolsa (T2)
//  - o MESMO registro 'retorno' aparece em duas linhas, com papeis diferentes: bolsa na linha do malote
//    (por distribuicao) e lacre proprio na linha da sangria (por transferencia_id). Nunca se junta os
//    dois casos com `OR` sem rotulo: o papel e decidido AQUI, pela chave que casou.

export type LacreDoBanco = {
  numero: string;
  origem: string;
  transferenciaId: string | null;
  transferenciaDistribuicaoId: string | null;
  rompido: boolean;
};

export type LinhaParaRelatorio = {
  id: string;
  tipo: string;
  status: string;
  caixaId: string | null;
  nLacreDoc: string | null;
  ehPlanejamentoRetorno: boolean;
  // `fechamentos_caixa.lacre_fechamento`: so existe nos caixas que ja fecharam. Cobre os caixas
  // anteriores ao lacre reservado no malote, que nao teriam linha em `lacres` com origem 'fechamento'.
  lacreFechamentoDoCaixa: string | null;
  pdvsDestino: string[];
};

/** Malote Cofre -> PDV (a "ida"): nasce `suprimento` e vira `abertura` quando um caixa o reivindica. */
export function ehMaloteDeIda(linha: Pick<LinhaParaRelatorio, "tipo" | "ehPlanejamentoRetorno" | "pdvsDestino">) {
  if (linha.ehPlanejamentoRetorno) return false;
  if (linha.tipo === "abertura") return true;
  return linha.tipo === "suprimento" && linha.pdvsDestino.length > 0;
}

export function derivarSituacaoMalote(
  linha: Pick<LinhaParaRelatorio, "tipo" | "status" | "caixaId" | "ehPlanejamentoRetorno" | "pdvsDestino">
): SituacaoMalote | null {
  if (!ehMaloteDeIda(linha)) return null;
  switch (linha.status) {
    case "cancelada":
      // Suprimento presa a um caixa e o recebimento sem lacre que o operador recusou (R-231): nao e malote.
      return linha.tipo === "suprimento" && linha.caixaId !== null ? null : "cancelado";
    case "divergente":
      return "divergente";
    // A abertura recusa "Transferencia agendada ainda nao foi liberada": nao e disponivel.
    case "agendada":
      return "agendado";
    case "recebido":
      if (linha.tipo === "abertura") return "usado";
      // Suprimento direto para conta de PDV com caixa aberto (R-190) pertence ao caixa: nao e malote.
      return linha.caixaId === null ? "recebido_sem_caixa" : null;
    case "pendente":
      return linha.caixaId === null ? "disponivel" : null;
    default:
      return null;
  }
}

function porNumero(a: LacreDoBanco, b: LacreDoBanco) {
  return a.numero.localeCompare(b.numero, "pt-BR", { numeric: true });
}

/**
 * Lacres de UMA linha. `mostrarNumeros = false` oculta (numero = null) so o que AINDA NAO foi rompido
 * e e segredo fisico do posto: lacre de fechamento reservado e bolsas ainda nao conferidas.
 * O numero do lacre de abertura e do proprio lacre da sangria ja trafega em `nLacreDoc` e nao e mascarado.
 */
export function montarLacresDaLinha(
  linha: LinhaParaRelatorio,
  lacresDaPagina: LacreDoBanco[],
  mostrarNumeros: boolean
): LacreRelatorio[] {
  const resultado: LacreRelatorio[] = [];
  const numeroVisivel = (lacre: LacreDoBanco) => (mostrarNumeros || lacre.rompido ? lacre.numero : null);

  if (ehMaloteDeIda(linha)) {
    const abertura = lacresDaPagina.find((item) => item.origem === "saida" && item.transferenciaId === linha.id);
    const numeroAbertura = abertura?.numero ?? linha.nLacreDoc;
    if (numeroAbertura) {
      const usado = abertura ? abertura.rompido : linha.status === "recebido";
      resultado.push({
        tipo: "abertura",
        numero: numeroAbertura,
        situacao: usado ? "usado" : "disponivel",
        usadoEmTransferenciaId: null
      });
    }

    const fechamento = lacresDaPagina.find((item) => item.origem === "fechamento" && item.transferenciaId === linha.id);
    if (fechamento) {
      resultado.push({
        tipo: "fechamento",
        numero: numeroVisivel(fechamento),
        situacao: fechamento.rompido ? "usado" : "reservado",
        usadoEmTransferenciaId: null
      });
    } else if (linha.lacreFechamentoDoCaixa) {
      resultado.push({
        tipo: "fechamento",
        // Sem registro em `lacres` nao ha como saber se o selo ja foi rompido (a conferencia vem depois do
        // fechamento): so quem pode ver numeros lacrados o le.
        numero: mostrarNumeros ? linha.lacreFechamentoDoCaixa : null,
        situacao: "usado",
        usadoEmTransferenciaId: null
      });
    }

    const bolsas = lacresDaPagina
      .filter((item) => item.origem === "retorno" && item.transferenciaDistribuicaoId === linha.id)
      .sort(porNumero);
    for (const bolsa of bolsas) {
      resultado.push({
        tipo: "sangria",
        numero: numeroVisivel(bolsa),
        situacao: bolsa.rompido
          ? "conferida"
          : bolsa.transferenciaId !== null
            ? "usada_aguardando_conferencia"
            : "disponivel",
        usadoEmTransferenciaId: bolsa.transferenciaId
      });
    }
    return resultado;
  }

  // Linha de sangria/retorno: o lacre dela e a bolsa que ela consumiu.
  const proprio = lacresDaPagina.find(
    (item) =>
      item.origem === "retorno" && item.transferenciaId === linha.id && item.transferenciaDistribuicaoId !== linha.id
  );
  if (proprio) {
    resultado.push({
      tipo: "sangria",
      numero: proprio.numero,
      situacao: proprio.rompido ? "conferida" : "usada_aguardando_conferencia",
      usadoEmTransferenciaId: linha.id
    });
  }
  return resultado;
}

/** Escapa `\`, `%` e `_` para uso seguro em `ILIKE` (o D-14 do brain: `%` casava qualquer lacre). */
export function escaparCuringasLike(valor: string) {
  return valor.replace(/[\\%_]/g, (caractere) => `\\${caractere}`);
}
