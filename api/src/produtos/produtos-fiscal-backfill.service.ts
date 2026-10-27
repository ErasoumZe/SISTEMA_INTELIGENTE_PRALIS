import { aplicarResultadoFiscal, type FiscalDoProduto } from "@padaria/shared/produtos";
import { executarEmTransacao } from "../banco/conexao.js";
import { elegiveisDoBackfillRepository } from "./produtos-fiscal-backfill.repository.js";
import { contextoFiscalRepository } from "./produtos-fiscal.repository.js";
import { classificarProdutoFiscal, lojaFiscalDaEmpresa, tabelasFiscais } from "./produtos-fiscal.service.js";
import { regravarFiscalDoProdutoRepository, travarCadastroDeProdutos } from "./produtos-escrita.repository.js";

/**
 * Backfill da carga fiscal — igual ao `BackfillFiscalService` do app oficial (R-222): mesmo caminho de
 * classificacao do cadastro, em lote, com as travas de operacao em massa — conferencia por padrao
 * (`aplicar` explicito), retomada por cursor e relatorio do que muda. Nao toca em quem JA tem carga
 * (`completo` nao entra) e nao inventa: onde a fonte cala, grava a pendencia com o motivo.
 * Nao escreve na planilha (o ERP nao escreve la ate a virada combinada).
 */
export class BackfillSoAdministradorError extends Error {
  readonly code = "FORBIDDEN";
  constructor() {
    super("Apenas o administrador completa a carga fiscal em lote.");
    this.name = "BackfillSoAdministradorError";
  }
}

export interface ResultadoBackfillFiscal {
  aplicou: boolean;
  analisados: number;
  porEstado: Record<string, number>;
  alterados: Array<{ id: string; nome: string; de: string; para: string; motivo: string }>;
  proximoCursor: string | null;
}

/** Marca a TENTATIVA de classificacao (mesma regra da gravacao do cadastro). */
const carimbar = (fiscal: FiscalDoProduto): FiscalDoProduto => ({
  ...fiscal,
  conferidoEm: fiscal.estado ? new Date().toISOString() : null
});

const paraGravar = (fiscal: FiscalDoProduto) => ({
  ncm: fiscal.ncm ?? null,
  cest: fiscal.cest ?? null,
  categoriaFiscal: fiscal.categoriaFiscal ?? null,
  cstPisCofins: fiscal.cstPisCofins ?? null,
  aliquotaCheia: fiscal.aliquotaCheia ?? null,
  aliquotaFcp: fiscal.aliquotaFcp ?? null,
  aliquotaPis: fiscal.aliquotaPis ?? null,
  aliquotaCofins: fiscal.aliquotaCofins ?? null,
  reducaoIcms: fiscal.reducaoIcms ?? null,
  icms: fiscal.icms ?? null,
  tributacaoSimples: fiscal.tributacaoSimples ?? null,
  aliquotaSimples: fiscal.aliquotaSimples ?? null,
  icmsRe: fiscal.icmsRe ?? null,
  baseFiscal: fiscal.baseFiscal ?? null,
  codigoFiscal: fiscal.codigoFiscal ?? null,
  produtoFiscal: fiscal.produtoFiscal ?? null,
  cstReforma: fiscal.cstReforma ?? null,
  cClassTrib: fiscal.cClassTrib ?? null,
  aliquotaIbs: fiscal.aliquotaIbs ?? null,
  aliquotaCbs: fiscal.aliquotaCbs ?? null,
  origemFiscal: fiscal.origemFiscal ?? null,
  aliquotaEcf: fiscal.aliquotaEcf ?? null,
  aliquotaEcfId: fiscal.aliquotaEcfId ?? null,
  estado: fiscal.estado ?? null,
  motivo: fiscal.motivo ?? null,
  conferidoEm: fiscal.conferidoEm ?? null,
  pctNcm: fiscal.pctNcm ?? null
});

export async function executarBackfillFiscal(
  filtro: {
    empresaId?: string | undefined;
    produtoId?: string | undefined;
    cursor?: string | undefined;
    limite?: number | undefined;
    aplicar: boolean;
  },
  ator: { administrador: boolean; empresasPermitidas: string[] }
): Promise<ResultadoBackfillFiscal> {
  if (!ator.administrador) throw new BackfillSoAdministradorError();
  const fila = await elegiveisDoBackfillRepository({
    escopoEmpresas: ator.empresasPermitidas,
    empresaId: filtro.empresaId,
    produtoId: filtro.produtoId,
    cursor: filtro.cursor,
    limite: Math.min(500, Math.max(1, filtro.limite ?? 100))
  });
  // A planilha e lida uma vez (cache): fora do ar, cada produto vira "fonte_indisponivel".
  await tabelasFiscais().catch(() => null);

  const porEstado: Record<string, number> = {};
  const alterados: ResultadoBackfillFiscal["alterados"] = [];
  for (const produto of fila) {
    const nome = produto.nomeCatalogo?.trim() || produto.descricao;
    await executarEmTransacao(async (tx) => {
      if (filtro.aplicar) await travarCadastroDeProdutos(tx);
      const contexto = await contextoFiscalRepository(tx, {
        empresaId: produto.empresaId,
        grupoMercadoriaId: produto.grupoMercadoriaId,
        produtoId: produto.id
      });
      const resultado = await classificarProdutoFiscal({
        nome,
        codigoBarras: produto.codigoBarras,
        grupo: contexto.grupoNome,
        loja: lojaFiscalDaEmpresa(contexto.matriculaPrefixo)
      });
      porEstado[resultado.estado] = (porEstado[resultado.estado] ?? 0) + 1;
      const mudou = resultado.estado !== (produto.estado ?? "nao_classificado");
      const ganhouCarga = Boolean(resultado.classificacao?.ecf);
      if (!mudou && !ganhouCarga) return;
      alterados.push({
        id: produto.id,
        nome,
        de: produto.estado ?? "(sem registro)",
        para: resultado.estado,
        motivo: resultado.motivo
      });
      if (!filtro.aplicar) return;
      // O MESMO caminho do cadastro: o backfill nunca produz produto diferente do que a tela produz.
      const fiscal = carimbar(aplicarResultadoFiscal(contexto.atual?.fiscal ?? null, resultado).fiscal);
      await regravarFiscalDoProdutoRepository(tx, produto.id, paraGravar(fiscal));
    });
  }
  return {
    aplicou: filtro.aplicar,
    analisados: fila.length,
    porEstado,
    alterados,
    proximoCursor: fila.length ? fila[fila.length - 1]!.id : null
  };
}
