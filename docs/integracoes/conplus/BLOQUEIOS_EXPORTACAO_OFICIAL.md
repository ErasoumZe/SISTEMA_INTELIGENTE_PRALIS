# O que impede a exportação oficial do TXT de admissão ao Questor

Data: 22/10/2026 · Fonte: teste `tests/unit/conplus-questor-parametros.test.ts`
("com E2–E4 completos, sobram 25 pendências"), que roda a prévia de prontidão sobre uma admissão
fictícia completa.

## Situação por etapa (85 campos requeridos por admissão com 1 dependente)

| Cenário                         | Prontos | Pendentes |
| ------------------------------- | ------- | --------- |
| Hoje (só dados existentes — E1) | 28      | 57        |
| Com E2 + E3 + E4 preenchidos    | **60**  | **25**    |
| Com E5 (ficha do candidato)     | 77      | 8         |
| Com as respostas da Conplus     | 85      | 0         |

E2–E4 zeram as pendências de **DP** e de **empresa**. O que resta depende de:

## 1. Conplus — 8 campos (7 por resposta + 1 por tabela de códigos)

| Campo              | Registro | Precisa de                                                                        | Pergunta |
| ------------------ | -------- | --------------------------------------------------------------------------------- | -------- |
| TERMOCONSENTIMENTO | A        | confirmar se equivale ao aceite do aviso de privacidade                           | Q2       |
| GERARPRELIMINAR    | A        | valor (0/1) para a TNP                                                            | Q3       |
| CATEGESOCIAL       | A        | modalidades de contratação e seus códigos                                         | Q4       |
| CATEGORIA          | A        | idem                                                                              | Q4       |
| TIPOVINCULO        | B        | idem                                                                              | Q4       |
| CODIGOMUNIC        | B        | confirmar se é o código IBGE                                                      | Q5       |
| CODIGOMUNICNASC    | B        | idem                                                                              | Q5       |
| CODIGOTIPOLOGRAD   | B        | tabela de tipos de logradouro da empresa (e regra de correspondência com o texto) | catálogo |

Também da Conplus, embora não sejam campos requeridos vazios:

- **Valores do catálogo e da configuração** (tipo de contrato, sindicato, cargo, escala,
  estabelecimento, organograma e os 16 padrões da empresa): a estrutura E2/E3 aceita, mas os
  valores reais são da Conplus (Q8, Q9). Sem eles, os campos ficam vazios e a prévia acusa.
- **Equivalências de rótulo**: "União estável" (Q13), "Não declarado" (raça/cor), "S/N" no número
  do endereço (Q7), CPF do dependente com ou sem máscara (Q1).
- **Formato do arquivo**: codificação do TXT e CRLF na última linha (Q1).
- **Colunas ambíguas** C.64 e D.4 do NLI (Q14): `INDAPREND`, `ORGAOEMISSORRNE` e `ENTREGACERT`
  ficam bloqueados.

## 2. Formulário do candidato (E5) — 17 campos

`SIGLAESTADONASC`, `DEFFISICA`, `DEFVISUAL`, `DEFAUDITIVA`, `DEFINTELECTUAL`, `DEFMENTAL`,
`DEFREABILITADO`, `TIPOADMRAIS`, `TIPOADMCAGED`, `RECEBSEGURODESEMPREGO`, `INDICATPRIMEMP` (titular)
e, por dependente, `SEXO`, `ESTADOCIVIL`, `GRAUINSTR`, `NACIONALIDADE`, `FUMANTE`, `CONSOMEALCOOL`.

Dependem de: formulário (`web-vue/pages/admissao.vue`, hoje com o Codex), migrations M1/M2 e da
base legal/texto do aviso para deficiência e dados de saúde dos dependentes (Q11).

## 3. Sem exportação até tudo acima

`exportacaoDisponivel` é fixo em `false`. Mesmo com 0 pendências, o download só existe na E6, que
depende de Q1 (codificação).
