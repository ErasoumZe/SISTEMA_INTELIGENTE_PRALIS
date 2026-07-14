import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { executarSql } from "../../setup/integracao.js";
import { emailsCapturados } from "../../../api/src/auth/email.js";
import { verificarSilencioIntegracao } from "../../../api/src/integracoes/integracoes.service.js";

// Alerta de silencio: e-mail aos admins quando um dia fecha sem NENHUMA venda por integracao numa
// empresa com chave ativa. No seed, empresaA tem chave de vendas ATIVA, dois admins (admin +
// multiempresa) e nenhuma venda integrada — logo, qualquer dia e "silencioso" ate inserirmos uma.
describe("alerta de silencio da integracao de vendas", () => {
  let contexto: ContextoApiTeste;

  function alertasDoDia(dia: string) {
    return emailsCapturados.filter((email) => email.assunto.includes(dia));
  }

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
  }, 120_000);

  afterAll(async () => {
    await contexto.fechar();
  });

  it("dia sem venda integrada -> avisa todos os admins da empresa (1x cada)", async () => {
    const resumo = await verificarSilencioIntegracao({
      empresaIds: [idsTeste.empresaA],
      hoje: new Date("2026-07-02T12:00:00.000Z") // verifica o dia anterior: 2026-07-01
    });

    expect(resumo.dia).toBe("2026-07-01");
    expect(resumo.silenciosas).toBe(1);
    expect(resumo.alertasEnviados).toBe(2); // admin + multiempresa (ambos usuario_admin da empresaA)

    const alertas = alertasDoDia("2026-07-01");
    expect(alertas).toHaveLength(2);
    expect(new Set(alertas.map((email) => email.para))).toEqual(
      new Set([usuariosTeste.admin.email, usuariosTeste.multiempresa.email])
    );
  });

  it("nao reenvia no mesmo dia (dedup em memoria)", async () => {
    const resumo = await verificarSilencioIntegracao({
      empresaIds: [idsTeste.empresaA],
      hoje: new Date("2026-07-02T12:00:00.000Z")
    });

    expect(resumo.silenciosas).toBe(0);
    expect(resumo.alertasEnviados).toBe(0);
    expect(alertasDoDia("2026-07-01")).toHaveLength(2); // continua 2, nao duplicou
  });

  it("dia COM venda integrada nao gera alerta", async () => {
    // Uma venda recebida por integracao (integracao_chave_id preenchido) no dia 2026-07-04.
    await executarSql(
      `insert into vendas (empresa_id, integracao_chave_id, data_referencia, descricao, valor_original)
       values ($1, $2, $3, $4, $5)`,
      [idsTeste.empresaA, idsTeste.integracaoChave, "2026-07-04", "Venda integrada teste", "10.00"]
    );

    const resumo = await verificarSilencioIntegracao({
      empresaIds: [idsTeste.empresaA],
      hoje: new Date("2026-07-05T12:00:00.000Z") // verifica 2026-07-04
    });

    expect(resumo.dia).toBe("2026-07-04");
    expect(resumo.silenciosas).toBe(0);
    expect(resumo.alertasEnviados).toBe(0);
    expect(alertasDoDia("2026-07-04")).toHaveLength(0);
  });
});
