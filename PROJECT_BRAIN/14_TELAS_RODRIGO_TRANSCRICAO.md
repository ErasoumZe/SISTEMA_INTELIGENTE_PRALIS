# 14 — Telas do Rodrigo: transcrição dos wireframes (27/07)

> Fotos originais recebidas em 27/07 (as do Xmind eram miniaturas ilegíveis — ver `13`).
> **Transcrição fiel** dos 5 desenhos. Estes são a especificação de campos mais precisa que temos —
> vêm da mão do dono da regra. Onde eu interpretei, está marcado _(leitura)_.

---

## FOTO 1 — "Transferência / Malote"

### Bloco A · Transf. Saída

| Campo                 | Observação do desenho                                             |
| --------------------- | ----------------------------------------------------------------- |
| **Valor**             | campo                                                             |
| **N° Lacre / Doc.**   | _"do setor"_ — o lacre/documento pertence ao setor                |
| **Data Lanç**         | com atalho `Hoje`                                                 |
| ☑ **Agendamento**     | checkbox que **abre** o campo abaixo (seta)                       |
| **Data Agendamento**  | só aparece se Agendamento marcado                                 |
| **Data Recebimento**  | ⚠ _"Esse dado é preenchido quando confirmado pelo destinatário!"_ |
| **Origem / Saída**    | conta de origem                                                   |
| **Destino / Entrada** | conta de destino                                                  |

Checkboxes ao lado de Destino:

- ☐ **Múltiplo Destino**
- ☐ **Tempo de confirmação** — corrigido em 31/07. A transcrição original dizia "Sempre confirmar";
  releitura do desenho (`mockups-rodrigo/FOTO-1-transferencia-malote.jpeg`) confirma a palavra
  **tempo**. É o campo da **R-035**, não uma flag de comportamento
- ☑ **Transf. Retorno / Sangria** → _"Se ☑ abre esse campo!"_ (abre o Bloco B)

> As três são **checkboxes que revelam o campo correspondente** — nenhuma delas mostra o campo
> antes de ser marcada. É o padrão que a anotação _"Se ☑ abre esse campo!"_ registra.

### Bloco B · Transf. Entrada (Retorno / Sangria)

Aparece quando a checkbox acima é marcada. Estrutura de **múltiplas linhas**:

| ⊕ | **Valor** | **N° Lacre / Doc** _(do setor)_ |
| − | **Valor** | **N° Lacre / Doc** _(do setor)_ |

### Bloco C · Resumo (canto inferior direito)

```
Saída   (−)  R$
Entrada (+)  R$
Saldo (+/−)  R$
```

### O que isto MUDA / CONFIRMA

1. **AGENDAMENTO de transferência** — 🆕 não existe no sistema. Transferência pode ser agendada.
2. **Data de Recebimento com CONFIRMAÇÃO pelo destinatário** — 🆕 a transferência tem **duas
   pontas**: quem envia e quem confirma o recebimento. Isso explica o "reivindica/confirma" que a
   sessão do Claude Code implementou em 24/07 — **está no desenho**.
3. **Múltiplo Destino** — ~~volta a ideia de rateio~~ **ERRADO, corrigido em 31/07 pela R-030**:
   múltiplo destino é **DISPUTA, não rateio**. São N contas **candidatas**; a primeira que confirmar
   informando o lacre leva o valor **inteiro** e as demais não recebem nada. Não existe valor por
   destino. Ver a fala do José em `19_REGISTRO_DE_REGRAS.md` (R-030).
4. ~~**"Sempre confirmar"** — flag de comportamento~~ **ERRO DE TRANSCRIÇÃO, corrigido em 31/07**:
   o campo é **Tempo de confirmação** (R-035) — quem envia escolhe o prazo em que o destino deve
   confirmar (5min · 10min · 30min · 1h · 1 dia · 10 dias · 30 dias).
5. **Lacre "do setor"** — o lacre pertence ao **setor**, não ao malote genérico. Reforça o modelo
   de lacre por movimento (tabela `lacres`).
6. **Retorno/Sangria no MESMO formulário** (checkbox que expande) — não é tela separada. Confirma R4.
7. **Resumo Saída/Entrada/Saldo** — confirma o bloco de totais da planilha.

---

## FOTO 2 — "Lançamento Despesas / Mercadoria / Retirada"

**Um único formulário serve às três categorias.**

| Linha | Campos                                                                              |
| ----- | ----------------------------------------------------------------------------------- |
| 1     | **Valor** · **Juros** · **Valor Total**                                             |
| 2     | **Data Lanç** · **Data Doc. Fiscal** · **N° Doc. Fiscal**                           |
| 3     | Tipo de credor (checkboxes, ver abaixo) → **Credor**                                |
| 4     | **Pagamento** (toggle S/N) · **Data pagamento**                                     |
| 5     | **Data Vencimento** · **Foto (Recibo/Boleto/Nota)** · **Foto (Nota / e / interno)** |
| 6     | **Recorrência** (bloco, ver abaixo)                                                 |

### Tipo de credor (define o que o campo "Credor" busca)

- ☐ **Fornecedor** — (Despesas / Mercadorias / Retiradas)
- ☐ **Colaborador** — (Despesas)
- ☐ **Sócios / setores** — (Retiradas)

### Bloco Recorrência

- **Número** (ex.: 1, 2, 3, 4…) — quantas repetições
- **dia** — Sg · Ter · Qa · Qi · Sx · Sa _(leitura: dia da semana)_
- **Frequência** — dia · Sem · mês · Quinzena · 3 em 3 _(leitura)_

### O que isto MUDA / CONFIRMA

1. **JUROS separado + Valor Total** — confirma a planilha (`VALOR DOC + JUROS = VALOR TOTAL`).
   🆕 não existe no sistema hoje.
