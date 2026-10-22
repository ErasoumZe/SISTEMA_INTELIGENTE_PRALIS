import "dotenv/config";
import { resolve } from "node:path";
import { config as carregarEnv } from "dotenv";
import { z } from "zod";

// Segredos locais vencem os defaults de `.env`, mas nunca entram no bundle do Nuxt. O segundo
// caminho cobre `npm --workspace api`; o primeiro cobre o servidor iniciado pela raiz.
carregarEnv({
  path: [...new Set([resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "..", ".env.local")])],
  override: true,
  quiet: true
});

const segredoDev = "dev-secret-change-me-dev-secret-change-me";
const bancoDev = "postgresql://padaria:padaria@localhost:5543/padaria";
const segredoPlaceholderExample = "change-me-in-production-with-at-least-32-chars";
const envOpcionalNaoVazio = z.preprocess(
  (valor) => (typeof valor === "string" && !valor.trim() ? undefined : valor),
  z.string().trim().min(1).optional()
);

const envSchema = z.object({
  // Enum fechado: um typo (ex.: "prod") derruba o boot em vez de desativar
  // silenciosamente os gates de producao.
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url().default(bancoDev),
  BETTER_AUTH_SECRET: z.string().min(32).default(segredoDev),
  AUTH_BASE_URL: z.string().url().default("http://localhost:4100"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5174"),
  // Origem adicional exclusivamente para desenvolvimento na rede local (ex.: celular no Wi-Fi).
  // Produção continua declarando sua única origem canônica em WEB_ORIGIN.
  WEB_ORIGIN_ADICIONAL: z.string().url().optional(),
  PORT: z.coerce.number().default(4100),
  HOST: z.string().default("0.0.0.0"),
  // Observabilidade opcional: sem DSN, o rastreamento de erros e no-op.
  SENTRY_DSN: z.string().url().optional(),
  // Gemini roda exclusivamente no backend. Sem chave, apenas a rota de leitura assistida responde
  // IA_NAO_CONFIGURADA; o restante do sistema continua funcionando normalmente.
  GEMINI_API_KEY: envOpcionalNaoVazio,
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(90_000),
  // Exclusivo para a fixture manual local do Caixa. Nunca substitui a leitura real e é recusado
  // fora de development pelo gate abaixo.
  GEMINI_MAQUININHA_SIMULADA: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  // Groq roda exclusivamente no backend e transcreve a observação de fechamento. Sem chave,
  // apenas esse recurso informa indisponibilidade; o fechamento manual segue disponível.
  GROQ_API_KEY: envOpcionalNaoVazio,
  GROQ_STT_MODEL: z.enum(["whisper-large-v3", "whisper-large-v3-turbo"]).default("whisper-large-v3-turbo"),
  GROQ_STT_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(120_000).default(90_000),
  // E-mail transacional (reset de senha + verificacao). Sem chave, os e-mails so vao para o log
  // (dev). Em producao, configure ambos (conta em resend.com). EMAIL_FROM = remetente verificado.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Webhook da contabilidade (Make.com) para importar NF-e por CNPJ/periodo. Sem URL/TOKEN, a
  // importacao de notas fiscais fica indisponivel (erro claro na rota); o resto do sistema funciona.
  // O CNPJ de cada empresa NAO vem daqui: e resolvido de empresas.cnpj no banco.
  NOTAS_FISCAIS_URL: z.string().url().optional(),
  NOTAS_FISCAIS_TOKEN: z.string().optional(),
  // Identificador FIXO da contabilidade no filtro (campo `company` de obternfeporfiltro). NAO e o
  // CNPJ da empresa consultada (esse vai em data.search.Client). Exposto como env para trocar de
  // contabilidade sem alterar codigo. Normalizado e validado como 14 digitos no boot.
  NOTAS_FISCAIS_COMPANY: z
    .string()
    .default("08351168000153")
    .transform((valor) => valor.replace(/\D/g, ""))
    .refine((valor) => valor.length === 14, "NOTAS_FISCAIS_COMPANY deve ter 14 digitos (CNPJ da contabilidade)"),
  // Envio automatico das cotacoes pelo WhatsApp (doc 57 §3). `desligado`: as mensagens ficam na fila e a
  // tela avisa. `meta`: WhatsApp Cloud API oficial (modelos aprovados). `webhook`: um gateway (Z-API,
  // Evolution, n8n) recebe {telefone, mensagem}. `teste`: so para os testes automatizados.
  WHATSAPP_PROVEDOR: z.enum(["desligado", "meta", "webhook", "teste"]).default("desligado"),
  WHATSAPP_META_TOKEN: envOpcionalNaoVazio,
  WHATSAPP_META_TELEFONE_ID: envOpcionalNaoVazio,
  WHATSAPP_META_VERSAO_API: z.string().trim().min(1).default("v21.0"),
  WHATSAPP_META_MODELO_COTACAO: z.string().trim().min(1).default("cotacao_compra"),
  WHATSAPP_META_MODELO_CONFIRMACAO: z.string().trim().min(1).default("pedido_confirmado"),
  WHATSAPP_META_IDIOMA: z.string().trim().min(1).default("pt_BR"),
  // O compose sempre manda a variavel (vazia quando nao ha gateway): vazio e ausente, nao URL invalida.
  WHATSAPP_WEBHOOK_URL: z.preprocess(
    (valor) => (typeof valor === "string" && !valor.trim() ? undefined : valor),
    z.string().url().optional()
  ),
  WHATSAPP_WEBHOOK_TOKEN: envOpcionalNaoVazio
});

export const env = envSchema.parse(process.env);
export const origensWebPermitidas = [
  ...new Set([env.WEB_ORIGIN, env.WEB_ORIGIN_ADICIONAL].filter((origem): origem is string => Boolean(origem)))
];

// Gate de producao: os defaults acima existem para conveniencia de dev/teste.
// Subir producao com qualquer um deles seria assinar sessoes com segredo publico
// ou apontar para banco local — melhor recusar o boot com mensagem clara.
if (env.NODE_ENV === "production") {
  const problemas: string[] = [];
  if (env.BETTER_AUTH_SECRET === segredoDev || env.BETTER_AUTH_SECRET === segredoPlaceholderExample) {
    problemas.push("BETTER_AUTH_SECRET esta com o valor default de desenvolvimento");
  }
  if (env.DATABASE_URL === bancoDev) {
    problemas.push("DATABASE_URL esta apontando para o banco local de desenvolvimento");
  }
  if (problemas.length) {
    throw new Error(`Configuracao invalida para producao: ${problemas.join("; ")}`);
  }
  // E-mail e degradavel (nao fatal): sem provedor, reset/verificacao so vao para o log do container.
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    console.warn("[env] RESEND_API_KEY/EMAIL_FROM ausentes: e-mails (reset/verificacao) so irao para o log.");
  }
  // Importacao de NF-e e degradavel: sem webhook configurado, apenas a rota de importacao fica indisponivel.
  if (!env.NOTAS_FISCAIS_URL || !env.NOTAS_FISCAIS_TOKEN) {
    console.warn("[env] NOTAS_FISCAIS_URL/TOKEN ausentes: importacao de notas fiscais desativada.");
  }
  if (!env.GROQ_API_KEY) {
    console.warn("[env] GROQ_API_KEY ausente: transcricao de observacao do fechamento desativada.");
  }
}

if (env.NODE_ENV !== "development" && env.GEMINI_MAQUININHA_SIMULADA) {
  throw new Error("GEMINI_MAQUININHA_SIMULADA é permitida somente em desenvolvimento");
}
