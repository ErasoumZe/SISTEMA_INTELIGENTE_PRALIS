import type { PerfilUsuario } from "@padaria/shared";
import {
  aceiteDeAvisoPermitido,
  avisoPorVersao,
  avisoVigenteDoAmbiente,
  devolverFichaPayloadSchema,
  fichaEnviarPayloadSchema,
  fichaRascunhoPayloadSchema,
  aprovarFichaPayloadSchema,
  type DadosExternos,
  type FichaPublicaDto,
  type FichaRascunhoPayload,
  type FichaRevisaoDto
} from "@padaria/shared";
import { executarEmTransacao, type TransacaoBanco } from "../banco/conexao.js";
import { conflito, erroValidacao, foiEmbora, naoAutorizado, naoEncontrado } from "../erros.js";
import { env } from "../env.js";
import { atorDoPerfil, empresaDoAtor } from "./ator.js";
import { hashTokenConvite } from "./convites.service.js";
import { contarDependentesRepository } from "./dependentes.repository.js";
import {
  atualizarFichaRepository,
  bloquearFichaRepository,
  buscarConvitePorTokenHashRepository,
  garantirFichaRepository,
  obterFichaRepository,
  obterNomeDaEmpresaRepository,
  registrarAcessoConviteRepository,
  registrarEventoExternoRepository
} from "./ficha.repository.js";
import {
  bloquearProcessoRepository,
  obterProcessoRepository,
  registrarEventoProcessoRepository
} from "./processos.repository.js";

/**
 * ADM-003 V3 — a ficha do candidato.
 *
 * Duas portas para a mesma linha: o CANDIDATO entra pelo token e so mexe na propria ficha; o DP
 * entra pela sessao e so revisa. Nenhuma das duas confia no chamador para dizer de que empresa se
 * trata — a do candidato deriva do convite, a do DP deriva do perfil.
 */

/**
 * Os campos de TEXTO que o candidato preenche. Fora ficam `versao`, que e controle, e
 * `semDependentes`, que e booleano e tem regra propria — se entrasse aqui, `camposDoPayload`
 * transformaria `false` em `null` e a declaracao viraria "nao respondeu" a cada rascunho salvo.
 */
type CamposDaFicha = Omit<FichaRascunhoPayload, "versao" | "semDependentes">;

const CAMPOS_DA_FICHA: readonly (keyof CamposDaFicha)[] = [
  "nomeSocial", "nascimento", "sexo", "estadoCivil", "racaCor", "grauInstrucao", "nacionalidade",
  "naturalidade", "nomeMae", "nomePai", "cep", "logradouro", "numero", "complemento", "bairro",
  "municipio", "uf", "telefone", "email", "rgNumero", "rgOrgao", "rgUf", "rgEmissao",
  "tituloEleitor", "tituloZona", "tituloSecao", "banco", "agencia", "conta", "contaDigito",
  "contaTipo"
];

/** A linha da ficha, como o repositorio a devolve. */
type LinhaDaFicha = NonNullable<Awaited<ReturnType<typeof obterFichaRepository>>>;

/** Copia os campos da linha para o formato do contrato. Explicito de proposito: sem cast, o
 * compilador acusa campo novo que alguem esquecer de trazer. */
