import { randomUUID } from "node:crypto";
import type { JsonValue } from "@padaria/shared/api";
import {
  agruparProdutosCentral,
  normalizarNomeCentral,
  prepararArquivosCentral,
  type FonteArquivoCentral,
  type ItemFonteCentral
} from "@padaria/shared/produtos";
import {
  criarCargaCentralRepository,
  iniciarValidacaoCargaRepository,
  inserirFonteCentralRepository,
  listarCargasCentraisRepository,
  listarFontesDaCargaRepository,
  listarGruposDaCargaRepository,
  marcarCargaCentralFalhouRepository,
  obterCargaCentralRepository,
  registrarDecisaoCentralRepository,
  substituirGruposDaCargaRepository
} from "./produtos-central.repository.js";

export class CargaCentralNaoEncontradaError extends Error {}
export class CargaCentralEstadoInvalidoError extends Error {}
export class FonteCentralDuplicadaError extends Error {}
export class CargaCentralVaziaError extends Error {}
export class CargaCentralDecisaoExistenteError extends Error {}

export async function criarCargaCentral(ator: { id: string; nome: string }) {
  return criarCargaCentralRepository(ator);
}

export async function listarCargasCentrais() {
  return listarCargasCentraisRepository();
}

export async function anexarFonteCentral(cargaId: string, fonte: FonteArquivoCentral, conteudo: string) {
  const preparada = prepararArquivosCentral([{ fonte, conteudo }]);
  const itens = preparada.itens.map((item) => ({
    fonte: item.fonte,
    loja: item.loja,
    chaveLinhaFonte: item.id,
    idSistema: item.idSistema ?? null,
    codigoInterno: item.codigoInterno,
    codigoBarras: item.codigoBarras,
    chaveBarras: item.codigoBarras.replace(/\D/gu, "").replace(/^0+(?=\d)/u, ""),
    nome: item.nome,
    nomeNormalizado: normalizarNomeCentral(item.nome),
    ativo: item.ativo,
    grupo: item.grupo,
    custo: item.custo,
    venda: item.venda,
    fiscal: item.fiscal,
    dadosOriginais: item.raw
  }));
  const status = await inserirFonteCentralRepository(cargaId, fonte, itens);
  if (status === "nao_encontrada") throw new CargaCentralNaoEncontradaError("Carga da Central não encontrada.");
  if (status === "estado_invalido") {
    throw new CargaCentralEstadoInvalidoError("Esta carga já foi validada e não aceita novas fontes.");
  }
  if (status === "duplicada") throw new FonteCentralDuplicadaError(`A fonte ${fonte} já foi anexada nesta carga.`);
  return { fonte, linhas: itens.length };
}

function converterFonteCentral(
  linha: Awaited<ReturnType<typeof listarFontesDaCargaRepository>>[number]
): ItemFonteCentral {
  return {
    id: linha.id,
    ...(linha.idSistema ? { idSistema: linha.idSistema } : {}),
    fonte: linha.fonte,
    loja: linha.lojaFonte as ItemFonteCentral["loja"],
    codigoInterno: linha.codigoInterno,
    codigoBarras: linha.codigoBarras,
    nome: linha.nome,
    ativo: linha.ativo,
    grupo: linha.grupo,
    custo: linha.custo,
    venda: linha.venda,
    fiscal: linha.fiscal as ItemFonteCentral["fiscal"],
    raw: linha.dadosOriginais as ItemFonteCentral["raw"]
  };
}

