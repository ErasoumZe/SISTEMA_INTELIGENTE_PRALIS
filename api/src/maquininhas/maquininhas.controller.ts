import type { FastifyInstance } from "fastify";
import { criadoId, erro, paginadoDeArray, semConteudo } from "@padaria/shared/api";
import { maquininhaPayloadSchema, maquininhasQuerySchema } from "@padaria/shared/maquininhas";
import { exigirAlgumaPermissao } from "../auth/guards.js";
import { empresasPermitidas, podeAcessarEmpresa } from "../auth/empresa.js";
import { mensagemDominioOuRelancar } from "../erros.js";
import { statusErroValidacao } from "../utils.js";
import { listarMaquininhas, salvarMaquininha } from "./maquininhas.service.js";

const permissoes = ["cadastro_pdv_visualizar", "cadastro_pdv_criar", "cadastro_pdv_editar"] as const;

export async function registrarRotasMaquininhas(app: FastifyInstance) {
  app.get(
    "/api/maquininhas",
    { preHandler: exigirAlgumaPermissao([...permissoes, "caixa_operar"]) },
    async (request, reply) => {
      const query = maquininhasQuerySchema.parse(request.query);
      const perfil = request.perfilUsuario!;
      const empresas = empresasPermitidas(perfil);
      if (query.empresaId && !empresas.includes(query.empresaId)) return erro(reply, 403, "Empresa nao permitida");
      const escopo = query.empresaId ? [query.empresaId] : empresas;
      const somenteAtivas = !perfil.permissoes.includes("cadastro_pdv_editar");
      return paginadoDeArray(await listarMaquininhas(escopo, somenteAtivas), query.page, query.pageSize);
    }
  );

  app.post(
    "/api/maquininhas",
    { preHandler: exigirAlgumaPermissao(["cadastro_pdv_criar"]) },
    async (request, reply) => {
      const dados = maquininhaPayloadSchema.parse(request.body);
      if (!podeAcessarEmpresa(request.perfilUsuario!, dados.empresaId))
        return erro(reply, 403, "Empresa nao permitida");
      try {
        return criadoId(reply, (await salvarMaquininha(null, dados)).id);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );

  app.put(
    "/api/maquininhas/:id",
    { preHandler: exigirAlgumaPermissao(["cadastro_pdv_editar"]) },
    async (request, reply) => {
      const dados = maquininhaPayloadSchema.parse(request.body);
      if (!podeAcessarEmpresa(request.perfilUsuario!, dados.empresaId))
        return erro(reply, 403, "Empresa nao permitida");
      try {
        await salvarMaquininha((request.params as { id: string }).id, dados);
        return semConteudo(reply);
      } catch (error) {
        const mensagem = mensagemDominioOuRelancar(error);
        return erro(reply, statusErroValidacao(mensagem), mensagem);
      }
    }
  );
}
