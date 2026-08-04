# 06 — Gaps e decisões pendentes

## 1. Gaps estruturais (planilha × sistema)

Ordenados por impacto. "Custo" considera migration + api + front + testes.

| #   | Gap                                                                                      | Regra      | Custo | Bloqueia                           |
| --- | ---------------------------------------------------------------------------------------- | ---------- | ----- | ---------------------------------- |
| G1  | Ciclo de vida do lançamento (`V efetuado`, `CONF conferido`, `DIF. LANÇ`, `OCORRÊNCIAS`) | R7         | ALTO  | conciliação, permissões 9 ações    |
| G2  | Transferência sem `tipo`, sem 3 datas, sem agrupamento por caixa+dia                     | R4, R6     | MÉDIO | tela de transferência, cockpit     |
| G3  | Lacre não se conecta ao ciclo do caixa (abertura/fechamento)                             | R5         | MÉDIO | rastreabilidade do dinheiro físico |
| G4  | Fechamento não separa `total vendido` de `total em espécie`                              | R1         | MÉDIO | "o caixa não bate"                 |
| G5  | Sem saldo previsto × realizado                                                           | R2         | MÉDIO | crediário, contas a pagar/receber  |
| G6  | Fechamento não propõe a transferência de retorno automaticamente                         | R3         | BAIXO | fluxo do operador                  |
| G7  | `juros` e `contabil` ausentes nos lançamentos                                            | §3 de `02` | BAIXO | paridade com a planilha            |
| G8  | Sem conciliação bancária (extrato / `.RET`)                                              | §8 de `02` | ALTO  | fechar o ciclo financeiro          |
| G9  | Sem camada de cor por categoria na UI                                                    | `03`       | BAIXO | identidade visual nova             |
| G10 | Formulários sem "valor herói", atalhos de data, "salvar e criar nova"                    | `04`       | BAIXO | produtividade do operador          |

## 2. Decisões — TODAS respondidas pelo Rodrigo em 22/07

> ✅ D1 a D14 respondidas. Registro abaixo. Nada mais bloqueia o plano `08`.

### Transferências e lacres

**✅ D1 — Lacre obrigatório na IDA e na VOLTA.** Igual à folha de anotações. Dinheiro só sai do
cofre **dentro de um malote lacrado**, e volta lacrado. **O lacre inicial É o número do malote.**

**✅ D2 — Malote e transferência são o MESMO fluxo, com regra contábil de déficit.**
O tesoureiro/admin cria vários malotes prontos, com valores variados, disponíveis. Ao **abrir o
caixa**, o operador **seleciona um malote** → **transferência automática cofre → caixa** pelo
valor do malote. **O caixa passa a DEVER ao cofre esse valor (déficit).** As vendas em dinheiro
vão quitando. → Regra **R8** em `02`.

**✅ D3 — NÃO existe "código do malote". O malote é identificado pelo LACRE.**
O lacre é a identidade. Nada de campo `codigo` separado — onde hoje há `codigo`, passa a ser o
**número do lacre**. (Isso alinha com o hotfix `fix/malotes-excluir-e-codigo-lacre` já aberto.)

**✅ D4 — Segue a planilha.** Se na planilha o troco inicial entra no cálculo do saldo, o sistema
faz igual. (Não foi discutido antes no sistema; a planilha é a referência.) → confirmar a fórmula
exata na aba TRANSFERÊNCIAS/VENDAS ao implementar M1.

**✅ D5 — Lacre OPCIONAL por enquanto, mas o CAMPO deve existir.** Modelamos o campo já; a
obrigatoriedade pode ser ligada depois (por empresa, se preciso).

### Ciclo de vida e permissões

**✅ D6 — Fluxo e significados IGUAIS à planilha + Xmind.** Quatro estágios
(`lançado → efetuado → pago → conferido`). **E mais:** cada estágio tem um responsável —
**quem lança, quem efetua, quem paga, quem confere** — e isso guia as permissões. **Tarefa nova
(T-PERM):** auditar planilha + Xmind para verificar se as permissões de hoje estão corretamente
divididas entre os cargos; se não, **criar um usuário de cada cargo** com as permissões
pertinentes. **Só o admin tem todas.** → ver `08`, item T-PERM.

**✅ D7 — Conferência.** Verificar antes na planilha/Xmind se há nome/papel definido para "quem
confere". **Se não houver, `CONFERIDO` pode ser marcado por Financeiro, Gerência e Tesouraria.**

