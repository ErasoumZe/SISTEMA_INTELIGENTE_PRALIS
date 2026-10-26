# 9. Guia para avaliar o código

## Por onde começar

| Ordem | Arquivo                                                                                                        | O que mostra                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | `shared/src/conplus/questor-admissao-layout.ts`                                                                | Layout A/B/C/D gerado da documentação + NLI (coluna, tamanho, domínio, obrigatoriedade)                                                                                                       |
| 2     | `shared/src/conplus/questor-admissao.ts`                                                                       | Montagem e validação de cada linha; campos bloqueados                                                                                                                                         |
| 3     | `shared/src/conplus/questor-de-para.ts`                                                                        | Conversões comprovadas (rótulo → código) e formatos                                                                                                                                           |
| 4     | `shared/src/conplus/questor-contrato.ts` e `questor-contrato-parametros.ts`                                    | Dados do Pralís → registros A/B/C/D                                                                                                                                                           |
| 5     | `shared/src/conplus/questor-candidato.ts`                                                                      | Campos do candidato/dependentes; separação comum × sensível                                                                                                                                   |
| 6     | `shared/src/conplus/questor-prontidao.ts`                                                                      | Prévia de prontidão campo a campo                                                                                                                                                             |
| 7     | `shared/src/conplus/questor-eventos-variaveis.ts`                                                              | Arquivo de eventos no layout oficial (`EventoVariavel.nli`), validação e catálogo oficial                                                                                                     |
| 8     | `shared/src/conplus/questor-exportacao.ts`                                                                     | Contratos da prévia, do arquivo técnico/oficial, do histórico e do download                                                                                                                   |
| 9     | `api/src/conplus/`                                                                                             | Rotas, serviços e repositórios: configuração, catálogo, prévia, exportações (`questor-exportacao.*`, `questor-arquivos.ts`), eventos, contratos dos colaboradores, estado da busca automática |
| 10    | `db/src/schema/questor/`, `db/src/schema/conplus/` e `db/migrations/007[2-9]_*.sql`                            | Tabelas e colunas da integração (0063–0069, todas no journal)                                                                                                                                 |
| 11    | `web-vue/` (páginas `/conplus/*`, `/questor`, `/admissao`; componentes `conplus/` e `questor/`)                | Telas do DP e do candidato                                                                                                                                                                    |
| 12    | `tests/unit/conplus-*.test.ts`, `tests/integration/conplus/`, `tests/e2e/admissoes-questor-exportacao.spec.ts` | Comparação com os arquivos oficiais, rotas HTTP (fluxo completo e falhas) e navegador                                                                                                         |

## Arquivos de referência

- `tests/fixtures/conplus-oficial/admissao/` e `tests/fixtures/conplus-oficial/eventos/` — os arquivos
  **da própria Conplus** (NLI, exemplos e catálogos), sem alteração, usados nas comparações byte a byte.
- `tests/fixtures/conplus-gerados/` — TXT e CSV **fictícios** gerados pelo Pralís.

## O que o ZIP contém e o que NÃO contém

Contém somente os arquivos técnicos da integração listados em `MANIFESTO.txt` (dentro do ZIP).

**Não contém:** `.env` ou qualquer credencial, tokens, senhas ou chaves; dados reais de
colaboradores; banco de dados ou backups; arquivos de `storage/`; `node_modules`; builds; logs.
Antes de gerar o ZIP, os arquivos foram varridos por padrões de segredo (chaves privadas, tokens,
variáveis de credencial com valor) e por identificadores de recursos Google; o resultado está no
`MANIFESTO.txt`.

## Como rodar os testes (no repositório completo)

```bash
npm ci
npx vitest run --project unit tests/unit/conplus-questor-*.test.ts
# integração (exige Docker): sobe um PostgreSQL efêmero
npx vitest run --project integration tests/integration/conplus tests/integration/admissoes/e5-campos-questor.test.ts tests/integration/migracoes
```

O ZIP é para leitura e avaliação; ele não traz o monorepo inteiro, então não executa sozinho.
