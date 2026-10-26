# Bloqueios das exportações Questor e preparação para a API Conplus (Tarefa 15, 23/10/2026)

## 1. Bloqueios — o que existe e em que estado está

"Bloqueios desligados" no relatório anterior queria dizer **liberações desligadas**: o arquivo oficial está
**bloqueado**. Inventário completo:

| Mecanismo                           | Onde                                                                                      | Padrão  | Estado hoje                                                                                                | Efeito                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CONPLUS_QUESTOR_EXPORT_ENABLED`    | `api/src/env.ts`                                                                          | `false` | `false` em todos os ambientes (não aparece em `.env*` nem nos compose; os compose nem repassam a variável) | 1º gate do arquivo oficial                                                                             |
| `CONPLUS_QUESTOR_EXPORT_HOMOLOGADA` | `api/src/env.ts`                                                                          | `false` | `false` em todos os ambientes                                                                              | 2º gate do arquivo oficial                                                                             |
| `exigirExportacaoHomologada()`      | `api/src/conplus/questor-exportacao.service.ts`                                           | —       | **ponto único** usado pelo TXT oficial e pelos eventos oficiais                                            | recusa com 422 `QUESTOR_EXPORTACAO_NAO_HOMOLOGADA` e grava `recusa_homologacao` em `questor_auditoria` |
| `exigirArquivoTecnicoDisponivel()`  | mesmo arquivo                                                                             | —       | técnico disponível (gates desligados)                                                                      | técnico encerrado (422) quando os gates forem ligados                                                  |
| Confirmação do técnico              | schemas `questorExportacaoAdmissaoTecnicoSchema` / `questorEventosVariaveisTecnicoSchema` | —       | exigida                                                                                                    | sem `confirmacaoArquivoTecnico: true` → 400                                                            |
| Permissões                          | `conplus_exportar_admissoes`, `conplus_exportar_eventos`, `conplus_questor_configurar`    | DP      | —                                                                                                          | 403 para os demais cargos; histórico filtrado pelo tipo que a pessoa pode exportar                     |
| Reexportação                        | `jaExportado` + motivo                                                                    | —       | ativo                                                                                                      | lançamento/admissão já em arquivo oficial só sai de novo com motivo; sequências novas                  |
| Chave do Questor                    | índice `questor_exportacoes_eventos_chave_questor_unica` + trava por empresa              | —       | ativo                                                                                                      | mesma empresa+período+contrato+sequência nunca em dois arquivos oficiais                               |
| `CONPLUS_GOOGLE_SYNC_ENABLED`       | `api/src/env.ts`                                                                          | `false` | `false`                                                                                                    | sincronização das importações Conplus com o Google                                                     |
| `GOOGLE_ADMISSAO_SYNC_ENABLED`      | `api/src/env.ts`                                                                          | `false` | `true` **só no `.env.local` de desenvolvimento**                                                           | fora do escopo Questor; produção `false` pelo compose                                                  |
| API Conplus                         | —                                                                                         | —       | **não existe cliente**                                                                                     | nenhuma chamada à Conplus sai do sistema                                                               |

Regras:

- A liberação é **só do servidor**: a tela lê `GET /api/conplus/questor/exportacoes/estado` e reflete; mexer
  no navegador não libera nada (o botão oficial vem desabilitado, mas mesmo forçando a chamada o servidor recusa e audita).
- **Não há liberação por data.** A previsão da API (28/10/2026) não liga nenhum gate.
- Para liberar depois da homologação: definir as duas variáveis como `true` **e** repassá-las no compose do
  ambiente — ato deliberado, com autorização.

## 2. Riscos tratados nesta tarefa

| Risco                                                 | Tratamento                                                                                                                                                                                                                           | Residual                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Importar o arquivo técnico por engano                 | Prefixo `TECNICO-NAO-IMPORTAR-`; diálogo com confirmação obrigatória ("Entendi…"); confirmação exigida também no servidor; download auditado com a confirmação; técnico encerrado após a homologação; nada é enviado automaticamente | **O arquivo técnico continua importável se alguém o levar ao Questor**: tem o layout oficial e o Questor não lê o nome. Não alteramos o conteúdo para impedir a importação (isso invalidaria o arquivo como amostra). Mitigação: confirmação + auditoria + encerramento após homologação |
| Lançamento em arquivo técnico não podia ser corrigido | Cancelamento lógico com motivo (`POST …/lancamentos/:id/cancelar`): sai da tela e dos arquivos, fica no histórico e na auditoria; o mesmo evento pode ser relançado. Apagar continua só para quem nunca saiu em arquivo              | Lançamento de arquivo **oficial** não é cancelado nem apagado (409)                                                                                                                                                                                                                      |
| Catálogo de outra empresa                             | Razão social no Questor configurada pelo DP (Configuração Questor) é a identidade; o servidor só importa linhas dessa empresa, recusa as demais (422) e registra `recusa_catalogo`; sem configuração, recusa                         | Se o DP configurar a razão social errada, o catálogo errado entra — a configuração exige a permissão `conplus_questor_configurar`                                                                                                                                                        |

### 2.1 Auditoria independente (26/10/2026) — achados e tratamento

Revisão só de leitura por um agente que não participou da implementação: 0 crítico, 2 altos, 3 médios,
4 baixos.

- **Alto — cancelar × gerar oficial ao mesmo tempo** podia deixar o lançamento cancelado _e_ no CSV
  oficial (com o relançamento, evento em dobro na folha). **Corrigido:** cancelar e apagar entram na
  mesma fila da geração (trava da configuração Questor da empresa); a geração reconfere, dentro da
  transação e com `FOR SHARE`, que todos os lançamentos continuam ativos (409
  `QUESTOR_LANCAMENTO_CANCELADO`). Teste concorrente: nunca termina cancelado e exportado, nunca 500.
- **Alto — técnico pelo histórico** saía sem confirmação e depois da homologação. **Corrigido:** o novo
  download do técnico exige `?confirmacaoArquivoTecnico=true` (422
  `QUESTOR_CONFIRMACAO_TECNICO_OBRIGATORIA` sem ela), fica encerrado após a homologação e é auditado
  com a confirmação; a tela abre o mesmo diálogo da geração.
- **Médio — oficial pelo histórico sem os gates.** **Corrigido (padrão seguro):** baixar de novo um
  oficial passa pelos mesmos gates; homologação revogada = não baixa, e a recusa fica na auditoria. Se
  Marco quiser manter o re-download de oficiais já auditados com os gates desligados, é decisão a
  registrar no PROJECT_BRAIN.
- **Médio — rollback da 0079 reativaria lançamentos cancelados.** **Corrigido:** o rollback para se
  houver cancelado (saída: restaurar o backup) e confere que apaga exatamente 1 registro da 0079 (Baixo).
- **Baixo — transação oficial sem teto de lock:** passou a usar `executarEmTransacao` (`lock_timeout`).
- **Baixo — corrida apagar × gerar dava 500:** a exclusão entrou na mesma fila (409 claro).
- **Médio — a prévia devolve e mostra o arquivo completo** (copiável sem confirmação/auditoria).
  **Pendente de decisão:** mostrar o conteúdo foi escolha da tela para conferência; copiar do navegador
  tende a gerar LF (o oficial é CRLF). Opções: deixar como está (risco residual documentado) ou mostrar
  só a tabela de linhas e diagnósticos.
- **Baixo — identidade do catálogo só pela razão social** (duas empresas com a mesma razão social
  aceitariam o catálogo uma da outra; o CSV não traz o código da empresa). **Pendente de decisão:**
  exigir também o código da empresa configurado e/ou unicidade da razão social normalizada. Impacto
  limitado: a mesma permissão já cria eventos manualmente.

## 3. Preparação para a API Conplus

Sem documentação oficial, **nada foi inventado**: não há endpoint, cliente HTTP, credencial nem simulação.
O que já existe e foi feito para receber a API:

| Peça                                                                                                                                | Situação                                                                                                                                                     | Depende da especificação oficial                                    |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Geradores puros (TXT de admissão, eventos) em `shared/src/conplus`                                                                  | prontos, testados contra os arquivos oficiais                                                                                                                | se a API aceitar JSON em vez de arquivo, o mapeamento campo a campo |
| Importações com `origem` = `arquivo` ou `api` (migration 0078)                                                                      | prontas                                                                                                                                                      | formato do retorno da API                                           |
| Estado da busca automática por empresa e relatório (`conplus_sincronizacao_estado`, serviço com reserva, espera crescente e cursor) | pronto, testado                                                                                                                                              | endereço, autenticação, paginação/cursor, limites                   |
| Auditoria (`questor_exportacoes`, `questor_auditoria`)                                                                              | pronta                                                                                                                                                       | códigos de erro e rastreio da API                                   |
| Isolamento por empresa                                                                                                              | toda consulta usa a empresa da sessão                                                                                                                        | como a API identifica a empresa (código Questor?)                   |
| Gates de liberação                                                                                                                  | centralizados                                                                                                                                                | —                                                                   |
| Credenciais                                                                                                                         | **não há onde guardar ainda** de propósito; quando houver, entram como variáveis de ambiente do servidor (como as do Google), nunca no banco ou no navegador | método de autenticação                                              |
| `apiConplusDisponivel` no estado                                                                                                    | sempre `false`                                                                                                                                               | —                                                                   |

Quando a documentação chegar: criar o cliente atrás de um gate próprio desligado por padrão, reaproveitar a
reserva/cursor de `conplus_sincronizacao_estado`, gravar o retorno como importação `origem = 'api'`, e testar
contra o ambiente de homologação da Conplus antes de qualquer uso real.
