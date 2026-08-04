# 67 — Linguagem visual Cicluz

Design system da casca. Curto de proposito: e o documento que impede o sexto vocabulario
paralelo de nascer.

**Fonte unica:** `web-vue/assets/main.css`, primeiro bloco (`:root`, tokens `--cx-*`).
**Regra de ouro:** valor de cor, espaco, raio, sombra ou duracao **nao se escreve solto**.
Se o token nao existe, cria-se o token — nao um `#e3e3e3` no meio de uma regra.

---

## 1. Onde cada coisa mora

| Camada                 | Arquivo                                 | O que decide                                    |
| ---------------------- | --------------------------------------- | ----------------------------------------------- |
| Tokens                 | `main.css` (topo)                       | cor, espaco, raio, elevacao, tipografia, motion |
| Aparencia por empresa  | `composables/useApi.ts` → `aplicarTema` | injeta `--empresa-*` inline no `<html>`         |
| Modo escuro            | `composables/useModoEscuro.ts`          | `data-theme` + troca o tema do Vuetify          |
| Defaults de componente | `nuxt.config.ts` → `vuetify.defaults`   | raio/densidade/variante de ~90% dos componentes |
| Acabamento             | `main.css` (ultimo bloco)               | estados, chrome, tabelas, modais, vazios        |

Os blocos intermediarios do `main.css` (LAB, RESPONSIVIDADE, MOBILLS V1, SHELL) sao
**historicos e estao congelados**. Regra nova de aparencia entra na camada de acabamento;
token novo entra no topo.

---

## 2. Como a cor chega na tela

Uma cadeia, tres elos, nesta ordem:

```
aplicarTema injeta   -->   --empresa-fundo: #eaf1f9        (inline, no <html>)
token le com fallback -->  --cx-canvas: var(--empresa-fundo, #f4f6fa)
alias historico       -->  --marca-fundo: var(--cx-canvas)
```

Duas consequencias que sustentam o arquivo inteiro:

1. **Empresa personalizada continua vencendo** — estilo inline vence folha de estilo.
2. **Modo escuro nao precisa de `!important`** — ele redefine `--cx-*`, que ninguem injeta
   inline. Antes o escuro disputava contra o inline e so vencia com `!important` em cada
   variavel; era isso que sustentava a pilha antiga.

> **Armadilha:** token novo de superficie/tinta **precisa** nascer lendo `--empresa-*`.
> Se nascer com hex cravado, a empresa com tema personalizado abre o sistema com metade das
> cores erradas — e ninguem ve, porque nenhum teste le CSS.

### Os quatro vocabularios antigos

`--padaria-*`, `--marca-*`, neutros V1 (`--canvas`, `--surface`, `--ink`, `--line`, `--brand`)
e `--shell-*` continuam existindo como **alias** de `--cx-*`. Nao foram apagados: estao
espalhados por 1689 linhas de CSS e 13 componentes.

- **Nao use nenhum deles em codigo novo.** Use `--cx-*`.
- **Nao apague nenhum deles** sem varrer os 13 `.vue` com `<style>` antes.

---

## 3. Cor

| Token                 | Claro               | Escuro      | Usar quando                              |
| --------------------- | ------------------- | ----------- | ---------------------------------------- |
| `--cx-canvas`         | `#f4f6fa` / empresa | `#0f1318`   | fundo da janela, atras dos cards         |
| `--cx-surface`        | `#ffffff` / empresa | `#191f26`   | card, sidebar, topbar, modal             |
| `--cx-surface-sunken` | derivado            | derivado    | cabecalho de tabela, campo recuado       |
| `--cx-ink`            | `#1f2733` / empresa | `#e7e9ec`   | texto principal                          |
| `--cx-ink-soft`       | `#5b6675` / empresa | `#a6afba`   | texto secundario, rotulo, legenda        |
| `--cx-line`           | `#e4e8ef`           | `#2a323c`   | divisor que precisa ser visto            |
| `--cx-line-soft`      | `#eef1f6`           | `#232b34`   | divisor de tabela, borda de card         |
| `--cx-hover`          | tinta a 6%          | tinta a 6%  | fundo de hover (funciona nos dois temas) |
| `--cx-pressed`        | tinta a 11%         | tinta a 11% | fundo de `:active`                       |

### Marca

