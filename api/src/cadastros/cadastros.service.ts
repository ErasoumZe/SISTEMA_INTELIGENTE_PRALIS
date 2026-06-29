import {
  cadastroAreaPayloadSchema,
  cadastroColaboradorPayloadSchema,
  cadastroContaPayloadSchema,
  cadastroEmpresaPayloadSchema,
  cadastroFormaPagamentoPayloadSchema,
  cadastroGrupoPayloadSchema,
  cadastroPermissaoPayloadSchema,
  cadastroPdvPayloadSchema,
  cadastroSetorPayloadSchema,
  cadastroUnidadePayloadSchema,
  cadastroUsuarioPayloadSchema,
  excluirPermissaoQuerySchema,
  permissoesPaginadasQuerySchema,
  type ExcluirPermissaoQuery,
  type PermissoesPaginadasQuery
} from "@padaria/shared/cadastros";
import type { Permissao } from "@padaria/shared";
import { auth } from "../auth.js";
import { executarEmTransacao } from "../banco/conexao.js";
import type { TransacaoBanco } from "../banco/conexao.js";
import {
  atualizarUsuarioAutenticacaoRepository,
  buscarCargoEmpresaRepository,
  buscarColaboradorUsuarioRepository,
  buscarContaEmpresaRepository,
  buscarSetorEmpresaRepository,
  buscarUsuarioAutenticacaoPorEmailRepository,
  colaboradorTemCargoAtivoRepository,
  existeEmailUsuarioRepository,
  excluirPermissaoCargoRepository,
  excluirPermissaoSetorRepository,
  excluirPermissaoUsuarioRepository,
  listarEmpresasUsuarioRepository,
  salvarAreaRepository,
  salvarCargoColaboradorRepository,
  salvarColaboradorRepository,
  salvarContaRepository,
  salvarEmpresaRepository,
  salvarFormaPagamentoRepository,
  salvarGrupoRepository,
  salvarPdvRepository,
  salvarSetorRepository,
  salvarUnidadeRepository,
  substituirEmpresasUsuarioRepository,
  substituirPermissoesCargoRepository,
  substituirPermissoesSetorRepository,
  substituirPermissoesUsuarioRepository,
  upsertPerfilUsuarioRepository,
  vincularUsuarioColaboradorRepository
} from "./cadastros.repository.js";
import {
  empresasPermitidas,
  escopoEmpresaAtiva,
  podeAcessarEmpresa,
  type PerfilComEmpresa
} from "../autorizacao/empresa.js";
import { listarPermissoes as listarPermissoesCatalogo } from "../catalogos/catalogos.service.js";

type EntradaExterna = Parameters<typeof cadastroEmpresaPayloadSchema.parse>[0];

function erroCadastro(mensagem: string): never {
  throw new Error(mensagem);
}

function empresasUsuario(empresaId: string | undefined, empresaIds: string[] | undefined): string[] {
  return [...new Set([...(empresaIds ?? []), ...(empresaId ? [empresaId] : [])])];
}

function empresaNoEscopo(perfil: PerfilComEmpresa | undefined, empresaId: string): boolean {
  return !perfil || podeAcessarEmpresa(perfil, empresaId);
}

function todasEmpresasNoEscopo(perfil: PerfilComEmpresa | undefined, empresaIds: string[]): boolean {
  if (!perfil) return true;
  const permitidas = empresasPermitidas(perfil);
  return permitidas === null || empresaIds.every((empresaId) => permitidas.includes(empresaId));
}

function normalizarBusca(valor: string | undefined | null) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function montarLinhasPermissoes(
  dados: Awaited<ReturnType<typeof listarPermissoesCatalogo>>
): Array<{
  id: string;
  tipo: "cargo" | "setor" | "usuario";
  tipoPermissao: "cargo" | "setor" | "usuario";
  alvoId: string;
  alvo: string;
  cargoId?: string;
  setorId?: string;
  usuarioId?: string;
  permissao: Permissao;
}> {
  return [
    ...dados.cargosPermissoes.flatMap((item) => {
      const cargo = dados.cargos.find((alvo) => alvo.id === item.cargoId);
      if (!cargo) return [];
      const permissao = item.permissaoCodigo;
      return [
        {
          id: `cargo:${item.cargoId}:${permissao}`,
          tipo: "cargo" as const,
          tipoPermissao: "cargo" as const,
          alvoId: item.cargoId,
          alvo: cargo.nome ?? item.cargoId,
          cargoId: item.cargoId,
          permissao: permissao as Permissao
        }
      ];
    }),
    ...dados.setoresPermissoes.flatMap((item) => {
      const setor = dados.setores.find((alvo) => alvo.id === item.setorId);
      if (!setor?.id) return [];
      const permissao = item.permissaoCodigo;
      return [
        {
          id: `setor:${setor.id}:${permissao}`,
          tipo: "setor" as const,
          tipoPermissao: "setor" as const,
          alvoId: setor.id,
          alvo: setor.nome ?? setor.id,
          setorId: setor.id,
          permissao: permissao as Permissao
        }
      ];
    }),
    ...dados.usuariosPermissoes.flatMap((item) => {
      const usuario = dados.usuarios.find((alvo) => alvo.usuarioId === item.usuarioId);
      if (!usuario?.usuarioId) return [];
      const permissao = item.permissaoCodigo;
      return [
        {
          id: `usuario:${usuario.usuarioId}:${permissao}`,
          tipo: "usuario" as const,
          tipoPermissao: "usuario" as const,
          alvoId: usuario.usuarioId,
          alvo: usuario.nome ?? usuario.email ?? usuario.usuarioId,
          usuarioId: usuario.usuarioId,
          permissao: permissao as Permissao
        }
      ];
    })
  ].sort((a, b) => a.tipo.localeCompare(b.tipo) || a.alvo.localeCompare(b.alvo) || a.permissao.localeCompare(b.permissao));
}

