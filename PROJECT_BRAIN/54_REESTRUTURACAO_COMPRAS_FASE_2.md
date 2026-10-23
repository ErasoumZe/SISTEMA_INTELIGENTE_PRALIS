# 54 — Reestruturação de Compras: Fase 2 (rodada multi-fornecedor)

> Decisões de José em 20/10/2026, tomadas uma a uma para resolver os conflitos e as ausências de
> regra que o documento 53 listava como pendentes. Este documento é o contrato da Fase 2. Nenhuma
> migration foi gerada; nenhuma linha de produção foi tocada. Cada migration da Fase 2 é um gate
> próprio: o SQL integral é apresentado e aprovado antes de o arquivo existir.

## Fluxo-alvo

`necessidade sem fornecedor → rodada de cotação multi-fornecedor → convites → respostas versionadas → vencedor por item → compra consolidada por fornecedor → (separação → recebimento/NF → estoque/financeiro, fases seguintes)`.

A Fase 2 entrega da necessidade até a compra consolidada. Separação, NF/Contas a Pagar, recorrência,
conferência física e painel/ABC ficam para depois; a Fase 2 deixa os ganchos, não as telas.

## As 14 decisões (contrato)

1. **Compra automática é pré-autorização.** Definir o preço-base já é a autorização de compra. No
   envio da resposta, item cujo custo final seja menor ou igual ao preço-base nasce **comprado e
   confirmado**, sem passar pelo Comprador. Acima da base, ou sem base, vai para decisão do Comprador.
   A R-216 recebe nota de revogação parcial: "quem confirma é o Comprador" passa a valer para o que
   está **fora** do envelope pré-autorizado.
2. **Um mecanismo só.** O pedido manual de fornecedor único vira uma rodada com um único fornecedor
   convidado (`origem='rapida'`). O atalho "pedido rápido" continua na tela; o segundo caminho que
   gerava compra deixa de existir (regra-mãe, DoD item 1).
3. **Prazo.** `empresas.compras_prazo_resposta_horas` vence quando configurado; sem configuração,
   mantém os 2 dias úteis da R-216; o comprador pode sobrescrever por rodada.
4. **Fuso.** `empresas.fuso_horario` vale **só em Compras** (vencimento da rodada, agenda). Caixa,
   fechamento e dia de negócio continuam em `America/Sao_Paulo` fixo. A função de prazo recebe o fuso
   como parâmetro obrigatório; a rodada guarda o fuso em snapshot na abertura.
5. **Frete.** O fornecedor informa um valor de frete por proposta. O sistema rateia pelo maior resto
   (função `ratear` já existente) **apenas entre os itens daquela proposta que estavam livres no
   instante do envio**, calculado dentro da transação travada. O frete rateado entra no custo final
   comparado com a base e na base vigente quando a rodada fecha. É fórmula de dinheiro.
6. **Fechamento.** A rodada fecha sozinha no vencimento do prazo. O comprado fica comprado; item sem
   resposta ou só com proposta acima da base cai numa fila de decisão do Comprador; a solicitação fica
   `parcialmente_comprada`.
7. **Contraproposta versionada.** O Comprador contrapropõe; o convite volta a aberto com o **mesmo
   token**; o fornecedor aceita (versão N+1 dele, que atravessa o mesmo portão de compra automática) ou
   responde de novo. Cada volta é uma versão com autor, hora e valor; nada sobrescreve. Sem limite de
   voltas além do prazo. Contraproposta não é tabela nova: é versão com `autor_tipo='comprador'`.
