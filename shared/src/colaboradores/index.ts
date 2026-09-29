import { z } from "zod";
import {
  empresaQuerySchema,
  exportarEmpresaPayloadSchema,
  importarEmpresaPayloadSchema,
  type ExportarEmpresaPayload,
  type ImportarEmpresaPayload
} from "../api/index.js";

const uuidSchema = z.string().uuid();

export const diasSemana = ["SEGUNDA", "TERCA", "QUARTA", "QUINTA", "SEXTA", "SABADO", "DOMINGO"] as const;
export const diaSemanaSchema = z.enum(diasSemana);

export const idParamsSchema = z.object({ id: uuidSchema });
export const colaboradorParamsSchema = z.object({ colaboradorId: uuidSchema });
export const colaboradorCargoParamsSchema = z.object({
  colaboradorId: uuidSchema,
  cargoColaboradorId: uuidSchema
});

export const cargoPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1)
});

export const colaboradorPayloadSchema = z.object({
  empresaId: uuidSchema,
  nome: z.string().min(1),
  cpf: z.string().optional().nullable(),
  setorId: uuidSchema.optional().nullable(),
  turnoPadraoId: uuidSchema.optional().nullable(),
  cargoId: uuidSchema
});

export const colaboradorCargoPayloadSchema = z.object({
  empresaId: uuidSchema,
  cargoId: uuidSchema,
  setorId: uuidSchema.optional().nullable(),
  remuneracaoMinuto: z.coerce.number().positive(),
  dataInicio: z.string().min(1),
  ativo: z.boolean().default(true)
});

export const colaboradorCargoStatusPayloadSchema = z.object({
  empresaId: uuidSchema,
  ativo: z.boolean()
});

export const jornadaPayloadSchema = z.object({
  empresaId: uuidSchema,
  dataInicio: z.string().min(1),
  dias: z
    .array(
      z.object({
        diaDaSemana: diaSemanaSchema,
        faixas: z.array(
          z.object({
            horaEntrada: z.string().default(""),
            cargaHorariaDiariaEmMinutos: z.coerce.number().int().min(0),
            intervaloMinutos: z.coerce.number().int().min(0).default(0),
            colaboradorCargoId: uuidSchema.optional().nullable()
          })
        )
      })
    )
    .min(1)
});

export const faltaJustificadaPayloadSchema = z.object({
  empresaId: uuidSchema,
  inicio: z.string().min(1),
  fim: z.string().min(1),
  motivo: z.string().min(1)
});

export const colaboradoresQuerySchema = empresaQuerySchema;
export const importarColaboradoresSchema = importarEmpresaPayloadSchema;
export const exportarColaboradorSchema = exportarEmpresaPayloadSchema;
export const importarCargosSchema = importarEmpresaPayloadSchema;
export const exportarCargoSchema = exportarEmpresaPayloadSchema;
export const colaboradorExportacaoParamsSchema = idParamsSchema;
export const cargoParamsSchema = idParamsSchema;

// Perfil cadastral privado do colaborador. A empresa nunca entra neste contrato: ela e derivada
// no servidor pelo perfil autenticado, como ja acontece na ficha de DP.
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((valor) => (valor ? valor : null));

const dataOpcional = z.string().date().nullable().optional();
const ufOpcional = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/u)
  .nullable()
  .optional();

export const dadosPessoaisColaboradorPayloadSchema = z.object({
  nomeSocial: textoOpcional(180),
  nascimento: dataOpcional,
  sexo: z.enum(["Masculino", "Feminino"]).nullable().optional(),
  estadoCivil: textoOpcional(60),
  racaCor: textoOpcional(60),
  grauInstrucao: textoOpcional(100),
  nacionalidade: textoOpcional(80),
  naturalidade: textoOpcional(120),
  nomeMae: textoOpcional(180),
  nomePai: textoOpcional(180),
  rgNumero: textoOpcional(40),
  rgOrgao: textoOpcional(30),
  rgUf: ufOpcional,
  rgEmissao: dataOpcional,
  tituloEleitor: textoOpcional(40),
  tituloZona: textoOpcional(20),
  tituloSecao: textoOpcional(20)
});

export const enderecoContatoColaboradorPayloadSchema = z.object({
  cep: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\D/g, ""))
    .pipe(z.string().length(8).or(z.literal("")))
    .nullable()
    .optional()
    .transform((valor) => (valor ? valor : null)),
  logradouro: textoOpcional(180),
  numero: textoOpcional(30),
  complemento: textoOpcional(120),
  bairro: textoOpcional(120),
  municipio: textoOpcional(120),
  uf: ufOpcional,
  telefone: z
    .string()
    .trim()
    .transform((valor) => valor.replace(/\D/g, ""))
    .pipe(z.string().regex(/^$|^[0-9]{10,11}$/u))
    .nullable()
    .optional()
    .transform((valor) => (valor ? valor : null)),
  email: z
    .string()
    .trim()
    .max(180)
    .nullable()
    .optional()
    .refine((valor) => valor === undefined || valor === null || valor === "" || z.string().email().safeParse(valor).success)
    .transform((valor) => (valor ? valor : null))
});

export const dadosBancariosColaboradorPayloadSchema = z.object({
  banco: textoOpcional(120),
  agencia: textoOpcional(30),
  conta: textoOpcional(40),
  contaDigito: textoOpcional(10),
  contaTipo: textoOpcional(40)
});

// PUT parcial: cada bloco ausente e preservado. Isso permite salvar uma aba por vez sem apagar as
// outras e tambem impede que uma tela antiga, que so edita nome, perca dados privados novos.
export const atualizarPerfilCadastralPayloadSchema = z
  .object({
    nome: z.string().trim().min(1).max(180).optional(),
    dadosPessoais: dadosPessoaisColaboradorPayloadSchema.optional(),
    enderecoContato: enderecoContatoColaboradorPayloadSchema.optional(),
    dadosBancarios: dadosBancariosColaboradorPayloadSchema.optional()
  })
  .refine(
    (dados) =>
      dados.nome !== undefined ||
      dados.dadosPessoais !== undefined ||
      dados.enderecoContato !== undefined ||
      dados.dadosBancarios !== undefined,
    { message: "Informe ao menos um dado para salvar" }
  );

export type DiaSemana = z.infer<typeof diaSemanaSchema>;
export type IdParams = z.infer<typeof idParamsSchema>;
export type ColaboradorParams = z.infer<typeof colaboradorParamsSchema>;
export type ColaboradorCargoParams = z.infer<typeof colaboradorCargoParamsSchema>;
export type CargoPayload = z.infer<typeof cargoPayloadSchema>;
export type ColaboradorPayload = z.infer<typeof colaboradorPayloadSchema>;
export type ColaboradorCargoPayload = z.infer<typeof colaboradorCargoPayloadSchema>;
export type ColaboradorCargoStatusPayload = z.infer<typeof colaboradorCargoStatusPayloadSchema>;
export type JornadaPayload = z.infer<typeof jornadaPayloadSchema>;
export type FaltaJustificadaPayload = z.infer<typeof faltaJustificadaPayloadSchema>;
export type ImportarColaboradoresPayload = ImportarEmpresaPayload;
export type ExportarColaboradorPayload = ExportarEmpresaPayload;
export type ImportarCargosPayload = ImportarEmpresaPayload;
export type ExportarCargoPayload = ExportarEmpresaPayload;
export type AtualizarPerfilCadastralPayload = z.infer<typeof atualizarPerfilCadastralPayloadSchema>;
