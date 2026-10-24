import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { empresas } from "@padaria/db/schema";
import {
  admissoesProcessos,
  admissoesProcessosDependentes,
  admissoesProcessosFicha,
  admissoesProcessosInternos
} from "@padaria/db/schema/admissoes";
import {
  montarContratoQuestor,
  prepararArquivoAdmissaoQuestor,
  type SnapshotAdmissaoPralis
} from "@padaria/shared/conplus";
import { banco, pool } from "../../../api/src/banco/conexao.js";
import { idsTeste } from "../../setup/contexto.js";
import { executarSql } from "../../setup/integracao.js";
import { aplicarSeedIntegracao } from "../../setup/seed.js";

/**
 * E1 contra o PostgreSQL de verdade: as colunas são lidas pelo Drizzle, do jeito que a API lê, e o
 * contrato Questor sai delas. Prova também que montar o contrato não escreve nada no banco.
 * Todos os dados são fictícios.
 */
describe("contrato Questor a partir das linhas do banco", () => {
  const processoId = "11111111-1111-4111-8111-111111119e01";
  const turnoId = "11111111-1111-4111-8111-111111119e02";
  const empresaId = idsTeste.empresaA;

  async function lerLinhas() {
    const [empresa] = await banco.select().from(empresas).where(eq(empresas.id, empresaId));
    const [processo] = await banco.select().from(admissoesProcessos).where(eq(admissoesProcessos.id, processoId));
    const [internos] = await banco
      .select()
      .from(admissoesProcessosInternos)
      .where(eq(admissoesProcessosInternos.processoId, processoId));
    const [ficha] = await banco
      .select()
      .from(admissoesProcessosFicha)
      .where(eq(admissoesProcessosFicha.processoId, processoId));
    const dependentes = await banco
      .select()
      .from(admissoesProcessosDependentes)
      .where(eq(admissoesProcessosDependentes.processoId, processoId))
      .orderBy(admissoesProcessosDependentes.nomeCompleto);
    return { empresa: empresa!, processo: processo!, internos: internos!, ficha: ficha!, dependentes };
  }

  function snapshotDasLinhas(linhas: Awaited<ReturnType<typeof lerLinhas>>): SnapshotAdmissaoPralis {
    const { empresa, processo, internos, ficha, dependentes } = linhas;
    return {
      empresa: { cnpj: empresa.cnpj },
      processo: { nomeCompleto: processo.nomeCompleto, cpf: processo.cpf },
      internos,
      ficha,
      dependentes
    };
  }

  beforeAll(async () => {
    await aplicarSeedIntegracao();
    await executarSql(
      `insert into turnos (id, empresa_id, nome, hora_inicio, hora_fim, etiqueta, dias_semana)
       values ($1, $2, 'Turno E1 Questor', '06:00', '14:00', 'M', array['SEGUNDA']::text[]) on conflict do nothing`,
      [turnoId, empresaId]
    );
    await executarSql(
      `insert into admissoes_processos
         (id, empresa_id, origem, teste_id, nome_completo, cpf, funcao_id, turno_id, criado_por, atualizado_por)
       select $1, $2, 'admissao_direta', null, 'Pessoa Ficticia Questor', '12345678909', $3, $4, p.usuario_id, p.usuario_id
         from perfis_usuarios p limit 1
       on conflict do nothing`,
      [processoId, empresaId, idsTeste.funcaoOperacionalA, turnoId]
    );
    await executarSql(
      `insert into admissoes_processos_internos
         (empresa_id, processo_id, data_admissao, ctps_numero, ctps_serie, ctps_uf, pis_pasep_nit)
       values ($1, $2, '2026-09-27', '1234567', '0001', 'MG', '12345678901') on conflict do nothing`,
      [empresaId, processoId]
    );
    await executarSql(
      `insert into admissoes_processos_ficha
         (empresa_id, processo_id, situacao, versao, nascimento, sexo, estado_civil, raca_cor, grau_instrucao,
          nacionalidade, nome_mae, nome_pai, cep, logradouro, numero, bairro, municipio, uf, telefone, email,
          rg_numero, rg_uf, rg_emissao)
       values ($1, $2, 'rascunho', 1, '2000-05-05', 'Feminino', 'Casado(a)', 'Parda', 'Ensino médio completo',
          'Brasileira', 'Mae Ficticia', 'Pai Ficticio', '36037467', 'Rua Ficticia', '54', 'Bairro Ficticio',
          'Cidade Ficticia', 'MG', '32999990000', 'pessoa@exemplo.invalid', 'MG1234567', 'MG', '2015-01-31')
       on conflict do nothing`,
      [empresaId, processoId]
    );
    await executarSql(
      `insert into admissoes_processos_dependentes (empresa_id, processo_id, nome_completo, nascimento, parentesco, cpf)
       values ($1, $2, 'Dependente Ficticio A', '2020-01-10', 'Filho(a)', null),
              ($1, $2, 'Dependente Ficticio B', '2018-07-01', 'Tutelado(a)', null)`,
      [empresaId, processoId]
    );
  }, 180_000);

  afterAll(async () => {
    await executarSql("delete from admissoes_processos where id = $1", [processoId]);
    await executarSql("delete from turnos where id = $1", [turnoId]);
    await pool.end();
  });

  it("lê as colunas pelo Drizzle e monta A/B/C/D com os valores convertidos", async () => {
    const linhas = await lerLinhas();
    // `date` chega como texto AAAA-MM-DD, que é o contrato do snapshot.
    expect(linhas.ficha.nascimento).toBe("2000-05-05");

    const { contrato, pendencias } = montarContratoQuestor(snapshotDasLinhas(linhas));
    expect(contrato.A).toEqual({
      CODIGOEMPRESA: "00.000.000/0001-91",
      CPFFUNC: "123.456.789-09",
      NOMEFUNC: "Pessoa Ficticia Questor",
      DATANASC: "05/05/2000",
      DATAADM: "27/09/2026"
    });
    expect(contrato.B).toMatchObject({
      PISFUNC: "123.45678.90.1",
      CEPFUNC: "36.037-467",
      NUMEROENDER: "54",
      SEXO: "2",
      RACACOR: "8",
      ESTADOCIVIL: "2",
      GRAUINSTR: "7",
      NACIONALIDADE: "10",
      NUMEROCTPS: "1234567",
      SERIECTPS: "0001",
      SIGLAESTADOCTPS: "MG",
      MAE: "Mae Ficticia",
      PAI: "Pai Ficticio"
    });
    // Município em texto NÃO vira código: fica vazio para a E2+.
    expect(contrato.B["CODIGOMUNIC"]).toBeUndefined();
    expect(contrato.C).toMatchObject({ NUMERORG: "MG1234567", SIGLAESTADORG: "MG", EMISSRG: "31/01/2015" });
    expect(contrato.dependentes?.map((dependente) => dependente["PARENTESCO"])).toEqual(["01", undefined]);
    expect(pendencias).toEqual([expect.objectContaining({ registro: "D", campo: "PARENTESCO", dependente: 1 })]);

    const arquivo = prepararArquivoAdmissaoQuestor([snapshotDasLinhas(linhas)]);
    expect(arquivo.linhas.map((linha) => linha[0])).toEqual(["A", "B", "C", "D", "D"]);
    expect(arquivo.diagnosticos.filter((item) => item.codigo !== "OBRIGATORIO")).toEqual([]);
  });

  it("montar o contrato não altera nenhuma linha do banco", async () => {
    const antes = await lerLinhas();
    montarContratoQuestor(snapshotDasLinhas(antes));
    prepararArquivoAdmissaoQuestor([snapshotDasLinhas(antes)]);
    const depois = await lerLinhas();
    expect(depois).toEqual(antes);
    expect(depois.ficha.cep).toBe("36037467");
    expect(depois.ficha.sexo).toBe("Feminino");
    expect(depois.dependentes.map((dependente) => dependente.parentesco)).toEqual(["Filho(a)", "Tutelado(a)"]);
  });
});
