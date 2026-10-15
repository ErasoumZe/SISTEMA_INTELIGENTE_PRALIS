# 51 - WhatsApp em Compras e acabamento visual - 15/10/2026

> Escopo desta rodada: melhorar somente a apresentação de Pedidos, corrigir a exibição de
> quantidades e documentar a integração oficial do WhatsApp. Nenhuma migration, credencial,
> mensagem externa, push, PR, merge ou deploy foi executado.

## 1. Decisões desta rodada

| Dúvida                                              | Decisão recomendada                                                                         | Motivo                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Como enviar sem depender do navegador do Comprador? | Meta WhatsApp Cloud API direta.                                                             | É a API oficial, evita automação frágil do WhatsApp Web e permite status e webhook.                                   |
| Como o fornecedor devolve um pedido estruturado?    | No MVP, botão no WhatsApp abre um formulário Pralis com link assinado.                      | Quantidades por item não devem ser inferidas de texto livre; o retorno fica validável e auditável.                    |
| Usar resposta livre do WhatsApp?                    | Apenas como observação, nunca para alterar item automaticamente.                            | “Manda 5 de cada” é ambíguo e pode corromper a negociação.                                                            |
| Usar WhatsApp Flows agora?                          | Não no primeiro corte. Preparar como evolução posterior.                                    | O formulário web assinado entrega o mesmo resultado com menos risco; Flow exige configuração e integração adicionais. |
| Quando marcar `Enviado`?                            | Somente depois de a Meta aceitar o envio e devolver o `wamid`.                              | Abrir uma janela ou clicar em um botão não prova que a mensagem foi enviada.                                          |
| Quando marcar `Retornado`?                          | Somente após submissão válida do fornecedor.                                                | Status de entrega/leitura e resposta de negócio são fatos diferentes.                                                 |
| A resposta confirma o pedido?                       | Não. O Comprador revisa e executa `Retornado -> Confirmado`.                                | Fornecedor não altera estoque nem aprova a própria negociação dentro do ERP.                                          |
| Guardar o telefone de teste em código ou documento? | Não. Usar o número informado pelo solicitante apenas como destinatário configurado na Meta. | Evita versionar dado pessoal e torna o teste substituível.                                                            |

## 2. O que já está feito

### Compras, fornecedores e estoque

- Menu único de Compras para Diretor e Compras.
- Fornecedor persiste nome e WhatsApp; o contrato completo possui teste dedicado para `whatsapp`.
- Produto persiste mínimo, máximo, área, local de venda, local de estoque e Curva ABC manual.
- Estoque lista produtos e filtra pelas cinco dimensões definidas na R-215.
- Pedido manual cria e edita em `A fazer`; servidor e tela barram quantidade acima do máximo.
- Sugestão assistida usa `máximo - atual` quando o produto alcança o mínimo.
- Ciclo vigente: `A fazer -> Enviado -> Retornado -> Confirmado -> Recebido parcialmente -> Recebido`.
- Recebimento parcial e final altera somente a quantidade conferida.
- Idempotência impede que o reenvio do mesmo recebimento duplique saldo.
- Extrato registra pedido, item, conferente, data/hora e saldo anterior/posterior.
- Seed local é repetível e a branch está baseada na `main` atual da rodada anterior.

### Prova já fechada em 14/10/2026

- Playwright de Compras: 6 de 6 cenários.
- Unitários: 39 arquivos e 375 testes.
- Integração: 132 arquivos, 1.007 aprovados e 8 ignorados.
- `lint` e `check` globais aprovados.
- `pages/pedidos.vue` foi reduzida de 464 para aproximadamente 200 linhas.

### Acabamento de 15/10/2026

- Cards de ação, fila, abas, itens, detalhe e recebimento passaram a usar os tokens `--cx-*` da
  linguagem visual Cicluz: superfície elevada, hairline, sombra em duas camadas, raios coerentes e
  hierarquia tipográfica.
- Quantidades agora seguem uma regra única: `40.000 -> 40`, `4.500 -> 4,5`, `4.100 -> 4,1`,
  `4.010 -> 4,01` e `4.001 -> 4,001`.
