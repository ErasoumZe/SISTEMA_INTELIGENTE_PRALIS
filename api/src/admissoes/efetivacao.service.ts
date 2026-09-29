import type { PerfilUsuario } from "@padaria/shared";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, naoEncontrado } from "../erros.js";
import { sqlTravarAdmissaoDaPessoa, sqlTravarMatriculaDaEmpresa } from "@padaria/db/sessao";
import {
  avancarVersaoProcessoRepository,
  bloquearProcessoRepository,
  registrarEventoProcessoRepository
} from "./processos.repository.js";
import { atorDoPerfil, empresaDoAtor } from "./ator.js";
import { criarOnboardingDoVinculoRepository } from "../colaboradores/perfil.repository.js";
import {
  bloquearVinculoAtivoRepository,
  bloquearVinculoMaisRecenteRepository,
  bloquearVinculoDoProcessoRepository,
  criarColaboradorPorEfetivacaoRepository,
  criarVinculoRepository,
  localizarColaboradoresPorCpfRepository,
  obterDadosEfetivacaoRepository,
  obterPrefixoEMaiorMatriculaRepository,
  registrarEventoColaboradorRepository
} from "./efetivacao.repository.js";

function processoNaoEncontrado(): never {
  throw naoEncontrado("Processo de admissao nao encontrado", "PROCESSO_NAO_ENCONTRADO");
}

function matricula(prefixo: string, numero: number) {
  return `${prefixo}-${String(numero).padStart(6, "0")}`;
}

/**
 * Efetiva uma admissao em uma unica transacao.
 *
 * O endpoint nao recebe CPF, nome, funcao, data ou status do navegador: todos os fatos sao lidos
 * das etapas ja aprovadas. Assim a confirmacao nao vira uma segunda ficha de admissao nem pode
 * sobrescrever o cadastro de uma recontratacao por acidente.
 */
