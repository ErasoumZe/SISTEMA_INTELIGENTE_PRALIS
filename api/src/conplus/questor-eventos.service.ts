import type { PerfilUsuario } from "@padaria/shared";
import type { DadosExternos } from "@padaria/shared/api";
import {
  ERROS_EXPORTACAO_QUESTOR,
  VERSAO_LAYOUT_EVENTOS_QUESTOR,
  lerCatalogoEventosConplus,
  normalizarRazaoSocialQuestor,
  questorEventosVariaveisTecnicoSchema,
  questorLancamentoCancelamentoSchema,
  prepararArquivoEventosVariaveis,
  questorCatalogoImportacaoSchema,
  questorEventosVariaveisCatalogoSchema,
  questorEventosVariaveisGeracaoSchema,
  questorEventosVariaveisLancamentoSchema,
  questorEventosVariaveisPreviaSchema,
  questorEventosVariaveisQuerySchema,
  questorEventoVariavelAtualizacaoSchema,
  type QuestorCatalogoImportacaoDto,
  type QuestorEventosVariaveisPreviaDto,
  type QuestorLancamentoVariavelDto
} from "@padaria/shared/conplus";
import { atorDoPerfil, empresaDoAtor } from "../admissoes/ator.js";
import { conflito, naoEncontrado, naoProcessavel } from "../erros.js";
import { comMigrationQuestor } from "./questor-comum.service.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { registrarAuditoriaQuestorRepository } from "./questor-auditoria.repository.js";
import {
  exigirArquivoTecnicoDisponivel,
  exigirExportacaoHomologada,
  exportacaoQuestorHomologada,
  registrarArquivoQuestor,
  registrarBloqueioQuestor,
  sha256Texto,
  type ArquivoExportadoQuestor
} from "./questor-exportacao.service.js";
import {
  exportacaoOficialDosLancamentosRepository,
  lancamentosJaExportadosRepository,
  obterQuestorExportacaoRepository,
  sequenciasUsadasRepository,
  travarExportacaoEventosRepository
} from "./questor-exportacoes.repository.js";
import { lerArquivoExportacaoQuestor } from "./questor-arquivos.js";
import {
  atualizarEventoVariavelRepository,
  buscarLancamentosVariaveisRepository,
  cancelarLancamentoVariavelRepository,
  lancamentosAtivosRepository,
  catalogoPorCodigosRepository,
  inserirEventoVariavelRepository,
  inserirEventosCatalogoRepository,
  inserirLancamentoVariavelRepository,
  lancamentosComArquivoRepository,
  lerParametrosEventosRepository,
  listarEventosVariaveisRepository,
  listarLancamentosVariaveisRepository,
  removerLancamentoVariavelRepository,
  type LancamentoVariavelCompleto
} from "./questor-eventos.repository.js";

/**
 * Eventos variáveis do Questor no layout OFICIAL da Conplus (`EventoVariavel.nli`, 22/10/2026): um evento
 * por linha, para um contrato num período de cálculo. Nenhum código é fixo: empresa, período, contrato e
 * evento vêm da configuração, do catálogo e dos vínculos cadastrados pelo DP a partir do Questor.
 */

// --- Catálogo ----------------------------------------------------------------------------------------

export function listarEventosVariaveis(perfil?: PerfilUsuario) {
  return comMigrationQuestor(() => listarEventosVariaveisRepository(empresaDoAtor(perfil)));
}

export async function criarEventoVariavel(body: DadosExternos, perfil?: PerfilUsuario) {
  const dados = questorEventosVariaveisCatalogoSchema.parse(body);
  const criado = await comMigrationQuestor(() =>
    inserirEventoVariavelRepository(empresaDoAtor(perfil), { ...dados, criadoPor: atorDoPerfil(perfil) })
  );
  if (criado.length === 0) throw conflito("O evento já existe no catálogo desta empresa", "QUESTOR_EVENTO_DUPLICADO");
  return criado[0];
}

export async function atualizarEventoVariavel(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const dados = questorEventoVariavelAtualizacaoSchema.parse(body);
  const atualizado = await comMigrationQuestor(() =>
    atualizarEventoVariavelRepository(empresaDoAtor(perfil), id, {
      ...(dados.descricao !== undefined ? { descricao: dados.descricao } : {}),
      ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {})
    })
  );
  if (!atualizado) throw naoEncontrado("Evento não encontrado no catálogo da empresa");
  return atualizado;
}

