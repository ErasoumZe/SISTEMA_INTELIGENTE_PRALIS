# 20 — Estado da entrega (onde o trabalho parou)

> Aberto em 30/07/2026, na branch `feat/backend-telas-rodrigo`.
> Existe porque o `16_DEFINITION_OF_DONE` já tem a regra certa (**R4 · commit sempre, mesmo WIP**) e
> ela foi violada: o S6 foi encontrado pela metade numa árvore de trabalho suja, sem nada dizendo o
> que estava pronto e o que faltava. Reconstruir isso lendo diff é onde nasce o retrabalho.
>
> **Não confundir com o `19_REGISTRO_DE_REGRAS`.** O `19` responde _"o que foi combinado e existe no
> código?"_ (regras `R-nnn`). Este responde _"onde a entrega parou e o que trava o próximo passo?"_
> (verticais `S`, migrations, comandos). Um não substitui o outro; entrega que muda regra atualiza
> os dois.

## Como usar (a regra que faz este arquivo valer alguma coisa)

1. **Atualizar no MESMO commit da entrega.** Documento de estado que se atualiza depois já nasce mentindo.
2. **Nada de "quase pronto".** Ou está entregue com prova (commit + teste), ou está pendente com o motivo.
3. **Parou no meio? Commit WIP** com o que falta escrito no corpo, e a linha aqui vira `PARCIAL`.
4. Isto é **status**. Decisão de negócio continua indo para os documentos numerados (16, 17, 18).

---

## 1. Mapa das verticais (S) — o que só existia no prompt

O briefing fechou as decisões **D1–D12** no `17`. A execução foi fatiada em verticais chamadas
**S1…S7** — numeração que **nunca foi escrita em lugar nenhum**, só nos prompts. É por isso que
"rodar o S7" não significa nada para quem abre o repositório. Fica registrada aqui:

| S      | O que é                                         | Spec              | Commit                |
| ------ | ----------------------------------------------- | ----------------- | --------------------- |
| **S1** | Menu "Lançamentos", "+ Novo" com 3 eixos        | `17` D6 + §4      | `f21b874`             |
| **S2** | Campos do lançamento (FOTO 2) — **nunca feito** | `17` §4, `19` §2  | **nenhum**            |
| **S3** | Discriminação: 3 níveis de desconto, rateio     | `17` §5, D4/D5/D9 | `9338d10` + `5540e5a` |
| **S4** | Conta com FUNDO + quem opera                    | `17` §2, D8       | `04aaa37`             |
| **S5** | Recorrência cria a série no salvar              | `17` D3, §6       | `2e42b41` + `96f6063` |
| **S6** | Entradas: lista completa do dia, paginada       | `17` D7           | `87ea945`             |
| **S7** | Seeding do cadastro a partir da planilha        | `17` D11 + §3     | `a4e77d5` + seed      |

> **O S2 é o buraco, e ele é o maior deles.** O `19` §2 mostra por quê: **9 dos 17 campos que o
> Rodrigo desenhou na FOTO 2 não chegam ao banco** — juros em R$ ou % (R-041), data e número do
> documento fiscal (R-044/R-045), tipo de credor e sócio/gestor (R-046/R-047), segunda foto (R-049).
> Vários já estão **na tela**, marcados `data-pendente`: aparecem, a pessoa digita, e nada salva.
> É a vertical que a spec chama de "o coração" e **não tem um único commit**.
>
> Ou seja: S3–S6 foram construídos **em cima** de um S2 que não existe. Priorizar isso antes de
> abrir o S7 é decisão sua, mas é a pergunta que este documento existe para fazer.

---

## 2. Estado por vertical

| S   | Status        | Migration | Prova                                                                 |
| --- | ------------- | --------- | --------------------------------------------------------------------- |
| S1  | ENTREGUE      | —         | `menu.test.ts`                                                        |
| S2  | **NÃO FEITO** | —         | 9 campos da FOTO 2 não persistem (`19` §2)                            |
| S3  | ENTREGUE      | 0016/0017 | testes de integração de discriminação                                 |
| S4  | ENTREGUE      | 0018      | `GET /api/contas/saldos`, tela de Contas                              |
| S5  | ENTREGUE      | **0019**  | série criada na mesma transação; **migration não aplicada** (§3)      |
| S6  | ENTREGUE      | —         | 16 testes de front (`utils/entradas.test.ts`) + 6 de integração       |
| S7  | **PARCIAL**   | —         | mapa confirmado + dry-run/ensaio verdes; `--apply` nunca rodou (§3.2) |

**Nada disso foi mergeado.** A branch inteira está à frente da `main`
(`git rev-list --count main..HEAD`) e o item 5 do DoD ("diff revisado pelo José") não foi feito.

### S6 — o que foi entregue, para não reabrir

Escopo da tela virou o **DIA**, não o caixa (`resolverEscopoEntradasDoDia`). Motivo concreto: a venda
integrada do CREARE só recebe `caixa_id` se houver caixa aberto naquele PDV no instante da venda — a
da madrugada e a de PDV sem caixa ficavam invisíveis justamente para o operador que confere o dia.
Paginação no servidor (50/página), totalizador somando o **filtro inteiro** (`meta.totalLiquido`), e
filtro de data desabilitado para quem tem `menu_entradas_somente_caixa_aberto` (o servidor força o
dia do caixa — campo visível só para a pessoa saber QUAL dia está vendo).

---

## 3. Pendências que TRAVAM (precisam do José)

### 3.1 Migration 0019 não aplicada — em lugar nenhum

`0019_recorrencia_de_lancamento.sql` **não rodou nem no dev nem em produção**. O código do S5 está na
branch e depende dela: sem `lancamentos_recorrencias`, salvar com recorrência quebra.
0016/0017/0018 foram aplicadas no dev por `psql`; **em produção, nenhuma das quatro.**

