# 4. As quatro páginas do Departamento Pessoal

São relatórios **recebidos** da Conplus (sentido Conplus → Pralís). Não confundir com os arquivos que
o Pralís **envia** ao Questor (documentos 5 e 6).

Rotas: `/conplus/folha-05`, `/conplus/adiantamento-20`, `/conplus/rescisoes`, `/conplus/ferias`.

| Página              | Leitura do arquivo                                           | Persistência / histórico                                                       | Google (prévia)        | Situação                                                    |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------- |
| **Rescisões**       | TXT de rescisões calculadas (colunas alinhadas)              | Prévia → confirmação idempotente → PostgreSQL → consulta/histórico/retificação | Prévia somente leitura | **Implementado e testado** com arquivo fictício             |
| **Férias**          | CSV de períodos aquisitivos (`;`)                            | Idem                                                                           | Prévia somente leitura | **Implementado** com arquivo fictício (ver ressalva abaixo) |
| **Folha 05**        | **Bloqueada**: "Este formato ainda não possui leitor seguro" | Estrutura de tela pronta (colunas da planilha do DP)                           | —                      | **Depende do layout oficial** do arquivo/relatório          |
| **Adiantamento 20** | **Bloqueada**, mesmo motivo                                  | Idem                                                                           | —                      | **Depende do layout oficial**                               |

## Ressalvas, sem rodeios

- Os leitores de Rescisões e Férias foram construídos sobre **exemplos locais**, não sobre um
  layout oficial enviado pela Conplus. Precisamos do layout oficial para homologá-los.
- A sincronização Google fica desligada por padrão; sem credenciais, a rota responde
  "desabilitada" (o defeito anterior, que respondia 500 em Férias, foi corrigido em 22/10/2026).
- As colunas exibidas em Folha 05 e Adiantamento 20 vêm da planilha usada hoje pelo DP. **Não
  presumimos** que essa seja a estrutura do arquivo da Conplus.

## Pronto para a busca automática pela API

Quando a API for liberada, os relatórios entram pelo **mesmo caminho** do upload manual (prévia,
confirmação, histórico, retificação e idempotência por conteúdo). O que já existe para isso:

| Estrutura                                                                                                                                                                                                        | Onde                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Origem de cada importação: `arquivo` (upload do DP) ou `api` (busca automática)                                                                                                                                  | coluna `conplus_importacoes.origem` (migration 0069)                                                                                                         |
| Estado da busca por empresa e relatório: até onde buscou (competência e cursor), execução em andamento com prazo (uma instância por vez), falhas seguidas e próxima tentativa com espera crescente (5 min → 6 h) | tabela `conplus_sincronizacao_estado` (0069); serviço `api/src/conplus/conplus-sincronizacao.service.ts`; leitura em `GET /api/conplus/sincronizacao/estado` |

Falta, e depende da Conplus: o cliente que chama a API (endereço, autenticação, formato) e o
agendamento que aciona a busca.

## O que precisamos (detalhe no documento 7)

Layout oficial (ou endpoint da API) dos relatórios de Folha dia 05, Adiantamento dia 20, Rescisões e
Férias, com exemplos fictícios completos e a identificação de empresa, competência e colaborador.
