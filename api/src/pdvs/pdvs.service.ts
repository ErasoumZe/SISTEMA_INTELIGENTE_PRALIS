import type { DadosExternos } from "@padaria/shared/api";
import { pdvPayloadSchema } from "@padaria/shared/pdvs";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { falharValidacao } from "../utils.js";
import { buscarCaixaAbertoDoPdvRepository, travarCaixaCompartilhadoRepository } from "../caixa/caixa.repository.js";
import { buscarContaEmpresaRepository } from "../contas/contas.repository.js";
import { listarPdvsRepository, salvarPdvRepository, travarPdvRepository } from "./pdvs.repository.js";

export async function listarPdvs(escopoDados: string[]) {
  return filtrarPorEmpresas(await listarPdvsRepository(), escopoDados);
}

export async function salvarPdv(id: string | null, body: DadosExternos) {
  const dados = pdvPayloadSchema.parse(body);
  return executarEmTransacao(async (tx) => {
    const conta = await buscarContaEmpresaRepository(dados.contaId, tx);
    if (!conta || conta.empresaId !== dados.empresaId) falharValidacao("Conta nao pertence a empresa");
    // S3 (R-164): a conta do PDV e o pivo dos sete totais de transferencia — trocar a conta com
    // caixa aberto mudaria o sinal das linhas de um caixa vivo por fora da porta. O FOR UPDATE do
    // PDV serializa com aberturas em voo; o FOR SHARE no caixa serializa com o fechamento: quem
    // chegar durante o fechamento espera e, se o caixa segue aberto, a troca e recusada. Renomear
    // sem trocar a conta continua livre.
    if (id) {
      const atual = await travarPdvRepository(id, dados.empresaId, tx);
      if (atual && atual.contaId !== dados.contaId) {
        const caixaAberto = await buscarCaixaAbertoDoPdvRepository(id, tx);
        if (caixaAberto) {
          const trava = await travarCaixaCompartilhadoRepository(caixaAberto.id, tx);
          if (trava && trava.status !== "fechado") {
            falharValidacao("PDV com caixa aberto ou em fechamento: a conta nao pode ser trocada");
          }
        }
      }
    }
    return salvarPdvRepository(
      {
        ...(id ? { id } : {}),
        empresaId: dados.empresaId,
        nome: dados.nome.trim(),
        contaId: dados.contaId,
        ativo: dados.ativo
      },
      tx
    );
  });
}
