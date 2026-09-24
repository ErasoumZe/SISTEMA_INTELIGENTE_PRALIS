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
| D9  | Foto da nota = **anexo de conferência e fonte opcional de leitura assistida por IA**. A descrição automática continua casando **EAN → cadastro** e a IA nunca salva nem confirma o lançamento                                                                                                                     |
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

## 3. Seeding — fontes REAIS da planilha (corrigido em 30/07)

> ⚠️ **A versão anterior desta seção estava ERRADA.** Ela foi montada lendo só a aba `GRUPOSREF`,
> que é a lista de referência que alimenta os **dropdowns** — não o cadastro. Os dados de verdade
> estão em **abas dedicadas por empresa**, e cada linha delas é um **lançamento**, não um grupo.
> O erro foi meu (assistente), não do José. Verificado abrindo o arquivo em 30/07.

**Arquivo correto:** `CICLUZ GP - LANÇAMENTO (VND_MER_DES_RET).xlsx` (a operacional, 43 MB).
Não confundir com `CENTRAL PRODUTOS (BASE)`, que é o cadastro de produtos — e cuja cópia sem
o sufixo `(1)` está **corrompida** (`#REF!` nas abas que importam). Use a com `(1)`.

| Alvo no sistema       | Aba correta                          | Onde está                     | Medido em 30/07             |
| --------------------- | ------------------------------------ | ----------------------------- | --------------------------- |
| Grupos de despesas    | `(TNP) GRUPO DESPESAS`               | col. **G**, distintos         | **75 grupos** / 1.664 lanç. |
| Grupos de retiradas   | `(TNP) GRUPO RETIRADAS`              | col. **G**, distintos         | **3 grupos** / 17 lanç.     |
| Grupos de mercadorias | `(TNP) GRUPO MERCADORIAS`            | col. **G**, distintos         | a extrair (aba de 34 MB)    |
| Contas                | `(TNP) SALDOS CONTAS`                | —                             | a extrair                   |
| Patrimônio            | `(TNPLIHORA - EXP.) PATRIMONIO`      | col. F/G/H/I/J                | 32 linhas                   |
| Setores/Cargos        | `(TNPLIHORA - EXP.) FOLHA PAGAMENTO` | col. G/I/N/O/P/Q/R/S/T/U/V    | 36 linhas                   |
| Produtos              | `CENTRAL PRODUTOS (BASE) … (1).xlsx` | aba `(TNP) CADASTRO PRODUTOS` | com código de barras        |

**Layout das abas de lançamento** (idêntico nas três — despesas, retiradas, mercadorias):

| Col | Cabeçalho (linha 5)                 | Vira, no sistema                                                    |
| --- | ----------------------------------- | ------------------------------------------------------------------- |
| B   | `PLANILHA` (`TNP - DES`)            | empresa + domínio                                                   |
| C   | `DATA REF`                          | data de referência                                                  |
| F   | `CONTABIL` (`DOC/F`/`DOC/NF`)       | **é por LANÇAMENTO**, não por grupo — casa com o campo fiscal do S2 |
| G   | `GRUPO DESPESA` / `GRUPO RETIRADAS` | **o grupo** (fonte do seeding)                                      |
| H   | `FORNECEDOR / COLABORADOR`          | **o credor tipado** (R-046)                                         |
| I   | `DISCRIMINAÇÃO`                     | descrição do item                                                   |
| J   | `OBS:`                              | observação / nº da parcela                                          |
| K   | `VENCIMENTO`                        | data de vencimento                                                  |

> As colunas H e F provam que o desenho do Rodrigo (FOTO 2) **é a planilha**: credor tipado e
> documento fiscal já existem lá desde sempre.

### Decisões do José (30/07)

| Ponto                     | Decisão                                                                                                                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hierarquia dos grupos** | **Quebrar em pai e filho.** `DES ⁠MANUT. EMPRESA - MAT. E PECAS MÁQ./EQUIP.` vira pai `MANUT. EMPRESA` + filho `MAT. E PECAS MÁQ./EQUIP.`. Usa o `grupoPaiId` que já existe. Sem isso, relatório não soma por categoria — que é o que a planilha faz hoje |
| **Quantos importar**      | **Todos os 75**, mas os de baixo uso entram **inativos** — não aparecem no dropdown até alguém ativar. Nada se perde e a tela fica limpa                                                                                                                  |
| **Investimento**          | **Investimento É retirada**, confirmado. Comprar freezer ou balança entra como retirada, não despesa nem mercadoria. É por isso que a retirada se liga ao cadastro de patrimônio                                                                          |
| **Correção do enigma**    | Nunca existiu coluna com prefixo `RET`. A col. **V** da `GRUPOSREF`, que esta seção chamava de "tipos de produto", é a lista de **grupos de retirada** (os `INVESTIMENTO - …`)                                                                            |

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

