# 02 — Regras de negócio (extraídas da planilha CICLUZ GP)

> Fonte: `CICLUZ GP - LANÇAMENTO (VND_MER_DES_RET).xlsx` (40 abas, ~45 MB), lida diretamente
> do XML em 22/07/2026. Complementada pela simulação executada no Mobills
> (`docs/spec/SIMULACAO_dia-de-caixa-mobills.md`).

## 1. Mapa das abas

| Grupo de abas                                                                       | Papel                                                     | Cor da aba   |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------ |
| `(X) SALDOS CONTAS`                                                                 | plano de contas e saldo por conta                         | 🟠 `#FF9900` |
| `(X) GRUPO MERCADORIAS`                                                             | compras de mercadoria                                     | 🟢 `#00FF00` |
| `(X) GRUPO DESPESAS`                                                                | despesas operacionais                                     | 🔴 `#FF0000` |
| `(X) GRUPO RETIRADAS`                                                               | retiradas de sócios / adiantamentos                       | 🔵 `#0000FF` |
| `(X) TRANSFERÊNCIAS GRUPO CONTAS`                                                   | movimento cofre ⇄ caixa                                   | 🟠 `#FF9900` |
| `(X) GRUPO VENDAS - FECHAMENTO`                                                     | fechamento de caixa por PDV/turno                         | 🟡 `#FFFF00` |
| `(X) GRUPO VENDAS - ANO VS ANO`                                                     | comparativo de vendas                                     | 🟡 `#FFFF00` |
| `(X) CONFRONTAR EXTRATO CAIXA`                                                      | conciliação bancária                                      | 🟠 `#FF9900` |
| `(X) FLAGS CAIXA ECONOMICA`                                                         | tratamento do arquivo `.RET` do banco                     | 🟠 `#FF9900` |
| `(TNPLIHORA - EXP.) *`                                                              | tabelas de referência (grupos, formas, folha, patrimônio) | ⚫ `#000000` |
| `FECHAMENTOS_CAIXAS`, `VENDAS_TIPOS`, `VENDAS_PRODUTOS`, `EXTRATOS_CAIXA_ECONOMICA` | dados importados do PDV / banco                           | sem cor      |

`(X)` = replicado para TNP, LI e HORA.

## 2. Plano de contas real

```
CNT CONTA - CAIXA ECONOMICA        71.865,07   (banco)
CNT CONTA - COFRE PRINCIPAL        12.741,00
CNT CONTA - COFRE TROCO             8.607,80
CNT CONTA - FLUXO CAIXA             5.558,80
CNT CONTA - DIRETOR FINANCEIRO     65.874,21
CNT CONTA - CAIXA 1M / 1T / 2M / 2T / 3M / 3T / 4M / 4T
```

**Regra estrutural:** o **caixa é uma conta contábil**, identificada por **PDV + turno**
(`1M` = PDV 1 manhã, `1T` = PDV 1 tarde). Não é apenas um evento operacional. Todo lançamento
tem uma `CONTA` e um sinal `ENT/SAI`.

## 3. Anatomia de um lançamento (colunas comuns a DESPESAS / MERCADORIAS / RETIRADAS)

```
PLANILHA | DATA REF | [DATA NFE | Nº NOTA FISCAL] | CONTABIL | GRUPO | FORNECEDOR/COLABORADOR
DISCRIMINAÇÃO | OBS | VENCIMENTO | MÊS | VALOR DOC | JUROS | VALOR TOTAL
DATA PG | CONTA | % | ENT/SAI | CONCATENAR | CADASTRO | ALTERAÇÃO | V | CONF | DIF. LANÇ
CONCATENAR EXT. | OCORRÊNCIAS | FLAGS
```

Campos que o sistema atual **não tem** e a planilha usa todo dia:

