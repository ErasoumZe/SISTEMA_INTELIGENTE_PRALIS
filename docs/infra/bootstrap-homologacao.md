# Bootstrap do PostgreSQL de homologação

Procedimento versionado para inicializar ou atualizar somente o banco local de homologação,
preservando as migrations históricas e usando o migrator oficial do Drizzle.

## Execução autorizada

Use exclusivamente o banco local destinado à homologação:

```powershell
$env:NODE_ENV = "development"
$env:DATABASE_URL = "postgresql://USUARIO:SENHA@127.0.0.1:5544/padaria_homologacao"
$env:PRALIS_HOMOLOGACAO_BOOTSTRAP_CONFIRMADO = "SIM"
node scripts/bootstrap-homologacao.mjs
```

O script recusa execução quando o host não é local, a porta não é `5544`, o banco não é
`padaria_homologacao`, `NODE_ENV=production` ou a confirmação explícita está ausente.

Para testes descartáveis, use também `PRALIS_HOMOLOGACAO_DISPOSABLE=SIM` e um banco local com
nome `padaria_homologacao_teste_<identificador>` em uma porta diferente de `5543` e `5544`. Esse
modo não aceita o banco de homologação real.

## Sequência e compatibilidade

1. O script lê o journal e identifica automaticamente a última migration disponível; atualmente é
   `0066_questor_contrato_dp`.
2. Em banco novo, o Drizzle aplica o prefixo anterior à `0061`.
3. O script verifica/cria, em transação, a UNIQUE
   `admissoes_processos_dependentes_id_processo_empresa_unico`, necessária pela FK da `0061`.
4. O migrator oficial aplica a lista completa, registrando `0061` até a última migration pendente,
   incluindo `0062`, `0063`, `0064`, `0065` e `0066`.
5. Em banco já inicializado com 64 migrations, o script valida o prefixo do journal e aplica apenas
   as migrations pendentes até `0066`; não recria o banco nem altera dados existentes.

O histórico armazenado precisa ser exatamente um prefixo do journal local: timestamps, quantidade e
ordem devem corresponder. Histórico divergente, migration posterior desconhecida ou banco com tabelas
sem histórico interrompem o procedimento.

## Idempotência e segurança

- Banco já em `0066`: somente leitura de estado e encerramento sem alterações.
- Execução repetida após sucesso: não duplica registros no journal nem objetos.
- Nenhuma migration é marcada artificialmente e nenhum hash é alterado.
- A exceção `0061/0062` é preservada apenas como pré-condição controlada da UNIQUE necessária.
- O procedimento não deve ser executado no PostgreSQL principal, em produção ou em banco com dados
  que não tenham sido explicitamente autorizados para homologação.

## Validação recomendada

Antes de usar no banco 5544, execute a mesma versão em dois PostgreSQL descartáveis:

- banco vazio: migrations `0000` até `0066`;
- banco com o prefixo validado de 64 migrations: avanço somente de `0064` até `0066`.

Em ambos, repita o bootstrap e confira que o journal tem 67 entradas, o último timestamp corresponde
à `0066`, as constraints/FKs Questor estão presentes e a segunda execução não altera o estado.