Ver `18` D-01: o dev sincroniza por `push`, não por `migrate` — o caminho de migration nunca é
exercitado antes da produção.

### 3.2 S7 — mapa confirmado, apply escrito, **aguardando o OK do José**

> Atualizado em 30/07 pela entrega do `scripts/seed-planilha.ts`.

**O diagnóstico anterior desta seção estava errado, e a causa era um bug de leitor.** O
`planilha-xlsx.ts` casava célula com a regex `<c r="…">(.*?)</c>`, que **não trata célula vazia
self-closing** (`<c r="D14" s="603"/>`). O `</c>` mais próximo era o da célula SEGUINTE: a vazia
engolia a próxima, gravava o valor na coluna errada e perdia o `t="s"` no caminho — o índice do
sharedStrings vazava como número cru (`860`, `870`, `894`). Colunas inteiras apareciam deslocadas.
Foi daí que saiu "contas em X/Y, nenhuma coluna RET, tipos de produto em V". Corrigido.

**Mapa real** (linha 5 de cada aba tem o cabeçalho; o dado começa na 11):

| Alvo           | Colunas confirmadas                                                                     |
| -------------- | --------------------------------------------------------------------------------------- |
| Despesas       | `I` nome · `H` REF (8 baldes do DRE)                                                    |
| Mercadorias    | `K` nome · `J` REF · `L` margem % · `M` tipo (VENDA/TRANSFORMAÇÃO)                      |
| Retiradas      | `V` nome · `U` REF (`RETIRADAS` \| `INVESTIMENTO INTERNO`) — inclui `RET. SÓCIOS - …`   |
| Contas         | `X` todas (33) · `W` ativa · `Y` só as ativas (21)                                      |
| Patrimônio     | `E` SIG · `F` grupo · `G` item · `H` TNP · `J` marca                                    |
| Setores/Cargos | `Q` setores · `G` cargos · `P` áreas (listas verticais independentes)                   |
| Produtos       | aba **(BASE)**, `D`=LOJAS diz de quem é. As abas `(TNP)/(LI)/(HORA)` são modelos vazios |

O `17` §3 continua desatualizado — **vale este quadro**, não o de lá.

**Três coisas que o prompt pediu e a planilha não tem** (não são falha do script):

- mercadorias `computar`/`docfnf`: `P` e `Q` são a **lista de valores possíveis** (2 linhas), não
  atributo por grupo;
- retiradas `ativa`: a coluna `ATIVA` é das **contas** — `Y` repete a conta exatamente quando
  `W=ATIVA`, 33 de 33 linhas. Retiradas têm REF, não flag;
- patrimônio: os 26 itens (TNP=SIM) **não têm coluna ligando item → grupo**, e
  `patrimonio_itens.grupo_patrimonio_id` é NOT NULL. Os 8 grupos entram; os itens não.

`margem` e `tipo` existem na planilha mas **não têm coluna em `grupos_mercadorias`** — precisariam de
migration; hoje não entram. O **REF entra como `grupo_pai_id`**, que já existe.

**Estado:** `npm run seed:planilha` (dry-run) e `-- --ensaio` (escreve tudo numa transação e dá
rollback) rodam verdes. O `--apply` existe e **nunca foi executado** — é a decisão que falta.

### 3.3 Item 5 — 3 duplicidades achadas, nenhuma corrigida

Detalhadas em `18` D-02: fechar caixa em 2 telas · modal genérico morto em `WorkspaceDialogs` ·
logout reimplementado 3×. Cada uma viola o item 2 do DoD. Não foram tocadas porque **escolher qual
caminho morre é decisão de produto**.

---

## 4. Pendências que NÃO travam

`18` D-01 (migration nunca exercitada no dev — alta) · D-02 (duplicidades) · D-03 (`format:check`
vermelho por CRLF, ruído do Windows) · D-04 (cancelar/editar série de recorrência em bloco).

---

## 5. Como validar (comandos que funcionam de verdade)

```bash
npm run build:libs                          # shared + db PRIMEIRO, senão os checks falham
npm run check --workspace @padaria/api
npm run check --workspace @padaria/web-vue  # nuxt typecheck = a verdade (o IDE mente, ver memória)
cd web-vue && npx vitest run                # 149 testes, ~20s

# integração: subconjunto, não a suíte inteira
npx vitest run --config ./vitest.config.ts --project integration tests/integration/caixa
```

**Três armadilhas conhecidas:**

- **`npm test` dá ERRO falso.** O wrapper `scripts/test.mjs` mata cada fase em 600s e a integração
  leva ~19min nesta máquina. Os testes passam; o wrapper é que desiste. Rodar subconjunto direto.
- **`npm run format:check` é vermelho no repositório inteiro** por CRLF (`18` D-03). Validar arquivo
  a arquivo: `npx prettier --check --end-of-line auto <arquivos>`.
- **A API do dev não faz hot-reload.** Mudou `api/`, `db/` ou `shared/`? Rodar
  `docker restart padaria-dev-api-1`. Já custou horas de "por que não arruma?" com o código certo.

---

## 6. Fora do sprint (não confundir com pendência)

`17` §7 congela: Transferências · Entradas (integração pronta — só a listagem D7, que é o S6) ·
Cockpit/abertura de caixa. Os 3 PNGs de marca em `web-vue/public/cicluz/` (`3ea387e`) estão
versionados mas **não referenciados por nenhum componente**, e `logo-cicluz-branca.png` é byte a byte
igual a `logo-cicluz.png` — a variante branca ainda precisa ser exportada.
