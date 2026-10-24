import {
  montarArquivoAdmissaoQuestor,
  type ContratoAdmissaoQuestor,
  type DiagnosticoQuestor
} from "./questor-admissao.js";
import type { TipoRegistroQuestor } from "./questor-admissao-layout.js";
import { aplicarParametrosQuestor, type ParametrosQuestorSnapshot } from "./questor-contrato-parametros.js";
import {
  aplicarCamposE5Questor,
  type DependenteE5Comuns,
  type DependenteE5Sensiveis,
  type FichaE5Comuns,
  type FichaE5Sensiveis
} from "./questor-candidato.js";
import {
  TABELAS_DE_PARA_QUESTOR,
  converterRotuloQuestor,
  cpfSemMascaraQuestor,
  formatarCepQuestor,
  formatarCnpjQuestor,
  formatarCpfQuestor,
  formatarDataQuestor,
  formatarPisQuestor
} from "./questor-de-para.js";

/**
 * E1 — dos dados que o Pralís JÁ guarda para os registros A/B/C/D do Questor.
 *
 * Só preenche campo com origem e conversão comprovadas. Código de município, contrato, cargo,
 * sindicato, estabelecimento e afins NÃO existem no Pralís e ficam vazios: o validador do layout
 * os aponta como OBRIGATORIO, e essa lista é o backlog das etapas E2 em diante.
 *
 * Os três campos ambíguos da auditoria (C.INDAPREND, C.ORGAOEMISSORRNE, D.ENTREGACERT) nunca são
 * preenchidos aqui — e o gerador recusaria se fossem.
 */

type Texto = string | null | undefined;

/** Recorte, em formato de banco, das colunas existentes. Datas como o Drizzle devolve: AAAA-MM-DD. */
export type SnapshotAdmissaoPralis = {
  empresa: { cnpj: Texto };
  processo: { nomeCompleto: Texto; cpf: Texto };
  internos: {
    dataAdmissao: Texto;
    ctpsNumero: Texto;
    ctpsSerie: Texto;
    ctpsUf: Texto;
    pisPasepNit: Texto;
  } | null;
  ficha: {
    nomeSocial: Texto;
    nascimento: Texto;
    sexo: Texto;
    estadoCivil: Texto;
    racaCor: Texto;
    grauInstrucao: Texto;
    nacionalidade: Texto;
    nomeMae: Texto;
    nomePai: Texto;
    cep: Texto;
    logradouro: Texto;
    numero: Texto;
    complemento: Texto;
    bairro: Texto;
    uf: Texto;
    email: Texto;
    rgNumero: Texto;
    rgUf: Texto;
    rgEmissao: Texto;
    tituloEleitor: Texto;
    tituloZona: Texto;
    tituloSecao: Texto;
  } | null;
  dependentes: ReadonlyArray<{ nomeCompleto: Texto; nascimento: Texto; parentesco: Texto; cpf: Texto }>;
  /** E2/E3/E4 — ausente enquanto as tabelas da configuração Questor não existirem. */
  questor?: ParametrosQuestorSnapshot;
  /** E5 — campos novos do candidato/dependentes (mesma ordem de `dependentes`). Ausente até M1a/M2a. */
  e5?: {
    titular: Partial<FichaE5Comuns & FichaE5Sensiveis> | null;
    dependentes: ReadonlyArray<Partial<DependenteE5Comuns & DependenteE5Sensiveis> | null>;
  };
};

export type PendenciaDeParaQuestor = {
  registro: TipoRegistroQuestor;
  campo: string;
  /** Posição do dependente (0…), quando o registro é D. */
  dependente: number | null;
  /**
   * `formato`: o dado gravado não tem a forma esperada (dígitos, data).
   * `equivalencia`: o dado é válido, mas a conversão depende de resposta da Conplus.
   * `fora_da_lista`: o rótulo gravado não está entre as opções conhecidas.
   */
  natureza: "formato" | "equivalencia" | "fora_da_lista";
  motivo: string;
};

type Valores = Record<string, string>;

class Montagem {
  readonly pendencias: PendenciaDeParaQuestor[] = [];

