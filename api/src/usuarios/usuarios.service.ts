import type { DadosExternos } from "@padaria/shared/api";
import { usuarioPayloadSchema } from "@padaria/shared/usuarios";
import { diaNegocio } from "@padaria/shared/datas";
import { auth } from "../auth/config.js";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { apenasDigitos, falharValidacao } from "../utils.js";
import {
  atualizarUsuarioAutenticacaoRepository,
  buscarCargoEmpresaRepository,
  buscarColaboradorPorCpfRepository,
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
  type UsuarioLinha,
  type UsuarioLinhaComEmpresas
} from "./usuarios.repository.js";

// Recebe o escopo JA validado contra o perfil (escopoEmpresaAtiva, usuarios.controller.ts) e decide
// DUAS coisas: quais usuarios aparecem e o que de cada usuario aparece. Antes so recortava a lista —
// os metadados vinham do banco inteiro (listarUsuariosRepository le as quatro tabelas sem `where` de
// empresa), entao um usuario com vinculo em A e B entregava, na consulta escopada em A, o uuid da B,
// o colaborador e o setor da B e os ids e NOMES dos cargos da B. O PR #137 fechou QUAIS LINHAS;
// faltava QUAIS CAMPOS.
//
// A linha e mantida, nunca omitida: o usuario compartilhado tem vinculo legitimo com a empresa
// consultada. Some-lo apagaria as regras de permissao dele da tela (permissoes.service.ts filtra
// usuariosPermissoes pelos usuarios visiveis), tiraria o alvo do formulario de permissao e deixaria
// vinculo fantasma na grade "quem pode movimentar" da tela de contas. O front ja espera esta forma:
// `itensDaEmpresa` (web-vue/utils/domain.ts:679-683) casa justamente por `empresaIds.includes`.
//
// O retorno e UsuarioLinha, sem a procedencia: ela e insumo do recorte e nao pode ir para o fio.
export function recortarUsuariosPorEmpresas(
  usuarios: UsuarioLinhaComEmpresas[],
  escopoDados: string[]
): UsuarioLinha[] {
  const escopo = new Set(escopoDados);
  return usuarios.flatMap((usuario) => {
    const idsDoUsuario = usuario.empresaIds.length ? usuario.empresaIds : usuario.empresaId ? [usuario.empresaId] : [];
    const empresaIds = idsDoUsuario.filter((empresaId) => escopo.has(empresaId));
    // Mesmo predicado de linha de antes: sobrevive quem tem ao menos uma empresa no escopo. Manter
    // identico e o que garante que paginacao, `total` e ordenacao nao mudam.
    if (!empresaIds.length) return [];
    const cargosVisiveis = usuario.cargosComEmpresa.filter((cargo) => escopo.has(cargo.empresaId));
    // Um usuario tem no maximo UM colaborador em todo o banco (colaboradores_usuario_id_unico), e ele
    // pertence a exatamente uma empresa. Fora do escopo, o vinculo operacional inteiro sai da resposta.
    const colaboradorVisivel = usuario.colaboradorEmpresaId !== null && escopo.has(usuario.colaboradorEmpresaId);
    // Projecao campo a campo, e nao `...usuario`: com o spread, um campo novo em
    // UsuarioLinhaComEmpresas chegaria ao corpo da resposta sem erro de compilacao. Assim o contrato
    // do fio e garantido pelo tsc — falta um campo, quebra; sobra um campo, quebra.
    return [
      {
        usuarioId: usuario.usuarioId,
        // `empresaId` e a empresa "principal" do perfil e pode apontar para fora do escopo. Cai para
        // a primeira empresa visivel para nao virar um uuid alheio nem um null que o front nao espera.
        empresaId: usuario.empresaId && escopo.has(usuario.empresaId) ? usuario.empresaId : (empresaIds[0] ?? null),
        empresaIds,
        nome: usuario.nome,
        email: usuario.email,
        colaboradorId: colaboradorVisivel ? usuario.colaboradorId : "",
        setorId: colaboradorVisivel ? usuario.setorId : null,
        cargoIds: cargosVisiveis.map((cargo) => cargo.id),
        cargos: cargosVisiveis.map((cargo) => cargo.nome),
        role: usuario.role
      }
    ];
  });
}

function empresasUsuario(empresaId: string | undefined, empresaIds: string[] | undefined): string[] {
  return [...new Set([...(empresaIds ?? []), ...(empresaId ? [empresaId] : [])])];
}

function empresaNoEscopo(perfil: PerfilComEmpresa | undefined, empresaId: string): boolean {
  return !perfil || podeAcessarEmpresa(perfil, empresaId);
}

// `escopoDados` e obrigatorio e nao aceita mais `null`. O ramo "null = devolve tudo sem filtro" nao
// tinha chamador e era o mesmo tipo de armadilha do `_empresasLiberadas` removido no PR #137: um
// parametro que parece checagem de seguranca e desliga o isolamento inteiro se alguem passar nulo.
export async function listarUsuarios(escopoDados: string[]): Promise<UsuarioLinha[]> {
  return recortarUsuariosPorEmpresas(await listarUsuariosRepository(), escopoDados);
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

  async function garantirCargoAtivo(colaboradorId: string, tx: TransacaoBanco) {
    if (await colaboradorTemCargoAtivoRepository(colaboradorId, tx)) return;
    await salvarCargoColaboradorUsuarioRepository(
      {
        empresaId: novoColaborador!.empresaId,
        colaboradorId,
        setorId: novoColaborador!.setorId,
        cargoId: novoColaborador!.cargoId,
        remuneracaoMinuto: 1,
        dataInicio: diaNegocio(new Date()),
        ativo: true
      },
      tx
    );
  }

  async function obterColaboradorParaVinculo(tx: TransacaoBanco) {
    if (!novoColaborador) return colaborador!;

    // Dedup por CPF: se ja existe um colaborador com esse CPF na empresa, reutiliza em vez de criar
    // uma copia (a causa dos colaboradores duplicados no QA de 15/07). Sem CPF, cria normalmente.
    if (novoColaborador.cpf) {
      const existente = await buscarColaboradorPorCpfRepository(novoColaborador.empresaId, novoColaborador.cpf, tx);
      if (existente) {
        if (existente.usuarioId && existente.usuarioId !== id) {
          falharValidacao("Ja existe um colaborador com esse CPF vinculado a outro usuario");
        }
        await garantirCargoAtivo(existente.id, tx);
        return {
          id: existente.id,
          empresaId: existente.empresaId,
          nome: existente.nome,
          usuarioId: existente.usuarioId ?? null,
          setorId: existente.setorId
        };
      }
    }

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
        dataInicio: diaNegocio(new Date()),
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
