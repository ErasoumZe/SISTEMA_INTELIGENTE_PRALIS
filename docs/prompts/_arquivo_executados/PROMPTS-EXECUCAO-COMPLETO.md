# Prompts de execução — Sistema Pralis (rework por módulo)

> **Como usar:** rode UM bloco por vez no Claude Code (Opus, sessão nova, branch sem acento).
> Ao terminar e testar, marque `[x]` e vá para o próximo respeitando os **portões de dependência**.
> Onde houver migration ou mudança de fórmula de dinheiro, o agente **PARA e mostra o SQL/fórmula**
> antes de aplicar — é regra do `AGENTS.md`, não pule.
>
> Base de tudo: a pasta `PROJECT_BRAIN/` (00 a 09) e as specs em `docs/spec/`.
> Regra-mãe do rework visual: **aditivo e reversível, NUNCA toca lógica/api/banco/permissões/
> auth/seed/cálculos/rotas/dados.**

## Mapa de dependências

```
JÁ FEITO:  Vendedor · Malotes P1 · Cockpit+DRE · M1 malote/déficit(R8) · Correção de fuso · Extração Mobills

PODEM COMEÇAR JÁ (independentes):
  ├─ P1  Fase C — permissões 9 ações + usuários teste
  ├─ P2  V1 — tokens e tema (cores Mobills/planilha)   ← insumo pronto: docs/research/mobills/
  └─ P12 Correção de dado histórico do fuso            ← diagnóstico rápido, pode agora

CADEIA DO CAIXA (uma depois da outra):
  [M1 ✓] → P5  M2 transferências → P8  V4 tela transf/malote

TRILHA VISUAL:
  P2 V1 → P6 V2 componentes-base → P9 V5 lançamentos → P10 V6 resto
  (V3 cockpit já entregue — só reaplicar a paleta quando V1/V2 entrarem)

DEPOIS:
  P7  M3 ciclo de vida (usa Fase C) · P11 M4 conciliação bancária (spec-first)
```

Ordem recomendada agora: **P12 (rápido) + P1 + P2 (paralelo) → P5 → P6 → P8 → P7 → P9 → P11 → P10**.

> **Status 23/07 (madrugada):** M1 (malote/déficit) e a correção de fuso estão em `main` —
> revisados e aprovados (relatório em `docs/relatorios/RELATORIO-M1-E-FUSO-2026-07-22.pdf`).
> **Ação sua em produção TNP:** apontar `empresas.conta_cofre_id` para a conta real
> `CNT CONTA - COFRE PRINCIPAL` (o seed cria uma "Cofre" genérica só se não houver mapeamento).

---

## [ ] P0 — Merge dos PRs abertos + higiene (operacional)

Não é prompt de Claude Code. Você:
1. Revisar e mergear `feat/cockpit-caixa-dre` e `fix/malotes-excluir-e-codigo-lacre`.
2. Após o merge do vendedor: **recopiar `integracoes-scripts` no PC da loja**.
3. Reprocessar as 5 vendas com desconto negativo (514603, 521002, 523234, 523316, 524493).
4. (Higiene) Mover o projeto para fora do OneDrive/Desktop — já corrompeu `.git`.

---

## [ ] P1 — Fase C: permissões por 9 ações + usuários de teste

> Independe de tudo. Retrocompatível — produção não pode quebrar. Implementa o mapa do
> `PROJECT_BRAIN/09_AUDITORIA_PERMISSOES.md`.