  /** Copia texto sem conversão. Vazio/nulo não entra; tamanho e tipo ficam com o validador. */
  texto(destino: Valores, campo: string, valor: Texto) {
    const limpo = valor?.trim();
    if (limpo) destino[campo] = limpo;
  }

  /** Aplica um formatador; valor presente que não converte vira pendência, e o campo fica vazio. */
  formatado(
    registro: TipoRegistroQuestor,
    destino: Valores,
    campo: string,
    valor: Texto,
    formatar: (texto: string) => string | null,
    motivo: string,
    dependente: number | null = null,
    natureza: PendenciaDeParaQuestor["natureza"] = "formato"
  ) {
    const limpo = valor?.trim();
    if (!limpo) return;
    const convertido = formatar(limpo);
    if (convertido) destino[campo] = convertido;
    else this.pendencias.push({ registro, campo, dependente, natureza, motivo });
  }

  rotulo(
    registro: TipoRegistroQuestor,
    destino: Valores,
    campo: keyof typeof TABELAS_DE_PARA_QUESTOR,
    valor: Texto,
    dependente: number | null = null
  ) {
    const limpo = valor?.trim();
    if (!limpo) return;
    const resultado = converterRotuloQuestor(TABELAS_DE_PARA_QUESTOR[campo], limpo);
    if (resultado.ok) destino[campo] = resultado.codigo;
    else
      this.pendencias.push({
        registro,
        campo,
        dependente,
        natureza: resultado.declarada ? "equivalencia" : "fora_da_lista",
        motivo: resultado.motivo
      });
  }
}