export async function efetivarProcesso(id: string, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);

  return executarEmTransacao(async (tx) => {
    // O lock do processo vem primeiro para que outra empresa/um id inexistente responda 404 antes
    // de tocar em CPF ou em qualquer cadastro de pessoa.
    const processo = await bloquearProcessoRepository(id, empresaId, tx);
    if (!processo) processoNaoEncontrado();

    // Repetir a mesma requisicao (duplo clique, timeout/retry) nao cria segundo vinculo nem evento.
    const existente = await bloquearVinculoDoProcessoRepository(id, empresaId, tx);
    if (existente) {
      return {
        colaboradorId: existente.colaboradorId,
        vinculoId: existente.id,
        matricula: existente.matricula,
        repetido: true
      };
    }

    const dados = await obterDadosEfetivacaoRepository(id, empresaId, tx);
    if (!dados) processoNaoEncontrado();
    if (dados.status !== "iniciado") {
      throw conflito("Este processo nao esta apto para efetivacao", "PROCESSO_NAO_EFETIVAVEL");
    }
    if (dados.exameSituacao !== "aso_apto") {
      throw conflito("Registre o ASO como apto antes de efetivar", "ASO_NAO_APTO_PARA_EFETIVACAO");
    }
    if (!dados.nomeCompleto || !dados.cpf || !dados.funcaoId || !dados.funcaoNome || !dados.dataAdmissao) {
      throw conflito("O processo esta sem os dados necessarios para efetivacao", "PROCESSO_INCOMPLETO");
    }
    if (dados.turnoId === null && !dados.jornadaHorario) {
      throw conflito("O processo esta sem jornada definida", "JORNADA_NAO_DEFINIDA");
    }

    // Mesmo CPF/empresa tem um unico caminho de decisao. Esta trava também cobre a corrida com
    // abertura de teste/admissao direta, que usa a mesma chave no banco.
    await tx.execute(sqlTravarAdmissaoDaPessoa(empresaId, dados.cpf));
    const iguais = await localizarColaboradoresPorCpfRepository(dados.cpf, empresaId, tx);
    if (iguais.length > 1) {
      throw conflito("Ha mais de um cadastro com este CPF; regularize antes de efetivar", "CPF_AMBIGUO");
    }

    const colaboradorExistente = iguais[0] ?? null;
    if (colaboradorExistente) {
      const vinculoMaisRecente = await bloquearVinculoMaisRecenteRepository(colaboradorExistente.id, empresaId, tx);
      if (!vinculoMaisRecente) {
        throw conflito(
          "Este cadastro é anterior ao controle de vínculos; concilie o histórico antes de registrar uma recontratação",
          "COLABORADOR_LEGADO_SEM_VINCULO"
        );
      }
      const vinculoAtivo = await bloquearVinculoAtivoRepository(colaboradorExistente.id, empresaId, tx);
      if (vinculoAtivo) {
        throw conflito("Esta pessoa ja possui um vinculo ativo nesta empresa", "COLABORADOR_COM_VINCULO_ATIVO");
      }
    }

    // A sequencia e exclusiva por empresa. O prefixo vem da configuracao da empresa, nunca de um
    // if no codigo: TNP e LISB sao dados de cada empresa, nao dois produtos diferentes.
    await tx.execute(sqlTravarMatriculaDaEmpresa(empresaId));
    const sequencia = await obterPrefixoEMaiorMatriculaRepository(empresaId, tx);
    if (!sequencia.prefixo) processoNaoEncontrado();
    const numeroSequencial = Number(sequencia.maiorNumero ?? 0) + 1;
    const colaborador =
      colaboradorExistente ??
      (await criarColaboradorPorEfetivacaoRepository({ empresaId, nome: dados.nomeCompleto, cpf: dados.cpf }, tx));
    const criado = await criarVinculoRepository(
      {
        empresaId,
        colaboradorId: colaborador.id,
        processoId: id,
        numeroSequencial,
        matricula: matricula(sequencia.prefixo, numeroSequencial),
        admitidoEm: dados.dataAdmissao,
        funcaoId: dados.funcaoId,
        funcaoNome: dados.funcaoNome,
        funcaoCbo: dados.funcaoCbo,
        turnoId: dados.turnoId,
        turnoRotulo: dados.turnoRotulo,
        turnoEtiqueta: dados.turnoEtiqueta,
        turnoHoraInicio: dados.turnoHoraInicio,
        turnoHoraFim: dados.turnoHoraFim,
        turnoDiasSemana: dados.turnoDiasSemana,
        jornadaHorario: dados.jornadaHorario,
        criadoPor: ator
      },
      tx
    );
    // O vinculo nasce ativo por regra trabalhista; o onboarding nasce em paralelo, em
    // `em_cadastro`, para o DP preencher e encaminhar a contabilidade sem confundir os dois
    // estados. Esta e a unica criacao automatica: nao ha segundo caminho no perfil.
    await criarOnboardingDoVinculoRepository({ empresaId, vinculoId: criado.id }, tx);

    // A trilha do colaborador e a do processo nascem no mesmo commit. Se uma falhar, nao existe
    // vinculo “sem historia” e tampouco processo dito efetivado sem cadastro real.
    await registrarEventoColaboradorRepository(
      {
        empresaId,
        colaboradorId: colaborador.id,
        vinculoId: criado.id,
        processoId: id,
        tipo: colaboradorExistente ? "recontratado" : "efetivado",
        atorUsuarioId: ator
      },
      tx
    );
    const processoAtualizado = await avancarVersaoProcessoRepository(
      { id, empresaId, versaoAtual: processo.versao, atorUsuarioId: ator },
      tx
    );
    if (!processoAtualizado) {
      throw conflito("Alguem alterou este processo enquanto voce efetivava", "VERSAO_CONFLITANTE");
    }
    await registrarEventoProcessoRepository(
      { processoId: id, empresaId, versao: processoAtualizado.versao, acao: "efetivado", atorUsuarioId: ator },
      tx
    );

    return {
      colaboradorId: colaborador.id,
      vinculoId: criado.id,
      matricula: matricula(sequencia.prefixo, numeroSequencial),
      repetido: false
    };
  });
}
