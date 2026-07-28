# 08 — Plano de ação

> Base: decisões do Rodrigo em 22/07 (D2, D6, D9, D12 — ver `06`). Estratégia: **por módulo**,
> com o sistema em produção. Duas trilhas correm em paralelo sem se cruzar:
> **Trilha M (Modelo/negócio)** = migrations + regras; **Trilha V (Visual)** = rework de UI.
> Regra-mãe: V é aditivo e reversível, **nunca** toca lógica; M mexe em dado, com migration+testes.

## Sequência-mestra

```
FUNDAÇÃO (F) ─┬─ Trilha M ─ M1 malote/déficit → M2 transferências → M3 ciclo de vida → M4 conciliação
              └─ Trilha V ─ V1 tokens → V2 componentes-base → V3 caixa → V4 transf/malote → V5 lançamentos → V6 resto
```

M2 depende de M1. V4 depende de M1+M2 (a tela nova precisa do modelo novo). O resto de V é
independente de M e pode começar já.

---

## FASE F — Fundação (pré-requisito de tudo)

**F0. Higiene (fazer antes de qualquer código).**

- Mover o projeto para fora do OneDrive/Desktop (já corrompeu `.git`).
- Confirmar CI verde e branch limpa.

**F1. Extração do Mobills (Chrome MCP).**
Capturar tokens reais, comportamentos e topologia das telas: Dashboard, Contas, Transações,
formulários (Despesa, Receita, Transferência). Saída em `docs/research/mobills/`
(`DESIGN_TOKENS.md`, `BEHAVIORS.md`, `PAGE_TOPOLOGY.md`). Método em `07`.

**F2. Instalar a skill de clone.**
Copiar e adaptar `clone-website` ao stack Vue/Vuetify (ver `07` §4 e §6).

Gate: docs de extração revisados por você.

---

## TRILHA V — Rework visual (por módulo)

> Cada módulo é um conjunto de PRs pequenos (uma spec por componente). Ordem de valor.

**V1. Tokens e tema.** Trocar valores do tema Vuetify (`nuxt.config.ts`) pelos neutros de `03`;
adicionar a camada `--cat-*` em `main.css`; `--brand = #5B21B6`; decidir fonte (D11 — sugerir
Inter). Zero tela nova. Gate: build verde, telas existentes não quebram.

**V2. Componentes-base compartilhados.** `ValorHeroi`, `AtalhosData` (Hoje/Ontem/Outros),
`ChipCategoria`, `CardConta` (saldo atual × previsto), `LinhaTransacao`, `SecaoColapsavelCategoria`.
Cada um com spec + QA visual contra o Mobills. Gate: storybook/página de demo aprovada.

**V3. Módulo Caixa / Cockpit** _(maior valor — Prioridade 1 do Xmind)._ ✅ **ENTREGUE 22/07**
(PR `feat/cockpit-caixa-dre`, aguardando merge). 6 seções coloridas + DRE já funcionam.
**Resta:** quando V1/V2 entrarem, aplicar por cima a **paleta traduzida de `03`** (o cockpit hoje
usa as cores diretas do Xmind, que reprovam contraste). Gate: já validado (120+242 testes verdes).

**V4. Módulo Transferências + Malotes** _(depende de M1+M2)._
Tela de transferência = fusão Mobills + rascunho do Rodrigo (`04` §6): valor herói laranja,
tipo do movimento, origem/destino, lacre, agrupamento por caixa+dia, totais. Tela de malote com
lacre em destaque (`04` §7), remover EDITAR duplicado. Gate: simular o dia de caixa (o mesmo da
simulação Mobills) dentro do sistema e bater os saldos.

**V5. Módulo Lançamentos.** Despesas, mercadorias, retiradas, entradas com o formulário Mobills
(valor herói, atalhos de data, salvar-e-criar-nova, mais-detalhes recolhido) + cor da categoria.
Gate: lançar 10 despesas em sequência sem fricção.

**V6. Resto.** Relatórios, cadastros, telas placeholder que ganharem conteúdo. Por prioridade.

---

## TRILHA M — Modelo e regras de negócio

> Cada item: spec → migration (PARAR e mostrar SQL) → api → testes de integração. Aditivo.

**M1. Malote com valor + déficit do caixa (R8, D2).** _A fundação do fluxo real._

- `malotes`: adicionar `valor` e `status` (`disponivel|em_uso|devolvido`).
- Abertura do caixa: selecionar malote disponível → cria transferência `tipo=abertura`
  automática (cofre → caixa), vincula `malote_id`+`lacre` ao `fechamento_caixa`, e **inicia o
  caixa em déficit** (dívida = valor do malote).
