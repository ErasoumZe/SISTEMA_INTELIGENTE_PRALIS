import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import {
  ERROS_EXPORTACAO_QUESTOR,
  ROTAS_EXPORTACAO_QUESTOR,
  ROTAS_QUESTOR,
  validarArquivoEventosVariaveis,
  type QuestorCatalogoImportacaoDto,
  type QuestorEventosVariaveisPreviaDto,
  type QuestorExportacaoHistoricoDto,
  type QuestorExportacaoPreviaDto,
  type QuestorLancamentoVariavelDto
} from "@padaria/shared/conplus";
import { env } from "../../../api/src/env.js";
import { caminhoAbsolutoDocumento } from "../../../api/src/lancamentos/foto-documento.js";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * Fluxo completo das exportações Questor pela rota HTTP real, com dados FICTÍCIOS:
 * colaborador → contrato Questor → lançamentos → prévia → geração → auditoria → histórico → download,
 * e o TXT de admissão (técnico e oficial). Os gates de homologação são ligados SÓ dentro dos testes
 * que exercitam o caminho oficial e desligados em seguida.
 */
describe("exportações Questor — fluxo completo", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string;
  let cookieGerencia: string;
  let usuarioId: string;

  const ids = {
    turnoA: "11111111-1111-4111-8111-11111111e701",
    turnoB: "11111111-1111-4111-8111-11111111e702",
    funcaoB: "11111111-1111-4111-8111-11111111e703",
    processoTxt: "11111111-1111-4111-8111-11111111e704",
    processoB: "11111111-1111-4111-8111-11111111e705",
    processoV1: "11111111-1111-4111-8111-11111111e706",
    processoV2: "11111111-1111-4111-8111-11111111e707",
    processoVB: "11111111-1111-4111-8111-11111111e708",
    colaborador1: "11111111-1111-4111-8111-11111111e709",
    colaborador2: "11111111-1111-4111-8111-11111111e70a",
    colaboradorB: "11111111-1111-4111-8111-11111111e70b",
    vinculo1: "11111111-1111-4111-8111-11111111e70c",
    vinculo2: "11111111-1111-4111-8111-11111111e70d",
    vinculoB: "11111111-1111-4111-8111-11111111e70e",
    exportacaoB: "11111111-1111-4111-8111-11111111e70f"
  };
  const competencia = "2026-10-01";
  const sha = (dados: string | Buffer) => createHash("sha256").update(dados).digest("hex");
  const arquivoUrl = (id: string) => ROTAS_EXPORTACAO_QUESTOR.arquivo.replace(":id", id);
  /** Novo download de arquivo TÉCNICO pelo histórico: a mesma confirmação da geração. */
  const tecnicoUrl = (id: string) => `${arquivoUrl(id)}?confirmacaoArquivoTecnico=true`;

  async function vestir(email: string, cargo: "DP" | "Gerencia") {
    const alvo = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [email]);
    if (!alvo) throw new Error(`usuário ${email} ausente`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(permissoesPorCargo[cargo] as Permissao[]))]
    );
  }

  const chamar = (
    method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT",
    url: string,
    payload?: object,
    cookie = cookieDp
  ) => contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

  async function processoAprovado(id: string, empresaId: string, turnoId: string, funcaoId: string, cpf: string) {
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       values ($1, $2, 'admissao_direta', null, 'Pessoa Ficticia Exportacao', $3, $4, $5, $6, $6) on conflict do nothing`,
      [id, empresaId, cpf, funcaoId, turnoId, usuarioId]
    );
    await executarSql(
      `insert into admissoes_processos_internos (empresa_id, processo_id, data_admissao, ctps_numero, ctps_serie, ctps_uf, pis_pasep_nit)
       values ($1, $2, '2026-10-01', '1234567', '0001', 'MG', '12345678901') on conflict do nothing`,
      [empresaId, id]
    );
    await executarSql(
      `insert into admissoes_processos_ficha
         (empresa_id, processo_id, situacao, versao, nascimento, sexo, estado_civil, raca_cor, nacionalidade, nome_mae,
          cep, logradouro, numero, bairro, municipio, uf, telefone, sem_dependentes,
          enviado_em, revisado_em, revisado_por, aviso_aceito_em, aviso_privacidade_versao)
       values ($1, $2, 'aprovada', 3, '1998-02-02', 'Feminino', 'Solteira', 'Parda', 'Brasileira', 'Mae Ficticia',
          '36037467', 'Rua Ficticia', '100', 'Centro', 'Cidade Ficticia', 'MG', '32999990000', true,
          now(), now(), $3, now(), 'v1')
       on conflict do nothing`,
      [empresaId, id, usuarioId]
    );
  }

  async function vinculo(p: {
    processo: string;
    colaborador: string;
    vinculo: string;
    empresaId: string;
    funcaoId: string;
    turnoId: string;
    nome: string;
    numero: number;
    cpf: string;
    codigo: string | null;
  }) {
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       values ($1, $2, 'admissao_direta', null, $3, $4, $5, $6, $7, $7) on conflict do nothing`,
      [p.processo, p.empresaId, p.nome, p.cpf, p.funcaoId, p.turnoId, usuarioId]
    );
    await executarSql(`insert into colaboradores (id, empresa_id, nome) values ($1, $2, $3) on conflict do nothing`, [
      p.colaborador,
      p.empresaId,
      p.nome
    ]);
    await executarSql(
      `insert into colaboradores_vinculos
         (id, empresa_id, colaborador_id, processo_id, numero_sequencial, matricula, admitido_em,
          funcao_id, funcao_nome, jornada_horario, criado_por, questor_codigo_contrato)
       values ($1, $2, $3, $4, $5, $6, '2026-09-01', $7, 'Funcao Ficticia', '06:00-14:00', $8, $9) on conflict do nothing`,
      [
        p.vinculo,
        p.empresaId,
        p.colaborador,
        p.processo,
        p.numero,
        `EXP-${String(p.numero).padStart(6, "0")}`,
        p.funcaoId,
        usuarioId,
        p.codigo
      ]
    );
  }

  function ligarGates(ligados: boolean) {
    (env as { CONPLUS_QUESTOR_EXPORT_ENABLED: boolean }).CONPLUS_QUESTOR_EXPORT_ENABLED = ligados;
    (env as { CONPLUS_QUESTOR_EXPORT_HOMOLOGADA: boolean }).CONPLUS_QUESTOR_EXPORT_HOMOLOGADA = ligados;
  }

  const exportacoesDaEmpresa = () =>
    consultarTodos<{
      id: string;
      tipo: string;
      resultado: string;
      caminho_arquivo: string | null;
      sha256: string;
      motivo_regeracao: string | null;
    }>(
      `select id, tipo, resultado, caminho_arquivo, sha256, motivo_regeracao from questor_exportacoes
        where empresa_id = $1 order by criado_em`,
      [idsTeste.empresaA]
    );

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await vestir(usuariosTeste.caixa.email, "DP");
    await vestir(usuariosTeste.gerente.email, "Gerencia");
    cookieDp = await cookieSessao(contexto.app, "caixa");
    cookieGerencia = await cookieSessao(contexto.app, "gerente");
    usuarioId = (await consultarUm<{ usuario_id: string }>("select usuario_id from perfis_usuarios limit 1"))!
      .usuario_id;

    for (const [turno, empresa] of [
      [ids.turnoA, idsTeste.empresaA],
      [ids.turnoB, idsTeste.empresaB]
    ] as const) {
      await executarSql(
        `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
         values ($1, $2, 'Turno Exportacao', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
        [turno, empresa]
      );
    }
    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao Exportacao B') on conflict do nothing`,
      [ids.funcaoB, idsTeste.empresaB]
    );
    await processoAprovado(ids.processoTxt, idsTeste.empresaA, ids.turnoA, idsTeste.funcaoOperacionalA, "98765432100");
    await processoAprovado(ids.processoB, idsTeste.empresaB, ids.turnoB, ids.funcaoB, "39053344705");

    const baseA = { empresaId: idsTeste.empresaA, funcaoId: idsTeste.funcaoOperacionalA, turnoId: ids.turnoA };
    await vinculo({
      ...baseA,
      processo: ids.processoV1,
      colaborador: ids.colaborador1,
      vinculo: ids.vinculo1,
      nome: "Ana Ficticia",
      numero: 970001,
      cpf: "52998224725",
      codigo: "120"
    });
    await vinculo({
      ...baseA,
      processo: ids.processoV2,
      colaborador: ids.colaborador2,
      vinculo: ids.vinculo2,
      nome: "Bruno Ficticio",
      numero: 970002,
      cpf: "11144477735",
      codigo: null
    });
    await vinculo({
      empresaId: idsTeste.empresaB,
      funcaoId: ids.funcaoB,
      turnoId: ids.turnoB,
      processo: ids.processoVB,
      colaborador: ids.colaboradorB,
      vinculo: ids.vinculoB,
      nome: "Carla Ficticia",
      numero: 970003,
      cpf: "86288366757",
      codigo: "120"
    });

    await executarSql(
      `insert into questor_exportacoes (id, empresa_id, tipo, layout_versao, sha256, chave_idempotencia, resultado, nome_arquivo, caminho_arquivo, gerado_por)
       values ($1, $2, 'admissao', 'questor-admissao-v2', $3, 'previa:outra-empresa', 'previa', 'outra.txt', 'questor-exportacoes/x/y.txt', $4)`,
      [ids.exportacaoB, idsTeste.empresaB, "f".repeat(64), usuarioId]
    );
  }, 180_000);

  afterEach(() => ligarGates(false));

  afterAll(async () => {
    ligarGates(false);
    const empresas = [idsTeste.empresaA, idsTeste.empresaB];
    await executarSql("delete from questor_auditoria where empresa_id = any($1::uuid[])", [empresas]);
    await executarSql("delete from questor_exportacoes_eventos_variaveis where empresa_id = any($1::uuid[])", [
      empresas
    ]);
    await executarSql("delete from questor_exportacoes_admissoes where empresa_id = any($1::uuid[])", [empresas]);
    await executarSql("delete from questor_exportacoes where empresa_id = any($1::uuid[])", [empresas]);
    await executarSql("delete from questor_eventos_variaveis_lancamentos where empresa_id = any($1::uuid[])", [
      empresas
    ]);
    await executarSql("delete from questor_eventos_variaveis where empresa_id = any($1::uuid[])", [empresas]);
    await executarSql("delete from questor_configuracoes where empresa_id = any($1::uuid[])", [empresas]);
    await executarSql("delete from colaboradores_vinculos where id = any($1::uuid[])", [
      [ids.vinculo1, ids.vinculo2, ids.vinculoB]
    ]);
    await executarSql("delete from colaboradores where id = any($1::uuid[])", [
      [ids.colaborador1, ids.colaborador2, ids.colaboradorB]
    ]);
    await executarSql("delete from admissoes_processos where id = any($1::uuid[])", [
      [ids.processoTxt, ids.processoB, ids.processoV1, ids.processoV2, ids.processoVB]
    ]);
    await executarSql("delete from turnos where id = any($1::uuid[])", [[ids.turnoA, ids.turnoB]]);
    await executarSql("delete from funcoes_operacionais where id = $1", [ids.funcaoB]);
    // Só a pasta das empresas FICTÍCIAS da suíte: o storage real nunca é tocado.
    for (const empresa of empresas) {
      await rm(caminhoAbsolutoDocumento(`questor-exportacoes/${empresa}`), { recursive: true, force: true });
    }
    await contexto.fechar();
  });

  // --- TXT de admissão --------------------------------------------------------------------------------

  describe("TXT de admissão", () => {
    let exportacaoTecnicaId = "";

    it("prévia: mostra pendências oficiais, avisa o bloqueio e não grava nada", async () => {
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesPrevia, {
        processoIds: [ids.processoTxt]
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      const previa = resposta.json().data as QuestorExportacaoPreviaDto;
      expect(previa).toMatchObject({ exportacaoDisponivel: false, bloqueio: ERROS_EXPORTACAO_QUESTOR.naoHomologada });
      expect(previa.registros[0]).toMatchObject({
        processoId: ids.processoTxt,
        fichaAprovada: true,
        situacao: "bloqueado"
      });
      expect(previa.registros[0]!.quantidadeLinhas).toBe(3);
      expect(previa.registros[0]!.diagnosticos).toContain("A.CATEGORIA: CATEGORIA é requerido pela documentação");
      expect(await exportacoesDaEmpresa()).toHaveLength(0);
    });

    it("arquivo técnico: TXT A/B/C com CRLF, nome NÃO-IMPORTAR, SHA no cabeçalho, auditoria e arquivo no storage", async () => {
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt],
        confirmacaoArquivoTecnico: true
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      expect(resposta.headers["content-type"]).toBe("text/plain; charset=utf-8");
      expect(resposta.headers["content-disposition"]).toMatch(
        /^attachment; filename="TECNICO-NAO-IMPORTAR-admissao-questor-[0-9a-f]{12}\.txt"$/u
      );
      expect(resposta.headers["x-questor-sha256"]).toBe(sha(resposta.rawPayload));
      expect(resposta.headers["x-questor-reutilizado"]).toBe("false");
      const linhas = resposta.body.split("\r\n");
      expect(linhas.slice(0, 3).map((linha) => linha.split(";")[0])).toEqual(["A", "B", "C"]);
      expect(linhas.at(-1)).toBe("");
      expect(resposta.body).not.toMatch(/[^\r]\n/u);

      const [registro] = await exportacoesDaEmpresa();
      expect(registro).toMatchObject({ tipo: "admissao", resultado: "previa", sha256: sha(resposta.rawPayload) });
      exportacaoTecnicaId = registro!.id;
      expect(resposta.headers["x-questor-exportacao-id"]).toBe(exportacaoTecnicaId);
      const vinculos = await consultarTodos(
        "select processo_id from questor_exportacoes_admissoes where exportacao_id = $1",
        [exportacaoTecnicaId]
      );
      expect(vinculos).toEqual([{ processo_id: ids.processoTxt }]);
      expect(await readFile(caminhoAbsolutoDocumento(registro!.caminho_arquivo!))).toEqual(resposta.rawPayload);
    });

    it("idempotência: o mesmo conteúdo devolve o registro existente, sem nova linha de auditoria", async () => {
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt],
        confirmacaoArquivoTecnico: true
      });
      expect(resposta.statusCode).toBe(200);
      expect(resposta.headers["x-questor-reutilizado"]).toBe("true");
      expect(resposta.headers["x-questor-exportacao-id"]).toBe(exportacaoTecnicaId);
      expect(await exportacoesDaEmpresa()).toHaveLength(1);
    });

    it("histórico + novo download: mesmos bytes e SHA conferido contra a auditoria", async () => {
      const historico = await chamar("GET", `${ROTAS_EXPORTACAO_QUESTOR.historico}?tipo=admissao`);
      expect(historico.statusCode).toBe(200);
      const itens = historico.json().data as QuestorExportacaoHistoricoDto[];
      expect(itens.find((item) => item.id === exportacaoTecnicaId)).toMatchObject({
        resultado: "previa",
        temArquivo: true,
        geradoPorNome: expect.any(String)
      });
      expect(itens.some((item) => item.id === ids.exportacaoB)).toBe(false);

      // Técnico pelo histórico também exige a confirmação explícita (o servidor confere).
      const semConfirmacao = await chamar("GET", arquivoUrl(exportacaoTecnicaId));
      expect(semConfirmacao.statusCode).toBe(422);
      expect(semConfirmacao.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.confirmacaoTecnicoObrigatoria);
      const download = await chamar("GET", tecnicoUrl(exportacaoTecnicaId));
      expect(download.statusCode).toBe(200);
      expect(download.headers["x-questor-sha256"]).toBe(sha(download.rawPayload));
      expect(download.headers["content-disposition"]).toContain("TECNICO-NAO-IMPORTAR-");
    });

    it("oficial com gates desligados: 422 de homologação e nada gravado", async () => {
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesDownload, {
        processoIds: [ids.processoTxt]
      });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.naoHomologada);
      expect(await exportacoesDaEmpresa()).toHaveLength(1);
    });

    it("oficial com gates ligados e pendências: 422 inválida e tentativa registrada como bloqueada, sem arquivo", async () => {
      ligarGates(true);
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesDownload, {
        processoIds: [ids.processoTxt]
      });
      expect(resposta.statusCode).toBe(422);
      expect(resposta.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.invalida);
      const bloqueada = (await exportacoesDaEmpresa()).find((item) => item.resultado === "bloqueado");
      expect(bloqueada).toMatchObject({ tipo: "admissao", caminho_arquivo: null });
      const semArquivo = await chamar("GET", arquivoUrl(bloqueada!.id));
      expect(semArquivo.statusCode).toBe(404);
      expect(semArquivo.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.arquivoAusente);
    });

    it("dados inválidos e outra empresa: ids repetidos 400, processo de outra empresa 422, arquivo de outra empresa 404", async () => {
      const repetido = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt, ids.processoTxt],
        confirmacaoArquivoTecnico: true
      });
      expect(repetido.statusCode).toBe(400);
      const outraEmpresa = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoB],
        confirmacaoArquivoTecnico: true
      });
      expect(outraEmpresa.statusCode).toBe(422);
      expect(outraEmpresa.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.processoNaoExportavel);
      expect((await chamar("GET", arquivoUrl(ids.exportacaoB))).statusCode).toBe(404);
      expect((await chamar("GET", arquivoUrl("nao-e-uuid"))).statusCode).toBe(400);
      const comEmpresa = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt],
        empresaId: idsTeste.empresaB
      });
      expect(comEmpresa.statusCode).toBe(400);
    });

    it("arquivo apagado do storage responde 404; arquivo adulterado responde 409", async () => {
      const [registro] = await exportacoesDaEmpresa();
      const caminho = caminhoAbsolutoDocumento(registro!.caminho_arquivo!);
      const original = await readFile(caminho);
      await writeFile(caminho, "adulterado");
      const adulterado = await chamar("GET", tecnicoUrl(registro!.id));
      expect(adulterado.statusCode).toBe(409);
      await rm(caminho);
      const apagado = await chamar("GET", tecnicoUrl(registro!.id));
      expect(apagado.statusCode).toBe(404);
      await writeFile(caminho, original);
    });

    it("permissões: Gerência 403 em todas as rotas; sem sessão 401", async () => {
      for (const [metodo, url] of [
        ["POST", ROTAS_EXPORTACAO_QUESTOR.admissoesPrevia],
        ["POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico],
        ["POST", ROTAS_EXPORTACAO_QUESTOR.admissoesDownload],
        ["GET", ROTAS_EXPORTACAO_QUESTOR.historico],
        ["GET", arquivoUrl(exportacaoTecnicaId)]
      ] as const) {
        const resposta = await chamar(
          metodo,
          url,
          metodo === "POST" ? { processoIds: [ids.processoTxt] } : undefined,
          cookieGerencia
        );
        expect(resposta.statusCode, `${metodo} ${url}`).toBe(403);
        const anonimo = await contexto.app.inject({
          method: metodo,
          url,
          ...(metodo === "POST" ? { payload: { processoIds: [ids.processoTxt] } } : {})
        });
        expect(anonimo.statusCode, `${metodo} ${url}`).toBe(401);
      }
    });
  });

  // --- Eventos variáveis: layout oficial (EventoVariavel.nli) -----------------------------------------

  describe("eventos variáveis — layout oficial da Conplus", () => {
    let eventoHoras = "";
    let eventoValor = "";
    let lancamentos: QuestorLancamentoVariavelDto[] = [];
    const pedido = () => ({
      competencia,
      codigoPeriodoCalculo: "2610",
      sequenciaInicial: 99,
      lancamentoIds: lancamentos.map((item) => item.id)
    });

    it("catálogo: cria, recusa duplicado, código acima de 5 dígitos e unidade inválida, desativa e reativa", async () => {
      const horas = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventos, {
        codigo: "901",
        descricao: "Hora extra ficticia",
        unidades: ["H"]
      });
      expect(horas.statusCode, horas.body).toBe(201);
      eventoHoras = horas.json().data.id;
      const valor = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventos, {
        codigo: "902",
        descricao: "Premio ficticio",
        unidades: ["V"]
      });
      eventoValor = valor.json().data.id;
      for (const [corpo, status] of [
        [{ codigo: "901", descricao: "x", unidades: ["H"] }, 409],
        [{ codigo: "903", descricao: "x", unidades: ["X"] }, 400],
        [{ codigo: "903", descricao: "a;b", unidades: ["V"] }, 400],
        [{ codigo: "123456", descricao: "x", unidades: ["V"] }, 400]
      ] as const) {
        expect((await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventos, corpo)).statusCode, JSON.stringify(corpo)).toBe(
          status
        );
      }

      const evento = ROTAS_EXPORTACAO_QUESTOR.evento.replace(":id", eventoValor);
      expect((await chamar("PATCH", evento, { ativo: false })).json().data.ativo).toBe(false);
      const inativo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentos, {
        competencia,
        vinculoId: ids.vinculo1,
        eventoId: eventoValor,
        unidade: "V",
        valor: "150"
      });
      expect(inativo.statusCode).toBe(422);
      expect((await chamar("PATCH", evento, { ativo: true })).json().data.ativo).toBe(true);
    });

    it("importa o catálogo oficial da Conplus: lista empresas, compara, grava só os novos e aponta divergência", async () => {
      const conteudo = readFileSync(
        fileURLToPath(
          new URL("../../fixtures/conplus-oficial/eventos/eventos_variaveis_por_empresa.csv", import.meta.url)
        ),
        "utf8"
      );
      // Código que já existe com outra descrição: nunca é sobrescrito.
      await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventos, {
        codigo: "36",
        descricao: "Cadastro manual",
        unidades: ["H"]
      });

      const empresas = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, { conteudo });
      expect(empresas.statusCode, empresas.body).toBe(200);
      expect(empresas.json().data.empresas).toEqual([
        "BURPIZ LTDA",
        "COMERCIAL LISBOA ALIMENTOS LTDA",
        "COMERCIAL TUDONUPAO LTDA"
      ]);

      expect(empresas.json().data.empresaConfigurada).toBeNull();

      const empresaConplus = "COMERCIAL TUDONUPAO LTDA";
      // Sem razão social configurada, o servidor não adivinha qual empresa do arquivo é esta.
      const semIdentidade = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, {
        conteudo,
        empresaConplus
      });
      expect(semIdentidade.statusCode).toBe(422);
      expect(semIdentidade.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.catalogoSemIdentidade);
      await executarSql(
        `insert into questor_configuracoes (empresa_id, razao_social_questor) values ($1, 'Comercial  Tudonupão Ltda')
         on conflict (empresa_id) do update set razao_social_questor = excluded.razao_social_questor`,
        [idsTeste.empresaA]
      );
      // Catálogo de OUTRA empresa do mesmo arquivo: recusado no servidor e registrado na auditoria.
      const outra = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, {
        conteudo,
        empresaConplus: "BURPIZ LTDA",
        confirmar: true
      });
      expect(outra.statusCode).toBe(422);
      expect(outra.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.catalogoOutraEmpresa);
      const recusa = await consultarUm<{ detalhes: { empresaArquivo: string } }>(
        "select detalhes from questor_auditoria where empresa_id = $1 and acao = 'recusa_catalogo'",
        [idsTeste.empresaA]
      );
      expect(recusa?.detalhes.empresaArquivo).toBe("BURPIZ LTDA");
      expect(
        (
          await consultarUm<{ n: number }>(
            "select count(*)::int n from questor_eventos_variaveis where empresa_id = $1 and codigo = '800'",
            [idsTeste.empresaA]
          )
        )?.n
      ).toBe(0);

      const previa = (
        await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, { conteudo, empresaConplus })
      ).json().data as QuestorCatalogoImportacaoDto;
      expect(previa.gravados).toBe(0);
      expect(previa.itens).toHaveLength(14);
      expect(previa.itens.find((item) => item.codigo === "36")).toMatchObject({ situacao: "divergente" });
      expect(previa.itens.filter((item) => item.situacao === "novo")).toHaveLength(13);

      const gravada = (
        await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, { conteudo, empresaConplus, confirmar: true })
      ).json().data as QuestorCatalogoImportacaoDto;
      expect(gravada.gravados).toBe(13);
      const premio = await consultarUm<{ unidades: string[]; natureza: string; sequencia_questor: number }>(
        "select unidades, natureza, sequencia_questor from questor_eventos_variaveis where empresa_id = $1 and codigo = '708'",
        [idsTeste.empresaA]
      );
      expect(premio).toEqual({ unidades: ["V"], natureza: "Provento", sequencia_questor: 1 });

      const deNovo = (
        await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, { conteudo, empresaConplus, confirmar: true })
      ).json().data as QuestorCatalogoImportacaoDto;
      expect(deNovo.gravados).toBe(0);
      expect(
        (await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, { conteudo, empresaConplus: "OUTRA LTDA" }))
          .statusCode
      ).toBe(422);
    });

    it("lançamentos: valida competência, unidade, valor (até 2 casas), duplicidade e empresa", async () => {
      const lancar = (corpo: object) =>
        chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentos, { competencia, unidade: "H", ...corpo });
      expect((await lancar({ vinculoId: ids.vinculo1, eventoId: eventoHoras, valor: "1.30" })).statusCode).toBe(201);
      expect(
        (await lancar({ vinculoId: ids.vinculo1, eventoId: eventoValor, unidade: "V", valor: "150.5" })).statusCode
      ).toBe(201);
      expect((await lancar({ vinculoId: ids.vinculo2, eventoId: eventoHoras, valor: "2" })).statusCode).toBe(201);

      expect((await lancar({ vinculoId: ids.vinculo1, eventoId: eventoHoras, valor: "3" })).statusCode).toBe(409);
      expect((await lancar({ vinculoId: ids.vinculo1, eventoId: eventoValor, valor: "1" })).statusCode).toBe(422);
      expect((await lancar({ vinculoId: ids.vinculoB, eventoId: eventoHoras, valor: "1" })).statusCode).toBe(404);
      for (const invalido of [
        { vinculoId: ids.vinculo1, eventoId: eventoHoras, valor: "1,30" },
        { vinculoId: ids.vinculo1, eventoId: eventoHoras, valor: "0" },
        { vinculoId: ids.vinculo1, eventoId: eventoHoras, valor: "1.255" },
        { vinculoId: ids.vinculo1, eventoId: eventoHoras, valor: "1", competencia: "2026-10-15" }
      ]) {
        expect((await lancar(invalido)).statusCode, JSON.stringify(invalido)).toBe(400);
      }

      const lista = await chamar("GET", `${ROTAS_EXPORTACAO_QUESTOR.lancamentos}?competencia=${competencia}`);
      lancamentos = lista.json().data as QuestorLancamentoVariavelDto[];
      expect(lancamentos.map((item) => [item.colaboradorNome, item.eventoCodigo, item.valor])).toEqual([
        ["Ana Ficticia", "901", "1.3000"],
        ["Ana Ficticia", "902", "150.5000"],
        ["Bruno Ficticio", "901", "2.0000"]
      ]);
      expect(lancamentos.every((item) => item.exportado === false)).toBe(true);
    });

    it("prévia: período inválido é 400; aponta código da empresa, hora centesimal e contrato que faltam", async () => {
      const semPeriodo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, {
        ...pedido(),
        codigoPeriodoCalculo: "10/2026"
      });
      expect(semPeriodo.statusCode).toBe(400);
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, pedido());
      expect(resposta.statusCode, resposta.body).toBe(200);
      const previa = resposta.json().data as QuestorEventosVariaveisPreviaDto;
      expect(previa).toMatchObject({ valido: false, conteudo: "", linhas: [] });
      expect(previa.pendencias).toEqual([
        "Informe o código da empresa no Questor em Configuração Questor",
        'Configure "Utiliza Hora Centesimal" da empresa em Configuração Questor',
        "Bruno Ficticio (EXP-970002): sem código de contrato Questor (Configuração Questor → Contratos no Questor)"
      ]);
    });

    it("prévia válida: uma linha por evento, 13 colunas, sequência por contrato, igual ao layout oficial", async () => {
      await executarSql(
        `insert into questor_configuracoes (empresa_id, utiliza_hora_centesimal, codigo_empresa_questor) values ($1, false, 510)
         on conflict (empresa_id) do update set utiliza_hora_centesimal = false, codigo_empresa_questor = 510`,
        [idsTeste.empresaA]
      );
      const contratos = await chamar("GET", ROTAS_QUESTOR.contratosColaboradores);
      const bruno = (contratos.json().data as Array<{ vinculoId: string; atualizadoEm: string }>).find(
        (item) => item.vinculoId === ids.vinculo2
      )!;
      const salvo = await chamar("PUT", ROTAS_QUESTOR.contratoColaborador.replace(":id", ids.vinculo2), {
        questorCodigoContrato: "45",
        atualizadoEmLido: bruno.atualizadoEm
      });
      expect(salvo.statusCode, salvo.body).toBe(200);

      const previa = (await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, pedido())).json()
        .data as QuestorEventosVariaveisPreviaDto;
      expect(previa).toMatchObject({
        valido: true,
        pendencias: [],
        diagnosticos: [],
        quantidadeContratos: 2,
        exportacaoDisponivel: false
      });
      expect(previa.conteudo).toBe(
        [
          "E;510;2610;99;45;901;2,00;0,00;;;;;0;",
          "E;510;2610;99;120;901;1,30;0,00;;;;;0;",
          "E;510;2610;100;120;902;0,00;150,50;;;;;0;",
          ""
        ].join("\r\n")
      );
      expect(validarArquivoEventosVariaveis(previa.conteudo)).toEqual([]);
    });

    it("arquivo técnico: mesmo conteúdo da prévia, nome NÃO-IMPORTAR, auditoria 'previa' e nenhuma sequência reservada", async () => {
      const previa = (await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, pedido())).json()
        .data as QuestorEventosVariaveisPreviaDto;
      const tecnico = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosTecnico, {
        ...pedido(),
        confirmacaoArquivoTecnico: true
      });
      expect(tecnico.statusCode, tecnico.body).toBe(200);
      expect(tecnico.body).toBe(previa.conteudo);
      expect(tecnico.headers["content-disposition"]).toMatch(
        /filename="TECNICO-NAO-IMPORTAR-Eventos 510 - 10-2026\.csv"/u
      );
      const id = tecnico.headers["x-questor-exportacao-id"] as string;
      const linhas = await consultarTodos<{ sequencia: number | null }>(
        "select sequencia from questor_exportacoes_eventos_variaveis where exportacao_id = $1",
        [id]
      );
      expect(linhas.map((linha) => linha.sequencia)).toEqual([null, null, null]);
      // Nada reservado: a prévia continua igual e os lançamentos não contam como exportados.
      const depois = (await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, pedido())).json()
        .data as QuestorEventosVariaveisPreviaDto;
      expect(depois).toMatchObject({ conteudo: previa.conteudo, jaExportados: 0 });
    });

    it("oficial: bloqueado sem gates; com gates grava linhas com a chave do Questor; repetir devolve o mesmo arquivo", async () => {
      const bloqueada = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, pedido());
      expect(bloqueada.statusCode).toBe(422);
      expect(bloqueada.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.naoHomologada);

      ligarGates(true);
      const gerada = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, pedido());
      expect(gerada.statusCode, gerada.body).toBe(200);
      expect(gerada.headers["content-type"]).toBe("text/csv; charset=utf-8");
      expect(gerada.headers["content-disposition"]).toMatch(/filename="Eventos 510 - 10-2026\.csv"/u);
      expect(gerada.headers["x-questor-sha256"]).toBe(sha(gerada.rawPayload));
      expect(gerada.body.split("\r\n")[0]).toBe("E;510;2610;99;45;901;2,00;0,00;;;;;0;");
      const id = gerada.headers["x-questor-exportacao-id"] as string;
      const registro = await consultarUm<{ resultado: string; competencia: string; codigo_periodo_calculo: string }>(
        "select resultado, competencia::text, codigo_periodo_calculo from questor_exportacoes where id = $1",
        [id]
      );
      expect(registro).toEqual({ resultado: "gerado", competencia, codigo_periodo_calculo: "2610" });
      const linhas = await consultarTodos<{
        codigo_contrato: string;
        sequencia: number;
        codigo_periodo_calculo: string;
      }>(
        `select codigo_contrato, sequencia, codigo_periodo_calculo from questor_exportacoes_eventos_variaveis
          where exportacao_id = $1 order by codigo_contrato::int, sequencia`,
        [id]
      );
      expect(linhas).toEqual([
        { codigo_contrato: "45", sequencia: 99, codigo_periodo_calculo: "2610" },
        { codigo_contrato: "120", sequencia: 99, codigo_periodo_calculo: "2610" },
        { codigo_contrato: "120", sequencia: 100, codigo_periodo_calculo: "2610" }
      ]);

      const repetida = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, pedido());
      expect(repetida.statusCode).toBe(200);
      expect(repetida.headers["x-questor-reutilizado"]).toBe("true");
      expect(repetida.headers["x-questor-exportacao-id"]).toBe(id);
      expect(repetida.rawPayload).toEqual(gerada.rawPayload);

      const download = await chamar("GET", arquivoUrl(id));
      expect(download.rawPayload).toEqual(gerada.rawPayload);
      const lista = await chamar("GET", `${ROTAS_EXPORTACAO_QUESTOR.lancamentos}?competencia=${competencia}`);
      expect((lista.json().data as QuestorLancamentoVariavelDto[]).every((item) => item.exportado)).toBe(true);
    });

    it("reexportação: sem motivo 409; com motivo gera com sequência NOVA (a chave do Questor não se repete)", async () => {
      ligarGates(true);
      const corpo = { ...pedido(), lancamentoIds: [lancamentos[0]!.id] };
      const semMotivo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, corpo);
      expect(semMotivo.statusCode).toBe(409);
      expect(semMotivo.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.jaExportado);
      const comMotivo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, {
        ...corpo,
        motivoRegeracao: "Questor rejeitou o arquivo anterior"
      });
      expect(comMotivo.statusCode, comMotivo.body).toBe(200);
      expect(comMotivo.body).toBe("E;510;2610;101;120;901;1,30;0,00;;;;;0;\r\n");
      const registro = await consultarUm<{ motivo_regeracao: string }>(
        "select motivo_regeracao from questor_exportacoes where id = $1",
        [comMotivo.headers["x-questor-exportacao-id"]]
      );
      expect(registro?.motivo_regeracao).toBe("Questor rejeitou o arquivo anterior");
    });

    it("o banco recusa a mesma chave do Questor (empresa + período + contrato + sequência) em dois arquivos", async () => {
      const [linha] = await consultarTodos<{ exportacao_id: string; lancamento_id: string }>(
        `select exportacao_id, lancamento_id from questor_exportacoes_eventos_variaveis
          where empresa_id = $1 and codigo_contrato = '45' and sequencia = 99`,
        [idsTeste.empresaA]
      );
      const outra = (await exportacoesDaEmpresa()).find((item) => item.tipo === "admissao")!;
      await expect(
        executarSql(
          `insert into questor_exportacoes_eventos_variaveis
             (exportacao_id, lancamento_id, empresa_id, codigo_periodo_calculo, codigo_contrato, sequencia)
           values ($1, $2, $3, '2610', '45', 99)`,
          [outra.id, linha!.lancamento_id, idsTeste.empresaA]
        )
      ).rejects.toThrow(/questor_exportacoes_eventos_chave_questor_unica/u);
    });

    // --- Achados da auditoria independente -------------------------------------------------------------

    const exportacaoCompleta = () =>
      consultarUm<{ id: string; caminho_arquivo: string }>(
        `select e.id, e.caminho_arquivo from questor_exportacoes e
          where e.empresa_id = $1 and e.tipo = 'eventos_variaveis' and e.resultado = 'gerado'
            and (select count(*) from questor_exportacoes_eventos_variaveis l where l.exportacao_id = e.id) = 3`,
        [idsTeste.empresaA]
      );

    it("período com zero à esquerda é o mesmo período: '02610' reaproveita o arquivo de '2610' (M1)", async () => {
      ligarGates(true);
      const original = await exportacaoCompleta();
      const resposta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, {
        ...pedido(),
        codigoPeriodoCalculo: "02610"
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      expect(resposta.headers["x-questor-reutilizado"]).toBe("true");
      expect(resposta.headers["x-questor-exportacao-id"]).toBe(original!.id);
    });

    it("reaproveitamento confere o SHA: adulterado responde 409; apagado responde 404 sem gerar outro (M2, B6)", async () => {
      ligarGates(true);
      const original = await exportacaoCompleta();
      const caminho = caminhoAbsolutoDocumento(original!.caminho_arquivo);
      const bytes = await readFile(caminho);
      const antes = (await exportacoesDaEmpresa()).length;
      await writeFile(caminho, "E;510;2610;1;1;1;9,99;0,00;;;;;0;\r\n");
      const adulterado = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, pedido());
      expect(adulterado.statusCode).toBe(409);
      await rm(caminho);
      const apagado = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, pedido());
      expect(apagado.statusCode).toBe(404);
      expect(apagado.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.arquivoAusente);
      expect((await exportacoesDaEmpresa()).length).toBe(antes);
      await writeFile(caminho, bytes);
    });

    it("sequência inicial acima do integer é 400 (M5); técnico com a exportação homologada é 422 (M4)", async () => {
      const alta = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, {
        ...pedido(),
        sequenciaInicial: 3_000_000_000
      });
      expect(alta.statusCode).toBe(400);
      ligarGates(true);
      const tecnico = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosTecnico, {
        ...pedido(),
        confirmacaoArquivoTecnico: true
      });
      expect(tecnico.statusCode).toBe(422);
      expect(tecnico.json().code).toBe("QUESTOR_ARQUIVO_TECNICO_ENCERRADO");
    });

    it("código de evento com zero à esquerda é o mesmo evento (B4); catálogo com linha inválida não grava nada (B1, B2)", async () => {
      expect(
        (await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventos, { codigo: "0901", descricao: "x", unidades: ["H"] }))
          .statusCode
      ).toBe(409);
      const conteudo =
        readFileSync(
          fileURLToPath(
            new URL("../../fixtures/conplus-oficial/eventos/eventos_variaveis_por_empresa.csv", import.meta.url)
          ),
          "utf8"
        ) + "COMERCIAL TUDONUPAO LTDA;9999;Evento com sequencia zero;0;1;Valor;V;Provento\r\n";
      const previa = (
        await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, {
          conteudo,
          empresaConplus: "COMERCIAL TUDONUPAO LTDA"
        })
      ).json().data as QuestorCatalogoImportacaoDto;
      expect(previa.erros).toEqual([expect.stringContaining("sequência e filial devem ser números maiores que zero")]);
      const gravar = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar, {
        conteudo,
        empresaConplus: "COMERCIAL TUDONUPAO LTDA",
        confirmar: true
      });
      expect(gravar.statusCode).toBe(422);
      expect(gravar.json().code).toBe("QUESTOR_CATALOGO_INVALIDO");
    });

    it("histórico filtra por tipo e respeita a permissão de quem pede (B12)", async () => {
      const eventos = (await chamar("GET", `${ROTAS_EXPORTACAO_QUESTOR.historico}?tipo=eventos_variaveis`)).json()
        .data as QuestorExportacaoHistoricoDto[];
      expect(eventos.length).toBeGreaterThan(0);
      expect(
        eventos.every((item) => item.tipo === "eventos_variaveis" && item.codigoPeriodoCalculo !== undefined)
      ).toBe(true);
      expect((await chamar("GET", ROTAS_EXPORTACAO_QUESTOR.historico, undefined, cookieGerencia)).statusCode).toBe(403);
    });

    it("lançamento exportado não pode ser apagado; o não exportado pode", async () => {
      const exportado = await chamar("DELETE", ROTAS_EXPORTACAO_QUESTOR.lancamento.replace(":id", lancamentos[0]!.id));
      expect(exportado.statusCode).toBe(409);
      const novo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentos, {
        competencia: "2026-11-01",
        vinculoId: ids.vinculo1,
        eventoId: eventoValor,
        unidade: "V",
        valor: "10"
      });
      expect(novo.statusCode).toBe(201);
      const apagado = await chamar("DELETE", ROTAS_EXPORTACAO_QUESTOR.lancamento.replace(":id", novo.json().data.id));
      expect(apagado.statusCode).toBe(204);
      expect(
        (await chamar("DELETE", ROTAS_EXPORTACAO_QUESTOR.lancamento.replace(":id", novo.json().data.id))).statusCode
      ).toBe(404);
    });

    it("isolamento e permissões: lançamento de outra empresa 404; Gerência 403", async () => {
      const outro = await consultarUm<{ id: string }>(
        `insert into questor_eventos_variaveis (empresa_id, codigo, descricao, unidades, criado_por)
         values ($1, '901', 'Evento B', array['H'], $2) returning id`,
        [idsTeste.empresaB, usuarioId]
      );
      const lancamentoB = await consultarUm<{ id: string }>(
        `insert into questor_eventos_variaveis_lancamentos (empresa_id, competencia, vinculo_id, evento_id, unidade, valor, criado_por)
         values ($1, $2, $3, $4, 'H', 1, $5) returning id`,
        [idsTeste.empresaB, competencia, ids.vinculoB, outro!.id, usuarioId]
      );
      for (const rota of [ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, ROTAS_EXPORTACAO_QUESTOR.eventosTecnico]) {
        const resposta = await chamar("POST", rota, {
          ...pedido(),
          lancamentoIds: [lancamentos[0]!.id, lancamentoB!.id],
          ...(rota === ROTAS_EXPORTACAO_QUESTOR.eventosTecnico ? { confirmacaoArquivoTecnico: true } : {})
        });
        expect(resposta.statusCode, rota).toBe(404);
      }
      expect(
        (await chamar("DELETE", ROTAS_EXPORTACAO_QUESTOR.lancamento.replace(":id", lancamentoB!.id))).statusCode
      ).toBe(404);
      for (const [metodo, url] of [
        ["GET", ROTAS_EXPORTACAO_QUESTOR.eventos],
        ["GET", ROTAS_EXPORTACAO_QUESTOR.lancamentos],
        ["POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia],
        ["POST", ROTAS_EXPORTACAO_QUESTOR.eventosTecnico],
        ["POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload],
        ["POST", ROTAS_EXPORTACAO_QUESTOR.eventosImportar]
      ] as const) {
        const resposta = await chamar(metodo, url, metodo === "POST" ? pedido() : undefined, cookieGerencia);
        expect(resposta.statusCode, url).toBe(403);
      }
    });

    // --- Tarefa 15: bloqueios, arquivo técnico, cancelamento e auditoria --------------------------------

    const auditoria = (acao: string) =>
      consultarTodos<{ detalhes: Record<string, unknown>; exportacao_id: string | null }>(
        "select detalhes, exportacao_id from questor_auditoria where empresa_id = $1 and acao = $2 order by criado_em",
        [idsTeste.empresaA, acao]
      );

    it("estado dos bloqueios: reflete os gates do servidor; Gerência sem permissão recebe 403", async () => {
      const desligado = await chamar("GET", ROTAS_EXPORTACAO_QUESTOR.estado);
      expect(desligado.statusCode).toBe(200);
      expect(desligado.json().data).toMatchObject({
        oficialLiberado: false,
        gates: { exportacaoHabilitada: false, homologacaoConfirmada: false },
        tecnicoDisponivel: true,
        apiConplusDisponivel: false
      });
      ligarGates(true);
      expect((await chamar("GET", ROTAS_EXPORTACAO_QUESTOR.estado)).json().data).toMatchObject({
        oficialLiberado: true,
        tecnicoDisponivel: false,
        motivoBloqueio: null
      });
      expect((await chamar("GET", ROTAS_EXPORTACAO_QUESTOR.estado, undefined, cookieGerencia)).statusCode).toBe(403);
    });

    it("tentativa oficial sem homologação é recusada no servidor e fica na auditoria (TXT e eventos)", async () => {
      const antes = (await auditoria("recusa_homologacao")).length;
      const txt = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesDownload, { processoIds: [ids.processoTxt] });
      const eventos = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, pedido());
      expect([txt.statusCode, eventos.statusCode]).toEqual([422, 422]);
      const recusas = await auditoria("recusa_homologacao");
      expect(recusas.length - antes).toBe(2);
      expect(recusas.slice(-2).map((linha) => linha.detalhes["tipo"])).toEqual(["admissao", "eventos_variaveis"]);
    });

    it("arquivo técnico exige confirmação explícita no servidor; o download fica na auditoria com a confirmação", async () => {
      const semConfirmacao = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosTecnico, pedido());
      expect(semConfirmacao.statusCode).toBe(400);
      const txtSemConfirmacao = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt]
      });
      expect(txtSemConfirmacao.statusCode).toBe(400);
      const comConfirmacao = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt],
        confirmacaoArquivoTecnico: true
      });
      expect(comConfirmacao.statusCode).toBe(200);
      const ultimo = (await auditoria("download")).at(-1)!;
      expect(ultimo.exportacao_id).toBe(comConfirmacao.headers["x-questor-exportacao-id"]);
      expect(ultimo.detalhes).toMatchObject({ origem: "geracao", confirmacaoArquivoTecnico: true });
      // O conteúdo do técnico é o layout puro: nada foi inserido para "impedir" a importação.
      expect(comConfirmacao.body.split("\r\n")[0]!.startsWith("A;")).toBe(true);
      // Novo download pelo histórico também é auditado, com a confirmação.
      const historico = await chamar("GET", tecnicoUrl(comConfirmacao.headers["x-questor-exportacao-id"] as string));
      expect(historico.statusCode).toBe(200);
      expect((await auditoria("download")).at(-1)!.detalhes).toMatchObject({
        origem: "historico",
        confirmacaoArquivoTecnico: true
      });
    });

    it("lançamento só em arquivo técnico: apagar é 409; cancelar com motivo libera o evento para novo lançamento", async () => {
      const competenciaDez = "2026-12-01";
      const novo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentos, {
        competencia: competenciaDez,
        vinculoId: ids.vinculo2,
        eventoId: eventoHoras,
        unidade: "H",
        valor: "3"
      });
      expect(novo.statusCode, novo.body).toBe(201);
      const lancamentoId = novo.json().data.id as string;
      const tecnico = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosTecnico, {
        competencia: competenciaDez,
        codigoPeriodoCalculo: "2612",
        sequenciaInicial: 1,
        lancamentoIds: [lancamentoId],
        confirmacaoArquivoTecnico: true
      });
      expect(tecnico.statusCode, tecnico.body).toBe(200);

      const lista = (
        await chamar("GET", `${ROTAS_EXPORTACAO_QUESTOR.lancamentos}?competencia=${competenciaDez}`)
      ).json().data as QuestorLancamentoVariavelDto[];
      expect(lista.find((item) => item.id === lancamentoId)).toMatchObject({
        emArquivoTecnico: true,
        exportado: false
      });

      const apagar = await chamar("DELETE", ROTAS_EXPORTACAO_QUESTOR.lancamento.replace(":id", lancamentoId));
      expect(apagar.statusCode).toBe(409);
      expect(apagar.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.lancamentoEmArquivoTecnico);

      const cancelar = ROTAS_EXPORTACAO_QUESTOR.lancamentoCancelar.replace(":id", lancamentoId);
      expect((await chamar("POST", cancelar, { motivo: "x" })).statusCode).toBe(400);
      expect((await chamar("POST", cancelar, { motivo: "Valor lançado errado" })).statusCode).toBe(204);
      expect((await chamar("POST", cancelar, { motivo: "Valor lançado errado" })).statusCode).toBe(404);

      const depois = (
        await chamar("GET", `${ROTAS_EXPORTACAO_QUESTOR.lancamentos}?competencia=${competenciaDez}`)
      ).json().data as QuestorLancamentoVariavelDto[];
      expect(depois.some((item) => item.id === lancamentoId)).toBe(false);
      // O histórico continua apontando para o lançamento cancelado (nada foi apagado).
      const vinculo = await consultarUm<{ n: number }>(
        "select count(*)::int n from questor_exportacoes_eventos_variaveis where lancamento_id = $1",
        [lancamentoId]
      );
      expect(vinculo?.n).toBe(1);
      expect((await auditoria("cancelamento_lancamento")).at(-1)!.detalhes).toMatchObject({
        lancamentoId,
        motivo: "Valor lançado errado"
      });
      // Correção: o mesmo evento pode ser lançado de novo para o colaborador na competência.
      const corrigido = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentos, {
        competencia: competenciaDez,
        vinculoId: ids.vinculo2,
        eventoId: eventoHoras,
        unidade: "H",
        valor: "2.5"
      });
      expect(corrigido.statusCode, corrigido.body).toBe(201);
      // Cancelado não entra em arquivo.
      const comCancelado = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosPrevia, {
        competencia: competenciaDez,
        codigoPeriodoCalculo: "2612",
        sequenciaInicial: 1,
        lancamentoIds: [lancamentoId]
      });
      expect(comCancelado.statusCode).toBe(404);
    });

    it("lançamento de arquivo OFICIAL não pode ser cancelado nem apagado", async () => {
      const cancelar = await chamar(
        "POST",
        ROTAS_EXPORTACAO_QUESTOR.lancamentoCancelar.replace(":id", lancamentos[0]!.id),
        {
          motivo: "Tentativa indevida"
        }
      );
      expect(cancelar.statusCode).toBe(409);
      expect(cancelar.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.lancamentoExportado);
    });

    it("histórico não é atalho: oficial passa pelos gates e técnico encerra depois da homologação", async () => {
      const exportacoes = await exportacoesDaEmpresa();
      const oficial = exportacoes.find((item) => item.tipo === "eventos_variaveis" && item.resultado === "gerado");
      const tecnico = exportacoes.find((item) => item.tipo === "admissao" && item.resultado === "previa");
      expect(oficial && tecnico).toBeTruthy();

      const antes = (await auditoria("recusa_homologacao")).length;
      const oficialSemGates = await chamar("GET", arquivoUrl(oficial!.id));
      expect(oficialSemGates.statusCode).toBe(422);
      expect(oficialSemGates.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.naoHomologada);
      expect((await auditoria("recusa_homologacao")).length - antes).toBe(1);

      ligarGates(true);
      expect((await chamar("GET", arquivoUrl(oficial!.id))).statusCode).toBe(200);
      const tecnicoDepois = await chamar("GET", tecnicoUrl(tecnico!.id));
      expect(tecnicoDepois.statusCode).toBe(422);
      expect(tecnicoDepois.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.tecnicoEncerrado);
    });

    it("cancelar e gerar o oficial ao mesmo tempo: nunca termina cancelado E exportado", async () => {
      const competenciaJan = "2027-01-01";
      ligarGates(true);
      for (const valor of ["1", "2", "3"]) {
        const novo = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentos, {
          competencia: competenciaJan,
          vinculoId: ids.vinculo1,
          eventoId: eventoHoras,
          unidade: "H",
          valor
        });
        expect(novo.statusCode, novo.body).toBe(201);
        const lancamentoId = novo.json().data.id as string;
        const [gerar, cancelar] = await Promise.all([
          chamar("POST", ROTAS_EXPORTACAO_QUESTOR.eventosDownload, {
            competencia: competenciaJan,
            codigoPeriodoCalculo: "2701",
            sequenciaInicial: 1,
            lancamentoIds: [lancamentoId]
          }),
          chamar("POST", ROTAS_EXPORTACAO_QUESTOR.lancamentoCancelar.replace(":id", lancamentoId), {
            motivo: "Corrida de teste"
          })
        ]);
        const estado = await consultarUm<{ cancelado: boolean; oficial: number }>(
          `select l.cancelado_em is not null as cancelado,
                  (select count(*)::int from questor_exportacoes_eventos_variaveis v
                     join questor_exportacoes e on e.id = v.exportacao_id and e.resultado = 'gerado'
                    where v.lancamento_id = l.id) as oficial
             from questor_eventos_variaveis_lancamentos l where l.id = $1`,
          [lancamentoId]
        );
        // Exatamente um dos dois vence; o outro recebe conflito/ausência, nunca 500.
        expect([gerar.statusCode, cancelar.statusCode].filter((codigo) => codigo < 300)).toHaveLength(1);
        expect([gerar.statusCode, cancelar.statusCode].every((codigo) => codigo < 500)).toBe(true);
        expect(estado!.cancelado && estado!.oficial > 0).toBe(false);
        if (estado!.cancelado) {
          // Corrige para a próxima volta: o mesmo evento volta a poder ser lançado.
          continue;
        }
        expect(estado!.oficial).toBe(1);
        // Já exportado no oficial: a próxima volta lança um evento novo só se o anterior não ocupar a chave.
        break;
      }
    });

    it("arquivo técnico encerra depois da homologação (TXT e eventos)", async () => {
      ligarGates(true);
      const txt = await chamar("POST", ROTAS_EXPORTACAO_QUESTOR.admissoesTecnico, {
        processoIds: [ids.processoTxt],
        confirmacaoArquivoTecnico: true
      });
      expect(txt.statusCode).toBe(422);
      expect(txt.json().code).toBe(ERROS_EXPORTACAO_QUESTOR.tecnicoEncerrado);
    });
  });
});
