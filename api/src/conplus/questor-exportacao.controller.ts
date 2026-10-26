import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { processoParamsSchema } from "@padaria/shared/admissoes";
import { erro, ok } from "@padaria/shared/api";
import { temPermissao, type PerfilUsuario } from "@padaria/shared";
import { ROTAS_EXPORTACAO_QUESTOR } from "@padaria/shared/conplus";
import { exigirAutenticacao, exigirPermissao } from "../auth/guards.js";
import {
  baixarArquivoExportacaoQuestor,
  estadoExportacaoQuestor,
  gerarArquivoAdmissaoQuestor,
  gerarArquivoTecnicoAdmissaoQuestor,
  listarHistoricoExportacoesQuestor,
  prepararPreviaAdmissaoQuestor,
  registrarDownloadQuestor,
  type ArquivoExportadoQuestor
} from "./questor-exportacao.service.js";

/** Resposta de arquivo: anexo, tipo explícito, e SHA/ID para a tela conferir e o histórico achar. */
export function enviarArquivoQuestor(
  reply: FastifyReply,
  arquivo: Pick<ArquivoExportadoQuestor, "nomeArquivo" | "mimeType" | "sha256"> & {
    conteudo: string | Buffer;
    exportacaoId?: string;
    reutilizado?: boolean;
  }
) {
  reply
    .type(arquivo.mimeType)
    .header("Content-Disposition", `attachment; filename="${arquivo.nomeArquivo}"`)
    .header("X-Questor-Sha256", arquivo.sha256)
    .header("Cache-Control", "no-store");
  if (arquivo.exportacaoId) reply.header("X-Questor-Exportacao-Id", arquivo.exportacaoId);
  if (arquivo.reutilizado !== undefined) reply.header("X-Questor-Reutilizado", String(arquivo.reutilizado));
  return reply.send(arquivo.conteudo);
}

/** Entrega o arquivo e registra o download na auditoria (quem, quando, qual, se era técnico confirmado). */
export async function entregarArquivoQuestor(
  reply: FastifyReply,
  perfil: PerfilUsuario | undefined,
  arquivo: Parameters<typeof enviarArquivoQuestor>[1],
  origem: "geracao" | "historico",
  confirmacaoArquivoTecnico = false
) {
  await registrarDownloadQuestor(perfil, arquivo, origem, confirmacaoArquivoTecnico);
  return enviarArquivoQuestor(reply, arquivo);
}

export async function registrarRotasQuestorExportacao(app: FastifyInstance): Promise<void> {
  const admissoes = { preHandler: exigirPermissao("conplus_exportar_admissoes") };
  const autenticado = {
    preHandler: async (request: FastifyRequest, reply: FastifyReply) => void (await exigirAutenticacao(request, reply))
  };

  app.post(ROTAS_EXPORTACAO_QUESTOR.admissoesPrevia, admissoes, async (request) =>
    ok(await prepararPreviaAdmissaoQuestor(request.body, request.perfilUsuario))
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, admissoes, async (request, reply) =>
    entregarArquivoQuestor(
      reply,
      request.perfilUsuario,
      await gerarArquivoTecnicoAdmissaoQuestor(request.body, request.perfilUsuario),
      "geracao",
      true
    )
  );
  app.post(ROTAS_EXPORTACAO_QUESTOR.admissoesDownload, admissoes, async (request, reply) =>
    entregarArquivoQuestor(
      reply,
      request.perfilUsuario,
      await gerarArquivoAdmissaoQuestor(request.body, request.perfilUsuario),
      "geracao"
    )
  );
  // Estado real dos bloqueios (a tela só reflete; quem decide é o servidor).
  app.get(ROTAS_EXPORTACAO_QUESTOR.estado, autenticado, async (request, reply) => {
    const permissoes = request.perfilUsuario?.permissoes ?? [];
    if (
      !temPermissao(permissoes, "conplus_exportar_admissoes") &&
      !temPermissao(permissoes, "conplus_exportar_eventos")
    ) {
      return erro(reply, 403, "Permissao insuficiente", "INSUFFICIENT_PERMISSION");
    }
    return ok(estadoExportacaoQuestor());
  });
  // Histórico: autenticado; o serviço filtra pelo tipo que cada perfil pode exportar.
  app.get(ROTAS_EXPORTACAO_QUESTOR.historico, autenticado, async (request) =>
    ok(await listarHistoricoExportacoesQuestor(request.query, request.perfilUsuario))
  );
  // A permissão depende do tipo da exportação (admissão ou eventos): o serviço confere depois de achar.
  app.get(ROTAS_EXPORTACAO_QUESTOR.arquivo, autenticado, async (request, reply) => {
    const { id } = processoParamsSchema.parse(request.params);
    const arquivo = await baixarArquivoExportacaoQuestor(id, request.query, request.perfilUsuario);
    // Técnico só chega aqui confirmado (o serviço recusa sem a confirmação): a auditoria registra isso.
    return entregarArquivoQuestor(reply, request.perfilUsuario, arquivo, "historico", arquivo.tecnico);
  });
}
