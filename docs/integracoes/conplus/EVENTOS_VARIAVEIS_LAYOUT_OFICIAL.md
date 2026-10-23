# Eventos variáveis — adequação ao layout oficial da Conplus (Tarefa 14, 23/10/2026)

## 1. Arquivos oficiais analisados

Recebidos pelo Zoho WorkDrive (confirmação da Conplus em 22/10/2026). Originais na pasta
`docsintegraçõesconplusarquivos22102026/` (raiz do repositório), **sem alteração**; cópias byte a byte
para os testes em `tests/fixtures/conplus-oficial/eventos/`.

| Arquivo                                                       | Conteúdo                                                     | Codificação         | SHA-256                               |
| ------------------------------------------------------------- | ------------------------------------------------------------ | ------------------- | ------------------------------------- |
| `EventoVariavel.nli`                                          | Layout do importador (Delphi)                                | ASCII, CRLF         | `280803e3…f1d1da`                     |
| `Eventos 510 - teste ficticio.csv` / `.txt`                   | Exemplo: `E;510;2505;99;1;318;8,00;0,00;;;;;0;`              | ASCII, CRLF         | `604babac…fc2a30` (iguais)            |
| `Manual – Importação de Eventos Variáveis no Questor.pdf`     | Manual (2 páginas)                                           | —                   | `da0a328b…0e3974`                     |
| `eventos_tnp.csv`, `eventos_lisboa.csv`, `eventos_burpiz.csv` | Catálogo de eventos por empresa (sem H/R/V)                  | ISO-8859-1, CRLF    | `fb885ed9…`, `0374cf6d…`, `3836477c…` |
| `eventos_variaveis_por_empresa.csv`                           | Catálogo consolidado com Referência, Tipo (H/R/V) e Natureza | UTF-8 com BOM, CRLF | `9fd0a0c9…f2cd`                       |

A pasta `docs/integracoes/conplus/ARQUIVOS_OFICIAIS_2026-10-22/` existe e está **vazia**.

## 2. O que mudou

A implementação anterior seguia a documentação pública do Questor ("Importação de Planilha"): 3 linhas
de cabeçalho e **uma linha por colaborador com uma coluna por evento**. O layout que a Conplus usa é
outro: **uma linha por evento de um contrato num período de cálculo**, sem cabeçalho. O gerador antigo
foi **removido** (shared, api, tela e testes); não há dois caminhos.

## 3. Layout confirmado (matriz de conformidade)

Toda linha: 13 colunas separadas por `;`, terminada em `;`, CR+LF. Decimal com vírgula, sem milhar.

| Col  | Campo (NLI)                                                | Tam. | Prec. | Regra do manual                                            | O Pralís preenche com                                                                                   | Teste |
| ---- | ---------------------------------------------------------- | ---- | ----- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----- |
| 1    | identificador                                              | 1    | –     | Sempre `E`                                                 | `E`                                                                                                     | ✔     |
| 2    | codigoempresa                                              | 6    | 0     | Código da empresa no Questor                               | Configuração Questor → **Código da empresa no Questor** (novo, até 6 dígitos; não é o CNPJ)             | ✔     |
| 3    | codigopercalculo                                           | 11   | 0     | Consultar na rotina; pode não seguir ano/mês               | Informado pelo DP a cada arquivo (nunca deduzido do mês); zeros à esquerda removidos                    | ✔     |
| 4    | seq                                                        | 10   | 0     | "Número que ainda não exista para esse contrato e período" | Por contrato: a maior já usada pelo Pralís no período + 1, ou a **sequência inicial** informada pelo DP | ✔     |
| 5    | codigofunccontr                                            | 10   | 0     | Código do contrato                                         | Vínculo → **Contratos no Questor** (até 7 dígitos, como no TXT de admissão)                             | ✔     |
| 6    | codigoevento                                               | 5    | 0     | Código do evento                                           | Catálogo da empresa (até 5 dígitos)                                                                     | ✔     |
| 7    | referevento                                                | 18   | 2     | Quantidade: horas, dias…                                   | Letra **H** ou **R** → valor lançado; **V** → `0,00`                                                    | ✔     |
| 8    | valorevento                                                | 16   | 2     | Valor em reais, quando por valor                           | Letra **V** → valor lançado; **H/R** → `0,00`                                                           | ✔     |
| 9–12 | beneficiário, outra empresa, centro de custo, tipo de aula | –    | –     | Vazias, salvo exceções                                     | Vazias                                                                                                  | ✔     |
| 13   | buscarultvalorcalc                                         | 1    | 0     | 0 = não, 1 = sim                                           | `0`                                                                                                     | ✔     |

