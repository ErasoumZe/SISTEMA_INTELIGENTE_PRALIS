import type { DadosExternos } from "@padaria/shared/api";
import { temPermissao, type DominioLancamentoPagavel, type Permissao, type PerfilUsuario } from "@padaria/shared";
import {
  centavosParaDecimalBanco,
  deCentavos,
  jurosCentavos,
  paraCentavos,
  type TipoJuros
} from "@padaria/shared/dinheiro";
import {
  calcularDiscriminacao,
  conferirDiscriminacao,
  type ItemDiscriminacao,
  type TipoDesconto
} from "@padaria/shared/discriminacao";
import { erroValidacao, naoProcessavel, proibido } from "../erros.js";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { podeLancarSemCaixa } from "@padaria/shared/autenticacao";
import { obterCaixaAbertoParaLancamento } from "../caixa/caixa.service.js";
import { buscarCaixaAbertoUsuarioRepository } from "../caixa/caixa.repository.js";
import { and, eq, inArray, type SQL } from "drizzle-orm";
import {
  colaboradores,
  contas,
  fornecedores,
  formasPagamento,
  gruposDespesas,
  gruposMercadorias,
  gruposPatrimonio,
  gruposRetiradas,
  patrimonioItens,
  pdvs,
  produtos,
  sociosGestores,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import type { DespesaItemPayload, DespesaPayload } from "@padaria/shared/despesas";
import type { MercadoriaItemPayload, MercadoriaPayload } from "@padaria/shared/mercadorias";
import type { RetiradaPayload } from "@padaria/shared/retiradas";
import type { Recorrencia } from "@padaria/shared/recorrencia";
import type { TransferenciaPayload } from "@padaria/shared/transferencias";
import type { VendaPayload } from "@padaria/shared/vendas";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

export type QueryEmpresa = { empresaId?: string | undefined };
type BasePayload = {
  empresaId: string;
  dataReferencia: string;
  dataPagamento?: string | null | undefined;
  // R-127: `descricao` e legado e ja pode vir ausente; o texto vive em `observacao`.
  descricao?: string | null | undefined;
  observacao?: string | null | undefined;
  valorOriginal: number;
  valorAcrescimo: number;
  descricaoAcrescimo?: string | null | undefined;
  valorDesconto: number;
  descricaoDesconto?: string | null | undefined;
  contaOrigemId?: string | null | undefined;
};

async function existeNaEmpresa<Tabela extends { id: DadosExternos; empresaId: DadosExternos }>(
  tabela: Tabela,
  id: string,
  empresaId: string,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ id: tabela.id as never })
    .from(tabela as never)
    .where(and(eq(tabela.id as never, id), eq(tabela.empresaId as never, empresaId)))
    .limit(1);
  return Boolean(linha);
}

export function filtrosEmpresa<T extends { empresaId: DadosExternos }>(
  tabela: T,
  query: QueryEmpresa,
  empresasPermitidasIds: string[] | null
): SQL[] {
  const filtros: SQL[] = [];
  if (query.empresaId) filtros.push(eq(tabela.empresaId as never, query.empresaId));
  else if (empresasPermitidasIds !== null) filtros.push(inArray(tabela.empresaId as never, empresasPermitidasIds));
  return filtros;
}

// JUROS (R-041/R-042) das TRES tabelas de lancamento. Fica fora de valoresBase de proposito:
// valoresBase tambem serve transferencias, que nao tem as colunas de juros.
//
// O SERVIDOR RECALCULA e nao confia no cliente. Um valorAcrescimo que chega pronto do front e um
// valor que o front pode mentir — mandar jurosTipo='percentual', jurosValorInformado=2 e
// valorAcrescimo=999999 nao passa: o acrescimo e derivado aqui, do valor e do percentual.
//
// Sem jurosTipo (venda, transferencia, historico, lancamento sem juros) o acrescimo generico segue
// intacto e as colunas de juros vao a null — importante na EDICAO, para limpar o juros de verdade
// quando a pessoa apaga o campo.
export function valoresJuros(dados: {
  valorOriginal: number;
  valorAcrescimo: number;
  jurosTipo?: TipoJuros | null | undefined;
  jurosValorInformado?: number | null | undefined;
}) {
  if (!dados.jurosTipo) {
    return { valorAcrescimo: String(dados.valorAcrescimo), jurosTipo: null, jurosValorInformado: null };
  }
  const centavos = jurosCentavos({
    valorOriginal: dados.valorOriginal,
    jurosValorInformado: dados.jurosValorInformado,
    jurosTipo: dados.jurosTipo
  });
  return {
    valorAcrescimo: centavosParaDecimalBanco(centavos),
    jurosTipo: dados.jurosTipo,
    jurosValorInformado: String(dados.jurosValorInformado ?? 0)
  };
}

// Campos editaveis comuns aos lancamentos. Na edicao, empresa, caixa e criadoPor NUNCA mudam.
export function valoresBaseEdicao(dados: BasePayload, computar: boolean) {
  return {
    dataReferencia: dados.dataReferencia,
    dataPagamento: dados.dataPagamento ?? null,
    // R-127: grava so `observacao`. `descricao` para de ser escrita e fica congelada no que o
    // historico ja tinha — e o que permite a migration futura remove-la sem perder nada.
    descricao: dados.descricao ?? null,
    observacao: dados.observacao ?? null,
    valorOriginal: String(dados.valorOriginal),
    valorAcrescimo: String(dados.valorAcrescimo),
    descricaoAcrescimo: dados.descricaoAcrescimo ?? null,
    valorDesconto: String(dados.valorDesconto),
    descricaoDesconto: dados.descricaoDesconto ?? null,
    contaOrigemId: dados.contaOrigemId ?? null,
    computar
  };
}

