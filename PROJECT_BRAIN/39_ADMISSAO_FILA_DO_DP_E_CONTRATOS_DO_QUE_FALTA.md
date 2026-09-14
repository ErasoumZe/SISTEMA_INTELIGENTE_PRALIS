# 39 — Admissão: a fila do DP (V6), e os contratos do que falta

> Aberto em 03/09/2026, branch `feat/admissoes-testes-tnp`, sobre o HEAD `84d071b`. Piloto na **TNP**.
> Continua a `38`.
>
> **Duas metades, e elas têm estatutos diferentes.** A §1 descreve **código que existe**, como a `37`
> e a `38`. A §3 é **organização de contrato**: registra o que está decidido, o que é proposta e o que
> falta decidir para as verticais restantes — **e nada dela foi implementado**.
>
> **Nenhuma migration foi gerada nesta fatia.** Nenhuma foi aplicada em banco persistente. O
> BLOQUEIO 1 da `35` segue de pé.

---

# §1 — A fila de revisão do DP (V6) · IMPLEMENTADO

## O que esta vertical decide, em uma linha

Que o DP **acha** o que precisa revisar — pela própria lista de processos, com a situação da ficha
**derivada** e um recorte no servidor — sem tela nova, sem estado novo e sem uma segunda porta para
decidir.

## O problema que ela resolve

A `38` entregou a revisão e registrou a falta na §6.1: *"o DP chega à ficha pelo processo, e a
listagem não diz quais fichas estão aguardando"*. Na prática, só quem já soubesse o nome da pessoa
chegava à ficha; descobrir era abrir processo por processo.

## Decisões

### D-1 · A fila é RECORTE da lista, e não tela nova

Não existe `/admissoes_processos/fila`. A fila é a mesma listagem com um filtro aplicado.

Uma tela própria seria a **segunda lista dos mesmos processos**, com a mesma permissão, capaz de
divergir da primeira no primeiro ajuste de projeção — e o menu já tem a entrada certa. É a regra-mãe
aplicada a listagem, e não só a formulário.

Consequência prática: a guarda de estrutura de rotas (`tests/unit/admissoes-processo-v0.test.ts`)
continua exigindo exatamente `index.vue` e `[id]/ficha.vue` na pasta do processo. Um `fila.vue`
quebra o build — de propósito.

### D-2 · Nada é gravado. A situação da ficha é DERIVADA

`ProcessoListaDto.fichaSituacao` sai de um `left join` em `admissoes_processos_ficha`. Não há coluna
nova, não há índice novo, não há estado de fila em lugar nenhum.

Gravar "aguardando revisão" no processo permitiria o estado **mentir**: um processo marcado como
aguardando sem ficha enviada seria representável, e só apareceria meses depois num relatório. É a
mesma disciplina da `42` D-2, da `43` C-3 e da `44` D-6 — derivar, nunca gravar em paralelo.

> **`null` continua significando uma coisa só:** a ficha não existe porque o candidato não abriu o
> link. Ausência não virou um quinto valor do enum, porque o enum descreve fichas — e aqui não há
> ficha. O contrato entrega `SituacaoFicha | null`, e a tela distingue os cinco casos.

### D-3 · O filtro é do SERVIDOR

`processosQuerySchema` ganhou `ficha`, que aceita **só as quatro situações que existem**.

A lista pagina de dez em dez. Filtrar no cliente recortaria apenas a página carregada — o defeito
que a listagem de produtos já pagou uma vez, e que aparece como "sumiu um registro".

Não existe valor de filtro para "sem ficha": ausência não é situação, e um quinto valor aqui seria
estado inventado no contrato. Quem quer ver tudo não manda o filtro.

> **A contagem repete o join.** Sem isso, filtrar devolveria a página certa com o total da lista
> inteira — e a paginação passaria a mentir, que é o jeito silencioso de esconder registro. O join
> não infla a contagem porque a ficha tem `unique` por processo.

### D-4 · A fila ordena ao contrário da lista, de propósito

A lista geral mostra o mais recente primeiro, que é o que se espera de um cadastro. **Uma fila com
essa ordem põe quem esperou mais por último.**

