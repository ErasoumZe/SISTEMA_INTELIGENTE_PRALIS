# Adendo — o que foi perdido em 24/07 e onde cada peça está coberta

## Inventário do que sumiu (verificado 27/07)

| Peça | Onde estava | Existe hoje? | Coberto por |
|---|---|---|---|
| Tabela **`lacres`** (numero, transferencia_id, origem, rompido) | migration 0015/0016 | ❌ 0 | ✅ **Prompt A, Etapa 1** |
| Tabela **`contas_usuarios`** (usuário ↔ contas) | migration 0015 | ❌ 0 | ✅ **Prompt A, Etapa 1** |
| **Abertura de caixa por N° de lacre** (`receberTransferenciaPorLacreRepository`) | api/caixa | ❌ | ✅ **Prompt A, Etapa 2** |
| **Confirmação de recebimento (2 pontas)** | api/transferencias | ❌ | ✅ **Prompt A, Etapa 2** |
| **`contas.saldo_inicial`** | migration 0016 | ❌ | 🔴 **NÃO coberto** → Etapa 6 abaixo |
| **Retorno automático no fechamento (B2)** — caixa fecha ZERADO | api/caixa (`gerarRetornoAutomaticoFechamento`) | ❌ | 🔴 **NÃO coberto** → Etapa 7 abaixo |
| **`TesourariaPage.vue`** (cockpit do tesoureiro) | web-vue/financeiro | ❌ | 🔴 **NÃO coberto** → Prompt C abaixo |

Sobreviveu (porque foi commitado no M2): `proximaOrdemTransferencia`, `tipo`, `ordem`,
`data_transferencia`, `vencimento`, `contabil`.

---

# ➕ ETAPAS 6 e 7 — colar no fim do PROMPT A

```
ETAPA 6 — Saldo inicial de conta
- Coluna `contas.saldo_inicial` (valor monetário, NOT NULL default '0').
- O saldo exibido de uma conta passa a ser: saldo_inicial + movimentos (entradas − saídas).
- Motivo: quando a empresa entra no sistema, as contas já têm dinheiro; sem isso o saldo nasce
  errado. É migration aditiva simples.
- Expor no cadastro de contas (leitura/escrita) e no cálculo de saldo por conta.
- Teste: conta com saldo_inicial 1000 + entrada 500 − saída 200 → saldo 1300.

ETAPA 7 — Retorno automático no fechamento (regra B2)
- Ao FECHAR o caixa: gerar automaticamente uma transferência de RETORNO (caixa → cofre) com TODO
  o dinheiro em espécie que restou, deixando o caixa ZERADO.
- Coerente com PROJECT_BRAIN/12 (fundo simples): o caixa não deve nada; ao fechar, devolve tudo.
- Reusar a criação de transferência cofre↔caixa que já existe (mesma do retorno manual do M2),
  com tipo=retorno e a próxima `ordem` (proximaOrdemTransferenciaRepository já existe).
- A conta de cofre vem de `empresas.conta_cofre_id` — se não estiver mapeada, FALHE com mensagem
  clara (nunca criar conta automaticamente).
- Lacre do retorno: opcional (D5), mas o campo deve ser aceito.
- Testes: fechar caixa com 790 em espécie → transferência de retorno de 790 criada, caixa fecha
  com saldo ZERO; fechar caixa já zerado → nenhuma transferência criada (não gerar lançamento de
  valor 0).
```

---

# PROMPT C — Tela de Tesouraria (colar depois do Prompt B)

> Era uma tela que a sessão de 24/07 tinha criado e se perdeu. É UI — roda junto/depois do shell.

```
Recrie a tela de TESOURARIA. Contexto: o tesoureiro NÃO opera caixa — ele move dinheiro entre
contas (cofre → caixas → banco) por transferência. Hoje a rota /transferencias mostra uma tabela
genérica de cadastro, que não serve para ele.

Entregas:
- Substituir a tabela genérica em /transferencias por um cockpit de tesouraria:
  · botão "Nova transferência" que NÃO depende de caixa aberto (o tesoureiro não tem caixa);
  · lista limpa das transferências do período, com origem → destino, valor, lacre, status de
    confirmação (pendente/confirmada) e data de recebimento quando houver;
  · cards de total no topo: Saída · Entrada · Saldo (padrão Mobills, cores --cat-transferencias).
- A criação/edição REUSA o modal de transferência já existente (não duplicar formulário) — apenas
  dispare os eventos de "nova"/"editar" do workspace.
- Respeitar as permissões atuais (transferencias_visualizar / _criar / _editar).
- Se o backend de confirmação (Prompt A, Etapa 2) ainda não estiver na branch, mostre a coluna de
  status como somente leitura e marque com data-pendente="regra".
- Responsivo nos breakpoints do projeto (1260/1024/768/560/390).

Branch: continue em feat/shell-mobills. NÃO MERGEAR.
```

---

## Ordem final para rodar tudo

1. **Prompt A** (com as Etapas 6 e 7 coladas no fim) → backend completo, incluindo o que se perdeu.
2. **Prompt B** → shell Mobills (menu, topbar, cards, listas).
3. **Prompt C** → tela de Tesouraria (recuperada).

Depois disso: menu por **setor** (Xmind V2) e os módulos novos (DP, fiscal, contagem, contas a pagar).

## Regra para não perder trabalho de novo

**Commitar sempre, mesmo WIP.** O que sumiu eram arquivos untracked numa árvore de trabalho que foi
descartada ao trocar de branch. Um `git add -A && git commit -m "wip"` teria salvado tudo.
