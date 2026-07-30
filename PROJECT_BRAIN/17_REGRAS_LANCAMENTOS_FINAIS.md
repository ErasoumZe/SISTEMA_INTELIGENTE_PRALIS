# 17 — Regras FINAIS de Lançamentos (D1–D12 respondidas + planilha verificada)

> 29/07. Fecha o briefing (`docs/relatorios/BRIEFING-LANCAMENTOS-2026-07-29`). As respostas do
> José + o que a planilha confirmou. **Esta é a spec vigente de Lançamentos.**

## 1. Decisões fechadas

| #   | Decisão                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Sócios/Gestores = cadastro próprio**, simples, por empresa. Planilha confirma a lista curta: `RET. SÓCIOS - RODRIGO`, `PRO LABORE - RODRIGO` (aba GRUPOSREF, col. X)                                                                                                                                            |
| D2  | **Patrimônio = cadastro mínimo**, criado nesta sprint. Planilha tem a estrutura pronta (aba PATRIMONIO): grupos com SIG — `FIS` estrutura física · `MAT` mat. prima · `UTS` utensílios/ferramentas · `MAQ` máquinas/equipamentos · `MOB` mobiliários/balcões · `EMB` embalagens — + itens com marca/setor/empresa |
| D3  | **Recorrência registra E cria lançamentos futuros automaticamente** (como não-pagos, vencendo na data). Só **Admin, Gerência, Financeiro** podem usar recorrência                                                                                                                                                 |
| D4  | **Rateio clássico**: proporcional ao valor de cada item, arredondamento em centavos, sobra no último item                                                                                                                                                                                                         |
| D5  | **Divergência nota × discriminação BLOQUEIA o salvar**, mostrando ONDE está divergindo para a pessoa conferir                                                                                                                                                                                                     |
| D6  | Menu: categoria **"Lançamentos" substitui** os 3 itens — mas as **listagens continuam separadas por categoria**                                                                                                                                                                                                   |
| D7  | "+ Novo → Entradas" **navega** para a tela de Entradas; a tela lista **TODAS as entradas do dia** (paginada se precisar)                                                                                                                                                                                          |
| D8  | **Conta com FUNDO + usuários vinculados** (regra nova, ver §2)                                                                                                                                                                                                                                                    |
| D9  | Foto da nota = **anexo de conferência** (sem OCR). A descrição automática vem da **NF-e (EAN → cadastro)**                                                                                                                                                                                                        |
| D10 | **Juros entra só no Valor Total** do lançamento — não rateia no custo unitário                                                                                                                                                                                                                                    |
| D11 | Seeding usa **a planilha que já temos** (é a atual). Fontes confirmadas na §3                                                                                                                                                                                                                                     |
| D12 | **Retirada NÃO tem discriminação** (corrige leitura anterior do desenho)                                                                                                                                                                                                                                          |

## 2. D8 — Conta com fundo (regra nova, importante)

Ao **cadastrar uma conta** (admin):

- define o **valor de fundo** inicial (ex.: CONTA COFRE, fundo 10.000);
- escolhe **um ou mais usuários** que podem movimentar essa conta (`contas_usuarios`).

**Comportamento:** transferência de 500 do cofre → caixa 1 deixa o cofre com **9.500** e o caixa 1
com uma transferência de **+500**. Ou seja: **saldo da conta = fundo + entradas − saídas**
(derivado dos movimentos — não sobrescrever a coluna do fundo; o fundo é o ponto de partida).
Isto materializa `contas.saldo_inicial` (o trabalho perdido de 24/07) + a FOTO 4 do Rodrigo.

## 3. Seeding — fontes confirmadas NA PLANILHA (29/07)

| Alvo no sistema           | Fonte (aba)                         | O que traz                                                             |
| ------------------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| Grupos de despesas        | `GRUPOSREF` col. I/J                | nomes + REF (`DES/F - VALOR/V` etc.)                                   |
| Grupos de mercadorias     | `GRUPOSREF` col. M–U                | nome + **margem %** + tipo (VENDA/TRANSFORMAÇÃO) + computar + DOC/F-NF |
| Grupos de retiradas       | `GRUPOSREF` col. X/Y                | nome + flag ATIVA (inclui sócios/pro-labore)                           |
| Contas                    | `GRUPOSREF` col. G/Z/AA             | `CNT CONTA - CAIXA 1M..4T`, ITAU, BRADESCO, NUBANK, PAGBANK… + ativas  |
| Tipos de produto          | `GRUPOSREF` col. V                  | PRO, MAT. PRIMA TRANSF., FAB. PRÓPRIA, BASE FAB. PRÓPRIA               |
| Patrimônio (grupos+itens) | `PATRIMONIO`                        | SIG/grupo/item/marca/setor/empresa (máx 38 linhas)                     |
| Setores/Cargos            | `FOLHA PAGAMENTO`                   | categorias, cargos, CBO, setor, regime, turno                          |
| Produtos                  | pasta `CADASTRO DE PRODUTOS` (repo) | cadastro com código de barras                                          |

Estratégia: script idempotente, **dry-run com contagens primeiro**, José aprova, grava. Só TNP.

## 4. Regras do formulário (consolidadas do briefing + respostas)

- Menu "Lançamentos": sempre para Gerência/Tesouraria/Financeiro/Diretor Geral/Admin; para Caixa
  **só com caixa aberto**. Lançamento sem caixa aberto (papéis de gestão) vincula **só à conta**.
- Campos: Valor · Juros (**R$ ou %** sobre o Valor) · Valor Total (=Valor+Juros, calculado) ·
  Data Lançamento (hoje) · Data Doc. Fiscal (emissão) · N° Doc. Fiscal · Credor **tipado**
  (Fornecedor | Colaborador | Sócio-Gestores → lista muda) · Pagamento S/N (S → +Data Pagamento;
  ambos têm Vencimento + 2 fotos) · Recorrência (D3).
- Modal único com **3 botões no topo** (Despesa/Mercadoria/Retirada).
- "+ Novo" = **Entradas · Transferências · Saídas** (3 itens, estilo Mobills).

## 5. Discriminação (Despesa e Mercadoria — retirada NÃO tem)

- Colunas: Quant · Descrição · Grupo · V.Unit · V.Unit c/Desc · V.Total · V.Total c/Desc + V.Total Geral.
- **Descrição por código de barras:** item vindo da NF-e → EAN → busca `produtos.codigoBarras` →
  usa o **nome cadastrado**; sem match, mantém o texto da nota.
- **Grupo:** do cadastro de produtos; se maquinário/manutenção → do **cadastro de patrimônio**.
- **Descontos:** 3 níveis (V.Unit de 1 ou todos · V.Total de 1 ou todos · V.Total Geral), R$ ou %,
  **cumulativos**. Rateio D4 quando aplicado em total/geral (recalcula o unitário — afeta custo).
- **Validação D5:** total da discriminação ≠ Valor do lançamento → **não salva** e aponta a diferença.
- A telinha de desconto existente é mantida, com esse funcionamento.

## 6. Fora deste escopo (congelado)

Transferências (regras já definidas) · Entradas (integração pronta — só a listagem do dia D7) ·
Cockpit/abertura (consolidação própria).
