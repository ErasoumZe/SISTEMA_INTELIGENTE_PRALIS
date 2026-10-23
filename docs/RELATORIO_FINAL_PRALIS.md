# Relatório técnico — Sistema Pralís

Data da rodada: 21/10/2026

## Estado geral

O projeto está preparado para continuar a homologação local, mas não deve ser declarado pronto
para produção. A admissão foi validada com testes locais e mocks, porém ainda falta uma validação
ponta a ponta usando um destino Google de homologação autorizado.

## Correções realizadas nesta rodada

- O typecheck do Nuxt passou a excluir testes do grafo de tipos do runtime. O `tsconfig` gerado
  pelo Nuxt incluía 2.302 arquivos, incluindo 67 testes frontend.
- O PostgreSQL efêmero dos testes recebeu limites menores de `shared_buffers`, `work_mem` e
  `max_connections`, reduzindo a pressão de memória sem alterar o banco de desenvolvimento.
- Corrigida uma importação relativa sem extensão em `tests/unit/conplus-layouts.test.ts`.
- A documentação Conplus existente foi preservada e o fluxo de homologação continua explicitamente
  separado da operação real.

## Arquivos modificados nesta rodada

- `web-vue/nuxt.config.ts`
- `tests/setup/postgres-efemero.ts`
- `tests/unit/conplus-layouts.test.ts`
- `docs/RELATORIO_FINAL_PRALIS.md`

O repositório já possuía outras alterações locais anteriores. Nenhuma delas foi revertida.

## Verificações

- `npm run check --workspace @padaria/web-vue`: passou, código 0.
- `npm run check --workspace @padaria/api`: passou, código 0.
- `npm run check --workspace @padaria/tests`: passou após a correção da extensão relativa.
- `npm run check:texto`: passou.
- `npm run check:arquitetura`: passou.
- `npm run check:migrations`: passou com 64 migrations consistentes.
- Prettier nos arquivos alterados: passou.
- Docker Compose Coolify: configuração válida com variáveis dummy, sem iniciar containers.
- API local `/health`: HTTP 200.
- Frontend local `/admissao`: HTTP 200.

As suítes Vitest de integração da admissão já tiveram 12/12 casos da ficha e 15/15 casos de
dependentes aprovados em execução anterior com pool de threads. Uma nova execução pelo launcher do
workspace ficou bloqueada nesta máquina por erro de acesso do esbuild ao caminho da configuração;
isso é uma limitação do ambiente de execução, não foi mascarado como aprovação.

## Admissão

Comprovado localmente:

- convite e rota pública;
- validações da ficha;
- dependentes;
- uploads fictícios;
- persistência no PostgreSQL efêmero;
- regras de duplicidade e permissões cobertas pelos testes existentes.

Não comprovado ainda:

- criação real da pasta de admissão no Google Drive;
- upload real dos documentos da admissão;
- gravação da ficha nas abas operacionais do Google Sheets.

Nenhuma gravação Google foi realizada nesta rodada.

## Conplus

As gravações reais anteriormente validadas de Rescisões e Férias não foram repetidas. Folha 05 e
Adiantamento 20 permanecem dependentes de layouts oficiais de origem e homologação da Conplus.
Os contratos externos, credenciais, endpoints e regras oficiais ainda precisam ser fornecidos pela
Conplus.

## Produção

Status: **bloqueada para publicação**.

Pendências:

1. destino Google de homologação para admissão;
2. homologação oficial da API Conplus;
3. layouts de origem de Folha 05 e Adiantamento 20;
4. configuração dos secrets no Coolify;
5. teste ponta a ponta da admissão sem dados reais;
6. conclusão da execução das suítes Vitest no ambiente que atualmente bloqueia o launcher.

## Próximos comandos

Após disponibilizar um destino Google de homologação e resolver o bloqueio do launcher:

```powershell
npm run check
npm run test:integration --workspace @padaria/tests
npm run build
```

Manter `GOOGLE_ADMISSAO_SYNC_ENABLED=false` e `CONPLUS_GOOGLE_SYNC_ENABLED=false` até a
homologação formal. Não executar migrations, seed ou deploy sem autorização específica.

## Homologação final — admissão e testes automatizados

Foi criado um ambiente Google separado, sem copiar registros operacionais:

