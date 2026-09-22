import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NotificacoesPendentesPage from "./NotificacoesPendentesPage.vue";

const quebraVerificada = {
  id: "11111111-1111-4111-8111-111111111111",
  empresaId: "11111111-1111-4111-8111-111111111112",
  tipo: "quebra_caixa" as const,
  referenciaId: "11111111-1111-4111-8111-111111111113",
  titulo: "Quebra de caixa - Caixa",
  valor: -50,
  verificado: true,
  verificadoPor: "11111111-1111-4111-8111-111111111114",
  verificadoEm: "2026-09-14T20:52:00.000Z",
  criadoEm: "2026-09-14T20:51:00.000Z"
};

describe("NotificacoesPendentesPage", () => {
  it("permite marcar todas as pendencias abertas como lidas de uma vez", async () => {
    const tela = mount(NotificacoesPendentesPage, {
      props: {
        notificacoes: [
          {
            ...quebraVerificada,
            id: "11111111-1111-4111-8111-111111111115",
            verificado: false,
            verificadoPor: null,
            verificadoEm: null
          }
        ],
        notificacoesComHistorico: []
      },
      global: {
        stubs: {
          "v-alert": { template: "<div><slot /></div>" },
          "v-card": { template: "<article><slot /></article>" },
          "v-card-title": { template: "<h3><slot /></h3>" },
          "v-card-text": { template: "<div><slot /></div>" },
          "v-card-actions": { template: "<div><slot /></div>" },
          "v-btn": { template: "<button><slot /></button>" },
          "v-select": { template: "<select><slot /></select>" },
          "v-text-field": { template: "<input />" }
        }
      }
    });

    await tela.get("button").trigger("click");

    expect(tela.emitted("verificarTodas")).toHaveLength(1);
  });

  it("mantem a quebra verificada consultavel sem recoloca-la como pendencia aberta", () => {
    const tela = mount(NotificacoesPendentesPage, {
      props: { notificacoes: [], notificacoesComHistorico: [quebraVerificada] },
      global: {
        stubs: {
          "v-alert": { template: "<div><slot /></div>" },
          "v-card": { template: "<article><slot /></article>" },
          "v-card-title": { template: "<h3><slot /></h3>" },
          "v-card-text": { template: "<div><slot /></div>" },
          "v-card-actions": { template: "<div><slot /></div>" },
          "v-btn": { template: "<button><slot /></button>" }
        }
      }
    });

    expect(tela.text()).toContain("Nenhuma pendência corresponde aos filtros.");
    expect(tela.text()).toContain("Verificadas recentemente");
    expect(tela.text()).toContain("Quebra de caixa - Caixa");
    expect(tela.text()).toContain("R$ 50,00");
  });
});
