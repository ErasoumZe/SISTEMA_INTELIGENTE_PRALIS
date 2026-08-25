import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { env } from "./env.js";
import { codigoPostgresDoErro, ErroDominio } from "./erros.js";
import { capturarErro, iniciarObservabilidade } from "./observabilidade.js";
import { registrarRotasAuth } from "./auth/auth.controller.js";
import { registrarRotasCaixa } from "./caixa/caixa.controller.js";
import { registrarRotasColaboradores } from "./colaboradores/colaboradores.controller.js";
import { registrarRotasDespesas } from "./despesas/despesas.controller.js";
import { registrarRotasIntegracoes } from "./integracoes/integracoes.controller.js";
import { registrarRotasPedidos } from "./pedidos/pedidos.controller.js";
import { registrarRotasMaquininhas } from "./maquininhas/maquininhas.controller.js";
import { registrarRotasMercadorias } from "./mercadorias/mercadorias.controller.js";
import { registrarRotasNotasFiscais } from "./notas-fiscais/notas-fiscais.controller.js";
import { registrarRotasRetiradas } from "./retiradas/retiradas.controller.js";
import { registrarRotasSaude } from "./saude/saude.controller.js";
import { registrarRotasTema } from "./tema/tema.controller.js";
import { registrarRotasTransferencias } from "./transferencias/transferencias.controller.js";
import { registrarRotasVendas } from "./vendas/vendas.controller.js";
import { registrarRotasVendasComprovantes } from "./vendas/comprovantes.controller.js";
import { registrarRotasProdutosMaisVendidos } from "./vendas/produtos-mais-vendidos.controller.js";
import { erro } from "@padaria/shared/api";
import { exigirAutenticacao } from "./auth/guards.js";
import { registrarRotasAreas } from "./areas/areas.controller.js";
import { registrarRotasClientes } from "./clientes/clientes.controller.js";
import { registrarRotasContas } from "./contas/contas.controller.js";
import { registrarRotasContasUsuarios } from "./contas-usuarios/contas-usuarios.controller.js";
import { registrarRotasLacres } from "./lacres/lacres.controller.js";
import { registrarRotasEmpresas } from "./empresas/empresas.controller.js";
import { registrarRotasFormasPagamento } from "./formas-pagamento/formas-pagamento.controller.js";
import { registrarRotasFornecedores } from "./fornecedores/fornecedores.controller.js";
import { registrarRotasGrupos } from "./grupos/grupos.controller.js";
import { registrarRotasPatrimonio } from "./patrimonio/patrimonio.controller.js";
import { registrarRotasPdvs } from "./pdvs/pdvs.controller.js";
import { registrarRotasPermissoes } from "./permissoes/permissoes.controller.js";
import { registrarRotasProdutos } from "./produtos/produtos.controller.js";
import { registrarRotasSetores } from "./setores/setores.controller.js";
import { registrarRotasSociosGestores } from "./socios-gestores/socios-gestores.controller.js";
import { registrarRotasNotificacoes } from "./notificacoes/notificacoes.controller.js";
import { registrarRotasTurnos } from "./turnos/turnos.controller.js";
import { registrarRotasUnidadesMedida } from "./unidades-medida/unidades-medida.controller.js";
import { registrarRotasUsuarios } from "./usuarios/usuarios.controller.js";
import { registrarRotasRecorrencias } from "./lancamentos/recorrencias.controller.js";
import { usuarioEstaTravadoRepository } from "./transferencias/transferencias.repository.js";

// Rotas que gerenciam a propria autenticacao: better-auth, sondagem de sessao
// (respondem 401 com payload proprio), healthcheck e ingestao por chave de API.
// Allowlist do default-deny: rotas que NAO usam sessao porque tem autenticacao propria.
// /api/integracoes e /api/integracoes/conciliacao autenticam pela chave de integracao (x-api-key,
// hash em tempo constante) — sao chamadas pelo agente, que nao tem sessao de usuario.
const rotasComAutenticacaoPropria = new Set([
  "/health",
  "/api/auth/*",
  "/api/me",
  "/api/sessao",
  "/api/integracoes",
  "/api/integracoes/conciliacao"
]);

