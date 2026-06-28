import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const rotasCopia = [
  "/api/contas",
  "/api/fornecedores",
  "/api/colaboradores",
  "/api/cargos",
  "/api/grupos",
  "/api/unidades_medida",
  "/api/areas_setores",
  "/api/produtos",
  "/api/malotes"
];

const coberturaPorEndpoint: Record<string, string> = {
  "GET /health": "saude.test.ts",
  "GET /api/auth/*": "autenticacao.test.ts",
  "POST /api/auth/*": "autenticacao.test.ts",
  "GET /api/me": "sessao.test.ts",
  "GET /api/sessao": "sessao.test.ts",
  "GET /api/empresas": "catalogos.test.ts",
  "GET /api/contas": "catalogos.test.ts",
  "GET /api/fornecedores": "catalogos.test.ts",
  "GET /api/colaboradores": "catalogos.test.ts",
  "GET /api/grupos": "catalogos.test.ts",
  "GET /api/unidades_medida": "catalogos.test.ts",
  "GET /api/areas_setores": "catalogos.test.ts",
  "GET /api/setores": "catalogos.test.ts",
  "GET /api/produtos": "catalogos.test.ts",
  "GET /api/usuarios": "catalogos.test.ts",
  "GET /api/permissoes": "catalogos.test.ts",
  "POST /api/cadastros/:tipo": "cadastros.test.ts",
  "PUT /api/cadastros/:tipo/:id": "cadastros.test.ts",
  "GET /api/cargos": "colaboradores.test.ts",
  "POST /api/cargos": "colaboradores.test.ts",
  "PUT /api/cargos/:id": "colaboradores.test.ts",
  "GET /api/colaboradores/:colaboradorId/cargos": "colaboradores.test.ts",
  "POST /api/colaboradores/:colaboradorId/cargos": "colaboradores.test.ts",
  "PUT /api/colaboradores/:colaboradorId/cargos/:cargoColaboradorId": "colaboradores.test.ts",
  "GET /api/colaboradores/:colaboradorId/jornadas": "colaboradores.test.ts",
  "POST /api/colaboradores/:colaboradorId/jornadas": "colaboradores.test.ts",
  "GET /api/colaboradores/:colaboradorId/faltas-justificadas": "colaboradores.test.ts",
  "POST /api/colaboradores/:colaboradorId/faltas-justificadas": "colaboradores.test.ts",
  "GET /api/feriados": "colaboradores.test.ts",
  "POST /api/feriados": "colaboradores.test.ts",
  "GET /api/tema": "tema.test.ts",
  "PUT /api/tema": "tema.test.ts",
  "GET /api/movimentacoes": "movimentacoes.test.ts",
  "POST /api/movimentacoes": "movimentacoes.test.ts",
  "GET /api/fechamento-caixa/resumo": "caixa.test.ts",
  "POST /api/fechamento-caixa/acertar-saldo": "caixa.test.ts",
  "GET /api/malotes": "malotes.test.ts",
  "GET /api/malotes/:maloteId/lacres": "malotes.test.ts",
  "GET /api/lacres/validar": "malotes.test.ts",
  "POST /api/malotes": "malotes.test.ts",
  "PUT /api/malotes/:maloteId": "malotes.test.ts",
  "GET /api/relatorios/produtos-mais-vendidos": "relatorios.test.ts"
};

for (const rota of rotasCopia) {
  coberturaPorEndpoint[`POST ${rota}/importar`] = "copia.test.ts";
  coberturaPorEndpoint[`POST ${rota}/:id/exportar`] = "copia.test.ts";
}

function listarArquivosController(diretorio: string): string[] {
  return readdirSync(diretorio, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(diretorio, entrada.name);
    if (entrada.isDirectory()) return listarArquivosController(caminho);
    return entrada.name.endsWith(".controller.ts") ? [caminho] : [];
  });
}

function listarEndpointsDeclarados() {
  const raiz = dirname(process.cwd());
  const apiSrc = join(raiz, "api", "src");
  const endpoints = new Set<string>();
  const regex = /app\.(get|post|put|delete)\(\s*["']([^"']+)["']/g;

  for (const arquivo of listarArquivosController(apiSrc)) {
    const conteudo = readFileSync(arquivo, "utf8");
    for (const match of conteudo.matchAll(regex)) {
      endpoints.add(`${match[1]?.toUpperCase()} ${match[2]}`);
    }
  }

  for (const rota of rotasCopia) {
    endpoints.add(`POST ${rota}/importar`);
    endpoints.add(`POST ${rota}/:id/exportar`);
  }
  endpoints.add("GET /api/auth/*");
  endpoints.add("POST /api/auth/*");

  return [...endpoints].sort();
}

describe("cobertura dos endpoints", () => {
  it("Deve_TerTesteDeclarado_Quando_EndpointExistirNoApp", () => {
    // Arrange
    const endpoints = listarEndpointsDeclarados();

    // Act
    const semCobertura = endpoints.filter((endpoint) => !coberturaPorEndpoint[endpoint]);

    // Assert
    expect(semCobertura).toEqual([]);
  });

  it("Deve_ApontarParaArquivoExistente_Quando_EndpointEstiverNoMapaDeCobertura", () => {
    // Arrange
    const diretorio = join(process.cwd(), "integration");

    // Act
    const arquivosInexistentes = Object.entries(coberturaPorEndpoint)
      .filter(([, arquivo]) => !existsSync(join(diretorio, arquivo)))
      .map(([endpoint, arquivo]) => `${endpoint} -> ${arquivo}`);

    // Assert
    expect(arquivosInexistentes).toEqual([]);
  });
});