- Saldo do caixa passa a considerar a dívida do malote sendo quitada pelas vendas em dinheiro.
- Testes: abrir com malote de R$490 → caixa nasce −490; após R$490 em dinheiro → dívida zerada.
  Gate: você valida o comportamento de déficit num caixa de teste.

**M2. Transferências completas (R4, R6; depende de M1).**

- `transferencias`: `tipo` (`abertura|suprimento|sangria|retorno`), `dataTransferencia`,
  `vencimento`, `contabil`; agrupamento por caixa+dia (ordinal); manter `contaOrigem/Destino`.
- Fechamento propõe automaticamente a transferência de retorno pela sobra (R3, G6).
  Gate: um dia com N suprimentos e N retornos agrupados, totais entrada/saída/saldo corretos.

**M3. Ciclo de vida do lançamento (R7, R9, R10, D6/D7/D8 — igual planilha/Xmind).**

- Campos `efetuado (V)`, `conferido (CONF)`, `diferencaLancamento`, `ocorrencias`, `juros`,
  `contabil` nos lançamentos.
- Estados `lançado → efetuado → pago → conferido`, **cada um com responsável registrado**;
  saldo previsto × realizado (R2, G5) em toda listagem financeira.
- **Lançar com diferença (R9, D8):** modal "quer lançar assim mesmo?" → salva com o usuário +
  notifica Tesoureiro/Gerente/Financeiro/Admin.
- Amarra com **Fase C** do plano ABCD existente (permissões 9 ações: `*_pagar`, `*_dpago`).
  Gate: matriz de permissões (pagar/editar-pago) + saldo previsto batendo + fluxo de diferença.

**T-PERM. Auditoria de permissões por cargo (R10, D6/D7).** _Pode rodar já — independe de M1/M2._

- Ler a planilha (abas de referência: `FOLHA PAGAMENTO`, `GRUPOSREF`) e o Xmind para levantar os
  **cargos** e **quem faz o quê** (lança / efetua / paga / confere) por módulo.
- Comparar com o catálogo atual (`shared/src/autenticacao`, `referencia-permissoes.ts`) e a
  distribuição real por cargo.
- Se houver divergência: corrigir a distribuição e **criar um usuário de cada cargo** com as
  permissões pertinentes (seed dev + bootstrap). **Só admin com tudo.**
- Conferência: se planilha/Xmind não nomear responsável, `CONFERIDO` = Financeiro + Gerência +
  Tesouraria (D7).
  Gate: matriz cargo × ação revisada por você; um login de teste por cargo mostrando só o que deve.

**M4. Conciliação bancária (G8; se D13 = entra no v1.0).**

- Importar extrato (`.RET`/OFX da Caixa Econômica) → confrontar com lançamentos → `CONF`,
  `DIF. LANÇ`, `OCORRÊNCIAS` (as abas CONFRONTAR/FLAGS da planilha).
  Gate: um extrato real conciliado, divergências listadas.

---

## Marco "v1.0 padaria"

`F + V1..V5 + M1..M3` = caixa/cockpit com cara de Mobills, cores da planilha, transferências e
malotes no fluxo real (com déficit), lançamentos com ciclo de vida completo e permissões finas.
`M4` (conciliação bancária) e `V6` entram conforme D13/D14.

## Ordem prática recomendada para a próxima semana

0. **Mergear os 2 PRs abertos** (cockpit, malotes hotfix) + recopiar o agente no PC da loja.
1. **F0 + F1** (higiene + extração Mobills) — meio dia.
2. **T-PERM** (auditoria de permissões) — independe de tudo, alto valor, destrava M3.
3. **M1** (malote/déficit) em paralelo com **V1+V2** (tokens + componentes-base).
4. **V3 já entregue** — só falta reaplicar a paleta de `03` quando V1/V2 entrarem.
5. **M2** (transferências) → depois **V4** (transf/malote), só com M1+M2 verdes.

## Todas as decisões foram respondidas (22/07)

D1–D14 fechadas — ver `06`. Nada trava o plano. Trabalho futuro registrado, fora do v1.0:

- **Identidade visual Cicluz** (D10) — troca o logo Pralis quando a marca definitiva existir.
- **LI e HORA** (D14) — cadastro + integração quando o Rodrigo pedir (é operação, sistema já é multi-tenant).