export function valoresBase(
  dados: BasePayload,
  computar: boolean,
  criadoPor: string,
  caixaId?: string | null,
  // Vinculo com a serie que gerou o lancamento (D3). So despesas/mercadorias/retiradas tem essas
  // colunas — por isso o spread e CONDICIONAL: venda e transferencia chamam sem o argumento e nao
  // recebem as chaves.
  recorrencia?: { id: string; ordem: number } | null
) {
  return {
    empresaId: dados.empresaId,
    caixaId: caixaId ?? null,
    criadoPor,
    ...(recorrencia ? { recorrenciaId: recorrencia.id, recorrenciaOrdem: recorrencia.ordem } : {}),
    ...valoresBaseEdicao(dados, computar)
  };
}

// Converte o decimal do banco (string) para o numero em reais do contrato wire.
export function numeroDecimal(valor: string | number | null | undefined): number {
  return deCentavos(paraCentavos(valor));
}

// `podeLancarSemCaixa` mora em `@padaria/shared/autenticacao` e e reexportada aqui porque este
// modulo e a porta historica dela: mover sem reexportar quebraria os importadores sem ganho nenhum.
// A definicao continua UNICA; o que existe aqui e um apontamento, nao uma segunda copia.
//
// Foi para `shared` (e nao para um modulo da API) porque a TELA precisa da mesma resposta: o painel
// de programar entrega ao cofre so existe para a retaguarda, e o servico so aceita a retaguarda.
// Copiar a lista de cargos no front criaria duas verdades que divergem no primeiro ajuste.
export { podeLancarSemCaixa };

// R-121: o operador de Caixa lanca TODA saida (despesa, mercadoria, retirada) — desde que saia da
// conta do caixa aberto. Sem esta amarracao o valor debita a conta escolhida no saldo de contas E
// debita o caixa no fechamento ao mesmo tempo: divergencia silenciosa que volta como quebra de
// caixa falsa no colo do operador (R-015).
//
// Conta VAZIA e preenchida com a do PDV — o front trava o campo, mas payload sem conta nao pode
// virar lancamento orfao. Conta DIFERENTE e recusada.
//
// Diferente da transferencia de proposito: la a conta do PDV vale como origem OU destino (dinheiro
// entra e sai); aqui e saida, entao so ORIGEM.
export function exigirContaDoCaixaNoLancamento<T extends { contaOrigemId?: string | null | undefined }>(
  dados: T,
  // `null` desde a A-1: a retaguarda pode nao ter caixa aberto. Ela sai na primeira linha, entao o
  // nulo nunca e desreferenciado — mas o tipo tem de dizer isso, senao o compilador para de vigiar.
  caixa: { pdvContaId: string | null } | null,
  perfil: PerfilUsuario
): T {
  if (podeLancarSemCaixa(perfil)) return dados;
  if (!caixa) throw new Error("Abra um caixa antes de registrar este lancamento");
  if (!caixa.pdvContaId) throw new Error("Caixa operacional invalido");
  if (!dados.contaOrigemId) return { ...dados, contaOrigemId: caixa.pdvContaId };
  if (dados.contaOrigemId !== caixa.pdvContaId) {
    throw new Error("Lancamento do operador Caixa precisa sair da conta do PDV aberto");
  }
  return dados;
}

/**
 * `null` e `undefined` sao o mesmo "vazio" ao comparar com o que esta gravado: o payload pode OMITIR
 * o campo e o banco devolve `null`. (`""` nunca chega aqui — `uuidSchema` recusa string vazia no
 * controller —, mas a coalescencia cobre os tres sem depender disso.)
 */
function idOuNulo(id: string | null | undefined): string | null {
  return id ? id : null;
}

type CredoresRetirada = {
  colaboradorId?: string | null | undefined;
};

/**
 * R-128 NO SERVIDOR: a retirada NOVA e de fornecedor ou socio/gestor. Colaborador so sobrevive no
 * registro que JA foi gravado com ele.
 *
 * Ate aqui a R-128 vivia so na tela — o contrato aceitava `colaboradorId` de propósito, para o
 * historico reabrir. Só que "aceitar sempre" deixava qualquer cliente que nao fosse a tela gravar
 * retirada NOVA com colaborador, e deixava o PUT transformar uma retirada moderna em retirada de
 * colaborador. O que distingue os dois casos e o registro EXISTENTE, e nao o payload — por isso a
 * regra mora aqui, e nao num `superRefine` do zod, que nao enxerga o que ja esta gravado e
 * tornaria o legado impossivel de salvar.
 *
 * Exige o MESMO colaborador: preservar e diferente de poder trocar quem recebeu o dinheiro usando
 * um registro antigo como veiculo.
 */
export function exigirCredorDaRetirada(dados: CredoresRetirada, existente?: CredoresRetirada | null): void {
  const colaborador = idOuNulo(dados.colaboradorId);
  if (!colaborador) return;
  if (existente && idOuNulo(existente.colaboradorId) === colaborador) return;
  throw erroValidacao("Retirada nao aceita colaborador como credor: use fornecedor ou socio/gestor (R-128)");
}

type CredoresDespesa = {
  fornecedorId?: string | null | undefined;
  colaboradorId?: string | null | undefined;
  credorTipo?: string | null | undefined;
};

