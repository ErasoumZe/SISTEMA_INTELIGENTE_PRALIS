import type { FastifyInstance } from "fastify";
import { turnosQuerySchema } from "@padaria/shared/turnos";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirAlgumaPermissao, exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { excluirTurno, listarTurnos, salvarTurno } from "./turnos.service.js";

export async function registrarRotasTurnos(app: FastifyInstance): Promise<void> {
  // Lista consumida como OPCAO de formulario (modal de abrir/editar caixa). O operador de caixa
  // precisa dela para escolher o turno, entao aceita caixa_operar alem do cadastro de turnos.
  app.get(
    "/api/turnos",
    { preHandler: exigirAlgumaPermissao(["cadastro_turnos_visualizar", "caixa_operar"]) },
    async (request, reply) => {
      const query = turnosQuerySchema.parse(request.query);
      try {
        const escopo = escopoEmpresaAtiva(
          request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [],
          query.empresaId
        );
        return paginadoDeArray(await listarTurnos(escopo), query.page, query.pageSize);
      } catch (error) {
        return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
      }
    }
  );

  app.post("/api/turnos", { preHandler: exigirPermissao("cadastro_turnos_criar") }, async (request, reply) => {
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      const salvo = await salvarTurno(null, request.body);
      return criadoId(reply, salvo.id);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/turnos/:id", { preHandler: exigirPermissao("cadastro_turnos_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { empresaId?: string };
    if (body.empresaId && request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, body.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await salvarTurno(id, request.body);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.delete("/api/turnos/:id", { preHandler: exigirPermissao("cadastro_turnos_excluir") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = turnosQuerySchema.parse(request.query);
    if (!query.empresaId) return erro(reply, 400, "empresaId obrigatorio");
    if (request.perfilUsuario && !podeAcessarEmpresa(request.perfilUsuario, query.empresaId)) {
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    }
    try {
      await excluirTurno(id, query.empresaId);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });
}
