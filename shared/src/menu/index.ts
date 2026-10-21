import { z } from "zod";

const uuidSchema = z.string().uuid();

/** Todas as telas navegáveis e a única categoria existente do menu lateral. */
export const idsMenuConfiguraveis = [
  "entradas",
  "transferencias",
  "despesas",
  "mercadorias",
  "retiradas",
  "fechamento",
  "relatorio_produtos",
  "caixa",
  "historico_caixas",
  "relatorio_fechamento",
  "campanhas",
  "promocoes",
  "relatorio_faltas",
  "relatorio_advertencias",
  "pedidos",
  "perdas_sobras",
  "estoque_produtos",
  "conferencias_estoque",
  "agendamento_pedidos",
  "relatorio_dre",
  "clientes",
  "fornecedores",
  "socios_gestores",
  "maquininhas",
  "produtos",
  "colaboradores",
  "departamento_pessoal",
  "admissoes_testes",
  "admissoes_processos",
  "folha_ponto",
  "avaliacao_qualidade",
  "avaliacao_colaboradores",
  "relatorio_fiscal",
  "fiscal_produtos",
  "patrimonio",
  "ficha_tecnica",
  "ingredientes",
  "contas_pagar",
  "relatorio_vendas",
  "notas_fiscais",
  "pdv",
  "formas_pagamento",
  "integracoes",
  "contas",
  "empresas",
  "grupos",
  "unidades",
  "turnos",
  "funcoes_operacionais",
  "areas_setores",
  "usuarios",
  "permissoes",
  "aparencia",
  "lancamentos"
] as const;

export type IdMenuConfiguravel = (typeof idsMenuConfiguraveis)[number];

/** Filhos representados pela categoria única Lançamentos no menu lateral. */
export const idsFilhosLancamentos = [
  "despesas",
  "mercadorias",
  "retiradas"
] as const satisfies readonly IdMenuConfiguravel[];

/**
 * Paleta sem hex livre: cada cor já possui contraste e variante para tema claro/escuro no web.
 * `neutro` preserva a aparência atual para grupos administrativos.
 */
export const coresMenuGrupo = [
  "neutro",
  "entradas",
  "transferencias",
  "despesas",
  "mercadorias",
  "retiradas",
  "resultado"
] as const;

export type CorMenuGrupo = (typeof coresMenuGrupo)[number];

const corMenuGrupoSchema = z.enum(coresMenuGrupo);
export const corRgbMenuSchema = z
  .object({
    r: z.number().int().min(0).max(255),
    g: z.number().int().min(0).max(255),
    b: z.number().int().min(0).max(255)
  })
  .strict();

export type CorRgbMenu = z.infer<typeof corRgbMenuSchema>;

const idMenuConfiguravelSchema = z.enum(idsMenuConfiguraveis);
const secaoMenuEmpresaSchema = z.object({
  id: z.string().trim().min(1).max(80),
  titulo: z.string().trim().min(1).max(48),
  ids: z.array(idMenuConfiguravelSchema).max(idsMenuConfiguraveis.length),
  cor: corMenuGrupoSchema.optional(),
  corRgb: corRgbMenuSchema.optional()
});

export const estruturaMenuEmpresaSchema = z.object({
  versao: z.literal(1),
  secoes: z.array(secaoMenuEmpresaSchema).max(16),
  /** Oculta somente do menu lateral; não altera rotas, permissões nem dados. */
  idsOcultos: z.array(idMenuConfiguravelSchema).max(idsMenuConfiguraveis.length).default([])
});

export const menuEmpresaQuerySchema = z.object({ empresaId: uuidSchema });
export const menuEmpresaPayloadSchema = z.object({
  empresaId: uuidSchema,
  estrutura: estruturaMenuEmpresaSchema
});

export type EstruturaMenuEmpresa = z.infer<typeof estruturaMenuEmpresaSchema>;
export type MenuEmpresaQuery = z.infer<typeof menuEmpresaQuerySchema>;
export type MenuEmpresaPayload = z.infer<typeof menuEmpresaPayloadSchema>;

const corLegadaPorTitulo: Record<string, CorMenuGrupo> = {
  Entradas: "entradas",
  Transferencias: "transferencias",
  Resultados: "resultado"
};

const filhosLancamentos = new Set<IdMenuConfiguravel>(idsFilhosLancamentos);

/**
 * Remove duplicatas, seções vazias e qualquer tela fora do catálogo. A organização só muda
 * posição: nunca concede acesso e nunca faz uma tela sem permissão aparecer.
 */
export function normalizarEstruturaMenuEmpresa(estrutura: EstruturaMenuEmpresa): EstruturaMenuEmpresa {
  const usados = new Set<IdMenuConfiguravel>();
  const conhecidos = new Set<string>(idsMenuConfiguraveis);
  const usaLancamentos = estrutura.secoes.some((secao) => secao.ids.includes("lancamentos"));
  const secoes = estrutura.secoes.flatMap((secao) => {
    const ids = secao.ids.filter((id) => {
      // Lançamentos é um único submenu. Se estiver presente, seus três filhos não podem aparecer
      // soltos em outro grupo e deixar o submenu fragmentado.
      if (usaLancamentos && filhosLancamentos.has(id)) return false;
      if (!conhecidos.has(id) || usados.has(id)) return false;
      usados.add(id);
      return true;
    });
    return ids.length ? [{ ...secao, ids, cor: secao.cor ?? corLegadaPorTitulo[secao.titulo] ?? "neutro" }] : [];
  });
  const idsOcultos = [...new Set(estrutura.idsOcultos ?? [])].filter((id) => conhecidos.has(id));
  return { versao: 1, secoes, idsOcultos };
}