/**
 * A despesa tem UM tipo de credor por vez (FOTO 2: Fornecedor OU Colaborador).
 *
 * O CHECK do banco so morde quando `credor_tipo` esta preenchido, entao um payload com os dois ids
 * e SEM `credorTipo` gravava os dois — e ainda criava divida em `debitos_colaboradores` para um
 * colaborador que nao era o credor. Com `credorTipo` incoerente, o CHECK estourava no INSERT e
 * virava 500, porque erro de driver e relancado; agora a recusa e 400 antes de qualquer escrita.
 *
 * O registro HISTORICO com os dois ids e `credor_tipo` nulo continua editavel: se o par de credores
 * chega igual ao que esta gravado, o operador esta mexendo em outro campo e nao e ele quem tem de
 * pagar por um dado que o sistema deixou entrar. Corrigir o historico e outra decisao, com migration
 * e contagem — nao um 400 na cara de quem so queria arrumar o valor.
 */
export function exigirCredorCoerenteDaDespesa(dados: CredoresDespesa, existente?: CredoresDespesa | null): void {
  const fornecedor = idOuNulo(dados.fornecedorId);
  const colaborador = idOuNulo(dados.colaboradorId);

  // O atalho do historico vale SO para a cardinalidade — nao para a coerencia do tipo. Enquanto ele
  // saia da funcao inteira, dois furos passavam: `PUT` com `credorTipo` e nenhum id gravava
  // `credor_tipo` sem credor (o CHECK do banco nao pega esse ramo), e o par legado somado a um
  // `credorTipo` violava o CHECK no UPDATE, virando 500 de driver — o mesmo 500 que esta regra
  // existe para eliminar.
  const parIntacto =
    existente !== undefined &&
    existente !== null &&
    idOuNulo(existente.fornecedorId) === fornecedor &&
    idOuNulo(existente.colaboradorId) === colaborador;

  if (fornecedor && colaborador && !parIntacto) {
    throw erroValidacao("A despesa tem um credor so: fornecedor OU colaborador");
  }
  // Vale sempre, inclusive no historico: `credorTipo` tem de apontar para o unico id preenchido.
  if (dados.credorTipo === "fornecedor" && (!fornecedor || colaborador)) {
    throw erroValidacao("Credor incoerente: credorTipo 'fornecedor' exige fornecedorId e nenhum colaborador");
  }
  if (dados.credorTipo === "colaborador" && (!colaborador || fornecedor)) {
    throw erroValidacao("Credor incoerente: credorTipo 'colaborador' exige colaboradorId e nenhum fornecedor");
  }
}

// R-123: as ocorrencias FUTURAS de uma serie nascem fora de qualquer caixa aberto
// (lancamentos.recorrencia.ts: so a 1a recebe caixaId). Amarrar essas ocorrencias a conta de um PDV
// que talvez nem exista em tres meses cria lancamento orfao por construcao — entao recorrencia e
// ato de retaguarda. A permissao `lancamentos_recorrencia_criar` ja barra por outro caminho; esta
// checagem existe para a recusa dizer o MOTIVO em vez de "permissao insuficiente".
// A checagem e do OPERADOR DE CAIXA especificamente (`caixa_operar` sem ser retaguarda), nao de
// "qualquer um sem a permissao": para os demais continua valendo a R-075, que responde 403 apontando
// `lancamentos_recorrencia_criar`. Sem esse recorte, um perfil que apenas nao tem a permissao — e
// nem opera caixa — receberia um motivo que nao e o dele.
export function exigirRecorrenciaDeRetaguarda(perfil: PerfilUsuario, recorrencia: Recorrencia | undefined) {
  if (!recorrencia || podeLancarSemCaixa(perfil)) return;
  if (!temPermissao(perfil.permissoes, "caixa_operar")) return;
  throw new Error("Lancamento recorrente e ato de Tesouraria/Financeiro");
}

/**
 * A-1: edicao de SAIDA por perfil de retaguarda. Nao exige caixa aberto proprio.
 *
 * O que continua valendo: registro tem de existir numa empresa acessivel e nao pode trocar de
 * empresa. E, quando o lancamento PERTENCE a um caixa (`caixa_id` preenchido, porque saiu da conta
 * do PDV), a regra antiga vale inteira — tem de ser o caixa aberto DELE. Sem essa parte, a
 * retaguarda passaria a editar lancamento de caixa alheio, que nao e o que foi decidido.
 *
 * O que muda: lancamento sem `caixa_id` — o que a propria retaguarda cria desde a A-1 — nao tem
 * caixa a conferir e fica editavel.
 */
async function validarEdicaoDeSaidaDaRetaguarda(
  existente: { empresaId: string; caixaId: string | null } | null,
  dados: { empresaId: string },
  perfil: PerfilUsuario,
  tx?: ExecutorBanco
) {
  if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
  if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  const caixa = await buscarCaixaAbertoUsuarioRepository(dados.empresaId, perfil.usuarioId, tx);
  if (existente.caixaId && existente.caixaId !== caixa?.id) {
    throw new Error("Lancamento nao pertence ao seu caixa aberto");
  }
  return caixa;
}

// Regras de edicao de lancamento: o registro precisa existir na empresa acessivel,
// nao pode trocar de empresa e precisa pertencer ao caixa aberto do usuario.
// Serve venda, transferencia e as tres saidas — nao mexer no status daqui sem olhar os quatro.
export async function validarEdicaoNoCaixaAberto(
  existente: { empresaId: string; caixaId: string | null } | null,
  dados: { empresaId: string },
  perfil: PerfilUsuario,
  tx?: ExecutorBanco
) {
  if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
  if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");
  const caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
  if (existente.caixaId !== caixa.id) throw new Error("Lancamento nao pertence ao seu caixa aberto");
  return caixa;
}

