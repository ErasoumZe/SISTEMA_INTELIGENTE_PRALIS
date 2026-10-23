# 8. Evidências dos testes

Executados em 22/10/2026 (última rodada no fim do dia) no repositório de desenvolvimento, com dados
**fictícios**. A integração roda contra PostgreSQL 16 **efêmero** (Testcontainers), com Google, e-mail e
demais serviços externos desligados no ambiente do processo.

## Resultado geral

| Conjunto                                                              | Resultado                                                                                                                          |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Suíte de integração completa do projeto                               | **142 de 142 arquivos; 1.089 testes aprovados, 0 falhas** (8 ignorados de propósito, todos do módulo Caixa, fora desta integração) |
| Suíte unitária completa                                               | **65 arquivos, 569 de 569**                                                                                                        |
| Testes do frontend (web-vue)                                          | **69 arquivos, 810 de 810**                                                                                                        |
| Navegador (Playwright, Chromium)                                      | **2 de 2**: fluxo do DP e larguras 1440/1024/768/390 sem rolagem horizontal                                                        |
| Typecheck (shared, db, api, web-vue, tests), arquitetura, texto, lint | sem erros                                                                                                                          |
| Builds (shared, db, api, web-vue)                                     | concluídos                                                                                                                         |
| `check:migrations`                                                    | **OK** — 70 migrations com SQL, entrada no journal e snapshot                                                                      |

## Exportações (TXT e CSV) — o que os testes provam

Arquivo `tests/integration/conplus/questor-exportacoes.test.ts` (17 testes, rota HTTP real):

- **Fluxo completo do CSV**: colaborador → código de contrato Questor → lançamentos → prévia → geração →
  auditoria → histórico → novo download, com o conteúdo do CSV conferido linha a linha.
- **TXT de admissão**: prévia sem gravação; TXT técnico com CR+LF, nome `TECNICO-NAO-IMPORTAR-…`,
  SHA-256 no cabeçalho igual ao do conteúdo, auditoria e arquivo no storage idênticos ao baixado.
- **Idempotência**: gerar o mesmo conteúdo de novo devolve a mesma exportação, sem nova auditoria.
- **Gates**: com os gates desligados, TXT e CSV oficiais respondem `QUESTOR_EXPORTACAO_NAO_HOMOLOGADA`
  e nada é gravado. Com os gates ligados, o TXT com pendência responde 422 e fica na auditoria como
  `bloqueado`, sem arquivo.
- **Duplicidade**: reexportar lançamento já exportado exige motivo (409 sem motivo; com motivo, gera e
  registra o motivo); lançamento exportado não pode ser apagado.
- **Dados inválidos**: ids repetidos, campo `empresaId` no corpo, competência fora do dia 1, valor zero
  ou com vírgula na API, evento desativado, letra não catalogada → recusados.
- **Outra empresa**: processo, lançamento e exportação de outra empresa respondem como inexistentes.
- **Permissões**: Gerência recebe 403 em todas as rotas; sem sessão, 401.
- **Arquivo do histórico**: apagado do storage → 404; adulterado → 409 (SHA não confere).

Arquivo `questor-exportacoes-falhas.test.ts` (2 testes): falha do storage e falha do banco no meio da
geração respondem 500 sem deixar auditoria apontando para arquivo inexistente; a nova tentativa
funciona.

## Integração Questor/Conplus (anteriores, reexecutados)

- **Arquivos oficiais da Conplus**: cada campo lido pelos 4 NLI está no layout com a mesma coluna e
  tamanho; ler e remontar os exemplos oficiais reproduz as linhas byte a byte; as únicas divergências
  de coluna entre documentação e NLI são as 3 bloqueadas.
- **De-para**: toda opção dos formulários vira um código do domínio oficial ou é pendência declarada.
- **Prévia de prontidão**: só leitura, sem dados pessoais, isolada por empresa, restrita ao DP.
- **Configuração e catálogo**: concorrência (409), código fora do catálogo (422), duplicidade (409).
- **Estrutura da API**: origem da importação (`arquivo`/`api`), estado da busca automática (uma
  execução por vez, espera crescente após falha, reserva expirada assumida por outra instância) e
  código do contrato Questor (único por empresa, concorrência, zeros à esquerda removidos).

## Migrations

- Banco vazio → 70 migrations pelo comando oficial (`drizzle-kit migrate`); colunas, índices,
  constraints e triggers idênticos ao schema.
- Homologação: 0064–0069 aplicadas depois de backup, restauração testada e ensaio; estrutura final
  idêntica à de um banco novo (documento 10).

## Pendências conhecidas, declaradas

- Nove tabelas criadas pelas migrations 0061, 0063 e 0068 têm `atualizado_em` sem trigger (os serviços
  gravam a coluna); estão declaradas pelo nome no teste de migrations até a decisão de uma migration
  que instale os triggers.

## Como reproduzir

```bash
npx vitest run --project unit tests/unit/conplus-*.test.ts tests/unit/admissoes-e5-contratos.test.ts
npx vitest run --project integration tests/integration/conplus tests/integration/migracoes
```