Chave do Questor (`Indice` do NLI): **empresa + período + sequência + contrato**. O Pralís a garante dentro
do arquivo (validação) e entre arquivos oficiais (índice único no banco).

**Prova:** o teste lê o exemplo oficial e o remonta **byte a byte**, e gera exatamente a mesma linha a
partir de um lançamento equivalente (`tests/unit/conplus-questor-eventos-variaveis.test.ts`).

## 4. Eventos por empresa (catálogo consolidado)

Os arquivos por empresa e o consolidado conferem em código, descrição e sequência (teste automático).

| Empresa                         | Eventos | Particularidades                                          |
| ------------------------------- | ------- | --------------------------------------------------------- |
| COMERCIAL TUDONUPAO LTDA (TNP)  | 14      | único com 708 Premio                                      |
| COMERCIAL LISBOA ALIMENTOS LTDA | 15      | únicos com 105 Vale Compras e 712 Feriado horas; sem 708  |
| BURPIZ LTDA                     | 9       | 800 Desconto de Vales com **sequência 2** (nas outras, 1) |

Letras: **H** = Hora (35, 36, 49, 50, 63, 109, 317, 712), **R** = Dia (97, 1073, 1087), **V** = Valor
(105, 708, 800, 842, 1407). O evento 318 do exemplo não está em nenhum catálogo.

O DP importa o catálogo em **Exportações Questor → Eventos variáveis → Importar catálogo oficial**,
escolhendo qual empresa do arquivo é a empresa atual. Só eventos novos são gravados; código já existente
com outros dados aparece como divergente e não é alterado; arquivo com linha inválida não grava nada.

## 5. Regras de validação

- Lançamento: competência no dia 1; valor maior que zero com até 2 casas (o Questor guarda 2 — o Pralís
  não arredonda); evento ativo e letra aceita pelo catálogo; um lançamento por colaborador, competência e
  evento.
- Arquivo: código da empresa configurado; "Utiliza Hora Centesimal" configurado quando há horas (sem
  hora centesimal, minutos ≥ 60 são recusados); todo colaborador com código de contrato; todos os
  lançamentos da competência escolhida; nada de linha repetida na chave do Questor.
- Oficial: só com os dois gates de homologação; mesmo pedido de novo devolve o mesmo arquivo (conferido
  pelo SHA-256; arquivo sumido ou adulterado é erro, nunca um arquivo novo); lançamento já exportado só
  sai de novo com **motivo**, e com sequências novas; gerações simultâneas da mesma empresa entram em
  fila (trava na linha da configuração) e a segunda reconfere o que a primeira gravou.
- Técnico: mesmo conteúdo, nome `TECNICO-NAO-IMPORTAR-…`, auditoria `previa`, nenhuma sequência
  reservada; **encerrado** quando a exportação estiver homologada (evita um segundo caminho de importação).
- Nome do arquivo: `Eventos <código da empresa> - <MM-AAAA>.csv` (padrão do manual).

## 6. Banco — migration 0070 (`0070_eventos_layout_oficial`)

Aditiva: colunas novas nulas e CHECKs que as linhas existentes satisfazem.

- `questor_configuracoes.codigo_empresa_questor` (1–999999).
- `questor_eventos_variaveis`: `sequencia_questor`, `filial_questor`, `natureza` (dados do catálogo oficial).
- `questor_exportacoes.codigo_periodo_calculo` (1–11 dígitos).
- `questor_exportacoes_eventos_variaveis`: `codigo_periodo_calculo`, `codigo_contrato`, `sequencia` (retrato
  da linha oficial) + índice único parcial `questor_exportacoes_eventos_chave_questor_unica`
  (empresa, período, contrato, sequência) onde há sequência.

Aplicada **somente** em bancos descartáveis (Testcontainers e o banco de E2E). Homologação (5544) e
desenvolvimento (5543) **não foram alterados**: continuam com 70 e 64 migrations.