```
Leia PROJECT_BRAIN/09_AUDITORIA_PERMISSOES.md (o mapa cargo×ação e as divergências P1–P6),
docs/spec/SPEC_2026_07_16_permissoes-9-acoes.md (as 9 ações e o faseamento seguro),
PROJECT_BRAIN/02_REGRAS_DE_NEGOCIO_PLANILHA.md (R7 ciclo de vida, R9 diferença, R10 responsáveis).
Implemente SOMENTE a FASE 1 (retrocompatível — nada quebra para admin/Gerência/Financeiro/
Tesouraria/Caixa). Entregas:

1. shared/src/autenticacao: adicionar os códigos que faltam por domínio de lançamento
   (despesas, mercadorias, retiradas, transferencias): *_pagar, *_efetuar, *_conferir,
   *_visualizar_dpago, *_editar_dpago, *_excluir_dpago, e *_excluir onde faltar.
   NÃO remover nenhum código atual. Documentar o de-para (criar==lancar) sem renomear.

2. db/src/referencia-permissoes.ts + seed dev (PARIDADE seed↔bootstrap): aplicar a distribuição
   do doc 09 §4:
   - Caixa: só lançar (criar), com caixa aberto. Nada de efetuar/pagar/conferir/editar/excluir.
   - Tesouraria: lançar transferência + CONFERIR.
   - Gerência: lançar, EFETUAR, editar, excluir, conferir — NÃO pagar.
   - Financeiro: ciclo completo, incluindo *_dpago (mexer em já pago).
   - Admin: tudo (via role usuario_admin — não inflar o cargo).
   Conferência = Financeiro + Gerência + Tesouraria (D7).

3. Enforcement ADITIVO (onde a ação já existe, nada muda): definir dataPagamento exige *_pagar;
   marcar efetuado exige *_efetuar; marcar conferido exige *_conferir; editar/excluir sobre
   lançamento JÁ PAGO exige a variante _dpago (checagem no service, padrão temPermissao);
   listagem esconde pagos sem *_visualizar_dpago (server-side).

4. Corrigir P2 da auditoria: hoje fechamento_com_diferenca_visualizar é só gate de menu, nenhuma
   rota valida. NÃO criar enforcement de diferença agora (isso é R9, vai no M3) — apenas deixar
   um comentário // TODO(M3) apontando para R9, sem mudar comportamento.

5. Criar os 5 usuários de teste do doc 09 §6 no seed dev (caixa/tesouraria/gerencia/financeiro/
   admin), cada um no seu cargo, senha de teste padrão do seed.

6. Matriz de testes de integração: pagar sem permissão → 403; efetuar/conferir idem; editar pago
   sem _dpago → 403, com → 200; listagem sem visualizar_dpago não traz pagos; Caixa só cria.

NÃO tocar na tela de Permissões (a grade telas×ações é a Fase 2, depois). Se algo exigir decisão
fora da spec, PARE e pergunte. Branch sem acento; lint+check+testes; push + PR.
```

**Teste seu:** logar com `caixa@teste` (tenta quitar título → 403), `financeiro@teste` (paga e
edita pago → ok), `gerencia@teste` (efetua e confere, mas pagar → 403).

---

## [ ] P2 — V1: tokens e tema (cores da planilha)

> Independe. Fundação visual. Sem tela nova.

```
Leia PROJECT_BRAIN/03_MODELO_DE_CORES.md (paleta traduzida AA-safe por categoria + neutros +
--brand=#5B21B6) e web-vue/assets/main.css + web-vue/nuxt.config.ts (tema Vuetify atual).
Regra-mãe: mudança aditiva e reversível, não toca lógica/rotas/dados. Entregas:

1. Trocar os valores do tema Vuetify (nuxt.config.ts) pelos neutros de 03 (surface/canvas/ink/
   line/positive/negative/brand). Manter a mecânica de tema por empresa.
2. Adicionar em main.css a camada de tokens de CATEGORIA que hoje NÃO existe:
   --cat-entradas-{base,soft,strong}, --cat-transferencias-*, --cat-despesas-*,
   --cat-mercadorias-*, --cat-retiradas-*, --cat-resultado-*, --cat-contas-* (valores do doc 03).
   Cores de categoria são FIXAS (semântica de negócio), não seguem o tema por empresa.
3. Trocar a fonte para uma fonte de interface (Inter) — D11.
4. Manter o logo Pralis por enquanto (D10) — só troca depois pela identidade Cicluz.
NÃO redesenhar nenhuma tela ainda. Só tokens + tema + fonte. Verificar que todas as telas atuais
continuam renderizando (screenshots antes/depois de 3 telas). Branch sem acento; lint+check+
build; push + PR.
```

**Teste seu:** abrir 3 telas e conferir que nada quebrou; as variáveis `--cat-*` existem no CSS.

---

## [ ] P3 — F1: extração do Mobills (eu faço)

Não é Claude Code — é Chrome MCP, comigo. Gera `docs/research/mobills/DESIGN_TOKENS.md`,
`BEHAVIORS.md`, `PAGE_TOPOLOGY.md` (método no `PROJECT_BRAIN/07_METODO_CLONE_UI.md`). É insumo do
V2. Me peça quando quiser que eu rode.

