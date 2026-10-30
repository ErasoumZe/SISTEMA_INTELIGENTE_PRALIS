import type { DadosExternos } from "@padaria/shared/api";
import {
  contagemFisicaRelatorioSchema,
  type ContagemFisicaEntrada,
  type ContagemFisicaRelatorio
} from "@padaria/shared/caixa";
import { paraCentavos } from "@padaria/shared/dinheiro";
import { ErroDominio } from "../erros.js";

// R-232 · contagem fisica cega: o operador conta cedulas e moedas ANTES de ver o esperado, no primeiro passo de
// Vendas. Ela fica gravada no relatorio de vendas e trava: corrigir exige justificativa, e original, corrigido e
// motivo ficam no historico para a Tesouraria. O fechamento usa ESTA contagem (nao recebe outra no fim).

/** Le a contagem gravada no `dados` do relatorio de vendas (ou null se o relatorio e anterior a R-232). */
export function lerContagemFisica(dados: DadosExternos): ContagemFisicaRelatorio | null {
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) return null;
  const lida = contagemFisicaRelatorioSchema.safeParse((dados as Record<string, DadosExternos>)["contagemFisica"]);
  return lida.success ? lida.data : null;
}

/**
 * Monta a contagem que vai para o relatorio. Primeira vez: grava. Depois: igual a anterior passa direto; diferente
 * exige justificativa e entra no historico de correcoes (o primeiro registro nunca e apagado).
 */
export function registrarContagemFisica(entrada: {
  contagem: ContagemFisicaEntrada;
  justificativa: string | null | undefined;
  anterior: ContagemFisicaRelatorio | null;
  esperadoCentavos: number;
  usuarioId: string;
  agora: Date;
}): ContagemFisicaRelatorio {
  const especie = paraCentavos(entrada.contagem.valorEspecie);
  const moedas = paraCentavos(entrada.contagem.valorMoedas);
  const anterior = entrada.anterior;
  const mudou =
    anterior !== null &&
    (paraCentavos(anterior.valorEspecie) !== especie || paraCentavos(anterior.valorMoedas) !== moedas);
  const justificativa = entrada.justificativa?.trim() ?? "";
  if (mudou && justificativa.length < 5) {
    throw new ErroDominio(
      "A contagem física já foi registrada. Para corrigir, explique o motivo.",
      422,
      "CONTAGEM_EXIGE_JUSTIFICATIVA"
    );
  }
  const total = especie + moedas;
  return {
    valorEspecie: especie / 100,
    valorMoedas: moedas / 100,
    total: total / 100,
    esperado: entrada.esperadoCentavos / 100,
    diferenca: (total - entrada.esperadoCentavos) / 100,
    registradaEm: anterior?.registradaEm ?? entrada.agora.toISOString(),
    registradaPor: anterior?.registradaPor ?? entrada.usuarioId,
    correcoes: [
      ...(anterior?.correcoes ?? []),
      ...(mudou
        ? [
            {
              de: { valorEspecie: anterior.valorEspecie, valorMoedas: anterior.valorMoedas },
              para: { valorEspecie: especie / 100, valorMoedas: moedas / 100 },
              justificativa,
              em: entrada.agora.toISOString(),
              por: entrada.usuarioId
            }
          ]
        : [])
    ]
  };
}
