import { createHash } from "node:crypto";
import {
  comandasConsultaSchema,
  comandasIndicadoresSchema,
  loteComandasCreareSchema,
  montarLinhaDoTempo,
  RETENCAO_COMANDAS_DIAS,
  retratoComandasCreareSchema,
  segundosEntre,
  situacaoComanda,
  STATUS_COMANDA,
  type ComandaCreare,
  type ComandaDetalhe,
  type ComandaResumo,
  type ComandasIndicadores,
  type ItemComandaDetalhe,
  type LoteComandasResposta,
  type RetratoComandasResposta
} from "@padaria/shared/comandas-creare";
import { diaNegocio, janelaDiaNegocio } from "@padaria/shared/datas";
import { paraCentavos } from "@padaria/shared/dinheiro";
import type { DadosExternos } from "@padaria/shared/api";
import type { ZodType } from "zod";
import { executarEmTransacao } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado } from "../erros.js";
import { autenticarChaveVendas } from "../integracoes/integracoes.service.js";
import {
  apagarFechadasAntesDeRepository,
  buscarComandaRepository,
  fechadasDaJanelaRepository,
  funcionariosRepository,
  gravarComandaRepository,
  gravarRetratoRepository,
  hashesRepository,
  idsEmAbertoNoSistemaRepository,
  itensDasComandasRepository,
  listarFechadasRepository,
  listarPorStatusRepository,
  maiorIdComandaRepository,
  retratoRepository,
  type ComandaLinha,
  type ItemLinha
} from "./comandas-creare.repository.js";

// Comandas do CREARE (R-248). Entrada pelo robo da loja (chave de integracao de vendas, a mesma das vendas);
// saida para o S2 (Bearer do S2, empresa fixa). Comanda e so leitura/exibicao: nunca vira lancamento aqui.

const LIMITE_CONFERIR = 500;
const DIA_MS = 24 * 60 * 60 * 1000;