/**
 * Importa o catálogo consolidado da Conplus (`eventos_variaveis_por_empresa.csv`) para a empresa da
 * sessão. Sem `empresaConplus`, só lista as empresas do arquivo; sem `confirmar`, só compara. Grava
 * apenas eventos NOVOS: código que já existe com outra descrição/letra é apontado como divergente e
 * nunca sobrescrito (lançamentos e exportações podem depender dele).
 */
export async function importarCatalogoEventos(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<QuestorCatalogoImportacaoDto> {
  const dados = questorCatalogoImportacaoSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  const lido = lerCatalogoEventosConplus(dados.conteudo);
  const empresas = [...new Set(lido.eventos.map((evento) => evento.empresa))].sort();
  // Identidade confiável: a razão social que o DP configurou para a empresa da sessão. O arquivo não traz
  // CNPJ nem código — sem a configuração, a importação não adivinha qual empresa é qual.
  const { razaoSocialQuestor: empresaConfigurada } = await comMigrationQuestor(() =>
    lerParametrosEventosRepository(empresaId)
  );
  if (!dados.empresaConplus) return { empresas, empresaConfigurada, erros: lido.erros, itens: [], gravados: 0 };
  if (!empresaConfigurada) {
    throw naoProcessavel(
      "Informe a razão social da empresa no Questor (Configuração Questor) antes de importar o catálogo",
      ERROS_EXPORTACAO_QUESTOR.catalogoSemIdentidade
    );
  }
  if (normalizarRazaoSocialQuestor(dados.empresaConplus) !== normalizarRazaoSocialQuestor(empresaConfigurada)) {
    await comMigrationQuestor(() =>
      registrarAuditoriaQuestorRepository({
        empresaId,
        usuarioId: atorDoPerfil(perfil),
        acao: "recusa_catalogo",
        detalhes: { empresaArquivo: dados.empresaConplus ?? null, empresaConfigurada }
      })
    );
    throw naoProcessavel(
      `O catálogo escolhido é de "${dados.empresaConplus}", mas esta empresa está configurada como "${empresaConfigurada}" no Questor`,
      ERROS_EXPORTACAO_QUESTOR.catalogoOutraEmpresa
    );
  }
  if (dados.confirmar && lido.erros.length) {
    // Gravar só parte de um catálogo oficial deixaria eventos faltando sem ninguém perceber.
    throw naoProcessavel(
      "O arquivo do catálogo tem linhas inválidas; corrija antes de gravar",
      "QUESTOR_CATALOGO_INVALIDO",
      lido.erros
    );
  }
  const alvo = normalizarRazaoSocialQuestor(empresaConfigurada);
  if (!empresas.some((empresa) => normalizarRazaoSocialQuestor(empresa) === alvo)) {
    throw naoProcessavel("Empresa não encontrada no arquivo do catálogo", "QUESTOR_CATALOGO_EMPRESA_AUSENTE", empresas);
  }
  const daEmpresa = lido.eventos.filter((evento) => normalizarRazaoSocialQuestor(evento.empresa) === alvo);
  const repetidos = daEmpresa.filter(
    (evento, indice) => daEmpresa.findIndex((outro) => outro.codigo === evento.codigo) !== indice
  );
  if (repetidos.length) {
    throw naoProcessavel(
      "O arquivo repete código de evento para a mesma empresa",
      "QUESTOR_CATALOGO_REPETIDO",
      repetidos.map((evento) => evento.codigo)
    );
  }
  return comMigrationQuestor(async () => {
    const existentes = new Map(
      (
        await catalogoPorCodigosRepository(
          empresaId,
          daEmpresa.map((evento) => evento.codigo)
        )
      ).map((evento) => [evento.codigo, evento])
    );
    const itens = daEmpresa.map((evento) => {
      const atual = existentes.get(evento.codigo);
      const base = {
        codigo: evento.codigo,
        descricao: evento.descricao,
        unidade: evento.unidade,
        natureza: evento.natureza,
        sequencia: evento.sequencia
      };
      if (!atual) return { ...base, situacao: "novo" as const, detalhe: null };
      const diferencas = [
        atual.descricao !== evento.descricao ? `descrição no Pralís: "${atual.descricao}"` : null,
        atual.unidades.length !== 1 || atual.unidades[0] !== evento.unidade
          ? `letras no Pralís: ${atual.unidades.join(", ")}`
          : null,
        atual.natureza && atual.natureza !== evento.natureza ? `natureza no Pralís: ${atual.natureza}` : null
      ].filter((item): item is string => item !== null);
      return diferencas.length
        ? { ...base, situacao: "divergente" as const, detalhe: diferencas.join("; ") }
        : { ...base, situacao: "igual" as const, detalhe: null };
    });
    let gravados = 0;
    if (dados.confirmar) {
      const novos = daEmpresa.filter((evento) => !existentes.has(evento.codigo));
      gravados = (await inserirEventosCatalogoRepository(empresaId, atorDoPerfil(perfil), novos)).length;
    }
    return { empresas, empresaConfigurada, erros: lido.erros, itens, gravados };
  });
}

// --- Lançamentos -------------------------------------------------------------------------------------

async function paraDto(
  empresaId: string,
  linhas: LancamentoVariavelCompleto[]
): Promise<QuestorLancamentoVariavelDto[]> {
  const ids = linhas.map((linha) => linha.id);
  const [oficiais, comArquivo] = linhas.length
    ? await Promise.all([
        lancamentosJaExportadosRepository(empresaId, ids),
        lancamentosComArquivoRepository(empresaId, ids)
      ])
    : [[], []];
  const exportados = new Set(oficiais);
  const emArquivo = new Set(comArquivo);
  return linhas.map((linha) => ({
    id: linha.id,
    competencia: linha.competencia,
    vinculoId: linha.vinculoId,
    colaboradorNome: linha.colaboradorNome,
    matricula: linha.matricula,
    questorCodigoContrato: linha.questorCodigoContrato,
    eventoId: linha.eventoId,
    eventoCodigo: linha.eventoCodigo,
    eventoDescricao: linha.eventoDescricao,
    unidade: linha.unidade,
    valor: linha.valor,
    exportado: exportados.has(linha.id),
    emArquivoTecnico: emArquivo.has(linha.id) && !exportados.has(linha.id)
  }));
}

export async function listarLancamentosVariaveis(query: DadosExternos, perfil?: PerfilUsuario) {
  const filtro = questorEventosVariaveisQuerySchema.parse(query ?? {});
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () =>
    paraDto(empresaId, await listarLancamentosVariaveisRepository(empresaId, filtro.competencia))
  );
}

