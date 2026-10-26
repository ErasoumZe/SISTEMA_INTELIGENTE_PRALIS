import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { criadoId, erro, ok, type DadosExternos } from "@padaria/shared/api";
import { ErroFonteCentral, FONTES_ARQUIVO_CENTRAL } from "@padaria/shared/produtos";
import { z } from "zod";
import { exigirAutenticacao } from "../auth/guards.js";
import {
  anexarFonteCentral,
  CargaCentralEstadoInvalidoError,
  CargaCentralDecisaoExistenteError,
  CargaCentralNaoEncontradaError,
  CargaCentralVaziaError,
  criarCargaCentral,
  FonteCentralDuplicadaError,
  listarCargasCentrais,
  listarGruposDaCarga,
  registrarDecisaoCentral,
  validarCargaCentral
} from "./produtos-central.service.js";

const paramsCarga = z.object({ cargaId: z.string().uuid() });
const paramsGrupo = z.object({ cargaId: z.string().uuid(), grupoId: z.string().uuid() });
const queryFonte = z.object({ fonte: z.enum(FONTES_ARQUIVO_CENTRAL) });
const corpoDecisao = z.object({
  acao: z.enum(["nao_e_o_mesmo", "ignorado"]),
  observacao: z.string().trim().max(500).optional()
});
const queryGrupos = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
  busca: z.string().trim().max(200).optional(),
  loja: z.enum(["LI", "TNP", "BASE", "HORA"]).optional()
});

async function exigirAdmin(request: FastifyRequest, reply: FastifyReply) {
  const perfil = await exigirAutenticacao(request, reply);
  if (!perfil) return null;
  if (perfil.role !== "usuario_admin") {
    erro(reply, 403, "Acesso administrativo necessário", "ADMIN_PERMISSION_REQUIRED");
    return null;
  }
  return perfil;
}

function responderErroCentral(reply: FastifyReply, causa: DadosExternos) {
  if (causa instanceof CargaCentralNaoEncontradaError) return erro(reply, 404, causa.message, "NOT_FOUND");
  if (
    causa instanceof CargaCentralEstadoInvalidoError ||
    causa instanceof FonteCentralDuplicadaError ||
    causa instanceof CargaCentralDecisaoExistenteError
  ) {
    return erro(reply, 409, causa.message, "CENTRAL_CONFLICT");
  }
  if (causa instanceof CargaCentralVaziaError) return erro(reply, 422, causa.message, "CENTRAL_EMPTY_LOAD");
  if (causa instanceof ErroFonteCentral) return erro(reply, 400, causa.message, causa.code);
  throw causa;
}

export async function registrarRotasProdutosCentral(app: FastifyInstance): Promise<void> {
  app.get("/api/produtos/central/cargas", async (request, reply) => {
    if (!(await exigirAdmin(request, reply))) return;
    return ok(await listarCargasCentrais());
  });

  app.post("/api/produtos/central/cargas", async (request, reply) => {
    const perfil = await exigirAdmin(request, reply);
    if (!perfil) return;
    const carga = await criarCargaCentral({ id: perfil.usuarioId, nome: perfil.nome });
    request.log.info({ evento: "produtos.central.carga.criada", cargaId: carga.id, usuarioId: perfil.usuarioId });
    return criadoId(reply, carga.id, { criadoEm: carga.criadoEm.toISOString() });
  });

  app.post("/api/produtos/central/cargas/:cargaId/fontes", async (request, reply) => {
    if (!(await exigirAdmin(request, reply))) return;
    const { cargaId } = paramsCarga.parse(request.params);
    const { fonte } = queryFonte.parse(request.query);
    try {
      const arquivo = await request.file();
      if (!arquivo) return erro(reply, 400, "Envie um arquivo CSV.", "FILE_REQUIRED");
      const bytes = await arquivo.toBuffer();
      let conteudo: string;
      try {
        conteudo = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        return erro(reply, 400, "O CSV precisa estar codificado em UTF-8.", "CSV_ENCODING_INVALID");
      }
      const resultado = await anexarFonteCentral(cargaId, fonte, conteudo);
      request.log.info({ evento: "produtos.central.fonte.anexada", cargaId, fonte, linhas: resultado.linhas });
      return ok(resultado);
    } catch (causa) {
      return responderErroCentral(reply, causa);
    }
  });

  app.post("/api/produtos/central/cargas/:cargaId/validar", async (request, reply) => {
    if (!(await exigirAdmin(request, reply))) return;
    const { cargaId } = paramsCarga.parse(request.params);
    try {
      const resumo = await validarCargaCentral(cargaId);
      request.log.info({ evento: "produtos.central.carga.validada", cargaId, ...resumo });
      return ok(resumo);
    } catch (causa) {
      return responderErroCentral(reply, causa);
    }
  });

  app.get("/api/produtos/central/cargas/:cargaId/grupos", async (request, reply) => {
    if (!(await exigirAdmin(request, reply))) return;
    const { cargaId } = paramsCarga.parse(request.params);
    const query = queryGrupos.parse(request.query);
    try {
      const resultado = await listarGruposDaCarga({
        cargaId,
        page: query.page,
        pageSize: query.pageSize,
        ...(query.busca ? { busca: query.busca } : {}),
        ...(query.loja ? { loja: query.loja } : {})
      });
      return ok({ ...resultado, page: query.page, pageSize: query.pageSize });
    } catch (causa) {
      return responderErroCentral(reply, causa);
    }
  });

  app.get("/api/produtos/central/cargas/:cargaId/grupos/:grupoId", async (request, reply) => {
    if (!(await exigirAdmin(request, reply))) return;
    const { cargaId, grupoId } = paramsGrupo.parse(request.params);
    try {
      const resultado = await listarGruposDaCarga({ cargaId, grupoId, page: 1, pageSize: 1 });
      const grupo = resultado.grupos.find((item) => item.id === grupoId);
      return grupo ? ok(grupo) : erro(reply, 404, "Grupo da Central não encontrado.", "NOT_FOUND");
    } catch (causa) {
      return responderErroCentral(reply, causa);
    }
  });

  app.post("/api/produtos/central/cargas/:cargaId/grupos/:grupoId/decisao", async (request, reply) => {
    const perfil = await exigirAdmin(request, reply);
    if (!perfil) return;
    const { cargaId, grupoId } = paramsGrupo.parse(request.params);
    const corpo = corpoDecisao.parse(request.body);
    try {
      const decisao = await registrarDecisaoCentral({
        cargaId,
        grupoId,
        acao: corpo.acao,
        ...(corpo.observacao ? { observacao: corpo.observacao } : {}),
        usuario: { id: perfil.usuarioId, nome: perfil.nome }
      });
      request.log.info({
        evento: "produtos.central.decisao.registrada",
        cargaId,
        grupoId,
        acao: corpo.acao,
        usuarioId: perfil.usuarioId
      });
      return criadoId(reply, decisao.id, { acao: decisao.acao, criadoEm: decisao.criadoEm.toISOString() });
    } catch (causa) {
      return responderErroCentral(reply, causa);
    }
  });
}
