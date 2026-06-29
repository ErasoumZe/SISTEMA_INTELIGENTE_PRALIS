import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { env } from "./env.js";
import { registrarRotasAuth } from "./auth/auth.controller.js";
import { registrarRotasCaixa } from "./caixa/caixa.controller.js";
import { registrarRotasColaboradores } from "./colaboradores/colaboradores.controller.js";
import { registrarRotasDespesas } from "./despesas/despesas.controller.js";
import { registrarRotasIntegracoes } from "./integracoes/integracoes.controller.js";
import { registrarRotasMalotes } from "./malotes/malotes.controller.js";
import { registrarRotasMercadorias } from "./mercadorias/mercadorias.controller.js";
import { registrarRotasRetiradas } from "./retiradas/retiradas.controller.js";
import { registrarRotasSaude } from "./saude/saude.controller.js";
import { registrarRotasTema } from "./tema/tema.controller.js";
import { registrarRotasTransferencias } from "./transferencias/transferencias.controller.js";
import { registrarRotasVendas } from "./vendas/vendas.controller.js";
import { registrarRotasVendasComprovantes } from "./vendas/comprovantes.controller.js";
import { registrarRotasProdutosMaisVendidos } from "./vendas/produtos-mais-vendidos.controller.js";
import { erro } from "@padaria/shared/api";
import { registrarRotasAreas } from "./areas/areas.controller.js";
import { registrarRotasClientes } from "./clientes/clientes.controller.js";
import { registrarRotasContas } from "./contas/contas.controller.js";
import { registrarRotasEmpresas } from "./empresas/empresas.controller.js";
import { registrarRotasFormasPagamento } from "./formas-pagamento/formas-pagamento.controller.js";
import { registrarRotasFornecedores } from "./fornecedores/fornecedores.controller.js";
import { registrarRotasGrupos } from "./grupos/grupos.controller.js";
import { registrarRotasPdvs } from "./pdvs/pdvs.controller.js";
import { registrarRotasPermissoes } from "./permissoes/permissoes.controller.js";
import { registrarRotasProdutos } from "./produtos/produtos.controller.js";
import { registrarRotasSetores } from "./setores/setores.controller.js";
import { registrarRotasUnidadesMedida } from "./unidades-medida/unidades-medida.controller.js";
import { registrarRotasUsuarios } from "./usuarios/usuarios.controller.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: process.env["NODE_ENV"] !== "test" });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return erro(
        reply,
        400,
        "Requisicao invalida",
        "VALIDATION_ERROR",
        error.issues.map((issue) => ({
          caminho: issue.path.join("."),
          mensagem: issue.message
        }))
      );
    }

    request.log.error(error);
    return erro(reply, 500, "Erro interno", "INTERNAL_ERROR");
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 10,
      parts: 12
    }
  });

  await registrarRotasSaude(app);
  await registrarRotasAuth(app);
  await registrarRotasTema(app);
  await registrarRotasVendas(app);
  await registrarRotasVendasComprovantes(app);
  await registrarRotasDespesas(app);
  await registrarRotasMercadorias(app);
  await registrarRotasRetiradas(app);
  await registrarRotasTransferencias(app);
  await registrarRotasCaixa(app);
  await registrarRotasEmpresas(app);
  await registrarRotasContas(app);
  await registrarRotasFormasPagamento(app);
  await registrarRotasPdvs(app);
  await registrarRotasFornecedores(app);
  await registrarRotasClientes(app);
  await registrarRotasColaboradores(app);
  await registrarRotasGrupos(app);
  await registrarRotasUnidadesMedida(app);
  await registrarRotasAreas(app);
  await registrarRotasSetores(app);
  await registrarRotasProdutos(app);
  await registrarRotasUsuarios(app);
  await registrarRotasPermissoes(app);
  await registrarRotasMalotes(app);
  await registrarRotasProdutosMaisVendidos(app);
  await registrarRotasIntegracoes(app);

  return app;
}

