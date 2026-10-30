import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, multipartAnexoFechamento } from "../../setup/caixa.js";
import { usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

type Comparacao = Record<string, "ok" | "pendente" | "divergente">;
type RelatorioGerado = {
  dados: {
    versao: number;
    creare: {
      comparacao: Comparacao;
      pralis: Record<string, number>;
      somaFormasConfereTotal: boolean | null;
      horario: { inicio: { situacao: string; sugestaoInicio: string | null }; emissao: { situacao: string } };
    };
  };
};

// R-225: a folha "Relatorio de Venda Geral" do CREARE comparada campo a campo com o relatorio do Pralis.
describe("Caixa - comparacao da folha do CREARE (R-225)", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa")
    ]);
  }, 120_000);

  afterAll(async () => contexto.fechar());

  it("compara cada linha em centavos, guarda o Pralis ao lado e confere o horario da folha", async () => {
    const caixa = await abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome: "Caixa folha CREARE",
      dataHoraAbertura: "2026-07-30T13:18"
    });
    // Horario oficial fixo (13:18 em Sao Paulo) para o teste nao depender da hora em que roda.
    await executarSql("update fechamentos_caixa set aberto_em = $2, data_hora_abertura = $2 where id = $1", [
      caixa.caixaId,
      "2026-07-30T16:18:00.000Z"
    ]);
    const linha = await consultarUm<{ empresa_id: string; pdv_id: string }>(
      "select empresa_id, pdv_id from fechamentos_caixa where id = $1",
      [caixa.caixaId]
    );
    if (!linha) throw new Error("caixa nao encontrado");
    await executarSql(
      `insert into vendas (empresa_id, pdv_id, caixa_id, identificador_externo, descricao, data_referencia, data_venda,
                           valor_original, status, computar)
       values ($1, $2, $3, 'FOLHA-CREARE-1', 'Venda do turno', '2026-07-30', '2026-07-30T16:40:00.000Z', 12.50,
               'aprovado', true)`,
      [linha.empresa_id, linha.pdv_id, caixa.caixaId]
    );

    const inicio = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/iniciar-fechamento`,
      headers: { cookie: cookieCaixa },
      payload: {}
    });
    expect(inicio.statusCode, inicio.body).toBe(200);
    const { boundary, corpo } = multipartAnexoFechamento("relatorio_vendas_creare");
    const anexo = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixa.caixaId}/anexos`,
      headers: { cookie: cookieCaixa, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(anexo.statusCode, anexo.body).toBe(201);
    const anexoId = json<{ data: { id: string } }>(anexo).data.id;

    async function gerar(leituraCreare: Record<string, unknown>) {
      const resposta = await contexto.app.inject({
        method: "POST",
        url: `/api/caixa/${caixa.caixaId}/relatorio-vendas`,
        headers: { cookie: cookieCaixa },
        // R-232 · a contagem fisica vai junto; a mesma contagem a cada geracao nao pede justificativa.
        payload: {
          anexoId,
          leituraCreare: { documentoLegivel: true, ...leituraCreare },
          contagemFisica: { valorEspecie: 0, valorMoedas: 0 }
        }
      });
      expect(resposta.statusCode, resposta.body).toBe(200);
      return json<{ data: RelatorioGerado }>(resposta).data.dados;
    }

    // Folha sem valores: tudo pendente; o Pralis vai junto para a tela mostrar ao lado.
    const vazio = await gerar({});
    expect(vazio.versao).toBe(5);
    expect(new Set(Object.values(vazio.creare.comparacao))).toEqual(new Set(["pendente"]));
    expect(vazio.creare.pralis["total"]).toBe(12.5);
    expect(Object.keys(vazio.creare.comparacao).sort()).toEqual(
      ["credito", "debito", "despesas", "dinheiro", "pix", "sangria", "total", "trocoInicial", "voucher"].sort()
    );

    // Folha igual ao Pralis: tudo confere. CLIENTES e Saldo Final so sao exibidos (fora da comparacao).
    const pralis = vazio.creare.pralis;
    const igual = await gerar({
      ...pralis,
      clientes: 0,
      saldoFinalDinheiro: 999,
      periodoInicio: "30/07/2026 13:01:30"
    });
    expect(new Set(Object.values(igual.creare.comparacao))).toEqual(new Set(["ok"]));
    expect(igual.creare.comparacao).not.toHaveProperty("clientes");
    expect(igual.creare.comparacao).not.toHaveProperty("saldoFinalDinheiro");
    // A folha comeca 13:01:30 e o caixa 13:18: sugere o ajuste para 13:01 (R-224).
    expect(igual.creare.horario.inicio).toMatchObject({
      situacao: "divergente",
      sugestaoInicio: "2026-07-30T16:01:00.000Z"
    });

    // Um centavo de diferenca ja e divergente.
    const centavo = await gerar({ ...pralis, total: (pralis["total"] ?? 0) + 0.01 });
    expect(centavo.creare.comparacao["total"]).toBe("divergente");
    expect(centavo.creare.comparacao["dinheiro"]).toBe("ok");
  });
});
