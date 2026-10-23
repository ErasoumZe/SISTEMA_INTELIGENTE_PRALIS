import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { JsonValue } from "@padaria/shared/api";
import type {
  ConplusEvento,
  ConplusOrigemImportacao,
  ConplusPeriodoAquisitivo,
  ConplusRescisao
} from "@padaria/shared/conplus";
import {
  conplusEventos,
  conplusGoogleSincronizacoes,
  conplusImportacoes,
  conplusImportacoesHistorico,
  conplusRegistros
} from "@padaria/db/schema";
import { banco, executarEmTransacao } from "../banco/conexao.js";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import { conflito, erroValidacao, naoEncontrado } from "../erros.js";
import type { PerfilUsuario } from "@padaria/shared";

export type ConplusTipo = "folha_05" | "adiantamento_20" | "rescisoes" | "ferias";
type RegistroPrevia = ConplusRescisao | ConplusPeriodoAquisitivo | Record<string, JsonValue>;

type DadosPrevia = {
  registros: RegistroPrevia[];
  diagnosticos: Array<{ linha: number; mensagem: string }>;
};

export type CriarPreviaInput = {
  empresaId: string;
  usuarioId: string;
  tipo: ConplusTipo;
  competencia: string;
  /** Upload do DP (padrão) ou busca automática na API Conplus. */
  origem?: ConplusOrigemImportacao;
  nomeArquivo: string;
  hashArquivo: string;
  tamanhoBytes: number;
  registros: RegistroPrevia[];
  diagnosticos: Array<{ linha: number; mensagem: string }>;
};

function validarCompetencia(competencia: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(competencia)) {
    throw erroValidacao("Informe a competência no formato AAAA-MM-DD", "CONPLUS_COMPETENCIA_INVALIDA");
  }
  return competencia;
}

function dadosDaPrevia(importacao: typeof conplusImportacoes.$inferSelect): DadosPrevia {
  const dados = importacao.dadosPrevia;
  if (!dados || typeof dados !== "object" || !Array.isArray((dados as { registros?: JsonValue[] }).registros)) {
    throw conflito("A prévia não possui dados válidos para confirmação", "CONPLUS_PREVIEW_INVALIDA");
  }
  return dados as DadosPrevia;
}

function identificadorExterno(registro: RegistroPrevia, indice: number): string {
  if ("contrato" in registro && typeof registro.contrato === "string" && registro.contrato.trim()) {
    const periodo =
      "periodoInicial" in registro && typeof registro.periodoInicial === "string" ? registro.periodoInicial : "";
    return `${registro.contrato.trim()}${periodo ? `:${periodo}` : `:${indice + 1}`}`;
  }
  return `linha:${indice + 1}`;
}

function nomeColaborador(registro: RegistroPrevia): string | null {
  if ("empregado" in registro && typeof registro.empregado === "string") return registro.empregado.trim() || null;
  return null;
}

function textoOpcional(valor: JsonValue | undefined): string | null {
  return typeof valor === "string" ? valor : null;
}

function eventosDoRegistro(registro: RegistroPrevia): ConplusEvento[] {
  if (!("eventos" in registro) || !Array.isArray(registro["eventos"])) return [];
  return registro["eventos"].flatMap((valor) => {
    if (!valor || typeof valor !== "object" || Array.isArray(valor)) return [];
    const evento = valor as {
      codigo?: JsonValue;
      natureza?: JsonValue;
      referencia?: JsonValue;
      valor?: JsonValue;
      unidade?: JsonValue;
    };
    const codigo = textoOpcional(evento.codigo);
    if (!codigo) return [];
    const unidade = textoOpcional(evento.unidade);
    return [
      {
        codigo,
        natureza: textoOpcional(evento.natureza),
        referencia: textoOpcional(evento.referencia),
        valor: textoOpcional(evento.valor),
        unidade: unidade === "H" || unidade === "R" || unidade === "V" ? unidade : null
      }
    ];
  });
}

