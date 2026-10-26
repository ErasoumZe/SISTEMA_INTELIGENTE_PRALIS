import { mount } from "@vue/test-utils";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProntidaoQuestorDto } from "@padaria/shared";
import QuestorProntidao from "~/components/admissoes/QuestorProntidao.vue";

const resposta: ProntidaoQuestorDto = {
  processoId: "11111111-1111-4111-8111-111111111111",
  geradoEm: "2026-10-22T12:00:00.000Z",
  exportacaoDisponivel: false,
  aptoParaExportacao: false,
  motivoBloqueio: "Há 1 campo(s) pendente(s) ou inválido(s); a exportação permanece bloqueada",
  resumo: {
    requeridos: 2,
    requeridosProntos: 1,
    pendentes: 1,
    invalidos: 0,
    bloqueados: 0,
    porOrigem: { candidato: 1, dp: 0, empresa: 0, codigo_questor: 0, externo: 0 }
  },
  registros: [
    {
      registro: "A",
      dependente: null,
      campos: [
        {
          coluna: 1,
          campo: "NOMEFUNC",
          nomeCurto: "Nome",
          requerido: true,
          situacao: "pronto",
          origem: "dp",
          motivo: null
        },
        {
          coluna: 2,
          campo: "DATANASC",
          nomeCurto: "Nascimento",
          requerido: true,
          situacao: "pendente",
          origem: "candidato",
          motivo: "A ficha do candidato ainda não coleta este dado"
        }
      ]
    }
  ]
};

function montar(apiGet = vi.fn().mockResolvedValue(resposta)) {
  vi.stubGlobal("useApi", () => ({ apiGet }));
  return mount(QuestorProntidao, {
    props: { processoId: resposta.processoId },
    global: { plugins: [createVuetify({ components, directives })] }
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("QuestorProntidao", () => {
  it("carrega a prévia e agrupa pendências sem exibir valores pessoais", async () => {
    const apiGet = vi.fn().mockResolvedValue(resposta);
    const wrapper = montar(apiGet);
    await vi.waitFor(() =>
      expect(apiGet).toHaveBeenCalledWith(
        "/api/admissoes/processos/11111111-1111-4111-8111-111111111111/questor/prontidao"
      )
    );
    await vi.waitFor(() => expect(wrapper.text()).toContain("Candidato"));

    expect(wrapper.text()).toContain("Prontidão para o Questor");
    expect(wrapper.text()).toContain("Candidato");
    expect(wrapper.text()).toContain("Nascimento");
    expect(wrapper.text()).toContain("A ficha do candidato ainda não coleta este dado");
    expect(wrapper.text()).not.toContain("11111111111");
    expect(wrapper.text()).not.toContain("CPF");
    expect(wrapper.text()).toContain("A exportação para TXT ainda não está disponível");
  });

  it("mostra erro seguro quando a prévia não pode ser carregada", async () => {
    const wrapper = montar(vi.fn().mockRejectedValue(new Error("Permissão insuficiente")));
    await vi.waitFor(() => expect(wrapper.text()).toContain("Permissão insuficiente"));
    expect(wrapper.text()).not.toContain("token");
  });
});
