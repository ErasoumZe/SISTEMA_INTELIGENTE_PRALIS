# 21 · Decisões da reunião de 04/08/2026 — Marco × José

> Reunião de 3h43, transcrita automaticamente (Gemini, 81 páginas). Participantes: **Marco**
> (colaborador novo, entrando no projeto) e **José** (dono técnico). O Rodrigo não participou.
>
> Esta reunião é o **onboarding do Marco** e a primeira em que o escopo de Compras, Estoque e
> Relatórios foi descrito em voz alta. Por isso ganhou arquivo próprio, e não só linhas no `19`.
>
> As regras que saíram daqui estão registradas em `19_REGISTRO_DE_REGRAS.md` como **R-137 a R-151**.
> Este documento guarda o **contexto** delas e, principalmente, o que **não** foi decidido.

---

## §1 · Aviso sobre o resumo que circulou

Um resumo desta reunião foi produzido pelo Codex e circulou antes deste documento. Ele está
majoritariamente correto, mas contém quatro distorções que já custaram confusão. Corrigidas aqui:

| O resumo dizia                                                         | O que a reunião disse                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5 etapas: Caixa → Produtos → Estoque → Compras → Relatórios            | **3 etapas.** Compras é guarda-chuva: engloba cadastro de produtos, estoque, pedidos e uma tela de venda. Produtos e Estoque **são a primeira parte de Compras** (p. 40-41, 50)                |
| "Nada na main sem teste, revisão e aprovação do José"                  | O acordado foi **"rodar local + OK do José"**. Teste formal, PR e code review **não foram acordados** — o bloco 6 do roteiro, que tratava exatamente disso, foi adiado (p. 72)                 |
| Log de auditoria é "melhoria prioritária"                              | José disse apenas _"seria bom implementar esses negócios"_ (p. 69). Ninguém chamou de prioridade                                                                                               |
| Relatórios com comparação entre unidades e drill-down até o lançamento | São **perguntas em aberto**, lidas do roteiro e adiadas. O pedido concreto do Rodrigo é só **Curva ABC por setor, grupo, produto e hora** (p. 57-58). Gráficos e filtros são proposta do Marco |

Duas omissões relevantes do resumo, ambas graves:

- **A regra estrutural mais forte da reunião não apareceu:** _"todo o dinheiro que existe dentro do
  sistema precisa estar vinculado em alguma venda"_ (p. 34), e _"não existe transferência sem fundo
  na conta de origem"_ (p. 35). Virou **R-143**.
- **A transferência de retorno no fechamento NÃO foi implementada** por indefinição de regra — é um
  buraco funcional no módulo que o resumo chama de "pronto" (p. 29).

---

## §2 · O que foi decidido (R-137 a R-151)

Enunciado completo, origem e status estão em `19_REGISTRO_DE_REGRAS.md`. Resumo:

**Transferência e lacre**

- **R-137** — Transferência entre contas bancárias não exige lacre. É a única exceção à
  obrigatoriedade do lacre na ida (R-025).
- **R-138 (histórica, superada pela R-188 em 12/09/2026)** — registrava tempo obrigatório com
  múltiplos destinos. A regra vigente é o oposto: múltiplo destino não admite prazo; prazo é
  opcional somente na transferência direta.
- **R-139** — Divergência de valor no recebimento é resolvida **fisicamente, fora do sistema**. O
  sistema registra observação e notifica quem enviou e quem recebeu. Não há acerto automático.
- **R-140** — Só a transferência de **retorno** é feita pelo operador de caixa. Toda saída do cofre e
  qualquer outra movimentação entre contas é da tesouraria, com algumas da gerência.

**Caixa**

- **R-141** — A abertura registra **data, hora, usuário, PDV, turno e número do lacre — e nada além**.
  O aprovador é gravado só em banco, invisível para o operador; aparece para o tesoureiro no momento
  da aprovação, junto da data de recebimento e do valor.
- **R-142** — A **abertura** não exige aprovação de terceiro. Exigem: **diferença, edição e alteração
  de horário** — autorizadas por admin, gerência ou diretor geral.
- **R-143** — **Todo dinheiro dentro do sistema precisa estar vinculado a alguma venda**, e não
  existe transferência sem fundo na conta de origem. É a regra estrutural do modelo do Rodrigo.

**Produto, estoque e compras**

- **R-145** — A fonte do cadastro de produtos é a **planilha do Rodrigo**, não o cadastro do CREARE.
  **Os dados fiscais da planilha NÃO serão importados** — estão errados e são a origem de pagamento
  de imposto a maior. O Rodrigo trará os corretos.