## 6. Decisões tomadas na implementação (30/07) — ficam aqui, não no prompt

Ambiguidades que o briefing não fechou e que o José decidiu ao revisar o S5:

| Ponto                                    | Decisão                                                                                                                         | Por quê                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"3 em 3"** (frequência do desenho)     | **trimestral** (a cada 3 meses)                                                                                                 | leitura natural em conta a pagar: água, seguro, IPTU                                                                                                                   |
| **Dias da semana**                       | só valem e só aparecem na frequência **semana**; descartados nas demais                                                         | "toda terça" não significa nada numa série mensal                                                                                                                      |
| **"Número de repetições"**               | é o **TOTAL**, já contando o lançamento sendo criado ("repetir 3" = 3 na tela)                                                  | é como Mobills conta; quem digita 12 espera o ano fechado, não 13                                                                                                      |
| **DOMINGO na recorrência**               | **incluído** (ISO 7), além dos 6 dias do rascunho                                                                               | **decisão do José, não do desenho:** o rascunho do Rodrigo tem Sg..Sa, mas a padaria abre domingo — costuma ser o dia mais forte. O banco já aceitava 7; era só a tela |
| **Teto da série**                        | **12 meses** a partir da 1ª data, sempre                                                                                        | protege do erro de digitação (999 diárias) e do lançamento futuro que ninguém lembra por que existe                                                                    |
| **Filtro do saldo da conta (D8)**        | `computar = true AND status <> 'cancelado'`, e `valor_original` puro fora da venda                                              | **igual ao ADR-001 do saldo do caixa**: duas fórmulas de dinheiro com filtros diferentes viram divergência inexplicável entre as duas telas                            |
| **Auditoria de venda cancelada (R-204)** | venda com `status = cancelado` aparece separada no Caixa, com horário, valor líquido e produtos; nunca como lançamento ou total | operador e gerência precisam localizar o cancelamento que retirou uma entrada sem induzir a leitura de que o dinheiro ainda integra o malote                           |
| **Grupo do item (§5)**                   | as duas origens são **mutuamente exclusivas permitindo os dois nulos**                                                          | item sem grupo sempre foi aceito e o histórico está cheio deles                                                                                                        |
| **Vínculo usuário × conta**              | editado **no cadastro da CONTA**; o caminho pela tela de Usuários foi removido                                                  | D8 põe fundo e usuários no mesmo salvar; manter os dois lados seria a segunda rota para o mesmo ato                                                                    |

### R-192 — Leitura assistida da nota fiscal por IA (14/09/2026)

- A leitura por IA vive no **único bloco de discriminação existente**, portanto atende Despesas e
  Mercadorias em criação, edição e pendência. Retirada continua sem discriminação (R-050) e
  Entradas continuam sendo vendas integradas somente para consulta (D7/R-062).
- O preenchimento manual permanece inteiro. A IA devolve uma **sugestão revisável**; aplicar a
  sugestão não cria, não confirma e não salva lançamento.
- A foto analisada reutiliza a segunda foto do lançamento (`foto_nota_url`, nota com os itens) e só
  é persistida pelo salvar já existente.
- Fornecedor só é selecionado quando o CNPJ casa com cadastro da mesma empresa. Produto só é
  vinculado quando o EAN casa. Em Despesa, o usuário ainda precisa relacionar cada linha a
  Patrimônio ou Colaborador (R-135).
- Número, emissão, itens, quantidades, valores, desconto, frete, total, série e chave da NF-e são
  extraídos. Série, chave e frete ficam na conferência porque não há campo compatível no modal;
  frete jamais é colocado em Juros.
- A chave do Gemini existe somente no backend e em `.env.local` ignorado pelo Git. Imagem, prompt,
  resposta bruta e segredos não vão para log. A chave fiscal é usada para duplicidade no backend e
  volta apenas mascarada.
- Falha de rede, imagem ruim, resposta incompleta ou IA indisponível não apaga valores manuais nem
  o anexo selecionado.

### R-208 — Retorno/sangria pendente e fechamento do caixa (24/09/2026)

- Uma transferencia de retorno ou sangria ja executada permanece visivel e auditavel para a
  Tesouraria, mas nao bloqueia o fechamento do caixa.
- A conferencia fisica posterior e a divergencia pertencem a trilha da transferencia; a
  Tesouraria identifica o operador que abriu o caixa e trata a ocorrencia internamente.
- Transferencia de retorno **planejada** continua bloqueando o fechamento, porque o dinheiro
  ainda nao saiu do caixa.
- O responsavel declarado em uma sangria e sempre o operador registrado na abertura do caixa;
  o cliente nao pode substitui-lo no payload.

## 7. Fora deste escopo (congelado)

Transferências (regras já definidas) · Entradas (integração pronta — só a listagem do dia D7) ·
Cockpit/abertura (consolidação própria).
