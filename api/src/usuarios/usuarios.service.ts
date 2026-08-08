import { APIError } from "better-auth";
import type { DadosExternos } from "@padaria/shared/api";
import type { RoleUsuario } from "@padaria/shared";
import { usuarioPayloadSchema } from "@padaria/shared/usuarios";
import { diaNegocio } from "@padaria/shared/datas";
import { auth, senhaMinimaAutenticacao } from "../auth/config.js";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, erroValidacao, falhaTecnica, naoEncontrado, proibido } from "../erros.js";
import { apenasDigitos, falharValidacao } from "../utils.js";
import {
  atualizarUsuarioAutenticacaoRepository,
  buscarAlvoUsuarioRepository,
  buscarCargoEmpresaRepository,
  buscarColaboradorPorCpfRepository,
  buscarColaboradorUsuarioRepository,
  buscarSetorEmpresaRepository,
  buscarUsuarioAutenticacaoPorEmailRepository,
  colaboradorTemCargoAtivoRepository,
  existeEmailUsuarioRepository,
  listarEmpresasUsuarioRepository,
  listarUsuariosRepository,
  marcarEmailVerificadoRepository,
  removerUsuarioAutenticacaoRepository,
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
  // O retorno do callback e anotado de proposito: sem a anotacao, o "sobra um campo, quebra" abaixo
  // dependeria da checagem de propriedade excedente atravessar a inferencia generica do flatMap.
  // Com ela, o tsc valida o objeto contra UsuarioLinha diretamente.
  return usuarios.flatMap((usuario): UsuarioLinha[] => {
    const idsDoUsuario = usuario.empresaIds.length ? usuario.empresaIds : usuario.empresaId ? [usuario.empresaId] : [];
    const empresaIds = idsDoUsuario.filter((empresaId) => escopo.has(empresaId));
    // Mesmo predicado de linha de antes: sobrevive quem tem ao menos uma empresa no escopo. Manter
    // identico e o que garante que paginacao, `total` e ordenacao nao mudam.
    if (!empresaIds.length) return [];
    const cargosVisiveis = usuario.cargosComEmpresa.filter((cargo) => escopo.has(cargo.empresaId));
    // Um usuario tem no maximo UM colaborador em todo o banco (colaboradores_usuario_id_unico), e ele
    // pertence a exatamente uma empresa. Fora do escopo, o vinculo operacional inteiro sai da resposta.
    const colaboradorVisivel = usuario.colaboradorEmpresaId !== null && escopo.has(usuario.colaboradorEmpresaId);
    // O setor tem escopo PROPRIO, e nao herdado do colaborador: o banco nao garante que
    // `colaboradores.setor_id` aponte para um setor da mesma empresa do colaborador, e a rota de
    // colaboradores grava esse campo sem validar. Um colaborador legitimo da empresa A pode carregar
    // o setor da empresa B, e ai so a empresa do proprio setor separa os dois casos.
    const setorVisivel = colaboradorVisivel && usuario.setorEmpresaId !== null && escopo.has(usuario.setorEmpresaId);
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
        setorId: setorVisivel ? usuario.setorId : null,
        cargoIds: cargosVisiveis.map((cargo) => cargo.id),
        cargos: cargosVisiveis.map((cargo) => cargo.nome),
        role: usuario.role
      }
    ];
  });
}

// --- Fronteira com o Better Auth (B-01) -------------------------------------------------------
//
// O que existia aqui era `catch { falharValidacao("Email ja cadastrado") }`: QUALQUER falha do
// signUpEmail — senha curta, banco fora do ar, bug interno — virava "e-mail ja cadastrado". Foi o
// que apareceu na reuniao de 04/08 com e-mail inedito, e o que impediu criar os usuarios de
// tesouraria, financeiro e comprador. A fronteira agora separa tres classes:
//
//   duplicado real  -> 409, para o admin entender que o e-mail e de outra pessoa;
//   pedido invalido -> 400 com a razao VERDADEIRA (senha curta, e-mail malformado);
//   falha tecnica   -> sobe intacta para o handler global virar 500 logado, sem detalhe no corpo.
//
// A leitura e por `body.code`: `status` nao serve, porque USER_ALREADY_EXISTS e FAILED_TO_CREATE_USER
// compartilham 422 no better-auth 1.6.20.
const EMAIL_DUPLICADO_BETTER_AUTH = "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL";

const MENSAGEM_PEDIDO_INVALIDO: Record<string, string> = {
  INVALID_EMAIL: "E-mail invalido",
  INVALID_PASSWORD: "Senha invalida",
  PASSWORD_TOO_SHORT: `Senha deve ter ao menos ${senhaMinimaAutenticacao} caracteres`,
  PASSWORD_TOO_LONG: "Senha longa demais"
};

