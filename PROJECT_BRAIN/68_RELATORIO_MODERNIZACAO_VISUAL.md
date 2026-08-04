# Relatorio — modernizacao visual (linguagem macOS/Apple)

**Data:** 01/08/2026 · **Branch:** `feat/backend-telas-rodrigo`
**Escopo executado:** camada de tokens, casca e defaults. Nenhum formulario de negocio redesenhado.
**Design system resultante:** `PROJECT_BRAIN/67_LINGUAGEM_VISUAL_CICLUZ.md`

A identidade nao mudou: `#6515dd` e `#35128c` seguem sendo primaria/secundaria, as seis cores
`--cat-*` estao intactas, o logo e a fonte (Noto Sans) sao os mesmos.

---

## 1. O que mudou, por arquivo

### `web-vue/assets/main.css`

Quatro mudancas, cada uma em bloco delimitado por banner de comentario — da para reverter
uma sem perder as outras.

1. **Camada de tokens `--cx-*` (topo).** Fonte unica de cor, espaco (escala 4px), raio
   (8/12/16/22), elevacao (3 niveis, **duas sombras cada**), tipografia e movimento
   (120/180/260ms + as duas curvas). Antes nao existia token de espaco, raio nem movimento.

2. **Os quatro vocabularios historicos viraram alias.** `--padaria-*`, `--marca-*`, neutros V1
   e `--shell-*` continuam existindo e continuam sendo lidos por 1689 linhas de CSS e 13
   componentes — so que agora todos apontam para `--cx-*`. **Nenhum nome foi apagado.**

3. **Modo escuro reescrito como inversao de token.** A pilha de `!important` (14 variaveis +
   5 seletores de superficie) foi substituida por um `:root[data-theme="dark"]` que redefine
   ~12 primitivas. **Zero `!important`** no modo escuro agora.

4. **Camada de acabamento (fim do arquivo).** Chrome translucido, estados de menu, rail,
   grupos com altura animada, tabelas, modais, estados vazios, `tabular-nums`, anel de foco
   e o reset de `prefers-reduced-motion`. **E aqui que regra nova de aparencia deve entrar.**

### `web-vue/nuxt.config.ts`

- Defaults globais de `VBtn`, `VCard`, `VTextField`, `VTextarea`, `VSelect`, `VAlert`, `VChip`.
- **Tema `padariaDark` registrado de verdade** (antes so existia `padariaLight`).

### `web-vue/composables/useModoEscuro.ts`

Alem do `data-theme`, agora troca o tema do Vuetify (`theme.change`). Antes as CSS vars
mudavam mas os componentes Vuetify seguiam calculados como claros por dentro.

### `web-vue/composables/useApi.ts` (`aplicarTema`)

Passa a injetar as superficies/tintas da empresa em `--empresa-*` em vez de escrever direto
em `--marca-*`/`--padaria-*`. **Esta e a ponte que resolve a armadilha da PARTE 1.4** (secao 3
abaixo). O acento **por tela** continua indo direto em `--padaria-brand`/`--padaria-accent`.

### `web-vue/components/app/AppShell.vue`

Duas mudancas, ambas de marcacao — nenhum `computed`/`watch`/`ref`/chamada de API tocado:

- `.sidebar-subitens` ganhou um wrapper `.sidebar-subitens-wrap` e o `v-if` virou classe.
  Com `v-if` nao existe o que animar; os filhos agora ficam sempre montados e o CSS tira a
  visibilidade quando fechado — **some tambem da ordem do Tab** (verificado).
- O chevron virou um icone unico que **gira** por CSS, em vez de trocar de icone (troca de
  icone nao anima). Ganhou `aria-controls` ligando botao e regiao.

### `web-vue/pages/login.vue`

Fundo com duas luzes largas e fracas, cartao em `--cx-e-3` sem borda, entrada escalonada
(logo → titulo → formulario → slogan), estados de hover/active/foco, tudo em token.
**Texto trocado:** _"Acesso de donos e gerentes"_ → **"Acesso ao sistema"** (R-121: o operador
de caixa e usuario de primeira classe deste login e estava excluido pelo subtitulo).

---

## 2. Decisoes que tomei sozinho