8. **O fornecedor vê só o último valor pago a ele mesmo.** Nunca proposta de concorrente, nunca o
   preço-base. Item já comprado aparece como `comprado`; o resto como `em_analise` (que cobre "acima da
   base" e "sem base", para não revelar a direção da base) ou `nao_cotado`. Isolamento é invariante de
   tipo e de topologia de join, não disciplina de chamador.
9. **Separação e recebimento são dois números.** O fornecedor declara a quantidade separada
   (expectativa; fora da tolerância exige aprovação antes de sair). O recebimento conferido na porta
   segue sendo a **única** entrada de estoque (R-213 intacta). A separação em si é fase posterior.
10. **Permissões.** Criar solicitação reusa `pedidos_criar`; abrir/enviar rodada reusa
    `pedidos_editar`; aprovar exceção acima da base é permissão nova `compras_excecao_aprovar` (Compras,
    Gerência, Admin); receber continua `pedidos_aprovar`.
11. **Fornecedor.** Ganha coluna `situacao` (ativo/inativo, default ativo, padrão de `produtos.status`).
    WhatsApp segue opcional no cadastro; a obrigatoriedade vale no ato de convidar — sem WhatsApp
    válido o fornecedor aparece no seletor, mas o convite fica bloqueado nomeando o campo que falta.
12. **Base no fechamento = só o custo de quem venceu.** A base vigente nova é o custo final do item
    efetivamente comprado, não o menor de todas as propostas. É preço que a padaria pagou, reproduzível
    contra nota e compra; uma oferta baixa de quem não venceu não aperta a rodada seguinte. Ajusta a
    leitura literal da R-218.
13. **Cancelamento não re-licita.** Cancelar um pedido nascido de compra automática **não** libera o
    item para nova adjudicação na mesma rodada. Compra desfeita vira nova solicitação. A chave única
    dura de `compras_adjudicacoes(rodada_item_id)` é o que torna "resposta tardia nunca substitui compra
    realizada" (R-218) uma garantia de banco.
14. **Freio da compra automática: aviso no mesmo dia + teto por rodada.** Toda compra automática cai no
    sino de pendências na hora (`compras_decisao_pendente`). Cada rodada carrega um teto de valor total:
    estourado o teto, a compra automática para e o restante vai para decisão do Comprador. Dois freios
    independentes — um avisa, um limita o dano —, nenhum depende de alguém estar olhando a tela.

Decisões herdadas, já vigentes: R-219 (seletor múltiplo com cadastro rápido), R-220 (leitura pt-BR do
custo; custo zero e produto inativo fora da base).

## Entidades novas

Convenção: prefixo `compras_`, `empresa_id` em toda tabela, FK composta `(filho_id, empresa_id)` →
`(pai_id, empresa_id)` fechando o buraco que `pedidos_itens` tem hoje. Nomes de tabela-neto curtos
(`compras_convites_itens`, `compras_propostas_itens`) porque o Postgres trunca identificador em 63
bytes em silêncio.

- `compras_solicitacoes` + `compras_solicitacoes_itens` — necessidade sem fornecedor. `UNIQUE
(solicitacao_id, produto_id)` torna "produto repetido" invariante de banco.
- `compras_rodadas` + `compras_rodadas_itens` — a rodada e o **envelope congelado** da pré-autorização
  (quantidade e preço-base no instante da abertura, imutáveis enquanto os fornecedores respondem).
  `UNIQUE parcial (solicitacao_id) where status='aberta'` sobe a unicidade um nível: uma rodada aberta
  por solicitação, N convites abaixo dela.
- `compras_rodadas_convites` + `compras_convites_itens` — convite por fornecedor e os itens atribuídos
  a ele (R-219). `compras_convites_itens` é a fronteira física do isolamento comercial: toda leitura
  pública parte do convite e desce por ela.
- `compras_propostas` + `compras_propostas_itens` — resposta versionada. Fornecedor e contraproposta do
  Comprador no mesmo livro, distintos por `autor_tipo`. `custo_final_unitario` é gravado, não
  recalculado na leitura.
- `compras_adjudicacoes` — vencedor por item. `UNIQUE (rodada_item_id)` é a invariante central da fase.

Não viram tabela: contraproposta (versão de proposta), fila de decisão (consulta derivada), pedido
rápido (`origem='rapida'`), compra consolidada (`pedidos`/`pedidos_itens` reusados), histórico de
preço-base (`produtos_precos_base` já é temporal), token (`token_hash` no convite), permissão nova
(linha no seed, não migration de estrutura).

Alterações em tabelas existentes: `fornecedores.situacao`; `pedidos.tipo_check` aceita `'rodada'` +
colunas `solicitacao_id`/`rodada_id` + unique parcial de consolidação `(rodada_id, fornecedor_id) where
status='confirmado'`; `pedidos_eventos.proposta_id` + CHECK de autor alargado; `produtos_precos_base`
ganha `rodada_id` e larga `referencia_externa` (era placeholder); novo tipo de notificação
`compras_decisao_pendente`.

## Como o pedido nasce confirmado (hoje impossível)

Hoje `criarPedidoRepository` força `a_fazer`, a tabela de transições só tem `a_fazer → cancelado` e
`pedidos_tipo_check` não conhece `'rodada'`. A Fase 2 acrescenta `criarPedidoDaRodadaRepository`, que
insere `status='confirmado'`, `tipo='rodada'` e grava o evento `confirmado` com a **proposta do
fornecedor** como autor (modo automático, sem humano) ou com o aprovador (modo comprador). O
`pedidoSituacaoPayloadSchema` estreita de `['confirmado','cancelado']` para `['cancelado']` — é a prova
mecânica de que "quem confirma é o Comprador" foi revogado dentro do envelope.

## Isolamento comercial como invariante estrutural

Hoje o recorte anti-vazamento é um ternário de argumento (`cotacoes.service.ts:100`) com `fornecedorId:
string | null` — o `| null` é o vazamento. A Fase 2:

- dois módulos de repositório disjuntos (`rodada-publica.repository.ts` vs `rodada.repository.ts`), com
  regra nova em `scripts/verificar-arquitetura.mjs` que **quebra o build** se o módulo público importar
  o do comprador ou tocar preço-base/adjudicação;
- um tipo marcado `ConviteAutenticado`, cunhável só por `autenticarConvitePorToken`; quem tem só um
  uuid não compila a chamada;
- a consulta de "último valor" perde a válvula nula: duas funções sem assinatura compartilhada, uma
  por fornecedor (tipo marcado) e outra por empresa (módulo do comprador, inalcançável do público);
- DTOs públicos que não carregam `precoBase`/`concorrentes`/`vencedor`.

## Concorrência

Ordem canônica de travas: advisory por rodada (`sqlTravarRodadaDeCompras`, em `db/src/sessao.ts`) →
rodada `FOR UPDATE` → convite `FOR UPDATE` pelo hash → itens do envelope ordenados por id → pedido alvo
da consolidação → produtos (só no recebimento, intocado). Dois fornecedores no mesmo item: o segundo
espera na advisory, lê a adjudicação do primeiro e segue sem comprar; a resposta dele fica gravada como
referência. Violação do `UNIQUE (rodada_item_id)` é quebra de invariante (409 + log), nunca caminho
normal — é o teste central da fase. Fechamento por vencimento: agendador in-process no molde de
`processarTransferenciasTemporais`, uma transação por rodada, idempotente entre ticks.

## Teto de estoque sob fan-out

O bug atual (teto validado por pedido, não pelo conjunto) fecha em três camadas: `UNIQUE
(solicitacao_id, produto_id)`, `UNIQUE (rodada_item_id)` e uma validação pelo conjunto da rodada
(função pura nova, usada na abertura e em cada adjudicação, com a quantidade congelada do envelope).
Buraco que permanece, dito na cara: duas rodadas simultâneas de solicitações diferentes com o mesmo
produto ainda podem estourar o teto em conjunto — é o mesmo buraco de hoje e fechá-lo exige trava
advisory por empresa, que serializaria toda compra. Não fechado nesta fase.

## Ordem de implementação (entregas verticais)

E0 gate de migration M1 (SQL integral, zero código) · E1 fornecedor situação + WhatsApp no convite ·
E2 solicitação sem fornecedor · E3 rodada + convite múltiplo + envio · E4 resposta versionada +
isolamento estrutural · E5 compra automática + adjudicação atômica + pedido confirmado · E6 fechamento

- fila + exceção · E7 contraproposta · E8 remoção final e morte da flag `COMPRAS_NOVO_FLUXO`.

Cada entrega é tela + backend + teste + remoção do antigo. Endpoints aposentados ao longo do caminho:
`POST /api/pedidos`, `PUT /api/pedidos/:id`, `POST /api/pedidos/gerar-sugestao`, `POST
/api/pedidos/:id/cotacoes`, as rotas públicas `/api/cotacao*` e a opção `'confirmado'` de `/situacao`.
Sobrevivem: listar/ver pedido, receber, cancelar.

## E6 — fechamento, fila de decisão e exceção (executado em 21/10/2026, sem migration)

Decisões de José tomadas ao planejar o E6, além das 14 acima:

- **Base só de compra automática.** Ao fechar, a base vigente de cada item comprado **automaticamente**
  passa a ser o `custo_final_unitario` da adjudicação (`origem='rodada'`, `rodada_id`); a anterior
  recebe `valido_ate`. Custo zero e produto inativo ficam fora (R-220). Compra aprovada pelo Comprador
  **não** vira base. A reconciliação ao centavo do frete rateado (item "Ainda sem decisão") segue
  pendente com Rodrigo e **não** foi resolvida por esta entrega.
- **Sobra na fila:** "Encerrar solicitação" (`parcialmente_comprada → encerrada`, só depois do
  fechamento) ou "Nova solicitação com os pendentes" (reusa o formulário do E2). Sem segunda rodada.
- **A rodada fecha no prazo, ou quando o Comprador a encerra** ("Encerrar rodada agora", motivo
  `comprador`, `pedidos_editar`; decisão de José em 21/10, depois de o plano original dizer "só no
  prazo"). Rodada com tudo comprado fica `aberta` até um dos dois: não há fechamento automático ao
  completar (o schema não tem motivo para isso).
- **A exceção do Comprador só vale com a rodada FECHADA** (decisão de José em 21/10). Com a rodada
  aberta, aprovar travaria o item (`UNIQUE (rodada_item_id)`) contra uma oferta melhor que chegasse
  depois; o caminho do período aberto é a contraproposta (E7). Compra urgente: "Encerrar rodada
  agora". Efeito: depois do fechamento não há mais compra automática, então exceção e compra
  automática nunca disputam o mesmo item.

Como ficou (comportamento, não intenção):

- **Fechamento** (`compras-fechamento.service.ts`): agendador de 60s em `server.ts`; uma transação por
  rodada (advisory da solicitação → rodada `FOR UPDATE`); revalida `status='aberta'` e prazo, então o
  tick é idempotente. Rodada → `fechada` (motivo `prazo`, sem autor humano); convites → `encerrado`;
  solicitação → `comprada` (todos os itens com vencedor) ou `parcialmente_comprada` (também quando
  nada foi comprado — o contrato não tem outro estado); sino `compras_decisao_pendente` se sobrou item.
  A troca da base serializa pela trava de preço-base da empresa e ignora compra automática cujo pedido
  foi cancelado. A compra automática passou a avisar o sino a **cada** compra (decisão 14 literal; era
  só quando sobrava item) e a reler o status da rodada sob a trava e a versão mais recente do convite.
- **Fila** (`GET /api/compras/rodadas/:id/decisoes`): itens do envelope sem adjudicação, com motivo
  (`sem_resposta`, `indisponivel`, `custo_nao_calculado`, `sem_base`, `acima_da_base`, `teto`) e a
  última proposta enviada de cada fornecedor. O Comprador vê todas; o link público continua isolado.
- **Aprovar exceção** (`POST .../decisoes/aprovar`, permissão `compras_excecao_aprovar`: Compras,
  Gerência, Admin): só com a rodada fechada (422 `RODADA_ABERTA` antes disso); só a **última versão**
  enviada do fornecedor;
  cria/reusa o pedido consolidado (rodada, fornecedor) e grava adjudicação `modo='comprador'` com
  `aprovado_por`. Item já vendido → 409 (`UNIQUE (rodada_item_id)`). Proposta sem custo gravado não
  se aprova (422 `CUSTO_NAO_CALCULADO`): não se inventa o rateio do frete.
- **Encerrar solicitação** (`POST /api/compras/solicitacoes/:id/encerrar`, `pedidos_editar`) e
  **encerrar rodada** (`POST /api/compras/rodadas/:id/encerrar`, `pedidos_editar`). A leitura da fila
  (`GET .../decisoes`) exige `pedidos_editar` **ou** `compras_excecao_aprovar`: ela mostra preço-base e a
  proposta de todos os fornecedores, então não basta ter a tela de Pedidos.

Limites conhecidos, ditos na cara:

- A compra automática roda em transação separada, **depois** de a resposta ser gravada. Uma resposta
  enviada em cima do prazo pode ser gravada e o fechamento entrar antes da compra: o item cai na fila
  (comportamento seguro, não perda).
- O fechamento é aproximado: até 60s depois do vencimento, e no primeiro tick do boot.
- A permissão nova chega aos cargos de **produção** por passo de dados próprio (referência de
  permissões); este documento não o executa.

## E7 — contraproposta versionada (executado em 21/10/2026, sem migration)

Decisão 7 do contrato, sem tabela nova: a contraproposta é uma versão do livro de propostas do convite
com `autor_tipo='comprador'`. Fornecedor e comprador escrevem na **mesma** sequência de versões; nada
sobrescreve.

- **Comprador** (`POST /api/compras/rodadas/:id/convites/:conviteId/contraproposta`, `pedidos_editar`):
  só com a rodada **aberta**, o convite aberto ou aguardando comprador, e depois de o fornecedor ter
  respondido (contraproposta responde a uma proposta). Valor unitário positivo por item; item já vendido
  → 409. O convite volta a `aberto` com o **mesmo token**. Sem limite de voltas além do prazo.
- **Contraproposta vigente** (função pura em `shared`): o que o comprador mandou **depois** da última
  versão do fornecedor. Várias seguidas se somam por item (a mais recente vence no mesmo item). Resposta
  nova do fornecedor **supera** a contraproposta.
- **Fornecedor** (página pública `/rodada`, mesmo link): vê o banner com os valores propostos para
  **ele**, e o andamento de cada item (decisão 8): `comprado` (qualquer vencedor, sem dizer quem nem
  quanto), `em análise` (cobre acima da base e sem base, para não revelar a direção da base) ou sem
  chip. "Aceitar contraproposta" (`POST /api/rodada/aceitar`) vira a **versão N+1 dele**: valor da
  contraproposta onde houver e o que ele já tinha nos demais itens (frete, prazo e condição também).
  Essa versão atravessa o **mesmo portão da compra automática** de qualquer resposta. Ou ele responde de
  novo pelo formulário (que supera a contraproposta).
- **Convite `aguardando_comprador`**: depois da resposta do fornecedor, se sobrou item que a compra
  automática não resolveu, o convite passa a esse estado (o comprador vê quem espera por ele).
- A fila do comprador mostra a contraproposta pendente por proposta.
- O módulo público continua sem importar nada do comprador: o "item já comprado" é **injetado** pelo
  controller (`itensCompradosDoConvite`), devolvendo só ids.

## E8 — remoção do caminho legado, pedido rápido e fim da flag (executado em 21/10/2026, sem migration)

Regra-mãe: nada é pronto enquanto o caminho antigo existir.

- **Removido (backend):** `POST /api/pedidos`, `PUT /api/pedidos/:id`, `POST /api/pedidos/gerar-sugestao`,
  `POST /api/pedidos/:id/cotacoes`, as rotas públicas `/api/cotacao*`, o módulo `cotacoes` inteiro e o
  cálculo de cotação por item da R-216. A opção `confirmado` de `/situacao` morreu (o contrato aceita só
  `cancelado`). Do `shared` sobram só `expiracaoCotacao` e `ratear`, que a rodada usa.
- **Sobrevive:** listar/ver pedido, cancelar e **receber** (a única entrada de estoque, R-213). O pedido
  agora **nasce da rodada, já confirmado** (compra automática ou exceção).
- **Pedido legado em andamento** (a fazer, enviado, retornado), sem migração de dados: leitura
  preservada com selo "legado"; só pode ser **cancelado** (confirmado e recebível continua recebível).
  Quem quiser comprar de novo usa o Pedido rápido ou uma solicitação.
- **Pedido rápido** (decisão 2): `POST /api/compras/pedido-rapido` (`pedidos_criar` **e**
  `pedidos_editar`) cria a solicitação `origem='rapida'` e abre a rodada de **um** convite. O fornecedor
  é validado antes (inativo ou sem WhatsApp não deixa rascunho para trás). Substitui o "Novo pedido
  manual" **e** a "Sugestão de reposição" (o preenchimento pelo mínimo existe no formulário).
- **Flag `COMPRAS_NOVO_FLUXO` removida** (env, controller, compose, `.env.example`, painel,
  `GET /api/compras/fundacao/status`): a fundação (catálogo e preço-base) está sempre ativa.
  **Atenção operacional:** em produção a flag valia `false`, então esta entrega liga a fundação e remove o
  caminho legado **no mesmo deploy**, junto com as migrations 0063/0064. Deploy tem autorização própria.
- O evento de confirmação da compra automática aparece no histórico como "<Fornecedor> (pelo link)".

## Riscos registrados

- A flag `COMPRAS_NOVO_FLUXO` passa a cobrir o caminho principal de compra, não um painel extra; a
  partir de E3 ela escolhe um componente no topo, nunca `v-if` por botão.
- Produção roda com a flag `false`, estado que o e2e não exercita hoje; enquanto a flag existir, um
  spec e2e fixo em `false` percorre o ciclo legado.
- Pedidos legados em andamento no dia da virada: sem migração de dados (ninguém aprovou `UPDATE` em
  histórico). Contar as populações, manter o selo "Legado", oferecer só Receber e Cancelar.
- A compra automática é irreversível por desenho e compra em silêncio: por isso o freio da decisão 14.
- O agendador in-process fecha a rodada até 60s após o vencimento, e no primeiro tick do boot se a API
  estava parada. "Fecha no vencimento" é aproximado, não exato.

## Ainda sem decisão (não inventar)

- Base vigente quando o item comprado tem frete rateado só sobre os livres: confirmar com Rodrigo a
  reconciliação ao centavo antes de E5/E6.
- Item marcado indisponível na versão 1 pode ser cotado na versão 2? (recomendação: sim).
- Fornecedor que, depois da compra automática, diz que não entrega: hoje `pedidos` não tem
  cancelamento por item; buraco herdado.
- Disparo de N convites de WhatsApp sem o navegador bloquear N pop-ups: decisão de UX que afeta E3;
  caminho definitivo é a Meta Cloud API do documento 51.

### Perguntas levantadas na revisão do E6 (21/10/2026) — o código decidiu em silêncio, José confirma

1. ~~**Exceção com a rodada aberta.**~~ **Resolvida por José em 21/10:** só com a rodada fechada, com o
   botão "Encerrar rodada agora" para a compra urgente (ver E6).
2. **"Nova solicitação com os pendentes" × "Encerrar".** A tela agora só oferece a nova solicitação com
   a rodada fechada, mas a antiga continua aprovável por exceção até alguém encerrá-la. Encerrar a antiga
   na mesma ação?
3. **Base só desce** (compra automática ≤ base; exceção não vira base). Quando o fornecedor reajusta
   para cima, o produto nunca mais compra sozinho até reimportar a planilha. É o desejado? Há um
   gatilho manual para subir a base? (R-218 dizia "pode subir ou cair": nota de ajuste no registro.)
4. **Teto da rodada.** Hoje: teto vazio = sem teto; estourado o teto, itens menores que ainda cabem
   continuam comprando (não "para"); a exceção do Comprador não consome o teto; a ordem dos itens que
   disputam o teto é fixa por id do item. Confirmar cada um.
5. **Aviso do sino** vai só para quem abriu a rodada, que pode não ter `compras_excecao_aprovar`.
   Avisar todo cargo com a permissão?
6. **Quem encerra solicitação.** Exige `pedidos_editar`; a Gerência tem `compras_excecao_aprovar` mas
   não `pedidos_editar` (nem `pedidos_criar`): aprova a exceção e não abre rodada nem encerra.
7. **Resposta parcial na versão 2.** A fila e a aprovação só olham a **última** versão do fornecedor:
   se a v2 omitir um item que a v1 precificou, ele some da fila. Exigir resposta completa?
8. **Custo zero.** O fornecedor pode responder 0 e a compra automática compra de graça. Zero é
   bonificação válida?
9. **Teto de estoque na adjudicação.** O contrato (acima, "Teto de estoque sob fan-out") prevê a
   validação pelo conjunto "na abertura e em cada adjudicação"; hoje ela só roda na criação da
   solicitação. Lacuna herdada do E3/E5, não do E6.
10. **Arredondamento da comparação.** O custo unitário de 4 casas (valor + frete ÷ qtd, arredondado) é
    comparado com a base; custo de 1,00004 contra base 1,0000 compra sozinho. Reconciliar com Rodrigo
    junto com o rateio do frete.
11. ~~**Caminho legado**~~ **Resolvida no E8:** removido; o único caminho de compra é a rodada.
12. **Frete no aceite da contraproposta (revisão do E7/E8).** O aceite cria uma versão nova que repete o
    frete inteiro da última versão do fornecedor; a compra automática rateia esse frete só sobre os itens
    ainda livres. Se um item da mesma proposta já foi comprado (levando sua parte do frete), o item que
    sobra carrega o frete cheio: ex. itens X e Y, base 10, frete 2,00; X=9 compra com 0,86; Y contraposto a
    9 e aceito custa 11 > base e não compra, e o frete total cobrado seria 2,86. É regra de dinheiro
    (fórmula do frete): **não alterada**; propor abater o frete já adjudicado no convite e validar com
    Rodrigo junto com a pergunta 10.
13. **Pedido rápido sem idempotência.** Cria a solicitação e abre a rodada em duas transações; duplo
    clique/reenvio pode abrir duas rodadas com dois links (e o fornecedor que responde nas duas compra em
    dobro). A UI desabilita o botão enquanto salva, mas o servidor não tem chave de idempotência.
14. **Aceite e itens.** O aceite pode reverter um item que o fornecedor tinha marcado indisponível (a
    contraproposta vale sobre ele), e o banner continua mostrando contraproposta de item que um concorrente
    já comprou (o aceite pula o item sem avisar). Confirmar o desejado.
15. **Cancelar pedido** é um clique, sem confirmação, também em `recebido_parcial` (o backend permite);
    herdado, não tocado pelo E8.

Ajustes feitos após a revisão: resposta do fornecedor e contraproposta exigem valor ≥ R$ 0,01 em centavos
inteiros (custo zero compraria de graça); a contraproposta é recusada depois do vencimento da rodada,
mesmo antes do tick do fechamento; a tela não envia item em branco como R$ 0,00; erro de salvar a
solicitação/pedido rápido aparece dentro do diálogo.
