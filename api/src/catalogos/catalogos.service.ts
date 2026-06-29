import { empresasPermitidas, filtrarPorEmpresas } from "../autorizacao/empresa.js";
import type { PerfilComEmpresa } from "../autorizacao/empresa.js";
import {
  listarAreasRepository,
  listarColaboradoresRepository,
  listarContasRepository,
  listarEmpresasRepository,
  listarFormasPagamentoRepository,
  listarFornecedoresRepository,
  listarGruposRepository,
  listarPermissoesRepository,
  listarPdvsRepository,
  listarProdutosRepository,
  listarSetoresRepository,
  listarUnidadesMedidaRepository,
  listarUsuariosRepository,
  type UsuarioCatalogoLinha
} from "./catalogos.repository.js";

function filtrarUsuariosPorEmpresas(
  usuarios: UsuarioCatalogoLinha[],
  empresasLiberadas: string[] | null,
  escopoDados: string[] | null
) {
  if (empresasLiberadas === null && !escopoDados) return usuarios;
  return usuarios.filter((usuario) => {
    const ids = Array.isArray(usuario.empresaIds) ? usuario.empresaIds : usuario.empresaId ? [usuario.empresaId] : [];
    return escopoDados?.some((empresaId) => ids.includes(empresaId));
  });
}

export async function listarEmpresas(perfil?: PerfilComEmpresa) {
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  const empresas = await listarEmpresasRepository();
  return empresasLiberadas === null ? empresas : empresas.filter((empresa) => empresasLiberadas.includes(empresa.id));
}

export async function listarContas(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarContasRepository(), escopoDados);
}

export async function listarFormasPagamento(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarFormasPagamentoRepository(), escopoDados);
}

export async function listarPdvs(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarPdvsRepository(), escopoDados);
}

export async function listarFornecedores(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarFornecedoresRepository(), escopoDados);
}

export async function listarColaboradores(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarColaboradoresRepository(), escopoDados);
}

export async function listarGrupos(escopoDados: string[] | null) {
  const grupos = await listarGruposRepository();
  return {
    gruposDespesas: filtrarPorEmpresas(grupos.gruposDespesas, escopoDados),
    gruposMercadorias: filtrarPorEmpresas(grupos.gruposMercadorias, escopoDados),
    gruposRetiradas: filtrarPorEmpresas(grupos.gruposRetiradas, escopoDados)
  };
}

export async function listarUnidadesMedida(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarUnidadesMedidaRepository(), escopoDados);
}

export async function listarAreasSetores(escopoDados: string[] | null) {
  const [areas, setores] = await Promise.all([listarAreasRepository(), listarSetoresRepository()]);
  return {
    areas: filtrarPorEmpresas(areas, escopoDados),
    setores: filtrarPorEmpresas(setores, escopoDados)
  };
}

export async function listarSetores(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarSetoresRepository(), escopoDados);
}

export async function listarProdutos(escopoDados: string[] | null) {
  return filtrarPorEmpresas(await listarProdutosRepository(), escopoDados);
}

export async function listarUsuarios(empresasLiberadas: string[] | null, escopoDados: string[] | null) {
  return filtrarUsuariosPorEmpresas(await listarUsuariosRepository(), empresasLiberadas, escopoDados);
}

export async function listarPermissoes(empresasLiberadas: string[] | null, escopoDados: string[] | null) {
  const dados = await listarPermissoesRepository();
  const cargosVisiveis = filtrarPorEmpresas(dados.cargos, escopoDados);
  const setoresVisiveis = filtrarPorEmpresas(dados.setores, escopoDados);
  const usuariosVisiveis = filtrarUsuariosPorEmpresas(dados.usuarios, empresasLiberadas, escopoDados);
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
