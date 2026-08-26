# 29 · As planilhas da operação — o que elas revelam

> 05/08/2026. Leitura das três planilhas do Google e do arquivo de importação, pelo navegador.
> Fontes: `SISTEMA COMPRAS/MIX PRODUTOS TNP` (15 abas) · `CICLUZ GP - LANÇAMENTO (VND/MER/DES/RET)`
> (44 abas) · `CENTRAL PRODUTOS (BASE)` (15 abas) · `arquivo_importar_tnp.txt`.
>
> **Cobertura honesta:** li a estrutura de **todas** as abas e o vocabulário das abas de regra. As
> versões `(LI)` e `(HORA)` são estruturalmente idênticas às `(TNP)` — tratei como duplicatas por
> loja e não extraí uma a uma. Não li linha a linha as abas de 10 mil registros: delas tirei
> cabeçalho, contagem e vocabulário de coluna.

---

## §0 · Por que isto importa

Duas das três planilhas **já existiam no projeto, em cópias velhas e incompletas**:

| Planilha                       | Cópia local        | Online hoje |
| ------------------------------ | ------------------ | ----------- |
| `CICLUZ GP - LANÇAMENTO`       | 21/07, **40 abas** | **44 abas** |
| `CENTRAL PRODUTOS (BASE)`      | 17/06, **9 abas**  | **15 abas** |
| `SISTEMA COMPRAS/MIX PRODUTOS` | **não existia**    | 15 abas     |

As abas que faltavam não são detalhe — são **taxas de maquininha** e **12 meses de venda dos dois
ERPs legados**. E a planilha inteiramente nova descreve um domínio (**produção**) que não aparece em
nenhum documento do brain nem no backlog.

---

## §1 · As contas são cinco, e têm nome

`(TNP) SALDOS CONTAS` — não é abstração, é o plano de contas real da operação:

| Conta                            | Saldo na planilha |
| -------------------------------- | ----------------: |
| `CNT CONTA - CAIXA ECONOMICA`    |         71.865,07 |
| `CNT CONTA - COFRE PRINCIPAL`    |         12.741,00 |
| `CNT CONTA - COFRE TROCO`        |          8.607,80 |
| `CNT CONTA - FLUXO CAIXA`        |          5.558,80 |
| `CNT CONTA - DIRETOR FINANCEIRO` |         65.874,21 |

Isso confirma a **R-008b** (o retorno vai para o COFRE PRINCIPAL, e há dois cofres) e nomeia o
segundo: **COFRE TROCO**. Também explica o fundo de troco da R-001.

Duas contas que o brain nunca mencionou: **FLUXO CAIXA** e **DIRETOR FINANCEIRO**. A segunda é conta
de sócio — e casa com o grupo de retirada `RET. SÓCIOS - RODRIGO`.

---

## §2 · A anatomia real do lançamento

Cada tipo de lançamento tem colunas próprias. O que o ERP tem hoje bate no essencial e **perde três
coisas**.

**Mercadoria** (10.006 linhas) — `PLANILHA · Nº NOTA FISCAL · CONTABIL · GRUPO MERCADORIAS ·
FORNECEDOR/COLABORADOR · DISCRIMINAÇÃO · MÊS · CONTA · ENT/SAI · CONCATENAR · V · CONF ·
CONCATENAR P/EXT.`

**Despesa** (estrutura) — acrescenta `REF.` (duas colunas distintas!), `JUROS`, `%`, `CADASTRO`,
`ALTERAÇÃO`. Vocabulário observado:

- `CONTABIL` = `DOC/NF` | `DOC/F` — **documento fiscal x documento de folha**
- `REF.` (1ª) = `DES/F - VALOR/V` | `DES/V - VALOR/V`
- `REF.` (2ª) = `ANTERIOR` | `ATUAL` — competência
- Grupos: `DES FOLHA PAG - PAGAMENTO 5º`, `DES FOLHA PAG - PAGAMENTOS EXTRAS`,
  `DES FOLHA PAG - OUTROS ADIANTAMENTOS`, `DES MANUT. EMPRESA - SERVIÇO MOB./BALCÕES`,
  `DES MANUT. EMPRESA - SERVIÇO MÁQ./EQUIP.`, `DES UNIFORMES - GERAL`,
  `DES MAT. LIMPEZA - PRODUTO QUÍMICO`, `DES TRANSPORTE - MOTORISTA`

**Retirada** (10.004 linhas) — `DATA REF · CONTABIL · GRUPO RETIRADAS · GRUPO RETIRADAS FORNECEDOR ·
DISCRIMINAÇÃO · OBS: · VENCIMENTO · MÊS · VALOR DOC · JUROS`. Grupos: `RET. SÓCIOS - RODRIGO`,
`INVESTIMENTO - MOB./BALCÕES`, `INVESTIMENTO - MÁQ./EQUIP.`