export async function validarCargaCentral(cargaId: string) {
  const status = await iniciarValidacaoCargaRepository(cargaId);
  if (status === "nao_encontrada") throw new CargaCentralNaoEncontradaError("Carga da Central não encontrada.");
  if (status === "estado_invalido") {
    throw new CargaCentralEstadoInvalidoError("Esta carga não está aguardando validação.");
  }

  try {
    const fontes = await listarFontesDaCargaRepository(cargaId);
    if (!fontes.length) throw new CargaCentralVaziaError("Anexe ao menos um arquivo de fonte antes de validar.");
    const mapaPorId = new Map(fontes.map((linha) => [linha.id, linha]));
    const itens = fontes.map(converterFonteCentral);
    // O parse inicial já ocorreu ao anexar; aqui o motor trabalha sobre os registros persistidos.
    const conflitoPorFonte = new Map<string, Map<string, Set<string>>>();
    for (const item of itens) {
      const chave = item.codigoBarras.replace(/\D/gu, "").replace(/^0+(?=\d)/u, "");
      if (!chave) continue;
      const mapa = conflitoPorFonte.get(item.fonte) ?? new Map<string, Set<string>>();
      const nomes = mapa.get(chave) ?? new Set<string>();
      const nome = normalizarNomeCentral(item.nome);
      if (nome) nomes.add(nome);
      mapa.set(chave, nomes);
      conflitoPorFonte.set(item.fonte, mapa);
    }
    const chavesConflitantes = new Set<string>();
    for (const mapa of conflitoPorFonte.values()) {
      for (const [chave, nomes] of mapa) if (nomes.size > 1) chavesConflitantes.add(chave);
    }

    const grupos = agruparProdutosCentral(itens, chavesConflitantes);
    const gruposPersistidos = grupos.map((grupo) => ({
      id: randomUUID(),
      chave: grupo.chave,
      motivo: grupo.motivo,
      fontes: grupo.fontes,
      lojas: grupo.lojas,
      candidato: {
        nome: grupo.candidato.nome,
        nomeDe: grupo.candidato.nomeDe,
        grupo: grupo.candidato.grupo,
        grupoDe: grupo.candidato.grupoDe,
        custo: grupo.candidato.custo,
        custoDe: grupo.candidato.custoDe,
        venda: grupo.candidato.venda,
        vendaDe: grupo.candidato.vendaDe,
        ativo: grupo.candidato.ativo,
        fiscal: {
          LI: grupo.candidato.fiscal.LI,
          TNP: grupo.candidato.fiscal.TNP
        }
      } satisfies Record<string, JsonValue>,
      nome: grupo.candidato.nome,
      nomeNormalizado: normalizarNomeCentral(grupo.candidato.nome),
      ativo: grupo.candidato.ativo,
      alertaNomeDivergente: grupo.alertas.nomesDivergentes,
      alertaBarrasConflitantes: grupo.alertas.codigoBarrasConflitante,
      alertaSemBarras: grupo.alertas.semCodigoBarras,
      alertaSemFiscalTnp: grupo.alertas.semFiscalTnp,
      alertaSemGrupo: grupo.alertas.semGrupo,
      alertaJaNaBase: grupo.alertas.jaNaBase,
      linhasFonte: grupo.itens.map((item) => {
        const fonte = mapaPorId.get(item.id);
        if (!fonte) throw new Error("Linha de origem da carga desapareceu durante a validação.");
        return { fonteProdutoId: fonte.id, fonte: fonte.fonte, loja: fonte.lojaFonte };
      })
    }));
    const resumo = {
      linhas: itens.length,
      fontes: [...new Set(fontes.map((linha) => linha.fonte))].map((fonte) => ({
        fonte,
        linhas: fontes.filter((linha) => linha.fonte === fonte).length
      })),
      grupos: grupos.length,
      barrasConflitantes: chavesConflitantes.size,
      nomesDivergentes: grupos.filter((grupo) => grupo.alertas.nomesDivergentes).length,
      semFiscalTnp: grupos.filter((grupo) => grupo.alertas.semFiscalTnp).length,
      semGrupo: grupos.filter((grupo) => grupo.alertas.semGrupo).length
    };
    await substituirGruposDaCargaRepository(cargaId, gruposPersistidos, resumo);
    return resumo;
  } catch (causa) {
    await marcarCargaCentralFalhouRepository(
      cargaId,
      causa instanceof CargaCentralVaziaError ? causa.message : "Falha ao validar as fontes desta carga."
    );
    throw causa;
  }
}

export async function listarGruposDaCarga(input: {
  cargaId: string;
  grupoId?: string;
  busca?: string;
  loja?: string;
  page: number;
  pageSize: number;
}) {
  const carga = await obterCargaCentralRepository(input.cargaId);
  if (!carga) throw new CargaCentralNaoEncontradaError("Carga da Central não encontrada.");
  if (!new Set(["validada", "ativa", "substituida"]).has(carga.estado)) {
    throw new CargaCentralEstadoInvalidoError("Valide as fontes da carga antes de consultar os grupos.");
  }
  return listarGruposDaCargaRepository(input);
}

export async function registrarDecisaoCentral(input: {
  cargaId: string;
  grupoId: string;
  acao: "nao_e_o_mesmo" | "ignorado";
  observacao?: string;
  usuario: { id: string; nome: string };
}) {
  const carga = await obterCargaCentralRepository(input.cargaId);
  if (!carga) throw new CargaCentralNaoEncontradaError("Carga da Central não encontrada.");
  if (!new Set(["validada", "ativa", "substituida"]).has(carga.estado)) {
    throw new CargaCentralEstadoInvalidoError("A carga precisa estar validada para registrar decisões.");
  }
  const resultado = await listarGruposDaCargaRepository({
    cargaId: input.cargaId,
    grupoId: input.grupoId,
    page: 1,
    pageSize: 1
  });
  const grupo = resultado.grupos[0];
  if (!grupo) throw new CargaCentralNaoEncontradaError("Grupo da Central não encontrado.");
  const detalhe: Record<string, JsonValue> = {
    cargaId: input.cargaId,
    grupoId: input.grupoId,
    chave: grupo.chave,
    nome: grupo.nome,
    ...(input.observacao ? { observacao: input.observacao } : {})
  };
  const registro = await registrarDecisaoCentralRepository({
    cargaId: input.cargaId,
    grupoId: input.grupoId,
    chaveGrupo: grupo.chave,
    acao: input.acao,
    detalhe,
    usuarioId: input.usuario.id,
    usuarioNome: input.usuario.nome
  });
  if (registro.estado === "nao_encontrada")
    throw new CargaCentralNaoEncontradaError("Grupo da Central não encontrado.");
  if (registro.estado === "ja_decidida") {
    throw new CargaCentralDecisaoExistenteError("Este grupo já recebeu uma decisão nesta carga.");
  }
  return registro.decisao;
}
