import {
  excluirPermissaoQuerySchema,
  permissaoPayloadSchema,
  permissoesPaginadasQuerySchema,
  type ExcluirPermissaoQuery,
  type PermissoesPaginadasQuery
} from "@padaria/shared/permissoes";
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
import { empresasPermitidas, filtrarPorEmpresas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { normalizarBusca, falharValidacao } from "../utils.js";
import { buscarCargoEmpresaRepository, listarEmpresasUsuarioRepository } from "../usuarios/usuarios.repository.js";
import { buscarSetorEmpresaRepository } from "../setores/setores.repository.js";
import {
  excluirPermissaoCargoRepository,
  excluirPermissaoSetorRepository,
  excluirPermissaoUsuarioRepository,
  listarPermissoesRepository,
  substituirPermissoesCargoRepository,
  substituirPermissoesSetorRepository,
  substituirPermissoesUsuarioRepository
} from "./permissoes.repository.js";

type DadosPermissoesRepository = Awaited<ReturnType<typeof listarPermissoesRepository>>;
type UsuarioPermissaoLinha = DadosPermissoesRepository["usuarios"][number];
type DadosPermissoes = {
  permissoes: DadosPermissoesRepository["permissoes"];
  cargos: DadosPermissoesRepository["cargos"];
  cargosPermissoes: DadosPermissoesRepository["cargosPermissoes"];
  setores: DadosPermissoesRepository["setores"];
  setoresPermissoes: DadosPermissoesRepository["setoresPermissoes"];
  usuarios: DadosPermissoesRepository["usuarios"];
  usuariosPermissoes: DadosPermissoesRepository["usuariosPermissoes"];
};

function filtrarUsuariosPorEmpresas(usuarios: UsuarioPermissaoLinha[], escopoDados: string[] | null): UsuarioPermissaoLinha[] {
  if (!escopoDados) return usuarios;
  return usuarios.filter((usuario) => {
    const ids = Array.isArray(usuario.empresaIds) ? usuario.empresaIds : usuario.empresaId ? [usuario.empresaId] : [];
    return escopoDados.some((empresaId) => ids.includes(empresaId));
  });
}

function empresaNoEscopo(perfil: PerfilComEmpresa | undefined, empresaId: string): boolean {
  return !perfil || podeAcessarEmpresa(perfil, empresaId);
}

function todasEmpresasNoEscopo(perfil: PerfilComEmpresa | undefined, empresaIds: string[]): boolean {
  if (!perfil) return true;
  const permitidas = empresasPermitidas(perfil);
  return permitidas === null || empresaIds.every((empresaId) => permitidas.includes(empresaId));
}

export async function listarPermissoes(
  _empresasLiberadas: string[] | null,
  escopoDados: string[] | null
): Promise<DadosPermissoes> {
  const dados = await listarPermissoesRepository();
  const cargosVisiveis = filtrarPorEmpresas(dados.cargos, escopoDados);
  const setoresVisiveis = filtrarPorEmpresas(dados.setores, escopoDados);
  const usuariosVisiveis = filtrarUsuariosPorEmpresas(dados.usuarios, escopoDados);
  const cargosVisiveisIds = new Set(cargosVisiveis.map((cargo) => cargo.id));
  const setoresVisiveisIds = new Set(setoresVisiveis.map((setor) => setor.id));
  const usuariosVisiveisIds = new Set(usuariosVisiveis.map((usuario) => usuario.usuarioId));
  return {
    permissoes: dados.permissoes,
    cargos: cargosVisiveis,
    cargosPermissoes: dados.cargosPermissoes.filter((item) => cargosVisiveisIds.has(item.cargoId)),
    setores: setoresVisiveis,
    setoresPermissoes: dados.setoresPermissoes.filter((item) => setoresVisiveisIds.has(item.setorId)),
    usuarios: usuariosVisiveis,
    usuariosPermissoes: dados.usuariosPermissoes.filter((item) => usuariosVisiveisIds.has(item.usuarioId))
  };
}

function montarLinhasPermissoes(dados: DadosPermissoes) {
  const linhaRegras = (regras: RegrasPermissoes | null | undefined) => {
    const entradas = Object.entries(regras ?? {}).filter(
      (entrada): entrada is [Permissao, boolean] => typeof entrada[1] === "boolean"
    );
    return {
      permissao: entradas.map(([permissao]) => permissao).join(","),
      regras: entradas.map(([permissao, permitir]) => `${permissao}: ${permitir ? "permitir" : "negar"}`).join("; "),
      regrasJson: JSON.stringify(Object.fromEntries(entradas))
    };
  };

  return [
    ...dados.cargosPermissoes.flatMap((item) => {
      const cargo = dados.cargos.find((alvo) => alvo.id === item.cargoId);
      if (!cargo) return [];
      const regras = linhaRegras(item.regras);
      if (!regras.permissao) return [];
      return [{ id: `cargo:${item.cargoId}`, tipo: "cargo" as const, tipoPermissao: "cargo" as const, alvoId: item.cargoId, alvo: cargo.nome ?? item.cargoId, cargoId: item.cargoId, ...regras }];
    }),
    ...dados.setoresPermissoes.flatMap((item) => {
      const setor = dados.setores.find((alvo) => alvo.id === item.setorId);
      if (!setor?.id) return [];
      const regras = linhaRegras(item.regras);
      if (!regras.permissao) return [];
      return [{ id: `setor:${setor.id}`, tipo: "setor" as const, tipoPermissao: "setor" as const, alvoId: setor.id, alvo: setor.nome ?? setor.id, setorId: setor.id, ...regras }];
    }),
    ...dados.usuariosPermissoes.flatMap((item) => {
      const usuario = dados.usuarios.find((alvo) => alvo.usuarioId === item.usuarioId);
      if (!usuario?.usuarioId) return [];
      const regras = linhaRegras(item.regras);
      if (!regras.permissao) return [];
      return [{ id: `usuario:${usuario.usuarioId}`, tipo: "usuario" as const, tipoPermissao: "usuario" as const, alvoId: usuario.usuarioId, alvo: usuario.nome ?? usuario.email ?? usuario.usuarioId, usuarioId: usuario.usuarioId, ...regras }];
    })
  ].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.alvo.localeCompare(b.alvo));
}