export async function criarLancamentoVariavel(body: DadosExternos, perfil?: PerfilUsuario) {
  const dados = questorEventosVariaveisLancamentoSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  return comMigrationQuestor(async () => {
    const resultado = await inserirLancamentoVariavelRepository(empresaId, {
      ...dados,
      criadoPor: atorDoPerfil(perfil)
    });
    if (resultado.kind === "vinculo_inexistente") throw naoEncontrado("Vínculo do colaborador não encontrado");
    if (resultado.kind === "evento_inexistente") throw naoEncontrado("Evento não encontrado no catálogo da empresa");
    if (resultado.kind === "evento_inativo")
      throw naoProcessavel("O evento está desativado no catálogo da empresa", "QUESTOR_EVENTO_INATIVO");
    if (resultado.kind === "unidade_nao_catalogada")
      throw naoProcessavel("A unidade não está autorizada no catálogo do evento", "QUESTOR_UNIDADE_NAO_CATALOGADA");
    if (resultado.kind === "duplicado")
      throw conflito(
        "Já existe lançamento para este colaborador, competência e evento",
        "QUESTOR_LANCAMENTO_DUPLICADO"
      );
    const [criado] = await paraDto(empresaId, await buscarLancamentosVariaveisRepository(empresaId, [resultado.id]));
    return criado;
  });
}

export async function removerLancamentoVariavel(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  // Mesma fila da geração oficial: sem ela, um arquivo em gravação e esta exclusão se cruzam (FK → 500).
  await comMigrationQuestor(() =>
    executarEmTransacao(async (tx) => {
      await travarExportacaoEventosRepository(tx, empresaId);
      if ((await lancamentosJaExportadosRepository(empresaId, [id], tx)).length) {
        throw conflito(
          "Este lançamento saiu em arquivo oficial e fica no histórico; lance o ajuste na competência seguinte",
          ERROS_EXPORTACAO_QUESTOR.lancamentoExportado
        );
      }
      if ((await lancamentosComArquivoRepository(empresaId, [id], tx)).length) {
        throw conflito(
          "Este lançamento já saiu em arquivo técnico: cancele-o informando o motivo (o histórico continua apontando para ele)",
          ERROS_EXPORTACAO_QUESTOR.lancamentoEmArquivoTecnico
        );
      }
      if (!(await removerLancamentoVariavelRepository(empresaId, id, tx))) {
        throw naoEncontrado("Lançamento não encontrado");
      }
    })
  );
}