export async function criarOuRecuperarPrevia(input: CriarPreviaInput) {
  validarCompetencia(input.competencia);
  const [existente] = await banco
    .select()
    .from(conplusImportacoes)
    .where(
      and(eq(conplusImportacoes.empresaId, input.empresaId), eq(conplusImportacoes.hashArquivo, input.hashArquivo))
    )
    .limit(1);
  if (existente) return existente;

  const [criada] = await banco
    .insert(conplusImportacoes)
    .values({
      empresaId: input.empresaId,
      tipo: input.tipo,
      competencia: input.competencia,
      origem: input.origem ?? "arquivo",
      nomeArquivo: input.nomeArquivo,
      hashArquivo: input.hashArquivo,
      tamanhoBytes: input.tamanhoBytes,
      totalRegistros: input.registros.length,
      status: "previa",
      dadosPrevia: { registros: input.registros, diagnosticos: input.diagnosticos },
      criadoPor: input.usuarioId
    })
    .onConflictDoNothing({ target: [conplusImportacoes.empresaId, conplusImportacoes.hashArquivo] })
    .returning();
  if (criada) return criada;

  const [recuperada] = await banco
    .select()
    .from(conplusImportacoes)
    .where(
      and(eq(conplusImportacoes.empresaId, input.empresaId), eq(conplusImportacoes.hashArquivo, input.hashArquivo))
    )
    .limit(1);
  if (!recuperada) throw new Error("Não foi possível recuperar a prévia Conplus");
  return recuperada;
}

export async function confirmarImportacao(params: { perfil: PerfilUsuario; importacaoId: string; retificar: boolean }) {
  const empresaId = empresaDoAtor(params.perfil);
  const usuarioId = atorDoPerfil(params.perfil);

  return executarEmTransacao(async (tx) => {
    const [importacao] = await tx
      .select()
      .from(conplusImportacoes)
      .where(and(eq(conplusImportacoes.id, params.importacaoId), eq(conplusImportacoes.empresaId, empresaId)))
      .limit(1)
      .for("update");
    if (!importacao) throw naoEncontrado("Prévia de importação não encontrada", "CONPLUS_PREVIEW_NOT_FOUND");
    if (importacao.status === "confirmada") return { importacao, idempotente: true };
    if (importacao.status !== "previa" && !(params.retificar && importacao.status === "retificada")) {
      throw conflito("Esta prévia não está disponível para confirmação", "CONPLUS_PREVIEW_STATUS_INVALIDO");
    }

    const dados = dadosDaPrevia(importacao);
    const existentes = await tx
      .select()
      .from(conplusImportacoes)
      .where(
        and(
          eq(conplusImportacoes.empresaId, empresaId),
          eq(conplusImportacoes.competencia, importacao.competencia),
          eq(conplusImportacoes.tipo, importacao.tipo),
          eq(conplusImportacoes.status, "confirmada")
        )
      );
    if (existentes.length > 0 && !params.retificar) {
      throw conflito(
        "Já existe uma importação confirmada para a mesma empresa, competência e tipo. Use retificação explícita.",
        "CONPLUS_IMPORTACAO_DUPLICADA"
      );
    }

    if (existentes.length > 0) {
      await tx
        .update(conplusRegistros)
        .set({ status: "retificado", atualizadoEm: new Date() })
        .where(and(eq(conplusRegistros.empresaId, empresaId), eq(conplusRegistros.importacaoId, existentes[0]!.id)));
      await tx
        .update(conplusImportacoes)
        .set({ status: "retificada", atualizadoEm: new Date() })
        .where(eq(conplusImportacoes.id, existentes[0]!.id));
      await tx.insert(conplusImportacoesHistorico).values({
        importacaoId: existentes[0]!.id,
        empresaId,
        acao: "retificada",
        statusAnterior: "confirmada",
        statusNovo: "retificada",
        detalhes: { substituidaPor: importacao.id },
        atorUsuarioId: usuarioId
      });
    }

    for (const [indice, registro] of dados.registros.entries()) {
      const [inserido] = await tx
        .insert(conplusRegistros)
        .values({
          importacaoId: importacao.id,
          empresaId,
          tipo: importacao.tipo,
          competencia: importacao.competencia,
          identificadorExterno: identificadorExterno(registro, indice),
          codigoColaborador: "contrato" in registro && typeof registro.contrato === "string" ? registro.contrato : null,
          nomeColaborador: nomeColaborador(registro),
          dados: registro
        })
        .returning({ id: conplusRegistros.id });
      if (!inserido) throw new Error("Não foi possível persistir um registro Conplus");

      const eventos = eventosDoRegistro(registro);
      if (eventos.length > 0) {
        await tx.insert(conplusEventos).values(
          eventos.map((evento, ordem) => ({
            registroId: inserido.id,
            importacaoId: importacao.id,
            empresaId,
            ordem,
            codigo: typeof evento === "object" && evento && "codigo" in evento ? String(evento.codigo) : "",
            unidade:
              typeof evento === "object" &&
              evento &&
              "unidade" in evento &&
              ["H", "R", "V"].includes(String(evento.unidade))
                ? (String(evento.unidade) as "H" | "R" | "V")
                : null,
            natureza:
              typeof evento === "object" && evento && "natureza" in evento ? String(evento.natureza ?? "") : null,
            referencia:
              typeof evento === "object" && evento && "referencia" in evento ? String(evento.referencia ?? "") : null,
            valor: typeof evento === "object" && evento && "valor" in evento ? String(evento.valor ?? "") : null,
            dados: evento
          }))
        );
      }
    }

    const [confirmada] = await tx
      .update(conplusImportacoes)
      .set({ status: "confirmada", confirmadoPor: usuarioId, confirmadoEm: new Date(), atualizadoEm: new Date() })
      .where(and(eq(conplusImportacoes.id, importacao.id), eq(conplusImportacoes.status, "previa")))
      .returning();
    if (!confirmada) throw conflito("A prévia foi confirmada por outra solicitação", "CONPLUS_CONFIRMATION_CONFLICT");

    await tx.insert(conplusImportacoesHistorico).values({
      importacaoId: importacao.id,
      empresaId,
      acao: "confirmada",
      statusAnterior: "previa",
      statusNovo: "confirmada",
      detalhes: { totalRegistros: dados.registros.length },
      atorUsuarioId: usuarioId
    });
    return { importacao: confirmada, idempotente: false };
  });
}

