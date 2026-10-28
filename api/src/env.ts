import "dotenv/config";
import { resolve } from "node:path";
import { config as carregarEnv } from "dotenv";
import { z } from "zod";

// Segredos locais completam os defaults de `.env`, mas nunca entram no bundle do Nuxt. O segundo
// caminho cobre `npm --workspace api`; o primeiro cobre o servidor iniciado pela raiz. Em Docker,
// variaveis declaradas explicitamente no Compose precisam vencer o arquivo montado (por exemplo,
// DATABASE_URL usa o host `db`, nao `localhost`).
carregarEnv({
  path: [...new Set([resolve(process.cwd(), ".env.local"), resolve(process.cwd(), "..", ".env.local")])],
  override: false,
  quiet: true
});

const segredoDev = "dev-secret-change-me-dev-secret-change-me";
const bancoDev = "postgresql://padaria:padaria@localhost:5543/padaria";
const segredoPlaceholderExample = "change-me-in-production-with-at-least-32-chars";
const envOpcionalNaoVazio = z.preprocess(
  (valor) => (typeof valor === "string" && !valor.trim() ? undefined : valor),
  z.string().trim().min(1).optional()
);
const envOpcionalUrl = z.preprocess(
  (valor) => (typeof valor === "string" && !valor.trim() ? undefined : valor),
  z.string().trim().url().optional()
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
  // OAuth2 do Google: configuracao opcional para desenvolvimento. O refresh token nunca deve
  // aparecer em logs, respostas HTTP, bundle do Nuxt ou arquivos versionados.
  GOOGLE_CLIENT_ID: envOpcionalNaoVazio,
  GOOGLE_CLIENT_SECRET: envOpcionalNaoVazio,
  GOOGLE_REFRESH_TOKEN: envOpcionalNaoVazio,
  GOOGLE_DRIVE_FOLDER_ID: envOpcionalNaoVazio,
  GOOGLE_SPREADSHEET_ID: envOpcionalNaoVazio,
  // Cadastro de Produtos (R-222): a MESMA planilha que o app oficial da loja le, so leitura. Sem o ID
  // o fiscal fica "fonte_indisponivel" e o produto e salvo assim mesmo (igual ao oficial sem Sheets).
  // As abas tem os mesmos padroes do oficial (stack/api/src/config/env.ts).
  GOOGLE_PRODUTOS_SPREADSHEET_ID: envOpcionalNaoVazio,
  GOOGLE_PRODUTOS_FISCAL_TAB: z.string().trim().min(1).default("(TNP) FISCAL - DE PARA PRODUTOS"),
  GOOGLE_PRODUTOS_GRUPOS_TAB: z.string().trim().min(1).default("(TNP/LI/HORA - EXP.) GRUPOS/REF. - VLD SAIDA"),
  // A sincronizacao da admissao so pode ser habilitada explicitamente depois de a migration de
  // controle Google ser aplicada e o destino real ser validado. O default seguro e desligado.
  GOOGLE_ADMISSAO_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  // A sincronização Conplus permanece desativada até a migration, os cabeçalhos e o destino
  // real serem validados. Nunca habilitar por ausência de configuração.
  CONPLUS_GOOGLE_SYNC_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  // Exportações Questor são bloqueadas por padrão. Os dois gates precisam ser explicitamente
  // habilitados apenas após confirmação do layout/códigos pela Conplus e revisão operacional.
  CONPLUS_QUESTOR_EXPORT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  CONPLUS_QUESTOR_EXPORT_HOMOLOGADA: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  // TXT do PDV CREARE (R-222): DESLIGADO ate a virada combinada — enquanto o app de Produtos estiver no
  // ar, ele e quem publica o cadastro para o PDV. Mesmo JSON de configuracao do app (`CREARE_STORE_CONFIG_JSON`).
  CREARE_EXPORT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  CREARE_STORE_CONFIG_JSON: z.string().default(""),
  // Espelho do cadastro na planilha (R-222): DESLIGADO ate a virada — o app de Produtos ainda escreve la.
  GOOGLE_PRODUTOS_ESPELHO_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  GOOGLE_PRODUTOS_BASE_TAB: z.string().trim().min(1).default("(BASE) CADASTRO PRODUTOS"),
  // Mesmos padroes do oficial: coluna LOJAS, abas de loja (JSON {"TNP":"..."}; vazio = abas padrao) e prazo.
  GOOGLE_PRODUTOS_DEFAULT_LOJAS: z.string().default("TNP,LI,HORA"),
  GOOGLE_PRODUTOS_LOJA_TABS: z.string().default(""),
  GOOGLE_PRODUTOS_TIMEOUT_MS: z.coerce.number().int().min(0).default(20_000),
  // Custo pela discriminacao de mercadorias (DB-05; oficial `GOOGLE_SHEETS_MER_*`): SO LEITURA. Sem o ID a
  // previa responde "sem destino" e nada e gravado. O cabecalho e PROCURADO; a linha final limita a leitura.
  GOOGLE_PRODUTOS_MER_SPREADSHEET_ID: envOpcionalNaoVazio,
  GOOGLE_PRODUTOS_MER_TAB: z.string().trim().min(1).default("TNP - DISCRIMINAÇÃO MERCADORIAS (MER)"),
  GOOGLE_PRODUTOS_MER_LINHA_FINAL: z.coerce.number().int().min(2).default(20_000),
  // Publicacao do TXT do CREARE na pasta do Drive da loja (oficial `creare-drive`): DESLIGADA ate a virada.
  // `{"TNP":"<id da pasta>"}`, sem fallback: o destino e sempre decisao explicita de quem configura.
  CREARE_DRIVE_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((valor) => valor === "true"),
  CREARE_DRIVE_FOLDERS_JSON: z.string().default(""),
  // Download pelo robo da loja (Bearer). Menos de 32 caracteres = desligado, nunca enfraquecido.
  CREARE_EXPORT_TOKEN: z.string().default(""),
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
  NOTAS_FISCAIS_URL: envOpcionalUrl,
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