**Transferência** (4.005 linhas) — `TRANSFERÊNCIA ORIGEM · CONTABIL · TRANSFERÊNCIA DESTINO ·
DESCRIÇÃO · OBS: · MÊS · SAIDA · ENTRADA · CONTA`

### O que o ERP não tem

1. **`CONTABIL` (`DOC/NF` x `DOC/F`)** — separa documento fiscal de documento de folha. O ERP tem
   `numeroDocumentoFiscal`, mas não o **tipo** de documento. É o que permite tratar folha de
   pagamento sem nota fiscal sem poluir o controle fiscal.
2. **`REF.` de competência (`ANTERIOR` x `ATUAL`)** — despesa paga hoje referente ao mês anterior. O
   ERP tem data de lançamento, data do documento e vencimento, mas **não tem competência**. Sem isso,
   o DRE mensal sai errado.
3. **`MÊS` como campo próprio** (`ABR 2026`) — no ERP é derivado da data. Aqui é dado, e é o que
   fecha o `ANO VS ANO`.

---

## §3 · Cartão: o modelo completo de taxa está aqui 🔴

Esta é a descoberta mais acionável. Duas abas, ambas **ausentes da cópia local**.

**`(TNP) TAXAS MAQ. CARTÔES`** — 491 linhas.
Bandeiras: `VISA`, `MASTER`, `ELO`, cada uma em `CREDITO` e `DEBITO`.
Operadoras: **`PAGBANK`, `CIELO`, `PICPAY`, `STONE`**.
Colunas: `DATA INICIO · DATA TERMINO · DATA TERMINO AUTO · BANDEIRA · OPERADORA · TAXA ·
TAXA P/TRANSAÇÃO`.

**`ANTIGA TABELA OPERADORAS TAXAS`** — 55 linhas, e é o modelo mais completo:
`BANDEIRA · TIPO · CONCILIADORA · DATA INICIO · DATA FINAL · TAXA ADMINISTRATIVA ·
VALOR POR TRANSAÇÃO · CICLO · DIA/NUMERAL · DIA/SEM INICIO`

Ou seja, a taxa de cartão na operação real tem:

- **vigência** (início e fim) — a taxa muda ao longo do tempo e o histórico precisa da taxa da época;
- **duas parcelas** — percentual administrativo **e** valor fixo por transação;
- **ciclo de repasse** (`CICLO`, `DIA/NUMERAL`, `DIA/SEM INICIO`) — quando o dinheiro efetivamente cai;
- **conciliadora**, que pode não ser a operadora.

**O ERP não tem nada disso.** A tabela `maquininhas` existe e guarda o número de série; não há
bandeira, operadora, taxa, vigência nem ciclo. É exatamente a peça que falta para:

- a **conciliação da maquininha** (declarada não pronta na reunião de 04/08);
- o erro humano de crédito passado como débito, que só a conciliação resolve;
- a **D-06 / R-007** (separar dinheiro físico de cartão no fechamento) — sem saber a taxa e o ciclo,
  não dá para prever quanto entra e quando.

---

## §4 · Regras de operação que ninguém tinha registrado

**4.1 · O fechamento do PDV é MANUAL na TNP e AUTOMÁTICO na Lisboa.**
As abas dizem isso no próprio cabeçalho: `GRUPO VENDAS - FECHAMENTO CAIXAS PDV **MANUAL** VENDAS PDV`
na TNP, e `... **AUTOMATICO** VENDAS PDV` na LI. É regra por loja, e o sistema trata as duas igual.

**4.2 · A venda em dinheiro é medida por turno.**
`ANO VS ANO` tem `V. MANHÃ DINHEIRO` e `V. TARDE DINHEIRO` como colunas separadas, além de
`V. TOTAL`, `V. TOTAL CARTÃO`. Confirma que o **turno** não é só um rótulo da abertura de caixa — é
uma dimensão de análise que o Rodrigo já usa.

**4.3 · As formas de pagamento da operação são cinco.**
`TIPOS VENDAS` (732 dias, desde 31/12/25): `PDV DINHEIRO · CREDITO · DEBITO · VOUCHER · PIX`.
**`VOUCHER` não aparece em lugar nenhum do brain.**

**4.4 · A conciliação bancária já existe, em planilha.**
`CONFRONTAR EXTRATO CAIXA ECONOMICA` (2.218 linhas) casa lançamento com extrato e marca
`CONFRONTADO`. `BASE FORMATAÇÃO EXTRATO` (7.523 linhas) normaliza o extrato:
`NOME EMPRESA · DATA CONTABIL · VALOR · TIPO LANÇ · HISTORICO · N° DOC · DATA PG · TAG`.
Isso é o G8 do brain ("conciliação bancária"), com processo já desenhado.

