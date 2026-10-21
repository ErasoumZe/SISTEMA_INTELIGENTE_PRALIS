import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CadastroForm, Opcao } from "~/types/padaria";
import { formCadastroVazio, opcoesVazias } from "./domain";
import {
  criarAtualizadorCadastroLocal,
  listaGrupoCadastro,
  removerOpcao,
  upsertOpcao,
  type DepsCadastroLocal
} from "./cadastro-local";

function montarCenario(over: Partial<DepsCadastroLocal> = {}) {
  const opcoes = opcoesVazias();
  const empresas: Opcao[] = [];
  const onPermissoesSalvas = vi.fn();
  const deps: DepsCadastroLocal = {
    empresaId: () => "emp-1",
    opcoes: () => opcoes,
    empresas: () => empresas,
    onPermissoesSalvas,
    ...over
  };
  const { atualizarCadastroLocal } = criarAtualizadorCadastroLocal(deps);
  return { atualizarCadastroLocal, opcoes, empresas, onPermissoesSalvas };
}

function form(over: Partial<CadastroForm> = {}): CadastroForm {
  return { ...formCadastroVazio(), ...over };
}

describe("helpers puros", () => {
  it("upsertOpcao insere no topo e mescla ao atualizar", () => {
    const lista: Opcao[] = [{ id: "a", nome: "A" }];
    upsertOpcao(lista, { id: "b", nome: "B" });
    expect(lista.map((o) => o.id)).toEqual(["b", "a"]);
    upsertOpcao(lista, { id: "a", nome: "A2" });
    expect(lista.find((o) => o.id === "a")?.nome).toBe("A2");
  });

  it("removerOpcao remove por id (no-op se ausente)", () => {
    const lista: Opcao[] = [{ id: "a" }, { id: "b" }];
    removerOpcao(lista, "a");
    removerOpcao(lista, "z");
    expect(lista.map((o) => o.id)).toEqual(["b"]);
  });

  it("listaGrupoCadastro mapeia tipoGrupo para a lista certa", () => {
    const o = opcoesVazias();
    expect(listaGrupoCadastro(o, "mercadoria")).toBe(o.gruposMercadorias);
    expect(listaGrupoCadastro(o, "retirada")).toBe(o.gruposRetiradas);
    expect(listaGrupoCadastro(o, "vendas")).toBe(o.gruposVendas);
    expect(listaGrupoCadastro(o, "despesa")).toBe(o.gruposDespesas);
  });
});

