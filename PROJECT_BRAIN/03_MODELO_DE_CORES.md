# 03 — Modelo de cores (o código visual do negócio)

## 1. A descoberta

As cores não estavam nas células — estavam nas **abas** da planilha. Cada aba tem `tabColor`, e
esse código é o mesmo que o Rodrigo levou para o Xmind. **A planilha e o mapa mental usam o
mesmo alfabeto visual.** Ele já pensa por cor há anos.

| Cor         | Hex (planilha)  | Módulo                                  | Confirmação no Xmind       |
| ----------- | --------------- | --------------------------------------- | -------------------------- |
| 🟡 Amarelo  | `#FFFF00`       | **VENDAS / ENTRADAS**                   | Entradas = amarelo ✔       |
| 🔴 Vermelho | `#FF0000`       | **DESPESAS**                            | Despesas = vermelho ✔      |
| 🟢 Verde    | `#00FF00`       | **MERCADORIAS**                         | Mercadorias = verde ✔      |
| 🔵 Azul     | `#0000FF`       | **RETIRADAS**                           | Retiradas = azul ✔         |
| 🟠 Laranja  | `#FF9900`       | **TRANSFERÊNCIAS, CONTAS, CONCILIAÇÃO** | Transferências = laranja ✔ |
| ⚫ Preto    | `#000000`       | **Bases de referência / cadastros**     | —                          |
| 🟣 Roxo     | _(só no Xmind)_ | **RESULTADO / DIFERENÇA**               | Resultado = roxo           |

> Nota: o laranja cobre **três** coisas — transferências, plano de contas e conciliação. Faz
> sentido: é tudo "movimento entre contas". Mantemos a família laranja para esse eixo.

## 2. Problema: as cores puras não servem para UI

`#FFFF00`, `#00FF00` e `#0000FF` são cores de aba de Excel — vibrantes demais, ilegíveis como
fundo, reprovam contraste. Precisamos **preservar o significado** e **traduzir para uma paleta
utilizável**, no espírito do Mobills (fundo claro, cor como acento e sinal, não como preenchimento).

## 3. Paleta operacional proposta

Para cada categoria, três tokens: `-base` (ícone, borda, barra, texto de destaque),
`-soft` (fundo de chip/seção/hover) e `-strong` (hover/ativo). Valores AA-safe sobre branco.

> ⚠️ **Atualizado em 04/08/2026.** Os valores abaixo substituem a paleta original desta seção, por
> decisão do José: ele pediu cores **"bem vivas e evidentes"**, e as anteriores eram dessaturadas
> demais para o que a tela precisava mostrar. A tabela antiga ficou registrada no histórico do git.
>
> **A fonte de verdade dos hex não é mais este documento** — é `web-vue/utils/cores-categoria.ts`.
> Até esta data havia DUAS fontes com valores diferentes para a mesma categoria (os tokens do
> `main.css` e o `corCategoriaPorTela` do `tema.ts`), e ninguém percebia: o ícone de Mercadorias no
> menu era `#16a34a` e o card da mesma categoria era `#15803D`. Um teste
> (`cores-categoria.test.ts`) agora falha se as duas divergirem.

| Categoria                    | `--cat-*-base` | `--cat-*-soft` | `--cat-*-strong` | `--cat-*-faixa` | Uso                             |
| ---------------------------- | -------------- | -------------- | ---------------- | --------------- | ------------------------------- |
| **Entradas / Vendas** 🟡     | `#ca8a04`      | `#fbf6eb`      | `#a26e03`        | `#9e6c03`       | receita, venda, entrada         |
| **Transferências** 🟠        | `#ea580c`      | `#fdf2ec`      | `#bb460a`        | `#cc4d0a`       | cofre ⇄ caixa, lacre            |
| **Despesas** 🔴              | `#dc2626`      | `#fceeee`      | `#b01e1e`        | `#dc2626`       | despesa operacional             |
| **Mercadorias** 🟢           | `#16a34a`      | `#ecf8f1`      | `#12823b`        | `#12873d`       | compra de mercadoria, NF-e      |
| **Retiradas** 🔵             | `#2563eb`      | `#eef3fd`      | `#1e4fbc`        | `#2563eb`       | retirada de sócio, adiantamento |
| **Resultado / Diferença** 🟣 | `#6d28d9`      | `#f3eefc`      | `#5720ae`        | `#6d28d9`       | saldo, DRE, quebra              |