function validar<T>(schema: ZodType<T>, corpo: DadosExternos, rotulo: string): T {
  const analise = schema.safeParse(corpo);
  if (analise.success) return analise.data;
  const detalhes = analise.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`);
  throw erroValidacao(`${rotulo} invalido: ${detalhes.slice(0, 5).join("; ")}`, "INVALID_PAYLOAD");
}

/* ---------- Entrada (robo) ---------- */

export async function receberRetratoComandas(chaveApi: string, corpo: DadosExternos): Promise<RetratoComandasResposta> {
  const chave = await autenticarChaveVendas(chaveApi);
  const { abertasIds } = validar(retratoComandasCreareSchema, corpo, "Retrato de comandas");
  const noCreare = new Set(abertasIds);
  const [noSistema, maiorIdComanda] = await Promise.all([
    idsEmAbertoNoSistemaRepository(chave.empresaId),
    maiorIdComandaRepository(chave.empresaId)
  ]);
  // Em aberto aqui e nao mais no CREARE: fechou ou foi cancelada. O robo rele pela PK e manda no lote.
  const conferirIds = noSistema.filter((id) => !noCreare.has(id)).slice(0, LIMITE_CONFERIR);
  await gravarRetratoRepository(chave.empresaId, abertasIds.length);
  await apagarFechadasAntesDeRepository(chave.empresaId, new Date(Date.now() - RETENCAO_COMANDAS_DIAS * DIA_MS));
  return { maiorIdComanda, conferirIds };
}

const reais = (valor: number) => valor.toFixed(2);
const quando = (valor: string | null) => (valor ? new Date(valor) : null);

// Hash do conteudo: mesmo JSON (ordem do robo, que e estavel) => nao regrava. Itens entram no hash.
function hashComanda(comanda: ComandaCreare): string {
  return createHash("sha256").update(JSON.stringify(comanda)).digest("hex");
}

export async function receberLoteComandas(chaveApi: string, corpo: DadosExternos): Promise<LoteComandasResposta> {
  const chave = await autenticarChaveVendas(chaveApi);
  const { comandas } = validar(loteComandasCreareSchema, corpo, "Lote de comandas");
  const empresaId = chave.empresaId;
  const existentes = await hashesRepository(
    empresaId,
    comandas.map((comanda) => comanda.idComanda)
  );
  const mudaram = comandas
    .map((comanda) => ({ comanda, hash: hashComanda(comanda) }))
    .filter(({ comanda, hash }) => existentes.get(comanda.idComanda) !== hash);

  if (mudaram.length) {
    await executarEmTransacao(async (tx) => {
      for (const { comanda, hash } of mudaram) {
        await gravarComandaRepository(
          {
            empresaId,
            idComanda: comanda.idComanda,
            numero: comanda.numero,
            mesa: comanda.mesa,
            status: comanda.status,
            abertaEm: quando(comanda.abertaEm),
            ultimoLancamentoEm: quando(comanda.ultimoLancamentoEm),
            puxadaEm: quando(comanda.puxadaEm),
            fechadaEm: quando(comanda.fechadaEm),
            valorSubtotal: reais(comanda.valorSubtotal),
            valorDesconto: reais(comanda.valorDesconto),
            valorTotal: reais(comanda.valorTotal),
            nomeCliente: comanda.nomeCliente,
            observacao: comanda.observacao,
            vendaCreareId: comanda.vendaCreareId,
            vendaValorTotal: comanda.vendaValorTotal === null ? null : reais(comanda.vendaValorTotal),
            conteudoHash: hash
          },
          comanda.itens.map((item) => ({
            empresaId,
            idItem: item.idItem,
            idComanda: comanda.idComanda,
            produtoCodigo: item.produtoCodigo,
            descricao: item.descricao,
            quantidade: item.quantidade.toFixed(3),
            valorTotal: reais(item.valorTotal),
            funcionarioCodigo: item.funcionarioCodigo,
            funcionarioNome: item.funcionarioNome,
            cancelado: item.cancelado,
            motivoCancelamento: item.motivoCancelamento,
            lancadoEm: quando(item.lancadoEm)
          })),
          tx
        );
      }
    });
  }
  return { recebidas: comandas.length, gravadas: mudaram.length, semMudanca: comandas.length - mudaram.length };
}

/* ---------- Saida (S2) ---------- */

const iso = (valor: Date | null) => (valor ? valor.toISOString() : null);
const nomeFuncionario = (item: Pick<ItemLinha, "funcionarioNome" | "funcionarioCodigo">) =>
  item.funcionarioNome ?? (item.funcionarioCodigo ? `Código ${item.funcionarioCodigo}` : null);

function resumir(comanda: ComandaLinha, itens: ItemLinha[], agora: Date): ComandaResumo {
  const validos = itens.filter((item) => !item.cancelado);
  const tempos = {
    status: comanda.status,
    abertaEm: iso(comanda.abertaEm),
    ultimoLancamentoEm: iso(comanda.ultimoLancamentoEm),
    puxadaEm: iso(comanda.puxadaEm)
  };
  const valorTotalCentavos = paraCentavos(comanda.valorTotal);
  const valorVendaCentavos = comanda.vendaValorTotal === null ? null : paraCentavos(comanda.vendaValorTotal);
  const fechada = comanda.status === STATUS_COMANDA.fechada || comanda.status === STATUS_COMANDA.cancelada;
  const primeiro = validos[0] ?? itens[0];
  return {
    idComanda: comanda.idComanda,
    numero: comanda.numero,
    mesa: comanda.mesa,
    status: comanda.status,
    situacao: situacaoComanda(tempos, agora),
    abertaEm: tempos.abertaEm,
    ultimoLancamentoEm: tempos.ultimoLancamentoEm,
    // Sem a hora do log, a puxada e aproximada pelo ultimo lancamento (so faz sentido em status 2).
    puxadaEm: tempos.puxadaEm ?? (comanda.status === STATUS_COMANDA.puxada ? tempos.ultimoLancamentoEm : null),
    puxadaAproximada: !comanda.puxadaEm,
    fechadaEm: iso(comanda.fechadaEm),
    segundosAberta: segundosEntre(tempos.abertaEm, fechada ? iso(comanda.fechadaEm) : agora.toISOString()),
    itensValidos: validos.length,
    itensCancelados: itens.length - validos.length,
    valorTotalCentavos,
    valorVendaCentavos,
    diferencaVendaCentavos: valorVendaCentavos === null ? null : valorVendaCentavos - valorTotalCentavos,
    lancadoPor: primeiro ? nomeFuncionario(primeiro) : null,
    nomeCliente: comanda.nomeCliente
  };
}

function agruparItens(itens: ItemLinha[]) {
  const porComanda = new Map<number, ItemLinha[]>();
  for (const item of itens) {
    const lista = porComanda.get(item.idComanda) ?? [];
    lista.push(item);
    porComanda.set(item.idComanda, lista);
  }
  return porComanda;
}

async function resumirLinhas(empresaId: string, linhas: ComandaLinha[], agora: Date) {
  const porComanda = agruparItens(
    await itensDasComandasRepository(
      empresaId,
      linhas.map((linha) => linha.idComanda)
    )
  );
  return linhas.map((linha) => resumir(linha, porComanda.get(linha.idComanda) ?? [], agora));
}

export async function listarComandasS2(empresaId: string, query: DadosExternos, agora: Date = new Date()) {
  const consulta = validar(comandasConsultaSchema, query, "Consulta de comandas");
  const { pagina, porPagina } = consulta;

  if (consulta.aba === "fechadas") {
    const dia = consulta.dia ?? diaNegocio(agora);
    const { inicio, fim } = janelaDiaNegocio(dia);
    const status =
      consulta.situacao === "cancelada" ? [3] : consulta.situacao === "fechada" ? [5] : [STATUS_COMANDA.fechada, 3];
    const { linhas, total } = await listarFechadasRepository(
      empresaId,
      { inicio, fim, status, numero: consulta.numero, funcionarioCodigo: consulta.funcionario },
      { limite: porPagina, deslocamento: (pagina - 1) * porPagina }
    );
    return { itens: await resumirLinhas(empresaId, linhas, agora), total, page: pagina, pageSize: porPagina };
  }

  // Abertas (1 e 2) e status 4: poucas, sempre todas; situacao e funcionario sao filtrados aqui.
  const status = consulta.aba === "status4" ? [STATUS_COMANDA.desconhecido] : [1, 2];
  const linhas = (await listarPorStatusRepository(empresaId, status)).filter(
    (linha) => consulta.numero === undefined || linha.numero === consulta.numero
  );
  const porComanda = agruparItens(
    await itensDasComandasRepository(
      empresaId,
      linhas.map((linha) => linha.idComanda)
    )
  );
  const todas = linhas
    .filter(
      (linha) =>
        !consulta.funcionario ||
        (porComanda.get(linha.idComanda) ?? []).some((item) => item.funcionarioCodigo === consulta.funcionario)
    )
    .map((linha) => resumir(linha, porComanda.get(linha.idComanda) ?? [], agora))
    .filter((comanda) => !consulta.situacao || comanda.situacao === consulta.situacao);
  return {
    itens: todas.slice((pagina - 1) * porPagina, pagina * porPagina),
    total: todas.length,
    page: pagina,
    pageSize: porPagina
  };
}

const media = (valores: number[]) =>
  valores.length ? Math.round(valores.reduce((soma, valor) => soma + valor, 0) / valores.length) : null;

export async function indicadoresComandasS2(
  empresaId: string,
  query: DadosExternos,
  agora: Date = new Date()
): Promise<ComandasIndicadores> {
  const { dia: diaPedido } = validar(comandasIndicadoresSchema, query, "Consulta de indicadores");
  const dia = diaPedido ?? diaNegocio(agora);
  const { inicio, fim } = janelaDiaNegocio(dia);
  const [retrato, abertas, status4, fechadas] = await Promise.all([
    retratoRepository(empresaId),
    listarPorStatusRepository(empresaId, [1, 2]),
    listarPorStatusRepository(empresaId, [STATUS_COMANDA.desconhecido]),
    fechadasDaJanelaRepository(empresaId, inicio, fim)
  ]);
  const situacoes = abertas.map((linha) =>
    situacaoComanda(
      {
        status: linha.status,
        abertaEm: iso(linha.abertaEm),
        ultimoLancamentoEm: iso(linha.ultimoLancamentoEm),
        puxadaEm: iso(linha.puxadaEm)
      },
      agora
    )
  );
  const conta = (situacao: string) => situacoes.filter((valor) => valor === situacao).length;
  const tempos = fechadas
    .map((linha) => segundosEntre(iso(linha.abertaEm), iso(linha.fechadaEm)))
    .filter((valor): valor is number => valor !== null);
  const puxadaPaga = fechadas
    .map((linha) => segundosEntre(iso(linha.puxadaEm), iso(linha.fechadaEm)))
    .filter((valor): valor is number => valor !== null);
  return {
    retratoEm: iso(retrato?.recebidoEm ?? null),
    abertasAgora: abertas.length,
    puxadasAgora: abertas.filter((linha) => linha.status === STATUS_COMANDA.puxada).length,
    abandonadas: conta("abandonada"),
    contas: conta("conta"),
    esquecidas: conta("esquecida") + status4.length,
    valorEmAbertoCentavos: abertas.reduce((soma, linha) => soma + paraCentavos(linha.valorTotal), 0),
    dia,
    fechadasNoDia: fechadas.length,
    valorFechadoNoDiaCentavos: fechadas.reduce((soma, linha) => soma + paraCentavos(linha.valorTotal), 0),
    tempoMedioAbertaSegundos: media(tempos),
    tempoMedioPuxadaPagaSegundos: media(puxadaPaga),
    diferentesDaVendaNoDia: fechadas.filter(
      (linha) =>
        linha.vendaValorTotal !== null && paraCentavos(linha.vendaValorTotal) !== paraCentavos(linha.valorTotal)
    ).length
  };
}

export async function detalheComandaS2(
  empresaId: string,
  idComanda: number,
  agora: Date = new Date()
): Promise<ComandaDetalhe> {
  const comanda = await buscarComandaRepository(empresaId, idComanda);
  if (!comanda) throw naoEncontrado("Comanda não encontrada", "COMANDA_NAO_ENCONTRADA");
  const itens = await itensDasComandasRepository(empresaId, [idComanda]);
  const resumo = resumir(comanda, itens, agora);
  const itensDetalhe: ItemComandaDetalhe[] = itens.map((item) => ({
    idItem: item.idItem,
    produtoCodigo: item.produtoCodigo,
    descricao: item.descricao,
    quantidade: Number(item.quantidade),
    valorTotalCentavos: paraCentavos(item.valorTotal),
    funcionario: nomeFuncionario(item),
    cancelado: item.cancelado,
    motivoCancelamento: item.motivoCancelamento,
    lancadoEm: iso(item.lancadoEm)
  }));
  return {
    ...resumo,
    observacao: comanda.observacao,
    vendaCreareId: comanda.vendaCreareId,
    valorSubtotalCentavos: paraCentavos(comanda.valorSubtotal),
    valorDescontoCentavos: paraCentavos(comanda.valorDesconto),
    itens: itensDetalhe,
    linhaDoTempo: montarLinhaDoTempo(resumo, itensDetalhe)
  };
}

export async function opcoesComandasS2(empresaId: string, agora: Date = new Date()) {
  const linhas = await funcionariosRepository(empresaId, new Date(agora.getTime() - 30 * DIA_MS));
  const porCodigo = new Map<string, string>();
  for (const linha of linhas) {
    if (linha.codigo && !porCodigo.has(linha.codigo))
      porCodigo.set(linha.codigo, linha.nome ?? `Código ${linha.codigo}`);
  }
  return {
    funcionarios: [...porCodigo]
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  };
}
