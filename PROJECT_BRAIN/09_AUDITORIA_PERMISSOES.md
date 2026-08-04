# 09 — Auditoria de permissões por cargo (T-PERM)

> Executada 22/07 cruzando: catálogo de código (`shared/src/autenticacao/index.ts`, 210+
> permissões), distribuição por cargo (`db/src/referencia-permissoes.ts`), regras da planilha
> (`02` — ciclo de vida R7/R10) e o modelo de 9 ações do Xmind
> (`docs/spec/SPEC_2026_07_16_permissoes-9-acoes.md`).
> Responde à tarefa aberta em D6.

## 1. Como o modelo funciona hoje (verificado no código)

- **Resolução em 3 camadas:** setor → cargos → usuário. Cada camada é um `RegrasPermissoes`
  (jsonb) que permite/nega; a última decisão vence. `usuario_admin` (role) faz short-circuit para
  **todas** as permissões — é assim que o Diretor Geral / admin tem tudo, sem listar na tela.
- **Acesso por tela:** `ativas: [tela]` concede só `*_visualizar` + `menu_*_mostrar`. Ações de
  escrita (`criar/editar/excluir/discriminar/aprovar`) têm que estar em `extras` — é explícito,
  nada é implícito.
- **Ações existentes por domínio de lançamento:** `visualizar, criar, editar, excluir`
  (+`discriminar` em despesas/mercadorias, +`aprovar` em mercadorias/pedidos).

## 2. Cargos existentes (10 + admin por role)

| Cargo                    | Foco atual                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Caixa**                | opera o caixa; cria (não edita/exclui) entradas, transferências, despesas, mercadorias, retiradas; só com caixa aberto                                  |
| **Tesouraria**           | malotes + transferências (cria malote, cria transferência)                                                                                              |
| **Gerencia**             | tudo do caixa + gerencia caixas, altera horário, aprova NF-e/pedidos, edita lançamentos, turnos                                                         |
| **Financeiro**           | relatório de vendas, NF-e, contas a pagar, transferências/despesas/mercadorias/retiradas (cria+edita+discrimina), grupos, PDV, formas de pagamento, DRE |
| **Compras**              | pedidos, mercadorias, fornecedores, produtos                                                                                                            |
| **DP**                   | despesas, colaboradores, folha/ponto                                                                                                                    |
| **RH**                   | avaliações                                                                                                                                              |
| **Fiscal**               | relatório fiscal, produtos fiscais                                                                                                                      |
| **Diretor de Operacoes** | DRE, patrimônio, ficha técnica, ingredientes (leitura)                                                                                                  |
| **Diretor Geral**        | vazio no cargo — acesso total vem do role `usuario_admin`                                                                                               |

## 3. Achado central: o ciclo de vida NÃO é representável hoje

A planilha e o Xmind exigem quatro estágios com responsáveis distintos (R7/R10):

```
LANÇAR  →  EFETUAR (V)  →  PAGAR (DATA PG)  →  CONFERIR (CONF)
```

**O catálogo de permissões atual não tem as ações `pagar`, `efetuar` nem `conferir`, nem as
variantes `*_dpago`.** Ou seja: hoje é **impossível** dizer no sistema "fulano pode pagar mas não
conferir" ou "ninguém edita lançamento já pago". Todo o ciclo colapsa em `criar/editar/excluir`.

→ Este é exatamente o escopo da **Fase C / SPEC_2026_07_16_permissoes-9-acoes.md**, que fica
**confirmada como pré-requisito de R10**. A auditoria não "conserta" isso com re-seed — precisa da
migration de catálogo (M3/Fase C). O que a auditoria entrega é **o mapa de quem faz o quê**, que
alimenta essa fase.

## 4. Mapa alvo — quem faz cada estágio (por domínio de lançamento)

> Baseado na lógica da planilha + D7 (conferência). Vira a distribuição-alvo quando as ações
> novas existirem. ✔ = tem; — = não tem; (a) = via aprovação.

### Lançamentos financeiros (Despesas 🔴, Mercadorias 🟢, Retiradas 🔵, Transferências 🟠)

| Cargo          |    Lançar    | Efetuar | Pagar | Conferir |   Editar    | Editar D/Pago | Excluir | Excluir D/Pago |
| -------------- | :----------: | :-----: | :---: | :------: | :---------: | :-----------: | :-----: | :------------: |
| **Caixa**      | ✔ (no caixa) |    —    |   —   |    —     |      —      |       —       |    —    |       —        |
| **Tesouraria** | ✔ (transf.)  |    —    |   —   |    ✔     | ✔ (transf.) |       —       |    —    |       —        |
| **Gerencia**   |      ✔       |    ✔    |   —   |    ✔     |      ✔      |       —       |    ✔    |       —        |
| **Financeiro** |      ✔       |    ✔    |   ✔   |    ✔     |      ✔      |       ✔       |    ✔    |       ✔        |
| **Admin**      |      ✔       |    ✔    |   ✔   |    ✔     |      ✔      |       ✔       |    ✔    |       ✔        |
| demais         |      —       |    —    |   —   |    —     |      —      |       —       |    —    |       —        |

