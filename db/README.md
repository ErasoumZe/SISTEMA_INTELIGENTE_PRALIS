# DB

Configuracoes de banco, migrations Drizzle e seed de dados.

No desenvolvimento, o `npm run dev` sobe/reutiliza apenas o Postgres dev e roda o preparo do banco localmente antes da API principal subir:

1. `npm run db:setup --workspace @padaria/api`
2. `npm run db:seed --workspace @padaria/api`

No preparo dev, a API chama `setup:dev`, que tenta `drizzle-kit push --force` sem prompt e sem log verbose de SQL. Se o banco dev ja tiver o schema esperado, uma falha do `push` nao bloqueia o seed. O `setup` manual continua usando `drizzle-kit push` com `strict`/`verbose` ligados.

Em producao, o seed nao roda automaticamente. O servico `migrate` do compose produtivo executa:

1. `npm run db:migrate --workspace @padaria/api`
2. `npm run db:migrate:drizzle --workspace @padaria/api`

O seed recria usuarios de desenvolvimento vinculados a colaboradores e cargos ativos: Diretor Geral, Caixa, Gerencia, Tesouraria, Compras, DP, RH, Fiscal, Diretor de Operacoes e Financeiro. O `diretor@email.com` e criado com role `usuario_admin`; os demais usuarios seedados usam `usuario_comum`. Veja emails e senha padrao no `README.md` da raiz.
