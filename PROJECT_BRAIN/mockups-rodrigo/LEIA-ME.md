# Mockups do Rodrigo — desenhos originais (27/07/2026)

Estes são os desenhos originais feitos à mão pelo Rodrigo e são a **fonte da verdade visual das
telas** do sistema; a transcrição textual deles vive em `PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md`
e as regras que saíram deles estão catalogadas em `PROJECT_BRAIN/19_REGISTRO_DE_REGRAS.md`.

## Índice das fotos

| Arquivo                                              | O que mostra                                                                                                                                                                       | Regras relacionadas                                                                              | Tela do sistema                                                                                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `FOTO-1-transferencia-malote.jpeg`                   | Formulário "Transferência / Malote": bloco Transf. Saída, bloco Transf. Entrada (Retorno/Sangria) e bloco Resumo. Descrição completa dos campos abaixo                             | R-006, R-021, R-022, R-025, R-026, R-027, R-028, R-029, R-030, R-031, R-035, R-036, R-037, R-038 | `web-vue/components/operacoes/OperacaoTransferenciaModal.vue` · `TransferenciaRetornoCampos.vue` · `pages/transferencias.vue` |
| `FOTO-2-lancamento-despesa-mercadoria-retirada.jpeg` | Formulário único de "Lançamento Despesas / Mercadoria / Retirada": valores, juros, datas fiscais, tipo de credor, pagamento, duas fotos e bloco de Recorrência                     | R-041, R-042, R-043, R-044, R-045, R-046, R-047, R-048, R-049, R-058, R-059, R-060, R-063, R-064 | `web-vue/components/operacoes/OperacaoLancamentoModal.vue` (Valores, Datas, Credor, Pagamento, Fotos, Recorrência)            |
| `FOTO-3-discriminacao.jpeg`                          | Tabela de "Discriminação" do lançamento: Quant · Descrição · Grupo · V.Unit · V.Unit c/Desc · V.Total · V.Total c/Desc · % — com V.Total geral e Vale Presente/Desconto em R$ ou % | R-050, R-051, R-052, R-053, R-054, R-055, R-056, R-057                                           | `web-vue/components/operacoes/OperacaoLancamentoDiscriminacao.vue`                                                            |
| `FOTO-4-vinculos-usuario-contas.jpeg`                | Pessoas ligadas por linhas às contas que podem operar: Rodrigo, Bianca, Peterson e Joana → CT Financeiro · CT Cofre · CT Caixa · CT CX 1/2/3                                       | R-028, R-071, R-072                                                                              | `web-vue/pages/usuarios.vue` e `web-vue/pages/contas.vue` (vínculo `contas_usuarios`)                                         |
| `FOTO-5-abertura-caixa.jpeg`                         | Tela "Abertura Caixa" com 4 campos: Ponto de Venda · Turno · Transf. Entrada / N° Lacre · Maq. Cartão / N° Série                                                                   | R-032, R-033, R-039, R-040                                                                       | `web-vue/components/caixa/CaixaResumoPage.vue` · `web-vue/pages/caixa.vue`                                                    |

## FOTO 1 — descrição por extenso do desenho

Título escrito no alto da folha: **"Transferência / Malote"**, sublinhado.

### Bloco superior — "Transf. Saída:"

Campos desenhados como retângulos, distribuídos em duas colunas:

- **Valor** — campo à esquerda, primeira linha.
- **N° Lacre / Doc.** — campo à direita, primeira linha, com a anotação **"do setor"** logo abaixo
  do rótulo (o lacre/documento pertence ao setor).
- **Data Lanç** — campo à esquerda, segunda linha, já com o valor **"hoje"** escrito dentro do
  campo.
- **☑ Agendamento** — checkbox marcada, ao lado direito do campo Data Lanç. Dela sai uma seta
  curva apontando para baixo, para o campo seguinte.
- **Data Agendamento** — campo à esquerda, logo abaixo, aberto pela checkbox Agendamento.
- **Data Recebimento** — campo à direita, na mesma altura de Data Lanç/Data Agendamento, com a
  anotação manuscrita ao lado: **"Esse dado é preenchido quando confirmado pelo destinatário!"**
- **Origem / Saída** — campo à esquerda, terceira linha (conta de origem).
- **Destino / Entrada** — campo à direita, terceira linha (conta de destino), mais largo.

À direita do campo **Destino / Entrada**, empilhadas verticalmente, três checkboxes:

1. ☐ **Múltiplo Destino** — desmarcada.
2. ☐ **Tempo confirmação** — desmarcada. (Este item aparece transcrito como "Sempre confirmar" no
   `14`; o José corrigiu em 31/07: o campo é **tempo de confirmação** — R-035.)
3. ☑ **Transf. Retorno / Sangria** — marcada, com um ponto e uma linha saindo dela em direção à
   anotação manuscrita **"Se ☑ abre esse campo!"**, escrita logo abaixo, entre duas setas cheias
   que apontam para o bloco inferior — ou seja, marcar essa checkbox é o que abre o bloco
   "Transf. Entrada".

### Bloco inferior esquerdo — "Transf. Entrada: (Retorno/Sangria)"

Aparece apenas quando a checkbox acima é marcada. Estrutura de múltiplas linhas, com botões de
adicionar/remover à esquerda:

- **⊕** · **Valor** (campo) · **N° Lacre / Doc** (campo, com a anotação **"do setor"** abaixo do
  rótulo).
- **−** · **Valor** (campo) · **N° Lacre / Doc** (campo, com a anotação **"do setor"** abaixo do
  rótulo).

### Bloco inferior direito — "Resumo"

Separado do resto por uma linha vertical, contém três linhas de totais:

```
Saída   (−)  R$
Entrada (+)  R$
Saldo (+/−)  R$
```
