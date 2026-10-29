import { LIMITE_UPLOAD_PLANILHA_BYTES } from "../utils.js";
import type { FastifyInstance } from "fastify";
import {
  analisarHistoricoSchema,
  aplicarHistoricoSchema,
  associarFornecedorHistoricoSchema,
  cadastrarFornecedorHistoricoSchema,
  historicoImportacaoQuerySchema,
  historicoResumoQuerySchema,
  reparearHistoricoSchema
} from "@padaria/shared/compras";
import { apiIdParamsSchema, criadoId, ok, semConteudo } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { erroValidacao } from "../erros.js";
import { linhasDoHistorico } from "./compras-historico-planilha.js";
import {
  analisarHistorico,
  aplicarHistorico,
  associarFornecedorHistorico,
  cadastrarFornecedorHistorico,
  cancelarImportacaoHistorico,
  detalharImportacaoHistorico,
  listarImportacoesHistorico,
  reparearHistorico,
  resumoHistorico
} from "./compras-historico.service.js";

// R-222: o historico mexe no catalogo fornecedor-produto (cria/aprova vinculo), entao usa a mesma
// permissao do catalogo. Nenhuma rota daqui altera preco-base.
const guarda = { preHandler: exigirPermissao("compras_catalogo_gerir") };
const BASE = "/api/compras/historico";

export async function registrarRotasComprasHistorico(app: FastifyInstance): Promise<void> {
  app.get(`${BASE}/resumo`, guarda, async (request) =>
    ok(await resumoHistorico(historicoResumoQuerySchema.parse(request.query), request.perfilUsuario!))
  );
  app.get(`${BASE}/importacoes`, guarda, async (request) => {
    const { empresaId } = historicoImportacaoQuerySchema.parse(request.query);
    return ok(await listarImportacoesHistorico(empresaId, request.perfilUsuario!));
  });
  app.get(`${BASE}/importacoes/:id`, guarda, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = historicoImportacaoQuerySchema.parse(request.query);
    return ok(await detalharImportacaoHistorico(id, empresaId, request.perfilUsuario!));
  });

  app.post(`${BASE}/importacoes/analisar-arquivo`, guarda, async (request, reply) => {
    const { empresaId } = historicoImportacaoQuerySchema.parse(request.query);
    const arquivo = await request.file({ limits: { fileSize: LIMITE_UPLOAD_PLANILHA_BYTES, files: 1, fields: 0 } });
    if (!arquivo) throw erroValidacao("Arquivo .xlsx ou .csv obrigatorio", "PURCHASE_HISTORY_FILE_REQUIRED");
    const nome = arquivo.filename.toLocaleLowerCase("pt-BR");
    if (!nome.endsWith(".xlsx") && !nome.endsWith(".csv"))
      throw erroValidacao("Envie uma planilha .xlsx ou .csv", "PURCHASE_HISTORY_FILE_TYPE");
    const buffer = await arquivo.toBuffer();
    let lido;
    try {
      lido = linhasDoHistorico(buffer, arquivo.filename);
    } catch (erro) {
      // 400 de arquivo ruim: registrar aqui separa "o operador mandou arquivo errado" de um bug no leitor.
      request.log.warn({ erro, arquivo: arquivo.filename }, "planilha de historico de compras recusada");
      throw erro;
    }
    const analisada = await analisarHistorico(
      analisarHistoricoSchema.parse({
        empresaId,
        nomeArquivo: arquivo.filename.slice(-255),
        hashArquivo: lido.hashArquivo,
        linhas: lido.linhas
      }),
      request.perfilUsuario!,
      request.usuarioId!
    );
    return criadoId(reply, analisada.id);
  });

  app.post(`${BASE}/importacoes/:id/reparear`, guarda, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = reparearHistoricoSchema.parse(request.body);
    await reparearHistorico(id, empresaId, request.perfilUsuario!);
    return semConteudo(reply);
  });
  app.post(`${BASE}/importacoes/:id/fornecedores/associar`, guarda, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    await associarFornecedorHistorico(
      id,
      associarFornecedorHistoricoSchema.parse(request.body),
      request.perfilUsuario!,
      request.usuarioId!
    );
    return semConteudo(reply);
  });
  // Cadastrar fornecedor novo exige tambem a permissao do cadastro: o historico nao vira atalho para
  // quem nao pode criar fornecedor.
  app.post(
    `${BASE}/importacoes/:id/fornecedores/cadastrar`,
    { preHandler: [exigirPermissao("compras_catalogo_gerir"), exigirPermissao("cadastro_fornecedores_criar")] },
    async (request, reply) => {
      const { id } = apiIdParamsSchema.parse(request.params);
      await cadastrarFornecedorHistorico(
        id,
        cadastrarFornecedorHistoricoSchema.parse(request.body),
        request.perfilUsuario!,
        request.usuarioId!
      );
      return semConteudo(reply);
    }
  );
  app.post(`${BASE}/importacoes/:id/aplicar`, guarda, async (request) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = aplicarHistoricoSchema.parse(request.body);
    return ok(await aplicarHistorico(id, empresaId, request.perfilUsuario!, request.usuarioId!));
  });
  app.post(`${BASE}/importacoes/:id/cancelar`, guarda, async (request, reply) => {
    const { id } = apiIdParamsSchema.parse(request.params);
    const { empresaId } = aplicarHistoricoSchema.parse(request.body);
    await cancelarImportacaoHistorico(id, empresaId, request.perfilUsuario!);
    return semConteudo(reply);
  });
}
