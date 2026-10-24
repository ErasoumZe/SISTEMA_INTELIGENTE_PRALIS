/**
 * De-para dos valores que o Pralís JÁ guarda para os códigos que a documentação oficial do Questor
 * lista na coluna "Observação" (nfpaadmissaofuncionario). Regra da E1: só entra conversão em que o
 * rótulo do Pralís corresponde ao rótulo da documentação sem interpretação de negócio. O resto vira
 * pendência explícita — nunca um código "parecido".
 *
 * Nada aqui altera o valor gravado: as funções recebem o texto do banco e devolvem o código.
 */

/**
 * `declarada`: o rótulo está na lista de pendências conhecidas (a equivalência depende da Conplus).
 * `false`: o valor gravado nem está na lista do formulário.
 */
export type ResultadoDeParaQuestor = { ok: true; codigo: string } | { ok: false; motivo: string; declarada: boolean };

export function normalizarRotuloQuestor(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

type TabelaDePara = {
  /** Campo do layout cujo `dominio` contém todos os códigos desta tabela. */
  campo: string;
  /** Rótulo aceito → código. Inclui os rótulos literais da documentação e os do Pralís equivalentes. */
  codigos: Readonly<Record<string, string>>;
  /** Rótulos que o Pralís usa e que NÃO têm equivalente comprovado. */
  pendentes: Readonly<Record<string, string>>;
};

const tabela = (
  campo: string,
  codigos: Record<string, string>,
  pendentes: Record<string, string> = {}
): TabelaDePara => ({
  campo,
  codigos: Object.fromEntries(
    Object.entries(codigos).map(([rotulo, codigo]) => [normalizarRotuloQuestor(rotulo), codigo])
  ),
  pendentes: Object.fromEntries(
    Object.entries(pendentes).map(([rotulo, motivo]) => [normalizarRotuloQuestor(rotulo), motivo])
  )
});

/** B.SEXO — doc: "Masculino=1; Feminino=2". */
export const DE_PARA_SEXO = tabela("SEXO", { Masculino: "1", Feminino: "2" });

/** B.RACACOR — doc: "Indígena=1; Branca=2; Preta=4; Amarela=6; Parda=8; Não Informado=9". */
export const DE_PARA_RACA_COR = tabela(
  "RACACOR",
  { Indígena: "1", Branca: "2", Preta: "4", Amarela: "6", Parda: "8", "Não Informado": "9" },
  { "Não declarado": 'O formulário diz "Não declarado" e a documentação "Não Informado"; equivalência a confirmar' }
);

/**
 * B.ESTADOCIVIL — doc: "Solteiro=1; Casado=2; Divorciado ou Separado Judicialmente=3; Viúvo=4;
 * Concubinato=5; Outros=6; Casado - …=7/8/9". O "(a)" do formulário é só a flexão de gênero.
 */
export const DE_PARA_ESTADO_CIVIL = tabela(
  "ESTADOCIVIL",
  {
    Solteiro: "1",
    "Solteiro(a)": "1",
    Casado: "2",
    "Casado(a)": "2",
    "Divorciado ou Separado Judicialmente": "3",
    "Divorciado(a)": "3",
    "Separado(a) judicialmente": "3",
    Viúvo: "4",
    "Viúvo(a)": "4",
    Concubinato: "5",
    Outros: "6",
    "Casado - Comunhão Total de Bens": "7",
    "Casado - Sem Comunhão de Bens": "8",
    "Casado - Comunhão Parcial de Bens": "9"
  },
  { "União estável": 'A documentação não tem "União estável"; Concubinato (5) ou Outros (6) depende da Conplus' }
);

/** B.NACIONALIDADE — doc: "Brasileiro=10; Brasileiro nascido no exterior=15; Naturalizado brasileiro=20; …". */
export const DE_PARA_NACIONALIDADE = tabela(
  "NACIONALIDADE",
  {
    Brasileiro: "10",
    Brasileira: "10",
    "Brasileiro nascido no exterior": "15",
    "Naturalizado brasileiro": "20",
    "Brasileira naturalizada": "20",
    // Demais rótulos literais da documentação (B.NACIONALIDADE / D.NACIONALIDADE).
    Argentino: "21",
    Boliviano: "22",
    Chileno: "23",
    Paraguaio: "24",
    Uruguaio: "25",
    Venezuelano: "26",
    Colombiano: "27",
    Peruano: "28",
    Equatoriano: "29",
    Alemão: "30",
    Belga: "31",
    Britânico: "32",
    Canadense: "34",
    Espanhol: "35",
    "Norte-americano(EUA)": "36",
    Francês: "37",
    Suíço: "38",
    Italiano: "39",
    Haitiano: "40",
    Japonês: "41",
    Chinês: "42",
    Coreano: "43",
    Russo: "44",
    Português: "45",
    Paquistanês: "46",
    Indiano: "47",
    "Outros latino-americanos": "48",
    "Outros asiáticos": "49",
    Outros: "50",
    "Outros Europeus": "51",
    Angolano: "60",
    Congolês: "61",
    "Sul-Africano": "62",
    "Outros Africanos": "70"
  },
  {
    Estrangeira: '"Estrangeira" não tem código; escolha a nacionalidade específica da lista da documentação (21 a 70)'
  }
);

/** Rótulos de nacionalidade na forma da documentação — para listas de seleção. */
export const NACIONALIDADES_QUESTOR: readonly string[] = [
  "Brasileiro",
  "Brasileiro nascido no exterior",
  "Naturalizado brasileiro",
  "Argentino",
  "Boliviano",
  "Chileno",
  "Paraguaio",
  "Uruguaio",
  "Venezuelano",
  "Colombiano",
  "Peruano",
  "Equatoriano",
  "Alemão",
  "Belga",
  "Britânico",
  "Canadense",
  "Espanhol",
  "Norte-americano(EUA)",
  "Francês",
  "Suíço",
  "Italiano",
  "Haitiano",
  "Japonês",
  "Chinês",
  "Coreano",
  "Russo",
  "Português",
  "Paquistanês",
  "Indiano",
  "Outros latino-americanos",
  "Outros asiáticos",
  "Outros",
  "Outros Europeus",
  "Angolano",
  "Congolês",
  "Sul-Africano",
  "Outros Africanos"
];

/** Rótulos de grau de instrução na forma da documentação (B.GRAUINSTR / D.GRAUINSTR). */
export const GRAUS_INSTRUCAO_QUESTOR: readonly string[] = [
  "Analfabeto",
  "Até o 5º ano incompleto do Ensino Fundamental",
  "5º ano completo do Ensino Fundamental",
  "Do 6º ao 9º ano do Ensino Fundamental incompleto",
  "Ensino fundamental completo",
  "Ensino médio incompleto",
  "Ensino médio completo",
  "Educação Superior incompleta",
  "Educação Superior completa",
  "Especialização",
  "Mestrado completo",
  "Doutorado completo",
  "Ph. D."
];

/** B.GRAUINSTR — rótulos literais da documentação (o formulário ainda não coleta este campo). */
export const DE_PARA_GRAU_INSTRUCAO = tabela("GRAUINSTR", {
  Analfabeto: "1",
  "Até o 5º ano incompleto do Ensino Fundamental": "2",
  "5º ano completo do Ensino Fundamental": "3",
  "Do 6º ao 9º ano do Ensino Fundamental incompleto": "4",
  "Ensino fundamental completo": "5",
  "Ensino médio incompleto": "6",
  "Ensino médio completo": "7",
  "Educação Superior incompleta": "8",
  "Educação Superior completa": "9",
  Especialização: "10",
  "Mestrado completo": "11",
  "Doutorado completo": "12",
  "Ph. D.": "13"
});

/**
 * D.PARENTESCO — doc: "Filho/Filha=01; Cônjuge=02; Pai/Mãe=03; …; Enteado/Enteada=11; Outros=14; …".
 * Equivalências aceitas: as sugestões do Pralís que são o MESMO vínculo com outra grafia.
 */
export const DE_PARA_PARENTESCO = tabela(
  "PARENTESCO",
  {
    "Filho/Filha": "01",
    "Filho(a)": "01",
    Cônjuge: "02",
    "Pai/Mãe": "03",
    Pai: "03",
    Mãe: "03",
    "Avô/Avó": "04",
    "Bisavô/Bisavó": "05",
    "Sobrinho/Sobrinha": "06",
    "Tio/Tia": "07",
    "Neto/Neta": "08",
    "Sogro/Sogra": "09",
    "Genro/Nora": "10",
    "Enteado/Enteada": "11",
    "Enteado(a)": "11",
    "Irmão/Irmã": "12",
    "Filho(a) Adotivo(a)": "13",
    Outros: "14",
    Outro: "14",
    "Menor Sob Tutela": "15"
  },
  {
    "Companheiro(a)":
      'A documentação só aceita companheiro(a) "com o(a) qual tenha filho ou viva há mais de 5 anos" (16); o Pralís não registra a condição',
    "Tutelado(a)": 'A documentação fala em "Menor Sob Tutela" (15); o Pralís não restringe o tutelado a menor'
  }
);

export const TABELAS_DE_PARA_QUESTOR = {
  SEXO: DE_PARA_SEXO,
  RACACOR: DE_PARA_RACA_COR,
  ESTADOCIVIL: DE_PARA_ESTADO_CIVIL,
  NACIONALIDADE: DE_PARA_NACIONALIDADE,
  GRAUINSTR: DE_PARA_GRAU_INSTRUCAO,
  PARENTESCO: DE_PARA_PARENTESCO
} as const;

export function converterRotuloQuestor(tabelaDePara: TabelaDePara, valor: string): ResultadoDeParaQuestor {
  const chave = normalizarRotuloQuestor(valor);
  const codigo = tabelaDePara.codigos[chave];
  if (codigo) return { ok: true, codigo };
  const pendencia = tabelaDePara.pendentes[chave];
  if (pendencia) return { ok: false, motivo: pendencia, declarada: true };
  return { ok: false, motivo: `"${valor}" não tem código documentado para ${tabelaDePara.campo}`, declarada: false };
}

// --- Formatos exigidos pela documentação --------------------------------------------------------

const digitos = (texto: string) => texto.replace(/\D/gu, "");

/** Doc A.CPFFUNC: "999.999.999-99". */
export function formatarCpfQuestor(cpf: string): string | null {
  const d = digitos(cpf);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : null;
}

/** Exemplo oficial do registro D: "CPF-SEM CARACTERES". */
export function cpfSemMascaraQuestor(cpf: string): string | null {
  const d = digitos(cpf);
  return d.length === 11 ? d : null;
}

/** Doc CODIGOEMPRESA: "99.999.999/0009-99". */
export function formatarCnpjQuestor(cnpj: string): string | null {
  const d = digitos(cnpj);
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : null;
}

/** Doc B.PISFUNC: "999.99999.99.9". */
export function formatarPisQuestor(pis: string): string | null {
  const d = digitos(pis);
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 8)}.${d.slice(8, 10)}.${d.slice(10)}` : null;
}

/** Doc B.CEPFUNC: "99.999-999". */
export function formatarCepQuestor(cep: string): string | null {
  const d = digitos(cep);
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : null;
}

/** NLI `FormatoData = 'DD/MM/YYYY'`. Entrada no formato do banco (`date` do Drizzle: AAAA-MM-DD). */
export function formatarDataQuestor(iso: string): string | null {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(iso);
  if (!partes) return null;
  const [, ano, mes, dia] = partes;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (
    data.getUTCFullYear() !== Number(ano) ||
    data.getUTCMonth() !== Number(mes) - 1 ||
    data.getUTCDate() !== Number(dia)
  ) {
    return null;
  }
  return `${dia}/${mes}/${ano}`;
}
