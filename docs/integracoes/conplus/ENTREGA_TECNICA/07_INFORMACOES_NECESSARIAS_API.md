# 7. O que precisamos da Conplus

## A. Para o TXT de admissão (homologação por arquivo)

| #   | Pergunta / material                                                                                                      | Campos afetados                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Q1  | Codificação do arquivo (UTF-8 ou ANSI/Windows-1252)? CPF do registro D com ou sem máscara? CR+LF também na última linha? | arquivo inteiro; D.CPFFUNC, D.CPFDEPEND                                            |
| Q2  | O "Termo de Consentimento" equivale ao aceite do aviso de privacidade do Pralís? Qual valor enviar?                      | A.TERMOCONSENTIMENTO                                                               |
| Q3  | GERARPRELIMINAR: 0 ou 1 para nossas empresas?                                                                            | A.GERARPRELIMINAR                                                                  |
| Q4  | Modalidades de contratação usadas e seus códigos de categoria eSocial, categoria e tipo de vínculo                       | A.CATEGESOCIAL, A.CATEGORIA, B.TIPOVINCULO                                         |
| Q5  | Município é o código IBGE (7 dígitos)?                                                                                   | B.CODIGOMUNIC, B.CODIGOMUNICNASC                                                   |
| Q7  | Que número enviar em endereço "S/N" (campo inteiro)?                                                                     | B.NUMEROENDER                                                                      |
| Q8  | Código de estabelecimento e organograma de cada empresa                                                                  | B.CODIGOESTAB, B.CLASSIFORGAN                                                      |
| Q9  | Padrões por empresa: FGTS, adiantamento, 13º, PAT, Q-Colabore, campos sindicais                                          | 15 campos do registro B                                                            |
| Q13 | "União estável" corresponde a Concubinato (5) ou Outros (6)? "Não declarado" (raça/cor) = "Não Informado" (9)?           | B/D.ESTADOCIVIL, B.RACACOR                                                         |
| Q14 | Divergências do documento 5 (colunas C.64 e D.4; exemplo D)                                                              | C.INDAPREND, C.ORGAOEMISSORRNE, D.ENTREGACERT                                      |
| —   | **Tabelas de códigos por empresa**: tipo de contrato, sindicato, cargo, escala, tipo de logradouro                       | A.CODIGOTIPOCONTR, A.CODIGOSIND, A.CODIGOCARGO, B.CODIGOESCALA, B.CODIGOTIPOLOGRAD |

## B. Para o arquivo de eventos variáveis (layout recebido em 22/10/2026)

- Código de cada empresa no Questor (coluna 2): TNP, Lisboa, Burpiz. A filial entra em algum lugar?
- A "Sequência" do catálogo (1; 2 no evento 800 da Burpiz) tem relação com a coluna 4 do arquivo?
- Coluna 4: há faixa reservada para importação, para não colidir com lançamentos feitos no Questor?
- Eventos V: coluna 7 com `0,00` ou vazia? Eventos H/R: coluna 8 com `0,00` ou vazia?
- Horas: 7h30 vai como `7,50` ou `7,30`? Descontos levam sinal?
- Aspas (o NLI declara `Delimitador = '"'`) são aceitas? CR+LF é exigido?
- Contrato (coluna 5): é o mesmo código de até 7 dígitos do TXT de admissão?

## B2. Itens anteriores do CSV (substituídos pelo layout acima)

- Modelo CSV anexado ao e-mail de 07/10/2026.
- Catálogo de eventos por empresa (código e letra H/R/V aceitos).
- Confirmação de que a coluna 1 é o código do contrato (CODIGOFUNCCONTR) e configuração "Utiliza
  Hora Centesimal" de cada empresa.

## C. Para os relatórios recebidos (Folha 05, Adiantamento 20, Rescisões, Férias)

Layouts oficiais (ou endpoints) com exemplos fictícios completos; identificação de empresa,
competência, colaborador e registro; regras de retificação.

## D. Para a API SYN

1. URL base e endpoints de homologação e produção.
2. Autenticação: método, escopos, expiração e renovação de credenciais.
3. Documentação OpenAPI ou equivalente; formato do "JSON String" do envio de admissão.
4. Idempotência, retorno, códigos de erro, rejeição, retificação e cancelamento.
5. Limites (rate limit, paginação, timeouts) e política de retentativa.
6. Webhooks ou consulta de status/rastreabilidade.
7. Requisitos de segurança (IPs, certificados).
8. **Credenciais e dados fictícios de homologação**, e o checklist formal de homologação.