export async function listarPermissoesPaginadas(body: unknown, perfil?: PerfilComEmpresa) {
  const query: PermissoesPaginadasQuery = permissoesPaginadasQuerySchema.parse(body);
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  const escopoDados = query.empresaId ? [query.empresaId] : empresasLiberadas;
  const dados = await listarPermissoes(empresasLiberadas, escopoDados);
  const busca = normalizarBusca(query.q);

  const linhas = montarLinhasPermissoes(dados).filter((linha) => {
    if (query.tipoPermissao && linha.tipoPermissao !== query.tipoPermissao) return false;
    if (query.alvoId && linha.alvoId !== query.alvoId) return false;
    if (query.permissao && !linha.permissao.split(",").includes(query.permissao)) return false;
    if (!busca) return true;
    return normalizarBusca(`${linha.tipo} ${linha.alvo} ${linha.permissao}`).includes(busca);
  });

  const total = linhas.length;
  const inicio = (query.page - 1) * query.pageSize;
  return { itens: linhas.slice(inicio, inicio + query.pageSize), total, page: query.page, pageSize: query.pageSize };
}

export async function excluirPermissao(body: unknown, perfil?: PerfilComEmpresa) {
  const query: ExcluirPermissaoQuery = excluirPermissaoQuerySchema.parse(body);
  if (query.empresaId && perfil && !podeAcessarEmpresa(perfil, query.empresaId)) falharValidacao("Empresa nao permitida");

  if (query.tipoPermissao === "cargo") {
    const cargo = await buscarCargoEmpresaRepository(query.alvoId);
    if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) falharValidacao("Empresa nao permitida");
    if (query.empresaId && cargo.empresaId !== query.empresaId) falharValidacao("Empresa nao permitida");
    await excluirPermissaoCargoRepository(query.alvoId, query.permissao);
    return { ok: true };
  }

  if (query.tipoPermissao === "setor") {
    const setor = await buscarSetorEmpresaRepository(query.alvoId);
    if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) falharValidacao("Empresa nao permitida");
    if (query.empresaId && setor.empresaId !== query.empresaId) falharValidacao("Empresa nao permitida");
    await excluirPermissaoSetorRepository(query.alvoId, query.permissao);
    return { ok: true };
  }

  const empresasDoUsuario = await listarEmpresasUsuarioRepository(query.alvoId);
  const empresaIds = empresasDoUsuario.map((empresa) => empresa.empresaId);
  if (!empresaIds.length || !todasEmpresasNoEscopo(perfil, empresaIds)) falharValidacao("Empresa nao permitida");
  if (query.empresaId && !empresaIds.includes(query.empresaId)) falharValidacao("Empresa nao permitida");
  await excluirPermissaoUsuarioRepository(query.alvoId, query.permissao);
  return { ok: true };
}

export async function salvarPermissao(body: unknown, usuarioId?: string, perfil?: PerfilComEmpresa) {
  const dados = permissaoPayloadSchema.parse(body);

  if (dados.tipoPermissao === "cargo") {
    if (!dados.cargoId) falharValidacao("Cargo obrigatorio");
    const cargo = await buscarCargoEmpresaRepository(dados.cargoId);
    if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) falharValidacao("Empresa nao permitida");
    await substituirPermissoesCargoRepository(dados.cargoId, dados.regras);
    return { tipoPermissao: dados.tipoPermissao, cargoId: dados.cargoId, regras: dados.regras, atualizadoPor: usuarioId };
  }

  if (dados.tipoPermissao === "setor") {
    if (!dados.setorId) falharValidacao("Setor obrigatorio");
    const setor = await buscarSetorEmpresaRepository(dados.setorId);
    if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) falharValidacao("Empresa nao permitida");
    await substituirPermissoesSetorRepository(dados.setorId, dados.regras);
    return { tipoPermissao: dados.tipoPermissao, setorId: dados.setorId, regras: dados.regras, atualizadoPor: usuarioId };
  }

  if (!dados.usuarioId) falharValidacao("Usuario obrigatorio");
  const empresasDoUsuario = await listarEmpresasUsuarioRepository(dados.usuarioId);
  if (!empresasDoUsuario.length || !todasEmpresasNoEscopo(perfil, empresasDoUsuario.map((empresa) => empresa.empresaId))) {
    falharValidacao("Empresa nao permitida");
  }
  await substituirPermissoesUsuarioRepository(dados.usuarioId, dados.regras);
  return { tipoPermissao: dados.tipoPermissao, usuarioId: dados.usuarioId, regras: dados.regras, atualizadoPor: usuarioId };
}