2. **Data Doc. Fiscal + N° Doc. Fiscal** — 🆕 campos fiscais no lançamento.
3. **Credor tipado** (fornecedor/colaborador/sócio-setor) — 🆕 hoje só há fornecedor/colaborador
   soltos; o tipo define a origem da busca **por categoria**.
4. **DUAS fotos** por lançamento (comprovante + nota/interno) — hoje há uma.
5. **RECORRÊNCIA** — 🆕 recurso inteiro que não existe (lançamento repetido N vezes).
6. **Três datas confirmadas**: Lançamento · Vencimento · Pagamento (+ Data Doc. Fiscal = 4ª).

---

## FOTO 3 — "Discriminação" (a tela de detalhe do lançamento)

Tabela com colunas:

```
Quant | Descrição | Grupo | V.Unit | V.Unit c/Desc | V.Total | V.Total c/Desc | %
  10        …         …     1,00        0,83         10,00        8,25          17,5%
  10        …         …     2,00        1,65         20,00       16,50          17,5%
  10        …         …     3,00        2,48         30,00       24,75          17,5%
```

Rodapé:

- **V. Total geral** → `40,00` ☑ … `33,00` … `17,5%`
- **Vale Presente / Desconto** → toggle **R$** ou **%** → resultado `7,00`

Observações no desenho:

- _"Mercadoria / Retirada — vinculado do cadastro produto / estoque"_
- _"Depois… os dois campos são livres"_ _(leitura: para Despesas, descrição e grupo são livres;
  para Mercadoria/Retirada, vêm do cadastro de produto)_

### O que isto MUDA / CONFIRMA

1. **Desconto por item E geral, em R$ ou %** — 🆕 com recálculo de `V.Unit c/Desc` e
   `V.Total c/Desc` e o **% efetivo** por linha.
2. **"Vale Presente"** como natureza de desconto — 🆕.
3. **Discriminação puxa do cadastro de produto/estoque** quando é Mercadoria/Retirada; campos
   livres quando é Despesa.

---

## FOTO 4 — Vínculo Usuário → Contas

Desenho de pessoas ligadas a contas (setas convergindo):

```
Rodrigo → CT Financeiro · CT Cofre · CT Caixa · CT CX 1/2/3
Bianca  → CT Financeiro · CT Cofre
Peter   → CT Financeiro · CT Caixa · CT …
Joana   → CT CX 1/2/3
```

### O que isto CONFIRMA

**A tabela `contas_usuarios`** que apareceu na migration 0015 (sessão de 24/07) — **está aqui, no
desenho**. Cada usuário é vinculado às **contas** que pode operar. Isso é a base de:

- quais contas aparecem como Origem/Destino para cada usuário numa transferência;
- quem pode receber/confirmar uma transferência.

Não é permissão de tela (isso são as 9 ações) — é **escopo de conta por usuário**. São duas coisas
diferentes e complementares.

---

## FOTO 5 — "Abertura Caixa"

| Campo                          | Exemplo do desenho         |
| ------------------------------ | -------------------------- |
| **Ponto de Venda**             | ex.: `PDV CX1`, `PDV CX2`… |
| **Turno**                      | ex.: `Manhã`, `Tarde`      |
| **Transf. Entrada / N° Lacre** | —                          |
| **Maq. Cartão / N° Série**     | ex.: `0742742…`            |

### O que isto MUDA / CONFIRMA

1. **Abertura por N° de Lacre da transferência** — ✅ confirma o que a sessão de 24/07 implementou,
   e confirma a **R8-v2 (fundo simples)**: o caixa recebe a transferência, não pega um "malote com
   dívida".
2. **Máquina de cartão / N° de série na abertura** — 🆕 não existe. Vincula a maquininha ao caixa
   (rastreabilidade de cartão por PDV/turno).
3. A abertura é **enxuta**: 4 campos. Sem valor de fundo digitado — o valor vem da transferência
   que o lacre identifica.

---

## Resumo do impacto (o que o sistema NÃO tem)

| #   | Item novo                                             | Onde          | Tamanho                   |
| --- | ----------------------------------------------------- | ------------- | ------------------------- |
| 1   | Agendamento de transferência (+ data)                 | Transferência | médio                     |
| 2   | Confirmação de recebimento pelo destinatário (+ data) | Transferência | **alto** (fluxo 2 pontas) |
| 3   | Múltiplo destino (disputa, R-030)                     | Transferência | médio                     |
| 4   | Tempo de confirmação (R-035, era "Sempre confirmar")  | Transferência | baixo                     |
| 5   | Juros + Valor Total                                   | Lançamentos   | baixo                     |
| 6   | Data e N° do Doc. Fiscal                              | Lançamentos   | baixo                     |
| 7   | Credor tipado (fornecedor/colaborador/sócio-setor)    | Lançamentos   | médio                     |
| 8   | Segunda foto (nota/interno)                           | Lançamentos   | baixo                     |
| 9   | **Recorrência** (número, dia, frequência)             | Lançamentos   | **alto**                  |
| 10  | Desconto por item e geral (R$ ou %) + Vale Presente   | Discriminação | médio                     |
| 11  | Discriminação puxando do cadastro de produto          | Discriminação | médio                     |
| 12  | `contas_usuarios` (usuário → contas)                  | Cadastro      | ✅ já iniciado (0015)     |
| 13  | Máquina de cartão / N° série na abertura              | Caixa         | baixo                     |

## Nota de processo

As fotos **explicam retroativamente** o que a sessão do Claude Code fez em 24/07 (abertura por
lacre, confirmação, `contas_usuarios`, `lacres` com `rompido`). Ou seja: aquilo não foi invenção —
**veio destes desenhos**. O que faltou foi o registro escrito, que este documento agora fecha.
