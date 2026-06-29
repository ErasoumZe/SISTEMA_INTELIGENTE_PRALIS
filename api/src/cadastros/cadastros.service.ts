import {
  cadastroAreaPayloadSchema,
  cadastroClientePayloadSchema,
  cadastroColaboradorPayloadSchema,
  cadastroContaPayloadSchema,
  cadastroEmpresaPayloadSchema,
  cadastroFormaPagamentoPayloadSchema,
  cadastroFornecedorPayloadSchema,
  cadastroGrupoPayloadSchema,
  cadastroPermissaoPayloadSchema,
  cadastroPdvPayloadSchema,
  cadastroProdutoPayloadSchema,
  cadastroSetorPayloadSchema,
  cadastroUnidadePayloadSchema,
  cadastroUsuarioPayloadSchema,
  excluirPermissaoQuerySchema,
  permissoesPaginadasQuerySchema,
  type ExcluirPermissaoQuery,
  type PermissoesPaginadasQuery
} from "@padaria/shared/cadastros";
import type { Permissao, RegrasPermissoes } from "@padaria/shared";
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
  salvarClienteRepository,
  salvarColaboradorRepository,
  salvarContaRepository,
  salvarEmpresaRepository,
  salvarFormaPagamentoRepository,
  salvarFornecedorRepository,
  salvarGrupoRepository,
  salvarPdvRepository,
  salvarProdutoRepository,
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

function apenasDigitos(valor: string | null | undefined): string | null {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  return digitos || null;
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
  permissao: string;
  regras: string;
  regrasJson: string;
}> {
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

export async function listarPermissoesPaginadas(body: EntradaExterna, perfil?: PerfilComEmpresa) {
  const query: PermissoesPaginadasQuery = permissoesPaginadasQuerySchema.parse(body);
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  const escopoDados = escopoEmpresaAtiva(empresasLiberadas, query.empresaId);
  const dados = await listarPermissoesCatalogo(empresasLiberadas, escopoDados);
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
    return salvarEmpresaRepository({ ...(id ? { id } : {}), nome: dados.nome.trim(), cnpj: apenasDigitos(dados.cnpj) });
  }

  if (tipo === "fornecedores") {
    const dados = cadastroFornecedorPayloadSchema.parse(body);
    return salvarFornecedorRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      documento: apenasDigitos(dados.documento)
    });
  }

  if (tipo === "clientes") {
    const dados = cadastroClientePayloadSchema.parse(body);
    return salvarClienteRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      documento: apenasDigitos(dados.documento),
      dataNascimento: dados.dataNascimento || null,
      whatsapp: apenasDigitos(dados.whatsapp),
      email: dados.email?.trim() || null,
      cep: apenasDigitos(dados.cep),
      rua: dados.rua?.trim() || null,
      numero: dados.numero?.trim() || null,
      complemento: dados.complemento?.trim() || null,
      bairro: dados.bairro?.trim() || null,
      cidade: dados.cidade?.trim() || null,
      estado: dados.estado?.trim().toUpperCase() || null
    });
  }

  if (tipo === "colaboradores") {
    const dados = cadastroColaboradorPayloadSchema.parse(body);
    const cargo = await buscarCargoEmpresaRepository(dados.cargoId);
    if (!cargo || cargo.empresaId !== dados.empresaId) erroCadastro("Cargo nao pertence a empresa");
    return executarEmTransacao(async (tx) => {
      const colaborador = await salvarColaboradorRepository(
        {
          ...(id ? { id } : {}),
          empresaId: dados.empresaId,
          nome: dados.nome.trim(),
          cpf: apenasDigitos(dados.cpf),
          setorId: dados.setorId ?? null
        },
        tx
      );
      if (!colaborador?.id) erroCadastro("Nao foi possivel cadastrar o colaborador");
      if (!id || !(await colaboradorTemCargoAtivoRepository(colaborador.id, tx))) {
        await salvarCargoColaboradorRepository(
          {
            empresaId: dados.empresaId,
            colaboradorId: colaborador.id,
            setorId: dados.setorId ?? null,
            cargoId: dados.cargoId,
            remuneracaoMinuto: 1,
            dataInicio: new Date().toISOString().slice(0, 10),
            ativo: true
          },
          tx
        );
      }
      return colaborador;
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
      contaId: dados.contaId,
      ativo: dados.ativo
    });
  }

  if (tipo === "produtos") {
    const dados = cadastroProdutoPayloadSchema.parse(body);
    return salvarProdutoRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      codigo: dados.codigo?.trim() || null,
      codigoBarras: apenasDigitos(dados.codigoBarras) ?? dados.codigoBarras?.trim() ?? null,
      descricao: dados.descricao.trim(),
      marca: dados.marca?.trim() || null,
      unidadeIndividualId: dados.unidadeIndividualId,
      quantidadeIndividual: dados.quantidadeIndividual,
      grupoMercadoriaId: dados.grupoMercadoriaId ?? null,
      conversoes: dados.conversoes
    });
  }

  if (tipo === "unidades" || tipo === "unidades-medida" || tipo === "unidades_medida") {
    const dados = cadastroUnidadePayloadSchema.parse(body);
    return salvarUnidadeRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      nome: dados.nome.trim(),
      sigla: dados.sigla.trim()
    });
  }

  if (tipo === "grupos" || tipo.startsWith("grupos-")) {
    const dados = cadastroGrupoPayloadSchema.parse(body);
    const tipoGrupo =
      tipo === "grupos-despesas"
        ? "despesa"
        : tipo === "grupos-mercadorias"
          ? "mercadoria"
          : tipo === "grupos-retiradas"
            ? "retirada"
            : tipo === "grupos-vendas"
              ? "vendas"
              : dados.tipoGrupo;
    return salvarGrupoRepository({
      ...(id ? { id } : {}),
      empresaId: dados.empresaId,
      tipoGrupo,
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
          cpf: apenasDigitos(dados.novoColaborador.cpf),
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
          remuneracaoMinuto: 1,
          dataInicio: new Date().toISOString().slice(0, 10),
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
    await substituirPermissoesCargoRepository(dados.cargoId, dados.regras);
    return {
      tipoPermissao: dados.tipoPermissao,
      cargoId: dados.cargoId,
      regras: dados.regras,
      atualizadoPor: usuarioId
    };
    }

    if (dados.tipoPermissao === "setor") {
      if (!dados.setorId) erroCadastro("Setor obrigatorio");
      const setor = await buscarSetorEmpresaRepository(dados.setorId);
      if (!setor || !empresaNoEscopo(perfil, setor.empresaId)) erroCadastro("Empresa nao permitida");
    await substituirPermissoesSetorRepository(dados.setorId, dados.regras);
    return {
      tipoPermissao: dados.tipoPermissao,
      setorId: dados.setorId,
      regras: dados.regras,
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
    await substituirPermissoesUsuarioRepository(dados.usuarioId, dados.regras);
    return {
      tipoPermissao: dados.tipoPermissao,
      usuarioId: dados.usuarioId,
      regras: dados.regras,
      atualizadoPor: usuarioId
    };
  }

  erroCadastro("Cadastro nao encontrado");
}
