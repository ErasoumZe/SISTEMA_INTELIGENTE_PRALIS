# 43 — Admissão: processo iniciado (ADM-002 V0)

> Aberto em 26/08/2026, branch `feat/admissoes-testes-tnp`. Piloto na **TNP**.
> Segunda fatia do módulo de Admissões, direto sobre a `42`. **Nada aqui cria colaborador operacional.**

## O que é, em uma linha

Quando o DP efetiva um período de teste, **o processo de admissão já nasce junto** — e a tela leva
direto a ele. Não há um segundo passo para "iniciar a admissão".

## A fronteira, que continua a mesma da 31

> **Admissão não é cadastro de colaborador.**

`admissoes_processos` **não tem `colaborador_id`**, não referencia `colaboradores` e não efetiva
ninguém. A V0 registra que a admissão **começou** e quem a começou. Criar ou vincular o colaborador
segue sendo vertical própria, ainda não feita.

## Decisões

### C-1 · O processo nasce da efetivação, e só dela

Efetivar um teste (`resultado = aprovado_para_admissao`) **cria o processo na mesma transação** que
encerra o teste. Se a criação falhar, o encerramento não acontece — não existe teste aprovado sem
processo, nem processo sem teste.

**Não existe botão, rota nem menu de "iniciar admissão".** Nem `POST /api/admissoes/processos`, nem
`.../:id/iniciar`, nem permissão de iniciar — porque iniciar não é um ato separado, é consequência de
efetivar. Um segundo caminho para o mesmo ato é exatamente o que a regra-mãe (`AGENTS.md` §4.1)
proíbe, e este projeto já pagou por isso quatro vezes.

Um teste tem **no máximo um** processo, e a garantia mora no banco (`unique` em `teste_id`), não no
serviço: duas transações simultâneas passariam pelas duas pré-checagens.

A rota de encerrar responde **200 com `{ processoId }`** — é a única escrita do módulo que não é
`204`, porque é a única que tem o que devolver. É esse campo que a tela usa para levar ao processo.
Ela já respondeu `204`, e nesse período o caminho único simplesmente não funcionava: sem corpo,
`processoId` era `undefined` e a navegação nunca acontecia. Corrigido em 26/08/2026.

### C-1.1 · Idempotência é simétrica nos dois desfechos

Repetir o encerramento — duplo clique, retry de rede — responde **200**, não conflito, nos **dois**
resultados:

| Repetição | Resposta |
| --- | --- |
| `aprovado_para_admissao` de novo | 200, com o **mesmo** `processoId` de antes |
| `nao_prosseguir` de novo | 200, com `processoId: null` |
| desfecho **diferente** do gravado | **409** — não é repetição, é troca de intenção |

A ordem dentro do serviço é o que sustenta isso: trava a linha, 404, **ramo idempotente**, status,
versão, escrita. A checagem de versão vem **depois** do ramo idempotente de propósito — a repetição
carrega a versão anterior (o cliente não recebeu a resposta que a incrementaria), então checar versão
antes transformaria a repetição em `VERSAO_CONFLITANTE`.

### C-2 · O processo é painel, não página

Chega-se ao processo **abrindo o teste efetivado**. Não há entrada de menu, página de lista nem
`GET /api/admissoes/processos`. Lista sem filtro, sem paginação e sem dono definido seria superfície
criada antes de existir necessidade — e uma página sem menu seria rota órfã.

O teste guarda o caminho de volta: `testeDetalheDto.processoId` é `null` em todo teste não efetivado,
e aponta para o processo depois. Sem ele, o link só funcionaria no instante da efetivação.

### C-3 · Dois estados, e nenhum antecipado

`iniciado` e `cancelado`. Só. A situação exibida é derivada por `situacaoDoProcesso`, em `shared` —
mesma disciplina do D-2 da `42`, e pelo mesmo motivo: **não existe coluna, enum, índice nem filtro
paralelo de ativo/inativo.**

| Estado técnico | Situação |
| -------------- | -------- |
| `iniciado`     | Ativo    |
| `cancelado`    | Inativo  |