// R-122: edicao das SAIDAS (despesa/mercadoria/retirada). O operador de Caixa corrige o proprio
// lancamento enquanto AQUELE caixa estiver aberto — as tres condicoes andam juntas: caixa aberto
// proprio, lancamento daquele caixa e conta ainda a do PDV. Recusa e 403 (e uma questao de
// autorizacao, nao de payload malformado) e a mensagem diz QUAL condicao falhou.
//
// A-1 (Jose, 10/08/2026): o ramo da RETAGUARDA passou a nao exigir caixa aberto proprio. Sem isso a
// decisao ficaria pela metade — ela cria o lancamento com `caixa_id` nulo e, na hora de corrigir um
// numero, `existente.caixaId (null) !== caixa.id` recusava. Quem cria tem de conseguir corrigir.
//
// A mudanca fica AQUI, e nao em `validarEdicaoNoCaixaAberto`: aquela funcao tambem serve venda e
// transferencia, que nao entraram na decisao.
export async function validarEdicaoDeSaidaNoCaixa(
  // `contaOrigemId` fica opcional porque os DTOs de detalhe (shared) o declaram assim. Tentar
  // exigi-lo aqui quebra a compilacao nos tres services — e mudar o contrato do DTO e outra entrega.
  // Consequencia registrada no relatorio: se um refactor tirar a coluna da projecao, o campo chega
  // `undefined` e toda edicao de operador vira 403 em silencio, sem o compilador avisar. Quem segura
  // isso hoje sao os testes das tres saidas, nao o tipo.
  existente: { empresaId: string; caixaId: string | null; contaOrigemId?: string | null | undefined } | null,
  dados: { empresaId: string; contaOrigemId?: string | null | undefined },
  perfil: PerfilUsuario,
  tx?: ExecutorBanco
) {
  if (podeLancarSemCaixa(perfil)) return validarEdicaoDeSaidaDaRetaguarda(existente, dados, perfil, tx);

  if (!existente || !podeAcessarEmpresa(perfil, existente.empresaId)) throw new Error("Registro nao encontrado");
  if (existente.empresaId !== dados.empresaId) throw new Error("Nao e possivel mover o lancamento de empresa");

  let caixa;
  try {
    caixa = await obterCaixaParaLancamento(dados.empresaId, perfil.usuarioId, tx);
  } catch {
    // Fechado o caixa, acabou: corrigir vira ato de tesouraria. E o que protege os totais ja
    // congelados em `fechamentos_caixa`.
    throw proibido("Caixa fechado: correcao de lancamento passa a ser da Tesouraria");
  }
  if (existente.caixaId !== caixa.id) throw proibido("Lancamento nao pertence ao seu caixa aberto");
  // A conta JA GRAVADA tem de ser a do PDV do caixa aberto. Sem esta condicao, um PDV reapontado
  // para outra conta depois do lancamento abria a porta dos fundos: o corpo vinha sem conta, a
  // normalizacao preenchia com a conta NOVA e o registro historico MUDAVA de conta em silencio —
  // saindo do saldo de uma conta e entrando no de outra. R-122: o operador so corrige o que ainda
  // pertence ao caixa que ele tem aberto; PDV reapontado vira ato de tesouraria.
  if (idOuNulo(existente.contaOrigemId) !== caixa.pdvContaId) {
    throw proibido("Conta do lancamento nao e mais a conta do PDV aberto: correcao passa a ser da Tesouraria");
  }
  if (dados.contaOrigemId && dados.contaOrigemId !== caixa.pdvContaId) {
    throw proibido("Lancamento do operador Caixa precisa sair da conta do PDV aberto");
  }
  return caixa;
}

async function validarConta(
  dados: { empresaId: string; contaOrigemId?: string | null | undefined },
  db: ExecutorBanco = banco
) {
  if (dados.contaOrigemId && !(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId, db))) {
    return "Conta de origem";
  }
  return null;
}

export async function validarReferenciasVenda(dados: VendaPayload, db: ExecutorBanco = banco): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (dados.pdvId && !(await existeNaEmpresa(pdvs, dados.pdvId, dados.empresaId, db))) return "PDV";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db)))
    return "Colaborador";

  const produtosIds = [...new Set(dados.itensVenda.map((item) => item.produtoId).filter(Boolean))];
  for (const produtoId of produtosIds) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId, db))) return "Produto";
  }

  const formasPagamentoIds = [...new Set(dados.tiposPagamento.map((item) => item.formaPagamentoId).filter(Boolean))];
  for (const formaPagamentoId of formasPagamentoIds) {
    if (formaPagamentoId && !(await existeNaEmpresa(formasPagamento, formaPagamentoId, dados.empresaId, db))) {
      return "Forma de pagamento";
    }
  }

  return null;
}

export async function validarReferenciasDespesa(
  dados: DespesaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (dados.fornecedorId && !(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db)))
    return "Fornecedor";
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db)))
    return "Colaborador";
  if (dados.grupoDespesaId && !(await existeNaEmpresa(gruposDespesas, dados.grupoDespesaId, dados.empresaId, db))) {
    return "Grupo de despesa";
  }

  for (const grupoId of [...new Set(dados.itensDespesa.map((item) => item.grupoDespesaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposDespesas, grupoId, dados.empresaId, db))) return "Grupo de despesa";
  }

  // Grupo de PATRIMONIO no item (§5, item 6): mesma checagem de empresa dos demais — id valido de
  // OUTRA empresa nao entra.
  for (const grupoId of [...new Set(dados.itensDespesa.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, dados.empresaId, db)))
      return "Grupo de patrimonio";
  }

  for (const colaboradorId of [...new Set(dados.itensDespesa.map((item) => item.colaboradorId).filter(Boolean))]) {
    if (colaboradorId && !(await existeNaEmpresa(colaboradores, colaboradorId, dados.empresaId, db)))
      return "Colaborador";
  }

  // E6/R-135: o ITEM de patrimonio segue a MESMA checagem dos vizinhos. A FK garante que o id
  // existe, nao que ele e DESTA empresa — sem esta linha um id valido da empresa B entrava numa
  // despesa da empresa A e a descricao dela vazava no detalhe. Auditoria de 04/08/2026.
  for (const itemId of [...new Set(dados.itensDespesa.map((item) => item.patrimonioItemId).filter(Boolean))]) {
    if (itemId && !(await existeNaEmpresa(patrimonioItens, itemId, dados.empresaId, db))) return "Item de patrimonio";
  }

  return null;
}