**Rollback:** como é aditiva, o código anterior continua funcionando com ela aplicada. Para remover num
banco descartável: dropar o índice `questor_exportacoes_eventos_chave_questor_unica`, as constraints
`questor_configuracoes_codigo_empresa_check`, `questor_eventos_variaveis_natureza_check`,
`questor_eventos_variaveis_catalogo_check`, `questor_exportacoes_periodo_check`,
`questor_exportacoes_eventos_linha_check`, as 8 colunas acima e a linha `0070` de
`drizzle.__drizzle_migrations`. Na homologação, quando for aplicada, seguir o procedimento de backup e
restauração de `HOMOLOGACAO_MIGRATIONS_0064_0069.md`.

## 7. Arquivos

- **shared:** `conplus/questor-eventos-variaveis.ts` (reescrito), `questor-exportacao.ts`,
  `questor-parametros.ts`, `questor-api.ts`.
- **db:** `schema/questor/questor.schema.ts`, `schema/questor/questor-exportacoes.schema.ts`,
  `migrations/0070_eventos_layout_oficial.sql` + snapshot e journal.
- **api:** `conplus/questor-eventos.{service,repository,controller}.ts`,
  `questor-exportacao.{service,controller}.ts`, `questor-exportacoes.repository.ts`,
  `questor-configuracao.{repository,service}.ts`.
- **web:** `components/conplus/QuestorEventosArquivo.vue` (novo), `QuestorEventosImportarCatalogo.vue` (novo),
  `QuestorEventosVariaveis.vue`, `QuestorEventosCatalogo.vue`, `QuestorExportacaoPage.vue`;
  `components/questor/QuestorConfiguracaoEmpresa.vue`.
- **testes:** `tests/unit/conplus-questor-eventos-variaveis.test.ts` (reescrito),
  `tests/integration/conplus/questor-exportacoes.test.ts`, `tests/unit/conplus-questor-api.test.ts`,
  `tests/e2e/admissoes-questor-exportacao.spec.ts`; fixtures em `tests/fixtures/conplus-oficial/eventos/`.
- **removidos:** `tests/unit/conplus-questor-eventos-csv.test.ts` e
  `tests/fixtures/conplus-gerados/eventos_variaveis_ficticio_pralis.csv` (layout antigo).

## 8. Admissão (TXT)

Revisado: os exemplos oficiais de admissão (07/10/2026) são UTF-8 sem BOM e o Pralís gera UTF-8 sem BOM;
posições e domínios continuam conferidos byte a byte contra os NLI. Nada mudou no TXT nesta tarefa.

## 9. Pendências da Conplus (perguntas abertas)

1. Código de cada empresa no Questor (coluna 2) — TNP, Lisboa, Burpiz; a filial (todas "1 - Matriz")
   entra em algum lugar do arquivo?
2. A "Sequência" do catálogo (1; 2 no evento 800 da Burpiz) tem relação com a coluna 4? O Pralís trata
   a coluna 4 como número da linha por contrato e período (é o que o `Indice` e o manual indicam).
3. Coluna 4: há faixa reservada para importação, para não colidir com lançamentos manuais no Questor?
4. Para eventos V, a coluna 7 deve ser `0,00` (como o Pralís faz, espelhando o exemplo) ou vazia? E a 8
   para H/R?
5. Horas: 7h30 vai como `7,50` ou `7,30`? (o Pralís usa a configuração "Utiliza Hora Centesimal" da empresa).
6. Descontos levam sinal? (o Pralís envia valor positivo; a natureza vem do evento).
7. Aspas (`Delimitador = '"'` no NLI) são aceitas ou proibidas? CR+LF é exigido? O exemplo é ASCII sem aspas.
8. Contrato: é o mesmo código de 7 dígitos do TXT de admissão (CODIGOFUNCCONTR), embora o NLI de eventos
   permita 10?

## 10. Preparação para a API (previsão a partir de 28/10/2026)

Nada da API foi implementado (sem documentação nem ambiente de homologação). Quando chegar: o catálogo
por empresa pode ser carregado pela consulta da API no lugar do arquivo; o código da empresa, do
período e do contrato também passam a vir de consulta; a geração do arquivo continua igual.

## 11. Testes executados

Ver o relatório da tarefa (números da última rodada) e `ENTREGA_TECNICA/08_EVIDENCIAS_TESTES.md`.
