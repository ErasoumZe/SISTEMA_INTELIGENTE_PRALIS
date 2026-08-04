import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarContextoApiTeste, type ContextoApiTeste } from "../../setup/aplicacao.js";
import { cookieSessao } from "../../setup/auth.js";
import { idsTeste } from "../../setup/contexto.js";
import { json } from "../../setup/integracao.js";

const BOUNDARY = "----s2boundary";
const BYTES_PNG = Buffer.from("89504e470d0a1a0a0000000049454e44ae426082", "hex");

function fotoMultipart() {
  return Buffer.concat([
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="arquivo"; filename="nota.png"\r\nContent-Type: image/png\r\n\r\n`
    ),
    BYTES_PNG,
    Buffer.from(`\r\n--${BOUNDARY}--\r\n`)
  ]);
}

describe("S2 campos completos do lancamento", () => {
  let contexto: ContextoApiTeste;
  let cookieAdmin: string;

  beforeAll(async () => {
    contexto = await criarContextoApiTeste();
    cookieAdmin = await cookieSessao(contexto.app, "admin");
  }, 120_000);

  afterAll(async () => {
    await contexto?.fechar();
  });

  it("cadastra socio/gestor e reabre retirada com credor, juros, documento e duas fotos", async () => {
    const socio = await contexto.app.inject({
      method: "POST",
      url: "/api/socios-gestores",
      headers: { cookie: cookieAdmin },
      payload: { empresaId: idsTeste.empresaA, nome: "Socio S2", ativo: true }
    });
    expect(socio.statusCode, socio.body).toBe(201);
    const socioId = json<{ data: { id: string } }>(socio).data.id;

    const criada = await contexto.app.inject({
      method: "POST",
      url: "/api/retiradas",
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-31",
        dataVencimento: "2026-07-31",
        descricao: "Pro labore S2",
        valorOriginal: 100,
        jurosTipo: "percentual",
        jurosValorInformado: 10,
        socioGestorId: socioId,
        credorTipo: "socio_gestor",
        dataDocumentoFiscal: "2026-07-30",
        numeroDocumentoFiscal: "NF-S2",
        grupoRetiradaId: idsTeste.grupoRetiradaSangria
      }
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const retiradaId = json<{ data: { id: string } }>(criada).data.id;

    for (const rota of ["foto", "foto-nota"]) {
      const upload = await contexto.app.inject({
        method: "POST",
        url: `/api/retiradas/${retiradaId}/${rota}`,
        headers: { cookie: cookieAdmin, "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
        payload: fotoMultipart()
      });
      expect(upload.statusCode, upload.body).toBe(201);
    }

    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/retiradas/${retiradaId}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    expect(detalhe.json()).toMatchObject({
      data: {
        socioGestorId: socioId,
        credorTipo: "socio_gestor",
        jurosTipo: "percentual",
        jurosValorInformado: 10,
        valorAcrescimo: 10,
        dataDocumentoFiscal: "2026-07-30",
        numeroDocumentoFiscal: "NF-S2"
      }
    });
    const fotos = json<{ data: { fotoDocumentoUrl: string; fotoNotaUrl: string } }>(detalhe).data;
    expect(fotos.fotoDocumentoUrl).toContain("retiradas/");
    expect(fotos.fotoNotaUrl).toContain("retiradas/");
  });

  it.each([
    {
      dominio: "despesas",
      credor: { colaboradorId: idsTeste.colaboradorAdmin, credorTipo: "colaborador" },
      grupo: { grupoDespesaId: idsTeste.grupoDespesaOperacional }
    },
    {
      dominio: "mercadorias",
      credor: { fornecedorId: idsTeste.fornecedor, credorTipo: "fornecedor" },
      grupo: { grupoMercadoriaId: idsTeste.grupoMercadoriaInsumos, temNotaFiscal: true }
    }
  ])("reabre campos fiscais e juros em $dominio", async ({ dominio, credor, grupo }) => {
    const criada = await contexto.app.inject({
      method: "POST",
      url: `/api/${dominio}`,
      headers: { cookie: cookieAdmin },
      payload: {
        empresaId: idsTeste.empresaA,
        dataReferencia: "2026-07-31",
        dataVencimento: "2026-07-31",
        descricao: `S2 ${dominio}`,
        valorOriginal: 50,
        jurosTipo: "valor",
        jurosValorInformado: 2.5,
        dataDocumentoFiscal: "2026-07-29",
        numeroDocumentoFiscal: `DOC-${dominio}`,
        ...credor,
        ...grupo
      }
    });
    expect(criada.statusCode, criada.body).toBe(201);
    const id = json<{ data: { id: string } }>(criada).data.id;
    const detalhe = await contexto.app.inject({
      method: "GET",
      url: `/api/${dominio}/${id}`,
      headers: { cookie: cookieAdmin }
    });
    expect(detalhe.statusCode, detalhe.body).toBe(200);
    expect(detalhe.json()).toMatchObject({
      data: {
        jurosTipo: "valor",
        jurosValorInformado: 2.5,
        valorAcrescimo: 2.5,
        dataDocumentoFiscal: "2026-07-29",
        numeroDocumentoFiscal: `DOC-${dominio}`
      }
    });
  });
});