Com o filtro de ficha ativo, a ordem passa a ser a da espera: quem enviou primeiro aparece primeiro.
`asc` resolve o nulo sozinho — no Postgres a ordem ascendente já põe `NULL` por último, e rascunho
não tem envio.

### D-5 · Na tela, sem nona coluna

A tabela já tem oito colunas. Uma nona passaria de **duas telas de rolagem em 390px** — e o §13.2 da
`67` trata isso como degradação por salto, não por passo.

O sinal entra na **célula que já identifica a pessoa**, que é onde a tela de Testes põe o alerta de
prazo. E só quando **pede ação**: `enviada` e `devolvida`. `aprovada`, `rascunho` e sem-ficha ficam
silenciosos — estado normal repetido em toda linha vira ruído, e ruído esconde a exceção. Os demais
estados se alcançam pelo filtro, que aceita os quatro.

**Chip com ícone E texto.** A cor nunca é o único sinal (WCAG 1.4.1), e um prefixo invisível diz ao
leitor de tela de que o rótulo está falando.

### D-6 · O atalho é preset do MESMO filtro

"Aguardando revisão" é uma pílula que seleciona `enviada` e aplica. Clicar de novo desliga.

Não há um segundo parâmetro. Um `aguardandoRevisao=true` convivendo com `ficha` seriam duas formas de
pedir a mesma coisa, capazes de divergir — é a doutrina que o filtro de Testes já registra.
`aria-pressed` porque a pílula é um interruptor: sem ele, o leitor de tela anuncia "botão" e não diz
se o recorte está ligado.

### D-7 · A tabela não decide nada

Uma ação por linha, e ela abre o processo. **A porta da revisão continua sendo o modal.**

Um botão "Revisar" na linha, ou um link direto para a tela da ficha, seria a segunda porta que a `38`
D-2 fechou. A guarda de fonte que existia varria só o modal; agora varre a tabela também — era um
buraco exatamente do tamanho desta mudança.

### D-8 · A situação da ficha é visível a quem vê a lista

`fichaSituacao` não é escondido de quem tem `admissoes_processos_visualizar` e não tem
`admissoes_processos_ver_ficha` — o caso da Gerência.

**A razão é precedente, não conveniência:** `exameSituacao` já viaja na mesma lista para o mesmo
público, e o exame é bloco interno que só o DP edita. Situação de ficha é **andamento do processo**,
não conteúdo da ficha: dizer que a pessoa enviou o formulário não entrega nenhum dado dela.

O que não mudou: a Gerência continua **sem porta** para a ficha no modal, e recebe **403** nas três
rotas de ficha. Há teste de integração e de navegador para as duas coisas.

## O que a V6 corrigiu de quebrado, e estava no caminho

**Registrado porque nenhum dos dois era desta entrega, e os dois já mordiam.**

1. **O filtro por situação devolvia a lista errada.** O mapa era um ternário: tudo que não fosse
   `ativo` virava `cancelado`, então pedir **pausado** devolvia os **cancelados**. Estava invisível
   porque nenhuma tela mandava o parâmetro — e agora manda. Virou mapa fechado, que quebra o
   typecheck quando uma situação nova aparecer, em vez de cair no `else`.
2. **A tabela não usava a casca responsiva da casa.** Tinha um `overflow-x` solto que rolava, mas não
   prendia a coluna de ações. Passou a usar a casca, e o estado vazio saiu de dentro dela — com
   `min-width: 680px`, ele ficava fora da área visível em 390px.

## Achado aberto, não corrigido

> **O `position: sticky` da coluna de ações não surte efeito dentro do Vuetify.**
>
> A casca da casa declara `td:last-child { position: sticky; right: 0 }` em telas ≤768px. Entre a
> célula e o container que rola existe o `.v-table__wrapper` do Vuetify, que tem `overflow-x` próprio
> e abre um **scrollport intermediário** — e `sticky` gruda no scrollport mais próximo, que não é o
> que rola. Medido no navegador: em 390px o botão fica a 693px.
>
> **Vale para todas as tabelas que usam a casca**, e é anterior a esta entrega. Não foi corrigido
> aqui porque a correção mexe em CSS global e afeta telas fora deste módulo — inclusive o cabeçalho
> fixo, que depende do mesmo `overflow`. O botão continua **alcançável** rolando a tabela, que é o
> gesto previsto, e o E2E prova isso em 390px em vez de afirmar um grude que não acontece.

