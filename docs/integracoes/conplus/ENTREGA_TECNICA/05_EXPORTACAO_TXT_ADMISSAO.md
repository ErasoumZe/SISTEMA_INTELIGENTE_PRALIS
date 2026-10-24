# 5. Exportação TXT de admissão (A/B/C/D)

Base: documentação "ERP Parceiro x Questor Folha — enviar dados / nfpaadmissaofuncionario" e os
arquivos enviados pela Conplus em 07/10/2026 (`A_FunContratoPre.nli`, `B_…`, `C_…`, `D_…` e os
exemplos `admissao_*.txt`), versionados no pacote em `tests/fixtures/conplus-oficial/` sem alteração.

## Formato gerado

| Item                       | Regra aplicada                                                                               | Origem                     |
| -------------------------- | -------------------------------------------------------------------------------------------- | -------------------------- |
| Registros                  | A (contrato preliminar), B (dados obrigatórios), C (não obrigatórios), D (um por dependente) | documentação               |
| Ordem                      | A, B, C e D… por contrato (B/C são detalhe do A; D liga por CNPJ + CPF + data de admissão)   | NLI (`itMaster`, `Indice`) |
| Campos por registro        | A 21 · B 85 · C 67 · D 32                                                                    | documentação e exemplos    |
| Separador / decimal / data | `;` · `,` sem milhar · DD/MM/AAAA                                                            | NLI                        |
| Fim de linha               | CR+LF em todas as linhas                                                                     | documentação               |
| Valores                    | nunca truncados; texto acima do tamanho é apontado como inválido                             | —                          |

## Validação

Cada linha é conferida contra o layout: tamanho, tipo, data real, domínio (listas da coluna
"Observação"), máscaras (CNPJ, CPF, PIS, CEP), obrigatoriedade, condicionais (descrição do salário;
fato de prazo determinado) e vínculo do dependente com o titular.

**Comparação com os originais:** ler e remontar os quatro exemplos oficiais reproduz cada linha byte
a byte; um arquivo fictício gerado pelo Pralís difere do exemplo oficial só nos placeholders.

## Divergências encontradas nos arquivos oficiais (precisam de resposta)

1. NLI do registro C lê `INDAPREND` e `ORGAOEMISSORRNE` da mesma coluna 64; a documentação põe
   `INDAPREND` na 67.
2. NLI do registro D lê `ENTREGACERT` da coluna 4 (a mesma de `DATAADM`); a documentação diz 32.
3. O exemplo D traz texto onde o layout pede código (`Masculino`, `Educação Superior Completa`),
   `FORMACONTROLEIR = 5` (só 1/2 existem) e omite campos requeridos.
4. No exemplo unificado, a data de admissão do dependente não é a do titular.

Os três campos ambíguos (itens 1 e 2) **ficam sempre vazios** no arquivo gerado até a confirmação.

## Rotas e tela (estado em 22/10/2026)

Tela: **Departamento Pessoal → Exportações Questor** (`/conplus/exportar`).

| Rota                                                       | O que faz                                                                                                                                                                                                  | Grava?                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /api/conplus/questor/exportacoes/admissoes/previa`   | Monta o arquivo a partir do PostgreSQL (empresa da sessão; ficha aprovada) e lista pendências por campo                                                                                                    | Não                                                        |
| `POST /api/conplus/questor/exportacoes/admissoes/tecnico`  | **TXT técnico**: o arquivo como o Pralís o monta hoje, campos sem resposta da Conplus em branco. Nome `TECNICO-NAO-IMPORTAR-admissao-questor-<sha>.txt`. Para conferência e amostra, **não para importar** | Arquivo + auditoria `previa`                               |
| `POST /api/conplus/questor/exportacoes/admissoes/download` | **TXT oficial**: exige os dois gates de homologação e o arquivo sem nenhuma pendência; admissão já exportada só sai de novo com motivo                                                                     | Arquivo + auditoria `gerado` (ou `bloqueado`, sem arquivo) |
| `GET /api/conplus/questor/exportacoes`                     | Histórico da empresa (tipo, resultado, SHA-256, quem, quando, motivo)                                                                                                                                      | Não                                                        |
| `GET /api/conplus/questor/exportacoes/:id/arquivo`         | Baixa de novo um arquivo do histórico; confere o SHA-256 do disco contra a auditoria (divergente → 409; apagado → 404)                                                                                     | Não                                                        |

Auditoria e arquivo:

- Tabelas `questor_exportacoes` e `questor_exportacoes_admissoes` (migration **0068**, no journal).
- Arquivo no storage em `questor-exportacoes/<empresa>/<sha256>.txt`, gravado **antes** da
  auditoria: se o registro falhar, não fica auditoria apontando para arquivo inexistente.
- Idempotência: o mesmo conteúdo devolve a exportação existente (`X-Questor-Reutilizado: true`).
- Resposta do download: `text/plain; charset=utf-8`, `Content-Disposition: attachment`,
  `X-Questor-Sha256` e `X-Questor-Exportacao-Id`.
- Isolamento: processo ou exportação de outra empresa responde como inexistente.
- Permissão `conplus_exportar_admissoes` (DP). Sem sessão, 401; sem permissão, 403.

## Liberação

O TXT oficial fica bloqueado enquanto houver pendência e depende ainda de homologação explícita
(`CONPLUS_QUESTOR_EXPORT_ENABLED` e `CONPLUS_QUESTOR_EXPORT_HOMOLOGADA`, ambos desligados). Hoje,
com dados reais, ele **sempre** tem pendências: os campos que dependem das respostas do documento 7
(por exemplo A.TERMOCONSENTIMENTO, A.GERARPRELIMINAR, A.CATEGESOCIAL, A.CATEGORIA). Nenhum arquivo é
enviado à Conplus automaticamente.