export async function validarReferenciasMercadoria(
  dados: MercadoriaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  if (!(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db))) return "Fornecedor";
  if (
    dados.grupoMercadoriaId &&
    !(await existeNaEmpresa(gruposMercadorias, dados.grupoMercadoriaId, dados.empresaId, db))
  ) {
    return "Grupo de mercadoria";
  }

  for (const grupoId of [...new Set(dados.itensMercadoria.map((item) => item.grupoMercadoriaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposMercadorias, grupoId, dados.empresaId, db)))
      return "Grupo de mercadoria";
  }

  // Grupo de PATRIMONIO no item (§5, item 6): mesma checagem de empresa dos demais.
  for (const grupoId of [...new Set(dados.itensMercadoria.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, dados.empresaId, db)))
      return "Grupo de patrimonio";
  }

  for (const produtoId of [...new Set(dados.itensMercadoria.map((item) => item.produtoId).filter(Boolean))]) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, dados.empresaId, db))) return "Produto";
  }

  for (const unidadeId of [...new Set(dados.itensMercadoria.map((item) => item.unidadeMedidaId).filter(Boolean))]) {
    if (unidadeId && !(await existeNaEmpresa(unidadesMedida, unidadeId, dados.empresaId, db)))
      return "Unidade de medida";
  }

  return null;
}

export async function validarReferenciasRetirada(
  dados: RetiradaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  const conta = await validarConta(dados, db);
  if (conta) return conta;
  // R-047 + R-128: o credor da retirada e fornecedor, socio/gestor ou (historico) colaborador — o
  // zod garante que e exatamente UM; aqui confirmamos que o escolhido existe NA EMPRESA.
  //
  // O fornecedor ficou de fora desta lista ate 09/08/2026: o comentario antigo so falava de
  // colaborador e socio porque e anterior a R-128, que passou a ofertar fornecedor na retirada. A
  // FK `retiradas.fornecedor_id` e global, nao por empresa — sem esta linha uma retirada da empresa
  // A aceitava credor da empresa B e o nome dele vazava no detalhe. Despesa e mercadoria ja
  // validavam; a retirada era a unica fora.
  if (dados.fornecedorId && !(await existeNaEmpresa(fornecedores, dados.fornecedorId, dados.empresaId, db))) {
    return "Fornecedor";
  }
  if (dados.colaboradorId && !(await existeNaEmpresa(colaboradores, dados.colaboradorId, dados.empresaId, db))) {
    return "Colaborador";
  }
  if (dados.socioGestorId && !(await existeNaEmpresa(sociosGestores, dados.socioGestorId, dados.empresaId, db))) {
    return "Socio/gestor";
  }
  if (dados.grupoRetiradaId && !(await existeNaEmpresa(gruposRetiradas, dados.grupoRetiradaId, dados.empresaId, db))) {
    return "Grupo de retirada";
  }
  return null;
}

export async function validarReferenciasTransferencia(
  dados: TransferenciaPayload,
  db: ExecutorBanco = banco
): Promise<string | null> {
  if (!(await existeNaEmpresa(contas, dados.contaOrigemId, dados.empresaId, db))) return "Conta de origem";
  if (!(await existeNaEmpresa(contas, dados.contaDestinoId, dados.empresaId, db))) return "Conta de destino";
  return null;
}

export class PermissaoLancamentoInsuficienteError extends Error {
  constructor(readonly permissao: Permissao) {
    super("Permissao insuficiente");
  }
}

export function exigirPermissaoLancamento(permissoes: readonly Permissao[], permissao: Permissao) {
  if (!temPermissao(permissoes, permissao)) throw new PermissaoLancamentoInsuficienteError(permissao);
}

// ADR-004: campos sensiveis sao decisao de servidor. Cliente comum nao marca lancamento
// como nao-computavel nem como ja pago na criacao/edicao; a excecao exige caixas_gerenciar
// (politica provisoria ate o modulo Financeiro definir permissoes proprias de baixa).
export function resolverComputarLancamento(computarSolicitado: boolean, permissoes: readonly Permissao[]): boolean {
  if (computarSolicitado) return true;
  return temPermissao(permissoes, "caixas_gerenciar") ? false : true;
}

export function resolverDataPagamentoLancamento(
  dataPagamento: string | null | undefined,
  permissoes: readonly Permissao[]
): string | null {
  if (!dataPagamento) return null;
  return temPermissao(permissoes, "caixas_gerenciar") ? dataPagamento : null;
}

// --- Ciclo de vida R7/R10 (Fase 1): enforcement ADITIVO de PAGAR e D/Pago ----------------------
// So despesas/mercadorias/retiradas tem dataPagamento (transferencia = movimento imediato; entradas
// = venda por integracao). Retrocompativel: nada muda para quem ja podia.
//
// TODO(M3 / R9 e ciclo de vida): "efetuar" (V), "conferir" (CONF) e a EXCLUSAO (nao ha rota DELETE
// hoje) dependem de campos/rotas que ainda nao existem. Os codigos *_efetuar/*_conferir/*_excluir_
// dpago ja estao no catalogo e distribuidos por cargo; o enforcement entra quando as rotas/campos
// existirem (ver doc 09 P1/P2 e SPEC de 9 acoes). A notificacao de diferenca (R9/D8 / P2) tambem e M3.