## Como isto foi provado

- **Integração**, 8 casos: os cinco estados na projeção · a lista não carrega nada da ficha além da
  situação (chaves exatas, sem dígito de CPF, sem texto de pendência) · o filtro recorta **e o total
  acompanha** · filtro fora do enum é 400 · **pausado voltou a ser pausado** · isolamento contra uma
  ficha enviada da empresa B · a Gerência vê o recorte e leva 403 na ficha · sem permissão, 403.
- **Componente**, 15 casos novos: o sinal só nos dois estados que pedem ação · ícone + texto · nome
  para leitor de tela · a tabela não conhece rota nem ação de ficha · a casca responsiva · o estado
  vazio fora dela e com texto diferente quando há recorte · a região viva sempre montada · o atalho
  como interruptor que liga e desliga o mesmo filtro.
- **Navegador**, 4 casos, contra banco isolado e dados sintéticos: o atalho recorta e a contagem
  acompanha · o sinal na linha e nenhuma ação de decidir na tabela · as quatro larguras · a Gerência.

---

# §2 — Catálogo de funções operacionais · ~~PARADO~~ **RESPONDIDO em 03/09/2026**

> **A decisão saiu, e a vertical foi entregue.** Marco escolheu a opção **(a)**: o DP administra —
> vê, cria, edita, desativa e reativa —, a Gerência apenas visualiza, e não existe exclusão física.
> O registro completo, com as decisões técnicas e um achado aberto sobre renomear, está no **`40`**.
>
> O texto abaixo fica como estava, porque é o levantamento que sustentou a escolha.

## O que já está decidido, e é bastante

Da `42` D-8, decisão de Marco em 26/08/2026:

- **função operacional não é cargo de acesso** — `cargos` responde o que a pessoa pode ver,
  `funcoes_operacionais` responde o que ela faz;
- **o catálogo não pertence a Admissões.** Sai por `@padaria/db/schema/cadastro`, ao lado de
  `cargos`, e o nome não leva prefixo de módulo — `admissoes_funcoes` convidaria uma segunda lista;
- **CBO é opcional**, porque nem sempre é conhecido no momento do teste;
- **desativar, nunca excluir.** Editar um registro antigo mantendo a função já gravada é permitido
  mesmo se ela foi desativada depois; **trocar para** uma inativa, não;
- **a tabela nasce vazia.** Povoar é por SQL revisado, nunca por seed automático;
- **a tela pertence ao cadastro**, não a Admissões.

## O que existe no código, conferido

| Peça | Estado |
| --- | --- |
| Tabela `funcoes_operacionais` | **existe** — `nome`, `cbo` (com CHECK de 6 dígitos), `ativo`, `criado_em`/`atualizado_em`, unique `(empresa, nome)`, unique `(id, empresa)`, índice `(empresa, ativo, nome)`, trigger de `atualizado_em` |
| Leitura | **existe** — `GET /api/admissoes/funcoes`, devolve as inativas marcadas |
| FKs de entrada | **duas**, compostas com empresa, vindas de `admissoes_testes` e `admissoes_processos` |
| Rota de escrita | **não existe** |
| Permissão de escrita | **não existe** — nenhuma chave com "funcao" no catálogo |
| Tela, item de menu, componente | **não existem** |
| Tradução de "em uso" para 409 | **não existe** |
| Autoria (`criado_por`/`atualizado_por`) | **não existe** — a tabela tem carimbo de tempo, não de pessoa |

## A decisão que falta, e é uma só

A `42` registra a lacuna com todas as letras: *"Escrever ainda não tem permissão definida, porque não
há escrita."* Sem ela, qualquer permissão que eu concedesse seria inventada.

