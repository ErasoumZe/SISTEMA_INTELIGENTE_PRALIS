import { mensagemDominioOuRelancar } from "../erros.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  cargoPayloadSchema,
  colaboradorCargoParamsSchema,
  colaboradorCargoPayloadSchema,
  colaboradorCargoStatusPayloadSchema,
  colaboradorParamsSchema,
  faltaJustificadaPayloadSchema,
  idParamsSchema,
  jornadaPayloadSchema
} from "@padaria/shared/colaboradores";
import {
  cargoParamsSchema,
  colaboradoresQuerySchema as empresaQuerySchema,
  exportarCargoSchema,
  exportarColaboradorSchema,
  importarCargosSchema,
  importarColaboradoresSchema
} from "@padaria/shared/colaboradores";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { empresasPermitidas, escopoEmpresaAtiva, podeAcessarEmpresa } from "../auth/empresa.js";
import { criadoId, erro, ok, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import {
  atualizarCargo,
  atualizarStatusCargoColaborador,
  criarCargo,
  criarCargoColaborador,
  criarFaltaJustificada,
  criarJornadasColaborador,
  exportarCargo,
  exportarColaborador,
  importarCargos,
  importarColaboradores,
  listarColaboradores,
  listarCargos,
  listarCargosColaborador,
  listarFaltasJustificadas,
  listarJornadasColaborador,
  salvarColaborador
} from "./colaboradores.service.js";
import { statusErroValidacao } from "../utils.js";
import { obterPerfilColaborador, salvarPerfilCadastralDoColaborador } from "./perfil.service.js";

async function escopoDaQuery(request: FastifyRequest, reply: FastifyReply) {
  const query = empresaQuerySchema.parse(request.query);
  const perfil = request.perfilUsuario;
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  try {
    return { query, empresasLiberadas, escopoDados: escopoEmpresaAtiva(empresasLiberadas, query.empresaId) };
  } catch (error) {
    erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
    return null;
  }
}

// Fail-closed: a versao anterior era `!request.perfilUsuario || podeAcessarEmpresa(...)`, ou seja,
// SEM perfil liberava qualquer empresa do corpo. O hook default-deny de app.ts:153-159 responde
// antes e nenhuma rota deste modulo esta na allowlist, entao nao havia caminho HTTP para isso — mas
// bastava alguem entrar na allowlist para virar buraco. O service tambem exige o ator por conta
// propria (`exigirAtor`), e esta e a defesa em profundidade da borda.
function empresaPermitida(request: FastifyRequest, empresaId: string) {
  return Boolean(request.perfilUsuario) && podeAcessarEmpresa(request.perfilUsuario!, empresaId);
}

function erro400(reply: FastifyReply, error: Error, fallback: string) {
  return erro(reply, 400, error.message || fallback);
}

export async function registrarRotasColaboradores(app: FastifyInstance) {
  // Lista consumida como OPCAO de formulario: credor de despesa/retirada e item da discriminacao
  // (web-vue/components/operacoes/OperacaoLancamentoCredor.vue:42 e
  // OperacaoLancamentoDiscriminacao.vue:89-90), alem da grade do cadastro e do select de colaborador
  // da tela de usuarios. Aceita caixa_operar alem do cadastro de colaboradores; QUEM entra so por
  // caixa_operar recebe a projecao reduzida, decidida em `listarColaboradores`.
  // As sub-rotas (cargos/jornadas/faltas) seguem restritas ao cadastro.
  app.get(
    "/api/colaboradores",
    // B-1: `despesas_visualizar` entrou porque a despesa oferece Colaborador como credor e a lista
    // nao era carregada por quem so lanca — o chip abria um select vazio. Continua na projecao
    // reduzida: quem entra por permissao operacional nao ve salario, documento nem jornada.
    {
      preHandler: exigirAlgumaPermissao(["cadastro_colaboradores_visualizar", "caixa_operar", "despesas_visualizar"])
    },
    async (request, reply) => {
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(
            await listarColaboradores(escopo.escopoDados, request.perfilUsuario),
            escopo.query.page,
            escopo.query.pageSize
          )
        : undefined;
    }
  );

  app.post(
    "/api/colaboradores",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      // `?? {}`: corpo JSON `null` fazia o acesso a `.empresaId` estourar TypeError -> 500 +
      // Sentry. Com o objeto vazio a requisicao segue e o Zod do service responde 400.
      const body = (request.body ?? {}) as { empresaId?: string };
      if (body.empresaId && !empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await salvarColaborador(null, request.body, request.perfilUsuario);
        return criadoId(reply, criado?.id ?? "colaboradores");
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/colaboradores/:id",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { id } = cargoParamsSchema.parse(request.params);
      // `?? {}`: corpo JSON `null` fazia o acesso a `.empresaId` estourar TypeError -> 500 +
      // Sentry. Com o objeto vazio a requisicao segue e o Zod do service responde 400.
      const body = (request.body ?? {}) as { empresaId?: string };
      if (body.empresaId && !empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        await salvarColaborador(id, request.body, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.post(
    "/api/colaboradores/importar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      try {
        return ok(await importarColaboradores(importarColaboradoresSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/colaboradores/:id/exportar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { id } = cargoParamsSchema.parse(request.params);
      try {
        return ok(await exportarColaborador(id, exportarColaboradorSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  // Perfil do Departamento Pessoal. E uma leitura distinta da lista operacional usada pelo Caixa:
  // a lista continua minimizada para quem so opera caixa/despesa; o perfil exige permissao de DP.
  app.get(
    "/api/colaboradores/:id/perfil",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      try {
        const { id } = idParamsSchema.parse(request.params);
        return ok(await obterPerfilColaborador(id, request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/colaboradores/:id/perfil",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      try {
        const { id } = idParamsSchema.parse(request.params);
        await salvarPerfilCadastralDoColaborador(id, request.body ?? {}, request.perfilUsuario);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.get(
    "/api/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(await listarCargos(escopo.escopoDados), escopo.query.page, escopo.query.pageSize)
        : undefined;
    }
  );

  app.post("/api/cargos", { preHandler: exigirPermissao("cadastro_colaboradores_criar") }, async (request, reply) => {
    const body = cargoPayloadSchema.parse(request.body);
    if (!empresaPermitida(request, body.empresaId))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const criado = await criarCargo(body, request.perfilUsuario);
      if (!criado) return erro(reply, 400, "Cargo invalido", "INVALID_CARGO");
      return criadoId(reply, criado.id);
    } catch (error) {
      return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Cargo invalido");
    }
  });

  // Sem try/catch de proposito: `atualizarCargo` sinaliza com `ErroDominio`, que o handler global
  // (app.ts:100-102) traduz com status e code proprios. Um `new Error` cru aqui viraria 500.
  app.put(
    "/api/cargos/:id",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { id } = idParamsSchema.parse(request.params);
      const body = cargoPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      await atualizarCargo(id, body, request.perfilUsuario);
      return semConteudo(reply);
    }
  );

  app.post(
    "/api/cargos/importar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      try {
        return ok(await importarCargos(importarCargosSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  app.post(
    "/api/cargos/:id/exportar",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { id } = cargoParamsSchema.parse(request.params);
      try {
        return ok(await exportarCargo(id, exportarCargoSchema.parse(request.body), request.perfilUsuario));
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, mensagem === "Empresa nao permitida" ? 403 : 400, mensagem);
      }
    }
  );

  // As tres sub-rotas de leitura passaram a usar `escopoDaQuery` como a listagem principal. Antes
  // usavam `empresasPermitidas` direto e IGNORAVAM o `?empresaId=`: pedir uma empresa fora do
  // escopo devolvia 200 em vez do 403 que a rota irma devolve. Duas respostas para a mesma negacao.
  app.get(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(
            await listarCargosColaborador(colaboradorId, escopo.escopoDados),
            escopo.query.page,
            escopo.query.pageSize
          )
        : undefined;
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/cargos",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = colaboradorCargoPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarCargoColaborador(colaboradorId, body, request.perfilUsuario);
        if (!criado) return erro(reply, 400, "Cargo do colaborador invalido", "INVALID_COLLABORATOR_ROLE");
        return criadoId(reply, criado.id);
      } catch (error) {
        return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Cargo do colaborador invalido");
      }
    }
  );

  // Sem try/catch: ver o comentario de `PUT /api/cargos/:id`.
  app.put(
    "/api/colaboradores/:colaboradorId/cargos/:cargoColaboradorId",
    { preHandler: exigirPermissao("cadastro_colaboradores_editar") },
    async (request, reply) => {
      const { colaboradorId, cargoColaboradorId } = colaboradorCargoParamsSchema.parse(request.params);
      const body = colaboradorCargoStatusPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      await atualizarStatusCargoColaborador(colaboradorId, cargoColaboradorId, body, request.perfilUsuario);
      return semConteudo(reply);
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/jornadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(
            await listarJornadasColaborador(colaboradorId, escopo.escopoDados),
            escopo.query.page,
            escopo.query.pageSize
          )
        : undefined;
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/jornadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = jornadaPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarJornadasColaborador(colaboradorId, body, request.perfilUsuario);
        return criadoId(reply, (criado as { ids?: string[] }).ids?.[0] ?? colaboradorId);
      } catch (error) {
        return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Jornada invalida");
      }
    }
  );

  app.get(
    "/api/colaboradores/:colaboradorId/faltas-justificadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_visualizar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const escopo = await escopoDaQuery(request, reply);
      return escopo
        ? paginadoDeArray(
            await listarFaltasJustificadas(colaboradorId, escopo.escopoDados),
            escopo.query.page,
            escopo.query.pageSize
          )
        : undefined;
    }
  );

  app.post(
    "/api/colaboradores/:colaboradorId/faltas-justificadas",
    { preHandler: exigirPermissao("cadastro_colaboradores_criar") },
    async (request, reply) => {
      const { colaboradorId } = colaboradorParamsSchema.parse(request.params);
      const body = faltaJustificadaPayloadSchema.parse(request.body);
      if (!empresaPermitida(request, body.empresaId))
        return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
      try {
        const criado = await criarFaltaJustificada(colaboradorId, body, request.perfilUsuario);
        if (!criado) return erro(reply, 400, "Falta justificada invalida", "INVALID_ABSENCE");
        return criadoId(reply, criado.id);
      } catch (error) {
        return erro400(reply, new Error(mensagemDominioOuRelancar(error)), "Falta justificada invalida");
      }
    }
  );
}