// pagar: ADITIVO. Alem do novo *_pagar, mantemos o caminho legado (caixas_gerenciar) que HOJE ja
// libera dataPagamento — a Fase 1 nao remove regra mais fraca existente (a Fase 3 tira o fallback).
export function podePagarLancamento(permissoes: readonly Permissao[], dominio: DominioLancamentoPagavel): boolean {
  return temPermissao(permissoes, `${dominio}_pagar` as Permissao) || temPermissao(permissoes, "caixas_gerenciar");
}

// Exige *_pagar SOMENTE quando o payload DEFINE ou ALTERA a dataPagamento (comparando com o atual).
// Editar outros campos de um lancamento ja pago NAO cai aqui (isso e *_editar_dpago).
export function exigirPermissaoPagar(
  permissoes: readonly Permissao[],
  dominio: DominioLancamentoPagavel,
  dataPagamentoNova: string | null | undefined,
  dataPagamentoAtual: string | null = null
): void {
  const nova = dataPagamentoNova ?? null;
  if (nova === (dataPagamentoAtual ?? null)) return; // nao mexeu no pagamento
  if (!podePagarLancamento(permissoes, dominio)) {
    throw new PermissaoLancamentoInsuficienteError(`${dominio}_pagar` as Permissao);
  }
}

// _dpago: editar um lancamento JA PAGO (dataPagamento preenchida no registro atual) exige a variante
// *_editar_dpago — sem ela, 403 mesmo tendo *_editar.
export function exigirPermissaoEditarPago(
  permissoes: readonly Permissao[],
  dominio: DominioLancamentoPagavel,
  dataPagamentoAtual: string | null | undefined
): void {
  if (!dataPagamentoAtual) return; // nao pago -> o gate normal (*_editar) basta
  if (!temPermissao(permissoes, `${dominio}_editar_dpago` as Permissao)) {
    throw new PermissaoLancamentoInsuficienteError(`${dominio}_editar_dpago` as Permissao);
  }
}

// visualizar_dpago: sem a permissao, a listagem esconde os lancamentos JA PAGOS (server-side).
export function podeVerLancamentosPagos(permissoes: readonly Permissao[], dominio: DominioLancamentoPagavel): boolean {
  return temPermissao(permissoes, `${dominio}_visualizar_dpago` as Permissao);
}

// Confere soma de itens contra o total em centavos inteiros (sem float).
// Cada valor e convertido individualmente, espelhando como cada linha e gravada no banco.
export function somaConfereCentavos(valores: number[], total: number): boolean {
  const soma = valores.reduce((acumulado, valor) => acumulado + paraCentavos(valor), 0);
  return soma === paraCentavos(total);
}

// --- Discriminacao com descontos em 3 niveis (PROJECT_BRAIN/17 §5) ----------------------------
// O nivel 3 (geral) RATEIA entre os itens, entao o calculo e da LISTA INTEIRA, nunca item a item.
// A regra mora no shared (calcularDiscriminacao); aqui so se traduz o payload de cada dominio.

// Item de despesa aceita a forma curta "descricao + valor": sem quantidade, e 1 x valor.
export function itemDespesaParaDiscriminacao(item: DespesaItemPayload): ItemDiscriminacao {
  const quantidade = item.quantidade ?? 1;
  return {
    quantidade,
    valorUnitario: item.valorUnitario ?? (quantidade > 0 ? item.valor / quantidade : 0),
    descontoTipo: item.descontoTipo ?? null,
    descontoValor: item.descontoValor ?? null,
    descontoTotalTipo: item.descontoTotalTipo ?? null,
    descontoTotalValor: item.descontoTotalValor ?? null
  };
}

export function itemMercadoriaParaDiscriminacao(item: MercadoriaItemPayload): ItemDiscriminacao {
  return {
    quantidade: item.quantidade,
    valorUnitario: item.valorUnitario,
    descontoTipo: item.descontoTipo ?? null,
    descontoValor: item.descontoValor ?? null,
    descontoTotalTipo: item.descontoTotalTipo ?? null,
    descontoTotalValor: item.descontoTotalValor ?? null
  };
}

type CabecalhoComDescontoGeral = {
  descontoGeralTipo?: TipoDesconto | null | undefined;
  descontoGeralValor?: number | null | undefined;
};

export function calcularDiscriminacaoDespesa(
  dados: { itensDespesa: DespesaItemPayload[] } & CabecalhoComDescontoGeral
) {
  return calcularDiscriminacao({
    itens: dados.itensDespesa.map(itemDespesaParaDiscriminacao),
    descontoGeralTipo: dados.descontoGeralTipo ?? null,
    descontoGeralValor: dados.descontoGeralValor ?? null
  });
}

export function calcularDiscriminacaoMercadoria(
  dados: { itensMercadoria: MercadoriaItemPayload[] } & CabecalhoComDescontoGeral
) {
  return calcularDiscriminacao({
    itens: dados.itensMercadoria.map(itemMercadoriaParaDiscriminacao),
    descontoGeralTipo: dados.descontoGeralTipo ?? null,
    descontoGeralValor: dados.descontoGeralValor ?? null
  });
}

