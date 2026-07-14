import AdmZip from "adm-zip";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { idsTeste } from "../../setup/contexto.js";
import { consultarTodos, consultarUm } from "../../setup/integracao.js";
import { parseNfe } from "../../../api/src/notas-fiscais/notas-fiscais.parser.js";
import {
  baixarXmlsDoWebhook,
  importarNotaFiscalRepository,
  type RegistroWebhook
} from "../../../api/src/notas-fiscais/notas-fiscais.repository.js";

// Chave de acesso de 44 digitos (Id da NF-e = "NFe" + chave).
const CHAVE = "35260600000000000191550010000000011000000017";

// NF-e minima e valida. CNPJ do emitente com pontuacao de proposito (o parser normaliza).
const XML_NOTA = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe Id="NFe${CHAVE}">
  <ide><nNF>1</nNF><serie>1</serie><mod>55</mod><natOp>COMPRA</natOp><dhEmi>2026-06-15T10:00:00-03:00</dhEmi></ide>
  <emit><CNPJ>11.222.333/0001-44</CNPJ><xNome>Fornecedor Teste</xNome></emit>
  <total><ICMSTot><vProd>100.00</vProd><vDesc>0.00</vDesc><vFrete>0.00</vFrete><vNF>100.00</vNF></ICMSTot></total>
  <cobr><dup><dVenc>2026-07-15</dVenc></dup></cobr>
  <det nItem="1"><prod><cEAN>789</cEAN><NCM>1905</NCM><CFOP>1102</CFOP><xProd>Farinha de trigo</xProd><uCom>KG</uCom><qCom>10.0000</qCom><vUnCom>10.00</vUnCom></prod></det>
</infNFe></NFe></nfeProc>`;

// Resposta do filtro no formato REAL do Make: atributos da NF-e aninhados sob `_attributes` (nao
// planos). Uma nota valida (FILE-1) e uma cancelada (FILE-2, deve ser filtrada). Se a leitura da
// resposta regredir para so ler atributos planos, fileIds fica vazio -> 0 notas (o bug corrigido).
const RESPOSTA_FILTRO = {
  Nfes: {
    Nfe: [{ _attributes: { File: "FILE-1", Canceled: "false" } }, { _attributes: { File: "FILE-2", Canceled: "true" } }]
  }
};

function zipComXml(xml: string): ArrayBuffer {
  const zip = new AdmZip();
  zip.addFile("nota.xml", Buffer.from(xml, "utf8"));
  const buffer = zip.toBuffer();
  const copia = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(copia).set(buffer);
  return copia;
}

describe("importacao de NF-e (webhook da contabilidade)", () => {
  let contexto: ContextoApiTeste;
  const corpos: Array<{ route: string; company: string; data: Record<string, unknown> }> = [];
  const logs: Array<{ msg: string; obj: Record<string, unknown> }> = [];
  const log: RegistroWebhook = {
    info: (obj, msg) => logs.push({ msg: msg ?? "", obj: obj as Record<string, unknown> }),
    debug: (obj, msg) => logs.push({ msg: msg ?? "", obj: obj as Record<string, unknown> })
  };

  beforeAll(async () => {
    // Semeia o banco (empresaA tem cnpj "00000000000191") e sobe o app.
    contexto = await criarContextoApiTeste();
    // Mock do webhook: filtro -> JSON (1 valida + 1 cancelada); obterxmlporids -> ZIP com 1 XML.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        const corpo = JSON.parse(init.body);
        corpos.push(corpo);
        if (corpo.route === "obternfeporfiltro") {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify(RESPOSTA_FILTRO),
            arrayBuffer: async () => new ArrayBuffer(0)
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          text: async () => "",
          arrayBuffer: async () => zipComXml(XML_NOTA)
        } as unknown as Response;
      })
    );
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    await contexto.fechar();
  });

  it("monta o body correto, le a resposta e importa 1 nota -> 1 mercadoria", async () => {
    const xmls = await baixarXmlsDoWebhook({
      url: "https://webhook.example/make",
      token: "TOKEN-SECRETO",
      companyContabilidade: "08351168000153",
      cnpjEmpresa: "00000000000191",
      dataInicioBr: "01/06/2026",
      dataFimBr: "30/06/2026",
      log
    });

    // (a/b/c) Body do filtro: company = contabilidade FIXA; Client = CNPJ da empresa (14 digitos);
    // datas dd/MM/yyyy. O token NUNCA aparece no corpo (vai so no header Authorization).
    const filtro = corpos.find((c) => c.route === "obternfeporfiltro");
    expect(filtro?.company).toBe("08351168000153");
    expect(filtro?.data).toMatchObject({
      search: { Client: ["00000000000191"], DateEmissionStart: "01/06/2026", DateEmissionEnd: "30/06/2026" }
    });
    expect(JSON.stringify(filtro)).not.toContain("TOKEN-SECRETO");

    // (e) Body do obterxmlporids: company = CNPJ da PROPRIA empresa; apenas a nota nao cancelada.
    const xml = corpos.find((c) => c.route === "obterxmlporids");
    expect(xml?.company).toBe("00000000000191");
    expect(xml?.data).toEqual({ fileIds: ["FILE-1"] });

    // (d) Leitura da resposta: 2 no payload, 1 nao cancelada, 1 fileId -> 1 XML baixado.
    expect(xmls).toHaveLength(1);
    expect(logs.find((l) => l.msg === "webhook filtro resposta")?.obj).toMatchObject({
      notasNoPayload: 2,
      notasNaoCanceladas: 1,
      fileIds: 1
    });

    // Persistencia: 1 mercadoria pre-preenchida (aguardando_aprovacao, sem computar) + 1 nota fiscal.
    const nfe = parseNfe(xmls[0]!);
    expect(nfe.chave).toBe(CHAVE);
    expect(nfe.fornecedorCnpj).toBe("11222333000144");
    const resultado = await importarNotaFiscalRepository({
      empresaId: idsTeste.empresaA,
      nfe,
      dataReferenciaFallback: "2026-06-30",
      criadoPor: null
    });
    expect(resultado).toBe("importada");

    const mercadorias = await consultarTodos<{ status: string; computar: boolean; nota_fiscal_id: string | null }>(
      "select status, computar, nota_fiscal_id from mercadorias where empresa_id = $1",
      [idsTeste.empresaA]
    );
    expect(mercadorias).toHaveLength(1);
    expect(mercadorias[0]).toMatchObject({
      status: "aguardando_aprovacao",
      computar: false,
      nota_fiscal_id: CHAVE
    });

    const nota = await consultarUm<{ chave: string; status_importacao: string }>(
      "select chave, status_importacao from notas_fiscais where empresa_id = $1",
      [idsTeste.empresaA]
    );
    expect(nota).toMatchObject({ chave: CHAVE, status_importacao: "pendente_revisao" });

    const itens = await consultarTodos(
      "select nfi.id from notas_fiscais_itens nfi join notas_fiscais nf on nf.id = nfi.nota_fiscal_id where nf.chave = $1",
      [CHAVE]
    );
    expect(itens).toHaveLength(1);
  });

  it("reimportar a mesma nota e idempotente (pula, sem duplicar)", async () => {
    const nfe = parseNfe(XML_NOTA);
    const resultado = await importarNotaFiscalRepository({
      empresaId: idsTeste.empresaA,
      nfe,
      dataReferenciaFallback: "2026-06-30",
      criadoPor: null
    });
    expect(resultado).toBe("pulada");
    const mercadorias = await consultarTodos("select id from mercadorias where empresa_id = $1", [idsTeste.empresaA]);
    expect(mercadorias).toHaveLength(1);
  });
});