/**
 * Cancelamento lógico: para lançamento que saiu em arquivo técnico (ou que se quer anular com registro).
 * Lançamento de arquivo OFICIAL nunca é cancelado: o Questor já pode ter importado. Depois de cancelado, o
 * mesmo evento pode ser lançado de novo para o colaborador na competência (correção).
 */
export async function cancelarLancamentoVariavel(id: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const { motivo } = questorLancamentoCancelamentoSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  await comMigrationQuestor(() =>
    executarEmTransacao(async (tx) => {
      // Mesma fila da geração oficial: ou o arquivo grava antes (e aqui vira 409), ou o cancelamento
      // grava antes (e a geração recusa ao reconferir). Nunca os dois.
      await travarExportacaoEventosRepository(tx, empresaId);
      if ((await lancamentosJaExportadosRepository(empresaId, [id], tx)).length) {
        throw conflito(
          "Este lançamento saiu em arquivo oficial e não pode ser cancelado; lance o ajuste na competência seguinte",
          ERROS_EXPORTACAO_QUESTOR.lancamentoExportado
        );
      }
      const cancelado = await cancelarLancamentoVariavelRepository(tx, empresaId, id, {
        canceladoPor: usuarioId,
        motivo
      });
      if (!cancelado) throw naoEncontrado("Lançamento não encontrado ou já cancelado");
      await registrarAuditoriaQuestorRepository(
        { empresaId, usuarioId, acao: "cancelamento_lancamento", detalhes: { lancamentoId: id, motivo } },
        tx
      );
    })
  );
}

// --- Arquivo -----------------------------------------------------------------------------------------

type ParametrosPedido = {
  competencia: string;
  codigoPeriodoCalculo: string;
  sequenciaInicial: number;
  lancamentoIds: readonly string[];
};

/**
 * Monta o arquivo exatamente como seria gravado. `oficial` decide de onde partem as sequências: o oficial
 * continua depois das já usadas em arquivos oficiais do período; o técnico também (para mostrar o que
 * sairia), mas não reserva nenhuma.
 */
async function montarArquivo(empresaId: string, pedido: ParametrosPedido) {
  const [lancamentos, parametros, sequenciasUsadas] = await Promise.all([
    buscarLancamentosVariaveisRepository(empresaId, pedido.lancamentoIds),
    lerParametrosEventosRepository(empresaId),
    sequenciasUsadasRepository(empresaId, pedido.codigoPeriodoCalculo)
  ]);
  // Lançamento de outra empresa (ou inexistente) some na consulta: a resposta é a mesma para os dois.
  if (lancamentos.length !== pedido.lancamentoIds.length) {
    throw naoEncontrado("Um ou mais lançamentos não pertencem à empresa do usuário");
  }
  return prepararArquivoEventosVariaveis(pedido.competencia, lancamentos, {
    codigoEmpresa: parametros.codigoEmpresaQuestor === null ? null : String(parametros.codigoEmpresaQuestor),
    codigoPeriodoCalculo: pedido.codigoPeriodoCalculo,
    sequenciaInicial: pedido.sequenciaInicial,
    sequenciasUsadas,
    utilizaHoraCentesimal: parametros.utilizaHoraCentesimal
  });
}

const descrever = (arquivo: ReturnType<typeof prepararArquivoEventosVariaveis>) =>
  arquivo.diagnosticos.map(
    (item) => `Linha ${item.linha}${item.coluna ? `, coluna ${item.coluna}` : ""}: ${item.mensagem}`
  );

/** "Eventos <empresa> - <MMAAAA>" — o padrão de nome do manual da Conplus. */
/** "Eventos <empresa> - <MM-AAAA>.csv": o padrão de nome do manual da Conplus (o técnico ganha prefixo). */
const nomeArquivo = (prefixo: string, codigoEmpresa: string, competencia: string) => () =>
  `${prefixo}Eventos ${codigoEmpresa} - ${competencia.slice(5, 7)}-${competencia.slice(0, 4)}.csv`;