// D5 (BLOQUEANTE): a soma da discriminacao tem de bater com o Valor do lancamento. Quando nao bate,
// levanta 422 com ONDE diverge — diferenca em R$ e a linha provavel — em vez de um 400 seco.
export function exigirDiscriminacaoConferida(itens: readonly ItemDiscriminacao[], valorLancamento: number): void {
  const divergencia = conferirDiscriminacao(itens, valorLancamento);
  if (!divergencia) return;
  const diferenca = deCentavos(divergencia.diferencaCentavos);
  const sobra = divergencia.diferencaCentavos > 0;
  throw naoProcessavel(
    `A discriminacao ${sobra ? "excede" : "nao alcanca"} o valor do lancamento em ${dinheiroBr(Math.abs(diferenca))}.` +
      (divergencia.linhaProvavel ? ` Confira a linha ${divergencia.linhaProvavel} (a de maior valor).` : ""),
    "DISCRIMINACAO_DIVERGENTE",
    {
      diferenca,
      totalItens: deCentavos(divergencia.totalItensCentavos),
      valorLancamento: deCentavos(divergencia.valorLancamentoCentavos),
      linhaProvavel: divergencia.linhaProvavel,
      campoProvavel: divergencia.campoProvavel
    }
  );
}

function dinheiroBr(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

// Total liquido do item de mercadoria. Sem desconto, respeita o valorTotal informado (permite
// lancamento por soma direta / valor cheio). Com desconto, o servidor RECALCULA: bruto (qtd*unit)
// menos o desconto (% quando 'percentual', R$ quando 'valor'), nunca abaixo de zero.
export function calcularTotalItemMercadoria(item: MercadoriaItemPayload): number {
  if (!item.descontoTipo || item.descontoValor == null) return item.valorTotal;
  const bruto = item.quantidade * item.valorUnitario;
  const desconto = item.descontoTipo === "percentual" ? (bruto * item.descontoValor) / 100 : item.descontoValor;
  const liquido = bruto - desconto;
  return liquido > 0 ? liquido : 0;
}

// Referencias dos itens na discriminacao de mercadoria (grupos/produtos/unidades da empresa).
export async function validarReferenciasItensMercadoria(
  empresaId: string,
  itens: MercadoriaItemPayload[],
  db: ExecutorBanco = banco
): Promise<string | null> {
  for (const grupoId of [...new Set(itens.map((item) => item.grupoMercadoriaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposMercadorias, grupoId, empresaId, db))) return "Grupo de mercadoria";
  }
  for (const grupoId of [...new Set(itens.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, empresaId, db))) return "Grupo de patrimonio";
  }
  for (const produtoId of [...new Set(itens.map((item) => item.produtoId).filter(Boolean))]) {
    if (produtoId && !(await existeNaEmpresa(produtos, produtoId, empresaId, db))) return "Produto";
  }
  for (const unidadeId of [...new Set(itens.map((item) => item.unidadeMedidaId).filter(Boolean))]) {
    if (unidadeId && !(await existeNaEmpresa(unidadesMedida, unidadeId, empresaId, db))) return "Unidade de medida";
  }
  return null;
}

