import type { DadosExternos } from "@padaria/shared/api";
import {
  excluirPermissaoQuerySchema,
  permissaoPayloadSchema,
  permissoesPaginadasQuerySchema,
  type ExcluirPermissaoQuery,
  type PermissoesPaginadasQuery
} from "@padaria/shared/permissoes";
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
import {
  permissoesPadraoDoCargo,
  regrasPermissoes as regrasPermissoesReferencia
} from "@padaria/db/referencia-permissoes";
import {
  empresasPermitidas,
  escopoEmpresaAtiva,
  filtrarPorEmpresas,
  podeAcessarEmpresa,
  type PerfilComEmpresa
} from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { proibido } from "../erros.js";
import { normalizarBusca, falharValidacao } from "../utils.js";
import {
  buscarCargoEmpresaRepository,
  listarEmpresasUsuarioRepository,
  type UsuarioLinha
} from "../usuarios/usuarios.repository.js";
// Mesmo recorte da rota GET /api/usuarios, de proposito: as duas rotas servem a MESMA linha
// (permissoes.repository.ts chama listarUsuariosRepository). Havia aqui uma copia literal do filtro
// de empresa; dois filtros gemeos sao exatamente onde o proximo furo se esconde.
import { recortarUsuariosPorEmpresas } from "../usuarios/usuarios.service.js";
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
type DadosPermissoes = {
  permissoes: DadosPermissoesRepository["permissoes"];
  cargos: DadosPermissoesRepository["cargos"];
  cargosPermissoes: DadosPermissoesRepository["cargosPermissoes"];
  setores: DadosPermissoesRepository["setores"];
  setoresPermissoes: DadosPermissoesRepository["setoresPermissoes"];
  // Ja recortado: UsuarioLinha, sem a procedencia por empresa que o repository carrega.
  usuarios: UsuarioLinha[];
  usuariosPermissoes: DadosPermissoesRepository["usuariosPermissoes"];
};

function empresaNoEscopo(perfil: PerfilComEmpresa | undefined, empresaId: string): boolean {
  return !perfil || podeAcessarEmpresa(perfil, empresaId);
}

function todasEmpresasNoEscopo(perfil: PerfilComEmpresa | undefined, empresaIds: string[]): boolean {
  if (!perfil) return true;
  const permitidas = empresasPermitidas(perfil);
  return empresaIds.every((empresaId) => permitidas.includes(empresaId));
}

// Recebe o escopo JA validado contra o perfil. O isolamento entre empresas depende inteiramente
// deste parametro, porque listarPermissoesRepository le as tabelas sem WHERE por empresa e o recorte
// acontece so aqui, em memoria.
export async function listarPermissoes(escopoDados: string[]): Promise<DadosPermissoes> {
  const dados = await listarPermissoesRepository();
  const cargosVisiveis = filtrarPorEmpresas(dados.cargos, escopoDados);
  const setoresVisiveis = filtrarPorEmpresas(dados.setores, escopoDados);
  const usuariosVisiveis = recortarUsuariosPorEmpresas(dados.usuarios, escopoDados);
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
      return [
        {
          id: `cargo:${item.cargoId}`,
          tipo: "cargo" as const,
          tipoPermissao: "cargo" as const,
          alvoId: item.cargoId,
          alvo: cargo.nome ?? item.cargoId,
          cargoId: item.cargoId,
          ...regras
        }
      ];
    }),
    ...dados.setoresPermissoes.flatMap((item) => {
      const setor = dados.setores.find((alvo) => alvo.id === item.setorId);
      if (!setor?.id) return [];
      const regras = linhaRegras(item.regras);
      if (!regras.permissao) return [];
      return [
        {
          id: `setor:${setor.id}`,
          tipo: "setor" as const,
          tipoPermissao: "setor" as const,
          alvoId: setor.id,
          alvo: setor.nome ?? setor.id,
          setorId: setor.id,
          ...regras
        }
      ];
    }),
    ...dados.usuariosPermissoes.flatMap((item) => {
      const usuario = dados.usuarios.find((alvo) => alvo.usuarioId === item.usuarioId);
      if (!usuario?.usuarioId) return [];
      const regras = linhaRegras(item.regras);
      if (!regras.permissao) return [];
      return [
        {
          id: `usuario:${usuario.usuarioId}`,
          tipo: "usuario" as const,
          tipoPermissao: "usuario" as const,
          alvoId: usuario.usuarioId,
          alvo: usuario.nome ?? usuario.email ?? usuario.usuarioId,
          usuarioId: usuario.usuarioId,
          ...regras
        }
      ];
    })
  ].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.alvo.localeCompare(b.alvo));
}

