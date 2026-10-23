import { describe, expect, it, vi } from "vitest";
import {
  GoogleAdmissionTestService,
  type GoogleAdmissionTestGateway,
  type GoogleTesteEntrada
} from "../../api/src/admissoes/google-admissao-teste.service.js";

const entrada: GoogleTesteEntrada = {
  testId: "ficticio-001",
  colaborador: {
    processoId: "TESTE-ficticio-001",
    nomeCompleto: "Colaborador Ficticio",
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
    numero: "1",
    bairro: "Centro",
    municipio: "Sao Paulo",
    uf: "SP",
    telefone: "11999999999",
    email: "teste@example.invalid"
  },
  arquivosColaborador: [{ tipo: "cpf", nome: "cpf.pdf", mimeType: "application/pdf", dados: new Uint8Array([1]) }],
  dependentes: []
};

function gateway(): GoogleAdmissionTestGateway {
  return {
    rootFolderId: "root",
    validarPlanilha: vi.fn().mockResolvedValue(undefined),
    lerLinhas: vi
      .fn()
      .mockImplementation(async (sheet: string) =>
        sheet.startsWith("colab")
          ? [
              [
                "ID",
                "NOME COMPLETO",
                "NOME SOCIAL",
                "DATA DE NASCIMENTO",
                "CPF",
                "SEXO",
                "RAÇA/COR",
                "ESTADO CIVIL",
                "NACIONALIDADE",
                "NATURALIDADE",
                "NOME DA MÃE",
                "NOME DO PAI",
                "CEP",
                "ENDEREÇO",
                "N°/COMPLEMENTO",
                "BAIRRO",
                "CIDADE",
                "UF",
                "TELEFONE",
                "E-MAIL",
                "RG (LINK DO ANEXO)",
                "CPF (LINK DO ANEXO)",
                "TÍTULO DE ELEITOR (LINK DO ANEXO)",
                "CERTIDÃO NASC./CASAMENTO (LINK DO ANEXO)",
                "COMPROVANTE RESIDÊNCIA (LINK DO ANEXO)",
                "FOTO 3X4 (LINK DO ANEXO)",
                "CTPS DIGITAL (LINK DO ANEXO)",
                "PIS/PASEP/NIT (LINK DO ANEXO)",
                "CERTIFICADO RESERVISTA (LINK DO ANEXO)",
                "COMPROVANTE ESCOLARIDADE (LINK DO ANEXO)",
                "CERTIFICADOS PROFISSIONAIS (LINK DO ANEXO)",
                "ASO ADMISSIONAL (LINK DO ANEXO)",
                "STATUS DOCUMENTOS"
              ]
            ]
          : [
              [
                "id",
                "Identificador do colaborador;",
                "Nome do dependente;",
                "Data de nascimento;",
                "Parentesco;",
                "CPF;",
                "Finalidades;",
                "Links dos documentos;"
              ]
            ]
      ),
    localizarOuCriarPasta: vi.fn().mockImplementation(async (name: string) => ({
      id: name,
      name,
      mimeType: "application/vnd.google-apps.folder",
      link: `https://drive.test/${name}`
    })),
    localizarArquivo: vi.fn().mockResolvedValue(null),
    enviarArquivo: vi
      .fn()
      .mockResolvedValue({ id: "file", name: "cpf.pdf", mimeType: "application/pdf", link: "https://drive.test/file" }),
    inserirLinha: vi.fn().mockResolvedValue({ updatedRange: "A2:AG2" })
  };
}

