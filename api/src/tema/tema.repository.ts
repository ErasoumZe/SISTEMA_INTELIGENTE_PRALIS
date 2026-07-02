import type { DadosExternos } from "@padaria/shared/api";
import { eq } from "drizzle-orm";
import { empresas } from "@padaria/db/schema";
import { banco, type ExecutorBanco } from "../banco/conexao.js";
import {
  configuracaoAparenciaEmpresaSchema,
  temaPadraoAplicacao,
  type ConfiguracaoAparenciaEmpresa,
  type TemaDto,
  type TemaPayload
} from "@padaria/shared/tema";

const camposTema = [
  "corPrimaria",
  "corSecundaria",
  "corFundo",
  "corCartao",
  "corSucesso",
  "corAviso",
  "corErro"
] as const satisfies ReadonlyArray<keyof TemaDto>;

type TemaParcial = { [K in keyof TemaDto]?: TemaDto[K] | undefined };

export function normalizarConfiguracaoAparencia(valor: DadosExternos): ConfiguracaoAparenciaEmpresa {
  const resultado = configuracaoAparenciaEmpresaSchema.safeParse(valor);
  if (!resultado.success) return { padrao: { ...temaPadraoAplicacao }, especifico: [] };
  return {
    padrao: { ...temaPadraoAplicacao, ...resultado.data.padrao },
    especifico: resultado.data.especifico
  };
}

function temaCompleto(tema: TemaParcial): TemaDto {
  return {
    corPrimaria: tema.corPrimaria ?? temaPadraoAplicacao.corPrimaria,
    corSecundaria: tema.corSecundaria ?? temaPadraoAplicacao.corSecundaria,
    corFundo: tema.corFundo ?? temaPadraoAplicacao.corFundo,
    corCartao: tema.corCartao ?? temaPadraoAplicacao.corCartao,
    corSucesso: tema.corSucesso ?? temaPadraoAplicacao.corSucesso,
    corAviso: tema.corAviso ?? temaPadraoAplicacao.corAviso,
    corErro: tema.corErro ?? temaPadraoAplicacao.corErro
  };
}

export function resolverTema(configuracao: ConfiguracaoAparenciaEmpresa, tela: string): TemaDto {
  if (tela === "padrao") return temaCompleto(configuracao.padrao);
  const especifico = configuracao.especifico.find((item) => item.pagina === tela);
  return temaCompleto({ ...configuracao.padrao, ...(especifico?.propriedades ?? {}) });
}

function paraTema(input: TemaPayload): TemaDto {
  return {
    corPrimaria: input.corPrimaria,
    corSecundaria: input.corSecundaria,
    corFundo: input.corFundo,
    corCartao: input.corCartao,
    corSucesso: input.corSucesso,
    corAviso: input.corAviso,
    corErro: input.corErro
  };
}

function diferencasDoPadrao(tema: TemaDto, padrao: TemaDto): Partial<TemaDto> {
  return Object.fromEntries(
    camposTema.filter((campo) => tema[campo] !== padrao[campo]).map((campo) => [campo, tema[campo]])
  );
}

function limparEspecificos(configuracao: ConfiguracaoAparenciaEmpresa) {
  return configuracao.especifico
    .map((item) => ({
      pagina: item.pagina,
      propriedades: diferencasDoPadrao(
        temaCompleto({ ...configuracao.padrao, ...item.propriedades }),
        configuracao.padrao
      )
    }))
    .filter((item) => Object.keys(item.propriedades).length > 0);
}

export async function obterConfiguracaoAparenciaEmpresa(
  empresaId: string,
  db: ExecutorBanco = banco
): Promise<ConfiguracaoAparenciaEmpresa> {
  const [linha] = await db
    .select({ configuracoesAparencia: empresas.configuracoesAparencia })
    .from(empresas)
    .where(eq(empresas.id, empresaId))
    .limit(1);
  return normalizarConfiguracaoAparencia(linha?.configuracoesAparencia);
}

export async function obterTemaComFallback(
  empresaId: string,
  tela: string,
  db: ExecutorBanco = banco
): Promise<TemaDto> {
  return resolverTema(await obterConfiguracaoAparenciaEmpresa(empresaId, db), tela);
}

export async function salvarTema(
  input: TemaPayload & { atualizadoPor?: string | null },
  db: ExecutorBanco = banco
): Promise<TemaDto> {
  const configuracaoAtual = await obterConfiguracaoAparenciaEmpresa(input.empresaId, db);
  const tema = paraTema(input);
  const proximaConfiguracao: ConfiguracaoAparenciaEmpresa =
    input.tela === "padrao"
      ? {
          padrao: tema,
          especifico: limparEspecificos({ ...configuracaoAtual, padrao: tema })
        }
      : {
          padrao: configuracaoAtual.padrao,
          especifico: configuracaoAtual.especifico.filter((item) => item.pagina !== input.tela)
        };

  if (input.tela !== "padrao") {
    const propriedades = diferencasDoPadrao(tema, proximaConfiguracao.padrao);
    if (Object.keys(propriedades).length > 0) {
      proximaConfiguracao.especifico.push({ pagina: input.tela, propriedades });
    }
  }

  const [linha] = await db
    .update(empresas)
    .set({ configuracoesAparencia: proximaConfiguracao })
    .where(eq(empresas.id, input.empresaId))
    .returning({ configuracoesAparencia: empresas.configuracoesAparencia });

  if (!linha) throw new Error("Tema nao foi salvo");
  return resolverTema(normalizarConfiguracaoAparencia(linha.configuracoesAparencia), input.tela);
}