---

## §5 · Um domínio inteiro que o projeto não conhece: PRODUÇÃO

A planilha `SISTEMA COMPRAS/MIX PRODUTOS TNP` é inédita e não é sobre compras apenas.

| Aba                                       |               Linhas | Do que trata                                                                                                                 |
| ----------------------------------------- | -------------------: | ---------------------------------------------------------------------------------------------------------------------------- |
| `MIX PRODUTOS LOJA E PRODUÇÃO ASSOCIAÇÃO` | 3.449 × **248 col.** | o mix completo, com `DESCRIÇÃO COMPLETA`, `DESCRIÇÃO PLACAS`, `DESC. ABREVIADA`, `FORNEC/FABRIC` e o bloco fiscal posicional |
| `VLD PRODUÇÃO ASSOCIAÇÃO`                 |                3.113 | `HORARIO · DEMANDA · PEDIDO · ETAPA · HORARIO CHEGADA · REF BALCÕES`                                                         |
| `ALTERAR PREÇO COMANDA`                   |                3.122 | `COMANDA CÓDIGO · PREÇO · SISTEMA CÓDIGO · PREÇO ATUAL · PREÇO ALTERADO`                                                     |
| `MIX PRODUTOS FABRICAÇÃO PROPRIA`         |                  491 | `NCV · ICMS · ASS · REC · QUANT. · NIVEL · CARGOS`                                                                           |
| `CADASTRO PRODUTOS P/SISTEMA PRODUÇÃO`    |                  406 | ponte para o sistema de produção                                                                                             |
| `VLD TABELA NUTRICIONAL ADICIONAL`        |                  424 | `ALIMENTO · CODIGO`                                                                                                          |
| `MIX COFFEE BREACK`                       |                   36 | `REFERENCIA · MULT · P/PESSOA · REF/UNID · MINIMO · VALOR · SIMULAÇÃO`                                                       |
| `VLD ASSOCIAÇÃO/MIX ASSOCIAÇÃO`           |                1.526 | `SERVIÇOS GERAIS · OPERACIONAL I · LOJA · PANIFICAÇÃO · MANHÃ · TDT · BALCONISTA · AJUD. PRODUÇÃO`                           |

Três leituras disso:

1. **Existe planejamento de produção com demanda, horário, etapa e balcão de destino.** Pão sai da
   produção em lotes, com hora e destino. Nada no ERP toca nisso.
2. **A ficha técnica existe na prática** — `MIX PRODUTOS FABRICAÇÃO PROPRIA` tem receituário (`REC`),
   quantidade, **nível** e **cargo** de quem executa. A ficha técnica está listada como "não existe no
   sistema" (`21` §5) — mas existe na planilha, e amarrada a cargo.
3. **`ALTERAR PREÇO COMANDA` é um segundo canal de preço**, com código de comanda separado do código
   do sistema. Isso complica o desenho do Cadastro de Produtos: há **dois códigos** e um fluxo de
   alteração de preço fora do cadastro.

---

## §6 · Produtos: os números reais e uma divergência de taxonomia

`(BASE) CADASTRO PRODUTOS` tem **9.920 linhas** — não 150. O `base-products.json` do app Pralis
(150 produtos) é uma amostra pequena, e o `seed-planilha` filtra só as linhas com "TNP".

`BASE FULL SIA` tem 7.131 (TNP) e 8.332 (LI) — `Descrição · Cód. produto · Cód. barras`.

**A divergência que importa** está nos relatórios dos dois ERPs legados:

`RELATORIO CRIARE TNP/LI` (1.315 e 1.244 linhas) traz
`QTD_MINIMA · NOMEGRUPO · **NOMEFAMILIA** · **NOMECATEGORIA** · ID_ULTIMOFORNECEDOR · ID_CLIENTE ·
NOMEFABRICANTE · CST · NOMEALIQUOTA`.

O CREARE classifica produto em **três níveis — GRUPO > FAMÍLIA > CATEGORIA** — e guarda **último
fornecedor** e **fabricante** separados. O ERP tem `grupos_mercadorias` com `grupo_pai_id`, ou seja,
**dois níveis**, e **nenhum vínculo produto↔fornecedor** (registrado no `28`).

`RELATORIO COMPILART TNP/LI` (2.996 e 1.996) traz
`Código · Cód. Produto · Descrição · **Qtd. Estoq. Atual** · **Custo** · Unitário · **Margem** ·
Qtde. Venda · Total Item` — ou seja, **o Compilarte já tem custo, margem e estoque por produto**, e é
uma fonte independente para validar a Curva ABC e a integração.