Estados de verticais futuras — aguardando candidato, em revisão do DP, pronto para efetivar,
efetivado — **não foram reservados**. Aceitar um estado antes de a regra dele existir grava
vocabulário que ninguém confirmou com o DP, e que passa a ser gravável por qualquer bug.
`cancelado` é terminal: não há reabertura e não há segundo cancelamento.

### C-4 · Cancelamento não tem motivo estruturado

Decisão de Marco em 26/08/2026, depois de as duas opções provisórias serem recusadas: o conceito
**saiu por completo** da V0 — coluna, CHECK, enum Zod, payload, DTO e tela.

O cancelamento continua auditado por **ator, data e ação**, que é o que a trilha precisa para
responder "quem cancelou e quando". O ganho: o CHECK não nasce com vocabulário que ninguém confirmou.
Ampliar depois é migration aditiva; renomear valor já gravado, não. Motivo controlado vira vertical
própria, depois da validação do DP.

### C-5 · Quem opera

**DP** e **Gerência** recebem `admissoes_processos_visualizar` e `admissoes_processos_cancelar`,
pelo mecanismo real do catálogo. O administrador é o *role* `usuario_admin`, que já recebe qualquer
permissão nova por `permissoesAcessoTotal` — não há o que conceder.

As duas permissões entram em `extras`, **não em `ativas`**: `ativas` mapeia chave de **menu** para a
permissão de visualizar, e o processo não tem menu (C-2). Entrar por ali criaria a entrada que a V0
decidiu não ter.

`cancelar` é permissão **própria**: visualizar não autoriza escrever.

### C-6 · Isolamento por empresa, com a mesma resposta de inexistente

Empresa derivada do perfil, nunca do cliente — idêntico ao D-1 da `42`. Processo de outra empresa
responde **404**, o mesmo que um id que não existe: distinguir entregaria a existência de graça.
Vale para leitura, histórico **e** cancelamento.

A FK é **composta** — `(teste_id, empresa_id)` e `(processo_id, empresa_id)` — então referência entre
empresas é irrepresentável no banco, não apenas recusada no serviço.

### C-7 · Trilha append-only

`admissoes_processos_historico` registra `criado` e `cancelado`. Guarda **nomes de campo**, nunca
valores. Não tem `atualizado_em`, porque nada ali é alterado depois de gravado, e por isso é a única
das duas tabelas sem trigger.

## Fora desta vertical

Motivo estruturado de cancelamento · convite e rota pública · formulário do candidato · documentos e
anexos · dependentes · efetivação operacional e qualquer escrita em `colaboradores`.

Todas continuam verticais futuras, e nenhuma teve estado, coluna ou rota reservada aqui.

## Banco

Migration **0033**, puramente aditiva: cria `admissoes_processos` e `admissoes_processos_historico` e
**não altera nenhuma tabela existente**. Provado comparando o banco vivo contra o snapshot 0032,
tabela a tabela e coluna a coluna: 74 → 76, nenhuma perdeu ou ganhou coluna.

`atualizado_em` é mantido por trigger neste sistema, e a 0002 instala percorrendo um **array literal**
que não inclui as tabelas novas — por isso o trigger de `admissoes_processos` foi escrito à mão na
própria migration. O histórico não recebe (C-7).

> **Aplicada somente no banco local descartável `padaria_adm001`** (`127.0.0.1:5543`), para
> validação. **Não foi aplicada em produção.**

## Estado

- **11 de 11** P0 de integração da ADM-002 verdes: origem, concorrência, repetição, tenant,
  autorização, estados e auditoria.
- Suíte de integração completa verde: **98 arquivos, 747 testes**.
- `lint`, `check`, `check:migrations` e unitários verdes.
- Tudo em **branch, sem merge** na `main`.

## Pendências

- **Vínculo com `colaboradores`** e a unicidade de CPF que ele exige: `colaboradores.cpf` é `text`,
  anulável, sem `UNIQUE` e sem CHECK. Fechar isso pede leitura de produção para saber se já há
  duplicados — não feita.
- Motivo estruturado de cancelamento (C-4), aguardando o DP.
- Documentos, anexos e dependentes seguem sem decisão — inclusive porque **antimalware não existe no
  sistema hoje**, como a `42` já registrava.
- Momento e regra da efetivação operacional, recontratação e CPF já existente como colaborador —
  herdadas da `42`, ainda abertas.
