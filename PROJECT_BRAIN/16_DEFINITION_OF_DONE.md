# 16 — Definition of Done (contrato de qualidade)

> Estabelecido em 28/07 após o relatório de recomeço. **Vale para toda entrega, sem exceção.**
> Esta é a regra que faltava e que produziu o Frankenstein (duas aberturas de caixa, dois logouts,
> quatro caminhos para o mesmo ato).

## A regra-mãe

> **Nada é "pronto" enquanto o caminho antigo ainda existir.**

Criar o novo sem matar o velho não é entregar — é empilhar. Nove rodadas empilhando produziram um
sistema com dois de tudo.

## Checklist obrigatório (uma entrega só fecha com os 5)

1. **O caminho antigo foi REMOVIDO** — não desativado, não escondido, não comentado. Removido.
2. **Zero duplicidade** — não existe segunda rota, segundo botão, segundo modal para o mesmo ato.
3. **Responsivo** em 1440 / 1024 / 768 / 390, sem scroll horizontal.
4. **`lint` + `check` + testes verdes.**
5. **Diff revisado** (por mim) antes do merge.

## R2 · Entrega vertical e completa

Acabou o "visual primeiro, regras depois". Isso gerou campos que aparecem e não salvam — e um
operador que digita "Juros" e não vê salvar para de confiar no sistema inteiro.

**Cada entrega inclui:** tela + backend + teste + remoção do antigo. Se não couber, o escopo está
grande demais — quebra em duas entregas completas, não em duas metades.

## R3 · Pedido pequeno = entrega imediata

Ajuste de minutos **não entra em prompt grande**. Sai na hora, commit próprio. (O "Sair" duplicado
ficou 2 dias preso dentro de um redesenho de shell que nem começou.)

## R4 · Commit sempre, mesmo WIP

Trabalho não commitado é trabalho perdido — já aconteceu em 24/07 (`lacres`, `contas_usuarios`,
Tesouraria sumiram na troca de branch).

## R5 · Tamanho máximo de componente

Se um componente passa de **~400 linhas**, ele está fazendo coisa demais. Quebrar antes de crescer.
(`OperacaoLancamentoModal` chegou a 999 linhas; `AppWorkspace` a 1886.)

## Onde as decisões vivem

**Decisão de negócio → `PROJECT_BRAIN/`.** Prompt é instrução descartável; se a decisão só existe
num prompt, ela se perde quando o prompt morre. Foi assim que a tela de malote voltou depois de já
ter sido descartada.
