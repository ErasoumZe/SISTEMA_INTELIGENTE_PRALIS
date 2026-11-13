import {
  criarCargoPadraoPayloadSchema,
  contaPostoEmpresaPayloadSchema,
  trocarCargoContaPostoPayloadSchema,
  type CargosAcessoResumo,
  type ContaPostoCargo
} from "@padaria/shared/permissoes";
import type { DadosExternos } from "@padaria/shared/api";
import { diaNegocio } from "@padaria/shared/datas";
import {
  normalizarNomeCargo,
  permissoesPorCargo,
  regrasPermissoes as regrasPermissoesReferencia
} from "@padaria/db/referencia-permissoes";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { buscarCargoEmpresaRepository, listarEmpresasUsuarioRepository } from "../usuarios/usuarios.repository.js";
import {
  apagarAcessoIndividualRepository,
  buscarRoleUsuarioRepository,
  criarCargoComRegrasRepository,
  listarCargosDaEmpresaRepository,
  listarContasPostoRepository,
  travarContaPostoRepository,
  trocarCargoAtivoRepository
} from "./cargos-acesso.repository.js";

// Aba "Cargos" de Permissoes (Marco, 13/11/2026): restaurar o padrao de um cargo, criar o cargo de
// referencia que ainda nao existe na empresa (ex.: "Caixa Gerente", R-238) e trocar o cargo das contas
// de posto do Caixa. O cargo de quem e do DP nao muda por aqui.

const nomesReferencia = Object.keys(permissoesPorCargo);

// Conta de posto e login compartilhado do Caixa: so fica em Caixa (PDV 1-3) ou Caixa Gerente (PDV 4,
// R-238). Cargos como Tesouraria ou Gerencia dao poderes pelo NOME (ajustar saldo, conferir) e nao
// podem cair num login de posto por aqui.
const cargosDePosto = new Set(["Caixa", "Caixa Gerente"].map(normalizarNomeCargo));
const aceitaContaPosto = (nome: string) => cargosDePosto.has(normalizarNomeCargo(nome));

type Ator = PerfilComEmpresa & { role?: string };

