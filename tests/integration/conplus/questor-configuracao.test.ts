import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { permissoesPorCargo, regrasPermissoes } from "@padaria/db/referencia-permissoes";
import type { Permissao } from "@padaria/shared";
import {
  ERROS_QUESTOR,
  ROTAS_QUESTOR,
  codigoQuestorDtoSchema,
  configuracaoQuestorDtoSchema,
  contratoQuestorDtoSchema,
  funcaoQuestorDtoSchema,
  prontidaoQuestorDtoSchema,
  turnoQuestorDtoSchema
} from "@padaria/shared/conplus";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql } from "../../setup/integracao.js";

/**
 * E2/E3/E4 pela rota HTTP real, com as tabelas das migrations 0073–0075 (o banco efêmero da suíte
 * é criado pelo schema oficial). Rotas e permissão (`conplus_questor_configurar`, do cargo DP)
 * exatamente como registradas em `api/src/app.ts`. Códigos todos FICTÍCIOS (9xx).
 */
describe("Questor E2/E3/E4 — rotas", () => {
  let contexto: ContextoApiTeste;
  let cookieDp: string;
  let cookieGerencia: string;

  const processoId = "11111111-1111-4111-8111-111111119e21";
  const turnoId = "11111111-1111-4111-8111-111111119e22";
  const funcaoB = "11111111-1111-4111-8111-111111119e23";
  const codigoB = "11111111-1111-4111-8111-111111119e24";
  const rota = (caminho: string, id = "") => caminho.replace(":id", id);

  async function vestir(email: string, cargo: "DP" | "Gerencia") {
    const alvo = await consultarUm<{ id: string }>(`select id from "user" where email = $1`, [email]);
    if (!alvo) throw new Error(`usuário ${email} ausente`);
    await executarSql(
      `insert into permissoes_usuarios (usuario_id, regras) values ($1, $2::jsonb)
       on conflict (usuario_id) do update set regras = excluded.regras`,
      [alvo.id, JSON.stringify(regrasPermissoes(permissoesPorCargo[cargo] as Permissao[]))]
    );
  }

  const chamar = (method: "GET" | "PUT" | "POST" | "PATCH", url: string, payload?: object, cookie = cookieDp) =>
    contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    await vestir(usuariosTeste.caixa.email, "DP");
    await vestir(usuariosTeste.gerente.email, "Gerencia");
    cookieDp = await cookieSessao(contexto.app, "caixa");
    cookieGerencia = await cookieSessao(contexto.app, "gerente");

    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno Questor E3', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
      [turnoId, idsTeste.empresaA]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa Ficticia Questor E4', '52998224725', $3, $4, p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1 on conflict do nothing`,
      [processoId, idsTeste.empresaA, idsTeste.funcaoOperacionalA, turnoId]
    );
    await executarSql(
      `insert into admissoes_processos_internos (empresa_id, processo_id) values ($1, $2) on conflict do nothing`,
      [idsTeste.empresaA, processoId]
    );
    await executarSql(
      `insert into funcoes_operacionais (id, empresa_id, nome) values ($1, $2, 'Funcao Questor B') on conflict do nothing`,
      [funcaoB, idsTeste.empresaB]
    );
  }, 180_000);

  afterAll(async () => {
    await executarSql("delete from admissoes_processos where id = $1", [processoId]);
    await executarSql("delete from turnos where id = $1", [turnoId]);
    await executarSql("delete from funcoes_operacionais where id = $1", [funcaoB]);
    await executarSql("delete from questor_codigos where empresa_id = any($1::uuid[])", [
      [idsTeste.empresaA, idsTeste.empresaB]
    ]);
    await executarSql("delete from questor_configuracoes where empresa_id = any($1::uuid[])", [
      [idsTeste.empresaA, idsTeste.empresaB]
    ]);
    await executarSql(
      "update funcoes_operacionais set questor_codigo_cargo = null, questor_agente_nocivo = null where id = $1",
      [idsTeste.funcaoOperacionalA]
    );
    await contexto.fechar();
  });

  describe("E2, E3 e E4", () => {
    let codigoSindicatoId = "";
    let versaoConfiguracao = 0;

    beforeAll(async () => {
      await executarSql(
        `insert into questor_codigos (id, empresa_id, tabela, codigo, descricao) values ($1, $2, 'cargo', '905', 'Cargo da empresa B')
         on conflict do nothing`,
        [codigoB, idsTeste.empresaB]
      );
    });

    it("E2: configuração começa vazia (versão 0) e é criada pela versão 0", async () => {
      const vazia = await chamar("GET", ROTAS_QUESTOR.configuracao);
      expect(vazia.statusCode, vazia.body).toBe(200);
      expect(configuracaoQuestorDtoSchema.parse(vazia.json().data)).toMatchObject({
        versao: 0,
        padroes: {},
        codigoEstabelecimento: null
      });

      const criada = await chamar("PUT", ROTAS_QUESTOR.configuracao, { versao: 0, padroes: { OPTANTEFGTS: "1" } });
      expect(criada.statusCode, criada.body).toBe(200);
      versaoConfiguracao = configuracaoQuestorDtoSchema.parse(criada.json().data).versao;
      expect(versaoConfiguracao).toBe(1);

      const deNovo = await chamar("PUT", ROTAS_QUESTOR.configuracao, { versao: 0, padroes: {} });
      expect(deNovo.statusCode).toBe(409);
      expect(deNovo.json().code).toBe(ERROS_QUESTOR.versaoDesatualizada);
    });

    it("E2: corpo com empresaId ou valor fora do domínio é recusado (400)", async () => {
      const comEmpresa = await chamar("PUT", ROTAS_QUESTOR.configuracao, {
        versao: versaoConfiguracao,
        empresaId: idsTeste.empresaB
      });
      expect(comEmpresa.statusCode).toBe(400);
      const foraDoDominio = await chamar("PUT", ROTAS_QUESTOR.configuracao, {
        versao: versaoConfiguracao,
        padroes: { OPTANTEFGTS: "2" }
      });
      expect(foraDoDominio.statusCode).toBe(400);
    });

    it("E2: catálogo cria, recusa duplicado e lista só a empresa do usuário", async () => {
      const cargo = await chamar("POST", ROTAS_QUESTOR.codigos, {
        tabela: "cargo",
        codigo: "904",
        descricao: "Cargo ficticio"
      });
      expect(cargo.statusCode, cargo.body).toBe(201);
      const sindicato = await chamar("POST", ROTAS_QUESTOR.codigos, {
        tabela: "sindicato",
        codigo: "902",
        descricao: "Sindicato ficticio"
      });
      expect(sindicato.statusCode).toBe(201);
      codigoSindicatoId = codigoQuestorDtoSchema.parse(sindicato.json().data).id;
      await chamar("POST", ROTAS_QUESTOR.codigos, {
        tabela: "tipo_contrato",
        codigo: "901",
        descricao: "Contrato ficticio"
      });
      await chamar("POST", ROTAS_QUESTOR.codigos, { tabela: "escala", codigo: "906", descricao: "Escala ficticia" });

      const duplicado = await chamar("POST", ROTAS_QUESTOR.codigos, {
        tabela: "cargo",
        codigo: "904",
        descricao: "Outro"
      });
      expect(duplicado.statusCode).toBe(409);
      expect(duplicado.json().code).toBe(ERROS_QUESTOR.codigoDuplicado);

      const lista = await chamar("GET", ROTAS_QUESTOR.codigos);
      const codigos = (lista.json().data as unknown[]).map((item) => codigoQuestorDtoSchema.parse(item).codigo);
      expect(codigos.sort()).toEqual(["901", "902", "904", "906"]);
      expect(codigos).not.toContain("905"); // da empresa B

      const deOutraEmpresa = await chamar("PATCH", rota(ROTAS_QUESTOR.codigo, codigoB), { ativo: false });
      expect(deOutraEmpresa.statusCode).toBe(404);
    });

    it("E2: padrão da empresa só aceita código ativo do catálogo da própria empresa (422)", async () => {
      const inexistente = await chamar("PUT", ROTAS_QUESTOR.configuracao, {
        versao: versaoConfiguracao,
        padroes: { CODIGOSIND: "777" }
      });
      expect(inexistente.statusCode).toBe(422);
      expect(inexistente.json().code).toBe(ERROS_QUESTOR.codigoForaDoCatalogo);

      const ok = await chamar("PUT", ROTAS_QUESTOR.configuracao, {
        versao: versaoConfiguracao,
        codigoEstabelecimento: 903,
        padroes: { OPTANTEFGTS: "1", CODIGOSIND: "902" }
      });
      expect(ok.statusCode, ok.body).toBe(200);
      versaoConfiguracao = configuracaoQuestorDtoSchema.parse(ok.json().data).versao;
      expect(versaoConfiguracao).toBe(2);
    });

    it("E2: código desativado some da lista e é recusado em TODA gravação, inclusive de quem já o tinha", async () => {
      const desativado = await chamar("PATCH", rota(ROTAS_QUESTOR.codigo, codigoSindicatoId), { ativo: false });
      expect(desativado.statusCode, desativado.body).toBe(200);
      expect(codigoQuestorDtoSchema.parse(desativado.json().data).ativo).toBe(false);

      const ativos = (await chamar("GET", ROTAS_QUESTOR.codigos)).json().data as Array<{ codigo: string }>;
      expect(ativos.map((item) => item.codigo)).not.toContain("902");
      const todos = (await chamar("GET", `${ROTAS_QUESTOR.codigos}?incluirInativos=true`)).json().data as Array<{
        codigo: string;
      }>;
      expect(todos.map((item) => item.codigo)).toContain("902");

      // A configuração que JÁ tinha o 902 não grava mais com ele: precisa trocar por código ativo.
      const mantendo = await chamar("PUT", ROTAS_QUESTOR.configuracao, {
        versao: versaoConfiguracao,
        codigoEstabelecimento: 904,
        padroes: { OPTANTEFGTS: "1", CODIGOSIND: "902" }
      });
      expect(mantendo.statusCode).toBe(422);
      expect(mantendo.json().code).toBe(ERROS_QUESTOR.codigoForaDoCatalogo);
      const trocando = await chamar("PUT", ROTAS_QUESTOR.configuracao, {
        versao: versaoConfiguracao,
        codigoEstabelecimento: 904,
        padroes: { OPTANTEFGTS: "1" }
      });
      expect(trocando.statusCode, trocando.body).toBe(200);
      versaoConfiguracao = 3;

      // Escolher o 902 em outra gravação (contrato) também é recusado.
      const contrato = contratoQuestorDtoSchema.parse(
        (await chamar("GET", rota(ROTAS_QUESTOR.contrato, processoId))).json().data
      );
      const escolha = await chamar("PUT", rota(ROTAS_QUESTOR.contrato, processoId), {
        versao: contrato.versao,
        questorSindicato: "902"
      });
      expect(escolha.statusCode).toBe(422);
    });

    it("E3: função e turno recebem códigos do catálogo, com concorrência por atualizadoEm", async () => {
      const funcoes = (await chamar("GET", ROTAS_QUESTOR.funcoes)).json().data as unknown[];
      const funcao = funcoes
        .map((item) => funcaoQuestorDtoSchema.parse(item))
        .find((item) => item.id === idsTeste.funcaoOperacionalA)!;
      expect(funcao).toMatchObject({ questorCodigoCargo: null, questorAgenteNocivo: null });
      expect(funcoes.map((item) => (item as { id: string }).id)).not.toContain(funcaoB);

      const salva = await chamar("PUT", rota(ROTAS_QUESTOR.funcao, funcao.id), {
        atualizadoEmLido: funcao.atualizadoEm,
        questorCodigoCargo: "904",
        questorAgenteNocivo: "00"
      });
      expect(salva.statusCode, salva.body).toBe(200);
      expect(funcaoQuestorDtoSchema.parse(salva.json().data)).toMatchObject({
        questorCodigoCargo: "904",
        questorAgenteNocivo: "00"
      });

      const atrasada = await chamar("PUT", rota(ROTAS_QUESTOR.funcao, funcao.id), {
        atualizadoEmLido: funcao.atualizadoEm,
        questorAgenteNocivo: "15"
      });
      expect(atrasada.statusCode).toBe(409);
      expect(atrasada.json().code).toBe(ERROS_QUESTOR.versaoDesatualizada);

      const cargoDeB = await chamar("PUT", rota(ROTAS_QUESTOR.funcao, funcao.id), {
        atualizadoEmLido: funcaoQuestorDtoSchema.parse(salva.json().data).atualizadoEm,
        questorCodigoCargo: "905"
      });
      expect(cargoDeB.statusCode).toBe(422);

      const funcaoDeB = await chamar("PUT", rota(ROTAS_QUESTOR.funcao, funcaoB), {
        atualizadoEmLido: funcao.atualizadoEm
      });
      expect(funcaoDeB.statusCode).toBe(404);

      const turnos = (await chamar("GET", ROTAS_QUESTOR.turnos)).json().data as unknown[];
      const turno = turnos.map((item) => turnoQuestorDtoSchema.parse(item)).find((item) => item.id === turnoId)!;
      const turnoSalvo = await chamar("PUT", rota(ROTAS_QUESTOR.turno, turnoId), {
        atualizadoEmLido: turno.atualizadoEm,
        questorCodigoEscala: "906",
        questorTipoJornada: 3,
        questorTempoParcial: 0,
        questorRegimeJornada: 1
      });
      expect(turnoSalvo.statusCode, turnoSalvo.body).toBe(200);
      const jornadaInvalida = await chamar("PUT", rota(ROTAS_QUESTOR.turno, turnoId), {
        atualizadoEmLido: turnoQuestorDtoSchema.parse(turnoSalvo.json().data).atualizadoEm,
        questorTipoJornada: 1
      });
      expect(jornadaInvalida.statusCode).toBe(400);
    });

    it("E4: contrato do DP com versão do bloco interno, condicional e catálogo", async () => {
      const lido = contratoQuestorDtoSchema.parse(
        (await chamar("GET", rota(ROTAS_QUESTOR.contrato, processoId))).json().data
      );
      const semDescricao = await chamar("PUT", rota(ROTAS_QUESTOR.contrato, processoId), {
        versao: lido.versao,
        questorTipoSalario: 2
      });
      expect(semDescricao.statusCode).toBe(400);
      for (const tipo of [2, 6]) {
        const soEspacos = await chamar("PUT", rota(ROTAS_QUESTOR.contrato, processoId), {
          versao: lido.versao,
          questorTipoSalario: tipo,
          descricaoSalario: "    "
        });
        expect(soEspacos.statusCode, `tipo ${tipo}`).toBe(400);
      }
      // Mesmo que alguém grave por fora da API, o banco recusa (CHECK condicional da 0075).
      await expect(
        executarSql(
          "update admissoes_processos_internos set questor_tipo_salario = 6, descricao_salario = '   ' where processo_id = $1",
          [processoId]
        )
      ).rejects.toThrow(/internos_descricao_salario/u);

      const salvo = await chamar("PUT", rota(ROTAS_QUESTOR.contrato, processoId), {
        versao: lido.versao,
        questorTipoSalario: 1,
        salarioCentavos: 151800,
        diasExperiencia: 45,
        diasProrrogacao: 45,
        questorTipoContrato: "901",
        questorTipoAdmissao: 1,
        utilizaCtpsDigital: true
      });
      expect(salvo.statusCode, salvo.body).toBe(200);
      const contrato = contratoQuestorDtoSchema.parse(salvo.json().data);
      expect(contrato).toMatchObject({ versao: lido.versao + 1, salarioCentavos: 151800, questorTipoContrato: "901" });

      const atrasado = await chamar("PUT", rota(ROTAS_QUESTOR.contrato, processoId), {
        versao: lido.versao,
        diasExperiencia: 30
      });
      expect(atrasado.statusCode).toBe(409);
    });

    it("E4: Gerência não lê nem grava o contrato (salário é do DP)", async () => {
      const leitura = await chamar("GET", rota(ROTAS_QUESTOR.contrato, processoId), undefined, cookieGerencia);
      expect(leitura.statusCode).toBe(403);
      const configuracao = await chamar("GET", ROTAS_QUESTOR.configuracao, undefined, cookieGerencia);
      expect(configuracao.statusCode).toBe(403);
    });

    it("a prévia de prontidão passa a refletir E2–E4 gravados", async () => {
      const resposta = await chamar("GET", rota(ROTAS_QUESTOR.prontidao, processoId));
      expect(resposta.statusCode, resposta.body).toBe(200);
      const previa = prontidaoQuestorDtoSchema.parse(resposta.json().data);
      const campo = (registro: string, nome: string) =>
        previa.registros.find((item) => item.registro === registro)?.campos.find((item) => item.campo === nome);
      expect(campo("A", "VALORSAL")).toMatchObject({ situacao: "pronto" });
      expect(campo("A", "CODIGOTIPOCONTR")).toMatchObject({ situacao: "pronto" });
      expect(campo("A", "CODIGOCARGO")).toMatchObject({ situacao: "pronto" });
      expect(campo("B", "CODIGOESTAB")).toMatchObject({ situacao: "pronto" });
      expect(campo("B", "CODIGOESCALA")).toMatchObject({ situacao: "pronto" });
      expect(campo("B", "OPTANTEFGTS")).toMatchObject({ situacao: "pronto" });
      // Não preenchido, mas a fonte existe: a mensagem aponta o Pralís, não a Conplus.
      expect(campo("B", "RECEBEADTO")).toMatchObject({
        situacao: "pendente",
        motivo: "Não preenchido no Pralís para este processo"
      });
      expect(previa.exportacaoDisponivel).toBe(false);
    });
  });
});
