import type { FastifyInstance } from "fastify";
import { criadoId, ok, semConteudo } from "@padaria/shared/api";
import {
  criarMensagemAdminPayloadSchema,
  entregaParamsSchema,
  mensagemAdminParamsSchema,
  mensagensAdminQuerySchema
} from "@padaria/shared/mensagens-admin";
import { exigirPermissao } from "../auth/guards.js";
import {
  carimbarEntrega,
  criarMensagemAdmin,
  detalharMensagemAdmin,
  encerrarMensagemAdmin,
  listarMensagensAdmin,
  listarMensagensDoOperador
} from "./mensagens-admin.service.js";

// R-200: a mensagem administrativa NAO tem tela nem menu proprio — ela vive no Monitor de caixas
// abertos, dentro do Historico de caixas. Mesmo assim cada rota carrega sua permissao: esconder o
// botao nunca e controle de acesso. O projeto ja tem o contra-exemplo registrado em
// `db/src/referencia-permissoes.ts:23-27` (fechamento_com_diferenca_visualizar, so gate de menu).
//
// As rotas de ENTREGA sao a excecao deliberada e nao exigem permissao: a autorizacao do operador e
// ser o destinatario daquela linha, conferido no WHERE do repositorio com empresa + destinatario.
export async function registrarRotasMensagensAdmin(app: FastifyInstance) {
  app.post(
    "/api/mensagens-admin",
    { preHandler: exigirPermissao("mensagens_admin_enviar") },
    async (request, reply) => {
      const dados = criarMensagemAdminPayloadSchema.parse(request.body);
      const criada = await criarMensagemAdmin(dados, request.perfilUsuario!);
      return criadoId(reply, criada.id, { destinatarios: criada.destinatarios });
    }
  );

  app.get("/api/mensagens-admin", { preHandler: exigirPermissao("mensagens_admin_visualizar") }, async (request) => {
    const { empresaId } = mensagensAdminQuerySchema.parse(request.query);
    return ok(await listarMensagensAdmin(empresaId, request.perfilUsuario!));
  });

  // Estatica antes da parametrizada: o roteador do Fastify ja prioriza, e o param e uuid — "minhas"
  // nunca casaria com ele de qualquer forma.
  app.get("/api/mensagens-admin/minhas", async (request) => {
    const { empresaId } = mensagensAdminQuerySchema.parse(request.query);
    return ok(await listarMensagensDoOperador(empresaId, request.perfilUsuario!));
  });

  app.get(
    "/api/mensagens-admin/:mensagemId",
    { preHandler: exigirPermissao("mensagens_admin_visualizar") },
    async (request) => {
      const { mensagemId } = mensagemAdminParamsSchema.parse(request.params);
      const { empresaId } = mensagensAdminQuerySchema.parse(request.query);
      return ok(await detalharMensagemAdmin(mensagemId, empresaId, request.perfilUsuario!));
    }
  );

  app.put(
    "/api/mensagens-admin/:mensagemId/encerrar",
    { preHandler: exigirPermissao("mensagens_admin_enviar") },
    async (request, reply) => {
      const { mensagemId } = mensagemAdminParamsSchema.parse(request.params);
      const { empresaId } = mensagensAdminQuerySchema.parse(request.query);
      await encerrarMensagemAdmin(mensagemId, empresaId, request.perfilUsuario!);
      return semConteudo(reply);
    }
  );

  for (const [rota, campo] of [
    ["visualizar", "visualizadaEm"],
    ["confirmar", "confirmadaEm"],
    ["fechar", "fechadaEm"]
  ] as const) {
    app.put(`/api/mensagens-admin/entregas/:entregaId/${rota}`, async (request, reply) => {
      const { entregaId } = entregaParamsSchema.parse(request.params);
      const { empresaId } = mensagensAdminQuerySchema.parse(request.query);
      await carimbarEntrega({ entregaId, empresaId, campo }, request.perfilUsuario!);
      return semConteudo(reply);
    });
  }
}