| Token               | Valor                               | Usar quando                                 |
| ------------------- | ----------------------------------- | ------------------------------------------- |
| `--cx-brand`        | `#6515dd`                           | preenchimento (FAB, avatar, botao primario) |
| `--cx-brand-strong` | `#35128c`                           | hover do preenchimento                      |
| `--cx-brand-on`     | `#ffffff`                           | texto **sobre** o preenchimento             |
| `--cx-brand-wash`   | marca a 10% sobre a superficie      | fundo do item ativo                         |
| `--cx-brand-text`   | claro: `#35128c` / escuro: clareada | marca como **tinta ou grafico fino**        |
| `--cx-focus`        | claro: marca / escuro: clareada     | **so** o anel de foco                       |

> **`--cx-brand` e literal, nao segue a empresa — de proposito.** O tema por empresa e
> resolvido **por tela** (Entradas amarelo, Mercadorias verde, ver `corCategoriaPorTela`).
> Se a marca da casca lesse a primaria da tela, o FAB, o avatar e o item ativo trocariam de
> cor a cada navegacao. O acento por tela existe e continua chegando por `--padaria-brand`.

> **Nunca use `--cx-brand` como texto ou grafico fino sobre superficie escura:** medido,
> `#6515dd` sobre `#191f26` da **2,1:1** e reprova o minimo de 3:1. Para isso existem
> `--cx-brand-text` e `--cx-focus`.

### Semantica de texto

`--cx-positive` e `--cx-negative` sao **cor de texto** (minimo 4,5:1). Nao confundir com
`success`/`error` do tema Vuetify, que sao **fundo** com tinta por cima e seguem 3:1.

### Categoria

`--cat-*` (6 categorias × base/soft/strong) sao **semantica de negocio e nao mudam**.
Fonte: `PROJECT_BRAIN/03_MODELO_DE_CORES.md`.

---

## 4. Espaco — escala de 4px

`--cx-sp-1: 4` · `-2: 8` · `-3: 12` · `-4: 16` · `-5: 20` · `-6: 24` · `-7: 32` · `-8: 48`

Regra de leitura: **apertado dentro de um grupo, generoso entre grupos.**

- `sp-1`/`sp-2` — dentro de um controle (icone↔rotulo, chip)
- `sp-3`/`sp-4` — entre campos de um mesmo formulario
- `sp-5`/`sp-6` — padding de card, entre blocos da tela
- `sp-7`/`sp-8` — entre secoes, respiro de estado vazio

A hierarquia nasce do espacamento **antes** de nascer da cor. Se dois blocos estao confusos,
o conserto e espaco, nao uma borda.

---

## 5. Raio — por hierarquia, nunca por componente

| Token         | Valor | Usar em                                             |
| ------------- | ----- | --------------------------------------------------- |
| `--cx-r-sm`   | 8px   | controle pequeno: botao, campo, chip, item de lista |
| `--cx-r-md`   | 12px  | item de menu, bloco interno, menu suspenso          |
| `--cx-r-lg`   | 16px  | card, casca de tabela                               |
| `--cx-r-xl`   | 22px  | superficie grande: modal, hero, cartao de login     |
| `--cx-r-pill` | 999px | **so** pilulas de verdade: FAB, chip de status      |

No Vuetify, `rounded="lg"` = 8px (controle). O raio de card/superficie vem do CSS, porque a
escala do Vuetify nao expressa 16/22.

---

## 6. Elevacao — sempre duas sombras

`--cx-e-1` · `--cx-e-2` · `--cx-e-3`

Cada uma e composta de **duas** sombras: uma curta e opaca (contato) e uma longa e difusa
(ambiente). **Sombra de uma camada so e o que faz a interface parecer Bootstrap.**

- `e-1` — card em repouso, sidebar
- `e-2` — card de destaque (cards de total), menu suspenso
- `e-3` — modal, cartao de login

Superficie se separa por **elevacao + diferenca minima de luminancia**, nao por uma linha
cinza em volta de tudo. Se voce esta prestes a escrever `border: 1px solid`, pergunte
primeiro se `--cx-e-1` nao resolve.

---

## 7. Movimento