export async function listarImportacoes(
  perfil: PerfilUsuario,
  filtros: { tipo?: ConplusTipo; competencia?: string; busca?: string }
) {
  const empresaId = empresaDoAtor(perfil);
  const condicoes = [eq(conplusImportacoes.empresaId, empresaId)];
  if (filtros.tipo) condicoes.push(eq(conplusImportacoes.tipo, filtros.tipo));
  if (filtros.competencia) condicoes.push(eq(conplusImportacoes.competencia, filtros.competencia));
  if (filtros.busca) {
    condicoes.push(
      or(
        ilike(conplusImportacoes.nomeArquivo, `%${filtros.busca}%`),
        ilike(conplusImportacoes.hashArquivo, `%${filtros.busca}%`)
      )!
    );
  }
  return banco
    .select()
    .from(conplusImportacoes)
    .where(and(...condicoes))
    .orderBy(desc(conplusImportacoes.criadoEm));
}

export async function obterImportacao(perfil: PerfilUsuario, id: string) {
  const empresaId = empresaDoAtor(perfil);
  const [importacao] = await banco
    .select()
    .from(conplusImportacoes)
    .where(and(eq(conplusImportacoes.id, id), eq(conplusImportacoes.empresaId, empresaId)))
    .limit(1);
  if (!importacao) throw naoEncontrado("Importação não encontrada", "CONPLUS_IMPORTACAO_NOT_FOUND");
  const registros = await banco
    .select()
    .from(conplusRegistros)
    .where(and(eq(conplusRegistros.importacaoId, id), eq(conplusRegistros.empresaId, empresaId)))
    .orderBy(desc(conplusRegistros.criadoEm));
  return { importacao, registros };
}

export async function obterHistorico(perfil: PerfilUsuario, id: string) {
  const empresaId = empresaDoAtor(perfil);
  return banco
    .select()
    .from(conplusImportacoesHistorico)
    .where(and(eq(conplusImportacoesHistorico.importacaoId, id), eq(conplusImportacoesHistorico.empresaId, empresaId)))
    .orderBy(desc(conplusImportacoesHistorico.criadoEm));
}