function emailJaCadastrado() {
  return conflito("Email ja cadastrado para outro usuario", "EMAIL_ALREADY_REGISTERED");
}

function traduzirFalhaCadastroAutenticacao(erro: DadosExternos): never {
  if (erro instanceof APIError) {
    const codigo = (erro.body as { code?: string } | undefined)?.code;
    if (codigo === EMAIL_DUPLICADO_BETTER_AUTH) throw emailJaCadastrado();
    const mensagem = codigo ? MENSAGEM_PEDIDO_INVALIDO[codigo] : undefined;
    if (mensagem) throw erroValidacao(mensagem, "USER_SIGNUP_REJECTED");
  }
  // Nao reconhecido = tecnico. Relancar preserva a causa para o log e o Sentry; traduzir aqui era
  // exatamente o defeito.
  throw erro;
}

// --- Autorizacao do alvo (P-01 / S-01) --------------------------------------------------------
//
// O ator chega do controller como `PerfilUsuario` completo (guards.ts:38-39); aqui so interessam o
// escopo de empresa e o papel. `undefined` continua significando "chamada interna sem ator" — mesma
// convencao ja usada por `empresaNoEscopo` e pelo `empresasLiberadas` de `salvarUsuario`.
export type PerfilAtor = PerfilComEmpresa & { role?: RoleUsuario };

const ROLE_ACESSO_TOTAL = "usuario_admin";

// UM codigo para as tres negacoes de privilegio (criar admin, alterar role, editar um admin). Manter
// um so e o que impede a resposta de virar oraculo: quem tenta nao aprende, pela diferenca entre os
// codigos, se o alvo e ou nao administrador. O role legado `admin` nao entra: ele nao concede acesso
// especial na resolucao de permissoes (auth/perfil.service.ts:8).
const CODIGO_PRIVILEGIO = "FORBIDDEN_PRIVILEGE";