describe("executor isolado da sincronizacao Google de admissao", () => {
  it("gera a previa sem depender da migration 0062", () => {
    const service = new GoogleAdmissionTestService(gateway());
    expect(service.prepararPlano(entrada)).toMatchObject({
      processoFolderName: "TESTE ADMISSAO - ficticio-001",
      collaboratorRows: 1,
      dependentRows: 0
    });
  });

  it("usa pastas deterministicas, preserva o mapeamento e insere colaborador separado", async () => {
    const fake = gateway();
    const service = new GoogleAdmissionTestService(fake);
    await service.executar(entrada);
    expect(fake.localizarOuCriarPasta).toHaveBeenCalledWith("TESTE ADMISSAO - ficticio-001", "root");
    expect(fake.inserirLinha).toHaveBeenCalledTimes(1);
    expect((fake.inserirLinha as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toBe(2);
    const linha = (fake.inserirLinha as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as unknown[];
    expect(linha).toContain("https://drive.test/file");
  });

  it("registra cada dependente em uma linha separada", async () => {
    const fake = gateway();
    const comDependente: GoogleTesteEntrada = {
      ...entrada,
      dependentes: [
        {
          id: "dependente-1",
          processoId: entrada.colaborador.processoId,
          nomeCompleto: "Dependente Ficticio",
          nascimento: "2018-02-03",
          parentesco: "Filho(a)",
          cpf: "11144477735",
          finalidades: ["Salario-familia"],
          arquivos: [
            { tipo: "cpf", nome: "dependente-cpf.pdf", mimeType: "application/pdf", dados: new Uint8Array([2]) }
          ]
        }
      ]
    };
    await new GoogleAdmissionTestService(fake).executar(comDependente);
    expect(fake.inserirLinha).toHaveBeenCalledTimes(2);
    expect((fake.inserirLinha as ReturnType<typeof vi.fn>).mock.calls[1]?.[0]).toBe("dependentes.tnp (filter)");
  });

  it("preserva a coluna id e aceita status ausente no layout real de dependentes", async () => {
    const fake = gateway();
    const dependente = {
      id: "dependente-1",
      processoId: entrada.colaborador.processoId,
      nomeCompleto: "Dependente Ficticio",
      nascimento: "2018-02-03",
      parentesco: "Filho(a)",
      cpf: "11144477735",
      finalidades: ["Salario-familia"],
      arquivos: [{ tipo: "cpf", nome: "dependente-cpf.pdf", mimeType: "application/pdf", dados: new Uint8Array([2]) }]
    };

    await new GoogleAdmissionTestService(fake).executar({ ...entrada, dependentes: [dependente] });
    const linha = (fake.inserirLinha as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as unknown[];

    expect(linha).toHaveLength(8);
    expect(linha[0]).toBeNull();
    expect(linha[1]).toBe(entrada.colaborador.processoId);
    expect(linha[2]).toBe("Dependente Ficticio");
    expect(linha[7]).toContain("https://drive.test/file");
  });

  it("aceita cabeçalhos reais com linha deslocada, quebra de linha e pontuação", async () => {
    const fake = gateway();
    const colabBase = await fake.lerLinhas("colab.tnp (filter)");
    const dependenteBase = await fake.lerLinhas("dependentes.tnp (filter)");
    // O gateway é assíncrono; o mock precisa devolver uma Promise por cenário.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (fake.lerLinhas as ReturnType<typeof vi.fn>).mockImplementation((sheet: string) => {
      if (sheet.startsWith("colab")) {
        return Promise.resolve([
          [],
          [],
          [],
          [],
          (colabBase[0] ?? []).map((celula, indice) => {
            if (indice === 1) return `${String(celula)}\n`;
            if (indice === 6) return "RAÇA COR";
            return celula;
          })
        ]);
      }
      return Promise.resolve([(dependenteBase[0] ?? []).map((celula) => `${String(celula)};`)]);
    });
    await expect(new GoogleAdmissionTestService(fake).executar(entrada)).resolves.toMatchObject({
      collaboratorRange: "A2:AG2"
    });
    expect((fake.inserirLinha as ReturnType<typeof vi.fn>).mock.calls[0]?.[2]).toBe(12);
  });

  it("recusa duas linhas candidatas de cabeçalho", async () => {
    const fake = gateway();
    const original = await fake.lerLinhas("colab.tnp (filter)");
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (fake.lerLinhas as ReturnType<typeof vi.fn>).mockImplementation((sheet: string) =>
      Promise.resolve(sheet.startsWith("colab") ? [original[0], original[0]] : original)
    );

    await expect(new GoogleAdmissionTestService(fake).executar(entrada)).rejects.toMatchObject({
      duplicados: [expect.stringContaining("NOME COMPLETO")]
    });
    expect(fake.localizarOuCriarPasta).not.toHaveBeenCalled();
  });

  it("recusa uma aba sem a âncora obrigatória", async () => {
    const fake = gateway();
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (fake.lerLinhas as ReturnType<typeof vi.fn>).mockImplementation((sheet: string) =>
      Promise.resolve(sheet.startsWith("colab") ? [["ID", "CPF"]] : [["Nome do dependente"]])
    );

    await expect(new GoogleAdmissionTestService(fake).executar(entrada)).rejects.toMatchObject({
      faltantes: ["NOME COMPLETO"]
    });
    expect(fake.localizarOuCriarPasta).not.toHaveBeenCalled();
  });

  it("recusa o mesmo ID já existente na planilha", async () => {
    const fake = gateway();
    const colabLinhas = await fake.lerLinhas("colab.tnp (filter)");
    const dependenteLinhas = await fake.lerLinhas("dependentes.tnp (filter)");
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (fake.lerLinhas as ReturnType<typeof vi.fn>).mockImplementation((sheet: string) => {
      return Promise.resolve(
        sheet.startsWith("colab") ? [...colabLinhas, ["TESTE-ficticio-001", "Existente"]] : dependenteLinhas
      );
    });
    await expect(new GoogleAdmissionTestService(fake).executar(entrada)).rejects.toThrow("ja possui linha");
    expect(fake.localizarOuCriarPasta).not.toHaveBeenCalled();
  });

  it("recusa o mesmo dependente já existente na aba exclusiva", async () => {
    const fake = gateway();
    const colabLinhas = await fake.lerLinhas("colab.tnp (filter)");
    const dependenteLinhas = await fake.lerLinhas("dependentes.tnp (filter)");
    const dependente = {
      id: "dependente-1",
      processoId: entrada.colaborador.processoId,
      nomeCompleto: "Dependente Ficticio",
      nascimento: "2018-02-03",
      parentesco: "Filho(a)",
      cpf: "11144477735",
      finalidades: ["Salario-familia"],
      arquivos: []
    };
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    (fake.lerLinhas as ReturnType<typeof vi.fn>).mockImplementation((sheet: string) =>
      Promise.resolve(
        sheet.startsWith("colab")
          ? colabLinhas
          : [...dependenteLinhas, [null, entrada.colaborador.processoId, dependente.nomeCompleto]]
      )
    );
    await expect(
      new GoogleAdmissionTestService(fake).executar({ ...entrada, dependentes: [dependente] })
    ).rejects.toThrow("ja possui o dependente");
    expect(fake.localizarOuCriarPasta).not.toHaveBeenCalled();
  });
});
