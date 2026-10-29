import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { abrirCaixaDoOperador, prepararPayloadFechamentoValido } from "../../setup/caixa.js";
import { idsTeste, usuariosTeste } from "../../setup/contexto.js";
import { consultarUm, executarSql, json } from "../../setup/integracao.js";

// Relatorio da maquininha em dois turnos do MESMO PDV e da MESMA maquininha: a manha le o acumulado desde zero; a
// tarde le o acumulado do dia e o sistema abate o que a manha ja tinha lido (liquido da tarde = tarde - manha).
describe("Maquininha - manha e tarde do mesmo PDV", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;
  let cookieCaixa: string;
  let cookieTesouraria: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    [cookieAdmin, cookieCaixa, cookieTesouraria] = await Promise.all([
      cookieSessao(contexto.app, "admin"),
      cookieSessao(contexto.app, "caixa"),
      cookieSessao(contexto.app, "tesouraria")
    ]);
  }, 120_000);

  afterAll(async () => contexto.fechar());

  function chamar(cookie: string, method: "GET" | "POST" | "PUT", url: string, payload?: object) {
    return contexto.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  }

  function leitura(credito: number, debito: number, pix: number, voucher: number) {
    return {
      documentoLegivel: true,
      numeroMaquininha: null,
      dataEmissao: null,
      acumulador: credito + debito + pix + voucher,
      credito,
      debito,
      pix,
      voucher,
      detalhes: { credito: [], debito: [], pix: [], voucher: [] },
      camposDuvidosos: [],
      observacoes: []
    };
  }

  async function prepararPdvEMaquininha(sufixo: string) {
    const conta = await chamar(cookieAdmin, "POST", "/api/contas", {
      empresaId: idsTeste.empresaA,
      nome: `Conta manha-tarde ${sufixo}`,
      saldoInicial: 100_000
    });
    expect(conta.statusCode, conta.body).toBe(201);
    const contaId = json<{ data: { id: string } }>(conta).data.id;
    const pdv = await chamar(cookieAdmin, "POST", "/api/pdvs", {
      empresaId: idsTeste.empresaA,
      nome: `PDV manha-tarde ${sufixo}`,
      contaId,
      ativo: true
    });
    expect(pdv.statusCode, pdv.body).toBe(201);
    const maquininha = await chamar(cookieAdmin, "POST", "/api/maquininhas", {
      empresaId: idsTeste.empresaA,
      numeroSerie: `SERIE-MT-${sufixo}`,
      apelido: `Maquininha ${sufixo}`,
      ativo: true
    });
    expect(maquininha.statusCode, maquininha.body).toBe(201);
    return {
      contaId,
      pdvId: json<{ data: { id: string } }>(pdv).data.id,
      maquininhaId: json<{ data: { id: string } }>(maquininha).data.id
    };
  }

  // `nome` precisa ser DIFERENTE em cada turno: a fixture cria um turno com esse nome e o nome e unico por PDV.
  function abrirCaixa(
    base: { contaId: string; pdvId: string; maquininhaId: string },
    dataHoraAbertura: string,
    nome: string
  ) {
    return abrirCaixaDoOperador(contexto.app, {
      cookieAdmin,
      cookieOperador: cookieCaixa,
      emailOperador: usuariosTeste.caixa.email,
      nome,
      dataHoraAbertura,
      contaId: base.contaId,
      pdvId: base.pdvId,
      maquininhaId: base.maquininhaId
    });
  }

  async function prepararSoOComprovanteDaMaquininha(caixaId: string) {
    const inicio = await chamar(cookieCaixa, "POST", `/api/caixa/${caixaId}/iniciar-fechamento`, {});
    expect(inicio.statusCode, inicio.body).toBe(200);
    const boundary = `----padaria-mt-${Date.now()}`;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64"
    );
    const crlf = "\r\n";
    const corpo = Buffer.concat([
      Buffer.from(
        `--${boundary}${crlf}Content-Disposition: form-data; name="tipo"${crlf}${crlf}comprovante_cartao${crlf}` +
          `--${boundary}${crlf}Content-Disposition: form-data; name="arquivo"; filename="comprovante.png"${crlf}` +
          `Content-Type: image/png${crlf}${crlf}`
      ),
      png,
      Buffer.from(`${crlf}--${boundary}--${crlf}`)
    ]);
    const resposta = await contexto.app.inject({
      method: "POST",
      url: `/api/caixa/${caixaId}/anexos`,
      headers: { cookie: cookieCaixa, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: corpo
    });
    expect(resposta.statusCode, resposta.body).toBe(201);
  }

  async function salvarLeitura(caixaId: string, valores: ReturnType<typeof leitura>) {
    const anexo = await consultarUm<{ id: string }>(
      "select id from fechamentos_caixa_anexos where fechamento_caixa_id = $1 and tipo = 'comprovante_cartao' order by criado_em desc limit 1",
      [caixaId]
    );
    if (!anexo) throw new Error("Comprovante da maquininha nao encontrado");
    return chamar(cookieCaixa, "PUT", `/api/caixa/${caixaId}/relatorio-maquininha`, {
      anexoId: anexo.id,
      leituraAcumulada: valores
    });
  }

  it("a manha nao abate nada; a tarde le o acumulado do dia e abate a manha", async () => {
    const base = await prepararPdvEMaquininha("A");

    // ---- MANHA: acumulado 100 / 50 / 20 / 10, desde zero.
    const manha = await abrirCaixa(base, "2026-07-30T08:00", "Caixa manha");
    const fechamentoManha = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: manha.caixaId,
      caixaResponsavelNome: "Caixa manha-tarde"
    });
    const salvaManha = await salvarLeitura(manha.caixaId, leitura(100, 50, 20, 10));
    expect(salvaManha.statusCode, salvaManha.body).toBe(200);
    const fechaManha = await chamar(cookieCaixa, "POST", `/api/caixa/${manha.caixaId}/fechar`, {
      // A fixture ja devolve o lacre de fechamento reservado no malote.
      ...fechamentoManha
    });
    expect(fechaManha.statusCode, fechaManha.body).toBe(204);

    const relatorioManha = await consultarUm<Record<string, string | null>>(
      "select credito_inicial, credito_final, pix_inicial, pix_final from fechamentos_caixa_relatorios_maquininha where fechamento_caixa_id = $1",
      [manha.caixaId]
    );
    expect(relatorioManha).toMatchObject({ credito_inicial: null, credito_final: "100.00", pix_final: "20.00" });

    // A fixture nomeia os lacres pelo PDV; depois de usados na manha eles saem do caminho para a tarde ter os seus.
    await executarSql("update lacres set numero = numero || '-MANHA' where numero like $1", [`TESTE-%-${base.pdvId}`]);

    // ---- TARDE: o servidor ja sabe que e a tarde e qual foi a leitura da manha.
    const tarde = await abrirCaixa(base, "2026-07-30T14:00", "Caixa tarde");
    const consulta = await chamar(cookieCaixa, "GET", `/api/caixa/${tarde.caixaId}/relatorio-maquininha`);
    expect(consulta.statusCode, consulta.body).toBe(200);
    const dadosConsulta = json<{
      data: { etapaDia: string; leituraReferencia: { leitura: { credito: number; pix: number } } | null };
    }>(consulta).data;
    expect(dadosConsulta.etapaDia).toBe("tarde");
    expect(dadosConsulta.leituraReferencia?.leitura).toMatchObject({ credito: 100, pix: 20 });

    // Na tarde NAO da para usar a preparacao padrao da fixture: ela salva leitura ZERO, e zero e menor que a manha.
    await prepararSoOComprovanteDaMaquininha(tarde.caixaId);

    // Acumulado MENOR que o da manha nao e leitura valida (contador de maquininha so cresce).
    const menor = await salvarLeitura(tarde.caixaId, leitura(90, 80, 45, 25));
    expect(menor.statusCode, menor.body).toBe(422);
    expect(menor.body).toMatch(/LEITURA_ACUMULADA_INVALIDA|menor que a leitura da manh/i);

    // Acumulado 160 / 80 / 45 / 25  =>  liquido da tarde 60 / 30 / 25 / 15.
    const salvaTarde = await salvarLeitura(tarde.caixaId, leitura(160, 80, 45, 25));
    expect(salvaTarde.statusCode, salvaTarde.body).toBe(200);
    const relatorioTarde = await consultarUm<{
      credito_inicial: string;
      credito_final: string;
      debito_inicial: string;
      pix_inicial: string;
      voucher_inicial: string;
      dados_revisados: { etapaDia: string; liquidos: Record<string, number> };
    }>(
      "select credito_inicial, credito_final, debito_inicial, pix_inicial, voucher_inicial, dados_revisados from fechamentos_caixa_relatorios_maquininha where fechamento_caixa_id = $1",
      [tarde.caixaId]
    );
    expect(relatorioTarde).toMatchObject({
      credito_inicial: "100.00",
      credito_final: "160.00",
      debito_inicial: "50.00",
      pix_inicial: "20.00",
      voucher_inicial: "10.00"
    });
    expect(relatorioTarde?.dados_revisados.etapaDia).toBe("tarde");
    expect(relatorioTarde?.dados_revisados.liquidos).toEqual({ credito: 60, debito: 30, pix: 25, voucher: 15 });

    // O relatorio de fechamento da Tesouraria recebe inicial e final dos DOIS turnos.
    const dossie = await chamar(cookieTesouraria, "GET", `/api/relatorios/fechamentos/${tarde.caixaId}`);
    expect(dossie.statusCode, dossie.body).toBe(200);
    expect(
      json<{ data: { relatorioMaquininha: Record<string, unknown> } }>(dossie).data.relatorioMaquininha
    ).toMatchObject({ creditoInicial: "100.00", creditoFinal: "160.00" });
  });

  // R-227: cada PDV tem a sua manha (PDV 1 manha/tarde, PDV 2 manha/tarde...). A tarde de um PDV nunca usa a
  // leitura de outro PDV, e no dia seguinte o primeiro caixa volta a ser manha (o acumulado da maquininha zera).
  it("nao mistura PDVs: cada tarde desconta so a manha do proprio PDV, e no dia seguinte volta a ser manha", async () => {
    const pdvA = await prepararPdvEMaquininha("ISO-A");
    const pdvB = await prepararPdvEMaquininha("ISO-B");
    const etapa = async (caixaId: string) => {
      const consulta = await chamar(cookieCaixa, "GET", `/api/caixa/${caixaId}/relatorio-maquininha`);
      expect(consulta.statusCode, consulta.body).toBe(200);
      return json<{
        data: { etapaDia: string; leituraReferencia: { leitura: { credito: number } } | null };
      }>(consulta).data;
    };

    // PDV A manha: acumulado 100 / 50 / 20 / 10.
    const manhaA = await abrirCaixa(pdvA, "2026-07-30T08:00", "ISO manha A");
    const payloadManhaA = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: manhaA.caixaId,
      caixaResponsavelNome: "Caixa ISO"
    });
    expect((await salvarLeitura(manhaA.caixaId, leitura(100, 50, 20, 10))).statusCode).toBe(200);
    expect((await chamar(cookieCaixa, "POST", `/api/caixa/${manhaA.caixaId}/fechar`, payloadManhaA)).statusCode).toBe(
      204
    );

    // PDV B, primeiro caixa do dia: e manha e nao enxerga a manha do PDV A.
    const manhaB = await abrirCaixa(pdvB, "2026-07-30T08:30", "ISO manha B");
    expect(await etapa(manhaB.caixaId)).toMatchObject({ etapaDia: "manha", leituraReferencia: null });
    const payloadManhaB = await prepararPayloadFechamentoValido(contexto.app, {
      cookieOperador: cookieCaixa,
      caixaId: manhaB.caixaId,
      caixaResponsavelNome: "Caixa ISO"
    });
    expect((await chamar(cookieCaixa, "POST", `/api/caixa/${manhaB.caixaId}/fechar`, payloadManhaB)).statusCode).toBe(
      204
    );

    // PDV A tarde: desconta a manha do PROPRIO PDV (credito 100), mesmo o PDV B tendo fechado depois.
    await executarSql("update lacres set numero = numero || '-MANHA' where numero like $1", [`TESTE-%-${pdvA.pdvId}`]);
    const tardeA = await abrirCaixa(pdvA, "2026-07-30T14:00", "ISO tarde A");
    const tarde = await etapa(tardeA.caixaId);
    expect(tarde.etapaDia).toBe("tarde");
    expect(tarde.leituraReferencia?.leitura.credito).toBe(100);

    // Dia seguinte: o mesmo PDV volta a ser manha, sem desconto (a manha de ontem nao conta mais).
    await executarSql("update fechamentos_caixa set data_movimento = data_movimento + 1 where id = $1", [
      tardeA.caixaId
    ]);
    expect(await etapa(tardeA.caixaId)).toMatchObject({ etapaDia: "manha", leituraReferencia: null });
  });
});
