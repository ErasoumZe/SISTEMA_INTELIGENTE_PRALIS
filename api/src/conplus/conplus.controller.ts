import { createHash } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { parsePeriodosAquisitivos, parseRescisoesCalculadas } from "@padaria/shared/conplus";
import { erro, ok } from "@padaria/shared/api";
import { exigirPermissao } from "../auth/guards.js";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import { ConplusGoogleSyncService } from "./conplus-google.service.js";
import { mapearRegistroConplus } from "./conplus-google-mapping.js";
import { env } from "../env.js";
import {
  confirmarImportacao,
  criarOuRecuperarPrevia,
  listarImportacoes,
  iniciarSincronizacaoGoogle,
  finalizarSincronizacaoGoogle,
  falharSincronizacaoGoogle,
  obterHistorico,
  obterImportacao,
  type ConplusTipo
} from "./conplus.service.js";

const LIMITE_PREVIA = 100;

function erroArquivo(reply: FastifyReply, mensagem: string) {
  return erro(reply, 400, mensagem, "CONPLUS_FILE_INVALID");
}

function textoUtf8(bytes: Buffer): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/u, "");
}

export async function registrarRotasConplus(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/conplus/importacoes/preview",
    { preHandler: exigirPermissao("conplus_importacoes_visualizar") },
    async (request, reply) => {
      const arquivo = await request.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 1, parts: 2 } });
      if (!arquivo) return erroArquivo(reply, "Selecione um arquivo Conplus");

      const nome = arquivo.filename.trim();
      const extensao = nome.toLowerCase().split(".").pop() ?? "";
      const bytes = await arquivo.toBuffer();
      const conteudo = textoUtf8(bytes);
      if (!conteudo.trim()) return erroArquivo(reply, "O arquivo Conplus está vazio");
      const campos = arquivo.fields as Record<string, { value?: string | Buffer }>;
      const competencia = typeof campos["competencia"]?.value === "string" ? campos["competencia"].value : "";
      if (!competencia) return erroArquivo(reply, "Informe a competência antes de validar o arquivo");
      const perfil = request.perfilUsuario;
      const empresaId = empresaDoAtor(perfil);
      const usuarioId = atorDoPerfil(perfil);

      if (extensao === "txt") {
        const resultado = parseRescisoesCalculadas(conteudo);
        const importacao = await criarOuRecuperarPrevia({
          empresaId,
          usuarioId,
          tipo: "rescisoes",
          competencia,
          nomeArquivo: nome,
          hashArquivo: createHash("sha256").update(bytes).digest("hex"),
          tamanhoBytes: bytes.byteLength,
          registros: resultado.registros,
          diagnosticos: resultado.diagnosticos
        });
        return ok({
          previewId: importacao.id,
          tipo: "rescisoes",
          arquivo: nome,
          persistido: true,
          registros: resultado.registros.slice(0, LIMITE_PREVIA),
          totalRegistros: resultado.registros.length,
          diagnosticos: resultado.diagnosticos,
          limitePrevia: LIMITE_PREVIA
        });
      }

      if (extensao === "csv") {
        const resultado = parsePeriodosAquisitivos(conteudo);
        const importacao = await criarOuRecuperarPrevia({
          empresaId,
          usuarioId,
          tipo: "ferias",
          competencia,
          nomeArquivo: nome,
          hashArquivo: createHash("sha256").update(bytes).digest("hex"),
          tamanhoBytes: bytes.byteLength,
          registros: resultado.registros,
          diagnosticos: resultado.diagnosticos
        });
        return ok({
          previewId: importacao.id,
          tipo: "ferias",
          arquivo: nome,
          persistido: true,
          registros: resultado.registros.slice(0, LIMITE_PREVIA),
          totalRegistros: resultado.registros.length,
          diagnosticos: resultado.diagnosticos,
          limitePrevia: LIMITE_PREVIA
        });
      }

      return erroArquivo(
        reply,
        "Este formato ainda não possui leitor seguro. Para folha e adiantamento, a leitura do XLSX precisa ser validada contra o arquivo oficial antes da importação."
      );
    }
  );

  app.post(
    "/api/conplus/importacoes/confirmar",
    { preHandler: exigirPermissao("conplus_importacoes_confirmar") },
    async (request, reply) => {
      const body = request.body as { previewId?: string; retificar?: boolean };
      if (typeof body?.previewId !== "string" || !body.previewId.trim()) return erroArquivo(reply, "Prévia inválida");
      const resultado = await confirmarImportacao({
        perfil: request.perfilUsuario!,
        importacaoId: body.previewId,
        retificar: body.retificar === true
      });
      return ok({
        importacaoId: resultado.importacao.id,
        status: resultado.importacao.status,
        idempotente: resultado.idempotente
      });
    }
  );

  app.post(
    "/api/conplus/importacoes/:id/sincronizar/previsualizar",
    { preHandler: exigirPermissao("conplus_importacoes_sincronizar") },
    async (request, reply) => {
      const importacaoId = (request.params as { id?: string }).id;
      const registroId = (request.body as { registroId?: string })?.registroId;
      if (!importacaoId || typeof registroId !== "string" || !registroId.trim()) {
        return erroArquivo(reply, "Selecione um registro para a prévia Google");
      }
      const { importacao, registros } = await obterImportacao(request.perfilUsuario!, importacaoId);
      const registro = registros.find((item) => item.id === registroId);
      if (!registro) return erroArquivo(reply, "Registro Conplus não encontrado nesta importação");
      const dados = mapearRegistroConplus(importacao.tipo, registro.dados as Record<string, string | number | null>);
      const previa = await new ConplusGoogleSyncService().prepararPrevia(importacao.tipo, [
        { registroId: registro.id, ...dados }
      ]);
      return ok(previa);
    }
  );

  app.get(
    "/api/conplus/importacoes",
    { preHandler: exigirPermissao("conplus_importacoes_visualizar") },
    async (request) => {
      const query = request.query as { tipo?: string; competencia?: string; busca?: string };
      const tipos = ["folha_05", "adiantamento_20", "rescisoes", "ferias"] as const;
      const tipo = tipos.includes(query.tipo as (typeof tipos)[number])
        ? (query.tipo as (typeof tipos)[number])
        : undefined;
      const filtros: { tipo?: ConplusTipo; competencia?: string; busca?: string } = {};
      if (tipo) filtros.tipo = tipo;
      if (query.competencia) filtros.competencia = query.competencia;
      if (query.busca) filtros.busca = query.busca;
      return ok(await listarImportacoes(request.perfilUsuario!, filtros));
    }
  );

  app.post(
    "/api/conplus/importacoes/:id/sincronizar",
    { preHandler: exigirPermissao("conplus_importacoes_sincronizar") },
    async (request, reply) => {
      const id = (request.params as { id?: string }).id;
      if (!id) return erroArquivo(reply, "Importação inválida");
      const { importacao, registros } = await obterImportacao(request.perfilUsuario!, id);
      const sincronizador = new ConplusGoogleSyncService();
      if (!env.CONPLUS_GOOGLE_SYNC_ENABLED) {
        return ok(await sincronizador.sincronizar(importacao.tipo, []));
      }
      const dados = registros.map((registro) =>
        mapearRegistroConplus(importacao.tipo, registro.dados as Record<string, string | number | null>)
      );
      const aba = sincronizador.abaParaTipo(importacao.tipo);
      const controle = await iniciarSincronizacaoGoogle({ perfil: request.perfilUsuario!, importacaoId: id, aba });
      if (controle.idempotente) return ok({ habilitada: true, idempotente: true, aba, linhas: [] });
      try {
        const resultado = await sincronizador.sincronizar(importacao.tipo, dados);
        await finalizarSincronizacaoGoogle({
          perfil: request.perfilUsuario!,
          importacaoId: id,
          sincronizacaoId: controle.sincronizacao.id,
          linhasInseridas: resultado.linhas.length
        });
        return ok(resultado);
      } catch {
        await falharSincronizacaoGoogle({
          perfil: request.perfilUsuario!,
          importacaoId: id,
          sincronizacaoId: controle.sincronizacao.id,
          codigo: "CONPLUS_GOOGLE_SYNC_FAILED"
        });
        return erro(
          reply,
          502,
          "Não foi possível sincronizar esta importação com o Google.",
          "CONPLUS_GOOGLE_SYNC_FAILED"
        );
      }
    }
  );

  app.get(
    "/api/conplus/importacoes/:id",
    { preHandler: exigirPermissao("conplus_importacoes_visualizar") },
    async (request) => ok(await obterImportacao(request.perfilUsuario!, (request.params as { id: string }).id))
  );

  app.get(
    "/api/conplus/importacoes/:id/historico",
    { preHandler: exigirPermissao("conplus_importacoes_visualizar") },
    async (request) => ok(await obterHistorico(request.perfilUsuario!, (request.params as { id: string }).id))
  );
}