function camposDaLinha(ficha: LinhaDaFicha): CamposDaFicha {
  return {
    nomeSocial: ficha.nomeSocial,
    nascimento: ficha.nascimento,
    sexo: ficha.sexo,
    estadoCivil: ficha.estadoCivil,
    racaCor: ficha.racaCor,
    grauInstrucao: ficha.grauInstrucao,
    nacionalidade: ficha.nacionalidade,
    naturalidade: ficha.naturalidade,
    nomeMae: ficha.nomeMae,
    nomePai: ficha.nomePai,
    cep: ficha.cep,
    logradouro: ficha.logradouro,
    numero: ficha.numero,
    complemento: ficha.complemento,
    bairro: ficha.bairro,
    municipio: ficha.municipio,
    uf: ficha.uf,
    telefone: ficha.telefone,
    email: ficha.email,
    rgNumero: ficha.rgNumero,
    rgOrgao: ficha.rgOrgao,
    rgUf: ficha.rgUf,
    rgEmissao: ficha.rgEmissao,
    tituloEleitor: ficha.tituloEleitor,
    tituloZona: ficha.tituloZona,
    tituloSecao: ficha.tituloSecao,
    banco: ficha.banco,
    agencia: ficha.agencia,
    conta: ficha.conta,
    contaDigito: ficha.contaDigito,
    contaTipo: ficha.contaTipo
  };
}

/** Uma frase so, usada no rascunho e no envio: o candidato precisa ler a mesma coisa nos dois. */
const INCOERENTE_DECLAROU_QUE_NAO_TEM =
  "Você marcou que não tem dependentes, mas há dependentes cadastrados.";

function ehProducao(): boolean {
  return env.NODE_ENV === "production";
}

export type Convite = NonNullable<Awaited<ReturnType<typeof buscarConvitePorTokenHashRepository>>>;

/**
 * A porta do candidato. Token invalido e 404 — nao confirma existencia a quem esta adivinhando.
 * Expirado ou revogado e 410: quem tem o link merece saber que ele acabou.
 *
 * **Esta e a UNICA fonte de empresa do caminho publico.** Ela sai da linha do convite, encontrada
 * pelo hash — nunca do corpo, da query ou do caminho, exatamente como `empresaDoAtor` faz para o
 * caminho interno.
 */
export async function conviteDoToken(token: string | undefined): Promise<Convite> {
  const limpo = token?.trim();
  if (!limpo) throw naoAutorizado("Link invalido", "CONVITE_AUSENTE");

  const convite = await buscarConvitePorTokenHashRepository(hashTokenConvite(limpo));
  if (!convite) throw naoEncontrado("Link invalido", "CONVITE_INVALIDO");
  if (convite.revogadoEm !== null) throw foiEmbora("Este link foi cancelado.", "CONVITE_REVOGADO");
  if (convite.expiraEm.getTime() <= Date.now()) {
    throw foiEmbora("Este link expirou. Peça um novo ao RH.", "CONVITE_EXPIRADO");
  }
  return convite;
}

/** Campo AUSENTE nao mexe no que esta gravado; vazio LIMPA. E a mesma regra do bloco interno. */
function camposDoPayload(dados: Partial<CamposDaFicha>) {
  const campos: Record<string, string | null> = {};
  for (const campo of CAMPOS_DA_FICHA) {
    if (campo in dados) {
      const valor = dados[campo];
      campos[campo] = valor === undefined || valor === null || valor === "" ? null : valor;
    }
  }
  return campos;
}

function paraDtoPublico(
  ficha: LinhaDaFicha,
  cabecalho: FichaPublicaDto["cabecalho"],
  versaoVigente: string
): FichaPublicaDto {
  const aviso = avisoPorVersao(versaoVigente);
  return {
    situacao: ficha.situacao as FichaPublicaDto["situacao"],
    versao: ficha.versao,
    semDependentes: ficha.semDependentes,
    revisaoPendencias: ficha.revisaoPendencias,
    avisoPrivacidadeVersao: ficha.avisoPrivacidadeVersao,
    avisoAceitoEm: ficha.avisoAceitoEm?.toISOString() ?? null,
    avisoTexto: aviso?.texto ?? "",
    avisoVersaoVigente: versaoVigente,
    cabecalho,
    campos: camposDaLinha(ficha)
  };
}

