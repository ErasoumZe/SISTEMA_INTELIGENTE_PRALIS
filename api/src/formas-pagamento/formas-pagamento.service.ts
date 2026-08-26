import type { DadosExternos } from "@padaria/shared/api";
import { formaPagamentoPayloadSchema, type RoteamentoDaForma } from "@padaria/shared/formas-pagamento";
import { proibido } from "../erros.js";
import {
  buscarRoteamentoDaFormaRepository,
  listarFormasPagamentoRepository,
  salvarFormaPagamentoRepository
} from "./formas-pagamento.repository.js";

const SEM_ROTEAMENTO: RoteamentoDaForma = {
  adquirente: null,
  usaContaDoPdv: false,
  contaRecebivelId: null,
  contaFinalId: null,
  disponibilidade: null
};

function mesmoRoteamento(a: RoteamentoDaForma, b: RoteamentoDaForma): boolean {
  return (
    a.adquirente === b.adquirente &&
    a.usaContaDoPdv === b.usaContaDoPdv &&
    a.contaRecebivelId === b.contaRecebivelId &&
    a.contaFinalId === b.contaFinalId &&
    a.disponibilidade === b.disponibilidade
  );
}

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

  const alvo: RoteamentoDaForma = {
    adquirente: dados.adquirente ?? null,
    usaContaDoPdv: dados.usaContaDoPdv ?? false,
    contaRecebivelId: dados.contaRecebivelId ?? null,
    contaFinalId: dados.contaFinalId ?? null,
    disponibilidade: dados.disponibilidade ?? null
  };
  const atual = id
    ? ((await buscarRoteamentoDaFormaRepository(id, dados.empresaId)) ?? SEM_ROTEAMENTO)
    : SEM_ROTEAMENTO;
  const mudouRoteamento = !mesmoRoteamento(atual, alvo);

  if (mudouRoteamento && !contexto.podeRotear) {
    throw proibido(
      "Alterar o roteamento financeiro exige a permissao dedicada de roteamento de formas de pagamento",
      "ROTEAMENTO_SEM_PERMISSAO"
    );
  }

  return salvarFormaPagamentoRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    ...(mudouRoteamento ? { roteamento: alvo, atualizadoPor: contexto.usuarioId } : {})
  });
}