> **DECISÃO NECESSÁRIA — quem administra o catálogo de funções operacionais?**
>
> **(a)** O DP cria, edita e desativa; a Gerência apenas visualiza.
> **(b)** DP e Gerência administram, como já fazem com Turnos (onde a Gerência tem o ciclo completo e
> o DP só vê e cria).
>
> Em qualquer das duas: **não há exclusão física** — a função desativa, e as duas FKs de entrada já
> recusam o `DELETE` no banco.

**Recomendação registrada de Marco (03/09/2026, ainda não confirmada como decisão):** DP cria, edita
e desativa; sem delete físico; Gerência visualiza. É a opção **(a)**.

**Por que não implementei mesmo com a recomendação:** conceder permissão é decisão de negócio, e este
brain é onde ela vira oficial. A recomendação está aqui para virar decisão num commit próprio — não
para ser executada por interpretação.

**O que segue junto, quando destravar:** o catálogo de jornada (`42` D-6) continua em aberto, e a
tela precisará traduzir o `23503` das **duas** FKs em 409, ou o DP verá 500 ao tentar remover uma
função em uso.

---

# §3 — Contratos do que falta · NADA IMPLEMENTADO

Registro de contrato, não autorização. Cada item diz o que está decidido, o que é proposta e **o que
trava**. Vertical sem a decisão da própria linha "trava" não começa — meia vertical é o que este
projeto já pagou caro para não repetir.

## 3.1 Documentos e upload

**Decidido.** Upload não entra junto com os números de documento — são fatias separadas. Quando
destravar, duas regras já valem, e as duas são diferenças em relação ao padrão de comprovantes que já
existe: **não confiar no tipo declarado pelo cliente** (aceitável para funcionário logado, não para
alguém de fora) e **não servir arquivo por caminho previsível** (ali estão documentos de um terceiro
que não é usuário do sistema).

**Proposta.** Nenhuma. O desenho de banco foi deliberadamente não escrito.

**Trava — Marco + DP, por escrito:** tipos aceitos · tamanho máximo · quem pode baixar · retenção ·
descarte · **antimalware, que o sistema não tem**. Seis respostas, nenhuma técnica.

**Cuidado:** a ficha contábil não traz arquivo nenhum. Importação não resolve isto.

## 3.2 Efetivação em `colaboradores`

**Decidido.** Admissão não é cadastro de colaborador. O vínculo é o **fato** de estar efetivado —
não há status novo. Um colaborador nasce de **um** processo, e quem já virou colaborador não se
cancela.

**Proposta.** Existe desenho completo na `35` P-4, e é a **única alteração em tabela que já existe**.

**Trava — autorização de Marco para ler produção:** o CPF em `colaboradores` é anulável, sem unique e
sem CHECK de formato. Efetivar sem resolver isso cria o segundo cadastro da mesma pessoa no primeiro
mês. Resolver exige **contar em produção** quantos estão vazios, quantos repetem e quantos estão fora
de formato — leitura que não foi feita e que precisa de autorização própria.

**Também aberto:** momento e regra da efetivação, recontratação, e o que fazer quando o CPF já existe.

## 3.3 Status trabalhista

**Decidido.** São **dois vocabulários que não se misturam**. Um descreve a linha do arquivo importado
e morre quando o pré-cadastro é resolvido. O outro descreve a pessoa, em duas camadas: **vínculo**
(ativo ou desligado) e **disponibilidade** (trabalhando, férias, atestado, afastamento, licença) — e a
segunda é **derivada, nunca digitada**.

**Proposta.** Nada além do vocabulário. Nenhuma coluna, nenhum estado.

**Estado atual:** existe apenas falta justificada, com motivo em texto livre. A disponibilidade de
hoje **não é consultável** — vive na cabeça de quem escala.

**Trava — DP no operacional, jurídico no resto:** precedência quando dois afastamentos caem no mesmo
dia · se o banco impede períodos sobrepostos ou se a precedência resolve · dono de cada lançamento ·
**e o ponto sensível: atestado e afastamento são dado de saúde.** Guardar que existe afastamento é
diferente de guardar o motivo, e a primeira forma resolve escala sem carregar diagnóstico.

