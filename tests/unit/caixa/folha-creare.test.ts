import { describe, expect, it } from "vitest";
import {
  conferirEmissaoFolhaCreare,
  conferirInicioFolhaCreare,
  instanteDaFolhaCreare,
  relatorioVendasCreareSchema
} from "@padaria/shared/caixa";

// R-225 · horario da folha do CREARE x caixa. A folha e sempre hora de Sao Paulo (UTC-3).
describe("horario da folha do CREARE", () => {
  it("le a data impressa como hora de Sao Paulo", () => {
    expect(instanteDaFolhaCreare("26/10/2026 06:14:58")?.toISOString()).toBe("2026-10-26T09:14:58.000Z");
    expect(instanteDaFolhaCreare("26/10/2026 - 13:58:46")?.toISOString()).toBe("2026-10-26T16:58:46.000Z");
    expect(instanteDaFolhaCreare("26/13/2026 06:14:58")).toBeNull();
    expect(instanteDaFolhaCreare("ontem de manha")).toBeNull();
  });

  const aberturaOficial = "2026-10-26T09:30:00.000Z"; // 06:30 em Sao Paulo

  it("confere quando o inicio da folha esta a ate 2 minutos do inicio das vendas", () => {
    const conferencia = conferirInicioFolhaCreare({
      periodoInicio: "26/10/2026 06:31:02",
      inicioVendas: aberturaOficial,
      aberturaOficial
    });
    expect(conferencia).toMatchObject({ situacao: "ok", sugestaoInicio: null });
  });

  it("sugere o ajuste no minuto cheio, para baixo, quando a folha comeca antes", () => {
    const conferencia = conferirInicioFolhaCreare({
      periodoInicio: "26/10/2026 06:14:58",
      inicioVendas: aberturaOficial,
      aberturaOficial
    });
    expect(conferencia).toMatchObject({
      situacao: "divergente",
      diferencaMinutos: -15,
      sugestaoInicio: "2026-10-26T09:14:00.000Z",
      motivoSemSugestao: null
    });
  });

  it("nao sugere alem de 60 minutos, depois da abertura oficial ou em outro dia", () => {
    const base = { inicioVendas: aberturaOficial, aberturaOficial };
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: "26/10/2026 05:20:00" })).toMatchObject({
      situacao: "divergente",
      sugestaoInicio: null,
      motivoSemSugestao: "alem_do_recuo_maximo"
    });
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: "26/10/2026 07:00:00" })).toMatchObject({
      motivoSemSugestao: "depois_da_abertura_oficial"
    });
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: "25/10/2026 06:20:00" })).toMatchObject({
      motivoSemSugestao: "outro_dia"
    });
    expect(conferirInicioFolhaCreare({ ...base, periodoInicio: null }).situacao).toBe("pendente");
  });

  it("emissao x corte do fechamento e informativo", () => {
    const corte = "2026-10-26T17:00:00.000Z"; // 14:00
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 14:05:00", corte }).situacao).toBe("ok");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 13:58:46", corte }).situacao).toBe("ok");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 13:40:00", corte }).situacao).toBe("antes_do_corte");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 14:30:00", corte }).situacao).toBe("depois_do_corte");
    expect(conferirEmissaoFolhaCreare({ dataEmissao: "26/10/2026 14:00:00", corte: null }).situacao).toBe("pendente");
  });
});

describe("contrato da folha do CREARE", () => {
  it("guarda a sangria positiva, aceita saldo final negativo e deixa ausente como null", () => {
    const leitura = relatorioVendasCreareSchema.parse({
      documentoLegivel: true,
      sangria: -600,
      saldoFinalDinheiro: -12.5,
      dataEmissao: "26/10/2026 - 13:58:46",
      periodoInicio: "texto sem data"
    });
    expect(leitura).toMatchObject({
      sangria: 600,
      saldoFinalDinheiro: -12.5,
      dataEmissao: "26/10/2026 13:58:46",
      periodoInicio: null,
      credito: null,
      total: null
    });
  });

  it("correcao manual: guarda justificativa e campos; justificativa curta e recusada", () => {
    const comCorrecao = relatorioVendasCreareSchema.parse({
      documentoLegivel: true,
      correcaoManual: { justificativa: "Foto cortada no total", campos: ["Total"] }
    });
    expect(comCorrecao.correcaoManual).toEqual({ justificativa: "Foto cortada no total", campos: ["Total"] });
    expect(relatorioVendasCreareSchema.parse({ documentoLegivel: true }).correcaoManual).toBeNull();
    expect(
      relatorioVendasCreareSchema.safeParse({
        documentoLegivel: true,
        correcaoManual: { justificativa: "ok", campos: ["Total"] }
      }).success
    ).toBe(false);
  });

  it("recusa valor negativo onde o cupom nao imprime sinal", () => {
    expect(relatorioVendasCreareSchema.safeParse({ documentoLegivel: true, credito: -1 }).success).toBe(false);
  });
});