- **`CONTABIL`** — natureza do comprovante (`DOC/NF`, `DOC/F`). Classificação fiscal do lançamento.
- **`JUROS`** — separado do valor do documento; `VALOR TOTAL = VALOR DOC + JUROS`.
- **`VENCIMENTO`** distinto de `DATA REF` e de `DATA PG` (três datas diferentes!).
- **`V`** (`EFETUADO` / `NÃO EFETUADO`) — o lançamento foi efetivado.
- **`CONF`** (`CONFERIDO` / `NÃO CONFERIDO`) — bateu com o extrato.
- **`DIF. LANÇ`** — diferença apurada na conferência.
- **`OCORRÊNCIAS` / `FLAGS`** — marcações de exceção.

> **`V` e `CONF` são dois estágios diferentes.** Efetuar ≠ conferir. O sistema hoje trata
> lançamento como binário (existe / não existe). A planilha tem **ciclo de vida**:
> lançado → efetuado → pago → conferido.

## 4. Transferências — a estrutura completa

```
DATA REF | TRANSFERÊNCIA ORIGEM | CONTABIL | TRANSFERÊNCIA DESTINO | DESCRIÇÃO | ERRO | OBS | VENCIMENTO
TOTAL(SAÍDA) | SAIDA | TROCO | 1° TRANSF. | 2° TRANSF. | 3° TRANSF. | 4° TRANSF.
TOTAL(ENTRADA) | ENTRADA
  | 1° N° LACRE | 1° T/RETORNO
  | 2° N° LACRE | 2° T/RETORNO
  | 3° N° LACRE | 3° T/RETORNO
  | 4° N° LACRE | 4° T/RETORNO
SALDO (ENTRADA/SAÍDA) | DATA PG | CONTA | % | ENT/SAI | CADASTRO | ALTERAÇÃO | V | CONF
```

**Uma linha = um caixa, um dia.** Exemplo real (02/03/26, TNP, FLUXO CAIXA → CAIXA 1M):

```
SAÍDA  658,45 = 490,00 (1ª transf.) + 168,45 (2ª transf.)
ENTRADA 1.928,85 = 1.789,00 (lacre 1) + 139,85 (lacre 2)
SALDO   1.270,40
```

Regras derivadas:

1. Um caixa pode receber **até 4 suprimentos** no dia (troco inicial + reforços).
2. Um caixa pode devolver **até 4 retornos** no dia (sangrias + fechamento).
3. **Cada retorno carrega o número do lacre.** As idas não têm coluna de lacre na planilha —
   mas o rascunho do Rodrigo mostra `Lacre inicial` e `Lacre final`, ou seja, **ele quer lacre
   nos dois sentidos**. Ver decisão pendente em `06`.
4. `SALDO = TOTAL ENTRADA − TOTAL SAÍDA` — é o resultado em dinheiro do caixa no dia.

## 5. Fechamento de caixa (aba GRUPO VENDAS + `FECHAMENTOS_CAIXAS`)

```
DATA_VENDA | PDV | OPERADOR | PRIMEIRA_VENDA | ULTIMA_VENDA | NUMERO_VENDAS
CREDIARIO | CREDITO | DEBITO | DINHEIRO | PIX | VOUCHER | TOTAL_PAGAMENTO
EMPRESA | ATUALIZADO_EM | HASH
```

O sistema **já implementa isto** (inclusive `HASH` de idempotência). O `OPERADOR` vem como posto
(`VND CAIXA PDV - 1M`) **ou** como pessoa (`Luiz Eduardo De Oliveira Ferezini`) — é o que motiva
o de-para da Fase A.

## 6. As sete regras que mudam o produto

> Estas são as regras que a simulação tornou explícitas. Cada uma tem consequência de código.

### R1 — Só DINHEIRO transita pelo caixa físico

Crédito, débito, pix e voucher são **venda do caixa** mas **entram no banco**. Somar tudo no saldo
físico do caixa é a causa clássica de "o caixa não bate".
→ _O fechamento precisa separar `total vendido` de `total em espécie no caixa`._

### R2 — Crediário não é caixa nem banco no dia

É **a receber**. Precisa do par **saldo realizado × saldo previsto** (o Mobills chama de
"foi recebida"). → _Toda listagem financeira precisa dessa distinção._

### R3 — O caixa fecha em zero

Tudo que sobrou volta ao cofre na transferência de retorno. O que restar depois do fechamento
é **diferença/quebra**, não saldo. → _O fechamento deve propor automaticamente a transferência
de retorno pelo valor da sobra._

