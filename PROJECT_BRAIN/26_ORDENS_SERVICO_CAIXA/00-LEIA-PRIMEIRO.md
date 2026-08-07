# Finalização do módulo Caixa — painel mestre

Data-base: 07/08/2026
Código auditado: `origin/main` em `bd4909c` (PR #141 incorporada)
Prioridade de produto: **1º Caixa, 2º Compras, 3º Relatórios** (`R-144`)

> **Fila vigente:** `08-FILA-GITHUB-ATUAL.md`. Ela prevalece sobre os estados antigos dos
> arquivos `01` e `02` quando houver divergencia. O arquivo `09` contem o comentario
> pronto para a issue-mestra #136.

## Objetivo

Este diretório é a fila executável para declarar o módulo Caixa terminado. Ele transforma os riscos,
bugs e decisões espalhados pelo `PROJECT_BRAIN` em ordens de serviço pequenas, ordenadas e divididas
entre Marco e José.

Não é uma autorização para mudar regra de negócio. Decisões continuam vivendo no `PROJECT_BRAIN`.

## O que significa “Caixa terminado”

O Caixa só pode ser declarado terminado quando todos os itens abaixo forem verdadeiros:

1. Uma venda do CREARE entra uma única vez, inclusive sob concorrência e reprocessamento.
2. Data, caixa, itens e pagamentos da venda são idempotentes e conciliáveis.
3. Pagamento dividido em 2 e 3 formas não multiplica venda nem total.
4. Venda tardia atualiza histórico e detalhe com o mesmo total.
5. Juros, desconto, dinheiro físico, cartão e PIX seguem uma fórmula aprovada e testada.
6. Abertura, lançamentos, transferência, lacre, fechamento, diferença e retorno têm um único fluxo.
7. Operador só movimenta a conta do próprio PDV e não acessa empresa, conta ou usuário alheio.
8. Usuário de Caixa pode ser criado, recuperar senha e entrar no sistema.
9. Robô, reprocesso, locks, rate limit, vendas órfãs e logs têm tratamento operacional.
10. Backup e restauração foram testados antes de migrations ou correções em produção.
11. Os três fluxos de dinheiro passam em E2E e a interface funciona em 1440/1024/768/390.
12. CI e testes finais estão verdes, o diff foi revisado e existe plano de rollback.

## Regras de execução

- Uma OS e uma branch ativa por pessoa.
- Toda branch nasce da `origin/main` atual; nunca se trabalha diretamente na `main` local.
- Marco e José não mexem nos mesmos arquivos na mesma janela.
- Claude principal é o único escritor; agentes paralelos são somente-leitura.
- Agentes são encerrados antes de lint, build ou testes pesados.
- Testes específicos durante a edição; suíte completa uma vez no fechamento.
- Migration: parar e mostrar o SQL antes (`R-111`).
- Fórmula de dinheiro: parar e obter decisão antes.
- Dado histórico/produção: mostrar contagem e amostra mascarada antes (`R-112`).
- Push, PR, merge e deploy são autorizações separadas.
- Merge somente com todos os checks do GitHub verdes.
- Nada no `C:`; cache, temporários, worktrees e artefatos ficam no `D:`.

## Estado atual

| OS        | Dono          | Estado                 | Trabalho                                            |
| --------- | ------------- | ---------------------- | --------------------------------------------------- |
| `CX-M03A` | Marco         | **EM EXECUÇÃO**        | B-02 — recuperar senha sem recriar o trabalho do Ze |
| `CX-Z101` | José          | **EM REVISAO/ENTREGA** | issue #101 — fechamento, retorno, sangria e cofre   |
| demais    | conforme fila | aguardando dependencia | seguir exclusivamente o arquivo `08`                |

## Ordem por ondas

Esta tabela e o catalogo amplo. A ordem executavel e as travas de conflito estao no arquivo `08`.

| Onda                    | Marco               | José                | Saída obrigatória                                       |
| ----------------------- | ------------------- | ------------------- | ------------------------------------------------------- |
| 0 — agora               | `CX-M01`            | `CX-Z01` + `CX-Z02` | evidência de pagamentos + números/decisões              |
| 1 — fundação            | `CX-M02` → `CX-M05` | `CX-Z03` → `CX-Z04` | acesso seguro + backup/migration seguros                |
| 2 — ingestão            | `CX-M06` → `CX-M07` | `CX-Z05` → `CX-Z07` | venda idempotente, data correta e reprocesso controlado |
| 3 — total/fechamento    | `CX-M08` → `CX-M09` | `CX-Z08` → `CX-Z10` | uma fórmula e uma visão do fechamento                   |
| 4 — transferência/lacre | `CX-M10`            | `CX-Z11` → `CX-Z14` | fluxo único, lacre íntegro e venda integrada imutável   |
| 5 — operação/aceite     | `CX-M11` → `CX-M12` | `CX-Z15` → `CX-Z22` | automação operacional e homologação completa            |
| 6 — liberação           | `CX-T01` conjunto   | `CX-T01` conjunto   | release candidate, go-live e rollback                   |

## Itens já comprovados — não refazer

- R-121 no backend: operador de Caixa sai pela conta do PDV aberto.
- B-05 no código atual: campo da conta já fica travado e preenchido; falta somente prova de front/E2E.
- S-06: permissões ocultas preservadas.
- PR #137: escopo da listagem de regras de permissões.
- PR #139: projeção cross-tenant de metadados em `GET /api/usuarios` e `GET /api/permissoes`.
- PR #140: D-06 de pagamento dividido provada com casos independentes.
- PR #141: B-01 de criacao de usuario corrigida, incluindo takeover e estado parcial.
- Commit `467f081`: base de reset de senha, Resend e paginas publicas ja existe; nao recriar.
- G-04: `/health` toca o banco.
- G-10: paridade journal/snapshot das migrations.

## O que não entra no fechamento do Caixa

Compras, estoque, pedidos, Curva ABC, IA, telas placeholder e refatorações amplas do shell. Esses
itens só começam depois do `CX-T01`, salvo correção estritamente necessária para um fluxo do Caixa.
A classificacao item a item esta em `07-COBERTURA-DO-BACKLOG.md`.
