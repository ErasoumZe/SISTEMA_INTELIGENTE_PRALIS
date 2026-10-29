import type { DadosExternos } from "@padaria/shared/api";
import { pdvPayloadSchema } from "@padaria/shared/pdvs";
import { filtrarPorEmpresas } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { falharValidacao } from "../utils.js";
import { buscarCaixaAbertoDoPdvRepository, travarCaixaCompartilhadoRepository } from "../caixa/caixa.repository.js";
import { buscarContaEmpresaRepository } from "../contas/contas.repository.js";
import { rotuloTurnoCaixa } from "@padaria/shared/pdvs";
import {
  listarPdvsRepository,
  listarPostosVinculadosRepository,
  salvarPdvRepository,
  travarPdvRepository
} from "./pdvs.repository.js";

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
    // R-229 · desmarcar um turno do caixa: nunca com login de posto nele nem com caixa aberto no PDV.
    if (id && dados.turnosCaixa) {
      const atualTurnos = await travarPdvRepository(id, dados.empresaId, tx);
      const removidos = (atualTurnos?.turnosCaixa ?? []).filter((turno) => !dados.turnosCaixa!.includes(turno));
      if (removidos.length) {
        const vinculados = await listarPostosVinculadosRepository(id, removidos, tx);
        if (vinculados.length) {
          const nomes = vinculados.map((item) => `${item.nome} (${rotuloTurnoCaixa[item.turnoCaixa!]})`).join(", ");
          falharValidacao(`O turno do caixa tem login de posto vinculado: ${nomes}. Troque o posto em Usuários antes.`);
        }
        if (await buscarCaixaAbertoDoPdvRepository(id, tx)) {
          falharValidacao("PDV com caixa aberto ou em fechamento: os turnos do caixa não podem ser alterados agora");
        }
      }
    }
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
        ativo: dados.ativo,
        ...(dados.turnosCaixa ? { turnosCaixa: dados.turnosCaixa } : {})
      },
      tx
    );
  });
}