### R4 — Sangria e transferência de retorno são o mesmo mecanismo

Papéis diferentes: sangria durante o turno, retorno no fechamento.
→ _Uma entidade com `tipo`, não duas telas._

### R5 — Cada movimento físico consome um lacre novo

Ida e volta. O lacre é o rastro auditável. → _Lacre é campo do movimento, não do cadastro de malote._

### R6 — Um dia de um caixa tem N suprimentos e N retornos

Não é 1:1. A planilha reserva 4 de cada. → _O modelo precisa agrupar movimentos por caixa+dia._

### R7 — Lançamento tem ciclo de vida, não estado binário

`lançado → efetuado (V) → pago (DATA PG) → conferido (CONF)`, com `DIF. LANÇ` e `OCORRÊNCIAS`
quando algo foge. → _Isto conversa diretamente com as 9 ações de permissão do Xmind
(`Pagar`, `Visualizar D/Pago`, `Editar D/Pago`…)._

### R8 — REVOGADA em 24/07 → ver **R8-v2** abaixo

> ⛔ **O modelo de déficit foi ABANDONADO.** A decisão de 22/07 (malote = empréstimo, caixa nasce
> devendo) **não vale mais**. Decisão do José/Rodrigo em 24/07: **"agora é fundo mesmo"**.
> O texto original fica abaixo apenas como histórico do que foi implementado no M1/M2 e precisa
> ser removido do código (ver `12_DECISAO_FUNDO_SIMPLES.md`).

<details><summary>Histórico (R8 original, revogada)</summary>

_(Confirmada pelo Rodrigo em 22/07 — D2.)_

- O **tesoureiro/admin** cria vários **malotes prontos**, com **valores variados**, que ficam
  **disponíveis** para os caixas usarem.
- Ao **abrir o caixa**, o operador **seleciona um malote disponível**. Isso, de forma
  **automática**, gera uma **transferência cofre → caixa** pelo valor do malote (o fundo/troco
  inicial).
- **Consequência contábil:** o caixa **não** começa em zero. Ele começa **devendo ao cofre** o
  valor do malote. O saldo próprio do caixa nasce em **−valor do malote** (déficit).
- **A cada venda em dinheiro**, o déficit é **quitado**. Quando o dinheiro em espécie iguala o
  valor do malote, a dívida com o cofre está paga; o que exceder é resultado do caixa.
- No **fechamento**, a sobra em espécie volta ao cofre (transferência de retorno, R3/R4),
  **quitando o restante da dívida** e devolvendo o fundo. O caixa fecha zerado em relação ao cofre.

**A identidade do malote É o lacre (D1, D3):**

- **Não existe "código do malote".** O malote é identificado pelo **número do lacre**. Onde o
  schema tem `codigo`, isso passa a ser o lacre.
- **Lacre obrigatório na ida e na volta.** Dinheiro só sai do cofre **dentro de um malote
  lacrado**; volta ao cofre lacrado de novo. O **lacre inicial** (o que sela o malote na saída
  do cofre) é o número que identifica aquele malote/aquela transferência.
- Por enquanto o preenchimento do lacre é **opcional** no sistema (D5), mas o **campo existe** e
  a obrigatoriedade pode ser ligada por empresa depois.

**Modelo de dados que isso exige:**

- `malotes` ganham `valor` e `status` (`disponivel → em_uso → devolvido`); a identidade é o
  **lacre** (não `codigo`).
- A seleção do malote na **abertura do caixa** cria a transferência `tipo = abertura`
  automaticamente, vinculando `malote_id` + `lacre` ao `fechamento_caixa`.
- O saldo do caixa passa a ter dois componentes: **dívida com o cofre** (o malote) e
  **vendas em espécie** (que a quitam). O "saldo do caixa" que o operador vê é
  `vendas_dinheiro − despesas_pagas_em_dinheiro − dívida_do_malote` ao longo do turno.

</details>

### R8-v2 — O malote é FUNDO do caixa (vigente, 24/07)

