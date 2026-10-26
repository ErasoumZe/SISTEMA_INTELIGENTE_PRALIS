# 6. Arquivo de eventos variáveis

Base: arquivos enviados pela Conplus em 22/10/2026 — `EventoVariavel.nli`, "Manual – Importação de
Eventos Variáveis no Questor", exemplo `Eventos 510 - teste ficticio.csv` e catálogos por empresa.
Substitui o layout de planilha (cabeçalho + uma coluna por evento) usado antes, que vinha da
documentação pública do Questor.

## Formato gerado

Um evento por linha, para um contrato num período de cálculo. Sem cabeçalho. 13 colunas separadas por
`;`, linha terminada em `;`, CR+LF, decimal com vírgula e 2 casas, sem milhar.

```
E;510;2505;99;1;318;8,00;0,00;;;;;0;
```

| Col   | Conteúdo                     | De onde vem no Pralís                                                                     |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------- |
| 1     | `E`                          | fixo                                                                                      |
| 2     | Código da empresa no Questor | Configuração Questor da empresa                                                           |
| 3     | Período de cálculo           | informado pelo DP a cada arquivo (consultado na rotina do Questor)                        |
| 4     | Sequência                    | por contrato, a partir da sequência inicial informada ou da maior já exportada no período |
| 5     | Contrato                     | código do contrato Questor do vínculo do colaborador                                      |
| 6     | Evento                       | catálogo da empresa                                                                       |
| 7 / 8 | Referência / Valor           | H e R → coluna 7; V → coluna 8; a outra leva `0,00`                                       |
| 9–12  | —                            | vazias                                                                                    |
| 13    | Buscar último valor          | `0`                                                                                       |

O teste automatizado lê o exemplo oficial e o reproduz byte a byte, e gera a mesma linha a partir de um
lançamento equivalente. Matriz completa e regras: `docs/integracoes/conplus/EVENTOS_VARIAVEIS_LAYOUT_OFICIAL.md`.

## Catálogo por empresa

O DP importa o catálogo consolidado (`eventos_variaveis_por_empresa.csv`), escolhendo qual empresa do
arquivo é a empresa atual: TNP 14 eventos, Lisboa 15, Burpiz 9. Só eventos novos são gravados; nada é
sobrescrito. Nenhum código é inventado.

## Segurança do arquivo

- A chave do Questor (empresa + período + sequência + contrato) nunca se repete num arquivo nem entre
  arquivos oficiais (índice único no banco).
- Mesmo pedido de novo devolve o mesmo arquivo, conferido pelo SHA-256. Reexportar lançamento exige
  motivo e usa sequências novas. Gerações simultâneas da mesma empresa entram em fila.
- Arquivo técnico (`TECNICO-NAO-IMPORTAR-…`) para conferência: exige confirmação explícita de quem baixa
  (na tela e no servidor), o download fica auditado e ele é encerrado depois da homologação. Como tem o
  layout oficial, continua importável se alguém o levar ao Questor — por isso não deve ser importado.
- Lançamento que saiu só em arquivo técnico pode ser cancelado com motivo (fica no histórico); o de arquivo
  oficial não.
- O catálogo oficial só é importado para a empresa cuja razão social no Questor foi configurada no Pralís.
- O oficial só sai com os gates de homologação ligados. Nada é enviado à Conplus automaticamente.

## Situação (26/10/2026)

Implementado e testado (unitário, integração, navegador). Migration `0079_eventos_layout_oficial`
testada só em bancos descartáveis.

**Depende da Conplus:** código de cada empresa no Questor e respostas às perguntas do documento 7
(sequência do catálogo × coluna 4, coluna não usada em eventos V, hora centesimal, sinal dos descontos,
aspas e CR+LF).