- Campos numéricos editáveis recebem a forma canônica com ponto (`4.5`) exigida pelo HTML, mas a
  leitura usa vírgula em português (`4,5`).
- A mesma regra foi aplicada ao formulário, detalhe, recebimento e texto preparado para WhatsApp.

## 3. Limite do WhatsApp atual

O botão atual monta uma mensagem e abre `wa.me`. Antes de abrir o destino ele muda o pedido para
`Enviado`. Esse fluxo é útil como MVP assistido, mas tem três limites:

1. o Pralis não envia a mensagem; o Comprador ainda precisa confirmar no WhatsApp;
2. abrir a janela não prova envio, entrega ou leitura;
3. a resposta do fornecedor não volta ao sistema.

Por isso, o `wa.me` deve ser removido quando a integração oficial entrar. Manter os dois caminhos
violaria a regra de caminho único do projeto.

## 4. Arquitetura recomendada para o próximo corte

```text
Comprador
  -> POST /api/pedidos/:id/envios-whatsapp
  -> servidor carrega pedido + fornecedor e envia template pela Meta
  -> Meta devolve wamid
  -> Pralis grava envio e muda para Enviado
  -> fornecedor recebe mensagem com link assinado
  -> GET /pedido-fornecedor/:token abre formulário sem login
  -> POST /pedido-fornecedor/:token valida itens e grava uma resposta imutável
  -> pedido muda para Retornado e entra na fila do Comprador
  -> Comprador revisa e confirma

Meta
  -> GET /api/integracoes/whatsapp/webhook valida o verify token
  -> POST /api/integracoes/whatsapp/webhook valida X-Hub-Signature-256
  -> atualiza enviado/entregue/lido/falhou pelo wamid, com idempotência
```

### Persistência proposta - ainda sem migration

A futura migration deve ser mostrada e aprovada antes de aplicada. O desenho mínimo é:

- `pedidos_whatsapp_envios`: pedido, revisão do pedido, destinatário, template/idioma, `wamid`,
  status, erro seguro, datas de aceitação/entrega/leitura e ator;
- `pedidos_links_fornecedor`: pedido, hash do token, expiração, revogação e envio de origem;
- `pedidos_respostas_fornecedor`: pedido, link, versão, observação, data/hora e payload original;
- `pedidos_respostas_itens`: item do pedido, quantidade aceita/proposta e observação;
- chave única para `wamid` e para cada evento externo processado, impedindo duplicidade.

O token do formulário deve ter alta entropia, ser armazenado somente como hash, expirar, ser
revogável e ficar vinculado à versão exata do pedido. Alterar o pedido revoga o link anterior.

## 5. Tutorial do zero - pessoa fazendo pela primeira vez

Os nomes dos menus da Meta mudam com frequência. Se a tela diferir, procure pelos termos em
negrito. Use somente a documentação e os painéis oficiais.

### Etapa A - preparar a empresa

1. Separe uma conta pessoal do Facebook com autenticação em dois fatores e permissão administrativa.
2. Em `business.facebook.com`, crie ou selecione o **Portfólio empresarial** da Cicluz/Pralis.
3. Confirme razão social, endereço, site e e-mail corporativo. Inicie a verificação empresarial se
   o painel solicitar; esta análise pode ser a etapa mais demorada.
4. Defina quem será o proprietário operacional da conta e registre um segundo administrador.
5. Não escolha ainda um número usado diariamente sem conferir no próprio painel se ele é elegível
   para coexistência ou se precisará ser migrado. Para o primeiro teste, use o número de teste da Meta.

### Etapa B - criar o aplicativo e fazer o primeiro envio de teste

1. Acesse `developers.facebook.com/apps` e clique em **Create app**.
2. Escolha o caso de uso empresarial disponível e associe o app ao portfólio da empresa.
3. No painel do app, adicione o produto **WhatsApp** e abra **API Setup**.
4. Anote em local seguro, sem colar no Git: **App ID**, **App Secret**, **WhatsApp Business Account
   ID (WABA ID)** e **Phone Number ID**.