---

## §7 · O arquivo de importação do PDV

`arquivo_importar_tnp.txt` é **largura fixa**, uma linha por produto:

```
00000000000000005SKOL 473ML 0000000690UN1000000000000131200...30/12/9930/12/99...7891149100828SS...
```

Campos reconhecíveis: código, descrição, preço (`0000000690` = 6,90), unidade (`UN`), código de
grupo/família, datas `30/12/99` (sem validade), NCM/CST, EAN (`7891149100828`), flags `S`/`N`.

Duas linhas mostram o mesmo produto com **preços diferentes** (`690` e `900`) e descrições
`SKOL 473ML` e `SKOL 473ML DELIVERY` — ou seja, **o mesmo item tem preço por canal**.

**Isto é o caminho de volta.** Hoje o fluxo é só CREARE → Pralis. Este layout é o contrato para o
Pralis **alimentar** o PDV. Fica registrado como pergunta em aberto — o José ainda não decidiu se
esse é o alvo. Se for, o Cadastro de Produtos precisa fechar com o layout posicional, e precisa
suportar preço por canal.

---

## §8 · O que isto muda no que está em andamento

| Achado                                                              | Impacto                                     | Onde                                                    |
| ------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------- |
| Taxa de cartão com vigência, ciclo e valor por transação            | destrava conciliação da maquininha e a D-06 | `maquininhas` não tem nenhum desses campos              |
| `CONTABIL` (`DOC/NF` x `DOC/F`) e competência (`ANTERIOR`/`ATUAL`)  | DRE mensal correto                          | falta no lançamento do ERP                              |
| `VOUCHER` como forma de pagamento                                   | integração e conciliação                    | não aparece no brain                                    |
| Fechamento MANUAL (TNP) x AUTOMÁTICO (LI)                           | regra por loja                              | sistema trata igual                                     |
| Taxonomia GRUPO > FAMÍLIA > CATEGORIA                               | modelo de produto                           | ERP tem 2 níveis                                        |
| Último fornecedor e fabricante por produto                          | Compras                                     | ERP não tem vínculo produto↔fornecedor                  |
| 9.920 produtos na base                                              | escala                                      | listagem do ERP não tem busca nem paginação no servidor |
| Domínio de produção (demanda, etapa, balcão, receituário com cargo) | escopo novo                                 | inexistente no ERP e no backlog                         |
| Preço por canal (loja x delivery)                                   | Cadastro de Produtos                        | modelo atual tem um preço só                            |
| Conciliação bancária já desenhada em planilha                       | G8                                          | processo pronto para portar                             |

---

## §9 · Regras candidatas a registro (a confirmar com o Rodrigo)

Não registrei nenhuma no `19` ainda — todas vieram de leitura de planilha, não de decisão declarada.
Precisam de confirmação antes de virar R-nnn:

1. As contas da operação são cinco, nomeadas, e incluem COFRE TROCO, FLUXO CAIXA e DIRETOR FINANCEIRO.
2. Todo lançamento tem tipo de documento contábil (`DOC/NF` ou `DOC/F`) e competência (anterior/atual).
3. Taxa de cartão é por bandeira × tipo × operadora, com vigência, percentual, valor por transação e
   ciclo de repasse.
4. As formas de pagamento são dinheiro, crédito, débito, voucher e PIX.
5. Venda em dinheiro é apurada por turno (manhã/tarde).
6. O fechamento do PDV é manual na TNP e automático na Lisboa.
7. Produto tem três níveis de classificação, mais fabricante e último fornecedor.
8. Produto pode ter preço distinto por canal de venda.
9. Produto de fabricação própria tem receituário com nível e cargo do executor.

---

## §10 · O que eu não fiz

- Não li linha a linha as abas com mais de mil registros — delas extraí cabeçalho, contagem e
  vocabulário de coluna.
- Tratei `(LI)` e `(HORA)` como duplicatas estruturais de `(TNP)`. **Não confirmei** que os grupos e
  as contas são os mesmos nas três lojas — e o caso do fechamento manual x automático mostra que
  divergem em pelo menos um ponto.
- Não decifrei o layout posicional do `.txt` campo a campo. Para isso preciso do dicionário de layout
  do ERP legado, ou de cruzar várias linhas com produtos conhecidos.
- Não li as fórmulas das planilhas — o CSV entrega valor calculado, não a fórmula. As fórmulas de
  `CONCATENAR`, `CONCATENAR P/EXT.` e das abas `VLD SAIDA` são o mecanismo de exportação para o
  sistema, e valeriam uma leitura própria.
