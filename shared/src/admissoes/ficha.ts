import { z } from "zod";
import { dependenteRevisaoDtoSchema } from "./dependentes.js";

/**
 * ADM-003 V3 — a ficha que o candidato preenche pelo link.
 *
 * DOIS schemas de entrada, e a diferenca entre eles e a regra inteira:
 *
 * - RASCUNHO aceita tudo vazio. O candidato salva no meio, fecha o navegador, volta depois. Exigir
 *   campo em rascunho faria ele inventar valor so para conseguir salvar.
 * - ENVIAR exige o que o DP precisa para trabalhar. E aqui, e nao no banco: o CHECK de coerencia
 *   cobra o CICLO (aceite, declaracao de dependentes, carimbos), nao o conteudo — obrigatoriedade de
 *   campo e regra de negocio, e regra de negocio muda mais rapido que schema.
 *
 * `versao` e obrigatoria nos dois: sem ela a ultima gravacao venceria em silencio, e duas abas do
 * mesmo candidato perderiam uma.
 */

const LIMITE_CURTO = 120;
const LIMITE_LONGO = 240;

const texto = (max = LIMITE_CURTO) => z.string().trim().max(max);
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Data invalida");

/** Campos que o candidato preenche. Todos opcionais aqui; `fichaEnviarPayloadSchema` aperta. */
const camposDaFicha = {
  nomeSocial: texto().nullish(),
  nascimento: dataIso.nullish(),
  sexo: texto().nullish(),
  estadoCivil: texto().nullish(),
  racaCor: texto().nullish(),
  grauInstrucao: texto().nullish(),
  nacionalidade: texto().nullish(),
  naturalidade: texto().nullish(),
  nomeMae: texto(LIMITE_LONGO).nullish(),
  nomePai: texto(LIMITE_LONGO).nullish(),
  cep: z
    .string()
    .trim()
    .regex(/^[0-9]{8}$/u, "CEP precisa ter 8 digitos")
    .nullish(),
  logradouro: texto(LIMITE_LONGO).nullish(),
  numero: texto(20).nullish(),
  complemento: texto().nullish(),
  bairro: texto().nullish(),
  municipio: texto().nullish(),
  uf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/u, "UF precisa ter duas letras")
    .nullish(),
  telefone: z
    .string()
    .trim()
    .regex(/^[0-9]{10,11}$/u, "Telefone precisa ter 10 ou 11 digitos")
    .nullish(),
  email: z.string().trim().email("E-mail invalido").max(LIMITE_LONGO).nullish(),
  rgNumero: texto(30).nullish(),
  rgOrgao: texto(30).nullish(),
  rgUf: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/u, "UF precisa ter duas letras")
    .nullish(),
  rgEmissao: dataIso.nullish(),
  tituloEleitor: texto(30).nullish(),
  tituloZona: texto(10).nullish(),
  tituloSecao: texto(10).nullish(),
  banco: texto().nullish(),
  agencia: texto(20).nullish(),
  conta: texto(20).nullish(),
  contaDigito: texto(5).nullish(),
  contaTipo: texto(30).nullish()
};

export const fichaRascunhoPayloadSchema = z.object({
  versao: z.number().int().positive(),
  /**
   * A declaracao de dependentes viaja no RASCUNHO, e nao numa rota propria: ela e coluna da
   * ficha, e responder a pergunta e parte de preencher o formulario. Aqui ela e opcional —
   * `null`/ausente significa "ainda nao respondeu", que e estado legitimo enquanto se rascunha.
   *
   * `false` com zero dependentes tambem e legitimo no rascunho: o candidato marca que TEM antes
   * de cadastrar quem sao. A coerencia entre a resposta e a lista so e cobrada no envio.
   */
  semDependentes: z.boolean().nullish(),
  ...camposDaFicha
});

export type FichaRascunhoPayload = z.infer<typeof fichaRascunhoPayloadSchema>;

/**
 * Os campos que o documento 35 marca como obrigatorios E que existem como coluna hoje.
 *
 * Ficaram DE FORA por nao terem coluna na 0039, e cada um e decisao pendente, nao esquecimento:
 * primeiro emprego, contato de emergencia, reservista, CNH, PIX e vale-transporte. Coletar
 * qualquer um deles exige migration, e a V3 foi aprovada sem eles.
 */
const obrigatoriosParaEnviar = [
  "nascimento",
  "sexo",
  "estadoCivil",
  "racaCor",
  "grauInstrucao",
  "nacionalidade",
  "naturalidade",
  "nomeMae",
  "cep",
  "logradouro",
  "numero",
  "bairro",
  "municipio",
  "uf",
  "telefone",
  "rgNumero",
  "rgOrgao",
  "rgUf",
  "rgEmissao"
] as const;

