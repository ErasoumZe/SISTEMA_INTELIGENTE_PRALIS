import type { FastifyReply, FastifyRequest } from "fastify";
import { empresaQuerySchema } from "@padaria/shared/catalogos";
import { exigirAutenticacao, exigirPermissao } from "../autorizacao.js";
import { empresasPermitidas, escopoEmpresaAtiva } from "../autorizacao/empresa.js";
import type { AplicacaoFastify } from "../tipos/fastify.js";
import {
  listarAreasSetores,
  listarColaboradores,
  listarContas,
  listarEmpresas,
  listarFornecedores,
  listarGrupos,
  listarPermissoes,
  listarProdutos,
  listarSetores,
  listarUnidadesMedida,
  listarUsuarios
} from "./catalogos.service.js";

async function escopoDaQuery(request: FastifyRequest, reply: FastifyReply) {
  const query = empresaQuerySchema.parse(request.query);
  const perfil = request.perfilUsuario;
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  try {
    return { query, empresasLiberadas, escopoDados: escopoEmpresaAtiva(empresasLiberadas, query.empresaId) };
  } catch (error) {
    reply.status(403).send({ erro: error instanceof Error ? error.message : "Empresa nao permitida" });
    return null;
  }
}

export async function registrarRotasCatalogos(app: AplicacaoFastify) {
  app.get("/api/empresas", { preHandler: exigirAutenticacao }, async (request) =>
    listarEmpresas(request.perfilUsuario)
  );

  app.get("/api/contas", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarContas(escopo.escopoDados) : undefined;
  });

  app.get("/api/fornecedores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarFornecedores(escopo.escopoDados) : undefined;
  });

  app.get("/api/colaboradores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarColaboradores(escopo.escopoDados) : undefined;
  });

  app.get("/api/grupos", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarGrupos(escopo.escopoDados) : undefined;
  });

  app.get("/api/unidades_medida", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarUnidadesMedida(escopo.escopoDados) : undefined;
  });

  app.get("/api/areas_setores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarAreasSetores(escopo.escopoDados) : undefined;
  });

  app.get("/api/setores", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarSetores(escopo.escopoDados) : undefined;
  });

  app.get("/api/produtos", { preHandler: exigirAutenticacao }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarProdutos(escopo.escopoDados) : undefined;
  });

  app.get("/api/usuarios", { preHandler: exigirPermissao("cadastro_usuarios") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarUsuarios(escopo.empresasLiberadas, escopo.escopoDados) : undefined;
  });

  app.get("/api/permissoes", { preHandler: exigirPermissao("cadastro_permissoes") }, async (request, reply) => {
    const escopo = await escopoDaQuery(request, reply);
    return escopo ? listarPermissoes(escopo.empresasLiberadas, escopo.escopoDados) : undefined;
  });
}
