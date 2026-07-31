# BLOCO 6 — Seeding a partir da planilha operacional

> Substitui o S7 do sprint de 29/07, que foi construído sobre um mapa de colunas **errado**.
> Leia `PROJECT_BRAIN/17` §3 (corrigido em 30/07) e `PROJECT_BRAIN/19`. Regras: **R-111** (PARE
> antes de migration), **R-112** (PARE antes de UPDATE/DELETE em dado real), **R-110** (não mergeie).

---

## 0 · Onde o arquivo fica — e onde NÃO fica

**Caminho correto:**

```
db/planilhas/CICLUZ GP - LANÇAMENTO (VND_MER_DES_RET).xlsx
```

> ⚠️ **NÃO coloque em `web-vue/public/`.** Essa pasta é servida por HTTP: qualquer pessoa que
> abrisse o sistema poderia baixar a planilha e teria **todo o histórico financeiro da padaria** —
> vendas, despesas, folha de pagamento, saldos de conta. É vazamento de dado. Também inflaria o
> bundle de deploy em 43 MB sem nenhum motivo.

Adicione ao `.gitignore`:

```gitignore
# Planilha operacional (43 MB, dado financeiro real). Fica LOCAL — nunca versionada, nunca servida.
db/planilhas/*.xlsx
```

O script **falha com mensagem clara** se o arquivo não existir — dizendo o caminho esperado. Nada
de erro genérico de "file not found".

**Não confundir com** `CADASTRO DE PRODUTOS/tabela/CENTRAL PRODUTOS (BASE)…`, que é o cadastro de
**produtos** — outro arquivo, outra função. E a cópia dele **sem** o sufixo ` (1)` está corrompida
(`#REF!` nas abas que importam): use a com `(1)`.

---

## 1 · O mapa completo das fontes (medido em 30/07, nada pendente)

### 1.1 · Grupos de DESPESA — `(TNP) GRUPO DESPESAS`, coluna **G**

**75 grupos distintos em 1.664 lançamentos.** Todos com prefixo `DES `. Nenhum começa com `TOTAL`,
nenhum menciona sócio ou pró-labore.

Layout da aba (cabeçalho na linha 5, dados a partir da 9):

| Col | Cabeçalho | Uso no seeding |
|---|---|---|
| B | `PLANILHA` (`TNP - DES`) | filtro de empresa + domínio |
| C | `DATA REF` | — |
| F | `CONTABIL` (`DOC/F`/`DOC/NF`) | é do lançamento, não do grupo |
| **G** | `GRUPO DESPESA` | **← a fonte dos grupos** |
| H | `FORNECEDOR / COLABORADOR` | confirma o credor tipado (R-046) |
| I | `DISCRIMINAÇÃO` | — |
| J | `OBS:` | — |
| K | `VENCIMENTO` | — |

### 1.2 · Grupos de RETIRADA — `(TNP) GRUPO RETIRADAS`, coluna **G**

**3 grupos em 17 lançamentos.** Mesmo layout da aba de despesas.

```
12x  RET. SÓCIOS - RODRIGO
 4x  ⁠INVESTIMENTO - MOB./BALCÕES
 1x  ⁠INVESTIMENTO - MÁQ./EQUIP.
```

> **Investimento É retirada** (confirmado pelo José, 30/07). Comprar freezer ou balança entra como
> retirada — não despesa, não mercadoria. É por isso que a retirada se liga ao patrimônio.
> A `GRUPOSREF` col. **V** (`INVESTIMENTO - …`, 12 itens) é a lista completa de investimentos;
> use-a para completar os que ainda não apareceram em lançamento.

### 1.3 · Grupos de MERCADORIA — **atenção, é diferente**

A coluna G de `(TNP) GRUPO MERCADORIAS` tem só **dois** valores: `MER COMPUTAR` (1.562x) e
`MER NÃO COMPUTAR` (45x). **Isso é a flag `computar`, não a lista de grupos.**

O grupo da mercadoria é **por ITEM**, não por lançamento — que é como o sistema já modela
(`mercadorias_itens.grupo_mercadoria_id`). A lista vem da `GRUPOSREF`:

| Fonte | O que traz |
|---|---|
| `GRUPOSREF` col. **K** | **76 grupos** de mercadoria de **VENDA** (`MER CIGARROS - TRADICIONAIS`, …) |
| `GRUPOSREF` col. **N** | **49 grupos** de **TRANSFORMAÇÃO** |
| `GRUPOSREF` col. **L** | margem % |
| `GRUPOSREF` col. **Q/R/S** | `DOC/F` · `DOC/NF` |

Cabeçalho da aba de mercadorias (útil para o S2): `D: DATA NFE` · `E: Nº NOTA FISCAL` —
**a planilha confirma R-044 e R-045.**

### 1.4 · CONTAS — `(TNP) SALDOS CONTAS`, colunas **C** (nome) e **D** (saldo)

```
CNT CONTA - CAIXA ECONOMICA      71.865,07
CNT CONTA - COFRE PRINCIPAL      12.741,00
CNT CONTA - COFRE TROCO           8.607,80
CNT CONTA - FLUXO CAIXA           5.558,80
CNT CONTA - DIRETOR FINANCEIRO   65.874,21
```

> 🔴 **PARE e pergunte antes de usar a coluna D.** Esses são **saldos reais**, e o `saldo_inicial`
> da conta é o **FUNDO** (R-004) — o ponto de partida, não o saldo atual. Importar o saldo de hoje
> como fundo faria o sistema calcular `fundo + movimentos` e **contar o dinheiro duas vezes**.
> Provavelmente só `COFRE PRINCIPAL` e `COFRE TROCO` têm fundo de verdade. **Não decida sozinho.**