export async function listarPermissoesPaginadas(body: EntradaExterna, perfil?: PerfilComEmpresa) {
  const query: PermissoesPaginadasQuery = permissoesPaginadasQuerySchema.parse(body);
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  const escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
  const dados = await listarPermissoesCatalogo(empresasLiberadas, escopoDados);
  const busca = normalizarBusca(query.q);

  const linhas = montarLinhasPermissoes(dados).filter((linha) => {
    if (query.tipoPermissao && linha.tipoPermissao !== query.tipoPermissao) return false;
    if (query.alvoId && linha.alvoId !== query.alvoId) return false;
    if (query.permissao && linha.permissao !== query.permissao) return false;
    if (!busca) return true;
    return normalizarBusca(`${linha.tipo} ${linha.alvo} ${linha.permissao}`).includes(busca);
  });

  const total = linhas.length;
  const inicio = (query.page - 1) * query.pageSize;
  return {
    itens: linhas.slice(inicio, inicio + query.pageSize),
    total,
    page: query.page,
    pageSize: query.pageSize
  };
}

export async function excluirPermissaoCadastro(body: EntradaExterna, perfil?: PerfilComEmpresa) {
  const query: ExcluirPermissaoQuery = excluirPermissaoQuerySchema.parse(body);
  if (query.empresaId && perfil && !podeAcessarEmpresa(perfil, query.empresaId)) erroCadastro("Empresa nao permitida");

  if (query.tipoPermissao === "cargo") {
    const cargo = await buscarCargoEmpresaRepository(query.alvoId);
    if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) erroCadastro("Empresa nao permitida");
    if (query.empresaId && cargo.empresaId !== query.empresaId) erroCadastro("Empresa nao permitida");
    await excluirPermissaoCargoRepository(query.alvoId, query.permissao);
    return { ok: true };
  }

  if (query.tipoPermissao === "setor") {
    const setor = await buscarSetorEmpresaRepository(query.alvoId);
    if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) erroCadastro("Empresa nao permitida");
    if (query.empresaId && setor.empresaId !== query.empresaId) erroCadastro("Empresa nao permitida");
    await excluirPermissaoSetorRepository(query.alvoId, query.permissao);
    return { ok: true };
  }

  const empresasDoUsuario = await listarEmpresasUsuarioRepository(query.alvoId);
  const empresaIds = empresasDoUsuario.map((empresa) => empresa.empresaId);
  if (!empresaIds.length || !todasEmpresasNoEscopo(perfil, empresaIds)) erroCadastro("Empresa nao permitida");
  if (query.empresaId && !empresaIds.includes(query.empresaId)) erroCadastro("Empresa nao permitida");
  await excluirPermissaoUsuarioRepository(query.alvoId, query.permissao);
  return { ok: true };
}