- Planilha: `HOMOLOGACAO PRALIS - ADMISSOES`
- ID da planilha: `1GS3izhVhUcosFJ46P2WEw2QVA1BJL-MYowIQJvAP8Nk`
- Pasta Drive: `HOMOLOGACAO PRALIS - DOCUMENTOS`
- ID da pasta: `1SGnVGm7Rhx3lWHMUkf1owo5Ftv4L4-mZ`
- Abas criadas: `colab.tnp (filter)` e `dependentes.tnp (filter)`
- Cabeçalhos conferidos por leitura: 33 colunas de colaborador e 9 colunas de dependente.

O identificador `homologacao-001` foi verificado como ausente antes da execução. A execução foi
interrompida antes de qualquer registro, upload ou criação de subpasta porque o processo Node falhou
com `uv_os_get_passwd: ENOMEM`. Portanto, não há colaborador, dependente ou documento fictício
gravado nesse ambiente.

Resultado da homologação: **BLOQUEADA por falta de memória local**.

O teste unitário/integrado pelo launcher do workspace também permanece bloqueado pelo erro do
esbuild ao resolver `vitest.config.ts` (`Cannot read directory "../..": Acesso negado`). Os checks
TypeScript, arquitetura, migrations e formatação passaram separadamente.

## AtualizaÃ§Ã£o da homologaÃ§Ã£o e dos testes â€” 21/10/2026

- SuÃ­te unitÃ¡ria: 51 arquivos e 449 testes, cÃ³digo 0.
- IntegraÃ§Ã£o de admissÃ£o: 1 arquivo e 12 testes, cÃ³digo 0.
- IntegraÃ§Ã£o de dependentes: 1 arquivo e 15 testes, cÃ³digo 0.
- O pool de integraÃ§Ã£o foi fixado em `forks` com `maxWorkers: 1` para evitar a violaÃ§Ã£o de
  acesso observada no encerramento de `threads` no Windows e limitar o pico de memÃ³ria.
- A prÃ©via local do executor Google passou sem chamadas externas, cÃ³digo 0.
- A Ãºnica tentativa real autorizada para `homologacao-001` parou antes de qualquer gravaÃ§Ã£o
  por HTTP 403 ao validar a planilha com o OAuth do backend. Nenhuma linha, subpasta ou documento
  foi criado pelo backend.
- O executor passou a tratar esse erro com mensagem segura e cÃ³digo controlado, sem a asserÃ§Ã£o
  nativa do Node observada no encerramento anterior.

HomologaÃ§Ã£o real da admissÃ£o: **BLOQUEADA por permissÃ£o da identidade OAuth do backend**.
Os destinos existem, mas a leitura por um conector externo nÃ£o prova acesso da identidade do
backend. Ã‰ necessÃ¡rio compartilhar a planilha e a pasta de homologaÃ§Ã£o com essa identidade,
sem alterar os destinos operacionais; uma nova gravaÃ§Ã£o exigirÃ¡ autorizaÃ§Ã£o explÃ­cita.

## Atualizacao final dos testes - 21/10/2026

- Unitarios: 51 arquivos, 449 testes, codigo 0.
- Integracao de admissao: 1 arquivo, 12 testes, codigo 0.
- Integracao de dependentes: 1 arquivo, 15 testes, codigo 0.
- O pool de integracao foi fixado em `forks` com `maxWorkers: 1`. Isso evita a violacao de
  acesso observada no encerramento do pool `threads` no Windows e limita o pico de memoria.
- A previa local do executor Google passou sem chamadas externas, codigo 0.
- A unica tentativa real autorizada para `homologacao-001` foi bloqueada antes de qualquer
  gravacao por HTTP 403 ao validar a planilha com o OAuth do backend. Nenhuma linha, subpasta
  ou documento foi criado pelo backend.
- O executor passou a tratar o erro com mensagem segura e codigo controlado, sem a assercao
  nativa do Node observada no encerramento anterior.

Homologacao real da admissao: **BLOQUEADA por permissao da identidade OAuth do backend**.
Os destinos existem, mas a leitura por um conector externo nao prova acesso da identidade do
backend. E necessario compartilhar a planilha e a pasta de homologacao com essa identidade,
sem alterar os destinos operacionais. Uma nova gravacao exigira autorizacao explicita.

## Homologacao real concluida - 22/10/2026

