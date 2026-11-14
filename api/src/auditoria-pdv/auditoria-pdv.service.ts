import {
  agendaAuditoriaPayloadSchema,
  auditoriaConsultaQuerySchema,
  auditoriaEmpresaQuerySchema,
  gerarAuditoriaPayloadSchema,
  statusAuditoria,
  statusDoDia,
  type AuditoriaConsultaQuery,
  type AuditoriaDia,
  type CaixaAuditoria,
  type ConsultaAuditoria,
  type FormaAuditoria,
  type PdvAuditoria
} from "@padaria/shared/auditoria-pdv";
import type { DadosExternos, JsonValue } from "@padaria/shared/api";
import { localDoInstante } from "@padaria/shared/compras";
import { categoriaFechamentoPorNome } from "@padaria/shared/formas-pagamento";
import { pdvFoiExcluido } from "@padaria/shared/pdvs";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { listarUsuariosTesourariaRepository } from "../caixa/caixa.repository.js";
import { erroValidacao, proibido } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import {
  agendasAtivasRepository,
  auditoriasGeradasRepository,
  buscarAgendaRepository,
  caixasDoPeriodoRepository,
  fusoDaEmpresaRepository,
  gravarAuditoriaRepository,
  pagamentosDoPeriodoRepository,
  pdvsDaEmpresaRepository,
  produtosForaDoPeriodoRepository,
  salvarAgendaRepository,
  vendasDoPeriodoRepository
} from "./auditoria-pdv.repository.js";

// Auditoria de PDVs (Marco, 13/11/2026): por dia, cruza as vendas da CREARE com os caixas abertos no sistema.
// Venda que nao caiu em nenhum caixa vira alerta e avisa a Tesouraria no sino.

const centavos = (valor: string | number) => Math.round(Number(valor) * 100);
const reais = (c: number) => c / 100;

