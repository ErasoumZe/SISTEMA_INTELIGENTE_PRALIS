# 10 — Xmind V2 (novo mapa): o que MUDOU

> Fonte: `SISTEMA PRALIS (4).pdf` (24/07). **Substitui** os PDFs antigos do Xmind como visão-alvo.
> Renders de referência em `docs/xmind-v2/`. Lido tela a tela; é uma mudança estrutural grande —
> "vamos mudar bastante coisa feita" (palavras do José). Este doc é o levantamento do delta; o
> plano de ação vem depois que o José explicar a direção.

## 1. A mudança-mãe: o menu agora é organizado por SETOR, não por categoria

**Antes (o que construímos):** menu plano por categoria — Caixa, Entradas, Despesas, Transferências,
Mercadorias, Retiradas… iguais para todos, permissão aplicada por cima.

**Agora (Xmind V2):** cada grande categoria se abre **por SETOR**, e cada setor vê um **menu próprio**
com itens específicos. O mesmo domínio aparece sob vários setores, com telas/atributos diferentes.
Exemplo real (Saídas – Despesas / Custos):

```
Saídas – Despesas / Custos  (MENU)
├─ Setor – Gerência   → Registro-Faltas/Atestados · Registro-Advertência/Suspensão
├─ Setor – DP         → Registro-Ponto · Folha de pagamento
├─ Setor – Fiscal     → Registro-Fiscal fechamento
├─ Setor – Financeiro → Saída-Contas a pagar · Saídas-Despesas/Custos
└─ Setor – Diretor geral → Saídas-Despesas/Custos
```

Ou seja: **o setor define o que aparece no menu.** Isso muda o modelo de navegação E de permissão
que temos hoje. Não é "esconder botão por permissão" — é um menu montado por setor.

## 2. Nova nomenclatura (tudo vira Entradas / Saídas)

| Antes          | Agora (V2)                                                                                |
| -------------- | ----------------------------------------------------------------------------------------- |
| Entradas       | **Entradas – Vendas / Faturamento**                                                       |
| Transferências | **Transferências – Contas / Locais**                                                      |
| Despesas       | **Saídas – Despesas / Custos**                                                            |
| Mercadorias    | **Saídas – Mercadorias / CMV**                                                            |
| Retiradas      | **Saídas – Retiradas / Investimentos**                                                    |
| Resultado      | **Resultados – Relatórios**                                                               |
| _(novo)_       | **Resultados – Diferença fechamento** ← tela própria para as diferenças (R9), ver `13` §4 |
| Cadastros      | **Configuração – Cadastros / Gerais**                                                     |
| (novo)         | **Formulários – Cadastros / Avaliações**                                                  |

## 3. Cada item de menu tem "aspectos" (tags) — formaliza o cockpit

Cada nó do menu carrega tags que dizem o que aquela tela FAZ:
`TELA / LANÇAMENTO(S) / RESUMO / EXPANSÃO / DISCRIMINAÇÃO / CADASTRO`.

- **TELA** = tem tela própria · **LANÇAMENTO** = cria lançamento · **RESUMO** = visão resumida ·
  **EXPANSÃO** = abre o detalhe · **DISCRIMINAÇÃO** = detalha itens · **CADASTRO** = é cadastro.
- Ex.: as categorias do caixa são `TELA/LANÇAMENTO/RESUMO/EXPANSÃO` → é exatamente o **cockpit**
  (a tela mostra, deixa lançar, resume e expande). Nosso cockpit está no caminho certo.

## 4. As 9 ações de permissão — CONFIRMADAS, e agora por Setor E Usuário

O Xmind V2 lista, dentro de `Cadastros – Usuário/Permissões → Cadastro – Permissões`, os **Tipos**:

```
Lançar · Pagar · Discriminar · Visualizar · Visualizar D/Pago
· Editar · Editar D/Pago · Excluir · Excluir D/Pago
```

E **duas camadas de permissão**: `Permissões – Setor` e `Permissões – Usuário`. Isso valida a Fase C
que já especificamos — mas amarra a permissão ao **SETOR** como camada de primeira classe (não só
cargo). Nosso modelo hoje é setor→cargo→usuário; o V2 enfatiza **setor** e **usuário**.