export async function buildApp(): Promise<FastifyInstance> {
  // Rastreamento de erros opcional (no-op sem SENTRY_DSN).
  iniciarObservabilidade();

  const app = Fastify({
    logger:
      process.env["NODE_ENV"] === "test"
        ? false
        : {
            // Credenciais nunca vao para o log: cookie de sessao, bearer e chave de integracao.
            redact: {
              paths: [
                "req.headers.cookie",
                "req.headers.authorization",
                'req.headers["x-api-key"]',
                'res.headers["set-cookie"]'
              ],
              censor: "[redigido]"
            }
          }
  });

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

    if (error instanceof ErroDominio) {
      return erro(reply, error.status, error.message, error.code, error.details);
    }

    // Erro do @fastify/rate-limit: chega aqui com statusCode 429 e os headers (Retry-After /
    // X-RateLimit-*) ja setados no reply pelo plugin. Sem este ramo virava 500 INTERNAL_ERROR e o
    // cliente re-martelava em vez de aguardar. reply.status().send() preserva os headers ja setados.
    if ((error as { statusCode?: number }).statusCode === 429) {
      return erro(reply, 429, "Muitas requisicoes; aguarde e tente novamente", "RATE_LIMITED");
    }

    // Erro de PROTOCOLO do proprio Fastify (corpo JSON vazio ou malformado, content-type nao
    // suportado, payload grande demais). Ele ja traz o statusCode 4xx certo; sem este ramo virava
    // 500 "Erro interno" — o cliente errou e a tela acusava falha do servidor, alem de sujar a
    // captura de erros com o que nao e bug. Medido no fluxo do dia: PUT sem corpo devolvia 500.
    const statusFastify = (error as { statusCode?: number }).statusCode;
    const codigoFastify = (error as { code?: string }).code;
    if (statusFastify && statusFastify >= 400 && statusFastify < 500 && codigoFastify?.startsWith("FST_")) {
      return erro(reply, statusFastify, "Requisição inválida", codigoFastify);
    }

    // P0 lancamento x fechamento: com o FOR SHARE em toda escrita do caixa e o teto de espera por
    // transacao, contencao acima do teto vira 55P03 (lock_not_available) — e deadlock, se um dia
    // existir, vira 40P01. Sem este ramo os dois viravam 500 "Erro interno": o operador nao sabia
    // que era so tentar de novo e o agente CREARE nao distinguia bug de fila. 503 e transitorio
    // por contrato (o agente re-tenta 5xx; 4xx ele descarta — R-013 proibe descartar venda).
    // `codigoPostgresDoErro` percorre a CADEIA de causas: o Drizzle embrulha toda falha de query
    // num `DrizzleQueryError` que NAO copia o `code`, entao ler `error.code` direto devolvia
    // sempre `undefined` — e este ramo era codigo morto, com 55P03/40P01 caindo no 500 abaixo.
    const codigoPostgres = codigoPostgresDoErro(error instanceof Error ? error : null);
    if (codigoPostgres === "55P03" || codigoPostgres === "40P01") {
      request.log.warn(error, "contencao de lock acima do teto");
      return erro(reply, 503, "Sistema ocupado com outra operacao do caixa; tente novamente", "LOCK_OCUPADO");
    }

    request.log.error(error);
    capturarErro(error instanceof Error ? error : new Error(String(error)));
    return erro(reply, 500, "Erro interno", "INTERNAL_ERROR");
  });

  await app.register(cors, {
    origin: env.WEB_ORIGIN,
    credentials: true,
    // PATCH e usado por aprovar/recusar NF-e e discriminar lancamentos. Sem ele, o preflight
    // cross-origin (front sistema. -> API api-sistema.) barra o PATCH com net::ERR_FAILED.
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-API-Key"]
  });
  await app.register(helmet);
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute"
  });
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024,
      files: 1,
      fields: 10,
      parts: 12
    }
  });

  // Default-deny: toda rota exige sessao valida ANTES do handler, exceto a allowlist
  // acima. Rota nova sem preHandler nasce protegida (401), nunca publica. Os guards de
  // permissao por rota continuam responsaveis pela autorizacao fina (o perfil resolvido
  // aqui e reaproveitado por eles na mesma requisicao).
  app.addHook("onRequest", async (request, reply) => {
    if (request.method === "OPTIONS") return;
    const rota = request.routeOptions.url;
    if (!rota || rotasComAutenticacaoPropria.has(rota)) return;
    await exigirAutenticacao(request, reply);
  });

  // R-037: depois do prazo, origem e operadores dos destinos ficam impedidos de executar novas
  // mutacoes. Confirmar a propria transferencia e a liberacao excepcional continuam acessiveis.
  app.addHook("preHandler", async (request, reply) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method) || !request.perfilUsuario) return;
    const rota = request.routeOptions.url ?? "";
    if (
      rota.endsWith("/confirmar") ||
      rota.endsWith("/liberar-trava") ||
      rota.startsWith("/api/notificacoes") ||
      rota.startsWith("/api/auth")
    ) {
      return;
    }
    if (await usuarioEstaTravadoRepository(request.perfilUsuario.usuarioId)) {
      return erro(
        reply,
        423,
        "Existe transferencia com prazo de confirmacao estourado",
        "TRANSFERENCIA_CONFIRMATION_OVERDUE"
      );
    }
    return undefined;
  });

  await registrarRotasSaude(app);
  await registrarRotasAuth(app);
  await registrarRotasTema(app);
  await registrarRotasVendas(app);
  await registrarRotasVendasComprovantes(app);
  await registrarRotasDespesas(app);
  await registrarRotasMercadorias(app);
  await registrarRotasNotasFiscais(app);
  await registrarRotasRetiradas(app);
  await registrarRotasRecorrencias(app);
  await registrarRotasTransferencias(app);
  await registrarRotasCaixa(app);
  await registrarRotasEmpresas(app);
  await registrarRotasContas(app);
  await registrarRotasContasUsuarios(app);
  await registrarRotasLacres(app);
  await registrarRotasFormasPagamento(app);
  await registrarRotasPatrimonio(app);
  await registrarRotasPdvs(app);
  await registrarRotasFornecedores(app);
  await registrarRotasClientes(app);
  await registrarRotasColaboradores(app);
  await registrarRotasGrupos(app);
  await registrarRotasUnidadesMedida(app);
  await registrarRotasAreas(app);
  await registrarRotasSetores(app);
  await registrarRotasSociosGestores(app);
  await registrarRotasMaquininhas(app);
  await registrarRotasNotificacoes(app);
  await registrarRotasTurnos(app);
  await registrarRotasProdutos(app);
  await registrarRotasUsuarios(app);
  await registrarRotasPermissoes(app);
  await registrarRotasProdutosMaisVendidos(app);
  await registrarRotasIntegracoes(app);
  await registrarRotasPedidos(app);

  return app;
}
