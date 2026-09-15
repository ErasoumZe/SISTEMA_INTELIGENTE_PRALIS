import type { PerfilUsuario } from "@padaria/shared";
import { deCentavos, liquidoDeSomasCentavos, paraCentavos } from "@padaria/shared/dinheiro";
import {
  percentualDaMetaCentavos,
  type CampanhaComProgresso,
  type CampanhaPayload,
  type StatusCampanha
} from "@padaria/shared/campanhas";
import { podeAcessarEmpresa } from "../auth/empresa.js";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { listarOperadoresComCaixaAbertoRepository } from "../mensagens-admin/mensagens-admin.repository.js";
import { criarNotificacoesRepository } from "../notificacoes/notificacoes.repository.js";
import {
  atualizarCampanhaRepository,
  atualizarStatusCampanhaRepository,
  buscarCampanhaRepository,
  criarCampanhaRepository,
  listarCampanhasDoPdvNoDiaRepository,
  listarCampanhasRepository,
  listarPdvsDasCampanhasRepository,
  somarVendasPorPdvRepository,
  somarVendasSemPdvRepository,
  substituirPdvsDaCampanhaRepository,
  type CampanhaEscrita
} from "./campanhas.repository.js";

function exigirEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!podeAcessarEmpresa(perfil, empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

function paraEscrita(dados: CampanhaPayload): CampanhaEscrita {
  return {
    empresaId: dados.empresaId,
    titulo: dados.titulo,
    mensagem: dados.mensagem,
    inicio: dados.inicio,
    fim: dados.fim,
    metaValorCentavos: paraCentavos(dados.metaValor),
    bonificacaoTipo: dados.bonificacaoTipo,
    bonificacaoValorCentavos:
      dados.bonificacaoTipo === "recompensa" || dados.bonificacaoValor == null
        ? null
        : // Percentual NAO passa por paraCentavos: 15% viraria 1500. E ponto percentual, nao dinheiro.
          dados.bonificacaoTipo === "percentual"
          ? Math.round(dados.bonificacaoValor)
          : paraCentavos(dados.bonificacaoValor),
    bonificacaoTexto: dados.bonificacaoTipo === "recompensa" ? (dados.bonificacaoTexto ?? null) : null
  };
}

type LinhaCampanha = Awaited<ReturnType<typeof listarCampanhasRepository>>[number];

/**
 * Progresso AO VIVO (R-199). Nenhuma coluna de saldo, nenhum cache: cancelamento, reenvio do CREARE
 * e troca de caixa refletem sozinhos na proxima leitura.
 */
async function montarProgresso(
  campanha: LinhaCampanha,
  pdvsDaCampanha: { pdvId: string; pdvNome: string | null }[]
): Promise<CampanhaComProgresso> {
  const pdvIds = pdvsDaCampanha.map((pdv) => pdv.pdvId);
  const janela = { empresaId: campanha.empresaId, inicio: campanha.inicio, fim: campanha.fim };

  const [porPdv, semPdv] = await Promise.all([
    somarVendasPorPdvRepository({ ...janela, pdvIds }),
    somarVendasSemPdvRepository(janela)
  ]);

  const somaPorPdv = new Map(porPdv.map((linha) => [linha.pdvId, liquidoDeSomasCentavos(linha)]));
  const pdvsComProgresso = pdvsDaCampanha.map((pdv) => ({
    pdvId: pdv.pdvId,
    pdvNome: pdv.pdvNome,
    vendidoNoPeriodo: deCentavos(somaPorPdv.get(pdv.pdvId) ?? 0)
  }));

  const totalCentavos = [...somaPorPdv.values()].reduce((soma, valor) => soma + valor, 0);
  const metaCentavos = paraCentavos(campanha.metaValor);

  return {
    id: campanha.id,
    empresaId: campanha.empresaId,
    titulo: campanha.titulo,
    mensagem: campanha.mensagem,
    inicio: campanha.inicio,
    fim: campanha.fim,
    metaValor: deCentavos(metaCentavos),
    bonificacaoTipo: campanha.bonificacaoTipo,
    bonificacaoValor:
      campanha.bonificacaoValor == null
        ? null
        : campanha.bonificacaoTipo === "percentual"
          ? Number(campanha.bonificacaoValor)
          : deCentavos(paraCentavos(campanha.bonificacaoValor)),
    bonificacaoTexto: campanha.bonificacaoTexto,
    status: campanha.status,
    criadoPor: campanha.criadoPor,
    criadoEm: campanha.criadoEm.toISOString(),
    pdvs: pdvsComProgresso,
    totalVendido: deCentavos(totalCentavos),
    percentualDaMeta: percentualDaMetaCentavos(totalCentavos, metaCentavos),
    naoAtribuido: deCentavos(liquidoDeSomasCentavos(semPdv))
  };
}

export async function listarCampanhas(empresaId: string, perfil: PerfilUsuario): Promise<CampanhaComProgresso[]> {
  exigirEmpresa(perfil, empresaId);
  const linhas = await listarCampanhasRepository(empresaId);
  const pdvsDeTodas = await listarPdvsDasCampanhasRepository(linhas.map((linha) => linha.id));
  return Promise.all(
    linhas.map((linha) =>
      montarProgresso(
        linha,
        pdvsDeTodas.filter((pdv) => pdv.campanhaId === linha.id)
      )
    )
  );
}

export async function salvarCampanha(
  dados: CampanhaPayload,
  perfil: PerfilUsuario,
  campanhaId?: string
): Promise<{ id: string }> {
  exigirEmpresa(perfil, dados.empresaId);

  if (campanhaId) {
    const atual = await buscarCampanhaRepository(campanhaId, dados.empresaId);
    if (!atual) throw naoEncontrado("Campanha nao encontrada", "CAMPANHA_NAO_ENCONTRADA");
    // Campanha encerrada ou cancelada e historico: mexer nela mudaria um resultado ja comunicado.
    if (atual.status === "encerrada" || atual.status === "cancelada") {
      throw erroValidacao("Campanha encerrada ou cancelada nao pode ser editada", "CAMPANHA_FECHADA");
    }
  }

  return executarEmTransacao(async (tx) => {
    const id = campanhaId
      ? ((await atualizarCampanhaRepository({ campanhaId, empresaId: dados.empresaId, dados: paraEscrita(dados) }, tx))
          ?.id ?? null)
      : await criarCampanhaRepository({ ...paraEscrita(dados), criadoPor: perfil.usuarioId }, tx);
    if (!id) throw naoEncontrado("Campanha nao encontrada", "CAMPANHA_NAO_ENCONTRADA");

    await substituirPdvsDaCampanhaRepository({ campanhaId: id, empresaId: dados.empresaId, pdvIds: dados.pdvIds }, tx);
    return { id };
  });
}

/**
 * Notificacao automatica aos PDVs participantes, no momento em que a campanha e ATIVADA.
 *
 * Alcanca quem esta com caixa aberto nesses PDVs agora. Quem abrir depois nao recebe sino, mas VE a
 * campanha no proprio fechamento — que e onde o resultado importa. Diferente da mensagem
 * administrativa, campanha nao tem "ciencia" a cobrar, entao nao ha alvo persistido a resolver
 * depois.
 */
async function notificarPdvsDaCampanha(
  input: { empresaId: string; campanhaId: string; titulo: string; pdvIds: string[] },
  db: ExecutorBanco
) {
  if (!input.pdvIds.length) return;
  const abertos = await listarOperadoresComCaixaAbertoRepository(input.empresaId, input.pdvIds, db);
  const destinatarios = [
    ...new Set(abertos.map((linha) => linha.usuarioId).filter((usuarioId): usuarioId is string => Boolean(usuarioId)))
  ];
  await criarNotificacoesRepository(
    {
      empresaId: input.empresaId,
      tipo: "campanha",
      destinatariosUsuarioIds: destinatarios,
      referenciaId: input.campanhaId,
      titulo: `Campanha ativa: ${input.titulo}`
    },
    db
  );
}

export async function mudarStatusCampanha(
  campanhaId: string,
  empresaId: string,
  status: StatusCampanha,
  perfil: PerfilUsuario
) {
  exigirEmpresa(perfil, empresaId);
  const atual = await buscarCampanhaRepository(campanhaId, empresaId);
  if (!atual) throw naoEncontrado("Campanha nao encontrada", "CAMPANHA_NAO_ENCONTRADA");
  if (atual.status === status) return;
  // Sentido unico: cancelada e encerrada sao finais. Reabrir mudaria um resultado ja comunicado ao
  // PDV — e a bonificacao e informativa justamente porque ninguem reescreve o que ja foi dito.
  if (atual.status === "encerrada" || atual.status === "cancelada") {
    throw erroValidacao("Campanha encerrada ou cancelada nao volta atras", "CAMPANHA_FECHADA");
  }

  await executarEmTransacao(async (tx) => {
    await atualizarStatusCampanhaRepository({ campanhaId, empresaId, status }, tx);
    if (status !== "ativa") return;
    const pdvsDaCampanha = await listarPdvsDasCampanhasRepository([campanhaId], tx);
    await notificarPdvsDaCampanha(
      {
        empresaId,
        campanhaId,
        titulo: atual.titulo,
        pdvIds: pdvsDaCampanha.map((pdv) => pdv.pdvId)
      },
      tx
    );
  });
}

/**
 * O que o FECHAMENTO exibe (R-199): somente leitura, somente informativo. Nao altera nenhum total do
 * caixa, nao toca contas, folha nem financeiro — e por isso vive fora de `calcularTotaisCaixa`.
 */
export async function campanhasDoFechamento(input: {
  empresaId: string;
  pdvId: string | null;
  dia: string;
  perfil: PerfilUsuario;
}): Promise<CampanhaComProgresso[]> {
  exigirEmpresa(input.perfil, input.empresaId);
  if (!input.pdvId) return [];

  const doPdv = await listarCampanhasDoPdvNoDiaRepository({
    empresaId: input.empresaId,
    pdvId: input.pdvId,
    dia: input.dia
  });
  if (!doPdv.length) return [];

  const ids = new Set(doPdv.map((linha) => linha.id));
  const todas = await listarCampanhas(input.empresaId, input.perfil);
  return todas.filter((campanha) => ids.has(campanha.id));
}
