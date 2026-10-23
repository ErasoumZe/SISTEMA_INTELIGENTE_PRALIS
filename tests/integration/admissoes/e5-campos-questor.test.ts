import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fichaRevisaoDtoSchema, prontidaoQuestorDtoSchema } from "@padaria/shared";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { assertOk } from "../../setup/asserts.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * E5 (Questor) pelo fluxo real: o candidato grava os campos novos pelo link, o DP os lê na revisão
 * e a prévia de prontidão os conta. Os campos de saúde não existem no contrato (Q11). Dados
 * fictícios; banco efêmero da suíte (schema oficial, com a 0076).
 */
describe("E5 — campos do candidato e dependentes", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let token = "";
  let processoId = "";
  const CABECALHO = "x-admissao-convite";
  const turnoId = "11111111-1111-4111-8111-111111119e51";

  const publico = (method: "GET" | "PUT" | "POST", url: string, payload?: object) =>
    contexto.app.inject({ method, url, headers: { [CABECALHO]: token }, ...(payload ? { payload } : {}) });

  async function versaoDaFicha(): Promise<number> {
    const ficha = await publico("GET", "/api/admissao/ficha");
    assertOk(ficha, 200);
    return ficha.json().data.versao as number;
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno E5', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
    const criado = await contexto.app.inject({
      method: "POST",
      url: "/api/admissoes/processos",
      headers: { cookie: cookieAdmin },
      payload: {
        nomeCompleto: "Pessoa Ficticia E5",
        cpf: "11144477735",
        funcaoId: idsTeste.funcaoOperacionalA,
        turnoId,
        dataAdmissao: "2026-10-01"
      }
    });
    assertOk(criado, 201);
    processoId = criado.json().data.id as string;
    const exame = await contexto.app.inject({
      method: "PUT",
      url: `/api/admissoes/processos/${processoId}/exame`,
      headers: { cookie: cookieAdmin },
      payload: { versao: 1, situacao: "aso_apto" }
    });
    expect(exame.statusCode, exame.body).toBe(204);
    const convite = await contexto.app.inject({
      method: "POST",
      url: `/api/admissoes/processos/${processoId}/convite`,
      headers: { cookie: cookieAdmin },
      payload: {}
    });
    assertOk(convite, 200);
    token = convite.json().data.token as string;
  }, 180_000);

  afterAll(async () => {
    if (processoId) await executarSql("delete from admissoes_processos where id = $1", [processoId]);
    await executarSql("delete from turnos where id = $1", [turnoId]);
    await contexto.fechar();
  });

  it("o candidato grava os campos E5 no rascunho e os lê de volta", async () => {
    const gravado = await publico("PUT", "/api/admissao/ficha", {
      versao: await versaoDaFicha(),
      nacionalidade: "Estrangeira",
      nacionalidadeEspecifica: "Haitiano",
      naturalidadeUf: "mg",
      grauInstrucao: "Ensino médio completo",
      municipioIbge: "3136702",
      primeiroEmprego: false,
      recebeSeguroDesemprego: true
    });
    expect(gravado.statusCode, gravado.body).toBe(204);

    const lido = (await publico("GET", "/api/admissao/ficha")).json().data.campos;
    expect(lido).toMatchObject({
      nacionalidadeEspecifica: "Haitiano",
      naturalidadeUf: "MG",
      grauInstrucao: "Ensino médio completo",
      municipioIbge: "3136702",
      primeiroEmprego: false,
      recebeSeguroDesemprego: true
    });
  });

  it("recusa valor fora do formato ou da lista oficial (400)", async () => {
    const versao = await versaoDaFicha();
    for (const invalido of [
      { naturalidadeUf: "MGX" },
      { municipioIbge: "313670" },
      { nacionalidadeEspecifica: "Marciano" }
    ]) {
      const resposta = await publico("PUT", "/api/admissao/ficha", { versao, ...invalido });
      expect(resposta.statusCode, JSON.stringify(invalido)).toBe(400);
    }
  });

  it("campos de saúde não são coletados: enviados no corpo, não chegam ao banco", async () => {
    const resposta = await publico("PUT", "/api/admissao/ficha", {
      versao: await versaoDaFicha(),
      possuiDeficiencia: true,
      fumante: true
    });
    expect(resposta.statusCode).toBe(204);
    const colunas = await consultarUm<{ n: number }>(
      `select count(*)::int n from information_schema.columns
        where table_name in ('admissoes_processos_ficha', 'admissoes_processos_dependentes')
          and column_name in ('possui_deficiencia', 'deficiencias', 'reabilitado', 'fumante', 'consome_alcool')`
    );
    expect(colunas?.n).toBe(0);
  });

  it("dependente grava os 4 campos E5 e recusa opção fora da lista", async () => {
    const invalido = await publico("POST", "/api/admissao/dependentes", {
      nomeCompleto: "Dependente Ficticio",
      nascimento: "2020-01-10",
      parentesco: "Filho(a)",
      sexo: "Outro"
    });
    expect(invalido.statusCode).toBe(400);

    const criado = await publico("POST", "/api/admissao/dependentes", {
      nomeCompleto: "Dependente Ficticio",
      nascimento: "2020-01-10",
      parentesco: "Filho(a)",
      sexo: "Masculino",
      estadoCivil: "Solteiro(a)",
      grauInstrucao: "Analfabeto",
      nacionalidade: "Brasileiro"
    });
    assertOk(criado, 200);
    expect(criado.json().data.itens[0]).toMatchObject({
      sexo: "Masculino",
      estadoCivil: "Solteiro(a)",
      grauInstrucao: "Analfabeto",
      nacionalidade: "Brasileiro"
    });
  });

  it("o DP vê os campos E5 na revisão da ficha", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}/ficha`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta, 200);
    const revisao = fichaRevisaoDtoSchema.parse(resposta.json().data);
    expect(revisao.campos).toMatchObject({
      naturalidadeUf: "MG",
      primeiroEmprego: false,
      recebeSeguroDesemprego: true
    });
    expect(revisao.dependentes[0]).toMatchObject({ sexo: "Masculino", nacionalidade: "Brasileiro" });
  });

  it("a prévia de prontidão conta os campos E5 e mantém os de saúde bloqueados (Q11)", async () => {
    const resposta = await contexto.app.inject({
      method: "GET",
      url: `/api/admissoes/processos/${processoId}/questor/prontidao`,
      headers: { cookie: cookieAdmin }
    });
    assertOk(resposta, 200);
    const previa = prontidaoQuestorDtoSchema.parse(resposta.json().data);
    const campo = (registro: string, nome: string) =>
      previa.registros.find((item) => item.registro === registro)?.campos.find((item) => item.campo === nome);
    expect(campo("B", "SIGLAESTADONASC")).toMatchObject({ situacao: "pronto" });
    expect(campo("B", "INDICATPRIMEMP")).toMatchObject({ situacao: "pronto" });
    expect(campo("B", "RECEBSEGURODESEMPREGO")).toMatchObject({ situacao: "pronto" });
    expect(campo("B", "NACIONALIDADE")).toMatchObject({ situacao: "pronto" }); // "Estrangeira" + Haitiano
    expect(campo("B", "GRAUINSTR")).toMatchObject({ situacao: "pronto" });
    expect(campo("D", "SEXO")).toMatchObject({ situacao: "pronto" });
    expect(campo("D", "NACIONALIDADE")).toMatchObject({ situacao: "pronto" });
    expect(campo("B", "CODIGOMUNIC")).toMatchObject({ situacao: "pendente", origem: "externo" }); // Q5
    expect(campo("B", "DEFFISICA")?.motivo).toContain("Q11");
    expect(campo("D", "FUMANTE")?.motivo).toContain("Q11");
  });
});
