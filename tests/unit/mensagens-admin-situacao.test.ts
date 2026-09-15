import { describe, expect, it } from "vitest";
import {
  alvoMensagemSchema,
  criarMensagemAdminPayloadSchema,
  situacaoDaEntrega
} from "@padaria/shared/mensagens-admin";

const EMPRESA = "11111111-1111-4111-8111-111111111111";
const PDV = "22222222-2222-4222-8222-222222222222";

function carimbos(over: Partial<Parameters<typeof situacaoDaEntrega>[0]> = {}) {
  return {
    entregueEm: null,
    visualizadaEm: null,
    confirmadaEm: null,
    fechadaEm: null,
    ...over
  };
}

describe("R-194 - situacao da entrega derivada dos carimbos", () => {
  it("nasce pendente enquanto o cliente nao leu", () => {
    expect(situacaoDaEntrega(carimbos())).toBe("pendente");
  });

  it("avanca entregue -> visualizada conforme os carimbos chegam", () => {
    expect(situacaoDaEntrega(carimbos({ entregueEm: "2026-09-15T08:00:00.000Z" }))).toBe("entregue");
    expect(
      situacaoDaEntrega(carimbos({ entregueEm: "2026-09-15T08:00:00.000Z", visualizadaEm: "2026-09-15T08:01:00.000Z" }))
    ).toBe("visualizada");
  });

  it('"Fechar" nao encerra: a entrega fica fechada, nao confirmada', () => {
    expect(
      situacaoDaEntrega(
        carimbos({
          entregueEm: "2026-09-15T08:00:00.000Z",
          visualizadaEm: "2026-09-15T08:01:00.000Z",
          fechadaEm: "2026-09-15T08:02:00.000Z"
        })
      )
    ).toBe("fechada");
  });

  // O caso que o administrador precisa ler certo: o operador dispensou o pop-up varias vezes ao
  // longo do turno e so no fim confirmou. Se `fechada` vencesse, o painel diria que ele nunca deu
  // ciencia — e a mensagem continuaria sendo cobrada de quem ja respondeu.
  it("confirmada vence fechada, mesmo quando o operador fechou antes", () => {
    expect(
      situacaoDaEntrega(
        carimbos({
          entregueEm: "2026-09-15T08:00:00.000Z",
          visualizadaEm: "2026-09-15T08:01:00.000Z",
          fechadaEm: "2026-09-15T08:02:00.000Z",
          confirmadaEm: "2026-09-15T09:30:00.000Z"
        })
      )
    ).toBe("confirmada");
  });
});

describe("R-196 - alvo do envio", () => {
  it("exige o pdvId no alvo de PDV e o usuarioId no alvo de operador", () => {
    expect(alvoMensagemSchema.safeParse({ tipo: "pdv" }).success).toBe(false);
    expect(alvoMensagemSchema.safeParse({ tipo: "pdv", pdvId: PDV }).success).toBe(true);
    expect(alvoMensagemSchema.safeParse({ tipo: "operador" }).success).toBe(false);
    expect(alvoMensagemSchema.safeParse({ tipo: "operador", usuarioId: "u1" }).success).toBe(true);
  });

  // Alvo amplo nao carrega coluna nenhuma; o CHECK `mensagens_admin_alvos_coerencia_check` grava a
  // mesma regra no banco, para que nenhum outro caminho de escrita a contorne.
  it("recusa pdvId pendurado num alvo amplo", () => {
    expect(alvoMensagemSchema.safeParse({ tipo: "empresa", pdvId: PDV }).success).toBe(false);
  });

  it("recusa envio sem nenhum alvo", () => {
    const payload = { empresaId: EMPRESA, titulo: "Aviso", corpo: "Texto do aviso", alvos: [] };
    expect(criarMensagemAdminPayloadSchema.safeParse(payload).success).toBe(false);
  });

  it("aceita titulo e corpo com espaco em volta, guardando o texto aparado", () => {
    const analisado = criarMensagemAdminPayloadSchema.parse({
      empresaId: EMPRESA,
      titulo: "  Fechamento antecipado  ",
      corpo: "  Fechem o caixa as 18h hoje.  ",
      alvos: [{ tipo: "caixas_abertos" }]
    });
    expect(analisado.titulo).toBe("Fechamento antecipado");
    expect(analisado.corpo).toBe("Fechem o caixa as 18h hoje.");
  });
});