/** O que o candidato ve ao abrir o link. Cria a ficha vazia se for o primeiro acesso. */
export async function obterFichaPublica(token: string | undefined): Promise<FichaPublicaDto> {
  const convite = await conviteDoToken(token);
  const versaoVigente = avisoVigenteDoAmbiente(ehProducao());
  if (versaoVigente === null) {
    throw conflito("O formulario esta indisponivel neste ambiente.", "AVISO_INDISPONIVEL");
  }

  return executarEmTransacao(async (tx) => {
    await garantirFichaRepository({ processoId: convite.processoId, empresaId: convite.empresaId }, tx);
    await registrarAcessoConviteRepository(
      { conviteId: convite.id, jaAcessou: convite.primeiroAcessoEm !== null },
      tx
    );

    const ficha = await obterFichaRepository(convite.processoId, convite.empresaId, tx);
    if (!ficha) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");

    const processo = await obterProcessoRepository(convite.processoId, convite.empresaId);
    const empresaNome = await obterNomeDaEmpresaRepository(convite.empresaId, tx);
    return paraDtoPublico(
      ficha,
      {
        empresaNome: empresaNome ?? "",
        nomeCompleto: processo?.nomeCompleto ?? null,
        funcaoNome: processo?.funcaoNome ?? null,
        turnoRotulo: processo?.turnoRotulo ?? null,
        dataAdmissao: processo?.internosDataAdmissao ?? null
      },
      versaoVigente
    );
  });
}

/** Salvar rascunho. Nao muda situacao, nao grava trilha: rascunho e trabalho em curso, nao ato. */
export async function salvarRascunhoFicha(token: string | undefined, body: DadosExternos) {
  const convite = await conviteDoToken(token);
  const dados = fichaRascunhoPayloadSchema.parse(body);

  return executarEmTransacao(async (tx) => {
    const ficha = await exigirFichaEditavel(convite, dados.versao, tx);

    // Declarar que NAO tem, tendo, e a unica incoerencia que ja da para recusar no rascunho. O
    // contrario (marcar que tem, com a lista ainda vazia) e o estado normal de quem acabou de
    // responder e ainda vai cadastrar — recusar aqui deixaria o candidato sem como comecar.
    if (dados.semDependentes === true) {
      const quantos = await contarDependentesRepository(convite.processoId, convite.empresaId, tx);
      if (quantos > 0) throw conflito(INCOERENTE_DECLAROU_QUE_NAO_TEM, "DEPENDENTES_INCOERENTES");
    }

    const versao = await atualizarFichaRepository(
      {
        processoId: convite.processoId,
        empresaId: convite.empresaId,
        versaoAtual: ficha.versao,
        campos: camposDoPayload(dados),
        // Ausente nao mexe no que esta gravado; `null` explicito devolve a ficha para "nao
        // respondeu", que e como o candidato desfaz uma resposta dada por engano.
        ...(dados.semDependentes === undefined ? {} : { semDependentes: dados.semDependentes })
      },
      tx
    );
    if (versao === null) throw conflito("Alguem gravou esta ficha enquanto voce editava", "VERSAO_CONFLITANTE");
  });
}

/**
 * Enviar. Aqui o aceite do aviso e gravado com VERSAO e DATA, e a trilha registra o ato com ator
 * externo — `convite_id` preenchido, `ator_usuario_id` nulo, como o CHECK XOR exige.
 *
 * **G-3**: em producao, aceite de aviso de teste e recusado. A guarda vive aqui, e nao so na
 * emissao, porque um convite emitido antes de uma promocao de ambiente continuaria coletando.
 */