| Decisao                                                           | Por que                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`--cx-brand` e literal, nao segue a empresa**                   | O tema por empresa e resolvido **por tela** (Entradas amarelo, Mercadorias verde). Se a marca da casca lesse a primaria da tela, o FAB, o avatar e o item ativo trocariam de cor a cada navegacao. O acento por tela continua existindo via `--padaria-brand`.        |
| **`VBtn` deixou de ser `rounded="pill"` (agora 8px)**             | Pill em todo botao quebra a escala de raio por hierarquia, que e um dos pilares da linguagem pedida. O FAB "+ NOVO" continua pill pelo CSS, que e onde ele de fato e um FAB. **E a mudanca mais visivel da rodada** — reverter = uma linha no `nuxt.config.ts`.       |
| **`padariaDark.primary` = `#a97bff`, nao `#6515dd`**              | Medido: `#6515dd` sobre `#191f26` da **2,1:1** e reprova como texto/link (`color="primary"` em botao de texto). Nao e troca de identidade — e a rendicao escura da mesma marca. O tema claro segue `#6515dd`.                                                         |
| **`--positive`/`--negative` passaram a existir**                  | Eram **consumidos** por 3 componentes e **nunca definidos**: rodavam sempre no fallback `#16a34a`, que da **3,3:1** sobre branco e reprova AA. Defini no tom que passa (5,1:1).                                                                                       |
| **`--cx-focus` como token proprio**                               | Idem: o anel de foco em `#6515dd` some sobre superficie escura. Token separado clareia no escuro e mantem o roxo no claro.                                                                                                                                            |
| **Tabela longa rola por dentro no desktop**                       | Foi o unico jeito honesto de fazer o cabecalho grudar ao rolar: `overflow-x: auto` ja torna a casca uma area de rolagem, e `position: sticky` sem altura maxima nao tem efeito. Aplicado **so acima de 1025px**, num `@media` isolado — reverter = apagar esse bloco. |
| **Estados vazios estilizados por seletor, sem tocar em template** | As telas usam um padrao consistente (`td.text-center.text-muted`), entao deu para dar respiro e presenca ao "Nenhum registro" sem editar nenhuma tela de negocio.                                                                                                     |

---

## 3. A armadilha do `aplicarTema` — como ficou (e a prova)

O `aplicarTema` injeta 14 propriedades **inline** no `documentElement`, e estilo inline vence
qualquer folha. Era por isso que o modo escuro precisava de `!important` em cada variavel.

A ponte: o `aplicarTema` escreve num namespace proprio (`--empresa-*`) e os tokens leem esse
namespace com fallback de fabrica:

```
--cx-canvas: var(--empresa-fundo, #f4f6fa);
```

Assim a empresa personalizada continua vencendo (inline vence folha) **e** o modo escuro
redefine `--cx-*`, que ninguem injeta inline — some a disputa, some o `!important`.

**Medido no navegador, com a empresa "Padaria Principal" (tema personalizado, `corFundo` = `#eaf1f9`):**

|        | `--cx-canvas`                                    | `--marca-fundo` (alias) | `--padaria-background` (alias) | tema Vuetify            |
| ------ | ------------------------------------------------ | ----------------------- | ------------------------------ | ----------------------- |
| Claro  | `#eaf1f9` ← **da empresa**                       | `#eaf1f9`               | `#eaf1f9`                      | `v-theme--padariaLight` |
| Escuro | `#0f1318` ← **o escuro vence, sem `!important`** | `#0f1318`               | `#0f1318`                      | `v-theme--padariaDark`  |

E o acento **por tela** foi preservado: em `/entradas`, `--v-theme-primary` = `202,138,4`
(o amarelo da categoria), exatamente como antes.

---

## 4. Verificacao

### Portoes automaticos (o piso, nao a prova)

|                                                    |                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                     | verde (exit 0)                                                                                                                                      |
| `npm run check` (typecheck de todos os workspaces) | verde                                                                                                                                               |
| testes web (`vitest`)                              | **155/155**, 13 arquivos                                                                                                                            |
| `npm run format:check`                             | falha em 192 arquivos — **pre-existente**, confirmado rodando com minhas mudancas guardadas no stash: mesmos 192. Meus arquivos estao todos limpos. |

### Contraste — medido, nao estimado

Script proprio de razao WCAG sobre a paleta final: **34/34 pares passam** (4,5:1 para texto,
3:1 para grafico), nos dois temas. O script achou **um defeito real** que eu tinha introduzido
— o anel de foco a 2,14:1 no escuro — e foi por isso que `--cx-focus` existe.

### Navegador (Chrome headless, dev local, via CDP)

Percorri o sistema logado (seed de desenvolvimento) e capturei **28 screenshots**:

- **11 telas × 2 temas** — Painel, Caixa, Entradas, Despesas, Mercadorias, Retiradas,
  Transferencias, Historico de caixas, Pendencias, Fornecedores, Permissoes
- **4 breakpoints** (1440 / 1024 / 768 / 390)
- sidebar **expandida e recolhida**, e foco por **teclado**

Medicoes automatizadas em cima disso:

| Verificacao                  | Resultado                                                                 |
| ---------------------------- | ------------------------------------------------------------------------- |
| Rolagem horizontal da pagina | **0px** em 8 telas × 4 breakpoints                                        |
| Alvo de toque < 40px         | **nenhum** (achou o avatar a 38px; corrigido)                             |
| Centragem do icone no rail   | desvio **0px** em 4 itens (achou 5px de desvio; corrigido)                |
| Anel de foco apos Tab        | `2px solid #6515dd`, offset 2px, visivel                                  |
| Grupo fechado do menu        | `grid-template-rows: 0px` + `visibility: hidden` → fora do Tab            |
| Chrome translucido           | `blur(20px) saturate(1.8)` ativo em sidebar e topbar, com fallback solido |

