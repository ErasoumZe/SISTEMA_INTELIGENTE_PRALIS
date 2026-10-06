import type { PerfilUsuario } from "@padaria/shared/autenticacao";
import type { ResultadoPaginado } from "@padaria/shared/api";
import type {
  TotaisVendas,
  VendaCriada,
  VendaDetalheDto,
  VendaDto,
  VendaPayload,
  VendasQuery
} from "@padaria/shared/vendas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  exigirPermissaoLancamento,
  obterCaixaParaLancamento,
  somaConfereCentavos,
  somaConfereComTotalCentavos
} from "../lancamentos/lancamentos.dominio.js";
import {
  atualizarVendaRepository,
  buscarVendaDetalheRepository,
  travarVendaRepository,
  criarVendaRepository,
  listarVendasRepository,
  listarVendasPaginadasRepository,
  totaisVendasRepository,
  assinaturaDoPagamento,
  vendaEhIntegradaRepository
} from "./vendas.repository.js";
import { liquidoCentavos } from "@padaria/shared/dinheiro";
import { proibido } from "../erros.js";
import {
  resolverComputarLancamento,
  resolverDataPagamentoLancamento,
  validarEdicaoNoCaixaAberto,
  validarReferenciasVenda
} from "../lancamentos/lancamentos.dominio.js";

/**
 * R-173, confirmada por Marco em 26/08/2026.
 *
 * As duas somas da venda comparam com bases DIFERENTES, e a diferenca e proposital:
 *
 *   ITENS  -> `valor_original`, que e o SUBTOTAL. Os itens compoem o subtotal; desconto e acrescimo
 *             sao da venda inteira e entram depois, em colunas proprias.
 *
 *   PAGAMENTOS -> o LIQUIDO (`original - desconto + acrescimo`), que e o VALOR FINAL COBRADO DO
 *             CLIENTE. E o que ele efetivamente precisou pagar, e portanto e com isso que a soma das
 *             formas de pagamento tem de bater.
 *
 * Ate esta correcao, os pagamentos eram comparados com o `valor_original`. Para qualquer venda com
 * desconto ou acrescimo isso era insatisfazivel contra a R-173: o payload que fechava com o liquido
 * (o correto) era recusado com 400 e NADA era gravado. Nao era dinheiro errado no banco — era venda
 * que nao se conseguia editar, com a mensagem apontando para o lugar errado.
 *
 * `liquidoCentavos` e a MESMA funcao que o saldo da conta, o relatorio e a ingestao usam. Uma
 * formula so para "quanto vale esta venda" — o que o ADR-001 exige.
 *
 * Taxa de adquirente NAO entra aqui: ela e custo financeiro separado e nao reduz o que o cliente
 * precisou pagar. Nao ha, e nao pode haver, termo de taxa em `liquidoCentavos`.
 */
export function validarVenda(dados: VendaPayload): void {
  if (dados.itensVenda.length) {
    const valores = dados.itensVenda.map((item) => item.valorTotal);
    if (!somaConfereCentavos(valores, dados.valorOriginal)) {
      throw new Error("Soma dos itens da venda deve bater com o valor original");
    }
  }
  if (dados.tiposPagamento.length) {
    const valores = dados.tiposPagamento.map((item) => item.totalPago);
    if (!somaConfereComTotalCentavos(valores, liquidoCentavos(dados))) {
      throw new Error(
        "Soma dos pagamentos da venda deve bater com o valor final cobrado do cliente (original - desconto + acrescimo)"
      );
    }
  }
}

export async function listarVendas(query: VendasQuery, empresasPermitidasIds: string[] | null): Promise<VendaDto[]> {
  if (empresasPermitidasIds?.length === 0) return [];
  return listarVendasRepository(query, empresasPermitidasIds);
}

// Relatorio: pagina no banco antes de buscar pagamentos e comprovantes. A tela nao pode transformar
// todo o historico em um array/IN gigante so para mostrar uma pagina.
export async function listarVendasPaginadas(
  query: VendasQuery,
  empresasPermitidasIds: string[] | null
): Promise<ResultadoPaginado<VendaDto>> {
  const page = Number(query.page);
  const pageSize = Number(query.pageSize);
  if (empresasPermitidasIds?.length === 0) {
    return { itens: [], total: 0, page, pageSize };
  }
  return listarVendasPaginadasRepository(query, empresasPermitidasIds);
}

export async function totaisVendas(query: VendasQuery, empresasPermitidasIds: string[] | null): Promise<TotaisVendas> {
  if (empresasPermitidasIds?.length === 0) return { totalGeral: 0, quantidade: 0, porFormaPagamento: [] };
  return totaisVendasRepository(query, empresasPermitidasIds);
}

export async function criarVenda(dados: VendaPayload, perfil: PerfilUsuario): Promise<VendaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "entradas_criar");
  validarVenda(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);

    const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
    // Toda venda manual criada pelo operador pertence ao PDV do caixa que a recebeu. Sem preencher
    // esse vinculo, a venda tinha caixa_id correto mas pdv_id nulo; a consulta do turno filtra os
    // dois e a etapa "Gerar relatorio de vendas" devolvia zero apesar de a venda existir.
    if (normalizados.pdvId && normalizados.pdvId !== caixa.pdvId) {
      throw new Error("Venda do operador precisa pertencer ao PDV do caixa aberto");
    }
    const venda = await criarVendaRepository(
      { ...normalizados, pdvId: caixa.pdvId },
      computar,
      perfil.usuarioId,
      caixa.id,
      tx
    );
    return { id: venda.id, computar };
  });
}