function exigirEmpresa(perfil: Ator | undefined, empresaId: string) {
  if (!perfil || !podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function nomeReferencia(nome: string) {
  const alvo = normalizarNomeCargo(nome);
  return nomesReferencia.find((referencia) => normalizarNomeCargo(referencia) === alvo) ?? null;
}

function rotuloPosto(pdvNome: string, turno: "manha" | "tarde" | null) {
  if (turno === "manha") return `${pdvNome} · Manhã`;
  if (turno === "tarde") return `${pdvNome} · Tarde`;
  return pdvNome;
}

export async function resumirCargosAcesso(empresaId: string, perfil?: Ator): Promise<CargosAcessoResumo> {
  exigirEmpresa(perfil, empresaId);
  const [linhasCargos, linhasContas] = await Promise.all([
    listarCargosDaEmpresaRepository(empresaId),
    listarContasPostoRepository(empresaId)
  ]);
  const existentes = new Set(linhasCargos.map((cargo) => normalizarNomeCargo(cargo.nome)));
  const contas = new Map<string, ContaPostoCargo>();
  for (const linha of linhasContas) {
    if (contas.has(linha.usuarioId)) continue;
    contas.set(linha.usuarioId, {
      usuarioId: linha.usuarioId,
      nome: linha.nome,
      email: linha.email,
      posto: rotuloPosto(linha.pdvNome, linha.turnoCaixa),
      cargoId: linha.cargoId,
      cargoNome: linha.cargoNome,
      acessoIndividual: Object.keys(linha.regrasIndividuais ?? {}).length > 0
    });
  }
  return {
    cargos: linhasCargos.map((cargo) => ({
      id: cargo.id,
      nome: cargo.nome,
      temPadrao: nomeReferencia(cargo.nome) !== null,
      aceitaContaPosto: aceitaContaPosto(cargo.nome),
      permitidas: Object.values(cargo.regras ?? {}).filter(Boolean).length,
      pessoas: Number(cargo.pessoas)
    })),
    padroesFaltando: nomesReferencia.filter((nome) => !existentes.has(normalizarNomeCargo(nome))),
    contasPosto: [...contas.values()]
  };
}

export async function criarCargoPadrao(body: DadosExternos, perfil?: Ator) {
  const dados = criarCargoPadraoPayloadSchema.parse(body);
  exigirEmpresa(perfil, dados.empresaId);
  const nome = nomeReferencia(dados.nome);
  const lista = nome ? permissoesPorCargo[nome] : undefined;
  if (!nome || !lista) throw erroValidacao(`O cargo "${dados.nome}" nao tem um padrao de referencia.`);
  return executarEmTransacao(async (tx) => {
    const existentes = await listarCargosDaEmpresaRepository(dados.empresaId, tx);
    if (existentes.some((cargo) => normalizarNomeCargo(cargo.nome) === normalizarNomeCargo(nome)))
      throw conflito(`O cargo "${nome}" ja existe nesta empresa.`, "CARGO_JA_EXISTE");
    const id = await criarCargoComRegrasRepository(
      { empresaId: dados.empresaId, nome, regras: regrasPermissoesReferencia(lista) },
      tx
    );
    return { id, nome };
  });
}

async function travarContaDePosto(usuarioId: string, empresaId: string, perfil: Ator | undefined, tx: TransacaoBanco) {
  const conta = await travarContaPostoRepository(usuarioId, empresaId, tx);
  if (!conta) throw naoEncontrado("Conta nao encontrada nesta empresa");
  if (!conta.pdvPadraoId) throw erroValidacao("Por aqui so se mexe nas contas de posto do Caixa.", "CONTA_SEM_POSTO");
  // Cargo e regras individuais valem em TODAS as empresas da conta: quem edita precisa alcancar todas
  // (mesmo desenho de salvarPermissao).
  const liberadas = perfil ? empresasPermitidas(perfil) : [];
  const empresasDaConta = (await listarEmpresasUsuarioRepository(usuarioId, tx)).map((item) => item.empresaId);
  if (empresasDaConta.some((id) => !liberadas.includes(id)))
    throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  // Conta com papel de administrador so e mexida por administrador (mesma trava de usuarios.service).
  const role = await buscarRoleUsuarioRepository(usuarioId, tx);
  if (role !== "usuario_comum" && perfil?.role !== "usuario_admin")
    throw proibido("Acao restrita a usuario administrador", "FORBIDDEN_PRIVILEGE");
  return conta;
}

export async function trocarCargoContaPosto(usuarioId: string, body: DadosExternos, perfil?: Ator) {
  const dados = trocarCargoContaPostoPayloadSchema.parse(body);
  exigirEmpresa(perfil, dados.empresaId);
  return executarEmTransacao(async (tx) => {
    const cargo = await buscarCargoEmpresaRepository(dados.cargoId, tx);
    if (!cargo || cargo.empresaId !== dados.empresaId) throw naoEncontrado("Cargo nao encontrado nesta empresa");
    if (!aceitaContaPosto(cargo.nome))
      throw erroValidacao("Conta de posto so pode ficar no cargo Caixa ou Caixa Gerente.", "CARGO_NAO_E_DE_POSTO");
    const conta = await travarContaDePosto(usuarioId, dados.empresaId, perfil, tx);
    await trocarCargoAtivoRepository(
      {
        empresaId: dados.empresaId,
        colaboradorId: conta.id,
        setorId: conta.setorId,
        cargoId: dados.cargoId,
        hoje: diaNegocio(new Date())
      },
      tx
    );
    return { usuarioId, cargoId: dados.cargoId, cargoNome: cargo.nome };
  });
}

// A conta de posto passa a seguir so o cargo: as regras salvas em "Acessos por pessoa" saem.
export async function seguirSoOCargo(usuarioId: string, body: DadosExternos, perfil?: Ator) {
  const { empresaId } = contaPostoEmpresaPayloadSchema.parse(body);
  exigirEmpresa(perfil, empresaId);
  return executarEmTransacao(async (tx) => {
    await travarContaDePosto(usuarioId, empresaId, perfil, tx);
    await apagarAcessoIndividualRepository(usuarioId, tx);
    return { usuarioId, acessoIndividual: false };
  });
}