function empresaNaoPermitida() {
  return proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function privilegioInsuficiente() {
  return proibido("Acao restrita a usuario administrador", CODIGO_PRIVILEGIO);
}

function temAcessoTotal(perfil: PerfilAtor | undefined): boolean {
  return !perfil || perfil.role === ROLE_ACESSO_TOTAL;
}

// A trava do takeover. Roda ANTES de qualquer leitura guiada pelo corpo e antes de qualquer escrita:
// o `:id` decide se o pedido pode existir.
//
// `usuario_admin` NAO alarga escopo de empresa (auth/perfil.service.ts:7), entao a regra de empresa
// vale para todo ator; o que o papel decide e outra coisa (role e alvo privilegiado).
async function autorizarEdicaoUsuario(id: string, roleSolicitado: RoleUsuario | undefined, perfil?: PerfilAtor) {
  const alvo = await buscarAlvoUsuarioRepository(id);
  // Sem perfil o alvo nao existe. Antes o upsert INSERIA um perfil com o id inventado
  // (`perfis_usuarios.usuario_id` e text PK sem FK), criando um usuario fantasma e roubando o
  // colaborador informado. 404 antes da transacao: nada parcial fica para tras.
  if (!alvo) throw naoEncontrado("Usuario nao encontrado", "USER_NOT_FOUND");

  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : null;
  if (empresasLiberadas) {
    const empresasAlvo = new Set((await listarEmpresasUsuarioRepository(id)).map((empresa) => empresa.empresaId));
    if (alvo.empresaId) empresasAlvo.add(alvo.empresaId);
    if (alvo.colaboradorEmpresaId) empresasAlvo.add(alvo.colaboradorEmpresaId);
    // `every`, e nao `some`: `substituirEmpresasUsuarioRepository` apaga TODAS as linhas do alvo, e
    // `vincularUsuarioColaboradorRepository` desfaz o vinculo operacional onde quer que ele esteja.
    // Quem alcanca so parte das empresas do alvo destruiria em silencio a parte que nao alcanca.
    // Alvo sem empresa nenhuma tambem e recusado — e dado quebrado, nao alvo livre. Mesmo desenho de
    // permissoes.service.ts:210-213.
    if (!empresasAlvo.size || [...empresasAlvo].some((empresaId) => !empresasLiberadas.includes(empresaId))) {
      throw empresaNaoPermitida();
    }
  }

  if (!temAcessoTotal(perfil)) {
    // Editar um `usuario_admin` e tomar a conta dele: trocar o e-mail ja basta, pela recuperacao de
    // senha. A trava e sobre o ALVO, nao sobre o campo.
    if (alvo.role === ROLE_ACESSO_TOTAL) throw privilegioInsuficiente();
    // Role AUSENTE ou IGUAL ao gravado e edicao legitima. A tela reenvia sempre o papel atual
    // (shared/src/cadastros/index.ts:332), entao recusar "role presente" quebraria toda edicao.
    if (roleSolicitado && roleSolicitado !== alvo.role) throw privilegioInsuficiente();
  }
}

// Criar ja nasce admin fecha o mesmo buraco por outro caminho: sem isto, quem tem
// `cadastro_usuarios_criar` fabrica um `usuario_admin` e loga com ele.
function autorizarCriacaoUsuario(roleSolicitado: RoleUsuario | undefined, perfil?: PerfilAtor) {
  if (roleSolicitado === ROLE_ACESSO_TOTAL && !temAcessoTotal(perfil)) throw privilegioInsuficiente();
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

export async function salvarUsuario(id: string | null, body: DadosExternos, perfil?: PerfilAtor) {
  const dados = usuarioPayloadSchema.parse(body);
  // O corpo nunca define o escopo do alvo: primeiro o banco diz quem ele e, depois o pedido diz o que
  // muda. Fora da transacao, no mesmo ponto onde as demais autorizacoes desta rota ja moravam — as
  // ESCRITAS continuam atomicas, e uma falha aqui e falha tecnica que sobe para 500, nao negacao.
  if (id) await autorizarEdicaoUsuario(id, dados.role, perfil);
  else autorizarCriacaoUsuario(dados.role, perfil);
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
    if (!empresaNoEscopo(perfil, novoColaborador.empresaId)) throw empresaNaoPermitida();
    const cargo = await buscarCargoEmpresaRepository(novoColaborador.cargoId);
    if (!cargo || cargo.empresaId !== novoColaborador.empresaId) falharValidacao("Cargo nao pertence a empresa");
    if (novoColaborador.setorId) {
      const setor = await buscarSetorEmpresaRepository(novoColaborador.setorId);
      if (!setor || setor.empresaId !== novoColaborador.empresaId) falharValidacao("Setor nao pertence a empresa");
    }
  } else {
    if (!colaborador) falharValidacao("Colaborador nao encontrado");
    if (!empresaNoEscopo(perfil, colaborador.empresaId)) throw empresaNaoPermitida();
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
    // 403 COM `code`: pelo caminho do `falharValidacao` o controller respondia 403 sem codigo nenhum
    // (utils.ts:24-28 + shared/src/api/index.ts:274), entao a mesma rota tinha duas formas de negar
    // empresa. Uma so.
    throw empresaNaoPermitida();
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
  // A politica do Better Auth e por ambiente (8 em dev/teste, 10 em producao) e mais exigente que o
  // schema compartilhado, que aceita 6 por nao conhecer o ambiente. Recusar aqui responde a razao
  // certa; deixar chegar no signUpEmail era o caminho mais comum para o falso "e-mail ja cadastrado".
  if (dados.senha.length < senhaMinimaAutenticacao) {
    throw erroValidacao(`Senha deve ter ao menos ${senhaMinimaAutenticacao} caracteres`, "WEAK_PASSWORD");
  }

  const cadastro = await auth.api
    .signUpEmail({ body: { name: nome, email, password: dados.senha } })
    .catch(traduzirFalhaCadastroAutenticacao);

  const usuario = await buscarUsuarioAutenticacaoPorEmailRepository(email);
  // Impossivel em condicao normal (o signUpEmail acabou de gravar). Se acontecer e falha tecnica,
  // nao regra de negocio: `falhaTecnica` garante 500 logado em vez de 400 com a mensagem crua.
  if (!usuario) throw falhaTecnica("Usuario de autenticacao nao encontrado apos o cadastro");
  // Em producao `requireEmailVerification` e true, e com ela o better-auth NAO lanca para e-mail
  // repetido: devolve 200 com um usuario SINTETICO, de id que nunca foi gravado (anti-enumeracao,
  // sign-up.mjs:161-207). Sem esta comparacao o fluxo seguia, encontrava o usuario REAL pelo e-mail
  // e sobrescrevia perfil, empresas e colaborador dele — troca de dono silenciosa, so em producao.
  if (cadastro.user.id !== usuario.id) throw emailJaCadastrado();

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
  }).catch(async (erro: DadosExternos) => {
    // O signUpEmail ja commitou na transacao dele. Sem desfazer, sobra um usuario de autenticacao
    // sem perfil/empresa/colaborador que nao serve para nada E bloqueia toda nova tentativa com o
    // mesmo e-mail. Removemos o que ESTA requisicao criou e propagamos a causa original.
    try {
      await removerUsuarioAutenticacaoRepository(usuario.id);
    } catch {
      // Falha ao limpar nao pode mascarar o erro de verdade: o orfao vira dado para limpeza, mas o
      // admin precisa ver por que o cadastro falhou.
    }
    throw erro;
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
