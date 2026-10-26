import "dotenv/config";
import { GoogleDriveService } from "../api/src/google/google-drive.service.js";
import { GoogleSheetsService } from "../api/src/google/google-sheets.service.js";
import {
  GoogleAdmissionTestService,
  type GoogleTesteArquivo,
  type GoogleTesteEntrada
} from "../api/src/admissoes/google-admissao-teste.service.js";

function argumento(nome: string): string | undefined {
  const prefixo = `--${nome}=`;
  return process.argv.find((item) => item.startsWith(prefixo))?.slice(prefixo.length);
}

const testId = argumento("test-id") ?? `local-${Date.now().toString(36)}`;
const confirmar = process.argv.includes("--confirmar-gravacao");

const arquivo = (tipo: string, nome: string, mimeType = "application/pdf"): GoogleTesteArquivo => ({
  tipo,
  nome,
  mimeType,
  dados: new TextEncoder().encode(`arquivo ficticio do teste ${testId}: ${tipo}`)
});
const entrada: GoogleTesteEntrada = {
  testId,
  colaborador: {
    processoId: `TESTE-${testId}`,
    nomeCompleto: "Colaborador Ficticio do Teste",
    cpf: "52998224725",
    nascimento: "1990-01-01",
    sexo: "Nao informado",
    estadoCivil: "Solteiro(a)",
    racaCor: "Nao declarado",
    nacionalidade: "Brasileira",
    naturalidade: "Cidade Ficticia",
    nomeMae: "Mae Ficticia",
    cep: "01001000",
    logradouro: "Rua Ficticia",
    numero: "100",
    bairro: "Centro",
    municipio: "Sao Paulo",
    uf: "SP",
    telefone: "11999999999",
    email: `teste-${testId}@example.invalid`
  },
  arquivosColaborador: [
    arquivo("cpf", "cpf-teste.pdf"),
    arquivo("comprovante_residencia", "residencia-teste.pdf"),
    arquivo("rg", "rg-teste.pdf"),
    arquivo("titulo_eleitor", "titulo-teste.pdf"),
    arquivo("certidao_nascimento_casamento", "certidao-teste.pdf"),
    arquivo("foto_3x4", "foto-teste.jpg", "image/jpeg"),
    arquivo("ctps_digital", "ctps-teste.pdf"),
    arquivo("pis_pasep_nit", "pis-teste.pdf"),
    arquivo("certificado_reservista", "reservista-teste.pdf"),
    arquivo("comprovante_escolaridade", "escolaridade-teste.pdf"),
    arquivo("certificados_profissionais", "certificados-teste.pdf"),
    arquivo("aso_admissional", "aso-teste.pdf")
  ],
  dependentes: [
    {
      id: `dependente-${testId}`,
      processoId: `TESTE-${testId}`,
      nomeCompleto: "Dependente Ficticio",
      nascimento: "2018-02-03",
      parentesco: "Filho(a)",
      cpf: "11144477735",
      finalidades: ["Salario-familia"],
      arquivos: [
        arquivo("certidao_nascimento_rg", "certidao-dependente-teste.pdf"),
        arquivo("cpf", "cpf-dependente-teste.pdf"),
        arquivo("cartao_vacina", "vacina-dependente-teste.pdf"),
        arquivo("comprovante_escolaridade", "escolaridade-dependente-teste.pdf")
      ]
    }
  ]
};

if (!confirmar) {
  const previa = new GoogleAdmissionTestService({
    rootFolderId: "somente-previa",
    validarPlanilha: async () => undefined,
    lerLinhas: async () => [],
    localizarOuCriarPasta: async () => {
      throw new Error("nao deve chamar o Google no modo previa");
    },
    localizarArquivo: async () => {
      throw new Error("nao deve chamar o Google no modo previa");
    },
    enviarArquivo: async () => {
      throw new Error("nao deve chamar o Google no modo previa");
    },
    inserirLinha: async () => {
      throw new Error("nao deve chamar o Google no modo previa");
    }
  }).prepararPlano(entrada);
  console.info(JSON.stringify(previa, null, 2));
  console.info("Nenhuma chamada ao Google foi executada.");
  console.info(
    "Para executar gravacoes, use --confirmar-gravacao e PRALIS_GOOGLE_TESTE_CONFIRMADO=SIM em desenvolvimento."
  );
  process.exit(0);
}
if (process.env["NODE_ENV"] === "production" || process.env["PRALIS_GOOGLE_TESTE_CONFIRMADO"] !== "SIM") {
  throw new Error("Teste Google recusado: exige NODE_ENV diferente de production e confirmacao explicita.");
}

const drive = new GoogleDriveService();
const sheets = new GoogleSheetsService();
const tituloPlanilhaTeste = process.env["GOOGLE_TESTE_PLANILHA_TITULO"]?.trim();
const service = new GoogleAdmissionTestService({
  rootFolderId: (await import("../api/src/google/google-auth.js")).idsGoogleConfigurados().driveFolderId,
  validarPlanilha: (tituloEsperado) => sheets.validarIdentidade(tituloPlanilhaTeste || tituloEsperado),
  lerLinhas: (sheet) => sheets.lerLinhas(sheet),
  localizarOuCriarPasta: (nome, parentId) => drive.localizarOuCriarPasta(nome, parentId),
  localizarArquivo: (nome, parentId, mimeType) => drive.localizarArquivo(nome, parentId, mimeType),
  enviarArquivo: (input) => drive.enviarArquivo(input),
  inserirLinha: (sheet, linha, primeiraLinha) => sheets.inserirLinhaSemSobrescrever(sheet, linha, primeiraLinha)
});
try {
  console.info(JSON.stringify(await service.executar(entrada), null, 2));
} catch (error) {
  // O executor nunca deve deixar uma rejeição top-level chegar ao runtime do Node: em Windows
  // isso pode terminar com uma asserção nativa e esconder o erro seguro retornado pelo Google.
  console.error(error instanceof Error ? error.message : "Teste Google falhou");
  process.exitCode = 1;
}