5. Use primeiro o token temporário mostrado em **API Setup**.
6. Em **To**, cadastre e confirme o número de teste informado pelo solicitante. Informe o país Brasil
   e o número completo com DDI 55; a Meta enviará um código de confirmação.
7. Envie o template de teste `hello_world` pelo próprio painel ou pela coleção oficial da Meta no
   Postman. A chamada é `POST https://graph.facebook.com/{versao}/{PHONE_NUMBER_ID}/messages`, com
   `Authorization: Bearer {TOKEN}`.
8. Guarde o `messages[0].id` retornado. Ele é o primeiro `wamid` e prova que a API aceitou o envio.

### Etapa C - criar o template real

1. Abra **WhatsApp Manager -> Message templates -> Create template**.
2. Escolha categoria **Utility**, idioma `Portuguese (BR)` e nome minúsculo, por exemplo
   `pedido_compra_pralis_v1`.
3. Sugestão de corpo:

   ```text
   Olá, {{1}}. A Pralis enviou o pedido {{2}}, com {{3}} itens.
   Revise quantidades e observações no botão abaixo. O link expira em {{4}}.
   ```

4. Adicione um botão de URL com o domínio público do Pralis e uma variável no final. Essa variável
   recebe o token opaco do formulário, nunca o id sequencial do pedido.
5. Preencha exemplos reais, sem dados sensíveis, envie para análise e aguarde `Approved`.
6. Não marque como Marketing: o conteúdo é transacional e vinculado a um pedido existente.

### Etapa D - criar credencial de servidor

