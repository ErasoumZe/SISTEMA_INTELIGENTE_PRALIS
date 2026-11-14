import {
  agendaAuditoriaPayloadSchema,
  auditoriaCalendarioQuerySchema,
  auditoriaDiaQuerySchema,
  gerarAuditoriaPayloadSchema,
  statusAuditoria,
  statusDoDia,
  type AuditoriaDia,
  type AuditoriaDiaResumo,
  type CaixaAuditoria,
  type FormaAuditoria,
  type PdvAuditoria
} from "@padaria/shared/auditoria-pdv";
import type { DadosExternos, JsonValue } from "@padaria/shared/api";
import { localDoInstante } from "@padaria/shared/compras";
import { categoriaFechamentoPorNome } from "@padaria/shared/formas-pagamento";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { listarUsuariosTesourariaRepository } from "../caixa/caixa.repository.js";
import { erroValidacao, proibido } from "../erros.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import {
  agendasAtivasRepository,
  auditoriasGeradasRepository,
  buscarAgendaRepository,
  caixasDoDiaRepository,
  caixasEmAndamentoPorDiaRepository,
  gravarAuditoriaRepository,
  pagamentosDasVendasRepository,
  produtosDasVendasRepository,
  resumoVendasPorDiaRepository,
  salvarAgendaRepository,
  vendasDoDiaRepository
} from "./auditoria-pdv.repository.js";

// Auditoria de PDVs (Marco, 13/11/2026): por dia, cruza as vendas da CREARE com os caixas abertos no sistema.
// Venda que nao caiu em nenhum caixa vira alerta e avisa a Tesouraria no sino.

const centavos = (valor: string | number) => Math.round(Number(valor) * 100);
const reais = (c: number) => c / 100;

function exigirEmpresa(perfil: PerfilComEmpresa | undefined, empresaId: string) {
  if (!perfil || !empresasPermitidas(perfil).includes(empresaId))
    throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function diasEntre(inicio: string, fim: string): string[] {
  const dias: string[] = [];
  const atual = new Date(`${inicio}T12:00:00Z`);
  const ultimo = new Date(`${fim}T12:00:00Z`);
  if (atual > ultimo) throw erroValidacao("Inicio depois do fim");
  if ((ultimo.getTime() - atual.getTime()) / 86_400_000 > 62) throw erroValidacao("Periodo de no maximo 62 dias");
  while (atual <= ultimo) {
    dias.push(atual.toISOString().slice(0, 10));
    atual.setUTCDate(atual.getUTCDate() + 1);
  }
  return dias;
}

export async function calendarioAuditoria(
  query: DadosExternos,
  perfil?: PerfilComEmpresa
): Promise<AuditoriaDiaResumo[]> {
  const { empresaId, inicio, fim } = auditoriaCalendarioQuerySchema.parse(query);
  exigirEmpresa(perfil, empresaId);
  const dias = diasEntre(inicio, fim);
  const [vendasPorDia, abertosPorDia, geradas] = await Promise.all([
    resumoVendasPorDiaRepository(empresaId, inicio, fim),
    caixasEmAndamentoPorDiaRepository(empresaId, inicio, fim),
    auditoriasGeradasRepository(empresaId, inicio, fim)
  ]);
  return dias.map((data) => {
    const v = vendasPorDia.find((linha) => linha.data === data);
    const abertos = abertosPorDia.find((linha) => linha.data === data)?.abertos ?? 0;
    const gerada = geradas.find((linha) => linha.data === data);
    const vendasQtd = v?.vendas ?? 0;
    const vendasFora = v?.vendasFora ?? 0;
    return {
      data,
      status: statusAuditoria({ vendas: vendasQtd, vendasFora, caixasAbertos: abertos }),
      vendas: vendasQtd,
      total: Number(v?.total ?? 0),
      vendasFora,
      valorFora: Number(v?.valorFora ?? 0),
      gerada: gerada ? { em: gerada.geradaEm.toISOString(), automatica: gerada.geradaPor === null } : null
    };
  });
}

function somarFormas(itens: Array<{ categoria: string; valor: number }>): FormaAuditoria[] {
  const mapa = new Map<string, number>();
  for (const item of itens) mapa.set(item.categoria, (mapa.get(item.categoria) ?? 0) + centavos(item.valor));
  return [...mapa.entries()]
    .map(([categoria, c]) => ({ categoria, valor: reais(c) }))
    .sort((a, b) => b.valor - a.valor);
}

async function montarDia(empresaId: string, data: string): Promise<AuditoriaDia> {
  const linhas = await vendasDoDiaRepository(empresaId, data);
  const ids = linhas.map((linha) => linha.id);
  const foraIds = linhas.filter((linha) => !linha.caixaId).map((linha) => linha.id);
  const caixaIds = [...new Set(linhas.map((linha) => linha.caixaId).filter((id): id is string => Boolean(id)))];
  const [pagamentos, produtos, caixas, geradas] = await Promise.all([
    pagamentosDasVendasRepository(ids),
    produtosDasVendasRepository(foraIds),
    caixasDoDiaRepository(empresaId, data, caixaIds),
    auditoriasGeradasRepository(empresaId, data, data)
  ]);
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
  const gerada = geradas[0];
  return {
    data,
    status: statusDoDia(pdvsLista.map((pdv) => pdv.status)),
    vendas: linhas.length,
    total: reais(totalC),
    vendasFora,
    valorFora: reais(valorForaC),
    gerada: gerada ? { em: gerada.geradaEm.toISOString(), automatica: gerada.geradaPor === null } : null,
    pdvs: pdvsLista
  };
}

export async function diaAuditoria(query: DadosExternos, perfil?: PerfilComEmpresa) {
  const { empresaId, data } = auditoriaDiaQuerySchema.parse(query);
  exigirEmpresa(perfil, empresaId);
  return montarDia(empresaId, data);
}

const dataBr = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const moeda = (valor: number) => valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

async function gerarEGravar(empresaId: string, data: string, geradaPor: string | null) {
  const dia = await montarDia(empresaId, data);
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
  const { empresaId } = auditoriaDiaQuerySchema.pick({ empresaId: true }).parse(query);
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
