import type { FastifyReply, FastifyRequest } from "fastify";
import { empresaQuerySchema } from "@padaria/shared/catalogos";
import { exigirAutenticacao, exigirPermissao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva } from "../autorizacao/empresa.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import {
  listarAreasSetores,
  listarClientes,
  listarColaboradores,
  listarContas,
  listarEmpresas,
  listarFormasPagamento,
  listarFornecedores,
  listarGrupos,
  listarPermissoes,
  listarPdvs,
  listarProdutos,
  listarSetores,
  listarUnidadesMedida,
  listarUsuarios
} from "./catalogos.service.js";
import { erro, ok, paginadoDeArray } from "../respostas.js";

async function escopoDaQuery(request: FastifyRequest, reply: FastifyReply) {
  const query = empresaQuerySchema.parse(request.query);
  const perfil = request.perfilUsuario;
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  try {
    return { query, empresasLiberadas, escopoDados: escopoEmpresaAtiva(empresasLiberadas, query.empresaId) };
  } catch (error) {
    erro(reply, 403, error instanceof Error ? error.message : "Empresa nao permitida", "FORBIDDEN_COMPANY");
    return null;
  }
}

export async function registrarRotasCatalogos(app: AplicacaoFastify) {
  app.get("/api/empresas", { preHandler: exigirAutenticacao }, async (request) => {
    const query = empresaQuerySchema.parse(request.query);
    return paginadoDeArray(await listarEmpresas(request.perfilUsuario), query.page, query.pageSize);
  });

  app.get("/api/contas", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? paginadoDeArray(await listarContas(escopo.escopoDados), escopo.query.page, escopo.query.pageSize) : undefined;
  });

  app.get("/api/formas_pagamento", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo
      ? paginadoDeArray(await listarFormasPagamento(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
      : undefined;
  });

  app.get("/api/pdvs", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? paginadoDeArray(await listarPdvs(escopo.escopoDados), escopo.query.page, escopo.query.pageSize) : undefined;
  });

  app.get("/api/fornecedores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo
      ? paginadoDeArray(await listarFornecedores(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
      : undefined;
  });

  app.get("/api/clientes", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? paginadoDeArray(await listarClientes(escopo.escopoDados), escopo.query.page, escopo.query.pageSize) : undefined;
  });

  app.get("/api/colaboradores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo
      ? paginadoDeArray(await listarColaboradores(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
      : undefined;
  });

  app.get("/api/grupos", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarGrupos(escopo.escopoDados) : undefined;
  });

  app.get("/api/unidades_medida", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo
      ? paginadoDeArray(await listarUnidadesMedida(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
      : undefined;
  });

  app.get("/api/areas_setores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? ok(await listarAreasSetores(escopo.escopoDados)) : undefined;
  });

  app.get("/api/setores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? paginadoDeArray(await listarSetores(escopo.escopoDados), escopo.query.page, escopo.query.pageSize) : undefined;
  });

  app.get("/api/produtos", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? paginadoDeArray(await listarProdutos(escopo.escopoDados), escopo.query.page, escopo.query.pageSize) : undefined;
  });

  app.get("/api/usuarios", { preHandler: exigirPermissao("cadastro_usuarios_visualizar") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo
      ? paginadoDeArray(
          await listarUsuarios(escopo.empresasLiberadas, escopo.escopoDados),
          escopo.query.page,
          escopo.query.pageSize
        )
      : undefined;
  });

  app.get("/api/permissoes", { preHandler: exigirPermissao("cadastro_permissoes_visualizar") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? ok(await listarPermissoes(escopo.empresasLiberadas, escopo.escopoDados)) : undefined;
  });
}
