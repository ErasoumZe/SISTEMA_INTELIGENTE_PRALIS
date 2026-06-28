import type { FastifyInstance } from "fastify";
import { permissaoCadastro } from "../cadastros/cadastros.permissoes.js";
import { exigirPermissao } from "../autorizacao.js";
import { exportarCadastroSchema, idCadastroParamsSchema, importarCadastroSchema } from "@padaria/shared/copia";
import { exportarCadastroEmpresa, importarCadastroEmpresa } from "./copia.service.js";

const rotasCopia = {
  contas: "/api/contas",
  fornecedores: "/api/fornecedores",
  colaboradores: "/api/colaboradores",
  cargos: "/api/cargos",
  grupos: "/api/grupos",
  unidades: "/api/unidades_medida",
  areas_setores: "/api/areas_setores",
  produtos: "/api/produtos",
  malotes: "/api/malotes"
} as const;

export async function registrarRotasCopia(app: FastifyInstance): Promise<void> {
  for (const [tipo, caminho] of Object.entries(rotasCopia)) {
    const permissao = permissaoCadastro(tipo);
    if (!permissao) continue;

    app.post(`${caminho}/importar`, { preHandler: exigirPermissao(permissao) }, async (request, reply) => {
      const body = importarCadastroSchema.parse(request.body);
      try {
        return await importarCadastroEmpresa(tipo, body, request.perfilUsuario);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Importacao invalida";
        const status = mensagem === "Empresa nao permitida" ? 403 : 400;
        return reply.status(status).send({ erro: mensagem });
      }
    });

    app.post(`${caminho}/:id/exportar`, { preHandler: exigirPermissao(permissao) }, async (request, reply) => {
      const { id } = idCadastroParamsSchema.parse(request.params);
      const body = exportarCadastroSchema.parse(request.body);
      try {
        return await exportarCadastroEmpresa(tipo, id, body, request.perfilUsuario);
      } catch (error) {
        const mensagem = error instanceof Error ? error.message : "Copia invalida";
        const status = mensagem === "Empresa nao permitida" ? 403 : 400;
        return reply.status(status).send({ erro: mensagem });
      }
    });
  }
}