Regras que sustentam o mapa:

- **Pagar** (preencher `DATA PG`) é ação do **Financeiro** (e admin). Gerência não paga por padrão.
- **Conferir** (`CONF`) = **Financeiro, Gerência e Tesouraria** (D7 — a planilha não nomeia um
  único responsável).
- **`*_dpago`** (mexer em lançamento já pago) só **Financeiro + admin** — é o ponto sensível.
- **Caixa** só **lança** (e só com caixa aberto). Nunca efetua, paga, edita ou exclui.

### Entradas 🟡

Só integração (venda). Ninguém "cria" manualmente; leitura para Caixa/Gerência/Financeiro. Sem
`pagar`/`discriminar` (não se aplicam) — já está correto no catálogo.

## 5. Divergências encontradas (código × alvo)

| #   | Divergência                                                                                                                                       | Gravidade | Ação                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------ |
| P1  | Não existem `*_pagar`, `*_efetuar`, `*_conferir`, `*_*_dpago` no catálogo                                                                         | ALTA      | criar na Fase C/M3 (migration de catálogo)                                           |
| P2  | `fechamento_com_diferenca_visualizar` é só gate de menu — **nenhuma rota valida** (comentário no próprio código)                                  | MÉDIA     | ao implementar R9 (lançar com diferença), criar enforcement real                     |
| P3  | **Tesouraria** não tem `conferir` (não existe a ação) nem participa do fluxo malote↔caixa do R8                                                   | MÉDIA     | incluir na Fase C + no M1 (malote/déficit)                                           |
| P4  | Nenhum cargo tem permissão de **notificação de diferença** (R9/D8)                                                                                | MÉDIA     | criar `fechamento_diferenca_notificar` (ou reusar papéis) p/ Tesour./Ger./Fin./Admin |
| P5  | `Diretor de Operacoes` e `Diretor Geral` — papéis de leitura/ą total, ok, mas convém validar com Rodrigo se "Diretor Geral = admin" é intencional | BAIXA     | confirmar (já documentado como decisão de negócio no código)                         |
| P6  | Ações de escrita concedidas por `extras` soltos — funciona, mas dificulta auditar                                                                 | BAIXA     | quando a grade 9 ações (Fase 2 da spec) existir, a tela telas×ações resolve          |

**Boa notícia:** a distribuição de **acesso** (quem vê o quê) está coerente e bem pensada. O
problema não é "cargo errado vendo tela errada" — é **falta de granularidade de ação** para
expressar o ciclo de vida. Não há bug de vazamento de permissão aparente.

## 6. Usuários de teste — um por cargo (D6)

Criar em ambiente de teste (nunca com senha real no doc). Sugestão de matriz de validação:

| Usuário            | Cargo        | Deve conseguir                                                    | NÃO deve conseguir                          |
| ------------------ | ------------ | ----------------------------------------------------------------- | ------------------------------------------- |
| `caixa@teste`      | Caixa        | abrir caixa, lançar despesa com caixa aberto                      | pagar, conferir, editar lançamento, ver DRE |
| `tesouraria@teste` | Tesouraria   | criar malote, criar transferência, conferir                       | pagar despesa, gerenciar caixas             |
| `gerencia@teste`   | Gerencia     | auditar qualquer caixa, aprovar NF-e, editar lançamento, conferir | pagar (D/Pago), excluir pago                |
| `financeiro@teste` | Financeiro   | pagar, conferir, editar/excluir pago, DRE                         | gerenciar turnos/caixas operacionais        |
| `admin@teste`      | (role admin) | tudo                                                              | —                                           |

> Enquanto as ações `pagar/conferir/dpago` não existirem (P1), a coluna "deve conseguir" que as
> menciona fica pendente da Fase C. Os testes de **acesso** (ver tela X, não ver tela Y) podem
> rodar já.

## 7. Recomendação de sequência

1. **Agora (sem código):** este mapa (§4) validado por você/Rodrigo é a especificação da
   distribuição-alvo.
2. **Fase C / M3:** criar as ações do ciclo de vida (`pagar`, `conferir`, `*_dpago`,
   `fechamento_diferenca_notificar`) no catálogo + enforcement, e aplicar a distribuição do §4 na
   `referencia-permissoes.ts` (mantendo paridade seed dev ↔ bootstrap prod).
3. **Criar os 5 usuários de teste** (§6) no seed dev e rodar a matriz de validação.
4. Só o **admin** com todas — mantido pelo role `usuario_admin`, sem inflar a tela de cargo.

## 8. Efetuar × Pagar — RESPONDIDO (Rodrigo, 22/07)

✅ **Não colapsar.** Os estágios ficam separados: **Gerência efetua (V)**, **Financeiro paga
(DATA PG)**. O mapa do §4 está confirmado como está. Cada um dos quatro estágios
(lançar/efetuar/pagar/conferir) tem seu responsável distinto.
