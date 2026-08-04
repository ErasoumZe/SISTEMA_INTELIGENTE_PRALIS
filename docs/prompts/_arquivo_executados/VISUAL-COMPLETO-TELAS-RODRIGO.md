# Prompt — Visual completo das telas do Rodrigo (visual primeiro, regras depois)

> Estratégia acordada (José, 27/07): **primeiro o visual de todas as telas**, depois refazemos as
> regras. Spec de campos: `PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md` (transcrição dos 5
> desenhos originais). Tokens já estão na main (`--cat-*`, Noto Sans, `#6515dd`).

## O que já existe (levantado no código, 27/07)

| Tela | Existe hoje | Falta (dos desenhos) |
|---|---|---|
| **Transferência** (modal, branch `feat/telas-fieis-mockup`) | tipo (Suprimento/Sangria/Retorno), Origem, Destino, valor, lacre, descrição | Agendamento + data · Data recebimento (confirmação) · Múltiplo destino · Sempre confirmar · bloco Transf. Entrada multi-linha · Resumo Saída/Entrada/Saldo |
| **Despesa** (modal, mesma branch) | Conta, Grupo, Pagamento, Vencimento, valor | Juros + Valor Total · Data/N° Doc. Fiscal · credor tipado (fornecedor/colaborador/sócio) · 2ª foto · **Recorrência** |
| **Malotes** | ✅ na main (lacre+valor+status, card-list) | — |
| **Permissões grade** | ✅ na branch | — |
| **Abertura de caixa** | PDV, turno | Transf. Entrada/N° Lacre · **Maq. Cartão/N° Série** |
| **Discriminação** | existe (básica) | colunas c/desconto · desconto item e geral (R$/%) · Vale Presente · puxar do cadastro de produto |
| **Cockpit** | revertido | refazer da tela real (sem déficit) |

---