| Token           | Valor                            | Usar em                                   |
| --------------- | -------------------------------- | ----------------------------------------- |
| `--cx-dur-1`    | 120ms                            | hover, `:active`, troca de cor            |
| `--cx-dur-2`    | 180ms                            | expandir/recolher, entrada de menu        |
| `--cx-dur-3`    | 260ms                            | modal, largura do rail, entrada de pagina |
| `--cx-ease`     | `cubic-bezier(0.32, 0.72, 0, 1)` | padrao (assinatura da casa)               |
| `--cx-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)`  | entrada de elemento novo                  |

**Nada acima de 260ms.** Movimento comunica origem e destino; nao decora.

**`prefers-reduced-motion: reduce` e obrigatorio.** Existe um reset global no fim do
`main.css` que zera `animation`/`transition` de tudo — inclusive do que vier depois. Se sua
animacao usa `transform`, adicione tambem o `transform: none` na lista de excecoes de la:
duracao zero nao desfaz um deslocamento ja aplicado.

---

## 8. Tipografia

Familia: **Noto Sans** (`@import` no topo do `main.css`). **Fonte e decisao de marca** —
trocar exige aprovacao, nao e decisao de implementacao.

`--cx-fs-micro: 11` · `-caption: 12` · `-body: 14` · `-lead: 15` · `-title: 17` · `-h2: 21` · `-h1: 27`

- `--cx-tracking-tight` (`-0.018em`) em titulo grande. Titulo grande com tracking padrao
  parece texto ampliado, nao titulo.
- `--cx-tracking-wide` (`0.08em`) em rotulo maiusculo pequeno (cabecalho de tabela).

### Numero de dinheiro nao danca

**Todo numero de dinheiro usa `font-variant-numeric: tabular-nums`.** Ja esta aplicado em
celula de tabela, `.summary-value` e `.card-total-valor`. Para qualquer outro lugar existe a
classe utilitaria **`.cx-num`**. Sem isso o valor empurra o layout a cada atualizacao.

---

## 9. Estados — nao sao opcionais

Todo elemento interativo precisa dos quatro:

| Estado   | Como                                                |
| -------- | --------------------------------------------------- |
| hover    | ganha `--cx-hover` de fundo **antes** de ganhar cor |
| active   | `--cx-pressed` + `translateY(1px)` — afunda 1px     |
| focus    | anel de 2px em `--cx-focus`, `outline-offset: 2px`  |
| disabled | opacidade + `cursor: not-allowed`                   |

**`outline: none` sem substituto e proibido.** O anel de foco e a unica forma de quem navega
por teclado saber onde esta.

O item **ativo** do menu se le por **tres** sinais — fundo, peso de fonte e barra lateral —
nunca so por cor: quem nao distingue matiz continua enxergando onde esta.

Alvo de toque minimo: **40px**. Se o desenho pede 38, cresce a area clicavel, nao o desenho.

---

## 10. Material translucido

`--cx-chrome` + `--cx-chrome-blur` (`saturate(180%) blur(20px)`).

**So no chrome**: sidebar e topbar — as superficies que ficam **por cima** do conteudo.
**Nunca** em card de conteudo e **nunca** atras de texto de leitura. Vidro em tudo e o cliche
de 2021 e envelhece mal.

Todo uso precisa do `@supports not (backdrop-filter: ...)` com fundo solido.

---

## 11. Contraste — medir, nao estimar

Minimo **4,5:1** para texto e **3:1** para grafico/borda que carrega significado, **nos dois
temas**. Cor bonita que nao passa, nao entra.

A paleta atual foi medida par a par (34 pares, todos passam). Ao mexer em qualquer token de
cor, meca de novo — a armadilha classica e o par que so falha sobre `--cx-canvas`, e nao
sobre `--cx-surface`.

---

## 12. Checklist antes de abrir PR de aparencia

- [ ] Zero hex, px de espaco, raio, sombra ou duracao soltos — tudo token
- [ ] Funciona nos dois temas (claro **e** escuro)
- [ ] Contraste medido, nao estimado
- [ ] Hover, active, focus e disabled existem
- [ ] `prefers-reduced-motion` desliga o que voce animou
- [ ] Sem rolagem horizontal em 1440 / 1024 / 768 / 390
- [ ] Alvo de toque >= 40px
- [ ] Nenhuma tag de componente removida de nenhum template
- [ ] Empresa com tema personalizado continua sendo pintada certo