- **R-146** — Produto tem dois tipos: **revenda** e **transformação**. Preço de venda é
  custo × margem, com opção de desmarcar e digitar manualmente.
- **R-147** — A promoção só se aplica se o produto estiver cadastrado, com o **mesmo código** e
  **dentro da janela de vigência**. Fora dela, volta o preço normal.
- **R-148** — Pedido automático dispara ao bater o estoque mínimo, na quantidade que falta para
  chegar ao máximo. **O comprador é sempre quem aprova ou reprova** qualquer pedido, e pode deixar um
  rascunho que se auto-aprova quando o mínimo for atingido.

**Relatórios e IA**

- **R-149** — Relatório de vendas por **Curva ABC** nos cortes **setor, grupo, produto e hora**.
  Pedido explícito do Rodrigo.
- **R-150** — **Dados pessoais, documentos e informações financeiras não vão para APIs externas de
  IA.** Isto limita diretamente as ideias de transcrição de voz e leitura de nota fiscal.

**Processo**

- **R-144** — Prioridade: **1º Caixa · 2º Compras** (cadastro de produtos, estoque, pedidos, tela de
  venda) **· 3º Relatórios**. A prioridade máxima logo após o Caixa é _cadastro de produto com
  estoque_.
- **R-151** — Marco trabalha em **branch separada**, não commita na `main` sem rodar local e sem o OK
  do José, e não cria padrão novo sem autorização.

---

## §3 · Bugs relatados ao vivo durante a reunião

Estes apareceram na tela, na frente dos dois. Nenhum foi consertado ainda.

| Id   | Problema                                                                                                                                                       | Onde apareceu |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| B-01 | **Criar novo usuário sempre falha** com "e-mail já existe"                                                                                                     | p. 10         |
| B-02 | **Recuperação de senha quebrada:** o link do e-mail devolve à tela de login. Nenhum dos dois links funciona                                                    | p. 10-11      |
| B-03 | **Admin não consegue trocar a senha de um usuário existente** — não há a opção                                                                                 | p. 11         |
| B-04 | Campo **"colaborador" aparece indevidamente na aba Mercadoria** (mercadoria é só fornecedor)                                                                   | p. 24         |
| B-05 | Na tela de despesa aparecem **todas as contas**; para o operador de caixa deveria aparecer só a conta do caixa aberto. José não sabe se está correto no código | p. 18-19      |
| B-06 | **Contas de teste local vazaram para o banco de produção**                                                                                                     | p. 6          |
| B-07 | Cadastro de produtos **desatualizado em relação à planilha** (faltam campos novos)                                                                             | p. 48         |
| B-08 | Tela **"pendente de discriminação" é inutilizável** — o filtro não serve                                                                                       | p. 36         |

B-01, B-02 e B-03 juntos impediram o José de demonstrar a transferência ao vivo. São de correção
imediata: sem eles, não é possível sequer criar os usuários de tesouraria, financeiro e comprador
que a operação real exige.

---

## §4 · Escopo descrito por módulo

**Caixa** — único módulo pronto. Abertura (conta do caixa vinda do banco do CREARE, PDV, turno,
lacre, nº de série da maquininha, data/hora editável), abas de Entradas / Transferências / Despesas /
Mercadorias / Retiradas, e Resultado somando em tempo real. **Buraco declarado:** a transferência de
retorno no fechamento não foi implementada, porque a regra para caixa que fecha com déficit ou com
sobra maior que a prevista não existe — nesse caso seria preciso mais uma transferência (p. 29).

**Transferências** — substitui "malote". Estados pendente → recebida (lacre rompido). Suporta
agendamento, múltiplos destinos em disputa, tempo de confirmação e transferências de retorno
pré-programadas com lacre e valor próprios. Observação em texto; **áudio pedido pelo Rodrigo e não
implementado**.

**Cadastro de Produtos** — campos citados: código interno, código de barras, marca, nome, descrição
automática (concatenação de células da planilha), grupo/subgrupo, unidade e quantidade individual,
"como se compra" (embalagem + quantidade, ex. _fardo com 12 unidades_), tipo, status, custo, margem,
preço automático ou manual, impostos (a definir), promoção (valor ou %, data/hora de início e fim,
dias da semana) e foto do produto. Falta tela de **busca e edição** — hoje não dá para dar desconto
num produto sem recadastrá-lo.

