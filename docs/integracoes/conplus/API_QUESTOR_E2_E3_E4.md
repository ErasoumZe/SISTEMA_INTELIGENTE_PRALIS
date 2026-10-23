# API Questor — E2, E3 e E4 (especificação para as telas do DP)

Data: 22/10/2026 · Contratos em código: `@padaria/shared/conplus` (`questor-api.ts` +
`questor-parametros.ts`). Rotas implementadas e registradas em `api/src/app.ts`; migrations
0064–0066 incorporadas ao repositório. **Num banco ainda não migrado, todas respondem 503
`QUESTOR_MIGRATION_PENDENTE`** (a prévia de prontidão continua funcionando).

## Regras comuns

- Empresa sempre da sessão. Nenhuma rota, query ou corpo aceita `empresaId` (o corpo é `strict`).
- Envelope `{ data }`; erro no formato problem `{ type, title, status, code }`.
- Concorrência otimista em toda escrita: `versao` (configuração, contrato) ou `atualizadoEmLido`
  (função, turno). Conflito → **409 `QUESTOR_VERSAO_DESATUALIZADA`**: recarregar e reaplicar.
- Nenhum código ou parâmetro Questor é preenchido pelo servidor. Campo nulo = pendente; a prévia de
  prontidão mostra de quem é a pendência.
- Listas de opções (agente nocivo, jornada, tipo de salário, padrões da empresa): usar
  `dominioDoCampoQuestor(registro, campo)` — **não** copiar valores para a tela.

## Rotas

| #   | Método | Caminho (`ROTAS_QUESTOR`)                        | Permissão                               | Corpo / query                                                   | Resposta                                                   |
| --- | ------ | ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | GET    | `/api/conplus/questor/configuracao`              | `conplus_questor_configurar` **(nova)** | —                                                               | `ConfiguracaoQuestorDto` (`versao: 0` se ainda não existe) |
| 2   | PUT    | `/api/conplus/questor/configuracao`              | `conplus_questor_configurar`            | `configuracaoQuestorPayloadSchema`                              | `ConfiguracaoQuestorDto`                                   |
| 3   | GET    | `/api/conplus/questor/codigos`                   | `conplus_questor_configurar`            | `?tabela=&incluirInativos=` (`codigosQuestorQuerySchema`)       | `CodigoQuestorDto[]`                                       |
| 4   | POST   | `/api/conplus/questor/codigos`                   | `conplus_questor_configurar`            | `codigoQuestorPayloadSchema`                                    | 201 `CodigoQuestorDto`                                     |
| 5   | PATCH  | `/api/conplus/questor/codigos/:id`               | `conplus_questor_configurar`            | `codigoQuestorAtualizacaoSchema` (só `descricao`/`ativo`)       | `CodigoQuestorDto`                                         |
| 6   | GET    | `/api/conplus/questor/funcoes`                   | `conplus_questor_configurar`            | —                                                               | `FuncaoQuestorDto[]` (todas as funções da empresa)         |
| 7   | PUT    | `/api/conplus/questor/funcoes/:id`               | `conplus_questor_configurar`            | `funcaoQuestorRequisicaoSchema`                                 | `FuncaoQuestorDto`                                         |
| 8   | GET    | `/api/conplus/questor/turnos`                    | `conplus_questor_configurar`            | —                                                               | `TurnoQuestorDto[]`                                        |
| 9   | PUT    | `/api/conplus/questor/turnos/:id`                | `conplus_questor_configurar`            | `turnoQuestorRequisicaoSchema`                                  | `TurnoQuestorDto`                                          |
| 10  | GET    | `/api/admissoes/processos/:id/questor/contrato`  | `admissoes_processos_editar_internos`   | —                                                               | `ContratoQuestorDto`                                       |
| 11  | PUT    | `/api/admissoes/processos/:id/questor/contrato`  | `admissoes_processos_editar_internos`   | `contratoQuestorRequisicaoSchema` (`versao` = do bloco interno) | `ContratoQuestorDto`                                       |
| —   | GET    | `/api/admissoes/processos/:id/questor/prontidao` | `admissoes_processos_ver_ficha`         | —                                                               | `ProntidaoQuestorDto` (**já existe**)                      |

Não há DELETE: código do catálogo é desativado (`ativo: false`), nunca apagado.

## Erros de domínio

| HTTP      | `code`                            | Quando                                                                                                                                                                              | O que a tela faz                                          |
| --------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 400       | —                                 | corpo inválido (domínio/tamanho do layout, campo desconhecido)                                                                                                                      | mostrar a mensagem por campo                              |
| 409       | `QUESTOR_VERSAO_DESATUALIZADA`    | outra pessoa gravou antes                                                                                                                                                           | recarregar                                                |
| 409       | `QUESTOR_CODIGO_DUPLICADO`        | POST de código já existente na mesma tabela                                                                                                                                         | avisar; sugerir reativar                                  |
| 422       | `QUESTOR_CODIGO_FORA_DO_CATALOGO` | padrão/contrato/função/turno referencia código ausente ou inativo no catálogo **da empresa** — validado em **toda** gravação, inclusive código já gravado que foi desativado depois | escolher outro código ativo (ou cadastrar o código antes) |
| 503       | `QUESTOR_MIGRATION_PENDENTE`      | banco sem as migrations 0064–0066                                                                                                                                                   | esconder a tela / avisar que o ambiente não foi migrado   |
| 403 / 404 | —                                 | sem permissão / recurso de outra empresa                                                                                                                                            | padrão                                                    |

## Decisões que dependem do Codex/Marco

1. **Permissão nova `conplus_questor_configurar`** em `db/src/referencia-permissoes.ts` e no
   catálogo de permissões do `shared` — proposta: só o cargo **DP**. Arquivo sob o Codex.
2. **Registro das rotas** em `api/src/app.ts` — feito junto com o backend, depois da migration.
3. **Telas** (Codex): Configuração Questor (cadastros base do DP), colunas Questor em Funções e
   Turnos (ou tela de vínculo única usando as rotas 6–9), bloco "Contrato" no processo (rotas 10–11)
   — componente próprio, o `ProcessoDetalheDialog.vue` já passa de 700 linhas.
4. **Salário (rota 10/11)** é dado sensível: só quem edita o bloco interno vê. A Gerência não.

## Mapeamento para o TXT (já implementado e testado, sem banco)

`aplicarParametrosQuestor` (`questor-contrato-parametros.ts`): padrões da empresa → função/turno →
contrato do DP (o DP prevalece). Lógico → `1`/`0`; salário em centavos → `1518,00`. Com E2–E4
completos a prévia cai de 57 para 25 pendências — ver `BLOQUEIOS_EXPORTACAO_OFICIAL.md`.