## 5. Módulos NOVOS que o sistema ainda não tem

Aparecem no V2 e não existem (ou são placeholder) hoje:

**DP / RH:** Registro-Ponto · Registro-Faltas/Atestados · Registro-Advertência/Suspensão ·
Saídas-Despesas/Folha de pagamento · **Assinaturas – Digital** (assinatura digital nos registros,
TELA/CADASTRO).

**Fiscal:** Registro-Fiscal fechamento.

**Mercadorias/estoque:** Cadastro-Promoções · Pedidos-Produtos · **Contagem-Perdas/Sobras** ·
**Contagem-Estoque/Produtos** · Cadastro-Setor/Locais de Estoque.

**Financeiro:** **Contas a pagar** como visão do setor Financeiro (em Despesas, Mercadorias,
Retiradas) · Taxas de cartões.

**Cadastros novos:** Grupo **/ Sub Grupo** por categoria (hierarquia grupo+subgrupo) ·
Unidade de Medidas · Área/Setores/**Sub Setor** · **Cargos/Salários** · Pontos de Venda (PDV) ·
Vínculo Grupo/Sub Grupo Contas/Locais.

## 6. Telas desenhadas à mão (as "novas imagens de telas")

Cada categoria (Transferências, Despesas, Mercadorias, Retiradas) tem **fotos de wireframes
desenhados pelo Rodrigo**, marcados "Passo a passo:" — o fluxo de cada tela, no mesmo estilo do
rascunho de Transferência que ele já tinha mandado. São fotos de papel; o detalhe fino precisa ser
lido no original em zoom alto quando formos desenhar cada tela. Estão embutidos no mapa (render
parcial em `docs/xmind-v2/b_screen.png`).

## 7. Segunda empresa (HORA) num diagrama à parte

Há um diagrama separado à direita (Colaboradores, Produtos, Área, Introdução, Produtos) — parece o
recorte da **HORA** (a 2ª/3ª empresa). Confirma que o modelo é o mesmo para as três, com dados
próprios (D14: TNP primeiro, LI/HORA depois).

## 8. Impacto no que já construímos (resumo honesto)

| O que temos                                                                     | Status vs V2                                                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Menu plano por categoria                                                        | **muda** → menu por setor                                                |
| Permissão por cargo (3 camadas)                                                 | **ajusta** → ênfase em setor + usuário; 9 ações confirmadas              |
| Cockpit (TELA/LANÇAMENTO/RESUMO/EXPANSÃO)                                       | **no caminho certo** — é o conceito das tags                             |
| M1/M2 (malote/déficit/transferências)                                           | **continua válido** — é o backend do fluxo de caixa                      |
| Mockups (cockpit, transferência, despesa, malotes, permissões)                  | **válidos no espírito**, mas o menu ao redor e a divisão por setor mudam |
| Módulos de DP, fiscal, assinatura, promoções, pedidos, contagem, contas a pagar | **novos** — não existem ainda                                            |
| Grupo → **Sub Grupo**, Sub Setor, Cargos/Salários, Taxas de cartões             | **novos cadastros**                                                      |

## 9. O que NÃO mudou (âncoras que seguem valendo)

- As 9 ações de permissão (idênticas à Fase C).
- O conceito do cockpit (as tags TELA/LANÇAMENTO/RESUMO/EXPANSÃO).
- O fluxo de caixa com malote/lacre/déficit (M1/M2) e a cor por categoria da planilha.
- Entradas = venda (integração); Saídas = despesas/mercadorias/retiradas.

## 10. Perguntas que o V2 abre (para o José direcionar)

1. O menu por **setor** substitui de vez a navegação atual? (é a maior mudança de front)
2. Os módulos novos (DP/ponto/folha, fiscal, assinatura digital, contagem/perdas, contas a pagar)
   entram no escopo agora, ou depois do núcleo do caixa?
3. "Sub Grupo" e "Sub Setor" — precisam de migration nos cadastros existentes.
4. As telas desenhadas à mão: leio cada uma em alta resolução para virar spec antes de desenhar?