Dois defeitos meus foram achados **pela medicao, nao pelo olho** (avatar 38px, icone do rail
5px fora do eixo) — os dois corrigidos e re-medidos.

---

## 5. O que NAO deu para fazer

1. **Login nao segue o modo escuro.** O `useModoEscuro` so e inicializado dentro do
   `AppShell`, e o login nao usa a casca — entao ele e sempre claro, inclusive para quem
   deixou o sistema no escuro. O conserto e **uma linha** (chamar `inicializar()` no
   `login.vue`), mas e mexer no `<script setup>` de uma pagina, o que esta fora do que foi
   autorizado nesta rodada. **Precisa do teu OK.**

2. **Vuetify no escuro nao segue a marca da empresa.** O `padariaDark` tem paleta fixa e
   acessivel; o `aplicarTema` so atualiza o `padariaLight`. Fazer o escuro seguir a empresa
   exige clarear a cor dela em runtime (funcao de cor nova em TS) — decidi nao inventar
   logica de cor numa rodada sem supervisao. A casca (`--cx-*`) no escuro **ja** segue a
   empresa nas superficies; o que nao segue e a `primary` dos componentes Vuetify.

3. **Nao mexi nos 4 componentes com `<style>` proprio** (`operacao-lancamento.css`,
   `OperacaoTransferenciaModal`, `TesourariaCockpit`, `PermissoesGrade`). Eles consomem os
   vocabularios antigos, que agora sao alias — entao **herdaram** tokens e modo escuro de
   graca. Refina-los internamente seria entrar no interior de telas de negocio.

4. **Modais abertos nao entraram nos screenshots.** Abrir o modal de Transferencia/Lancamento
   exige caixa aberto e um fluxo de estado que eu teria que simular; preferi nao criar
   movimento no banco de dev. O CSS de modal (raio, elevacao, escurecimento, entrada em
   escala) esta aplicado no `.v-dialog` global e foi verificado nos menus suspensos, que
   usam o mesmo caminho.

5. **`inkParaSuperficie` continua devolvendo tinta quente** (`#2f2320`/`#6f635c`, heranca
   Pralis) quando o cartao e claro. Passa AA com folga (15,2:1 e 5,8:1), mas destoa do neutro
   frio da linguagem nova. **Nao mudei** porque esta travado por teste
   (`web-vue/utils/tema.test.ts:114`) e reusado em templates de e-mail da API — "consertar" o
   teste para passar destruiria a regra. Fica como sugestao.

---

## 6. Coisas quebradas que encontrei e NAO consertei (fora de escopo)

1. **`R$` duplicado no total de Operacoes.**
   `web-vue/components/financeiro/OperacoesPage.vue:121` tem
   `<strong>R$ {{ dinheiro(totalLiquidoOperacoes) }}</strong>`, mas `dinheiro()` ja formata em
   BRL. A tela mostra **"R$ R$ 0,00"**. Visivel em todos os screenshots de Entradas.
   Conserto = apagar o `R$ ` literal, mas e template de tela de negocio.

2. **Chips de regra de permissao nao seguem o modo escuro.**
   `.regra-permitir .regra-valor` e `.regra-negar .regra-valor` tem fundo/tinta cravados
   (`#e7f6ec`/`#15693a`). Ficam como ilhas claras no tema escuro. **Ja era assim antes** — nao
   e regressao, mas agora destoa mais porque o resto da tela inverte direito.

3. **Estado vazio da tabela e clipado no mobile.** `.responsive-table-shell .v-table` tem
   `min-width: 680px`, entao em 390px o "Nenhum registro" fica fora da area visivel e so
   aparece rolando a tabela na horizontal. Pre-existente; o conserto passa por marcacao.

4. **`web-vue/assets/main.css` continua com ~1900 linhas e 4 blocos historicos congelados.**
   Aliasei tudo em vez de apagar, como pedido. A consolidacao de verdade (apagar os
   vocabularios antigos, varrendo os 13 `.vue`) fica para uma rodada com supervisao.

---

## 7. Como reverter, por parte

| Quero desfazer               | Reverter                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| O raio dos botoes            | uma linha em `nuxt.config.ts` (`VBtn.rounded` de volta para `"pill"`) |
| O modo escuro novo           | o commit de tokens + `useModoEscuro.ts` + o tema `padariaDark`        |
| O chrome translucido         | as duas regras `backdrop-filter` no bloco SHELL do `main.css`         |
| A tabela que rola por dentro | o `@media (min-width: 1025px)` na camada de acabamento                |
| O acabamento inteiro         | o ultimo bloco do `main.css` (esta delimitado por banner)             |
| O login                      | `web-vue/pages/login.vue`                                             |

> **Nota sobre os commits:** ficaram separados por assunto na medida em que os arquivos
> permitem. `main.css` concentra tokens + casca + acabamento e foi para **um** commit, porque
> separa-lo exigiria staging interativo. Em compensacao, os quatro blocos dentro dele estao
> delimitados por banner de comentario e sao independentes — a tabela acima diz qual mexer.