**`-soft` e `-strong` são derivados por fórmula** da base (8% sobre branco / 20% mais escura), e não
escolhas avulsas — uma base nova não exige inventar mais dois hex à mão. Há teste para isso.

**`-faixa` é o único medido**, e existe porque o cabeçalho colorido dos modais leva texto **branco**:
a `base` reprova em 4,5:1 nas categorias claras (entradas 2,94 · transferências 3,56 ·
mercadorias 3,30) e em entradas nem o `strong` resolve (4,40). Escurecer só quem precisa mantém as
outras vivas em vez de rebaixar todas para igualar a pior.

**"Contas / Cadastros" saiu da tabela.** Não é categoria: essas telas ficam **neutras de propósito**
— hover cinza no menu e item ativo no roxo da marca. Ver `PROJECT_BRAIN/67`.

Neutros (base Mobills — claro, arejado):

| Token        | Valor     | Uso                                                                              |
| ------------ | --------- | -------------------------------------------------------------------------------- |
| `--surface`  | `#FFFFFF` | cards, modais, tabelas                                                           |
| `--canvas`   | `#F4F6FA` | fundo da aplicação                                                               |
| `--ink`      | `#1F2733` | texto principal                                                                  |
| `--ink-soft` | `#64748B` | texto secundário, labels                                                         |
| `--line`     | `#E4E8EF` | bordas, divisores                                                                |
| `--brand`    | `#5B21B6` | ✅ **decidido (D9)** — acento do produto (roxo Mobills-like), sidebar ativa, CTA |
| `--positive` | `#16A34A` | valores de entrada / saldo positivo                                              |
| `--negative` | `#DC2626` | valores de saída / saldo negativo                                                |

> **`--brand` roxo** aproxima do Mobills sem colidir com nenhuma das seis categorias — que é
> exatamente o que precisamos, já que roxo no Xmind é "Resultado" e o Resultado é o coração do
> cockpit. Se isso incomodar, a alternativa é `#0F172A` (azul-tinta neutro) — decisão em `06`.

## 4. Como aplicar (regra de uso)

1. **Cor nunca é decoração — é classificação.** Se um elemento não pertence a uma categoria,
   ele é neutro.
2. **Fundo de tela é sempre `--canvas`.** Nunca pintar a tela inteira com a cor da categoria.
3. A cor aparece em: **barra/borda esquerda do card**, **ícone**, **chip de categoria**,
   **cabeçalho da seção do cockpit**, **valor** quando for total da categoria.
4. **Sinal de dinheiro tem precedência sobre categoria** em colunas de valor:
   entrada em `--positive`, saída em `--negative`. A categoria fica no chip/ícone da linha.
5. **Nunca texto branco sobre as cores `-base`** sem checar contraste. Use `-strong`.
6. Uma tela = **uma cor dominante** (a da sua categoria) + neutros. O cockpit é a exceção:
   ele mostra as seis, uma por seção.

## 5. Onde isso vive no código

Hoje o tema está em `web-vue/nuxt.config.ts` (Vuetify theme) + tokens `--pralis-*` em
`web-vue/assets/main.css`:

```
background: #f7f5f2   surface: #ffffff   primary: #c0521d   secondary: #b8480f
success: #16a34a      warning: #f59e0b   error: #ef4444     info: #0284c7
```

**Plano:** manter a mecânica (tema Vuetify + CSS vars), trocar os valores, e **adicionar a
camada `--cat-*`** que hoje não existe. O tema por empresa continua funcionando — as cores de
categoria são **fixas** (são semântica de negócio, não branding).

## 6. O que acontece com a identidade Pralis

Decisão registrada do Rodrigo: a identidade "padaria artesanal" (creme/laranja/Montserrat/logo)
**sai do primeiro plano**. O logo Pralis permanece na sidebar e no login como marca, mas o
sistema passa a ter cara de ferramenta financeira, não de padaria.

O playbook `design-system/PROJECT_BRAIN/66_PRALIS_UI_PLAYBOOK.md` continua sendo a referência de
**rigor** (responsividade, contraste, tokens, checklist) — trocamos a paleta e o conceito, não o
método. Ver `07`.