1. Em **Business Settings -> Users -> System users**, crie um usuário de sistema dedicado ao Pralis.
2. Dê acesso apenas ao app e à conta WhatsApp necessários.
3. Gere token com as permissões mínimas exigidas pelo painel, normalmente
   `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Guarde o token no cofre de segredos do Coolify. Nunca use `.env` versionado, banco, log ou
   navegador para armazená-lo.
5. Registre responsável e procedimento de rotação/revogação.

### Etapa E - configurar o webhook

1. A API precisa estar publicada em HTTPS. `localhost` não recebe chamadas da Meta; para teste
   temporário pode-se usar um túnel HTTPS, mas o destino final deve ser o domínio da API no Coolify.
2. No app da Meta, abra **WhatsApp -> Configuration -> Webhook**.
3. Informe a callback URL do Pralis e um verify token aleatório armazenado no cofre.
4. O GET de validação só devolve `hub.challenge` quando `hub.mode=subscribe` e o verify token coincide.
5. Assine o campo **messages** da WABA.
6. Todo POST deve validar `X-Hub-Signature-256` com HMAC SHA-256 e o App Secret antes de ler o evento.
7. Responda HTTP 200 rapidamente e processe em fila; a Meta pode repetir eventos.

### Etapa F - implementar no Pralis

1. Aprovar a migration proposta na seção 4.
2. Adicionar ao servidor, via cofre: versão da Graph API, Phone Number ID, WABA ID, token, App
   Secret, verify token, template e idioma.
3. Criar um cliente HTTP com timeout, redaction de token/telefone e tratamento de erros da Graph API.
4. Criar o endpoint autenticado de envio. O servidor, não o navegador, carrega fornecedor e itens.
5. Só depois de receber o `wamid`, gravar o envio e transicionar `A fazer -> Enviado`.
6. Criar o formulário público por token com os itens travados ao pedido e quantidades editáveis.
7. Na submissão, validar expiração, versão, limites e idempotência; gravar resposta e transicionar
   `Enviado -> Retornado` numa única transação.
8. Exibir ao Comprador comparação lado a lado entre pedido e retorno. Somente ele confirma.
9. Implementar webhook de status e testes de assinatura inválida, repetição, evento fora de ordem,
   token expirado, pedido alterado e resposta duplicada.
10. Remover o `wa.me` quando o novo caminho passar pelos gates. Não manter fallback duplicado.

### Etapa G - prova final no número de teste

1. Criar fornecedor de teste com o número confirmado na Meta.
2. Criar pedido com um item inteiro (`40`) e três fracionados (`4,5`, `4,1`, `4,01`).
3. Enviar e conferir no aparelho: remetente, fornecedor, referência, itens, números e botão.
4. Conferir no Pralis o `wamid` e os estados aceito, entregue e lido quando disponíveis.
5. Abrir o formulário pelo WhatsApp, alterar uma quantidade e enviar observação.
6. Conferir que o pedido aparece em `Retornado`, sem alterar estoque e sem se confirmar sozinho.
7. Reenviar a mesma submissão e provar que não duplica resposta nem evento.
8. O Comprador confirma; só o recebimento físico posterior pode alterar saldo.

## 6. Custos e operação

A Meta informa cobrança por mensagem entregue, com preço dependente do país e da categoria. Há
categorias Marketing, Utility, Authentication e Service. Não fixe valor no código ou neste brain:
consulte a tabela oficial antes de aprovar orçamento. Acesso direto à plataforma não adiciona taxa
de provedor; um BSP pode cobrar sua própria camada.

Fontes oficiais para a implantação:

- [Coleções oficiais da Meta para WhatsApp no Postman](https://www.postman.com/meta/whatsapp-business-platform/overview)
- [Exemplos oficiais de Cloud API e validação de assinatura](https://github.com/fbsamples/whatsapp-api-examples)
- [Curso oficial da Meta sobre templates](https://www.facebookblueprint.com/student/path/253055-message-templates)
- [Preços oficiais da WhatsApp Business Platform](https://whatsappbusiness.com/products/platform-pricing/)

## 7. Pendências atuais

### Para o WhatsApp oficial

- Portfólio/WABA, verificação da empresa e definição do número remetente.
- Template Utility aprovado.
- Credenciais de servidor no cofre e domínio HTTPS do webhook.
- Aprovação explícita da migration de mensagens, links e respostas.
- Implementação vertical: API, formulário público, tela de comparação, webhook e testes.
- Teste externo real com o número confirmado na Meta.

### Regras de Compras ainda não definidas

- Inventário físico: início, contagem, sobra/perda, justificativa, aprovação e efeito financeiro.
- Curva ABC automática: métrica, período, cortes e frequência.
- Reposição automática: depende de movimentos confiáveis de venda, produção, perda e inventário.
- Agendador ativo: recorrência, responsável, alertas e consequência de atraso.
- Vínculo Pedido <-> Mercadoria/NF-e: exige decisão e migration; não muda estoque automaticamente.

### Fora desta rodada

- Nenhuma mensagem real foi enviada.
- Nenhuma integração Meta foi codificada.
- Nenhuma migration foi criada ou aplicada.
- Nenhum segredo foi solicitado ou armazenado.
- Nenhum deploy, push, PR ou merge foi realizado.

## 8. Validação da rodada

| Gate                         | Resultado                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------- |
| Teste unitário de formatação | 1 arquivo, 16 testes aprovados                                                   |
| E2E responsivo               | 1 cenário aprovado em 1440, 1024, 768 e 390 px                                   |
| E2E do ciclo de compra       | 1 cenário aprovado em 30,7 s após atualizar o seletor da contagem sem parênteses |
| Revisão visual local         | Tela, formulário e detalhe inspecionados; inteiros exibidos como `40`            |
| `lint` global                | aprovado                                                                         |
| `check` global               | aprovado: texto, arquitetura, 58 migrations e TypeScript de todos os workspaces  |

Na primeira tentativa, o E2E aguardou `Recebido (1)`, mas a nova aba expõe `Recebido 1`. A tela já
mostrava o recebimento concluído; o seletor desatualizado consumiu o timeout. Uma tentativa de
aumentar o limite confirmou o mesmo diagnóstico e foi revertida. O seletor foi ajustado ao novo
nome acessível, o timeout original de cinco minutos foi preservado e a repetição passou.
