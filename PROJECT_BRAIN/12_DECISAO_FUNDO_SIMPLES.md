# 12 — Decisão 24/07: fundo simples (o déficit foi revogado)

> **"Agora é fundo mesmo"** — José, 24/07. Registro da decisão + o que precisa sair do código.
> Substitui a R8 de 22/07 (ver `02`, R8-v2).

## A decisão

O malote/transferência que vai do cofre ao caixa é **FUNDO DE TROCO**, não empréstimo.
O caixa **não nasce devendo**. Não há "déficit a quitar". No fechamento, o dinheiro volta ao
cofre e o caixa **fecha zerado** (retorno automático B2).

## Por que isso é bom

Simplifica de verdade: volta a existir **um único número** — o saldo físico do caixa
(`saldoCaixaCentavos`, ADR-001, que nunca foi tocado). Some a segunda contabilidade paralela que
o M1 criou, e some o risco de duplo desconto que tivemos que corrigir no M2. Menos conceito na
tela do operador (era o meu receio de UX: número negativo confunde).

## O que vira código morto (remover)

Levantado no código em 24/07 — 5 arquivos de código + 3 de teste:

| Onde                                                    | O que sai                                          |
| ------------------------------------------------------- | -------------------------------------------------- |
| `db/src/schema/app.schema.ts`                           | coluna `fechamentos_caixa.divida_cofre`            |
| `shared/src/caixa/regras.ts`                            | função `saldoProprioCentavos` (inteira)            |
| `shared/src/caixa/index.ts`                             | `dividaCofre`/`saldoProprio` no contrato do resumo |
| `api/src/caixa/caixa.repository.ts`                     | gravação/leitura de `dividaCofre`                  |
| `api/src/caixa/caixa.service.ts`                        | cálculo do saldo próprio / passagem da dívida      |
| `tests/unit/caixa-regras.test.ts`                       | casos de déficit (−490 → 0)                        |
| `tests/integration/caixa/caixa-abertura-malote.test.ts` | asserts de dívida                                  |
| `tests/integration/caixa/caixa-retorno-sangria.test.ts` | assert de "sangria não desconta dívida"            |

**Migration:** a coluna `divida_cofre` pode ser mantida como legado (nullable/default 0, ignorada)
OU removida. Recomendo **manter e parar de escrever** — remover coluna em produção é risco sem
ganho; só deixar de usar e documentar como legado.

## O que a UI perde

- O card **"Déficit a quitar (malote)"** do mockup do cockpit → **sai**.
- O cockpit passa a mostrar só **"Dinheiro no caixa"** (saldo físico) + as 6 categorias.
- A tela de Transferência não mostra mais "déficit a quitar ao abrir o caixa".

## Prompt de limpeza (rodar quando a sessão atual do Claude Code terminar)

```
A regra R8 (caixa nasce em déficit / dívida com o cofre) foi REVOGADA em 24/07 — agora o malote é
FUNDO SIMPLES (ver PROJECT_BRAIN/02 R8-v2 e PROJECT_BRAIN/12). Remova o conceito de dívida/déficit
do código, sem tocar na fórmula canônica saldoCaixaCentavos (ADR-001), que continua sendo a verdade:

1. shared/src/caixa/regras.ts: remover saldoProprioCentavos (e seus testes unitários).
2. shared/src/caixa/index.ts: remover dividaCofre/saldoProprio do contrato de resumo/status.
3. api/src/caixa: parar de calcular/gravar/expor dividaCofre; a abertura credita o valor como
   entrada normal (transferência cofre→caixa) e ponto.
4. db: MANTER a coluna fechamentos_caixa.divida_cofre como LEGADO (não remover em produção), mas
   parar de escrever nela; comentar no schema que é legado da R8 revogada.
5. Testes: remover/ajustar os casos de déficit em tests/unit/caixa-regras.test.ts e
   tests/integration/caixa/caixa-abertura-malote.test.ts e caixa-retorno-sangria.test.ts —
   substituindo por: abrir com fundo 490 → saldo 490; vender 300 → 790; fechar → retorno
   automático de 790 e caixa ZERADO.
6. web-vue: tirar qualquer "déficit a quitar" da UI.

Não mexer em permissões, integrações nem em outras regras. Branch sem acento; lint+check+test;
push + PR.
```

## Impacto no restante do brain

- `04_UX_MOBILLS.md` §6 (tela de transferência) — tirar a linha do déficit.
- Mockups (`docs/mockups/`) — o card "Déficit a quitar" sai do cockpit e da transferência.
- `docs/prompts/M2.1-deficit-suprimento-sangria.md` — **fica obsoleto** (era sobre a dívida crescer
  com suprimento). Pode ser descartado.