export async function enviarFicha(token: string | undefined, body: DadosExternos) {
  const convite = await conviteDoToken(token);
  const dados = fichaEnviarPayloadSchema.parse(body);

  if (!aceiteDeAvisoPermitido(dados.avisoPrivacidadeVersao, ehProducao())) {
    throw conflito("Este aviso de privacidade nao vale neste ambiente.", "AVISO_INDISPONIVEL");
  }
  if (dados.avisoPrivacidadeVersao !== convite.avisoPrivacidadeVersao) {
    throw conflito("O aviso mudou desde que o link foi gerado. Recarregue a pagina.", "AVISO_DESATUALIZADO");
  }

  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearProcessoRepository(convite.processoId, convite.empresaId, tx);
    if (!alvo) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");

    const ficha = await exigirFichaEditavel(convite, dados.versao, tx);

    // O CHECK do banco cobra que a declaracao EXISTA no envio; ele nao consegue cobrar que ela
    // seja VERDADE, porque CHECK nao enxerga outra tabela. A conferencia e aqui, depois do lock
    // da ficha — o mesmo lock que as rotas de dependente tomam, entao ninguem cadastra alguem
    // entre a contagem e a gravacao.
    const quantos = await contarDependentesRepository(convite.processoId, convite.empresaId, tx);
    if (dados.semDependentes && quantos > 0) {
      throw conflito(INCOERENTE_DECLAROU_QUE_NAO_TEM, "DEPENDENTES_INCOERENTES");
    }
    if (!dados.semDependentes && quantos === 0) {
      throw conflito(
        "Você marcou que tem dependentes, mas não cadastrou nenhum.",
        "DEPENDENTES_INCOERENTES"
      );
    }

    const versao = await atualizarFichaRepository(
      {
        processoId: convite.processoId,
        empresaId: convite.empresaId,
        versaoAtual: ficha.versao,
        campos: camposDoPayload(dados),
        situacao: "enviada",
        enviadoEm: new Date(),
        // Reenvio depois de devolucao: o CHECK do ramo `enviada` exige revisao ZERADA, senao a ficha
        // ficaria "enviada" carregando o carimbo de quem a devolveu.
        revisadoEm: null,
        revisadoPor: null,
        semDependentes: dados.semDependentes,
        avisoPrivacidadeVersao: dados.avisoPrivacidadeVersao,
        avisoAceitoEm: new Date()
      },
      tx
    );
    if (versao === null) throw conflito("Alguem gravou esta ficha enquanto voce editava", "VERSAO_CONFLITANTE");

    // A versao do PROCESSO, lida no lock: a ficha nao consome versao dele, e por isso `ficha_enviada`
    // esta fora do indice parcial de unicidade da trilha.
    await registrarEventoExternoRepository(
      {
        processoId: convite.processoId,
        empresaId: convite.empresaId,
        versao: alvo.versao,
        acao: "ficha_enviada",
        conviteId: convite.id
      },
      tx
    );
  });
}

/**
 * Trava a ficha e garante que ela ainda esta nas maos do candidato. Exportada porque as rotas de
 * dependente precisam do MESMO lock: a ficha e o ponto unico de contencao do processo, e usar
 * outro — ou nenhum — deixaria duas abas cadastrarem o mesmo dependente sem CPF em paralelo,
 * onde o indice unico parcial nao alcanca.
 *
 * Nao cobra versao. Quem manda `versao` no corpo (rascunho e envio) cobra por cima, com
 * `exigirFichaEditavel`. Dependente nao tem versao propria e nao usa a da ficha: exigi-la faria
 * cada dependente cadastrado invalidar o formulario aberto do proprio candidato.
 */
export async function travarFichaEditavel(convite: Convite, tx: TransacaoBanco) {
  const ficha = await bloquearFichaRepository(convite.processoId, convite.empresaId, tx);
  if (!ficha) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");
  // Enviada e aprovada saem das maos do candidato. Devolvida volta — e esse e o ponto da devolucao.
  if (ficha.situacao === "enviada" || ficha.situacao === "aprovada") {
    throw conflito("Esta ficha ja foi enviada e esta em analise.", "FICHA_NAO_EDITAVEL");
  }
  return ficha;
}