export async function salvarCadastro(
  tipo: string,
  id: string | null,
  body: EntradaExterna,
  usuarioId?: string,
  perfil?: PerfilComEmpresa
) {
  if (tipo === "empresas") {
    const dados = cadastroEmpresaPayloadSchema.parse(body);
    return salvarEmpresaRepository({ ...(id ? { id } : {}), nome: dados.nome.trim() });
  }

  if (tipo === "colaboradores") {
    const dados = cadastroColaboradorPayloadSchema.parse(body);
    return salvarColaboradorRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      cpf: dados.cpf?.trim() || null,
      setorId: dados.setorId ?? null
    });
  }

  if (tipo === "contas") {
    const dados = cadastroContaPayloadSchema.parse(body);
    return salvarContaRepository({ ...(id ? { id } : {}), empresaId: dados.empresaId, nome: dados.nome.trim() });
  }

  if (tipo === "formas-pagamento" || tipo === "formas_pagamento") {
    const dados = cadastroFormaPagamentoPayloadSchema.parse(body);
    return salvarFormaPagamentoRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim()
    });
  }

  if (tipo === "pdvs") {
    const dados = cadastroPdvPayloadSchema.parse(body);
    const conta = await buscarContaEmpresaRepository(dados.contaId);
    if (!conta || conta.empresaId !== dados.empresaId) erroCadastro("Conta nao pertence a empresa");
    return salvarPdvRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      codigo: dados.codigo?.trim() || null,
      contaId: dados.contaId,
      ativo: dados.ativo
    });
  }

  if (tipo === "unidades") {
    const dados = cadastroUnidadePayloadSchema.parse(body);
    return salvarUnidadeRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      sigla: dados.sigla.trim()
    });
  }

  if (tipo === "grupos") {
    const dados = cadastroGrupoPayloadSchema.parse(body);
    return salvarGrupoRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      tipoGrupo: dados.tipoGrupo,
      nome: dados.nome.trim(),
      grupoPaiId: dados.grupoPaiId ?? null
    });
  }

  if (tipo === "areas") {
    const dados = cadastroAreaPayloadSchema.parse(body);
    return salvarAreaRepository({ ...(id ? { id } : {}), empresaId: dados.empresaId, nome: dados.nome.trim() });
  }

  if (tipo === "setores") {
    const dados = cadastroSetorPayloadSchema.parse(body);
    return salvarSetorRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      areaId: dados.areaId ?? null,
      setorPaiId: dados.setorPaiId ?? null
    });
  }

  if (tipo === "usuarios") {
    const dados = cadastroUsuarioPayloadSchema.parse(body);
    const novoColaborador = dados.novoColaborador
      ? {
          ...dados.novoColaborador,
          nome: dados.novoColaborador.nome.trim(),
          cpf: dados.novoColaborador.cpf?.trim() || null,
          setorId: dados.novoColaborador.setorId ?? null
        }
      : null;
    if (!dados.colaboradorId && !novoColaborador) erroCadastro("Colaborador obrigatorio");

    let colaborador = dados.colaboradorId ? await buscarColaboradorUsuarioRepository(dados.colaboradorId) : null;
    if (novoColaborador) {
      if (!empresaNoEscopo(perfil, novoColaborador.empresaId)) erroCadastro("Empresa nao permitida");
      const cargo = await buscarCargoEmpresaRepository(novoColaborador.cargoId);
      if (!cargo || cargo.empresaId !== novoColaborador.empresaId) erroCadastro("Cargo nao pertence a empresa");
      if (novoColaborador.setorId) {
        const setor = await buscarSetorEmpresaRepository(novoColaborador.setorId);
        if (!setor || setor.empresaId !== novoColaborador.empresaId) erroCadastro("Setor nao pertence a empresa");
      }
    } else {
      if (!colaborador) erroCadastro("Colaborador nao encontrado");
      if (!empresaNoEscopo(perfil, colaborador.empresaId)) erroCadastro("Empresa nao permitida");
      if (colaborador.usuarioId && colaborador.usuarioId !== id) erroCadastro("Colaborador ja vinculado a outro usuario");
      if (!(await colaboradorTemCargoAtivoRepository(colaborador.id)))
        erroCadastro("Colaborador precisa ter ao menos um cargo ativo");
    }

    const empresaColaboradorId = novoColaborador?.empresaId ?? colaborador?.empresaId;
    if (!empresaColaboradorId) erroCadastro("Empresa nao permitida");
    const empresaIds = empresasUsuario(dados.empresaId, dados.empresaIds);
    if (!empresaIds.includes(empresaColaboradorId)) empresaIds.unshift(empresaColaboradorId);
    if (!empresaIds.length) erroCadastro("Informe ao menos uma empresa");
    const empresaPrincipalId = empresaIds[0];
    if (!empresaPrincipalId) erroCadastro("Informe ao menos uma empresa");
    const nome = dados.nome.trim();
    const email = dados.email.trim().toLowerCase();
    const role = dados.role ?? (id ? undefined : "usuario_comum");

    async function obterColaboradorParaVinculo(tx: TransacaoBanco) {
      if (!novoColaborador) return colaborador!;
      const criado = await salvarColaboradorRepository(
        {
          empresaId: novoColaborador.empresaId,
          nome: novoColaborador.nome,
          cpf: novoColaborador.cpf,
          setorId: novoColaborador.setorId
        },
        tx
      );
      if (!criado) erroCadastro("Nao foi possivel cadastrar o colaborador");
      await salvarCargoColaboradorRepository(
        {
          empresaId: novoColaborador.empresaId,
          colaboradorId: criado.id,
          setorId: novoColaborador.setorId,
          cargoId: novoColaborador.cargoId,
          remuneracaoMinuto: novoColaborador.remuneracaoMinuto,
          dataInicio: novoColaborador.dataInicio,
          ativo: true
        },
        tx
      );
      return {
        id: criado.id,
        empresaId: novoColaborador.empresaId,
        nome: novoColaborador.nome,
        usuarioId: null,
        setorId: novoColaborador.setorId
      };
    }

    if (id) {
      return executarEmTransacao(async (tx) => {
        const emailExistente = await existeEmailUsuarioRepository(email, id, tx);
        if (emailExistente) erroCadastro("Email ja cadastrado");
        colaborador = await obterColaboradorParaVinculo(tx);
        await atualizarUsuarioAutenticacaoRepository({ id, nome, email }, tx);
        await upsertPerfilUsuarioRepository(
          { usuarioId: id, empresaId: empresaPrincipalId, nome, email, ...(role ? { role } : {}) },
          tx
        );
        await substituirEmpresasUsuarioRepository(id, empresaIds, tx);
        await vincularUsuarioColaboradorRepository(id, colaborador.id, tx);
        return {
          id,
          empresaId: empresaPrincipalId,
          empresaIds,
          nome,
          email,
          colaboradorId: colaborador.id,
          setorId: colaborador.setorId
        };
      });
    }

    if (!dados.senha) erroCadastro("Senha obrigatoria");
    try {
      await auth.api.signUpEmail({
        body: {
          name: nome,
          email,
          password: dados.senha
        }
      });
    } catch {
      erroCadastro("Email ja cadastrado");
    }

    const usuario = await buscarUsuarioAutenticacaoPorEmailRepository(email);
    if (!usuario) erroCadastro("Usuario nao encontrado apos cadastro");

    const colaboradorVinculado = await executarEmTransacao(async (tx) => {
      const colaboradorTransacao = await obterColaboradorParaVinculo(tx);
      await upsertPerfilUsuarioRepository(
        { usuarioId: usuario.id, empresaId: empresaPrincipalId, nome, email, ...(role ? { role } : {}) },
        tx
      );
      await substituirEmpresasUsuarioRepository(usuario.id, empresaIds, tx);
      await vincularUsuarioColaboradorRepository(usuario.id, colaboradorTransacao.id, tx);
      return colaboradorTransacao;
    });

    return {
      id: usuario.id,
      empresaId: empresaPrincipalId,
      empresaIds,
      nome,
      email,
      colaboradorId: colaboradorVinculado.id,
      setorId: colaboradorVinculado.setorId
    };
  }

  if (tipo === "permissoes") {
    const dados = cadastroPermissaoPayloadSchema.parse(body);

    if (dados.tipoPermissao === "cargo") {
      if (!dados.cargoId) erroCadastro("Cargo obrigatorio");
      const cargo = await buscarCargoEmpresaRepository(dados.cargoId);
      if (!cargo || !empresaNoEscopo(perfil, cargo.empresaId)) erroCadastro("Empresa nao permitida");
      await substituirPermissoesCargoRepository(dados.cargoId, dados.permissoes);
      return {
        tipoPermissao: dados.tipoPermissao,
        cargoId: dados.cargoId,
        permissoes: dados.permissoes,
        atualizadoPor: usuarioId
      };
    }

    if (dados.tipoPermissao === "setor") {
      if (!dados.setorId) erroCadastro("Setor obrigatorio");
      const setor = await buscarSetorEmpresaRepository(dados.setorId);
      if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) erroCadastro("Empresa nao permitida");
      await substituirPermissoesSetorRepository(dados.setorId, dados.permissoes);
      return {
        tipoPermissao: dados.tipoPermissao,
        setorId: dados.setorId,
        permissoes: dados.permissoes,
        atualizadoPor: usuarioId
      };
    }

    if (!dados.usuarioId) erroCadastro("Usuario obrigatorio");
    const empresasDoUsuario = await listarEmpresasUsuarioRepository(dados.usuarioId);
    if (
      !empresasDoUsuario.length ||
      !todasEmpresasNoEscopo(
        perfil,
        empresasDoUsuario.map((empresa) => empresa.empresaId)
      )
    ) {
      erroCadastro("Empresa nao permitida");
    }
    await substituirPermissoesUsuarioRepository(dados.usuarioId, dados.permissoes);
    return {
      tipoPermissao: dados.tipoPermissao,
      usuarioId: dados.usuarioId,
      permissoes: dados.permissoes,
      atualizadoPor: usuarioId
    };
  }

  erroCadastro("Cadastro nao encontrado");
}
