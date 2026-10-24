import { describe, expect, it, vi } from "vitest";
import { GoogleDriveService } from "../../api/src/google/google-drive.service.js";
import {
  encontrarLinhaCabecalho,
  normalizarTituloPlanilha,
  prepararRegistroPorCabecalho,
  GoogleSheetsService
} from "../../api/src/google/google-sheets.service.js";

function respostaJson(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("servico Google Drive", () => {
  it("localiza ou cria pasta somente sob a raiz configurada", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respostaJson({ files: [] }))
      .mockResolvedValueOnce(
        respostaJson({ id: "pasta-1", name: "Colaborador", mimeType: "application/vnd.google-apps.folder" })
      );
    const drive = new GoogleDriveService({
      rootFolderId: "raiz-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    const pasta = await drive.localizarOuCriarPasta("Colaborador", "raiz-1");

    expect(pasta.id).toBe("pasta-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    const corpo = fetcher.mock.calls[1]?.[1]?.body;
    expect(typeof corpo).toBe("string");
    expect(JSON.parse(corpo as string)).toMatchObject({ parents: ["raiz-1"] });
  });

  it("recusa pasta fora da raiz antes de criar ou enviar", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respostaJson({ id: "fora-1", mimeType: "application/vnd.google-apps.folder", parents: ["outra-raiz"] })
      )
      .mockResolvedValueOnce(
        respostaJson({ id: "outra-raiz", mimeType: "application/vnd.google-apps.folder", parents: [] })
      );
    const drive = new GoogleDriveService({
      rootFolderId: "raiz-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    await expect(drive.verificarPastaDentroDaRaiz("fora-1")).rejects.toMatchObject({
      code: "GOOGLE_RESOURCE_OUTSIDE_ROOT"
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("servico Google Sheets", () => {
  it("normaliza espacos extras no titulo da planilha", () => {
    expect(normalizarTituloPlanilha("  Planilha de teste   ")).toBe("Planilha de teste");
    expect(normalizarTituloPlanilha("Planilha\n de\t teste")).toBe("Planilha de teste");
  });

  it("valida o ID exato e aceita espaco final no titulo", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respostaJson({ spreadsheetId: "planilha-1", properties: { title: "Destino autorizado " } })
      );
    const sheets = new GoogleSheetsService({
      spreadsheetId: "planilha-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    await expect(sheets.validarIdentidade("Destino autorizado")).resolves.toBeUndefined();
    expect(fetcher.mock.calls[0]?.[0]).toContain("spreadsheets/planilha-1");
  });

  it("rejeita resposta de planilha com ID diferente", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respostaJson({ spreadsheetId: "outra-planilha", properties: { title: "Destino autorizado" } })
      );
    const sheets = new GoogleSheetsService({
      spreadsheetId: "planilha-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    await expect(sheets.validarIdentidade("Destino autorizado")).rejects.toThrow(
      "nao corresponde ao destino autorizado"
    );
  });
  it("prepara a linha por nome de cabecalho e preserva colunas desconhecidas", () => {
    const linha = prepararRegistroPorCabecalho(["NOME COMPLETO", "CPF", "Coluna interna"], {
      "Nome completo": "Pessoa de teste",
      CPF: "00000000000"
    });
    expect(linha).toEqual(["Pessoa de teste", "00000000000", null]);
  });

  it("localiza a linha de cabecalho pelo texto, sem depender de letras fixas", () => {
    const resultado = encontrarLinhaCabecalho(
      [
        [null, "Título"],
        [null, "NOME COMPLETO", "CPF"]
      ],
      "nome completo"
    );
    expect(resultado.indice).toBe(1);
    expect(resultado.cabecalhos).toEqual(["", "NOME COMPLETO", "CPF"]);
  });

  it("usa append com INSERT_ROWS para não sobrescrever linhas existentes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(respostaJson({ updates: { updatedRange: "A12:C12" } }));
    const sheets = new GoogleSheetsService({
      spreadsheetId: "planilha-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    const resultado = await sheets.inserirRegistroSemSobrescrever("colab", ["Nome", "CPF"], {
      Nome: "Pessoa de teste",
      CPF: "00000000000"
    });

    expect(resultado.updatedRange).toBe("A12:C12");
    expect(fetcher.mock.calls[0]?.[0]).toContain("insertDataOption=INSERT_ROWS");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("escreve colaborador a partir da linha 12 sem usar append", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        respostaJson({
          sheets: [
            {
              data: [
                {
                  rowData: [{ values: [{ userEnteredValue: { formula: "=A1" } }, {}] }, { values: [{}, {}] }]
                }
              ]
            }
          ]
        })
      )
      .mockResolvedValueOnce(respostaJson({ updatedRange: "colab!A13:B13" }));
    const sheets = new GoogleSheetsService({
      spreadsheetId: "planilha-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    const resultado = await sheets.inserirLinhaSemSobrescrever("colab", ["Pessoa", "000"], 12);

    expect(resultado.updatedRange).toBe("colab!A13:B13");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain("colab!A13%3AB13");
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "PUT" });
    expect(fetcher.mock.calls[1]?.[0]).not.toContain(":append");
  });

  it("usa a linha 12 quando ela está realmente vazia", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(respostaJson({ sheets: [{ data: [{ rowData: [{ values: [{}, {}] }] }] }] }))
      .mockResolvedValueOnce(respostaJson({ updatedRange: "colab!A12:B12" }));
    const sheets = new GoogleSheetsService({
      spreadsheetId: "planilha-1",
      tokenProvider: async () => "token-de-teste",
      fetcher
    });

    await sheets.inserirLinhaSemSobrescrever("colab", ["Pessoa", "000"], 12);

    expect(fetcher.mock.calls[1]?.[0]).toContain("colab!A12%3AB12");
  });
});
