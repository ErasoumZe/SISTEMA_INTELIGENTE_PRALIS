# 40 — Catálogo de funções operacionais

> Aberto em 03/09/2026, branch `feat/admissoes-testes-tnp`, sobre o HEAD `3679696`. Piloto na **TNP**.
> Fecha a decisão que a `39` §2 deixou aberta, e a vertical que a `42` D-8 previu.
>
> Como a `37`, a `38` e a `39` §1, **este documento descreve código que existe**: contrato, rotas,
> permissões, tela e testes. **Nenhuma migration foi gerada** — a tabela já tinha tudo.
>
> Este catálogo **não pertence a Admissões**. Ele é do cadastro, e Admissões é um dos consumidores.

## O que esta vertical decide, em uma linha

Que o **DP administra** o catálogo — vê, cria, edita, desativa e reativa —, que a **Gerência apenas
visualiza**, e que **nada é excluído**: função sai de circulação desativada, e continua legível no
registro que já apontava para ela.

---

## A decisão, e de quem é

**Decisão de Marco, 03/09/2026.** A `39` §2 registrou as duas opções e parou antes de conceder
permissão; esta é a resposta.

| Ato | DP | Gerência | Diretor Geral (cargo) |
| --- | --- | --- | --- |
| Visualizar o catálogo | ✔ | ✔ | ✘ (vazio, como sempre) |
| Criar função | ✔ | ✘ | ✘ |
| Editar nome e CBO | ✔ | ✘ | ✘ |
| Desativar e reativar | ✔ | ✘ | ✘ |
| **Excluir** | **não existe para ninguém** | | |

`usuario_admin` herda tudo por role, como em toda permissão nova — **nada foi concedido a papel
novo**, e nenhum papel foi inventado.

> **É o inverso de Turnos, e o inverso é deliberado.** Em Turnos a Gerência tem o ciclo completo e o
> DP só vê e cria. Aqui quem administra é o DP — porque é ele que descobre a função faltando no meio
> de uma admissão, e depender da Gerência nesse instante trava o atendimento. Turno de quem já está
> admitido é outra conversa, e continua com a Gerência.

---

## Decisões técnicas

### D-1 · Três permissões, e a quarta não existe

`cadastro_funcoes_visualizar` · `cadastro_funcoes_criar` · `cadastro_funcoes_editar`.

**Não há `cadastro_funcoes_excluir`.** Conceder permissão para um ato que não existe seria abrir a
porta hoje para quem criasse a rota amanhã sem reabrir esta decisão. A ausência da chave é parte da
garantia, não um detalhe de escopo.

A tela entra por `ativas`, e não por `extras`: assim o mecanismo do catálogo deriva a permissão de
acesso **e** a de menu de uma vez, em vez de duas listas que podem divergir.

### D-2 · `editar` cobre três atos no servidor e dois botões na tela

No servidor, renomear, trocar o CBO e ligar/desligar são **a mesma escrita na mesma linha**. Três
rotas para um `UPDATE` seriam três caminhos para o mesmo ato, e três permissões seriam três nomes
para o mesmo direito.

Na tela, porém, são **botões diferentes**: o diálogo cuida do nome e do CBO, a ação da linha cuida da
situação. Um interruptor dentro do diálogo **mais** um botão na linha seriam dois caminhos para o
mesmo ato — e a pessoa desativaria sem perceber ao corrigir um nome.

### D-3 · Nada some, e são três provas

Não há rota de exclusão, não há botão e não há permissão. As três provas, e são três porque nenhuma
sozinha bastaria:

1. a rota responde **404** — o caminho não existe, e uma rota que só recusa seria o botão morto que
   este projeto já tirou de outras telas;
2. o banco recusa a exclusão direta com **23503**, por causa das duas chaves estrangeiras compostas
   que apontam para o catálogo — a garantia sobrevive a qualquer código novo;
3. **desativar uma função em uso funciona**, o registro que já a tinha continua intacto, e ela passa
   a ser recusada apenas em registro **novo**. É exatamente o que "preservar referência histórica"
   significa na prática.

### D-4 · Nome repetido é 409, e o nome vai aparado

`FUNCAO_DUPLICADA`, traduzido do `23505` pelo **código do erro e pelo nome da constraint** — nunca
pelo texto, que muda entre versões e locales do Postgres. E a causa aninhada importa: o driver
embrulha o erro quando ele passa pelo ORM.

O nome é aparado antes de gravar porque **o unique compara o nome cru**: sem o aparo, `" PADEIRO"` e
`"PADEIRO"` conviveriam no catálogo e o DP veria a mesma função duas vezes.

> **O que continua possível, e fica registrado:** `"Padeiro"` e `"PADEIRO"` ainda convivem — o unique
> não é insensível a caixa. Normalizar caixa mudaria dado já gravado em produção e é decisão própria,
> não carona desta fatia.

### D-5 · CBO opcional, e só o formato é conferido

Seis dígitos, ou vazio. Campo vazio vira **nulo**, e não "CBO inválido" — sem isso, quem apagasse o
código ficaria preso num erro que o próprio formulário provocou.