```
OBJETIVO: deixar o VISUAL de todas as telas conforme os desenhos do Rodrigo. Esta rodada é
VISUAL-FIRST: as regras/persistência dos campos novos vêm DEPOIS, num segundo trabalho.

LEIA PRIMEIRO: PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md — é a transcrição fiel dos 5
wireframes do dono da regra. Ele é a fonte de verdade dos campos, rótulos e agrupamentos.
Contexto de cor/tema: os tokens já estão na main (--cat-entradas #B7791F, --cat-transferencias
#C2410C, --cat-despesas #C0392B, --cat-mercadorias #15803D, --cat-retiradas #1D4ED8,
--cat-resultado #6D28D9), fonte Noto Sans, brand #6515dd.

REGRA DESTA RODADA — leia com atenção:
- Campos que o backend JÁ suporta: ligar normalmente (salvam de verdade).
- Campos NOVOS (sem backend): renderizar no layout correto, com estado local, e marcar cada um
  com o atributo data-pendente="regra" + um comentário // TODO(regras) no código. Eles NÃO devem
  fingir que salvam: ao submeter, ignore-os silenciosamente (não invente endpoint, não mande campo
  desconhecido para a API).
- NÃO alterar api/, db/, shared/ nesta rodada. Zero migration. Se algum campo exigir backend para
  sequer renderizar, PARE e me avise.
- Trabalhe a partir da branch feat/telas-fieis-mockup (que já tem os modais base) — não recomece
  do zero. Branch nova: feat/visual-telas-rodrigo. NÃO MERGEAR nada.

TELAS (um commit por tela, build verde entre elas):

1) TRANSFERÊNCIA / MALOTE (doc 14, FOTO 1)
   Bloco "Transf. Saída": Valor · N° Lacre/Doc (do setor) · Data Lanç (atalho Hoje) ·
   checkbox "Agendamento" que ABRE o campo "Data Agendamento" · "Data Recebimento" (somente
   leitura, com legenda "preenchido quando confirmado pelo destinatário") · Origem/Saída ·
   Destino/Entrada.
   Checkboxes ao lado do Destino: "Múltiplo Destino" · "Sempre confirmar" ·
   "Transf. Retorno/Sangria" (esta ABRE o bloco de baixo).
   Bloco "Transf. Entrada (Retorno/Sangria)": linhas repetíveis com sinal (+/−), Valor e
   N° Lacre/Doc — botão para adicionar linha.
   Rodapé "Resumo": Saída (−) · Entrada (+) · Saldo (+/−) — calculado no front a partir dos
   campos visíveis.
   Cor: --cat-transferencias. Valor herói no topo.

2) LANÇAMENTO (doc 14, FOTO 2) — um formulário para Despesa/Mercadoria/Retirada
   Linha 1: Valor · Juros · Valor Total (Valor+Juros, calculado, somente leitura).
   Linha 2: Data Lanç · Data Doc. Fiscal · N° Doc. Fiscal.
   Tipo de credor (radio/checkbox): Fornecedor (desp/merc/retir) · Colaborador (despesas) ·
   Sócios-setores (retiradas) → o campo "Credor" abaixo muda a fonte de busca conforme o tipo.
   Pagamento (toggle S/N) · Data pagamento · Data Vencimento.
   Duas fotos: "Foto (Recibo/Boleto/Nota)" e "Foto (Nota/interno)".
   Bloco "Recorrência" (colapsável): Número de repetições · dia (Sg..Sa) · Frequência
   (dia/semana/mês/quinzena/…).
   Cor por categoria (despesa vermelho, mercadoria verde, retirada azul) — o mesmo componente
   muda de cor conforme a categoria.

3) DISCRIMINAÇÃO (doc 14, FOTO 3)
   Tabela: Quant · Descrição · Grupo · V.Unit · V.Unit c/Desc · V.Total · V.Total c/Desc · %.
   Rodapé: V. Total geral · toggle "Vale Presente/Desconto" em R$ ou % · valor resultante.
   Recalcular no front (colunas c/desconto e o % efetivo por linha).
   Nota do desenho: em Mercadoria/Retirada os itens vêm do cadastro de produto; em Despesa os
   campos são livres — se o cadastro ainda não estiver acessível aqui, deixe o campo livre e
   marque data-pendente="regra".

4) ABERTURA DE CAIXA (doc 14, FOTO 5)
   Quatro campos: Ponto de Venda (ex. PDV CX1) · Turno (ex. Manhã/Tarde) ·
   Transf. Entrada/N° Lacre · Maq. Cartão/N° Série (ex. 0742742…). Layout enxuto, 2x2.

5) COCKPIT DO CAIXA — refazer a partir da TELA REAL (não do mockup)
   Lição do revert anterior: o mockup foi desenhado sem os dados reais. Parta da /caixa atual e
   aplique cor por categoria como ACENTO (barra/ícone/total), preservando tudo que funciona
   (status, ALTERAR HORARIO, AUTORIZACOES, fechamento, totais da API).
   SEM o card "Déficit a quitar" — a regra foi revogada (fundo simples, PROJECT_BRAIN/12).
   Antes de codar, descreva em 5 linhas como vai ficar e por que não repete o problema do revert.

FIM: lint + check + testes de front verdes. Push apenas da branch feat/visual-telas-rodrigo.
NÃO MERGEAR. Resumo final: o que ficou funcional, e a LISTA dos campos marcados
data-pendente="regra" (essa lista vira o backlog da rodada de regras).
```

---

## ⚠ Nota de risco (para o José, não para o agente)

Campos novos vão **aparecer na tela mas não salvar** — é o preço do "visual primeiro". Por isso o
prompt exige marcar cada um com `data-pendente="regra"` e devolver a lista no fim: essa lista vira
exatamente o backlog da rodada de regras.

**Recomendação:** manter esta branch **sem merge** até as regras entrarem, ou mergear só depois de
decidir como sinalizar ao usuário final que aquele campo ainda não persiste. Um operador que digita
"Juros" e não vê salvar perde confiança no sistema.
