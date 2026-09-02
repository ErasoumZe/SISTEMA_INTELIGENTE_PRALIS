import { dependentePayloadSchema, type DadosExternos, type DependentesDto } from "@padaria/shared";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, erroValidacao, falhaTecnica, naoEncontrado } from "../erros.js";
import {
  atualizarDependenteRepository,
  criarDependenteRepository,
  excluirDependenteRepository,
  listarDependentesRepository
} from "./dependentes.repository.js";
import { atualizarFichaRepository, obterFichaRepository } from "./ficha.repository.js";
import { conviteDoToken, travarFichaEditavel, type Convite } from "./ficha.service.js";

/**
 * ADM-003 V4 — os dependentes, pela porta do candidato.
 *
 * As quatro operacoes entram por `conviteDoToken`, e SO por ele. Empresa e processo saem da linha do
 * convite; nao existe parametro de empresa em lugar nenhum deste arquivo, e nao deve existir.
 *
 * As tres escritas tomam `travarFichaEditavel` antes de qualquer outra coisa. Isso resolve duas
 * coisas de uma vez: serializa duas abas do mesmo candidato — o indice unico parcial de CPF nao
 * alcanca o dependente SEM CPF — e impede mexer em ficha ja enviada ou aprovada.
 */

/**
 * A declaracao e a lista precisam contar a mesma historia, e quem as sincroniza e este arquivo:
 *
 * - cadastrar alguem torna "nao tenho dependentes" mentira, entao a resposta passa a ser `false`;
 * - apagar o ULTIMO devolve a resposta para `null` (nao respondeu), e nao para `true`. Apagar nao e
 *   declarar: quem tirou o unico dependente pode estar corrigindo um erro de digitacao, e marcar
 *   `true` por ele poria na ficha uma declaracao que o candidato nunca fez.
 *
 * So grava quando o valor muda de verdade. Cada gravacao sobe a versao da ficha, e subir versao a
 * toa faria o formulario aberto do proprio candidato tomar 409 no rascunho seguinte.
 */
async function sincronizarDeclaracao(
  convite: Convite,
  atual: { versao: number; semDependentes: boolean | null },
  desejada: boolean | null,
  tx: TransacaoBanco
): Promise<number> {
  if (atual.semDependentes === desejada) return atual.versao;
  const linha = await atualizarFichaRepository(
    {
      processoId: convite.processoId,
      empresaId: convite.empresaId,
      versaoAtual: atual.versao,
      campos: {},
      semDependentes: desejada
    },
    tx
  );
  if (linha === null) {
    throw conflito("Alguem gravou esta ficha enquanto voce editava", "VERSAO_CONFLITANTE");
  }
  return linha.versao;
}

/** O SQLSTATE da falha, esteja ele no topo do erro ou embrulhado. */
function codigoDoPostgres(falha: DadosExternos): string | undefined {
  // O `drizzle-orm` embrulha a falha de query e guarda a original em `cause`. Ler so o topo faz o
  // SQLSTATE sumir — e foi exatamente assim que a duplicidade de CPF virou 500 em vez de 409 na
  // primeira rodada dos testes. Percorrer a cadeia funciona nos dois formatos, embrulhado ou nao.
  let atual: DadosExternos = falha;
  for (let salto = 0; salto < 4; salto += 1) {
    if (!(atual instanceof Error)) return undefined;
    const codigo = (atual as { code?: DadosExternos }).code;
    if (typeof codigo === "string") return codigo;
    atual = (atual as { cause?: DadosExternos }).cause;
  }
  return undefined;
}

/**
 * O banco tem a ultima palavra sobre CPF, e ela precisa chegar ao candidato como recusa, nao como
 * "erro interno". Sao dois codigos:
 *
 * - `23505` e o indice unico parcial `(processo_id, cpf)`: o mesmo CPF duas vezes no mesmo processo.
 *   E o que segura a corrida entre duas abas, onde a checagem em aplicacao chegaria tarde.
 * - `23514` e o CHECK de digito verificador da migration 0038. O Zod ja recusa antes; este ramo
 *   existe porque o banco e a ultima linha, e cair em 500 aqui esconderia exatamente o caso em que
 *   ele foi a unica linha que funcionou.
 *
 * Nenhuma das duas mensagens repete o valor recusado: e CPF de terceiro, e mensagem de erro vai para
 * a tela, para o log e para a captura de erros.
 */
