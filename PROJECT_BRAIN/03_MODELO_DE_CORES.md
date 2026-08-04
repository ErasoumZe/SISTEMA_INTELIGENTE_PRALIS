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

| Categoria                    | `--cat-*-base` | `--cat-*-soft` | `--cat-*-strong` | Uso                             |
| ---------------------------- | -------------- | -------------- | ---------------- | ------------------------------- |
| **Entradas / Vendas** 🟡     | `#B7791F`      | `#FEF6E4`      | `#8F6115`        | receita, venda, entrada         |
| **Transferências** 🟠        | `#C2410C`      | `#FFF1E8`      | `#9A3412`        | cofre ⇄ caixa, malote, lacre    |
| **Despesas** 🔴              | `#C0392B`      | `#FDECEA`      | `#96261B`        | despesa operacional             |
| **Mercadorias** 🟢           | `#15803D`      | `#E9F7EE`      | `#106430`        | compra de mercadoria, NF-e      |
| **Retiradas** 🔵             | `#1D4ED8`      | `#EAF0FE`      | `#1739A8`        | retirada de sócio, adiantamento |
| **Resultado / Diferença** 🟣 | `#6D28D9`      | `#F3EDFD`      | `#54209F`        | saldo, DRE, quebra              |
| **Contas / Cadastros** ⚫    | `#334155`      | `#F1F5F9`      | `#1E293B`        | referência, cadastro            |

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