---

## [x] P4 — M1: malote com valor + lacre + abertura com déficit ✅ FEITO (22/07)

Entregue e aprovado (commit `a0b1a20`, em `main`). `malotes` ganharam `valor`+`status`; a abertura
com malote cria a transferência `tipo=abertura` cofre→caixa e o caixa nasce em déficit (R8, Opção
A/Lente B, `saldoCaixaCentavos` intacta). Revisão completa no relatório
`docs/relatorios/RELATORIO-M1-E-FUSO-2026-07-22.pdf`.

---

## [x] P12 — Correção de dado histórico do fuso ✅ FEITO (23/07) — 0 a corrigir

> Diagnóstico rodado em produção (terminal Coolify do serviço api): **`TOTAL ... : 0`, histórico
> limpo**. Nenhum caixa com `data_movimento` no dia errado. Nada a corrigir — item encerrado.
> (Bloco de diagnóstico abaixo mantido para referência.)

```
O commit fc39e34 corrigiu a derivação de dia contábil (diaNegocio, America/Sao_Paulo). Verifique se
há DADO HISTÓRICO já gravado errado pelo bug antigo. NÃO altere nada sem me mostrar primeiro.
1. Rode e me mostre contagem + amostra: fechamentos_caixa onde data_movimento <>
   diaNegocio(data_hora_abertura) — caixas cuja data contábil ficou no dia errado (janela ~21h–24h).
2. PARE e me mostre. Só após eu aprovar, gere o UPDATE pontual (como as 24 vendas do bug anterior),
   idempotente e com WHERE preciso. Se a contagem for 0, encerre com esse relato.
```

**Teste seu:** contagem fecha (0 = limpo; >0 = corrigido e reconferido).

---

## [ ] P5 — M2: transferências completas (datas + agrupamento + retorno)

> **Portão: M1 já mergeado ✅.** Estado real do schema (pós-M1) — reaproveitar, NÃO recriar:
> `transferencias.tipo` (abertura|suprimento|sangria|retorno, default 'suprimento') **já existe**;
> `fechamentos_caixa` já tem `malote_abertura_id`, `lacre_abertura`, `divida_cofre`; a transferência
> `tipo=abertura` **já é criada na abertura do caixa**.

```
Leia PROJECT_BRAIN/02 (R3 caixa fecha em zero, R4 sangria=retorno, R6 N movimentos/dia),
docs/spec/SPEC_transferencias-rascunho-rodrigo.md e o schema atual. O campo tipo e a transferência
de abertura JÁ EXISTEM (M1) — reutilize, não recrie. PARE e mostre o SQL antes de aplicar. Entregas:

1. Migration aditiva em transferencias: acrescentar dataTransferencia (data real do movimento,
   separada de dataReferencia/criadoEm), vencimento e contabil; e um vínculo/ordinal por caixa+dia
   para agrupar 1a/2a/3a/4a (referência ao fechamento_caixa). Linhas existentes: defaults coerentes,
   sem backfill destrutivo.
2. api: no FECHAMENTO, PROPOR automaticamente a transferência de RETORNO (caixa→cofre) pelo valor da
   sobra em espécie (R3), com lacre novo (opcional, D5) — o operador confirma. Sangria = mesma
   entidade, tipo=sangria, durante o turno (R4).
3. ATENÇÃO à fórmula do déficit (nota do relatório M1): saldoProprioCentavos hoje pressupõe que o
   único fundo emprestado no saldo é a transferência de abertura (== divida_cofre). Ao introduzir
   sangria/retorno (que mexem em transferenciasSaida/Entrada durante o dia), REVISE saldoProprio
   para não descontar a dívida em dobro. Cubra com teste unitário. Se exigir decisão de fórmula,
   PARE e pergunte.
4. Consultas: agregar por caixa+dia — 1a/2a/3a transferência, TOTAL SAÍDA, TOTAL ENTRADA, SALDO
   (como a aba TRANSFERÊNCIAS da planilha).
5. Testes: dia com N suprimentos + N retornos agrupados; totais corretos; retorno proposto pela
   sobra; saldoProprio correto após sangria/retorno.

Fora de escopo: a TELA nova (V4). Branch sem acento; lint+check+testes; PARE no SQL; push + PR.
```