**"Agora é fundo mesmo"** (José, 24/07). O dinheiro que vem do cofre para o caixa é **fundo de
troco**, não empréstimo:

- A abertura credita o valor no caixa como **entrada positiva** (transferência cofre → caixa).
- **O caixa NÃO nasce devendo.** Não existe "déficit a quitar", não existe dívida a ser quitada
  pelas vendas.
- O saldo do caixa é o **saldo físico** de sempre (fórmula canônica `saldoCaixaCentavos`,
  ADR-001) — fundo + vendas − saídas.
- **No fechamento (B2):** todo o dinheiro do caixa volta ao cofre por transferência de retorno
  automática, e **o caixa fecha ZERADO**.
- A abertura pode se dar **pelo lacre da transferência** (o operador informa o lacre; o sistema
  reivindica/confirma a transferência para a conta do PDV e **rompe** o lacre).

**Consequência:** `divida_cofre`, `saldoProprioCentavos` e todo o conceito de "déficit" viram
**código morto** e devem ser removidos. Ver `12_DECISAO_FUNDO_SIMPLES.md`.

### R9 — Lançar com diferença responsabiliza quem lançou (D8)

Quando um lançamento/fechamento é salvo **com diferença** (`DIF. LANÇ ≠ 0`):

1. A tela exibe um **modal de confirmação** ("quer lançar assim mesmo?").
2. Se confirmado, salva **registrando o usuário** que lançou com diferença.
3. Dispara **notificação** para **Tesoureiro, Gerente, Financeiro e Admin**.
   Não bloqueia a operação — **responsabiliza e avisa**.

### R10 — Cada estágio do lançamento tem um responsável (D6)

`lançado` (quem lança) → `efetuado` (quem efetua) → `pago` (quem paga) → `conferido`
(quem confere). Esses papéis **dirigem as permissões**: as 9 ações do Xmind
(`Lançar, Pagar, Discriminar, Visualizar, Visualizar D/Pago, Editar, Editar D/Pago, Excluir,
Excluir D/Pago`) precisam estar corretamente distribuídas por cargo. **Só o admin tem todas.**
Conferência (`CONFERIDO`): se a planilha/Xmind não nomear um responsável, cabe a **Financeiro,
Gerência e Tesouraria** (D7). → Auditoria em `08`, item T-PERM.

> Esta é a diferença mais importante entre o modelo do Rodrigo e o modelo atual: hoje o troco
> inicial (se existir) é tratado como um valor solto. Na regra real, **ele é uma dívida
> rastreável entre duas contas contábeis (cofre e caixa)** — que é exatamente por que a planilha
> trata transferência como movimento com origem, destino, sinal e saldo.

## 7. Três datas, nunca uma

A planilha distingue rigorosamente:

| Data                                   | Significado                                             |
| -------------------------------------- | ------------------------------------------------------- |
| `DATA REF`                             | quando o fato aconteceu (dia de referência da operação) |
| `VENCIMENTO`                           | quando é devido                                         |
| `DATA PG`                              | quando foi efetivamente pago/recebido                   |
| _(implícita)_ `CADASTRO` / `ALTERAÇÃO` | quando foi digitado / mexido — auditoria                |

O sistema hoje tem `data_referencia` + `criado_em`/`atualizado_em`. **Falta `vencimento` em
transferências** e a separação clara em todas as telas. Isso já causou bug de fuso uma vez
(`data_referencia` derivada em UTC) — a lição está aprendida, mas o modelo de 3 datas precisa
ser explícito na UI.

## 8. Conciliação — o ciclo que fecha tudo

`CONFRONTAR EXTRATO CAIXA` + `FLAGS CAIXA ECONOMICA` + `EXTRATOS_CAIXA_ECONOMICA` formam o
fecho: o lançamento do sistema é confrontado com o extrato bancário (arquivo `.RET` da Caixa
Econômica), gerando `CONF`, `DIF. LANÇ` e `OCORRÊNCIAS`.

Hoje o sistema tem **conciliação de vendas × CREARE** (implementada e blindada), mas **não tem
conciliação bancária**. É o item 6 do roadmap e a peça que falta para o financeiro fechar sozinho.