async function exigirFichaEditavel(convite: Convite, versaoCliente: number, tx: TransacaoBanco) {
  const ficha = await travarFichaEditavel(convite, tx);
  if (ficha.versao !== versaoCliente) {
    throw conflito("Alguem gravou esta ficha enquanto voce editava", "VERSAO_CONFLITANTE");
  }
  return ficha;
}

// --- Lado do DP ----------------------------------------------------------------------------------

export async function obterFichaParaRevisao(
  processoId: string,
  perfil?: PerfilUsuario
): Promise<FichaRevisaoDto | null> {
  const empresaId = empresaDoAtor(perfil);
  const ficha = await obterFichaRepository(processoId, empresaId);
  if (!ficha) return null;
  return {
    situacao: ficha.situacao as FichaRevisaoDto["situacao"],
    versao: ficha.versao,
    semDependentes: ficha.semDependentes,
    enviadoEm: ficha.enviadoEm?.toISOString() ?? null,
    revisadoEm: ficha.revisadoEm?.toISOString() ?? null,
    revisadoPorNome: ficha.revisadoPorNome,
    revisaoPendencias: ficha.revisaoPendencias,
    avisoPrivacidadeVersao: ficha.avisoPrivacidadeVersao,
    avisoAceitoEm: ficha.avisoAceitoEm?.toISOString() ?? null,
    campos: camposDaLinha(ficha)
  };
}

export async function devolverFicha(processoId: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = devolverFichaPayloadSchema.parse(body);
  return revisar(processoId, empresaId, ator, dados.versao, "devolvida", dados.pendencias);
}

export async function aprovarFicha(processoId: string, body: DadosExternos, perfil?: PerfilUsuario) {
  const empresaId = empresaDoAtor(perfil);
  const ator = atorDoPerfil(perfil);
  const dados = aprovarFichaPayloadSchema.parse(body);
  return revisar(processoId, empresaId, ator, dados.versao, "aprovada", null);
}

async function revisar(
  processoId: string,
  empresaId: string,
  ator: string,
  versaoCliente: number,
  destino: "devolvida" | "aprovada",
  pendencias: string | null
) {
  return executarEmTransacao(async (tx) => {
    const alvo = await bloquearProcessoRepository(processoId, empresaId, tx);
    if (!alvo) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");

    const ficha = await bloquearFichaRepository(processoId, empresaId, tx);
    if (!ficha) throw naoEncontrado("Ficha nao encontrada", "FICHA_AUSENTE");
    // So se revisa o que foi enviado. Devolver rascunho seria devolver o que ninguem entregou.
    if (ficha.situacao !== "enviada") {
      throw conflito("Esta ficha nao esta aguardando revisao.", "FICHA_NAO_REVISAVEL");
    }
    if (ficha.versao !== versaoCliente) {
      throw conflito("Alguem alterou esta ficha enquanto voce revisava", "VERSAO_CONFLITANTE");
    }
    if (destino === "devolvida" && !pendencias) {
      throw erroValidacao("Escreva o que precisa ser corrigido", "PENDENCIA_OBRIGATORIA");
    }

    const versao = await atualizarFichaRepository(
      {
        processoId,
        empresaId,
        versaoAtual: ficha.versao,
        campos: {},
        situacao: destino,
        revisadoEm: new Date(),
        revisadoPor: ator,
        revisaoPendencias: pendencias
      },
      tx
    );
    if (versao === null) throw conflito("Alguem alterou esta ficha enquanto voce revisava", "VERSAO_CONFLITANTE");

    // Ato INTERNO: tem ator humano, e por isso usa o registrador do processo. Nao consome versao
    // do processo — a ficha tem a dela, e revisar nao muda o andamento da admissao.
    await registrarEventoProcessoRepository(
      {
        processoId,
        empresaId,
        versao: alvo.versao,
        acao: destino === "devolvida" ? "ficha_devolvida" : "ficha_aprovada",
        atorUsuarioId: ator,
        camposAlterados: []
      },
      tx
    );
  });
}
