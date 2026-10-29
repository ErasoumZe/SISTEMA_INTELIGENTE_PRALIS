import { mensagemDominioOuRelancar } from "../erros.js";
import type { DadosExternos } from "@padaria/shared/api";
import type { FastifyInstance } from "fastify";
import { empresasDoUsuarioPayload, usuariosQuerySchema as empresaQuerySchema } from "@padaria/shared/usuarios";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { escopoEmpresaAtiva, empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { statusErroValidacao } from "../utils.js";
import { definirPostoCaixaUsuario, listarUsuarios, salvarUsuario } from "./usuarios.service.js";

function empresasNaoPermitidas(body: DadosExternos, perfil: Parameters<typeof podeAcessarEmpresa>[0] | undefined) {
  const empresasBody = empresasDoUsuarioPayload(body);
  return Boolean(perfil && empresasBody.some((empresaId) => !podeAcessarEmpresa(perfil, empresaId)));
}

export async function registrarRotasUsuarios(app: FastifyInstance): Promise<void> {
  app.get("/api/usuarios", { preHandler: exigirPermissao("cadastro_usuarios_visualizar") }, async (request, reply) => {
    const query = empresaQuerySchema.parse(request.query);
    const empresasLiberadas = request.perfilUsuario ? empresasPermitidas(request.perfilUsuario) : [];
    let escopo: string[];
    try {
      escopo = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
    } catch (error) {
      return erro(reply, 403, mensagemDominioOuRelancar(error), "FORBIDDEN_COMPANY");
    }

    // A consulta fica fora do catch de escopo: falhas tecnicas do banco precisam chegar ao handler
    // global como 500 logado, nunca virar uma falsa negacao de empresa com mensagem interna no corpo.
    // Mesmo recorte aplicado na rota irma de permissoes (8ae8d22).
    return paginadoDeArray(await listarUsuarios(escopo), query.page, query.pageSize);
  });

  app.post("/api/usuarios", { preHandler: exigirPermissao("cadastro_usuarios_criar") }, async (request, reply) => {
    if (empresasNaoPermitidas(request.body, request.perfilUsuario))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      const salvo = await salvarUsuario(null, request.body, request.perfilUsuario);
      return criadoId(reply, salvo.id);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  app.put("/api/usuarios/:id", { preHandler: exigirPermissao("cadastro_usuarios_editar") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (empresasNaoPermitidas(request.body, request.perfilUsuario))
      return erro(reply, 403, "Empresa nao permitida", "FORBIDDEN_COMPANY");
    try {
      await salvarUsuario(id, request.body, request.perfilUsuario);
      return semConteudo(reply);
    } catch (error) {
      const mensagem = mensagemDominioOuRelancar(error);
      return erro(reply, statusErroValidacao(mensagem), mensagem);
    }
  });

  // R-229 · trocar ou tirar o posto do Caixa (PDV + turno do caixa) de um login existente.
  app.put(
    "/api/usuarios/:id/posto-caixa",
    { preHandler: exigirPermissao("cadastro_usuarios_editar") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        await definirPostoCaixaUsuario(id, request.body, request.perfilUsuario!);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
