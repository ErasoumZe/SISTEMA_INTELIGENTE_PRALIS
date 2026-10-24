# Pralís — checklist de publicação no Coolify

Este checklist prepara a publicação, mas não autoriza deploy.

## Secrets e variáveis

Cadastrar no serviço da API, nunca no repositório:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `AUTH_BASE_URL`
- `WEB_ORIGIN`
- `ADMIN_EMAIL` e, somente no bootstrap inicial, `ADMIN_SENHA`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_SPREADSHEET_ID`
- `GOOGLE_ADMISSAO_SYNC_ENABLED`
- `CONPLUS_GOOGLE_SYNC_ENABLED`
- `RESEND_API_KEY` e `EMAIL_FROM`, quando e-mail transacional for exigido

Os IDs Google de produção devem ser confirmados separadamente dos IDs de homologação. As flags
de sincronização permanecem `false` até uma aprovação operacional explícita.

## Serviços e persistência

- O serviço `migrate` deve apontar para o mesmo `DATABASE_URL` da API.
- O serviço `api` deve aguardar `migrate` com sucesso.
- O volume `padaria_api_storage` deve ser persistente, incluído no backup e restaurável.
- O PostgreSQL deve possuir backup recente e restauração descartável validada.
- Não executar seed de referência sem janela e autorização própria.

## Saúde e segurança

- `/health` deve responder 200 dentro do healthcheck.
- A origem web deve ser a origem canônica, sem `*` em produção.
- Cookies devem permanecer `HttpOnly`, `Secure` e com política compatível com o domínio.
- Rotas administrativas devem exigir sessão e permissão no backend.
- Logs não podem conter tokens, senhas, cookies, documentos ou payloads financeiros completos.
- Validar limites de upload, MIME real e proteção contra path traversal.

## Sequência segura

1. Revisar imagem e variáveis no preview do Coolify.
2. Confirmar banco, volume e backups.
3. Executar build em CI ou ambiente de staging.
4. Publicar com healthcheck e janela de observação.
5. Verificar login, rota pública de admissão e leituras administrativas.
6. Validar somente leitura dos destinos Google corretos.
7. Habilitar sincronização apenas com autorização e plano de rollback.

## Validacoes locais — 2026-10-22

## Resultado das validacoes locais — 2026-10-22

- Lint separado: API, DB, shared, testes, scripts, configuracao e frontend concluiram com codigo 0.
- Typecheck do projeto de lint do frontend (`web-vue/tsconfig.eslint.json`): codigo 0.
- Compose Coolify: `docker compose config --quiet` concluido com codigo 0.
- PostgreSQL descartavel: bootstrap completo executado em container e volume temporarios; 64 migrations registradas, migration final `0063` confirmada e constraints/tabelas tecnicas verificadas. Os recursos foram removidos ao final.
- Storage local: a origem efetiva e o bind mount do workspace para `/app/storage` no Compose de desenvolvimento. Foram copiados 840 arquivos para um arquivo temporario, restaurados em diretorio descartavel e comparados por SHA-256: 0 ausentes, 0 extras e 0 divergentes.
- PostgreSQL: dump customizado existente validado com `pg_restore --list` (codigo 0).
- `.env.local`: texto nao pertencente ao formato ENV removido apos backup protegido; atribuicoes preservadas e duplicidades confirmadas como zero.

### Pendencias antes da publicacao

- Confirmar secrets e IDs de producao no Coolify, separadamente dos destinos de homologacao.
- Confirmar backup operacional do volume nomeado `padaria_api_storage` no ambiente de producao/staging; a validacao acima cobre somente o bind mount local.
- Executar build e smoke test no ambiente de staging com a imagem final.
- Aprovar separadamente qualquer ativacao das flags de sincronizacao.

## Rollback

Manter a imagem anterior, os hashes dos artefatos e os backups correspondentes. Em falha, voltar a
imagem anterior sem executar migration reversa automática. Qualquer alteração de schema exige
plano próprio e aprovação antes da publicação.