export async function obterVenda(vendaId: string, perfil: PerfilUsuario): Promise<VendaDetalheDto> {
  const venda = await buscarVendaDetalheRepository(vendaId);
  if (!venda || !podeAcessarEmpresa(perfil, venda.empresaId)) throw new Error("Registro nao encontrado");
  return venda;
}

// Assinatura de comparacao dos pagamentos: forma + valor, em ordem estavel. Compara o que a venda
// E, nao os campos que vieram no corpo — uma tela que devolve o mesmo conteudo continua salvando os
// campos permitidos (observacao, descricao de desconto...) sem esbarrar na recusa.
function assinaturaPagamentos(
  pagamentos: ReadonlyArray<{ formaPagamentoId?: string | null | undefined; totalPago: number | string }>
): string {
  return pagamentos
    .map((pagamento) => assinaturaDoPagamento(pagamento.formaPagamentoId ?? null, pagamento.totalPago))
    .sort()
    .join(";");
}

function recusarEdicaoFinanceiraDeVendaIntegrada(existente: VendaDetalheDto, dados: VendaPayload): void {
  if ((dados.contaOrigemId ?? null) !== (existente.contaOrigemId ?? null)) {
    throw proibido(
      "Venda integrada nao tem a conta de origem alterada pela retaguarda: o destino do dinheiro vem do roteamento da forma de pagamento",
      "VENDA_INTEGRADA_CONTA_ORIGEM"
    );
  }
  if (assinaturaPagamentos(dados.tiposPagamento) !== assinaturaPagamentos(existente.tiposPagamento)) {
    throw proibido(
      "Venda integrada nao tem os pagamentos alterados pela retaguarda: o proximo reenvio do CREARE sobrescreveria a alteracao",
      "VENDA_INTEGRADA_PAGAMENTOS"
    );
  }
}

export async function atualizarVenda(
  vendaId: string,
  dados: VendaPayload,
  perfil: PerfilUsuario
): Promise<VendaCriada> {
  exigirPermissaoLancamento(perfil.permissoes, "entradas_editar");
  validarVenda(dados);
  const computar = resolverComputarLancamento(dados.computar, perfil.permissoes);
  const normalizados = {
    ...dados,
    dataPagamento: resolverDataPagamentoLancamento(dados.dataPagamento, perfil.permissoes)
  };
  return executarEmTransacao(async (tx) => {
    // Leitura sem lock so para o 404/empresa vir antes dos erros de caixa, como sempre foi.
    const previa = await buscarVendaDetalheRepository(vendaId, tx);

    // TENANT PRIMEIRO, e a R-177 SO DEPOIS DA TRAVA. As duas coisas juntas fecham o oraculo:
    // `buscarVendaDetalheRepository` filtra so por `vendas.id`, entao se a recusa da R-177 respondesse
    // antes da checagem de empresa ela confirmaria, para um id de outra empresa, que o registro
    // existe, que e integrado e que os pagamentos diferem do enviado. Registro alheio tem de
    // continuar indistinguivel de registro inexistente.
    //
    // O preco e de mensagem: quem editar venda de caixa alheio recebe primeiro "nao pertence ao seu
    // caixa aberto". Correcao vale mais que mensagem.
    if (!previa || !podeAcessarEmpresa(perfil, previa.empresaId) || previa.empresaId !== dados.empresaId) {
      throw new Error("Registro nao encontrado");
    }

    // P0 — ordem unica: caixa (FOR SHARE, dentro da validacao) ANTES da linha da venda.
    const caixa = await validarEdicaoNoCaixaAberto(previa, dados, perfil, tx);
    if (!(await travarVendaRepository(vendaId, dados.empresaId, tx))) throw new Error("Registro nao encontrado");
    // Retrato SOB a trava: a venda integrada pode ter mudado de CAIXA entre a leitura e o lock
    // (revinculacao/CREARE) — a revalidacao compara empresa e caixa_id do retrato atual, sem
    // retomar o lock do caixa.
    const existente = await buscarVendaDetalheRepository(vendaId, tx);
    await validarEdicaoNoCaixaAberto(existente, dados, perfil, tx, caixa);

    // R-177 sobre o estado RECEM-LIDO, sob a trava — nunca sobre o retrato pre-lock. Um reenvio do
    // CREARE que commite na janela entre a leitura e o lock reescreve os pagamentos, e um payload que
    // batia com o retrato antigo passaria a divergir dos atuais. O bit "e integrada" nao muda por
    // concorrencia; a COMPARACAO muda, e e ela que a regra protege.
    const vendaIntegrada = await vendaEhIntegradaRepository(vendaId, tx);
    if (vendaIntegrada && existente) recusarEdicaoFinanceiraDeVendaIntegrada(existente, dados);

    const referenciaInvalida = await validarReferenciasVenda(dados, tx);
    if (referenciaInvalida) throw new Error(`${referenciaInvalida} nao pertence a empresa informada`);
    // P0 (#152): em venda integrada os pagamentos NAO sao apagados e recriados. O delete+insert fazia
    // as linhas renascerem no DEFAULT `nao_aplicavel`, o credito sumia da conta e — pior — a venda
    // passava a ser lida como historica, entao nenhum reenvio a rotearia de novo. Perda permanente,
    // silenciosa, por um PUT que a R-177 PERMITE (editar so a observacao).
    //
    // A guarda acima ja garantiu que os pagamentos do payload sao os mesmos que estao gravados, entao
    // nao ha o que reescrever: preservar e a operacao correta, nao um contorno.
    await atualizarVendaRepository(vendaId, normalizados, computar, tx, { preservarPagamentos: vendaIntegrada });
    return { id: vendaId, computar };
  });
}