export function montarContratoQuestor(snapshot: SnapshotAdmissaoPralis): {
  contrato: ContratoAdmissaoQuestor;
  pendencias: PendenciaDeParaQuestor[];
} {
  const m = new Montagem();
  const { empresa, processo, internos, ficha } = snapshot;
  const a: Valores = {};
  const b: Valores = {};
  const c: Valores = {};

  const cnpj = empresa.cnpj?.trim() ? formatarCnpjQuestor(empresa.cnpj) : null;
  if (empresa.cnpj?.trim() && !cnpj)
    m.pendencias.push({
      registro: "A",
      campo: "CODIGOEMPRESA",
      dependente: null,
      natureza: "formato",
      motivo: "CNPJ da empresa não tem 14 dígitos"
    });
  for (const destino of [a, b, c]) if (cnpj) destino["CODIGOEMPRESA"] = cnpj;

  // Registro A
  m.formatado("A", a, "CPFFUNC", processo.cpf, formatarCpfQuestor, "CPF do processo não tem 11 dígitos");
  m.texto(a, "NOMEFUNC", processo.nomeCompleto);
  m.formatado("A", a, "DATANASC", ficha?.nascimento, formatarDataQuestor, "Data de nascimento inválida");
  m.formatado("A", a, "DATAADM", internos?.dataAdmissao, formatarDataQuestor, "Data de admissão inválida");

  // Registro B
  m.formatado("B", b, "PISFUNC", internos?.pisPasepNit, formatarPisQuestor, "PIS/PASEP/NIT não tem 11 dígitos");
  m.texto(b, "NUMEROCTPS", internos?.ctpsNumero);
  m.texto(b, "SERIECTPS", internos?.ctpsSerie);
  m.texto(b, "SIGLAESTADOCTPS", internos?.ctpsUf);
  if (ficha) {
    m.formatado("B", b, "CEPFUNC", ficha.cep, formatarCepQuestor, "CEP não tem 8 dígitos");
    m.texto(b, "ENDERFUNC", ficha.logradouro);
    m.formatado(
      "B",
      b,
      "NUMEROENDER",
      ficha.numero,
      (numero) => (/^\d{1,7}$/u.test(numero) ? numero : null),
      'Número do endereço não é inteiro (ex.: "S/N"); a documentação pede Inteiro de até 7 dígitos',
      null,
      "equivalencia"
    );
    m.texto(b, "COMPLENDER", ficha.complemento);
    m.texto(b, "BAIRROFUNC", ficha.bairro);
    m.texto(b, "SIGLAESTADO", ficha.uf);
    m.rotulo("B", b, "SEXO", ficha.sexo);
    m.rotulo("B", b, "RACACOR", ficha.racaCor);
    m.rotulo("B", b, "ESTADOCIVIL", ficha.estadoCivil);
    m.rotulo("B", b, "GRAUINSTR", ficha.grauInstrucao);
    m.rotulo("B", b, "NACIONALIDADE", ficha.nacionalidade);
    m.texto(b, "PAI", ficha.nomePai);
    m.texto(b, "MAE", ficha.nomeMae);

    // Registro C — só campos cuja descrição na documentação é inequívoca.
    m.texto(c, "NOMESOCIAL", ficha.nomeSocial);
    m.texto(c, "ENDERELETRE", ficha.email);
    m.texto(c, "NUMERORG", ficha.rgNumero);
    m.texto(c, "SIGLAESTADORG", ficha.rgUf);
    m.formatado("C", c, "EMISSRG", ficha.rgEmissao, formatarDataQuestor, "Data de emissão do RG inválida");
    m.texto(c, "TITELEIT", ficha.tituloEleitor);
    m.texto(c, "ZONATITELEIT", ficha.tituloZona);
    m.texto(c, "SECAOTITELEIT", ficha.tituloSecao);
  }

  // Registro D — o índice do NLI liga o dependente ao contrato por CNPJ + CPF + DATAADM do titular.
  const dependentes = snapshot.dependentes.map((dependente, indice) => {
    const d: Valores = {};
    if (cnpj) d["CODIGOEMPRESA"] = cnpj;
    m.formatado("D", d, "CPFFUNC", processo.cpf, cpfSemMascaraQuestor, "CPF do titular não tem 11 dígitos", indice);
    if (a["DATAADM"]) d["DATAADM"] = a["DATAADM"];
    m.texto(d, "NOMEDEPEND", dependente.nomeCompleto);
    m.formatado(
      "D",
      d,
      "DATANASC",
      dependente.nascimento,
      formatarDataQuestor,
      "Nascimento do dependente inválido",
      indice
    );
    m.rotulo("D", d, "PARENTESCO", dependente.parentesco, indice);
    if (dependente.cpf?.trim()) {
      m.pendencias.push({
        registro: "D",
        campo: "CPFDEPEND",
        dependente: indice,
        natureza: "equivalencia",
        motivo: "Formato do CPF do dependente não documentado (com ou sem máscara); aguardando Conplus"
      });
    }
    return d;
  });

  if (snapshot.questor) aplicarParametrosQuestor(snapshot.questor, { A: a, B: b, dependentes });

  let pendencias: PendenciaDeParaQuestor[] = m.pendencias;
  if (snapshot.e5) {
    const pendenciasE5 = aplicarCamposE5Questor(
      {
        titular: snapshot.e5.titular,
        dependentes: snapshot.e5.dependentes,
        tipoAdmissao: snapshot.questor?.contrato?.questorTipoAdmissao ?? null
      },
      { B: b, dependentes }
    );
    // A nacionalidade específica resolve a pendência de "Estrangeira" registrada acima.
    pendencias = [
      ...pendencias.filter((item) => !(item.registro === "B" && item.campo === "NACIONALIDADE" && b["NACIONALIDADE"])),
      ...pendenciasE5
    ];
  }

  return { contrato: { A: a, B: b, C: c, dependentes }, pendencias };
}

/** Monta o TXT completo. `valido` só é true quando não há diagnóstico do layout NEM pendência de de-para. */
export function prepararArquivoAdmissaoQuestor(snapshots: readonly SnapshotAdmissaoPralis[]): {
  conteudo: string;
  linhas: string[];
  diagnosticos: DiagnosticoQuestor[];
  pendencias: Array<PendenciaDeParaQuestor & { contrato: number }>;
  valido: boolean;
} {
  const montagens = snapshots.map(montarContratoQuestor);
  const arquivo = montarArquivoAdmissaoQuestor(montagens.map((montagem) => montagem.contrato));
  const pendencias = montagens.flatMap((montagem, contrato) =>
    montagem.pendencias.map((pendencia) => ({ ...pendencia, contrato }))
  );
  return { ...arquivo, pendencias, valido: arquivo.valido && pendencias.length === 0 };
}