async function comErroDoBancoTraduzido<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (falha) {
    const codigo = codigoDoPostgres(falha);
    if (codigo === "23505") {
      throw conflito("Este CPF já foi informado para outro dependente.", "DEPENDENTE_CPF_DUPLICADO");
    }
    if (codigo === "23514") {
      throw erroValidacao("Dados do dependente inválidos.", "DEPENDENTE_INVALIDO");
    }
    throw falha;
  }
}

export async function listarDependentes(token: string | undefined): Promise<DependentesDto> {
  const convite = await conviteDoToken(token);
  const ficha = await obterFichaRepository(convite.processoId, convite.empresaId);
  if (!ficha) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");
  const itens = await listarDependentesRepository(convite.processoId, convite.empresaId);
  return { versao: ficha.versao, semDependentes: ficha.semDependentes, itens };
}

export async function criarDependente(
  token: string | undefined,
  body: DadosExternos
): Promise<DependentesDto> {
  const convite = await conviteDoToken(token);
  const dados = dependentePayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const ficha = await travarFichaEditavel(convite, tx);
    const criado = await comErroDoBancoTraduzido(() =>
      criarDependenteRepository(
        {
          processoId: convite.processoId,
          empresaId: convite.empresaId,
          nomeCompleto: dados.nomeCompleto,
          nascimento: dados.nascimento,
          parentesco: dados.parentesco,
          cpf: dados.cpf ?? null,
          finalidades: dados.finalidades
        },
        tx
      )
    );
    if (!criado) throw falhaTecnica("insert de dependente nao devolveu linha");

    const versao = await sincronizarDeclaracao(convite, ficha, false, tx);
    const itens = await listarDependentesRepository(convite.processoId, convite.empresaId, tx);
    return { versao, semDependentes: false, itens };
  });
}

export async function atualizarDependente(
  token: string | undefined,
  id: string,
  body: DadosExternos
): Promise<DependentesDto> {
  const convite = await conviteDoToken(token);
  const dados = dependentePayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const ficha = await travarFichaEditavel(convite, tx);
    const alterado = await comErroDoBancoTraduzido(() =>
      atualizarDependenteRepository(
        {
          id,
          processoId: convite.processoId,
          empresaId: convite.empresaId,
          nomeCompleto: dados.nomeCompleto,
          nascimento: dados.nascimento,
          parentesco: dados.parentesco,
          cpf: dados.cpf ?? null,
          finalidades: dados.finalidades
        },
        tx
      )
    );
    // Id de outra empresa e id inexistente respondem igual, de proposito: distinguir os dois diria a
    // quem tenta que o registro existe em algum lugar.
    if (!alterado) throw naoEncontrado("Dependente nao encontrado", "DEPENDENTE_NAO_ENCONTRADO");

    // Editar nao mexe na declaracao: quem tem um dependente continua tendo depois de corrigir o nome.
    const itens = await listarDependentesRepository(convite.processoId, convite.empresaId, tx);
    return { versao: ficha.versao, semDependentes: ficha.semDependentes, itens };
  });
}

export async function excluirDependente(
  token: string | undefined,
  id: string
): Promise<DependentesDto> {
  const convite = await conviteDoToken(token);

  return executarEmTransacao(async (tx) => {
    const ficha = await travarFichaEditavel(convite, tx);
    const removido = await excluirDependenteRepository(
      { id, processoId: convite.processoId, empresaId: convite.empresaId },
      tx
    );
    if (!removido) throw naoEncontrado("Dependente nao encontrado", "DEPENDENTE_NAO_ENCONTRADO");

    const itens = await listarDependentesRepository(convite.processoId, convite.empresaId, tx);
    const desejada = itens.length === 0 ? null : ficha.semDependentes;
    const versao = await sincronizarDeclaracao(convite, ficha, desejada, tx);
    return { versao, semDependentes: desejada, itens };
  });
}