describe("atualizarCadastroLocal", () => {
  it("retorna false sem id (nada muta)", () => {
    const { atualizarCadastroLocal, opcoes } = montarCenario();
    expect(atualizarCadastroLocal("contas", form({ nome: "X" }), undefined)).toBe(false);
    expect(opcoes.contas).toEqual([]);
  });

  it("contas com id recarrega fundo e usuarios da API", () => {
    const { atualizarCadastroLocal, opcoes } = montarCenario();
    opcoes.contas.push({ id: "c1", nome: "Antiga", saldoInicial: 100, usuariosIds: ["u1"] });

    expect(
      atualizarCadastroLocal("contas", form({ nome: "Editada", saldoInicial: "250", usuariosIds: ["u2"] }), "c1")
    ).toBe(false);
    expect(opcoes.contas[0]).toMatchObject({ nome: "Antiga", saldoInicial: 100, usuariosIds: ["u1"] });
  });

  it("empresas: upsert em empresas e opcoes.empresas (sem empresaId no item)", () => {
    const { atualizarCadastroLocal, opcoes, empresas } = montarCenario();
    expect(
      atualizarCadastroLocal(
        "empresas",
        form({ nome: "Padaria", cnpj: "123", fusoHorario: "America/Belem", comprasPrazoRespostaHoras: "48" }),
        "e1"
      )
    ).toBe(true);
    // A configuracao operacional entra no cache junto do nome: a grade que alimenta a PROXIMA
    // abertura do formulario e esta, e um item sem fuso/prazo fazia o salvar seguinte apagar o que
    // este acabou de gravar (fio-edicao-empresa.test.ts).
    const esperado = {
      id: "e1",
      nome: "Padaria",
      cnpj: "123",
      matriculaPrefixo: "TNP",
      fusoHorario: "America/Belem",
      comprasPrazoRespostaHoras: "48"
    };
    expect(empresas).toEqual([esperado]);
    expect(opcoes.empresas).toEqual([esperado]);
    expect(empresas[0]).not.toHaveProperty("empresaId");
  });

  it("pdv: grava contaId/ativo e carimba empresaId do item", () => {
    const { atualizarCadastroLocal, opcoes } = montarCenario();
    atualizarCadastroLocal("pdv", form({ nome: "Caixa 1", contaId: "c1", ativo: true }), "p1");
    expect(opcoes.pdvs[0]).toMatchObject({ id: "p1", empresaId: "emp-1", nome: "Caixa 1", contaId: "c1", ativo: true });
  });

  it("fornecedores: preserva documento e WhatsApp no cache apos salvar", () => {
    const { atualizarCadastroLocal, opcoes } = montarCenario();
    atualizarCadastroLocal(
      "fornecedores",
      form({ nome: "Fornecedor", documento: "12345678000199", whatsapp: "5511999999999" }),
      "forn1"
    );
    expect(opcoes.fornecedores[0]).toMatchObject({
      id: "forn1",
      nome: "Fornecedor",
      documento: "12345678000199",
      whatsapp: "5511999999999"
    });
  });

  it("clientes: mantem dataNascimento so quando o documento e CPF", () => {
    const cpf = montarCenario();
    cpf.atualizarCadastroLocal(
      "clientes",
      form({ nome: "Joao", documento: "12345678901", dataNascimento: "2000-01-01" }),
      "cli1"
    );
    expect(cpf.opcoes.clientes[0]?.dataNascimento).toBe("2000-01-01");

    const cnpj = montarCenario();
    cnpj.atualizarCadastroLocal(
      "clientes",
      form({ nome: "ACME", documento: "12345678000199", dataNascimento: "2000-01-01" }),
      "cli2"
    );
    expect(cnpj.opcoes.clientes[0]?.dataNascimento).toBeUndefined();
  });

  it("produtos: retorna false para forcar reload da API", () => {
    const { atualizarCadastroLocal, opcoes } = montarCenario();
    expect(atualizarCadastroLocal("produtos", form({ nome: "Pao" }), "prod1")).toBe(false);
    expect(opcoes.produtos).toEqual([]);
  });

  it("colaboradores: deriva cargoNome/descricao das listas de cargos e setores", () => {
    const cenario = montarCenario();
    cenario.opcoes.cargos.push({ id: "cg1", nome: "Padeiro" });
    cenario.opcoes.setores.push({ id: "st1", nome: "Producao" });
    cenario.atualizarCadastroLocal("colaboradores", form({ nome: "Ana", cargoId: "cg1", setorId: "st1" }), "col1");
    expect(cenario.opcoes.colaboradores[0]).toMatchObject({
      id: "col1",
      nome: "Ana",
      cargoId: "cg1",
      cargoNome: "Padeiro",
      cargos: ["Padeiro"],
      setorId: "st1",
      descricao: "Producao"
    });
  });

  it("grupos: remove de todas as listas e insere na do tipo", () => {
    const cenario = montarCenario();
    cenario.opcoes.gruposDespesas.push({ id: "g1", nome: "Antigo" });
    cenario.atualizarCadastroLocal("grupos", form({ nome: "Farinhas", tipoGrupo: "mercadoria", grupoPaiId: "" }), "g1");
    expect(cenario.opcoes.gruposDespesas).toEqual([]);
    expect(cenario.opcoes.gruposMercadorias[0]).toMatchObject({ id: "g1", nome: "Farinhas", tipoGrupo: "mercadoria" });
  });

  it("areas_setores: distingue setor de area", () => {
    const setorCase = montarCenario();
    setorCase.atualizarCadastroLocal(
      "areas_setores",
      form({ nome: "Salgados", tipoAreaSetor: "setor", areaId: "a1" }),
      "s1"
    );
    expect(setorCase.opcoes.setores[0]).toMatchObject({ id: "s1", tipoAreaSetor: "setor", areaId: "a1" });
    expect(setorCase.opcoes.areas).toEqual([]);

    const areaCase = montarCenario();
    areaCase.atualizarCadastroLocal("areas_setores", form({ nome: "Producao", tipoAreaSetor: "area" }), "a2");
    expect(areaCase.opcoes.areas[0]).toMatchObject({ id: "a2", tipoAreaSetor: "area" });
    expect(areaCase.opcoes.setores).toEqual([]);
  });

  it("usuarios: novoColaborador forca reload (false)", () => {
    const { atualizarCadastroLocal } = montarCenario();
    expect(atualizarCadastroLocal("usuarios", form({ novoColaborador: true }), "u1")).toBe(false);
  });

  it("usuarios: vincula o colaborador ao usuario (usuarioId cruzado)", () => {
    const cenario = montarCenario();
    cenario.opcoes.colaboradores.push({ id: "col1", nome: "Ana", setorId: "st1" });
    cenario.atualizarCadastroLocal(
      "usuarios",
      // O formulario novo nasce com `novoColaborador=true`; este caso prova o caminho de vinculo
      // a uma pessoa ja existente, portanto declara explicitamente o modo de edicao.
      form({ nome: "Ana", email: "ana@x.com", novoColaborador: false, colaboradorId: "col1", empresaIds: ["emp-1"] }),
      "u1"
    );
    expect(cenario.opcoes.usuarios[0]).toMatchObject({
      id: "u1",
      usuarioId: "u1",
      colaboradorId: "col1",
      setorId: "st1"
    });
    expect(cenario.opcoes.colaboradores[0]?.usuarioId).toBe("u1");
  });

  it("permissoes: dispara o callback e retorna true", () => {
    const { atualizarCadastroLocal, onPermissoesSalvas } = montarCenario();
    expect(atualizarCadastroLocal("permissoes", form(), "perm1")).toBe(true);
    expect(onPermissoesSalvas).toHaveBeenCalledOnce();
  });

  it("tela nao mapeada: retorna false", () => {
    const { atualizarCadastroLocal } = montarCenario();
    expect(atualizarCadastroLocal("inexistente", form(), "x1")).toBe(false);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