Nem a tela, nem o contrato, nem o banco conferem **existência** do código: o sistema não tem a tabela
oficial de ocupações, e fingir que valida seria pior do que declarar que só valida forma.

### D-6 · A segunda leitura do catálogo é deliberada

Passaram a existir duas rotas de leitura, e elas respondem perguntas diferentes:

| Rota | Para quem | Empresa | Projeção | Permissão |
| --- | --- | --- | --- | --- |
| `GET /api/admissoes/funcoes` | o **seletor** do formulário de admissão | derivada do perfil | enxuta | de Admissões |
| `GET /api/funcoes-operacionais` | a **administração** do catálogo | do seletor do workspace | com `emUso` | de Cadastro |

É o mesmo par que Produtos já tem entre a listagem completa e a projeção reduzida, e pelo mesmo
motivo: quem opera precisa escolher, quem administra precisa ver mais — e dar a projeção de
administração a quem só opera seria conceder acesso por conveniência.

### D-7 · `emUso` informa, não bloqueia

O contrato diz se a função já foi usada em algum período de teste ou processo **da mesma empresa**.
Existe para a tela **explicar** — por que não há excluir, e o que acontece ao renomear.

Sai de duas consultas de ids distintos em vez de uma subconsulta correlacionada: SQL cru é proibido
nessa camada pelo gate de arquitetura, e duas listas curtas custam menos que a legibilidade perdida.

---

## Achado aberto — renomear alcança o passado

> **O nome da função não tem retrato.** Diferente do turno, que é **copiado** para o processo no ato
> da admissão, o nome da função é lido por junção toda vez que alguém abre a lista de testes, a fila
> do DP, o detalhe do processo ou a ficha pública do candidato.
>
> **Renomear, portanto, reescreve o que os registros antigos exibem.** Não quebra nada — a chave
> estrangeira segura, o vínculo continua correto —, mas a leitura do histórico muda.
>
> **Não foi corrigido nesta fatia, e a correção não é pequena:** exigiria copiar um rótulo para as
> tabelas de destino, o que é **migration** e decisão própria. Enquanto não houver decisão, a tela
> avisa ao DP, na hora de renomear uma função em uso, que a mudança alcança os registros antigos.
>
> **Decisão pendente:** o nome da função deve virar retrato no período de teste e no processo, como o
> turno já é?

---

## O que esta vertical NÃO faz

- **não exclui** — nem por rota, nem por botão, nem por permissão;
- **não liga função a cargo de acesso**: a tabela não tem chave para `cargos`, o contrato não tem
  campo de cargo, e a guarda que impede a confusão passou a varrer também os três diretórios novos;
- **não popula o catálogo**: ele continua nascendo vazio, e as funções extraídas da planilha
  continuam sendo evidência, não carga;
- **não normaliza caixa** no nome — D-4;
- **não registra autoria**: a tabela tem carimbo de tempo, não de pessoa. Saber **quem** desativou
  exigiria coluna nova, e coluna nova é migration;
- **não tem concorrência otimista**: dois editores simultâneos, o último vence. O catálogo tem
  dezenas de linhas e um administrador por empresa; travar isso agora seria resolver um problema que
  ninguém teve;
- **não toca no catálogo de jornada**, que a `42` D-6 deixou aberto.

---

## Como isto foi provado

- **Integração**, 12 casos: o DP administrando o ciclo inteiro · a Gerência lendo e recebendo 403 com
  a chave certa em criar e editar · a matriz lida da referência (conjunto exato, não só presença) ·
  quem não tem nada, 403 · **a rota de exclusão não existir** · **o banco recusar a exclusão direta,
  por SQL, sem a API no caminho** · desativar função em uso sem quebrar o registro existente e
  recusá-la em registro novo · 409 de nome repetido, inclusive com espaço nas pontas e ao renomear ·
  CBO fora do formato e vazio · nome vazio · isolamento por empresa nos três sentidos · a ordem com
  ativas primeiro.
- **Componente**, 8 casos: o diálogo não liga nem desliga · não oferece excluir · hidrata na edição e
  nasce vazio na criação · exige nome · recusa CBO curto e aceita vazio como ausência · apara
  espaços · avisa sobre renomear função em uso · mostra o erro do servidor sem fechar.
- **Navegador**, 8 casos, contra banco isolado e dados sintéticos: criar com CBO, renomear, desativar
  e reativar — e **nenhum botão de excluir em lugar nenhum da página** · nome repetido recusado com o
  diálogo aberto e o texto preservado · CBO barrado na tela · a busca · as quatro larguras com alvo
  de toque · a Gerência vendo sem poder mexer · quem não tem permissão · sem sessão.

---

## Pendências

1. **Retrato do nome da função** — o achado acima. É a única que muda dado.
2. **Normalizar caixa no nome** — hoje `"Padeiro"` e `"PADEIRO"` convivem.
3. **Autoria de quem alterou o catálogo** — exigiria coluna nova.
4. **Catálogo de jornada** (`42` D-6) continua aberto.
5. **Povoar o catálogo da TNP** continua sendo ato de quem opera, agora pela tela em vez de por SQL.