**Achado que o José precisa confirmar: existem DOIS cofres** — `COFRE PRINCIPAL` e `COFRE TROCO`.
O `PROJECT_BRAIN` sempre falou de "o cofre", no singular. Isso afeta R-001 (de qual cofre sai o
fundo do caixa?) e R-008 (para qual cofre volta o retorno?). **Pergunte antes de semear.**

O catálogo completo de contas está na `GRUPOSREF` col. **X** (33 contas) e col. **Y** (as ativas).

### 1.5 · Demais fontes

| Alvo | Aba | Colunas | Tamanho |
|---|---|---|---|
| Patrimônio (grupos + itens) | `(TNPLIHORA - EXP.) PATRIMONIO` | F grupo · G item · H TNP · I LI · J marca | 32 linhas |
| Setores / Cargos | `(TNPLIHORA - EXP.) FOLHA PAGAMENTO` | G cargo · I CBO · N descrição · P categoria · Q setor · R regime · S intervalo · T turno · U escala · V feriado | 36 linhas |
| Produtos | `CENTRAL PRODUTOS (BASE) … (1).xlsx`, aba `(TNP) CADASTRO PRODUTOS` | com código de barras | — |

---

## 2 · As três regras de importação (decisões do José, 30/07)

### 2.1 · Filtrar os totalizadores 🔴

**Descarte toda string que comece com `TOTAL `.** São linhas de soma da planilha
(`TOTAL DESPESAS VARIAVEIS`, `TOTAL CMV`, `TOTAL DESPESAS OCUPAÇÃO`…), não grupos.

Foi tratá-las como grupo-pai que criou os **8 grupos falsos de despesa + 1 de mercadoria** já
gravados no dev. **Grupo falso é pior que grupo faltando, porque ninguém desconfia dele.**

### 2.2 · Quebrar em pai e filho

`DES ⁠MANUT. EMPRESA - MAT. E PECAS MÁQ./EQUIP.` vira:

- pai: `MANUT. EMPRESA`
- filho: `MAT. E PECAS MÁQ./EQUIP.`

Usa o `grupoPaiId` que já existe no cadastro. Sem hierarquia, relatório não soma por categoria —
que é o que a planilha faz hoje.

**Cuidado com o separador:** o texto usa ` - ` **e** caracteres invisíveis (`U+2060` word-joiner)
colados nos nomes. Normalize antes de partir, e **mostre no dry-run** a árvore que saiu. Grupo sem
` - ` (ex.: `DES MAT. ESCRITÓRIO`, `DES GELO`) é grupo **sem pai** — não force hierarquia.

### 2.3 · Todos entram, os raros entram INATIVOS

Importe os **75**. Os de baixo uso entram com `ativo = false` — não aparecem no dropdown até
alguém ativar. Nada se perde e a tela fica limpa.

**Traga o corte no dry-run** (quantos usos define "raro") em vez de fixar no código. O José aprova
o número.

---

## 3 · Limpar os 8 grupos falsos já gravados 🔴 PARE

Isto é **DELETE em dado real** — R-112. Antes de apagar:

1. Mostre a **contagem** e a **amostra** do que vai sair.
2. Verifique se **algum lançamento aponta** para esses grupos.
   - Se nenhum apontar → apague.
   - Se algum apontar → **não apague**. Traga a lista e espere o José decidir para onde
     reapontar. Apagar grupo com lançamento vinculado ou quebra a FK ou órfã o lançamento.
3. Só depois de aprovado, apague — na mesma transação do relatório.

---

## 4 · O script

`db/seed-planilha.ts` (ou o `scripts/seed-planilha.ts` já iniciado — **veja qual existe antes de
criar outro**, R-117).

Requisitos:

- **Dry-run é o padrão.** Sem flag, imprime e **não grava nada**. `--apply` só depois do OK.
- **Idempotente.** Chave natural por `(empresa_id, nome)` normalizado. Rodar duas vezes não
  duplica — e prove isso rodando duas vezes no dry-run e mostrando `0 novos` na segunda.
- **Só TNP** (R-120).
- Saída do dry-run, por alvo: **quantos novos · quantos já existem · quantos ignorados (e por quê)
  · amostra de 5**.
- Reaproveite o leitor de xlsx que já existe (`db/planilha-xlsx.ts`) — não adicione dependência.
  O `exceljs` foi rejeitado em 30/07 por levar o `npm audit` de 23 para 43 vulnerabilidades.

---

## 5 · Ordem de execução

1. Confirmar que a planilha está em `db/planilhas/` e o `.gitignore` está atualizado.
2. **PARE** — perguntar ao José: os dois cofres (§1.4) e o que fazer com a coluna de saldo.
3. Dry-run completo, todos os alvos. **PARE** — mostrar os números.
4. Limpeza dos 8 grupos falsos. **PARE** — mostrar contagem e amostra.
5. Aplicar, com o José acompanhando.
6. Atualizar o status no `PROJECT_BRAIN/19` e a tabela do `20` **no mesmo commit**.

---

## 6 · Definition of Done deste bloco

- [ ] Planilha em `db/planilhas/`, `.gitignore` atualizado, script falha com mensagem clara se faltar
- [ ] Dry-run mostrando contagem, ignorados e amostra para **todos** os alvos da §1
- [ ] Filtro `TOTAL ` provado por teste
- [ ] Hierarquia pai/filho, com a árvore mostrada no dry-run
- [ ] Idempotência provada rodando duas vezes
- [ ] 8 grupos falsos limpos, com PARE antes
- [ ] Decisão dos dois cofres registrada no `19`
- [ ] `lint` + `check` + testes verdes
- [ ] **Não mergeado**