export const camposObrigatoriosDaFicha: readonly string[] = obrigatoriosParaEnviar;

export const fichaEnviarPayloadSchema = fichaRascunhoPayloadSchema
  .extend({
    /**
     * ZERO dependente precisa ser DECLARADO. Tabela vazia tambem significa "nao respondeu", e o
     * CHECK de coerencia do banco recusa envio sem esta resposta.
     *
     * Na V3 o unico valor aceito era `true`, porque nao havia onde cadastrar dependente e oferecer
     * `false` deixaria o candidato preso. A V4 abriu as duas respostas — mas o Zod nao consegue
     * conferir a COERENCIA entre a resposta e a lista, porque ele nao ve o banco: `true` com
     * dependentes cadastrados, e `false` sem nenhum, sao recusados no servico, dentro do lock.
     */
    semDependentes: z.boolean(),
    avisoPrivacidadeVersao: z.string().trim().min(1)
  })
  .superRefine((dados, ctx) => {
    for (const campo of obrigatoriosParaEnviar) {
      // `dados` ja e o objeto tipado do proprio schema, e `campo` e uma chave dele — o indice e
      // seguro sem cast, e um campo removido do schema quebraria aqui em vez de virar `unknown`.
      const valor = dados[campo];
      if (valor === undefined || valor === null || valor === "") {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [campo], message: "Campo obrigatorio" });
      }
    }
  });

export type FichaEnviarPayload = z.infer<typeof fichaEnviarPayloadSchema>;

export const situacoesFicha = ["rascunho", "enviada", "devolvida", "aprovada"] as const;
export const situacaoFichaSchema = z.enum(situacoesFicha);
export type SituacaoFicha = z.infer<typeof situacaoFichaSchema>;

/** O que o candidato ve: a ficha dele, mais o que o DP ja preencheu, em LEITURA. */
export const fichaPublicaDtoSchema = z.object({
  situacao: situacaoFichaSchema,
  versao: z.number().int().positive(),
  /** `null` e resposta ausente, nao "tem dependentes". A tela precisa distinguir as tres. */
  semDependentes: z.boolean().nullable(),
  /** Pendencias escritas pelo DP ao devolver. Vazio quando nao houve devolucao. */
  revisaoPendencias: z.string().nullable(),
  avisoPrivacidadeVersao: z.string().nullable(),
  avisoAceitoEm: z.string().nullable(),
  /** O texto do aviso vigente, para a pessoa ler ANTES de aceitar. */
  avisoTexto: z.string(),
  avisoVersaoVigente: z.string(),
  /** Somente leitura: o que o DP preencheu e o candidato apenas confere. */
  cabecalho: z.object({
    empresaNome: z.string(),
    nomeCompleto: z.string().nullable(),
    funcaoNome: z.string().nullable(),
    turnoRotulo: z.string().nullable(),
    dataAdmissao: z.string().nullable()
  }),
  campos: z.object(camposDaFicha)
});

export type FichaPublicaDto = z.infer<typeof fichaPublicaDtoSchema>;

/**
 * O que o DP ve na revisao. Mesma ficha, mais quem revisou — e, desde a V5, a lista de dependentes.
 *
 * A lista viaja DENTRO da ficha, e nao numa rota propria do DP: revisar e ler a ficha inteira de uma
 * vez, e a permissao que abre a ficha (`admissoes_processos_ver_ficha`) e a mesma que deve abrir
 * quem foi declarado nela. Uma segunda rota seria um segundo lugar para conceder o mesmo acesso.
 * O CPF do dependente nao vem — ver `dependenteRevisaoDtoSchema`.
 */
export const fichaRevisaoDtoSchema = z.object({
  situacao: situacaoFichaSchema,
  versao: z.number().int().positive(),
  semDependentes: z.boolean().nullable(),
  enviadoEm: z.string().nullable(),
  revisadoEm: z.string().nullable(),
  revisadoPorNome: z.string().nullable(),
  revisaoPendencias: z.string().nullable(),
  avisoPrivacidadeVersao: z.string().nullable(),
  avisoAceitoEm: z.string().nullable(),
  campos: z.object(camposDaFicha),
  dependentes: z.array(dependenteRevisaoDtoSchema)
});

export type FichaRevisaoDto = z.infer<typeof fichaRevisaoDtoSchema>;

export const devolverFichaPayloadSchema = z.object({
  versao: z.number().int().positive(),
  // O CHECK do banco exige pendencia NOT NULL, mas aceita string vazia. Devolver sem dizer o que
  // corrigir e devolver no escuro, entao a barreira de verdade e aqui.
  pendencias: z.string().trim().min(1, "Escreva o que precisa ser corrigido").max(2000)
});

export const aprovarFichaPayloadSchema = z.object({
  versao: z.number().int().positive()
});
