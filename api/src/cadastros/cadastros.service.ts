import {
  cadastroAreaPayloadSchema,
  cadastroColaboradorPayloadSchema,
  cadastroContaPayloadSchema,
  cadastroEmpresaPayloadSchema,
  cadastroGrupoPayloadSchema,
  cadastroPermissaoPayloadSchema,
  cadastroSetorPayloadSchema,
  cadastroUnidadePayloadSchema,
  cadastroUsuarioPayloadSchema
} from "@padaria/shared/cadastros";
import { auth } from "../auth.js";
import { executarEmTransacao } from "../banco/conexao.js";
import {
  atualizarUsuarioAutenticacaoRepository,
  buscarCargoEmpresaRepository,
  buscarColaboradorUsuarioRepository,
  buscarSetorEmpresaRepository,
  buscarUsuarioAutenticacaoPorEmailRepository,
  colaboradorTemCargoAtivoRepository,
  existeEmailUsuarioRepository,
  listarEmpresasUsuarioRepository,
  salvarAreaRepository,
  salvarColaboradorRepository,
  salvarContaRepository,
  salvarEmpresaRepository,
  salvarGrupoRepository,
  salvarSetorRepository,
  salvarUnidadeRepository,
  substituirEmpresasUsuarioRepository,
  substituirPermissoesCargoRepository,
  substituirPermissoesSetorRepository,
  substituirPermissoesUsuarioRepository,
  upsertPerfilUsuarioRepository,
  vincularUsuarioColaboradorRepository
} from "./cadastros.repository.js";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../autorizacao/empresa.js";

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
    const colaborador = await buscarColaboradorUsuarioRepository(dados.colaboradorId);
    if (!colaborador) erroCadastro("Colaborador nao encontrado");
    if (!empresaNoEscopo(perfil, colaborador.empresaId)) erroCadastro("Empresa nao permitida");
    if (colaborador.usuarioId && colaborador.usuarioId !== id) erroCadastro("Colaborador ja vinculado a outro usuario");
    if (!(await colaboradorTemCargoAtivoRepository(colaborador.id)))
      erroCadastro("Colaborador precisa ter ao menos um cargo ativo");

    const empresaIds = empresasUsuario(dados.empresaId, dados.empresaIds);
    if (!empresaIds.includes(colaborador.empresaId)) empresaIds.unshift(colaborador.empresaId);
    if (!empresaIds.length) erroCadastro("Informe ao menos uma empresa");
    const empresaPrincipalId = empresaIds[0];
    if (!empresaPrincipalId) erroCadastro("Informe ao menos uma empresa");
    const nome = dados.nome.trim();
    const email = dados.email.trim().toLowerCase();
    const role = dados.role ?? (id ? undefined : "usuario_comum");

    if (id) {
      return executarEmTransacao(async (tx) => {
        const emailExistente = await existeEmailUsuarioRepository(email, id, tx);
        if (emailExistente) erroCadastro("Email ja cadastrado");
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

    await executarEmTransacao(async (tx) => {
      await upsertPerfilUsuarioRepository(
        { usuarioId: usuario.id, empresaId: empresaPrincipalId, nome, email, ...(role ? { role } : {}) },
        tx
      );
      await substituirEmpresasUsuarioRepository(usuario.id, empresaIds, tx);
      await vincularUsuarioColaboradorRepository(usuario.id, colaborador.id, tx);
    });

    return {
      id: usuario.id,
      empresaId: empresaPrincipalId,
      empresaIds,
      nome,
      email,
      colaboradorId: colaborador.id,
      setorId: colaborador.setorId
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
