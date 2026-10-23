# 10. Migrations da integração

Todas no journal do Drizzle, com snapshot, e só acrescentam: nenhuma reescreve dado existente.

| Migration                     | O que cria                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0063_conplus_importacoes`    | Importações recebidas da Conplus (prévia, confirmação, registros, eventos, histórico, sincronização Google)                                                                                                                                                                                                                                                                                  |
| `0064_questor_configuracao`   | Configuração Questor por empresa (estabelecimento, organograma, hora centesimal, padrões) e catálogo de códigos (tipo de contrato, sindicato, cargo, escala, logradouro)                                                                                                                                                                                                                     |
| `0065_questor_cadastros`      | Código Questor nas funções (cargo, agente nocivo) e nos turnos (escala, jornada)                                                                                                                                                                                                                                                                                                             |
| `0066_questor_contrato_dp`    | Dados contratuais do DP no processo de admissão (salário, experiência, tipo de admissão etc.)                                                                                                                                                                                                                                                                                                |
| `0067_e5_campos_candidato`    | Campos comuns do candidato e dos dependentes (UF e município IBGE de nascimento, nacionalidade, 1º emprego, seguro-desemprego, sexo/estado civil/escolaridade do dependente)                                                                                                                                                                                                                 |
| `0068_questor_exportacoes`    | Auditoria das exportações (SHA-256, idempotência, resultado, arquivo), catálogo de eventos variáveis e lançamentos por competência                                                                                                                                                                                                                                                           |
| `0069_conplus_api_estrutura`  | Origem da importação (`arquivo` ou `api`), estado da busca automática por empresa e relatório, código do contrato Questor no vínculo do colaborador                                                                                                                                                                                                                                          |
| `0070_eventos_layout_oficial` | Eventos variáveis no layout oficial: código e razão social da empresa no Questor, dados do catálogo oficial, período de cálculo do arquivo, chave do Questor (período + contrato + sequência) única entre arquivos oficiais, cancelamento lógico de lançamento e trilha de auditoria. **Ensaiada (aplicação e rollback) numa cópia da homologação; ainda não aplicada em banco persistente** |

## Banco novo

Um banco vazio sobe pelo mesmo comando do deploy (`drizzle-kit migrate`), da 0000 à 0070. A 0061 cria,
de forma idempotente, a chave única que a FK dela usa (antes ela só nascia na 0062, e um banco vazio
parava na 0061). Bancos que já tinham as duas não mudam: o Drizzle decide o que aplicar pela data da
migration, não pelo conteúdo.

## Provas

- `check:migrations`: 70 migrations com SQL, entrada no journal e snapshot.
- Teste de migrations: banco vazio → 70 migrations pelo comando oficial; colunas, índices, constraints e
  triggers idênticos ao schema.
- Homologação: as seis pendentes (0064–0069) foram aplicadas depois de backup, restauração testada e
  ensaio no banco restaurado; estrutura final idêntica à de um banco novo.