- OAuth autenticado como `dptnp@cicluz.com.br`.
- Destinos de homologacao confirmados por leitura: planilha e pasta HTTP 200.
- Identificador `homologacao-001` estava livre antes da execucao.
- Gravacao unica executada pelo executor oficial, codigo 0.
- Colaborador criado em `'colab.tnp (filter)'!A12:AG12`.
- Dependente criado em `'dependentes.tnp (filter)'!A2:I2`.
- 12 documentos do colaborador e 4 do dependente foram criados no Drive.
- Estrutura confirmada: uma pasta do processo, `Colaborador`, `Dependentes` e uma pasta do dependente.
- Foram encontrados 16 links no Sheets; os 16 resolvem para arquivos existentes no Drive.
- Nao foram encontradas duplicacoes: uma pasta do processo e uma linha em cada aba.
- A sincronizacao operacional permaneceu inalterada; a flag de teste foi aplicada somente ao processo local.

Status da Etapa 1 - Homologacao real da admissao: **APROVADA**.
Proximas etapas: homologacao oficial da API Conplus e planejamento de publicacao, ainda sem deploy.

## Homologacao do fluxo publico - 22/10/2026

- PostgreSQL de desenvolvimento: container saudavel, porta local 5543.
- API: `http://localhost:4100/health` respondeu HTTP 200.
- Frontend: `http://localhost:5174/admissao` respondeu HTTP 200.
- A tentativa de iniciar o fluxo HTTP parou no login administrativo por `HTTP 401 INVALID_EMAIL_OR_PASSWORD`.
- A tentativa anterior sem `Origin` tambem foi recusada por `HTTP 403 MISSING_OR_NULL_ORIGIN`.
- Nenhum processo, convite, dependente ou anexo foi criado por essas tentativas.
- A validacao visual no navegador nao foi concluida porque a automacao CDP nao respondeu de forma confiavel.

Status do fluxo publico ponta a ponta: **BLOQUEADO por sessao administrativa local indisponivel**.
Para concluir, e necessario entrar no sistema com uma conta administrativa local valida e repetir o
fluxo manualmente em `http://localhost:5174/admissao`. A integracao Google de homologacao permanece
validada separadamente; a sincronizacao Google automatica foi mantida desativada neste teste.

## Fechamento técnico — 22/10/2026

Esta rodada não repetiu a admissão nem a sincronização Google. O objetivo foi fechar os gates de
ferramentas e preparar operação/backup.

### Correções locais

- O launcher do workspace de testes passou a usar `--configLoader runner`, contornando o erro do
  esbuild no Windows ao carregar `vitest.config.ts`.
- O `vitest.config.ts` continua com a raiz do monorepo, evitando que os includes sejam resolvidos
  como `tests/tests/...` quando o comando roda pelo workspace.
- O ESLint passou a reconhecer `vitest.config.ts` no `projectService`.
- `/conplus` já é redirecionado para `/conplus/folha-05`; as quatro páginas independentes foram
  preservadas.
- Foram adicionados os procedimentos operacionais em `docs/infra/` para backup/restauração e
  checklist de Coolify. Nenhuma restauração ou publicação foi executada.

### Verificações desta rodada

- Suíte unitária oficial do workspace: 55 arquivos, 503 testes, código 0.
- Typecheck da API: código 0.
- Typecheck do Nuxt: código 0.
- Typecheck do workspace de testes: concluído sem erro observado.
- Build de `shared` + `api`: código 0.
- Build do frontend Nuxt: código 0 fora do sandbox; no sandbox falhou apenas com `EPERM` ao
  resolver `readlink` de `C:\Users\kayla`.
- Prettier dos arquivos alterados: código 0.
- ESLint de `vitest.config.ts`: código 0.
- ESLint global: inconclusivo; o processo ficou sem saída por vários minutos e foi encerrado para
  evitar processo preso. Não é apresentado como aprovado.
- Validação estrutural do Compose Coolify: código 0, sem iniciar containers.

### Pendências críticas

1. Executar o lint global em ambiente/CI que conclua sem travamento.
2. Validar backup e restauração do PostgreSQL e do volume `/app/storage` em ambiente descartável.
3. Revisar o histórico de migrations no banco de publicação antes do deploy.
4. Configurar e validar secrets/IDs Google no Coolify, mantendo as flags desligadas até aprovação.
5. Obter da Conplus os contratos, credenciais de homologação e layouts oficiais de Folha 05 e
   Adiantamento 20.

### Credencial local

O nome da variável sensível exposta acidentalmente em uma inspeção local foi `POSTGRES_PASSWORD`.
O valor não foi registrado neste relatório. Recomenda-se rotacionar a senha do ambiente local de
homologação, sem alterar credenciais de produção automaticamente.
