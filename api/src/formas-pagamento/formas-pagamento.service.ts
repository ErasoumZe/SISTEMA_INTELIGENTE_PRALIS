import type { DadosExternos } from "@padaria/shared/api";
import {
  formaPagamentoPayloadSchema,
  mesclarRoteamento,
  mesmoRoteamento,
  regraRecebimentoPayloadSchema,
  roteamentoCoerente,
  SEM_ROTEAMENTO
} from "@padaria/shared/formas-pagamento";
import { erroValidacao, proibido } from "../erros.js";
import {
  buscarRoteamentoDaFormaRepository,
  contasDaEmpresaRepository,
  formaPagamentoExisteRepository,
  listarFormasPagamentoRepository,
  listarRegrasRecebimentoRepository,
  salvarRegraRecebimentoRepository,
  salvarFormaPagamentoRepository
} from "./formas-pagamento.repository.js";

export async function listarFormasPagamento(escopoDados: string[], incluirRoteamento: boolean) {
  if (!escopoDados.length) return [];
  return listarFormasPagamentoRepository(escopoDados, incluirRoteamento);
}

/**
 * R-176: alterar roteamento exige a permissao DEDICADA, no POST e no PUT.
 *
 * O guard compara o roteamento ALVO com o ATUAL, em vez de olhar quais campos vieram no corpo. A
 * diferenca importa: uma tela que sempre manda o objeto inteiro (com os nulos) nao pode passar a
 * receber 403 para renomear uma forma que nao tem roteamento nenhum. So bloqueia quem esta de fato
 * MUDANDO o destino do dinheiro.
 *
 * E quando o chamador nao esta mudando, o roteamento nao entra no UPDATE — um PUT sem a permissao
 * PRESERVA o que estava gravado, em vez de zerar o destino em silencio.
 */
export async function salvarFormaPagamento(
  id: string | null,
  body: DadosExternos,
  contexto: { podeRotear: boolean; usuarioId: string | null }
) {
  const dados = formaPagamentoPayloadSchema.parse(body);

  const atual = id
    ? ((await buscarRoteamentoDaFormaRepository(id, dados.empresaId)) ?? SEM_ROTEAMENTO)
    : SEM_ROTEAMENTO;
  // AUSENTE nao e NULO: um PUT que so renomeia a forma nao carrega os campos de roteamento e tem de
  // preservar o destino. Zerar por omissao apagaria o credito de todas as vendas seguintes daquela
  // forma — em silencio, e sem passar por permissao nenhuma.
  const alvo = mesclarRoteamento(atual, dados);
  const mudouRoteamento = !mesmoRoteamento(atual, alvo);

  // PERMISSAO ANTES DE VALIDACAO, e a ordem e deliberada: quem nao pode mexer no roteamento recebe
  // 403 seco, sem um 400 que descreveria o estado do recurso que ele nao tem direito de alterar.
  if (mudouRoteamento && !contexto.podeRotear) {
    throw proibido(
      "Alterar o roteamento financeiro exige a permissao dedicada de roteamento de formas de pagamento",
      "ROTEAMENTO_SEM_PERMISSAO"
    );
  }

  // A coerencia e checada sobre o roteamento RESULTANTE, nunca sobre o corpo isolado: quem envia so
  // `disponibilidade` num PUT parcial esta descrevendo o estado final, nao um cadastro inteiro.
  if (mudouRoteamento) {
    const coerencia = roteamentoCoerente(alvo);
    if (!coerencia.ok) throw erroValidacao(coerencia.mensagem, "ROTEAMENTO_INCOERENTE", { campo: coerencia.campo });
  }

  // Isolamento entre empresas, checado ANTES de escrever: apontar o roteamento para conta de outra
  // empresa e exatamente o cenario que a FK composta da 0033 barra no banco. Aqui vira 400 legivel.
  if (mudouRoteamento) {
    const informadas = [alvo.contaRecebivelId, alvo.contaFinalId].filter((id): id is string => !!id);
    if (informadas.length) {
      const validas = await contasDaEmpresaRepository(informadas, dados.empresaId);
      const invalida = informadas.find((id) => !validas.has(id));
      if (invalida) {
        throw erroValidacao(
          "Conta de roteamento nao pertence a empresa da forma de pagamento",
          "ROTEAMENTO_CONTA_DE_OUTRA_EMPRESA"
        );
      }
    }
  }

  return salvarFormaPagamentoRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    ...(dados.categoriaFechamentoCaixa === undefined
      ? {}
      : { categoriaFechamentoCaixa: dados.categoriaFechamentoCaixa }),
    ...(mudouRoteamento ? { roteamento: alvo, atualizadoPor: contexto.usuarioId } : {})
  });
}

// As regras pertencem ao mesmo ato de configurar o recebimento. A permissao e a mesma do
// roteamento porque taxa/prazo revelam e orientam o destino financeiro; nao existe uma segunda
// permissao nem uma rota publica de configuracao.
export async function listarRegrasRecebimento(formaPagamentoId: string, empresaId: string) {
  const existe = await formaPagamentoExisteRepository(formaPagamentoId, empresaId);
  if (!existe) throw erroValidacao("Forma de pagamento nao encontrada nesta empresa", "FORMA_NAO_ENCONTRADA");
  return listarRegrasRecebimentoRepository(formaPagamentoId, empresaId);
}

export async function salvarRegraRecebimento(
  id: string | null,
  formaPagamentoId: string,
  body: DadosExternos,
  usuarioId: string | null
) {
  const regra = regraRecebimentoPayloadSchema.parse(body);
  const existe = await formaPagamentoExisteRepository(formaPagamentoId, regra.empresaId);
  if (!existe) throw erroValidacao("Forma de pagamento nao encontrada nesta empresa", "FORMA_NAO_ENCONTRADA");
  const salva = await salvarRegraRecebimentoRepository({
    ...(id ? { id } : {}),
    empresaId: regra.empresaId,
    formaPagamentoId,
    regra,
    usuarioId
  });
  if (!salva) throw erroValidacao("Regra de recebimento nao encontrada nesta forma", "REGRA_NAO_ENCONTRADA");
  return salva;
}
