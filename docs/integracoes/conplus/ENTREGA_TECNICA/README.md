# Sistema Inteligente Pralís — entrega técnica para a Conplus

Data: 26/10/2026 (versão 3: eventos variáveis no layout oficial recebido em 22/10/2026; proteções do arquivo técnico; migration 0079) · Destinatário: equipe técnica da
Conplus (integração Questor / API SYN).

Este pacote apresenta o Pralís, o que já está implementado para a integração de folha e admissão, o
que depende de material oficial da Conplus e o que precisamos para liberar a API. Ele é técnico e
**não contém dados pessoais reais, credenciais nem acesso a ambientes**.

| #   | Documento                                                                                              | Conteúdo                                                     |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | [01_APRESENTACAO_TECNICA.md](01_APRESENTACAO_TECNICA.md)                                               | O que é o Pralís e o objetivo da integração                  |
| 2   | [02_ARQUITETURA.md](02_ARQUITETURA.md)                                                                 | Frontend, API, PostgreSQL, Google Sheets/Drive e Questor     |
| 3   | [03_FLUXO_ADMISSAO_DEPENDENTES.md](03_FLUXO_ADMISSAO_DEPENDENTES.md)                                   | Do convite ao candidato até o arquivo Questor                |
| 4   | [04_PAGINAS_FOLHA_ADIANTAMENTO_RESCISOES_FERIAS.md](04_PAGINAS_FOLHA_ADIANTAMENTO_RESCISOES_FERIAS.md) | As quatro páginas do DP: implementado x dependente de layout |
| 5   | [05_EXPORTACAO_TXT_ADMISSAO.md](05_EXPORTACAO_TXT_ADMISSAO.md)                                         | TXT de admissão, registros A/B/C/D                           |
| 6   | [06_CSV_EVENTOS_VARIAVEIS.md](06_CSV_EVENTOS_VARIAVEIS.md)                                             | CSV de eventos variáveis                                     |
| 7   | [07_INFORMACOES_NECESSARIAS_API.md](07_INFORMACOES_NECESSARIAS_API.md)                                 | **O que precisamos da Conplus**                              |
| 8   | [08_EVIDENCIAS_TESTES.md](08_EVIDENCIAS_TESTES.md)                                                     | Testes executados e resultados                               |
| 9   | [09_GUIA_AVALIACAO_CODIGO.md](09_GUIA_AVALIACAO_CODIGO.md)                                             | Como avaliar o código do pacote                              |
| 10  | [10_MIGRATIONS.md](10_MIGRATIONS.md)                                                                   | Migrations da integração (0072–0079)                         |

O arquivo `pralis-conplus-avaliacao-2026-10-26-v3.zip` (nesta pasta) traz estes documentos, o código
relacionado à integração e os arquivos oficiais de eventos usados nos testes. As versões anteriores
(`…-2026-10-22.zip` e `…-2026-10-22-v2.zip`) foram preservadas. Conteúdo e verificações de segurança: documento 9.

**Resumo em uma frase:** o Pralís já monta, valida, audita (SHA-256) e permite baixar o TXT de admissão
(A/B/C/D, em versão técnica) e o CSV de eventos variáveis nos layouts oficiais, mas mantém os arquivos
oficiais bloqueados enquanto faltarem as respostas e tabelas da Conplus (documento 7); nada é enviado à
Conplus automaticamente.
