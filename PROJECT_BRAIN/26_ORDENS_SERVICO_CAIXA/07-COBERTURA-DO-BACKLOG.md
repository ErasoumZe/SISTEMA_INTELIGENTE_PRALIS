# Cobertura do backlog e limite do fechamento do Caixa

Este arquivo evita dois erros: esquecer um bloqueador do Caixa e transformar a finalizacao do Caixa
numa refatoracao infinita do ERP.

## Incorporados nas ordens de servico

| Grupo              | Itens cobertos                                              |
| ------------------ | ----------------------------------------------------------- |
| gates              | G-01, G-02, G-04, G-05, G-06, G-08, G-09, G-10 e F-14       |
| dinheiro           | D-01 a D-12                                                 |
| seguranca do Caixa | S-01 a S-09, S-11 a S-18 e achados cross-tenant pos-PR #139 |
| bugs operacionais  | B-01 a B-07                                                 |
| continuidade       | O-01 a O-07                                                 |
| front/aceite       | F-06, F-07, F-09, F-10, F-11, F-15, F-16 e F-17             |
| decisoes           | C-01 a C-05 e C-07 a C-12                                   |
| regras recentes    | R-121, R-124 a R-126, R-137 a R-140 e R-143                 |

`S-10` (54 permissoes inertes) entra apenas no inventario da `CX-M04`: remover uma permissao so
e obrigatorio para o go-live se ela criar acesso indevido, impedir o perfil de Caixa ou confundir um
fluxo que sera homologado.

## Comprovados e nao reabertos sem regressao

- G-04 (`/health` com banco), G-10 (paridade migration), S-06 (permissoes ocultas), PR #137 e PR
  #139.
- B-05/R-121 ja existe no codigo; a fila exige prova de interface/E2E, nao outra implementacao.

## Adiados para depois do Caixa

| Itens       | Motivo                                                                      |
| ----------- | --------------------------------------------------------------------------- |
| G-03 e G-07 | higiene/max-lines/dist; nao mudam correcao financeira ou seguranca do fluxo |
| F-01 a F-03 | refatoracao ampla da casca; alto conflito e nenhum aceite financeiro direto |
| F-04        | Aparencia fora do fluxo do Caixa                                            |
| F-05        | placeholders de outros modulos                                              |
| F-08        | medicao de coverage, nao correcao                                           |
| F-12 e F-13 | recorrencia e campos legados fora dos tres fluxos de Caixa homologados      |
| C-06        | Compras/estoque/relatorios so depois do Caixa                               |
| C-13        | local do PROJECT_BRAIN nao bloqueia comportamento do produto                |
| M7 e M8     | Compras e higiene documental, salvo contradicao que bloqueie uma OS ativa   |

## Regra de reclassificacao

Um item adiado volta para a fila antes do go-live se uma prova RED, teste, revisao ou homologacao
mostrar que ele causa perda/duplicacao de dinheiro, takeover, vazamento cross-tenant, impossibilidade
de operar o Caixa ou falha de deploy/rollback. A reclassificacao recebe ID, dono e dependencia; nao
entra silenciosamente numa PR existente.