export async function listarPermissoesPaginadas(body: DadosExternos, perfil?: PerfilComEmpresa) {
  const query: PermissoesPaginadasQuery = permissoesPaginadasQuerySchema.parse(body);
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  // O empresaId da query so RESTRINGE o escopo do perfil, nunca o amplia. Antes o valor do cliente
  // virava escopo direto e, como listarPermissoesRepository le as tabelas inteiras, bastava informar
  // o uuid de outra empresa para receber os cargos, setores, usuarios e regras dela.
  //
  // A negacao sai como ErroDominio (padrao dos services deste repo, ver contas-usuarios, patrimonio,
  // pedidos e notas-fiscais), e nao como Error cru: o handler global responde 403 FORBIDDEN_COMPANY
  // sozinho, o controller nao precisa de status fixo, e falha tecnica do driver continua virando 500
  // logado em vez de ser confundida com negacao de empresa.
  if (query.empresaId && !empresasLiberadas.includes(query.empresaId)) {
    throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  }
  // Redundante de proposito: se alguem remover o guard acima, escopoEmpresaAtiva ainda lanca e a
  // requisicao morre em 500, em vez de voltar a vazar.
  const escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
  const dados = await listarPermissoes(escopoDados);
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

export async function excluirPermissao(body: DadosExternos, perfil?: PerfilComEmpresa) {
  const query: ExcluirPermissaoQuery = excluirPermissaoQuerySchema.parse(body);
  if (query.empresaId && perfil && !podeAcessarEmpresa(perfil, query.empresaId))
    falharValidacao("Empresa nao permitida");

  return executarEmTransacao(async (tx) => {
    if (query.tipoPermissao === "cargo") {
      const cargo = await buscarCargoEmpresaRepository(query.alvoId, tx);
      if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) falharValidacao("Empresa nao permitida");
      if (query.empresaId && cargo.empresaId !== query.empresaId) falharValidacao("Empresa nao permitida");
      await excluirPermissaoCargoRepository(query.alvoId, query.permissao, tx);
      return { ok: true };
    }

    if (query.tipoPermissao === "setor") {
      const setor = await buscarSetorEmpresaRepository(query.alvoId, tx);
      if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) falharValidacao("Empresa nao permitida");
      if (query.empresaId && setor.empresaId !== query.empresaId) falharValidacao("Empresa nao permitida");
      await excluirPermissaoSetorRepository(query.alvoId, query.permissao, tx);
      return { ok: true };
    }

    const empresasDoUsuario = await listarEmpresasUsuarioRepository(query.alvoId, tx);
    const empresaIds = empresasDoUsuario.map((empresa) => empresa.empresaId);
    if (!empresaIds.length || !todasEmpresasNoEscopo(perfil, empresaIds)) falharValidacao("Empresa nao permitida");
    if (query.empresaId && !empresaIds.includes(query.empresaId)) falharValidacao("Empresa nao permitida");
    await excluirPermissaoUsuarioRepository(query.alvoId, query.permissao, tx);
    return { ok: true };
  });
}

// Restaura as permissoes de um cargo para o PADRAO da referencia de producao (REPLACE, nao merge):
// reaplica exatamente permissoesPorCargo[cargo]. Recupera regras "false" que a UI tenha salvo e que o
// bootstrap (merge) nao restaura. So vale para cargos conhecidos (com padrao de referencia).
export async function restaurarPadraoCargo(cargoId: string, perfil?: PerfilComEmpresa) {
  return executarEmTransacao(async (tx) => {
    const cargo = await buscarCargoEmpresaRepository(cargoId, tx);
    if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) falharValidacao("Empresa nao permitida");
    const lista = permissoesPadraoDoCargo(cargo.nome ?? "");
    if (!lista) falharValidacao(`O cargo "${cargo.nome ?? ""}" nao tem um padrao de referencia para restaurar.`);
    const regras = regrasPermissoesReferencia(lista);
    await substituirPermissoesCargoRepository(cargoId, regras, tx);
    return { cargoId, regras };
  });
}

export async function salvarPermissao(body: DadosExternos, usuarioId?: string, perfil?: PerfilComEmpresa) {
  const dados = permissaoPayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    if (dados.tipoPermissao === "cargo") {
      if (!dados.cargoId) falharValidacao("Cargo obrigatorio");
      const cargo = await buscarCargoEmpresaRepository(dados.cargoId, tx);
      if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) falharValidacao("Empresa nao permitida");
      await substituirPermissoesCargoRepository(dados.cargoId, dados.regras, tx);
      return {
        tipoPermissao: dados.tipoPermissao,
        cargoId: dados.cargoId,
        regras: dados.regras,
        atualizadoPor: usuarioId
      };
    }

    if (dados.tipoPermissao === "setor") {
      if (!dados.setorId) falharValidacao("Setor obrigatorio");
      const setor = await buscarSetorEmpresaRepository(dados.setorId, tx);
      if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) falharValidacao("Empresa nao permitida");
      await substituirPermissoesSetorRepository(dados.setorId, dados.regras, tx);
      return {
        tipoPermissao: dados.tipoPermissao,
        setorId: dados.setorId,
        regras: dados.regras,
        atualizadoPor: usuarioId
      };
    }

    if (!dados.usuarioId) falharValidacao("Usuario obrigatorio");
    const empresasDoUsuario = await listarEmpresasUsuarioRepository(dados.usuarioId, tx);
    if (
      !empresasDoUsuario.length ||
      !todasEmpresasNoEscopo(
        perfil,
        empresasDoUsuario.map((empresa) => empresa.empresaId)
      )
    ) {
      falharValidacao("Empresa nao permitida");
    }
    await substituirPermissoesUsuarioRepository(dados.usuarioId, dados.regras, tx);
    return {
      tipoPermissao: dados.tipoPermissao,
      usuarioId: dados.usuarioId,
      regras: dados.regras,
      atualizadoPor: usuarioId
    };
  });
}