**Teste seu:** num caixa de teste, 2 suprimentos + 1 sangria, fechar e ver o retorno proposto pela
sobra; conferir os totais agrupados e o "déficit a quitar" batendo após a sangria.

---

## [ ] P6 — V2: componentes-base compartilhados

> **Portão: depois de V1 (P2).** Usa os insumos do Mobills (P3) se já existirem.

```
Leia PROJECT_BRAIN/04_UX_MOBILLS.md (formulário de lançamento, saldo atual×previsto, lista de
transações) e docs/research/mobills/* (se existir). Regra-mãe: aditivo, não toca lógica.
Crie componentes Vue compartilhados, cada um com página de demo e QA visual contra o Mobills:
1. ValorHeroi — campo de valor grande, formatação automática, cor pelo tipo.
2. AtalhosData — Hoje | Ontem | Outros (casando com DATA REF).
3. ChipCategoria — chip colorido pela categoria (tokens --cat-* do V1).
4. CardConta — mostra saldo ATUAL e PREVISTO (R2/D-pago).
5. LinhaTransacao — linha de lista densa (situação/data/descrição/categoria/conta/valor/ações).
6. SecaoColapsavelCategoria — painel colapsável com total no header, na cor da categoria.
Sem alterar telas existentes ainda. Cada componente ≤ ~150 linhas de spec. Branch sem acento;
lint+check+testes de front; push + PR.
```

**Teste seu:** abrir a página de demo e comparar cada componente com o print do Mobills.

---

## [ ] P7 — M3: ciclo de vida do lançamento + diferença (R9)

> **Portão: depois da Fase C (P1).** Usa as ações criadas lá.

```
Leia PROJECT_BRAIN/02 (R7 ciclo de vida, R9 lançar com diferença, R10 responsáveis),
PROJECT_BRAIN/09 (matriz de ações). PARE e mostre o SQL antes de aplicar. Entregas:
1. Migration aditiva nos lançamentos (despesas/mercadorias/retiradas/transferencias): campos
   efetuado(V), efetuadoPor, conferido(CONF), conferidoPor, diferencaLancamento, ocorrencias,
   juros (separado do valorOriginal), contabil. Nada removido.
2. api: estados lançado→efetuado→pago→conferido, cada transição gravando o usuário responsável e
   exigindo a permissão da Fase C (efetuar=Gerência, pagar=Financeiro, conferir=Fin+Ger+Tes).
   VALOR TOTAL = valorOriginal + juros (seguir a planilha, D4).
3. R9 — lançar com diferença: se diferencaLancamento ≠ 0, o service registra o usuário que lançou
   e dispara notificação para Tesoureiro/Gerente/Financeiro/Admin (reusar o canal de e-mail/alerta
   existente). A confirmação "quer lançar assim mesmo?" é da TELA (V5) — aqui garanta o backend
   que aceita o flag confirmado e persiste o responsável. Não bloqueia.
4. Saldo previsto × realizado (R2) nas listagens financeiras (a coluna já-pago vs a-pagar).
5. Testes: matriz de permissões por transição; diferença gravando responsável + disparando
   notificação; VALOR TOTAL com juros.
Branch sem acento; lint+check+testes; PARE no SQL; push + PR.
```

**Teste seu:** efetuar com Gerência (ok) e com Caixa (403); pagar com Financeiro (ok) e Gerência
(403); lançar com diferença e ver a notificação + o responsável gravado.

---

## [ ] P8 — V4: tela de Transferências + Malotes (Mobills + rascunho do Rodrigo)

> **Portão: só depois de M1 (P4) e M2 (P5) mergeados.** Usa os componentes do V2.