## 3.4 Importação assistida

**Decidido.** Importação **não cria colaborador** — cria pré-cadastro, uma fila que o DP revisa. A
prévia é leitura e não grava nada. Pré-cadastro é tela própria, não aba de Colaboradores. Carga
direta está proibida por três fatos medidos: a maior parte das linhas é moldura, as seções variam de
tamanho, e há data-sentinela que corromperia o cadastro em silêncio.

**Proposta.** Pedir à origem uma exportação tabular antes de investir num leitor — recomendação, não
decisão.

**Trava — Marco (modelagem) + DP (conciliação) + contabilidade (formato) + segurança (LGPD):** a
decisão de identidade — pessoa com N vínculos, ou uma linha por vínculo — **bloqueia o modelo
inteiro** · qual arquivo é a fonte de verdade · os documentos repetidos são readmissão ou duplicidade
· de onde vem o cadastro de quem está ativo e não tem ficha · campos totalmente vazios entram ou ficam
fora · e **conciliar por CPF exige decisão de segurança**, porque casar duas bases pela chave da
pessoa é exatamente o cruzamento que a LGPD trata.

> **Sobre o nome do arquivo.** A `36` descreve **três arquivos com extensão `.CSV`** e mede todos,
> mas **não nomeia nenhum**. A busca por um arquivo chamado `2019.CSV` não encontrou registro em
> nenhuma das duas bases nem no disco do projeto. Se esse nome existe, ele é **conhecimento não
> registrado**: catalogá-lo com caminho, data e hash é pendência a criar, não fato a reproduzir.

## 3.5 Conplus

**Decidido:** nada, e isso é a decisão. Não há integração, contrato nem códigos homologados. Nenhuma
tabela, rota ou campo foi desenhado — de propósito.

**Trava — DP e quem opera o Conplus**, as seis perguntas da `35` §11: o que ele é · como a integração
acontece · se devolve algo · **quais campos exige** · quando o envio acontece · quem opera.

> **A dependência que quase ninguém vê:** a lista de campos exigidos decide **metade dos campos ainda
> em aberto da ficha**. Sem ela, pode faltar campo obrigatório e sobrar campo que ninguém usa — e
> campo que ninguém usa também custa, porque é dado pessoal guardado sem finalidade.

## 3.6 Aviso de privacidade oficial

**Decidido.** Existe o aviso **de teste**, que diz na primeira linha para não usar dados reais, e três
guardas de servidor impedem que ele valha em produção — configurar, emitir convite e gravar aceite
falham, cada uma por conta própria. A versão aceita fica gravada por extenso, e aceites de teste ficam
identificados **para sempre** pelo prefixo: não se apagam e não viram consentimento real.

**Proposta.** Nenhuma quanto ao **texto**. Ele não foi escrito, sugerido nem parafraseado.

**Trava — jurídico + Marco:** o texto oficial · a **base legal** do tratamento, e não é o consentimento
que resolve tudo · e a **retenção**: o que acontece com a ficha completa de quem não for admitido.
Hoje a resposta por omissão é guardar para sempre, e é a pior delas.

**Enquanto isto não cair, nada sai de ambiente de teste.**

---

## §4 — Pendências que esta fatia deixa

1. **A fila não avisa.** Não há notificação quando uma ficha é enviada; o DP descobre ao abrir a tela.
   O módulo tem precedente contrário a notificar (`42` D-5: o prazo avisa na tela, e o sistema não
   notifica ninguém), então criar notificação é decisão, não consequência.
2. **`ficha/aprovar` continua sem caso de integração de 403 por cargo** — o de `ficha` e
   `ficha/devolver` existe, e o navegador cobre o resto.
3. **O `sticky` da coluna de ações não funciona** — §1, achado aberto. Vale para todas as tabelas com
   a casca da casa.
4. **Quatro migrations empilhadas** (0035–0038) seguem só em arquivo e em bancos descartáveis.
5. **Retenção** e **duplicidade de dependente sem CPF** continuam como a `38` §6 registrou.
