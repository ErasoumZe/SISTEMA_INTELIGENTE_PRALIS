import type { DadosExternos } from "@padaria/shared/api";
import { usuarioPayloadSchema } from "@padaria/shared/usuarios";
import { auth } from "../auth/config.js";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { apenasDigitos, falharValidacao } from "../utils.js";
import {
  atualizarUsuarioAutenticacaoRepository,
  buscarCargoEmpresaRepository,
  buscarColaboradorUsuarioRepository,
  buscarSetorEmpresaRepository,
  buscarUsuarioAutenticacaoPorEmailRepository,
  colaboradorTemCargoAtivoRepository,
  existeEmailUsuarioRepository,
  listarUsuariosRepository,
  marcarEmailVerificadoRepository,
  salvarCargoColaboradorUsuarioRepository,
  salvarColaboradorUsuarioRepository,
  substituirEmpresasUsuarioRepository,
  upsertPerfilUsuarioRepository,
  vincularUsuarioColaboradorRepository,
  type UsuarioLinha
} from "./usuarios.repository.js";

function filtrarUsuariosPorEmpresas(usuarios: UsuarioLinha[], escopoDados: string[] | null) {
  if (!escopoDados) return usuarios;
  return usuarios.filter((usuario) => {
    const ids = Array.isArray(usuario.empresaIds) ? usuario.empresaIds : usuario.empresaId ? [usuario.empresaId] : [];
    return escopoDados.some((empresaId) => ids.includes(empresaId));
  });
}

function empresasUsuario(empresaId: string | undefined, empresaIds: string[] | undefined): string[] {
  return [...new Set([...(empresaIds ?? []), ...(empresaId ? [empresaId] : [])])];
}

function empresaNoEscopo(perfil: PerfilComEmpresa | undefined, empresaId: string): boolean {
  return !perfil || podeAcessarEmpresa(perfil, empresaId);
}

export async function listarUsuarios(escopoDados: string[] | null) {
  return filtrarUsuariosPorEmpresas(await listarUsuariosRepository(), escopoDados);
}

export async function salvarUsuario(id: string | null, body: DadosExternos, perfil?: PerfilComEmpresa) {
  const dados = usuarioPayloadSchema.parse(body);
  const novoColaborador = dados.novoColaborador
    ? {
        ...dados.novoColaborador,
        nome: dados.novoColaborador.nome.trim(),
        cpf: apenasDigitos(dados.novoColaborador.cpf),
        setorId: dados.novoColaborador.setorId ?? null
      }
    : null;
  if (!dados.colaboradorId && !novoColaborador) falharValidacao("Colaborador obrigatorio");

  let colaborador = dados.colaboradorId ? await buscarColaboradorUsuarioRepository(dados.colaboradorId) : null;
  if (novoColaborador) {
    if (!empresaNoEscopo(perfil, novoColaborador.empresaId)) falharValidacao("Empresa nao permitida");
    const cargo = await buscarCargoEmpresaRepository(novoColaborador.cargoId);
    if (!cargo || cargo.empresaId !== novoColaborador.empresaId) falharValidacao("Cargo nao pertence a empresa");
    if (novoColaborador.setorId) {
      const setor = await buscarSetorEmpresaRepository(novoColaborador.setorId);
      if (!setor || setor.empresaId !== novoColaborador.empresaId) falharValidacao("Setor nao pertence a empresa");
    }
  } else {
    if (!colaborador) falharValidacao("Colaborador nao encontrado");
    if (!empresaNoEscopo(perfil, colaborador.empresaId)) falharValidacao("Empresa nao permitida");
    if (colaborador.usuarioId && colaborador.usuarioId !== id)
      falharValidacao("Colaborador ja vinculado a outro usuario");
    if (!(await colaboradorTemCargoAtivoRepository(colaborador.id)))
      falharValidacao("Colaborador precisa ter ao menos um cargo ativo");
  }

  const empresaColaboradorId = novoColaborador?.empresaId ?? colaborador?.empresaId;
  if (!empresaColaboradorId) falharValidacao("Empresa nao permitida");
  const empresaIds = empresasUsuario(dados.empresaId, dados.empresaIds);
  if (!empresaIds.includes(empresaColaboradorId)) empresaIds.unshift(empresaColaboradorId);
  if (!empresaIds.length) falharValidacao("Informe ao menos uma empresa");
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : null;
  if (empresasLiberadas !== null && empresaIds.some((empresaId) => !empresasLiberadas.includes(empresaId))) {
    falharValidacao("Empresa nao permitida");
  }
  const empresaPrincipalId = empresaIds[0];
  if (!empresaPrincipalId) falharValidacao("Informe ao menos uma empresa");
  const nome = dados.nome.trim();
  const email = dados.email.trim().toLowerCase();
  const role = dados.role ?? (id ? undefined : "usuario_comum");

  async function obterColaboradorParaVinculo(tx: TransacaoBanco) {
    if (!novoColaborador) return colaborador!;
    const criado = await salvarColaboradorUsuarioRepository(
      {
        empresaId: novoColaborador.empresaId,
        nome: novoColaborador.nome,
        cpf: novoColaborador.cpf,
        setorId: novoColaborador.setorId
      },
      tx
    );
    if (!criado) falharValidacao("Nao foi possivel cadastrar o colaborador");
    await salvarCargoColaboradorUsuarioRepository(
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
      if (emailExistente) falharValidacao("Email ja cadastrado");
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

  if (!dados.senha) falharValidacao("Senha obrigatoria");
  try {
    await auth.api.signUpEmail({ body: { name: nome, email, password: dados.senha } });
  } catch {
    falharValidacao("Email ja cadastrado");
  }

  const usuario = await buscarUsuarioAutenticacaoPorEmailRepository(email);
  if (!usuario) falharValidacao("Usuario nao encontrado apos cadastro");

  const colaboradorVinculado = await executarEmTransacao(async (tx) => {
    const colaboradorTransacao = await obterColaboradorParaVinculo(tx);
    // Usuario criado por admin ja nasce verificado (senao nao logaria em producao — ver R1).
    await marcarEmailVerificadoRepository(usuario.id, tx);
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