export async function validarPreviaEventosVariaveis(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<QuestorEventosVariaveisPreviaDto> {
  const dados = questorEventosVariaveisPreviaSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  const homologada = exportacaoQuestorHomologada();
  return comMigrationQuestor(async () => {
    const arquivo = await montarArquivo(empresaId, dados);
    const jaExportados = await lancamentosJaExportadosRepository(empresaId, dados.lancamentoIds);
    return {
      tipo: "eventos_variaveis",
      competencia: dados.competencia,
      codigoPeriodoCalculo: dados.codigoPeriodoCalculo,
      exportacaoDisponivel: homologada,
      homologacaoConplusConfirmada: homologada,
      bloqueio: homologada ? null : ERROS_EXPORTACAO_QUESTOR.naoHomologada,
      quantidadeRegistros: dados.lancamentoIds.length,
      quantidadeContratos: arquivo.quantidadeContratos,
      valido: arquivo.valido,
      pendencias: arquivo.pendencias,
      diagnosticos: descrever(arquivo),
      jaExportados: jaExportados.length,
      conteudo: arquivo.conteudo,
      linhas: arquivo.linhas
    };
  });
}

/**
 * Arquivo TÉCNICO: o mesmo conteúdo da prévia, nome `TECNICO-NAO-IMPORTAR-…`, auditoria `previa` e
 * nenhuma sequência reservada. Serve para conferir com a Conplus antes da homologação — não para importar.
 */
export async function gerarArquivoTecnicoEventosVariaveis(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ArquivoExportadoQuestor> {
  exigirArquivoTecnicoDisponivel();
  const dados = questorEventosVariaveisTecnicoSchema.parse(body);
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  return comMigrationQuestor(async () => {
    const arquivo = await montarArquivo(empresaId, dados);
    if (!arquivo.valido) {
      throw naoProcessavel("O arquivo de eventos tem pendências", ERROS_EXPORTACAO_QUESTOR.invalida, [
        ...arquivo.pendencias,
        ...descrever(arquivo)
      ]);
    }
    const parametros = await lerParametrosEventosRepository(empresaId);
    return registrarArquivoQuestor({
      empresaId,
      usuarioId,
      tipo: "eventos_variaveis",
      resultado: "previa",
      competencia: dados.competencia,
      layoutVersao: VERSAO_LAYOUT_EVENTOS_QUESTOR,
      conteudo: arquivo.conteudo,
      extensao: "csv",
      nomeArquivo: nomeArquivo("TECNICO-NAO-IMPORTAR-", String(parametros.codigoEmpresaQuestor), dados.competencia),
      mimeType: "text/csv; charset=utf-8",
      motivoRegeracao: null,
      codigoPeriodoCalculo: dados.codigoPeriodoCalculo,
      lancamentos: dados.lancamentoIds.map((lancamentoId) => ({ lancamentoId }))
    });
  });
}

/**
 * Arquivo OFICIAL: gates de homologação + arquivo sem pendência. Repetir exatamente o mesmo pedido devolve
 * o arquivo já gerado; lançamento já exportado em outro arquivo só sai de novo com motivo, e com
 * sequências novas — a mesma chave do Questor nunca aparece em dois arquivos oficiais.
 */
export async function gerarCsvEventosVariaveis(
  body: DadosExternos,
  perfil?: PerfilUsuario
): Promise<ArquivoExportadoQuestor> {
  const dados = questorEventosVariaveisGeracaoSchema.parse(body);
  await exigirExportacaoHomologada(perfil, "eventos_variaveis");
  const empresaId = empresaDoAtor(perfil);
  const usuarioId = atorDoPerfil(perfil);
  return comMigrationQuestor(async () => {
    const anterior = await exportacaoOficialDosLancamentosRepository(
      empresaId,
      dados.codigoPeriodoCalculo,
      dados.lancamentoIds
    );
    if (anterior && !dados.motivoRegeracao) {
      // Mesmo pedido de novo: devolve o arquivo já gerado, conferido contra a auditoria. Se ele sumiu ou
      // não confere, NÃO gera outro (sequências novas importariam os lançamentos em dobro no Questor).
      const exportacao = await obterQuestorExportacaoRepository(empresaId, anterior);
      const conteudo = exportacao?.caminhoArquivo ? await lerArquivoExportacaoQuestor(exportacao.caminhoArquivo) : null;
      if (!exportacao?.nomeArquivo || !conteudo) {
        throw naoEncontrado(
          "O arquivo oficial destes lançamentos não está mais no armazenamento. Restaure-o ou informe o motivo para gerar de novo.",
          ERROS_EXPORTACAO_QUESTOR.arquivoAusente
        );
      }
      if (sha256Texto(conteudo.toString("utf8")) !== exportacao.sha256) {
        throw conflito("O arquivo armazenado não confere com a auditoria", "QUESTOR_EXPORTACAO_ARQUIVO_DIVERGENTE");
      }
      return {
        exportacaoId: exportacao.id,
        conteudo: conteudo.toString("utf8"),
        nomeArquivo: exportacao.nomeArquivo,
        mimeType: "text/csv; charset=utf-8",
        sha256: exportacao.sha256,
        reutilizado: true
      };
    }
    const arquivo = await montarArquivo(empresaId, dados);
    if (!arquivo.valido) {
      const motivos = [...arquivo.pendencias, ...descrever(arquivo)];
      await registrarBloqueioQuestor({
        empresaId,
        usuarioId,
        tipo: "eventos_variaveis",
        competencia: dados.competencia,
        layoutVersao: VERSAO_LAYOUT_EVENTOS_QUESTOR,
        conteudo: motivos.join("\n"),
        diagnosticos: motivos
      });
      throw naoProcessavel("O arquivo de eventos tem pendências", ERROS_EXPORTACAO_QUESTOR.invalida, motivos);
    }
    const jaExportados = await lancamentosJaExportadosRepository(empresaId, dados.lancamentoIds);
    if (jaExportados.length && !dados.motivoRegeracao) {
      // O Questor lança de novo o que for importado de novo: reexportar exige decisão explícita.
      throw conflito(
        "Há lançamento nesta seleção que já saiu em arquivo oficial. Informe o motivo para gerar de novo.",
        ERROS_EXPORTACAO_QUESTOR.jaExportado,
        jaExportados
      );
    }
    const parametros = await lerParametrosEventosRepository(empresaId);
    return registrarArquivoQuestor({
      empresaId,
      usuarioId,
      tipo: "eventos_variaveis",
      resultado: "gerado",
      competencia: dados.competencia,
      layoutVersao: VERSAO_LAYOUT_EVENTOS_QUESTOR,
      conteudo: arquivo.conteudo,
      extensao: "csv",
      nomeArquivo: nomeArquivo("", String(parametros.codigoEmpresaQuestor), dados.competencia),
      mimeType: "text/csv; charset=utf-8",
      motivoRegeracao: dados.motivoRegeracao ?? null,
      codigoPeriodoCalculo: dados.codigoPeriodoCalculo,
      lancamentos: arquivo.linhas,
      antesDeGravar: async (tx) => {
        // Fila por empresa + reconferência: outra geração pode ter exportado estes lançamentos entre a
        // checagem acima e esta gravação.
        await travarExportacaoEventosRepository(tx, empresaId);
        const agora = await lancamentosJaExportadosRepository(empresaId, dados.lancamentoIds, tx);
        if (agora.length && !dados.motivoRegeracao) {
          throw conflito(
            "Outra geração acabou de exportar lançamentos desta seleção. Confira o histórico.",
            ERROS_EXPORTACAO_QUESTOR.jaExportado,
            agora
          );
        }
        // O arquivo foi montado fora desta transação: um lançamento cancelado nesse meio tempo não pode sair
        // no oficial (com o relançamento da correção, o Questor receberia o evento em dobro).
        const ativos = await lancamentosAtivosRepository(tx, empresaId, dados.lancamentoIds);
        if (ativos.length !== dados.lancamentoIds.length) {
          throw conflito(
            "Um lançamento desta seleção foi cancelado enquanto o arquivo era gerado. Atualize a lista e gere de novo.",
            ERROS_EXPORTACAO_QUESTOR.lancamentoCancelado,
            dados.lancamentoIds.filter((lancamentoId) => !ativos.includes(lancamentoId))
          );
        }
      }
    });
  });
}