**Estoque** — hoje mora dentro do cadastro de produtos porque a planilha é assim. Campos: saldo,
mínimo, máximo, setor do estoque (produção, prateleira, vitrine, geladeira) e locais de venda
(múltiplos). Usos: reposição, conferência física, detecção de furo e gatilho do pedido automático.
**Nada disso funciona hoje porque não há dado cadastrado.**

**Compras / Pedidos** — tela embrionária. Pedido manual (inclusive para urgência no meio do dia) e
automático. O comprador vê estoque atual/mínimo/máximo e fornecedor e decide. **O elo com o
fornecedor é o buraco:** hoje é telefone, visita ou o site de um fornecedor específico, e isso nunca
foi conversado com o Rodrigo.

**Relatórios** — existem dois básicos (vendas com quebra por forma de pagamento; produtos mais
vendidos). O alvo é a Curva ABC (R-149). O José pediu explicitamente a ajuda criativa do Marco nesta
tela.

**Permissões** — estado declarado como **não confiável**. Precisa de conferência completa. Objetivo:
_"um usuário não poder movimentar uma quantia de uma conta que não deveria"_.

**IA** — nada implementado. Quatro ideias: observação por voz transcrita, foto da nota → extração dos
itens → preenchimento da discriminação, abrir a câmera direto do sistema, confronto por código de
barras contra o cadastro. Marco foi explícito: _"preparação para inteligência artificial não é um
assunto que eu quero tratar agora"_ (p. 76-77).

---

## §5 · Perguntas que ficaram em aberto

Nenhuma destas tem resposta. Não invente uma.

| Pergunta                                                                                  | Depende de                 |
| ----------------------------------------------------------------------------------------- | -------------------------- |
| O robô traz o campo **operador**?                                                         | José verificar             |
| Que nível de detalhe da venda o Rodrigo quer ver na sessão de caixa?                      | Rodrigo                    |
| Como o **pedido chega ao fornecedor**? (hoje telefone/visita/site)                        | Rodrigo                    |
| Como integrar os **PDVs que não são do CREARE**?                                          | José                       |
| Quais agrupamentos entram na **Curva ABC**?                                               | Rodrigo                    |
| "Aprovar a diferença de caixa" = aprovar a diferença ou a transferência de retorno?       | Rodrigo                    |
| Como fica a transferência de retorno quando o caixa fecha com **déficit** ou sobra maior? | José + Rodrigo             |
| **Ficha técnica / receituário** — está no mapa mental e não existe no sistema             | Rodrigo                    |
| A promoção sai do cadastro de produtos e vira botão separado?                             | Rodrigo (a planilha manda) |
| O estoque continua dentro do cadastro de produtos ou ganha menu próprio?                  | Rodrigo                    |
| Divisão de trabalho, rebase, review e a **primeira tarefa do Marco**                      | José (bloco 6, adiado)     |

---

## §6 · Continuidade e infraestrutura da padaria

Dois fatos operacionais que a reunião registrou e que o sistema não resolve sozinho:

1. **Sem no-break e sem redundância de internet, a venda é perdida.** _"Se para a internet do
   servidor ou o computador é desligado. Esquece, não entra venda."_ (p. 62). O agente relê o dia
   corrente inteiro a cada ciclo, o que recupera o que ficou no CREARE — mas se o servidor está
   desligado, nada roda. O Rodrigo já está buscando no-break e switch de duas internets.
2. **Erro humano no PDV** (débito passado como crédito) gera divergência por forma de pagamento e
   **só será resolvido pela conciliação da maquininha**, que não está pronta (p. 67).

---

## §7 · Sobre os bugs históricos do robô

O José relatou três, todos declarados corrigidos:

- **Pagamento dividido contado 2× ou 3×** — meia venda no crédito e meia no débito computava a venda
  inteira duas vezes. Chegou a dar ~R$ 1.000 de diferença.
- **Fuso horário + reprocessamento** gerando divergência.
- **Robô mais lento que o volume de vendas** — faltava venda ou ela caía no caixa seguinte.

Ele mesmo relativizou: _"Vale uma revisão, mas a princípio tava funcionando 100%"_ (p. 64).

A auditoria de 05/08 (`22_AUDITORIA_STACK_2026_08_05.md`) mostra que **o desenho atual do pagamento
dividido está correto** (1 requisição por venda com N pagamentos, `DELETE`+reinsert no update), mas
que **não existe um único teste com mais de uma forma de pagamento** para provar isso — e que
permanece aberto um mecanismo capaz de duplicar venda por corrida na ingestão (risco A-01).