function exigirEmpresa(perfil: PerfilComEmpresa | undefined, empresaId: string) {
  if (!perfil || !empresasPermitidas(perfil).includes(empresaId))
    throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

const MAX_DIAS = 31;

function validarPeriodo(inicio: string, fim: string) {
  const dias = (Date.parse(`${fim}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86_400_000;
  if (dias > MAX_DIAS - 1) throw erroValidacao(`Periodo de no maximo ${MAX_DIAS} dias`);
}

function somarFormas(itens: Array<{ categoria: string; valor: number }>): FormaAuditoria[] {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(item.categoria, (mapa.get(item.categoria) ?? 0) + centavos(item.valor));
  return [...mapa.entries()]
    .map(([categoria, c]) => ({ categoria, valor: reais(c) }))
    .sort((a, b) => b.valor - a.valor);
}

type Filtro = Omit<AuditoriaConsultaQuery, "empresaId" | "inicio" | "fim">;

// Monta os dias do periodo. Os filtros de venda (turno, hora, forma) recortam as vendas antes de agrupar; o de
// situacao recorta os PDVs ja montados. Dia sem nenhum PDV depois do filtro sai da lista.
async function montarPeriodo(empresaId: string, inicio: string, fim: string, filtro: Filtro = {}) {
  const recorte = { empresaId, inicio, fim, pdvId: filtro.pdvId };
  const [linhas, pagamentos, produtos, geradas, fuso] = await Promise.all([
    vendasDoPeriodoRepository(recorte),
    pagamentosDoPeriodoRepository(recorte),
    produtosForaDoPeriodoRepository(recorte),
    auditoriasGeradasRepository(empresaId, inicio, fim),
    fusoDaEmpresaRepository(empresaId)
  ]);
  const caixaIds = [...new Set(linhas.map((linha) => linha.caixaId).filter((id): id is string => Boolean(id)))];
  const caixas = (await caixasDoPeriodoRepository(empresaId, inicio, fim, caixaIds)).filter(
    (c) => (!filtro.pdvId || c.pdvId === filtro.pdvId) && (!filtro.turno || c.turno === filtro.turno)
  );

  const formasDaVenda = new Map<string, Array<{ categoria: string; valor: number }>>();
  for (const p of pagamentos) {
    const categoria =
      p.categoria && p.categoria !== "outros"
        ? p.categoria
        : categoriaFechamentoPorNome(p.formaNome ?? p.tipoAutomacao ?? "");
    const lista = formasDaVenda.get(p.vendaId) ?? [];
    lista.push({ categoria, valor: Number(p.valor) });
    formasDaVenda.set(p.vendaId, lista);
  }
  const turnoDoCaixa = new Map(caixas.map((c) => [c.id, c.turno]));
  const horaFiltrada = Boolean(filtro.horaInicio || filtro.horaFim);
  const vendasFiltradas = linhas.filter((v) => {
    if (filtro.turno && !(v.caixaId && turnoDoCaixa.get(v.caixaId) === filtro.turno)) return false;
    if (filtro.forma && !(formasDaVenda.get(v.id) ?? []).some((f) => f.categoria === filtro.forma)) return false;
    if (horaFiltrada) {
      if (!v.dataVenda) return false;
      const hora = localDoInstante(v.dataVenda, fuso).hora;
      if (filtro.horaInicio && hora < filtro.horaInicio) return false;
      if (filtro.horaFim && hora > filtro.horaFim) return false;
    }
    return true;
  });

  const datas = new Set<string>([
    ...vendasFiltradas.map((v) => v.data),
    ...(horaFiltrada || filtro.forma ? [] : caixas.map((c) => c.data))
  ]);
  const dias: AuditoriaDia[] = [];
  for (const data of [...datas]
    .filter((d) => d >= inicio && d <= fim)
    .sort()
    .reverse()) {
    const vendasDoDia = vendasFiltradas.filter((v) => v.data === data);
    const idsCaixasComVenda = new Set(vendasDoDia.map((v) => v.caixaId).filter(Boolean));
    const caixasDoDia = caixas.filter(
      (c) => idsCaixasComVenda.has(c.id) || (c.data === data && !horaFiltrada && !filtro.forma)
    );
    const dia = montarDia(data, vendasDoDia, caixasDoDia, formasDaVenda, produtos);
    if (filtro.status) {
      dia.pdvs = dia.pdvs.filter((pdv) => pdv.status === filtro.status);
      Object.assign(dia, resumir([dia]), { status: statusDoDia(dia.pdvs.map((pdv) => pdv.status)) });
    }
    if (!dia.pdvs.length) continue;
    const gerada = geradas.find((g) => g.data === data);
    dia.gerada = gerada ? { em: gerada.geradaEm.toISOString(), automatica: gerada.geradaPor === null } : null;
    dias.push(dia);
  }
  return dias;
}

type VendaLinha = Awaited<ReturnType<typeof vendasDoPeriodoRepository>>[number];
type CaixaLinha = Awaited<ReturnType<typeof caixasDoPeriodoRepository>>[number];
type ProdutoLinha = Awaited<ReturnType<typeof produtosForaDoPeriodoRepository>>[number];

function montarDia(
  data: string,
  linhas: VendaLinha[],
  caixas: CaixaLinha[],
  formasDaVenda: Map<string, Array<{ categoria: string; valor: number }>>,
  produtos: ProdutoLinha[]
): AuditoriaDia {
  const chavePdv = (pdvId: string | null, nome: string | null) => pdvId ?? `sem-pdv:${nome ?? "?"}`;
  const pdvsMapa = new Map<string, PdvAuditoria>();
  const garantirPdv = (pdvId: string | null, nome: string | null) => {
    const chave = chavePdv(pdvId, nome);
    let pdv = pdvsMapa.get(chave);
    if (!pdv) {
      pdv = {
        pdvId,
        pdvNome: nome ?? "PDV não identificado",
        status: "sem_vendas",
        vendas: 0,
        total: 0,
        caixas: [],
        fora: []
      };
      pdvsMapa.set(chave, pdv);
    }
    return pdv;
  };
  const caixasMapa = new Map<string, CaixaAuditoria>();
  for (const c of caixas) {
    const caixa: CaixaAuditoria = {
      caixaId: c.id,
      turno: c.turno,
      operador: c.operador,
      abertura: c.abertura?.toISOString() ?? null,
      fechamento: c.fechamento?.toISOString() ?? null,
      status: c.status,
      vendas: 0,
      total: 0,
      formas: []
    };
    caixasMapa.set(c.id, caixa);
    garantirPdv(c.pdvId, c.pdvNome).caixas.push(caixa);
  }
  const formasPorCaixa = new Map<string, Array<{ categoria: string; valor: number }>>();
  for (const v of linhas) {
    const pdv = garantirPdv(v.pdvId, v.pdvNome ?? v.pdvAutomacao);
    pdv.vendas += 1;
    pdv.total = reais(centavos(pdv.total) + centavos(v.valor));
    const formas = formasDaVenda.get(v.id) ?? [];
    const caixa = v.caixaId ? caixasMapa.get(v.caixaId) : undefined;
    if (caixa) {
      caixa.vendas += 1;
      caixa.total = reais(centavos(caixa.total) + centavos(v.valor));
      formasPorCaixa.set(caixa.caixaId, [...(formasPorCaixa.get(caixa.caixaId) ?? []), ...formas]);
    } else {
      pdv.fora.push({
        vendaId: v.id,
        hora: v.dataVenda?.toISOString() ?? null,
        valor: Number(v.valor),
        formas: somarFormas(formas),
        produtos: produtos
          .filter((item) => item.vendaId === v.id)
          .map((item) => ({ descricao: item.descricao, quantidade: Number(item.quantidade) }))
      });
    }
  }
  for (const [caixaId, formas] of formasPorCaixa) caixasMapa.get(caixaId)!.formas = somarFormas(formas);

  const pdvsLista = [...pdvsMapa.values()].sort((a, b) =>
    a.pdvNome.localeCompare(b.pdvNome, "pt-BR", { numeric: true })
  );
  for (const pdv of pdvsLista) {
    pdv.status = statusAuditoria({
      vendas: pdv.vendas,
      vendasFora: pdv.fora.length,
      caixasAbertos: pdv.caixas.filter((c) => c.status === "aberto" || c.status === "em_fechamento").length
    });
  }
  const vendasFora = pdvsLista.reduce((soma, pdv) => soma + pdv.fora.length, 0);
  const valorForaC = pdvsLista.reduce((soma, pdv) => soma + pdv.fora.reduce((s, v) => s + centavos(v.valor), 0), 0);
  const totalC = linhas.reduce((soma, v) => soma + centavos(v.valor), 0);
  return {
    data,
    status: statusDoDia(pdvsLista.map((pdv) => pdv.status)),
    vendas: linhas.length,
    total: reais(totalC),
    vendasFora,
    valorFora: reais(valorForaC),
    gerada: null,
    pdvs: pdvsLista
  };
}

// Totais do que a lista mostra (depois de todos os filtros).
function resumir(dias: AuditoriaDia[]): ConsultaAuditoria["resumo"] {
  let vendas = 0;
  let totalC = 0;
  let vendasFora = 0;
  let foraC = 0;
  for (const pdv of dias.flatMap((dia) => dia.pdvs)) {
    vendas += pdv.vendas;
    totalC += centavos(pdv.total);
    vendasFora += pdv.fora.length;
    foraC += pdv.fora.reduce((s, v) => s + centavos(v.valor), 0);
  }
  return { vendas, total: reais(totalC), vendasFora, valorFora: reais(foraC) };
}

export async function consultarAuditoria(query: DadosExternos, perfil?: PerfilComEmpresa): Promise<ConsultaAuditoria> {
  const { empresaId, inicio, fim, ...filtro } = auditoriaConsultaQuerySchema.parse(query);
  exigirEmpresa(perfil, empresaId);
  validarPeriodo(inicio, fim);
  const [dias, pdvs] = await Promise.all([
    montarPeriodo(empresaId, inicio, fim, filtro),
    pdvsDaEmpresaRepository(empresaId)
  ]);
  return {
    resumo: resumir(dias),
    dias,
    pdvs: pdvs.filter((pdv) => !pdvFoiExcluido(pdv)).map((pdv) => ({ id: pdv.id, nome: pdv.nome }))
  };
}

async function retratoDoDia(empresaId: string, data: string): Promise<AuditoriaDia> {
  const [dia] = await montarPeriodo(empresaId, data, data);
  return (
    dia ?? { data, status: "sem_vendas", vendas: 0, total: 0, vendasFora: 0, valorFora: 0, gerada: null, pdvs: [] }
  );
}

const dataBr = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function gerarEGravar(empresaId: string, data: string, geradaPor: string | null) {
  const dia = await retratoDoDia(empresaId, data);
  const { gerada: _anterior, ...retrato } = dia;
  return executarEmTransacao(async (tx) => {
    const gravada = await gravarAuditoriaRepository(
      {
        empresaId,
        data,
        geradaPor,
        vendasFora: dia.vendasFora,
        valorFora: dia.valorFora.toFixed(2),
        resultado: retrato as unknown as JsonValue
      },
      tx
    );
    if (dia.vendasFora > 0) {
      const pdvsComAlerta = dia.pdvs.filter((pdv) => pdv.fora.length).map((pdv) => pdv.pdvNome);
      await criarNotificacoesRepository(
        {
          empresaId,
          tipo: "auditoria_pdv",
          destinatariosUsuarioIds: (await listarUsuariosTesourariaRepository(empresaId, tx))
            .map((linha) => linha.usuarioId)
            .filter((id): id is string => Boolean(id)),
          referenciaId: gravada.id,
          titulo: `Auditoria ${dataBr(data)}: ${dia.vendasFora} venda(s) fora de caixa (${moeda(dia.valorFora)}) em ${pdvsComAlerta.join(", ")}`,
          valorCentavos: centavos(dia.valorFora),
          reabrir: true
        },
        tx
      );
    }
    return { ...dia, gerada: { em: gravada.geradaEm.toISOString(), automatica: geradaPor === null } };
  });
}

export async function gerarAuditoria(body: DadosExternos, perfil?: PerfilComEmpresa & { usuarioId?: string }) {
  const { empresaId, data } = gerarAuditoriaPayloadSchema.parse(body);
  exigirEmpresa(perfil, empresaId);
  return gerarEGravar(empresaId, data, perfil?.usuarioId ?? null);
}

export async function obterAgendaAuditoria(query: DadosExternos, perfil?: PerfilComEmpresa) {
  const { empresaId } = auditoriaEmpresaQuerySchema.parse(query);
  exigirEmpresa(perfil, empresaId);
  return (await buscarAgendaRepository(empresaId)) ?? { ativa: false, horario: "23:30" };
}

export async function salvarAgendaAuditoria(body: DadosExternos, perfil?: PerfilComEmpresa) {
  const dados = agendaAuditoriaPayloadSchema.parse(body);
  exigirEmpresa(perfil, dados.empresaId);
  await salvarAgendaRepository(dados.empresaId, dados.ativa, dados.horario);
  return { ativa: dados.ativa, horario: dados.horario };
}

// Agendador (a cada minuto): no horario da empresa, gera a auditoria do dia uma vez. Se ja houver uma gerada
// depois do horario agendado de hoje, nao gera de novo.
export async function processarAuditoriasAgendadas(agora: Date, aoFalhar: (empresaId: string, erro: unknown) => void) {
  for (const agenda of await agendasAtivasRepository()) {
    try {
      const { data, hora } = localDoInstante(agora, agenda.fuso);
      if (hora < agenda.horario) continue;
      const [ja] = await auditoriasGeradasRepository(agenda.empresaId, data, data);
      if (
        ja &&
        localDoInstante(ja.geradaEm, agenda.fuso).data === data &&
        localDoInstante(ja.geradaEm, agenda.fuso).hora >= agenda.horario
      )
        continue;
      await gerarEGravar(agenda.empresaId, data, null);
    } catch (erro) {
      aoFalhar(agenda.empresaId, erro);
    }
  }
}