// Referencias dos itens na discriminacao de despesa (grupos/colaboradores da empresa).
export async function validarReferenciasItensDespesa(
  empresaId: string,
  itens: DespesaItemPayload[],
  db: ExecutorBanco = banco
): Promise<string | null> {
  for (const grupoId of [...new Set(itens.map((item) => item.grupoDespesaId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposDespesas, grupoId, empresaId, db))) return "Grupo de despesa";
  }
  for (const grupoId of [...new Set(itens.map((item) => item.grupoPatrimonioId).filter(Boolean))]) {
    if (grupoId && !(await existeNaEmpresa(gruposPatrimonio, grupoId, empresaId, db))) return "Grupo de patrimonio";
  }
  for (const colaboradorId of [...new Set(itens.map((item) => item.colaboradorId).filter(Boolean))]) {
    if (colaboradorId && !(await existeNaEmpresa(colaboradores, colaboradorId, empresaId, db))) return "Colaborador";
  }
  // E6/R-135: mesma checagem de empresa do item de patrimonio na criacao/edicao — a tela de
  // Discriminacao e outro caminho de escrita e nao pode ser a porta que o isolamento nao cobre.
  for (const itemId of [...new Set(itens.map((item) => item.patrimonioItemId).filter(Boolean))]) {
    if (itemId && !(await existeNaEmpresa(patrimonioItens, itemId, empresaId, db))) return "Item de patrimonio";
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// R-135 no SERVIDOR — o item da discriminacao de DESPESA vem de um cadastro
// ---------------------------------------------------------------------------------------------
// Ate 04/08/2026 a regra existia so na TELA (o campo de descricao livre saiu do formulario). O
// contrato zod continuava aceitando `{descricao, valor}` sem vinculo nenhum, entao qualquer cliente
// que nao fosse aquela tela — chamada direta, script, uma versao antiga do front em cache — repunha
// texto solto no banco e a R-135 valia so por convencao. Auditoria de 04/08/2026.
//
// A regra e de DESPESA, e nao de mercadoria. Nao e esquecimento: a importacao de NF-e cria item de
// mercadoria SEM `produtoId` de proposito quando o EAN nao casa com o cadastro — e o sinal de "nao
// cadastrado" (notas-fiscais.repository.ts). Exigir o vinculo la quebraria a importacao inteira.
//
// VINCULO ACEITO: `patrimonioItemId` OU `colaboradorId`, exatamente um. Sao as duas origens que a
// tela oferece (origensDoItem em useOperacaoLancamento.ts) e as duas colunas que o repositorio
// grava. Os dois juntos e ambiguidade, nao rigor: a linha ficaria com duas identidades e o
// `itemVinculado()` da tela mostraria so a primeira, escondendo a outra do usuario.

/** Um item so esta VINCULADO quando aponta um cadastro; grupo nao conta — grupo classifica, nao identifica. */
function temVinculoDeCadastro(item: Pick<DespesaItemPayload, "patrimonioItemId" | "colaboradorId">): boolean {
  return Boolean(item.patrimonioItemId) || Boolean(item.colaboradorId);
}

/** Descricao normalizada so no espaco das bordas: mudar o TEXTO de uma linha legada e criar uma nova. */
function chaveDaLinhaLegada(descricao: string): string {
  return descricao.trim();
}

/**
 * Exige que toda linha NOVA da discriminacao de despesa traga um item do cadastro, sem destruir o
 * historico ja gravado.
 *
 * Como o servidor distingue "linha nova" de "linha legada": nao ha id de item no payload (o
 * repositorio apaga e reinsere a lista inteira a cada gravacao), entao a identidade vem do que ja
 * esta PERSISTIDO. Uma linha sem vinculo so passa se o registro ja tiver, gravada, uma linha sem
 * vinculo com a MESMA descricao — e cada linha gravada e consumida uma unica vez. Isso da, de uma
 * vez:
 *   - registro historico reabre e salva (a linha antiga casa com ela mesma);
 *   - descricao livre NOVA nao entra (nao ha linha gravada para casar);
 *   - duplicar a linha legada tambem nao entra (a segunda copia nao acha par);
 *   - editar o TEXTO de uma linha legada nao entra — o historico se preserva, nao se reescreve.
 *
 * @param itensPersistidos itens hoje no banco, ou `null` na CRIACAO (onde nada e legado por definicao).
 */
export function exigirVinculoDosItensDespesa(
  itens: readonly DespesaItemPayload[],
  itensPersistidos: readonly Pick<DespesaItemPayload, "patrimonioItemId" | "colaboradorId" | "descricao">[] | null
): void {
  const legadasDisponiveis = new Map<string, number>();
  for (const item of itensPersistidos ?? []) {
    if (temVinculoDeCadastro(item)) continue;
    const chave = chaveDaLinhaLegada(item.descricao);
    legadasDisponiveis.set(chave, (legadasDisponiveis.get(chave) ?? 0) + 1);
  }

  itens.forEach((item, indice) => {
    const linha = indice + 1;
    if (item.patrimonioItemId && item.colaboradorId) {
      throw erroValidacao(
        `A linha ${linha} da discriminacao aponta Patrimonio E Colaborador ao mesmo tempo. O item vem de um cadastro so.`,
        "ITEM_DISCRIMINACAO_AMBIGUO",
        { linha }
      );
    }
    if (temVinculoDeCadastro(item)) return;

    const chave = chaveDaLinhaLegada(item.descricao);
    const restantes = legadasDisponiveis.get(chave) ?? 0;
    if (restantes > 0) {
      legadasDisponiveis.set(chave, restantes - 1);
      return;
    }
    throw erroValidacao(
      `A linha ${linha} da discriminacao precisa de um item do cadastro (Patrimonio ou Colaborador).`,
      "ITEM_DISCRIMINACAO_SEM_VINCULO",
      { linha, descricao: item.descricao }
    );
  });
}

export async function obterCaixaParaLancamento(empresaId: string, usuarioId: string, db?: ExecutorBanco) {
  return obterCaixaAbertoParaLancamento(empresaId, usuarioId, db);
}

/**
 * A-1 (decisao do Jose, 10/08/2026): quem `podeLancarSemCaixa` reconhece lanca as TRES saidas sem
 * caixa aberto proprio, seguindo o precedente da transferencia. O operador de Caixa continua
 * exigindo caixa aberto.
 *
 * Ate aqui as tres saidas chamavam `obterCaixaParaLancamento` INCONDICIONALMENTE, e so a
 * transferencia ramificava. O comentario de `podeLancarSemCaixa` dizia que a retaguarda "lanca sem
 * estar presa a um caixa" — e as saidas nao implementavam isso. Na pratica o Financeiro, que e quem
 * mais lanca despesa, dependia de um terceiro com `caixa_operar` abrir um caixa em nome dele.
 *
 * Devolve `null` quando e retaguarda e nao ha caixa aberto. Uma funcao so para as tres saidas: e o
 * que impede a regra de voltar a divergir entre elas.
 */
type CaixaDoLancamento = Awaited<ReturnType<typeof obterCaixaAbertoParaLancamento>>;

export async function obterCaixaDaSaida(
  empresaId: string,
  perfil: PerfilUsuario,
  db?: ExecutorBanco
): Promise<CaixaDoLancamento | null> {
  if (podeLancarSemCaixa(perfil)) return buscarCaixaAbertoUsuarioRepository(empresaId, perfil.usuarioId, db);
  return obterCaixaAbertoParaLancamento(empresaId, perfil.usuarioId, db);
}

/**
 * O `caixa_id` que a saida GRAVA. So conta para o caixa o que de fato saiu da conta do PDV dele.
 *
 * Para o operador isso e sempre o caixa aberto — `exigirContaDoCaixaNoLancamento` ja garantiu que a
 * conta e a do PDV. Para a retaguarda, e `null` sempre que a conta escolhida nao for a do PDV, mesmo
 * que ela tenha um caixa aberto: gravar o `caixa_id` ali faria o lancamento entrar no total do
 * fechamento SEM o dinheiro ter saido daquele caixa — quebra falsa no colo do operador (R-015), que
 * e o oposto do que a R-121 existe para evitar.
 *
 * E o mesmo criterio da transferencia (`envolveContaPdv ? caixa.id : null`), reduzido a origem
 * porque saida so tem origem.
 */
export function caixaIdDaSaida(
  caixa: CaixaDoLancamento | null,
  dados: { contaOrigemId?: string | null | undefined }
): string | null {
  if (!caixa) return null;
  return idOuNulo(dados.contaOrigemId) === caixa.pdvContaId ? caixa.id : null;
}
