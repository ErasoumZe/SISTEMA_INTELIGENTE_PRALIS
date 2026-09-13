import { APIError } from "better-auth";
import type { DadosExternos } from "@padaria/shared/api";
import type { RoleUsuario } from "@padaria/shared";
import { usuarioPayloadSchema } from "@padaria/shared/usuarios";
import { diaNegocio } from "@padaria/shared/datas";
import { auth, senhaMinimaAutenticacao } from "../auth/config.js";
import { empresasPermitidas, podeAcessarEmpresa, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, erroValidacao, falhaTecnica, naoEncontrado, proibido } from "../erros.js";
import { capturarErro } from "../observabilidade.js";
import { apenasDigitos, falharValidacao } from "../utils.js";
import {
  atualizarUsuarioAutenticacaoRepository,
  bloquearAlvoUsuarioRepository,
  buscarCargoEmpresaRepository,
  bloquearColaboradorPorCpfRepository,
  bloquearColaboradorUsuarioRepository,
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
        setorNome: setorVisivel ? usuario.setorNome : null,
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
// escopo de empresa e o papel.
export type PerfilAtor = PerfilComEmpresa & { role?: RoleUsuario };

// Papeis PRIVILEGIADOS para a seguranca de usuarios. `admin` entra apesar de nao conceder permissao
// nenhuma na resolucao (auth/perfil.service.ts) porque, enquanto ele existir, concede poder real em
// dois pontos: `podeLancarSemCaixa` (shared/src/autenticacao/index.ts) — status de retaguarda nas
// quatro saidas e no fluxo do cofre — e `podeLiberarTravaTransferencia`
// (api/src/transferencias/transferencias.service.ts).
//
// Ou seja: quem cria ou vira `admin` ganha acesso que nao tinha. Tratar so `usuario_admin` como
// privilegiado deixava a porta aberta pelo papel legado. Esta entrega NAO remove o papel nem mexe nos
// poderes dele — apenas para de considera-lo inofensivo aqui.
const ROLES_PRIVILEGIADOS: readonly RoleUsuario[] = ["usuario_admin", "admin"];

// Papel PROTEGIDO / CONCEDIVEL: vale para o ALVO e para o role pedido. Os dois entram.
function papelPrivilegiado(role: RoleUsuario | null | undefined): boolean {
  return Boolean(role && ROLES_PRIVILEGIADOS.includes(role));
}

// Papel do ATOR que autoriza. Aqui SO `usuario_admin`, e a assimetria e deliberada.
//
// Incluir `admin` deste lado seria ALARGAR, nao endurecer: ele passaria a poder cunhar
// `usuario_admin` — inclusive promovendo a si mesmo — e `usuario_admin` faz short-circuit para
// `permissoesAcessoTotal` (auth/perfil.service.ts). Pior: ate esta branch, `autorizarCriacaoUsuario`
// so barrava `usuario_admin`, entao qualquer um com `cadastro_usuarios_criar` podia criar uma conta
// `admin` com a senha que quisesse. Dar a essas contas o poder de cunhar acesso total seria entregar
// a escalada que esta entrega veio fechar.
//
// O resultado e uma trava estritamente maior que a de antes, em toda direcao: `admin` continua sem
// autorizar nada, e agora tambem nao pode ser criado nem editado por quem nao e `usuario_admin`.
const ROLE_ATOR_AUTORIZADO: RoleUsuario = "usuario_admin";

// Fail-closed. `undefined` significava "chamada interna confiavel" e valia acesso total E escopo de
// empresa irrestrito — um bypass esperando o primeiro chamador interno. Hoje o guard sempre entrega
// perfil nas rotas, mas isso e um invariante que o tipo nao garante, e seguranca nao pode depender
// de nenhum chamador lembrar. Sem ator nao existe autorizacao possivel: para, e para com o mesmo
// codigo que o guard usa quando o perfil nao esta configurado.
function exigirAtor(perfil: PerfilAtor | undefined): PerfilAtor {
  if (!perfil) throw proibido("Perfil de usuario nao configurado", "PROFILE_NOT_CONFIGURED");
  return perfil;
}

// UM codigo para as tres negacoes de privilegio (criar papel privilegiado, alterar role, editar um
// alvo privilegiado). Manter um so e o que impede a resposta de virar oraculo: quem tenta nao aprende,
// pela diferenca entre os codigos, se o alvo e ou nao administrador.
const CODIGO_PRIVILEGIO = "FORBIDDEN_PRIVILEGE";

function empresaNaoPermitida() {
  return proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function privilegioInsuficiente() {
  return proibido("Acao restrita a usuario administrador", CODIGO_PRIVILEGIO);
}

// A ausencia de ator ja foi barrada por `exigirAtor` antes de chegar aqui.
function atorPrivilegiado(perfil: PerfilAtor): boolean {
  return perfil.role === ROLE_ATOR_AUTORIZADO;
}

// A trava do takeover, DENTRO da transacao das escritas.
//
// Estava fora, e isso deixava uma janela entre o veredito e o `UPDATE`: outra transacao movia o alvo
// para uma empresa fora do escopo e a edicao antiga escrevia assim mesmo — pior, devolvia o alvo para
// a empresa do ator, porque a substituicao de empresas e total. Agora a leitura do alvo trava a linha
// raiz (`FOR UPDATE`) e o veredito vale ate o commit.
//
// `usuario_admin` NAO alarga escopo de empresa (auth/perfil.service.ts:7), entao a regra de empresa
// vale para todo ator; o que o papel decide e outra coisa (role e alvo privilegiado).
async function autorizarEdicaoUsuario(
  id: string,
  roleSolicitado: RoleUsuario | undefined,
  perfil: PerfilAtor,
  tx: TransacaoBanco
) {
  const alvo = await bloquearAlvoUsuarioRepository(id, tx);
  // Sem perfil o alvo nao existe. Antes o upsert INSERIA um perfil com o id inventado
  // (`perfis_usuarios.usuario_id` e text PK sem FK), criando um usuario fantasma e roubando o
  // colaborador informado. Lancar aqui aborta a transacao inteira: nada parcial fica para tras.
  if (!alvo) throw naoEncontrado("Usuario nao encontrado", "USER_NOT_FOUND");

  const empresasLiberadas = empresasPermitidas(perfil);
  // Os VINCULOS reais, exatamente como estao gravados. Sao eles que a preservacao devolve quando o
  // corpo omite `empresaIds` — nao a uniao abaixo, que existe so para decidir alcance do ator.
  const vinculosAtuais = (await listarEmpresasUsuarioRepository(id, tx)).map((empresa) => empresa.empresaId);
  const empresasAlvo = new Set(vinculosAtuais);
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

  if (!atorPrivilegiado(perfil)) {
    // Editar um alvo privilegiado e tomar a conta dele: trocar o e-mail ja basta, pela recuperacao de
    // senha. A trava e sobre o ALVO, nao sobre o campo.
    if (papelPrivilegiado(alvo.role)) throw privilegioInsuficiente();
    // Role AUSENTE ou IGUAL ao gravado e edicao legitima. A tela reenvia sempre o papel atual
    // (shared/src/cadastros/index.ts:332), entao recusar "role presente" quebraria toda edicao.
    if (roleSolicitado && roleSolicitado !== alvo.role) throw privilegioInsuficiente();
  }

  return { alvo, vinculosAtuais };
}

// Criar ja nasce privilegiado fecha o mesmo buraco por outro caminho: sem isto, quem tem
// `cadastro_usuarios_criar` fabrica o papel e loga com ele. Vale para os DOIS papeis privilegiados —
// antes so `usuario_admin` era barrado, e `admin` passava concedendo retaguarda e liberar trava.
function autorizarCriacaoUsuario(roleSolicitado: RoleUsuario | undefined, perfil: PerfilAtor) {
  if (papelPrivilegiado(roleSolicitado) && !atorPrivilegiado(perfil)) throw privilegioInsuficiente();
}

function empresasUsuario(empresaId: string | undefined, empresaIds: string[] | undefined): string[] {
  return [...new Set([...(empresaIds ?? []), ...(empresaId ? [empresaId] : [])])];
}

// Sem o ramo `!perfil` de antes: ele liberava qualquer empresa para quem chamasse sem ator.
function empresaNoEscopo(perfil: PerfilComEmpresa, empresaId: string): boolean {
  return podeAcessarEmpresa(perfil, empresaId);
}

// As checagens do colaborador informado no corpo, em UM lugar so. Elas rodam DUAS vezes — na
// pre-validacao sem lock, que existe para responder rapido, e na releitura travada dentro da
// transacao, que e a que autoriza. Duplicar o corpo delas seria pior que nao ter a primeira: bastaria
// as duas divergirem para a rapida virar a permissiva.
function validarColaboradorParaVinculo(
  colaborador: { empresaId: string; usuarioId: string | null },
  alvoId: string | null,
  ator: PerfilAtor
) {
  if (!empresaNoEscopo(ator, colaborador.empresaId)) throw empresaNaoPermitida();
  if (colaborador.usuarioId && colaborador.usuarioId !== alvoId)
    falharValidacao("Colaborador ja vinculado a outro usuario");
}

// `escopoDados` e obrigatorio e nao aceita mais `null`. O ramo "null = devolve tudo sem filtro" nao
// tinha chamador e era o mesmo tipo de armadilha do `_empresasLiberadas` removido no PR #137: um
// parametro que parece checagem de seguranca e desliga o isolamento inteiro se alguem passar nulo.
export async function listarUsuarios(escopoDados: string[]): Promise<UsuarioLinha[]> {
  return recortarUsuariosPorEmpresas(await listarUsuariosRepository(), escopoDados);
}

export async function salvarUsuario(id: string | null, body: DadosExternos, perfil?: PerfilAtor) {
  // ANTES do Zod, de verdade — o comentario dizia isso e o codigo fazia o contrario. Com o parse
  // primeiro, um corpo invalido respondia 400 de validacao para quem chama sem ator: a validacao
  // passava na frente da autorizacao e virava oraculo.
  const ator = exigirAtor(perfil);
  const dados = usuarioPayloadSchema.parse(body);
  // A autorizacao do ALVO nao mora aqui — ela precisa da transacao das escritas para travar a linha
  // raiz (ver `autorizarEdicaoUsuario`). Na criacao nao ha alvo previo, so o papel pedido.
  if (!id) autorizarCriacaoUsuario(dados.role, ator);
  const novoColaborador = dados.novoColaborador
    ? {
        ...dados.novoColaborador,
        nome: dados.novoColaborador.nome.trim(),
        cpf: apenasDigitos(dados.novoColaborador.cpf),
        setorId: dados.novoColaborador.setorId ?? null
      }
    : null;
  // MESMA logica de `empresaIds`: na EDICAO, ausencia = preservar o vinculo gravado. Sem isto a
  // preservacao de empresas era inalcancavel justamente para quem ela protege — o usuario multiempresa
  // cujo colaborador vive na OUTRA empresa. Nesse caso a listagem recorta `colaboradorId` para `""`
  // (`recortarUsuariosPorEmpresas`), a tela reenviava a string vazia e o Zod respondia 400
  // "Requisicao invalida". Na CRIACAO continua obrigatorio: nao ha vinculo previo.
  const preservarColaborador = Boolean(id) && !dados.colaboradorId && !novoColaborador;
  if (!id && !dados.colaboradorId && !novoColaborador) falharValidacao("Colaborador obrigatorio");

  // PRE-VALIDACAO, e so isso. Serve para responder rapido o caso obvio (colaborador inexistente, de
  // outra empresa, ja vinculado, sem cargo ativo) sem abrir transacao. NAO e fonte de autorizacao: o
  // retrato lido aqui envelhece, e quem decide e a releitura travada dentro da transacao
  // (`resolverColaboradorParaVinculo`). Nenhuma escrita usa este objeto.
  const colaboradorPreLido = dados.colaboradorId ? await buscarColaboradorUsuarioRepository(dados.colaboradorId) : null;
  if (novoColaborador) {
    if (!empresaNoEscopo(ator, novoColaborador.empresaId)) throw empresaNaoPermitida();
    const cargo = await buscarCargoEmpresaRepository(novoColaborador.cargoId);
    if (!cargo || cargo.empresaId !== novoColaborador.empresaId) falharValidacao("Cargo nao pertence a empresa");
    if (novoColaborador.setorId) {
      const setor = await buscarSetorEmpresaRepository(novoColaborador.setorId);
      if (!setor || setor.empresaId !== novoColaborador.empresaId) falharValidacao("Setor nao pertence a empresa");
    }
  } else if (!preservarColaborador) {
    if (!colaboradorPreLido) falharValidacao("Colaborador nao encontrado");
    validarColaboradorParaVinculo(colaboradorPreLido, id, ator);
    if (!(await colaboradorTemCargoAtivoRepository(colaboradorPreLido.id)))
      falharValidacao("Colaborador precisa ter ao menos um cargo ativo");
  }

  // Preservando o colaborador nao ha empresa nova para validar — o vinculo atual ja passou pelo gate
  // de escopo em `autorizarEdicaoUsuario`, que inclui `alvo.colaboradorEmpresaId`.
  const empresaColaboradorId = novoColaborador?.empresaId ?? colaboradorPreLido?.empresaId;
  if (!preservarColaborador && !empresaColaboradorId) falharValidacao("Empresa nao permitida");

  // AUSENCIA DE `empresaIds` E UM COMANDO, NAO UM VAZIO.
  //
  // A tela de edicao nao conhece as empresas reais do alvo — a listagem recorta `empresaIds` ao escopo
  // da TELA, por isolamento (`recortarUsuariosPorEmpresas`). Quando o corpo nao traz o campo, tratar
  // como "lista vazia" e cair no antigo `[empresaAtiva]` apagava, em silencio, todo vinculo que a tela
  // nao enxergava — `substituirEmpresasUsuarioRepository` faz substituicao TOTAL.
  //
  // Contrato: ausente = PRESERVAR exatamente os vinculos gravados; presente = substituicao explicita,
  // sujeita a todas as autorizacoes. Mesma convencao que `role` ja usa.
  const substituicaoExplicita = dados.empresaIds !== undefined || dados.empresaId !== undefined;
  const empresaIdsDoCorpo = empresasUsuario(dados.empresaId, dados.empresaIds);
  if (empresaColaboradorId && !empresaIdsDoCorpo.includes(empresaColaboradorId)) {
    empresaIdsDoCorpo.unshift(empresaColaboradorId);
  }
  const empresasLiberadas = empresasPermitidas(ator);
  // Vale para o conjunto do corpo E para a empresa do colaborador NOVO (quando ha um): nenhum dos
  // dois pode sair do alcance do ator. Preservando os dois, nao ha nada novo a validar aqui — o que
  // ja esta gravado passou pelo gate de `autorizarEdicaoUsuario`.
  const empresasAValidar = substituicaoExplicita
    ? empresaIdsDoCorpo
    : empresaColaboradorId
      ? [empresaColaboradorId]
      : [];
  if (empresasAValidar.some((empresaId) => !empresasLiberadas.includes(empresaId))) {
    // 403 COM `code`: pelo caminho do `falharValidacao` o controller respondia 403 sem codigo nenhum
    // (utils.ts:24-28 + shared/src/api/index.ts:274), entao a mesma rota tinha duas formas de negar
    // empresa. Uma so.
    throw empresaNaoPermitida();
  }
  // Na CRIACAO nao ha o que preservar: o conjunto do corpo e sempre o conjunto final.
  if (!id && !empresaIdsDoCorpo.length) falharValidacao("Informe ao menos uma empresa");
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

  // A releitura que AUTORIZA. Roda com a linha do colaborador travada, ja dentro da transacao das
  // escritas, e refaz as mesmas checagens da pre-validacao — porque entre uma e outra cabe outra
  // transacao mover o colaborador de empresa, vincula-lo a outro usuario ou desativar o cargo dele.
  //
  // O retorno desta funcao e a UNICA fonte usada pelas escritas.
  async function resolverColaboradorParaVinculo(tx: TransacaoBanco, empresaIdsFinais: string[]) {
    // Preservar = nao mexer no vinculo. Devolver `null` e o sinal para o chamador PULAR
    // `vincularUsuarioColaboradorRepository`, que e destrutivo dos dois lados.
    if (preservarColaborador) return null;
    if (!novoColaborador) {
      const relido = await bloquearColaboradorUsuarioRepository(dados.colaboradorId!, tx);
      if (!relido) falharValidacao("Colaborador nao encontrado");
      validarColaboradorParaVinculo(relido, id, ator);
      if (!(await colaboradorTemCargoAtivoRepository(relido.id, tx)))
        falharValidacao("Colaborador precisa ter ao menos um cargo ativo");
      // `empresaIds` e `empresaPrincipalId` foram calculados com a empresa PRE-LIDA. Se ela mudou sob
      // o lock, o conjunto que estamos prestes a gravar nao corresponde mais ao colaborador — e o
      // usuario ficaria vinculado a uma empresa que ele nao tem.
      // A empresa do colaborador precisa estar no conjunto FINAL — o do corpo, quando ha substituicao
      // explicita, ou o preservado. Senao o usuario ficaria vinculado a uma empresa que ele nao tem.
      if (!empresaIdsFinais.includes(relido.empresaId)) throw empresaNaoPermitida();
      return relido;
    }

    // MESMA regra do ramo acima, e nao so por simetria: sem ela, um PUT que omite `empresaIds` e manda
    // `novoColaborador` de outra empresa criava o colaborador la, vinculava, e pulava a escrita de
    // `usuarios_empresas` — deixando o usuario com colaborador na empresa A e vinculo so na B. O perfil
    // resolvido passaria a herdar cargo e setor de A aplicados aos dados de B.
    if (!empresaIdsFinais.includes(novoColaborador.empresaId)) throw empresaNaoPermitida();

    // Dedup por CPF: se ja existe um colaborador com esse CPF na empresa, reutiliza em vez de criar
    // uma copia (a causa dos colaboradores duplicados no QA de 15/07). Sem CPF, cria normalmente.
    if (novoColaborador.cpf) {
      const existente = await bloquearColaboradorPorCpfRepository(novoColaborador.empresaId, novoColaborador.cpf, tx);
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
      // Primeira coisa da transacao: trava a linha raiz do alvo e decide sobre o estado REAL dele.
      // Tudo o que vem depois escreve sob esse lock, entao o veredito nao envelhece antes do commit.
      const { alvo, vinculosAtuais } = await autorizarEdicaoUsuario(id, dados.role, ator, tx);
      const emailExistente = await existeEmailUsuarioRepository(email, id, tx);
      if (emailExistente) falharValidacao("Email ja cadastrado");

      // O conjunto final so agora e conhecido: preservar exige ler o alvo sob lock. Preservando,
      // a empresa principal tambem fica como esta — trocar `perfis_usuarios.empresa_id` pela empresa
      // da tela seria a mesma perda silenciosa por outro campo.
      // Alvo legado sem linha em `usuarios_empresas` (dado criado fora deste modulo) ainda aparece na
      // grade, porque o recorte cai para `perfis_usuarios.empresa_id`. Preservar "nada" ali travaria a
      // edicao com um 400 que contradiz o aviso da tela ("as empresas sao mantidas"). Cai para a
      // empresa principal, que ja passou pelo gate de escopo em `autorizarEdicaoUsuario`.
      const vinculosPreservados = vinculosAtuais.length ? vinculosAtuais : alvo.empresaId ? [alvo.empresaId] : [];
      const empresaIdsFinais = substituicaoExplicita ? empresaIdsDoCorpo : vinculosPreservados;
      const empresaPrincipalFinal = substituicaoExplicita
        ? empresaIdsDoCorpo[0]
        : (alvo.empresaId ?? vinculosPreservados[0]);
      if (!empresaIdsFinais.length || !empresaPrincipalFinal) falharValidacao("Informe ao menos uma empresa");

      // `const` local, e nao a variavel pre-lida: e o retrato travado que manda nas escritas abaixo.
      const colaborador = await resolverColaboradorParaVinculo(tx, empresaIdsFinais);
      await atualizarUsuarioAutenticacaoRepository({ id, nome, email }, tx);
      await upsertPerfilUsuarioRepository(
        { usuarioId: id, empresaId: empresaPrincipalFinal, nome, email, ...(role ? { role } : {}) },
        tx
      );
      // Sem substituicao explicita nao se toca em `usuarios_empresas`. Um DELETE+INSERT com a mesma
      // lista seria equivalente no papel, mas mexeria em `criado_em` e transformaria "nao pedi nada"
      // numa escrita — que e exatamente o que se quer evitar.
      if (substituicaoExplicita) await substituirEmpresasUsuarioRepository(id, empresaIdsFinais, tx);
      // `null` = preservar. `vincularUsuarioColaboradorRepository` desfaz o vinculo antigo antes de
      // criar o novo, entao chama-lo "sem mudanca" seria escrever destrutivamente a toa.
      if (colaborador) await vincularUsuarioColaboradorRepository(id, colaborador.id, tx);
      return {
        id,
        empresaId: empresaPrincipalFinal,
        empresaIds: empresaIdsFinais,
        nome,
        email,
        colaboradorId: colaborador?.id ?? alvo.colaboradorId ?? "",
        setorId: colaborador?.setorId ?? null
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

  // A PARTIR DAQUI tudo roda sob compensacao. Antes, a busca do usuario e a deteccao do usuario
  // sintetico ficavam FORA do bloco compensado: se a consulta falhasse, o `signUpEmail` ja tinha
  // commitado e sobrava um usuario de autenticacao orfao — que, por causa do UNIQUE de `user.email`,
  // bloqueia toda nova tentativa com o mesmo e-mail. Era o B-01 voltando pela porta dos fundos.
  //
  // O alvo da limpeza e SEMPRE o id devolvido pelo signUp DESTA requisicao, nunca o encontrado por
  // e-mail. E o que garante que a resposta sintetica de e-mail repetido (producao,
  // `requireEmailVerification: true`) nao apague a conta real: ali o id e um uuid que nunca foi
  // gravado, entao a limpeza nao encontra linha nenhuma.
  const idDoSignUp = cadastro.user.id;
  try {
    const usuario = await buscarUsuarioAutenticacaoPorEmailRepository(email);
    // Impossivel em condicao normal (o signUpEmail acabou de gravar). Se acontecer e falha tecnica,
    // nao regra de negocio: `falhaTecnica` garante 500 logado em vez de 400 com a mensagem crua.
    if (!usuario) throw falhaTecnica("Usuario de autenticacao nao encontrado apos o cadastro");
    // Em producao `requireEmailVerification` e true, e com ela o better-auth NAO lanca para e-mail
    // repetido: devolve 200 com um usuario SINTETICO, de id que nunca foi gravado (anti-enumeracao,
    // sign-up.mjs:161-207). Sem esta comparacao o fluxo seguia, encontrava o usuario REAL pelo e-mail
    // e sobrescrevia perfil, empresas e colaborador dele — troca de dono silenciosa, so em producao.
    if (idDoSignUp !== usuario.id) throw emailJaCadastrado();

    const colaboradorVinculado = await executarEmTransacao(async (tx) => {
      // A criacao escreve nas MESMAS tabelas que a edicao (`substituirEmpresasUsuario` e
      // `vincularUsuarioColaborador`), entao ela toma o MESMO lock de raiz. Para um usuario realmente
      // novo nao ha linha e o retorno e nulo — o `onConflictDoUpdate` do upsert serializa o resto pela
      // chave primaria. O que isto garante e que nenhuma escrita de escopo deste modulo corre por fora
      // da serializacao, inclusive se o perfil ja existir por reaproveitamento de conta.
      await bloquearAlvoUsuarioRepository(usuario.id, tx);
      // Criacao: nao ha o que preservar, o conjunto do corpo e o final.
      // Nunca nulo na criacao: `preservarColaborador` exige `id`, e aqui `id` e null.
      const colaboradorTransacao = (await resolverColaboradorParaVinculo(tx, empresaIdsDoCorpo))!;
      // Usuario criado por admin ja nasce verificado (senao nao logaria em producao — ver R1).
      await marcarEmailVerificadoRepository(usuario.id, tx);
      await upsertPerfilUsuarioRepository(
        { usuarioId: usuario.id, empresaId: empresaIdsDoCorpo[0]!, nome, email, ...(role ? { role } : {}) },
        tx
      );
      await substituirEmpresasUsuarioRepository(usuario.id, empresaIdsDoCorpo, tx);
      await vincularUsuarioColaboradorRepository(usuario.id, colaboradorTransacao.id, tx);
      return colaboradorTransacao;
    });

    return {
      id: usuario.id,
      empresaId: empresaIdsDoCorpo[0]!,
      empresaIds: empresaIdsDoCorpo,
      nome,
      email,
      colaboradorId: colaboradorVinculado.id,
      setorId: colaboradorVinculado.setorId
    };
  } catch (erro) {
    await compensarCadastroAutenticacao(idDoSignUp);
    throw erro;
  }
}

// O `signUpEmail` commita numa transacao PROPRIA, antes da nossa. Sem desfazer, sobra um usuario de
// autenticacao sem perfil/empresa/colaborador que nao serve para nada E bloqueia toda nova tentativa
// com o mesmo e-mail. `session` e `account` saem por cascade.
async function compensarCadastroAutenticacao(usuarioId: string) {
  try {
    await removerUsuarioAutenticacaoRepository(usuarioId);
  } catch (erro) {
    // A causa ORIGINAL continua subindo para o cliente — a limpeza nao pode mascara-la. Mas ela
    // tambem nao pode sumir: sem esta linha o orfao existe e ninguem sabe qual id limpar. So o id e a
    // mensagem, nunca o corpo do pedido (senha, token). Mesmo formato de
    // `api/src/integracoes/integracoes.service.ts`.
    console.error(
      `[usuarios] falha ao remover usuario de autenticacao ${usuarioId} apos cadastro malsucedido:`,
      erro instanceof Error ? erro.message : erro
    );
    capturarErro(erro instanceof Error ? erro : new Error(String(erro)));
  }
}