**✅ D8 — Diferença (`DIF. LANÇ`) → alerta + confirmação.**

- No momento do lançamento com diferença: **modal de confirmação** na tela
  ("quer lançar assim mesmo?"). Se **sim**, salva **registrando o usuário que lançou com
  diferença** (responsabilização).
- Além disso, **notificação** para **Tesoureiro, Gerente, Financeiro e Admin**.
- Não bloqueia — responsabiliza e avisa.

### Interface

**✅ D9 — `--brand = #5B21B6`** (roxo, família Mobills).

**✅ D10 — Manter o logo Pralis por enquanto.** Depois muda para a **identidade visual da
Cicluz** (marca definitiva). Registrar como trabalho futuro.

**✅ D11 — Trocar a fonte** (Montserrat → fonte de interface, ex.: Inter).

**✅ D12 — Rework POR MÓDULO**, sistema em produção.

### Escopo

**✅ D13 — Conciliação bancária: fazer, sem afetar o que funciona,** do jeito da planilha e como
descrito no Xmind, dentro do sistema. Entra no roadmap (não é big-bang, respeita o que já roda).

**✅ D14 — Só a empresa TNP por enquanto** (única cadastrada). As três funcionarão igual; ao
ficar pronto, o Rodrigo cadastra LI e HORA e liga as integrações. → o sistema já é multi-tenant,
então isso é operação, não desenvolvimento.

## 3. Riscos da mudança visual

| Risco                                                     | Mitigação                                                                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rework de UI quebra lógica de negócio                     | **Regra-mãe do playbook 66:** design é aditivo e reversível, **nunca** toca api, banco, permissões, auth, seed, cálculos, rotas ou dados. Manter. |
| Operação em produção durante o rework                     | fazer por módulo (D12), com feature flag por tela se necessário                                                                                   |
| Perder o rigor de responsividade/contraste já conquistado | reaproveitar o checklist do playbook 66 e os padrões de `65_RESPONSIVE_UI_STANDARD.md`                                                            |
| Cores puras da planilha reprovarem contraste              | já resolvido — `03` traduz para paleta AA-safe preservando o significado                                                                          |
| Mexer em `transferencias` afetar dados existentes         | migration aditiva, com `tipo` default derivado do dado atual; nenhum backfill destrutivo                                                          |

## 4. Trabalho em voo — status 22/07 (fim do dia)

| Frente                                    | Branch                                        | Estado                                |
| ----------------------------------------- | --------------------------------------------- | ------------------------------------- |
| Vendedor nas vendas integradas (Fase A)   | `feat/vendedor-vendas-integradas`             | ✅ **mergeado (PR #20), em produção** |
| Malotes P1 (lacre em destaque)            | `fix/malotes-lacre-destaque-editar-duplicado` | ✅ **mergeado (PR #19), em produção** |
| Malotes hotfix (código = lacre + excluir) | `fix/malotes-excluir-e-codigo-lacre`          | ⏳ PR aberto, aguardando merge        |
| Cockpit `/caixa` + DRE                    | `feat/cockpit-caixa-dre`                      | ⏳ PR aberto, aguardando merge        |

**Cockpit entregue** (só composição, zero migration, zero módulo novo — única mudança de servidor
foi ampliar o guard de leitura do `/historico`): cabeçalho mantido + cards de total coloridos
(agora com Retiradas); seletor de caixa para `caixas_gerenciar`; **6 seções colapsáveis nas cores
do Xmind** (Entradas amarelo · Transferências laranja · Despesas vermelho · Mercadorias verde ·
Retiradas azul · Resultado/Diferença roxo) com "+ Lançar" reusando os modais; `relatorio_dre`
virou página real (gate `relatorio_dre_visualizar`). Gate: typecheck + lint + 120 testes de front

- 242 de integração verdes, zero regressão.
  → **Isso adianta a etapa V3 do plano `08`.** Falta aplicar por cima a paleta traduzida de `03`
  (hoje usa as cores diretas) quando V1/V2 entrarem.

Nota técnica do cockpit: o cabeçalho foi **embutido** na `CaixaResumoPage` (não como
`CaixaCabecalho` separado); `CaixaAutorizacoes` continua reusado. Extrair depois é opcional.

**Pendências imediatas:**

- Revisar/mergear os 2 PRs abertos (malotes hotfix, cockpit).
- Após o merge do vendedor: **recopiar `integracoes-scripts` no PC da loja**.
- **5 vendas com desconto negativo** — reprocessar após recopiar o agente.