```
Leia PROJECT_BRAIN/04_UX_MOBILLS.md §6 e §7 (a tela alvo de transferência e de malote),
docs/spec/SPEC_malotes-lacres-caixa.md, e reutilize os componentes do V2 (ValorHeroi, AtalhosData,
ChipCategoria...). Regra-mãe: aditivo, a lógica já existe (M1/M2) — aqui é só UI. Entregas:
1. Tela de Transferência: valor herói LARANJA (cor da categoria), tipo do movimento
   (abertura/suprimento/sangria/retorno), origem/destino, LACRE (opcional), descrição obrigatória
   (corrige o defeito do Mobills), duas datas (criação automática + transferência manual), e o
   bloco "Movimentos do dia neste caixa" com 1ª/2ª/… + TOTAL SAÍDA/ENTRADA/SALDO.
2. Tela de Malotes: o LACRE é o herói (não código), valor + status do malote, histórico de uso
   (qual caixa/dia/movimento). Garantir que não há botão Editar duplicado.
3. Salvar-e-criar-nova nos dois. QA visual contra o Mobills (1440 e 390).
Sem tocar em backend além do que M1/M2 já expõem. Branch sem acento; lint+check+testes de front;
push + PR.
```

**Teste seu:** repetir a simulação do dia de caixa (a do `docs/spec/SIMULACAO_dia-de-caixa-
mobills.md`) DENTRO do sistema e bater os saldos.

---

## [ ] P9 — V5: telas de lançamento (despesas/mercadorias/retiradas/entradas)

> **Portão: depois de V2 (P6). Melhor ainda depois de M3 (P7)** para já mostrar o ciclo de vida.

```
Leia PROJECT_BRAIN/04_UX_MOBILLS.md (formulário) e reutilize os componentes do V2. Regra-mãe:
aditivo. Entregas: refazer as telas de despesas, mercadorias, retiradas e entradas com o
formulário estilo Mobills — valor herói na cor da categoria, atalhos de data, categoria/conta,
"mais detalhes" recolhido, salvar-e-criar-nova. Mostrar o estado do ciclo de vida (lançado/
efetuado/pago/conferido) e saldo previsto×realizado se M3 já estiver mergeado. Entradas é leitura
(venda só por integração). QA visual 1440/390. Branch sem acento; lint+check+testes; push + PR.
```

**Teste seu:** lançar 10 despesas em sequência sem fricção; conferir cor da categoria e o estado.

---

## [ ] P10 — V6: resto das telas (relatórios, cadastros, placeholders)

> **Portão: por último, por prioridade.** Um PR pequeno por tela ou grupo de telas afins.

```
Aplicar o padrão visual (tokens V1 + componentes V2) às telas restantes por prioridade:
relatórios (vendas, produtos, DRE), cadastros, e as telas placeholder que ganharem conteúdo.
Uma tela (ou grupo afim) por PR. Regra-mãe: aditivo, não toca lógica. QA visual 1440/390 em cada.
Branch sem acento; lint+check+testes; push + PR.
```

---

## [ ] P11 — M4: conciliação bancária (spec-first)

> **Portão: depois de M3 (o ciclo de vida existe). D13: fazer sem afetar o que funciona.**

**Passo A — spec (rode primeiro):**
```
Leia PROJECT_BRAIN/02 §8 (CONFRONTAR EXTRATO / FLAGS / EXTRATOS_CAIXA_ECONOMICA da planilha) e o
Xmind. Escreva docs/spec/SPEC_conciliacao-bancaria.md: importar extrato (.RET/OFX da Caixa
Econômica) → confrontar com lançamentos → gerar CONF, DIF. LANÇ, OCORRÊNCIAS. Liste as DECISÕES
de negócio para o Rodrigo. NÃO escreva código nem migration.
```
**Passo B — implementação (só após aprovar a spec):**
```
Implemente docs/spec/SPEC_conciliacao-bancaria.md. PARE e mostre o SQL da migration antes de
aplicar. Backend + tela de conciliação. Testes cobrindo um extrato conciliado com divergências
listadas. Branch sem acento; lint+check+testes; push + PR.
```

---

## Lembretes permanentes

- **Um prompt por vez.** Não rodar em paralelo dois que toquem os mesmos arquivos (M1/M2/V4 tocam
  caixa/transferências; V1/V2 tocam tema/componentes).
- **Migration ou fórmula de dinheiro → o agente PARA e mostra** antes de aplicar. Me manda o que
  ele propôs (principalmente a fórmula de saldo do M1) que eu reviso.
- **Cada bloco = um PR pequeno**, CI verde, validação manual antes de avançar.
- Depois de cada merge que envolva o agente de integração, **recopiar `integracoes-scripts` no PC
  da loja**.
