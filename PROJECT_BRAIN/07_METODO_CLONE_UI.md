# 07 — Método de clone de UI (adaptado do `cloner-web-site`)

> Fonte: `cloner.zip` → projeto `cloner-web-site`, um scaffold Next.js + shadcn/ui + Tailwind v4
> que carrega a skill **`clone-website`** (`.claude/skills/clone-website/SKILL.md`) e o
> `docs/research/INSPECTION_GUIDE.md`.

## 1. O que esse arquivo é — e o que aproveitamos

O scaffold em si **não serve** para nós: é Next.js + React + shadcn, e o Pralis é **Nuxt 4 +
Vue + Vuetify**. Não vamos migrar de framework por causa de estética.

O que vale — e vale muito — é a **metodologia**. A skill codifica um processo de engenharia
reversa de interface que é exatamente o que precisamos para "clonar o Mobills" sem chutar:

| Princípio da skill                                                               | Como aplicamos no Pralis                                                                                        |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **Completude vence velocidade** — o builder recebe tudo, nunca adivinha um valor | cada tela nova recebe spec com valores de `getComputedStyle()` do Mobills, não estimativas                      |
| **Tarefas pequenas, resultados perfeitos** (~150 linhas de spec por agente)      | uma spec por componente (card de conta, formulário de lançamento, linha de transação), não "refaz o financeiro" |
| **Extrair aparência E comportamento**                                            | não basta a cor do card — precisa do hover, da transição, do estado de loading                                  |
| **Identificar o modelo de interação antes de construir**                         | o erro mais caro: construir clique onde o original é scroll. Verificar antes                                    |
| **Extrair todos os estados, não só o default**                                   | formulário tem estado "foi paga" ligado/desligado; conta tem saldo atual e previsto                             |
| **Spec files são a fonte da verdade**                                            | `docs/research/components/*.spec.md` antes de qualquer código                                                   |
| **Fundação primeiro** (tokens, fontes, ícones)                                   | tokens `--cat-*` e neutros de `03` entram antes de qualquer tela                                                |
| **Build sempre compila**                                                         | `npm run lint && npm run check && npm test` verde em cada PR                                                    |
| **QA visual diff no fim**                                                        | screenshot lado a lado Mobills × Pralis, seção por seção, 1440 e 390                                            |

## 2. Ferramenta

A skill exige automação de browser. Já temos: **Chrome MCP** (`mcp__claude-in-chrome__*`),
usado na simulação de 22/07. Está validado — conseguimos navegar, preencher formulários,
ler `getComputedStyle` via `javascript_tool` e tirar screenshots.

## 3. O pipeline adaptado (Mobills → Pralis)

### Fase 0 — Reconhecimento

Navegar no Mobills e capturar, com Chrome MCP:

- screenshots full-page a **1440px** e **390px** de: Dashboard, Contas, Transações, formulário de
  Despesa, de Receita, de Transferência, Relatórios
- design tokens reais: `fontFamily`, escala de `fontSize`, `borderRadius`, `boxShadow`,
  espaçamentos, cores de estado
- **varredura de interação**: hover em cards e linhas, abertura/fechamento de "Mais detalhes",
  toggles, dropdowns, toasts

Saída: `docs/research/mobills/DESIGN_TOKENS.md`, `BEHAVIORS.md`, `PAGE_TOPOLOGY.md`.

### Fase 1 — Fundação (sequencial, sem delegar)

1. Trocar os valores do tema Vuetify em `nuxt.config.ts` pelos neutros de `03`.
2. **Adicionar a camada `--cat-*`** em `web-vue/assets/main.css` (não existe hoje).
3. Definir tipografia (decisão D11) e escala de raio/sombra.
4. Criar/ajustar os componentes-base compartilhados: `ValorHeroi`, `AtalhosData`,
   `ChipCategoria`, `CardConta` (com saldo atual × previsto), `LinhaTransacao`.
5. Verificar build verde.

**Nada de tela nova nesta fase.** É a fundação que impede cada tela de reinventar espaçamento.

### Fase 2 — Spec por componente

Para cada componente, um arquivo `docs/research/components/<nome>.spec.md` com:
overview + estrutura DOM + estilos computados exatos + estados e comportamentos +
conteúdo real + responsivo (1440 / 768 / 390).

**Regra:** nenhum agente construtor é despachado sem spec. Se a spec passar de ~150 linhas,
o componente está grande demais — quebrar.

### Fase 3 — Construção paralela

Um agente por componente, em branch/worktree separado. Cada um recebe a spec **inline** no
prompt (nunca "vá ler o arquivo X"). Cada um verifica typecheck antes de terminar.

### Fase 4 — Montagem

Compor as telas com os componentes prontos. Ordem sugerida (decisão D12 = por módulo):
**Caixa/cockpit → Transferências + Malotes → Lançamentos (despesas, mercadorias, retiradas,
entradas) → Relatórios → Cadastros.**

### Fase 5 — QA visual

Screenshots lado a lado, seção por seção, 1440 e 390. Cada divergência: checar se a spec estava
errada (re-extrair) ou se o construtor errou (corrigir o componente). Só então a tela está pronta.

## 4. Adaptações obrigatórias (Next→Nuxt)

| Na skill                              | No Pralis                                                    |
| ------------------------------------- | ------------------------------------------------------------ |
| `src/components/*.tsx`                | `web-vue/components/**/*.vue`                                |
| `src/app/globals.css` + tokens shadcn | `web-vue/assets/main.css` + tema Vuetify em `nuxt.config.ts` |
| `npx tsc --noEmit`                    | `npm run check` (typecheck do monorepo)                      |
| `npm run build`                       | `npm run lint && npm run check && npm test && npm run build` |
| worktrees por builder                 | branches sem acento, um PR pequeno por componente            |
| `docs/research/`                      | manter o mesmo caminho — é bom padrão                        |

## 5. Limite explícito — a regra-mãe

Herdada do playbook 66 e **reforçada aqui**:

> O rework de UI é **aditivo e reversível** e **NUNCA** toca lógica de negócio, API, banco,
> permissões, auth, seed, regras, cálculos, rotas ou dados.

As mudanças de **modelo** (tipo de transferência, lacre no ciclo do caixa, ciclo de vida do
lançamento) são **projetos separados**, com migration, spec e testes próprios — feitos antes ou
depois do rework visual, nunca no mesmo PR.

Isso não é burocracia: é o que permite rodar o rework visual com o sistema **operando uma padaria
de verdade** todos os dias.

## 6. Onde a skill fica

Copiar `cloner-web-site/.claude/skills/clone-website/SKILL.md` para as skills do usuário e
adaptá-la ao stack Vue/Vuetify (trocar as referências a Next/shadcn/tsc pelas da tabela §4).
Assim ela fica invocável em qualquer sessão futura de UI.