export async function iniciarSincronizacaoGoogle(params: { perfil: PerfilUsuario; importacaoId: string; aba: string }) {
  const empresaId = empresaDoAtor(params.perfil);
  const usuarioId = atorDoPerfil(params.perfil);
  return executarEmTransacao(async (tx) => {
    const [importacao] = await tx
      .select()
      .from(conplusImportacoes)
      .where(and(eq(conplusImportacoes.id, params.importacaoId), eq(conplusImportacoes.empresaId, empresaId)))
      .limit(1)
      .for("update");
    if (!importacao) throw naoEncontrado("Importação não encontrada", "CONPLUS_IMPORTACAO_NOT_FOUND");
    const [existente] = await tx
      .select()
      .from(conplusGoogleSincronizacoes)
      .where(
        and(
          eq(conplusGoogleSincronizacoes.importacaoId, params.importacaoId),
          eq(conplusGoogleSincronizacoes.empresaId, empresaId),
          eq(conplusGoogleSincronizacoes.aba, params.aba)
        )
      )
      .limit(1)
      .for("update");
    if (existente?.status === "concluida") return { idempotente: true, sincronizacao: existente };
    if (existente?.status === "processando") {
      throw conflito("Esta importação já está sendo sincronizada", "CONPLUS_GOOGLE_SYNC_EM_ANDAMENTO");
    }
    const agora = new Date();
    const tentativa = (existente?.tentativa ?? 0) + 1;
    const sincronizacao = existente
      ? (
          await tx
            .update(conplusGoogleSincronizacoes)
            .set({
              status: "processando",
              tentativa,
              iniciadoEm: agora,
              ultimoErroCodigo: null,
              ultimoErroMensagem: null,
              atualizadoEm: agora
            })
            .where(eq(conplusGoogleSincronizacoes.id, existente.id))
            .returning()
        )[0]
      : (
          await tx
            .insert(conplusGoogleSincronizacoes)
            .values({
              importacaoId: params.importacaoId,
              empresaId,
              aba: params.aba,
              status: "processando",
              tentativa,
              iniciadoEm: agora
            })
            .returning()
        )[0];
    if (!sincronizacao) throw new Error("Não foi possível reservar a sincronização Google");
    await tx
      .update(conplusImportacoes)
      .set({ sincronizacaoStatus: "processando", atualizadoEm: agora })
      .where(eq(conplusImportacoes.id, params.importacaoId));
    await tx.insert(conplusImportacoesHistorico).values({
      importacaoId: params.importacaoId,
      empresaId,
      acao: "sincronizacao_iniciada",
      statusAnterior: importacao.sincronizacaoStatus,
      statusNovo: "processando",
      detalhes: { aba: params.aba, tentativa },
      atorUsuarioId: usuarioId
    });
    return { idempotente: false, sincronizacao };
  });
}

export async function finalizarSincronizacaoGoogle(params: {
  perfil: PerfilUsuario;
  importacaoId: string;
  sincronizacaoId: string;
  linhasInseridas: number;
}) {
  const empresaId = empresaDoAtor(params.perfil);
  const usuarioId = atorDoPerfil(params.perfil);
  return executarEmTransacao(async (tx) => {
    const agora = new Date();
    const [sincronizacao] = await tx
      .update(conplusGoogleSincronizacoes)
      .set({ status: "concluida", linhasInseridas: params.linhasInseridas, concluidoEm: agora, atualizadoEm: agora })
      .where(
        and(
          eq(conplusGoogleSincronizacoes.id, params.sincronizacaoId),
          eq(conplusGoogleSincronizacoes.empresaId, empresaId)
        )
      )
      .returning();
    if (!sincronizacao) throw naoEncontrado("Sincronização Google não encontrada", "CONPLUS_GOOGLE_SYNC_NOT_FOUND");
    await tx
      .update(conplusImportacoes)
      .set({ sincronizacaoStatus: "concluida", atualizadoEm: agora })
      .where(and(eq(conplusImportacoes.id, params.importacaoId), eq(conplusImportacoes.empresaId, empresaId)));
    await tx.insert(conplusImportacoesHistorico).values({
      importacaoId: params.importacaoId,
      empresaId,
      acao: "sincronizacao_concluida",
      statusAnterior: "processando",
      statusNovo: "concluida",
      detalhes: { linhasInseridas: params.linhasInseridas },
      atorUsuarioId: usuarioId
    });
    return sincronizacao;
  });
}

export async function falharSincronizacaoGoogle(params: {
  perfil: PerfilUsuario;
  importacaoId: string;
  sincronizacaoId: string;
  codigo: string;
}) {
  const empresaId = empresaDoAtor(params.perfil);
  const usuarioId = atorDoPerfil(params.perfil);
  return executarEmTransacao(async (tx) => {
    const agora = new Date();
    await tx
      .update(conplusGoogleSincronizacoes)
      .set({
        status: "falhou",
        ultimoErroCodigo: params.codigo,
        ultimoErroMensagem: "Falha na sincronização Google",
        atualizadoEm: agora
      })
      .where(
        and(
          eq(conplusGoogleSincronizacoes.id, params.sincronizacaoId),
          eq(conplusGoogleSincronizacoes.empresaId, empresaId)
        )
      );
    await tx
      .update(conplusImportacoes)
      .set({
        sincronizacaoStatus: "falhou",
        ultimoErroCodigo: params.codigo,
        ultimoErroMensagem: "Falha na sincronização Google",
        atualizadoEm: agora
      })
      .where(and(eq(conplusImportacoes.id, params.importacaoId), eq(conplusImportacoes.empresaId, empresaId)));
    await tx.insert(conplusImportacoesHistorico).values({
      importacaoId: params.importacaoId,
      empresaId,
      acao: "falha",
      statusAnterior: "processando",
      statusNovo: "falhou",
      detalhes: { codigo: params.codigo },
      atorUsuarioId: usuarioId
    });
  });
}
