# 13 — Telas desenhadas à mão pelo Rodrigo (tarefa 7 da auditoria)

> Objetivo: ler os wireframes do Rodrigo embutidos no Xmind V2 e transformá-los em specs.
> **Resultado: bloqueado por resolução.** Detalhe abaixo + o que consegui extrair.

## 1. O bloqueio (fato técnico, não desculpa)

O PDF do Xmind V2 tem **uma única imagem achatada** (5271×8770). Dentro dela, cada foto do
Rodrigo ocupa **~230×170 pixels** — resolução de miniatura. Extraí a imagem nativa com `pdfimages`
(sem perda) e apliquei autocontraste + unsharp + upscale 8×.

**Conclusão: a letra é irrecuperável.** Não é limitação de ferramenta — a informação não está nos
pixels. Uma folha inteira em 230px de largura dá ~2 pixels por traço de letra. Ampliar não cria
informação.

Renders salvos para conferência: `docs/xmind-v2/foto_nativa_zoom.png` e `foto_realce.png`.

## 2. O que a ESTRUTURA revela (isso deu pra ler)

Mesmo sem ler as palavras, o layout do wireframe é legível e informativo:

- **Título sublinhado** no topo (uma palavra + complemento).
- **Uma tabela de ~6 colunas × 3 linhas de valores**, com as colunas separadas por **chaves/linhas
  onduladas verticais** — o mesmo padrão do rascunho de Transferência que ele já mandou (onde as
  chaves agrupavam "1ª/2ª/3ª transferência" e os lacres).
- Os 3 primeiros campos parecem ser **descritivos** (algo, "lançamento", "grupo"); as ~4 colunas
  seguintes são **numéricas** (valores em duas casas).
- **Setas curvas** saindo da coluna da esquerda e descendo para uma **estrutura de caixas
  empilhadas** no centro-baixo — padrão de "isto alimenta aquele total".
- Canto inferior direito: **caixas com valores** (parece um bloco de totalização).
- Canto inferior esquerdo: **"Obs:"** com duas anotações.

**Leitura de engenharia:** é o mesmo idioma visual do rascunho de Transferência — tabela com
agrupamento por chaves + bloco de totais no rodapé + observações. Coerente com a aba da planilha.
Mas **não dá para especificar campos** a partir disso.

## 3. O que eu preciso para destravar

**As fotos originais** que o Rodrigo tirou (do celular dele), enviadas direto no chat — não o
Xmind. O Xmind comprimiu para miniatura ao embutir.

São ~6 fotos (uma ou duas por categoria): Transferências, Despesas/Custos, Mercadorias/CMV,
Retiradas/Investimentos. No mapa aparecem rotuladas **"Passo a passo:"** / **"O passo a passo:"**.

Alternativa aceitável: o Rodrigo reexportar o Xmind com imagens em resolução original, ou mandar
o arquivo `.xmind` (que guarda os anexos originais dentro).

## 4. Achado extra (este SIM legível): nós novos no V2

Durante a varredura apareceu um nó que não estava catalogado no doc 10:

- **`Resultados – Diferença fechamento`** (`TELA/LANÇAMENTO/RESUMO/EXPANSÃO`, e em outro setor
  `TELA/RESUMO/EXPANSÃO`) — irmão de `Resultados – Relatórios`.

Isso é relevante: é a **materialização da R9** (lançar/fechar com diferença → responsabilizar e
notificar) como **tela própria** no menu, não apenas um modal. Some com a ideia de "só um aviso";
o Rodrigo quer uma tela onde as diferenças de fechamento vivem, com lançamento e expansão.

Também confirmado como legível: `Resultados – Relatórios` traz `Lista dos produtos mais vendidos
(Setor/Grupo Mercadoria/Horário/Produto/Atendente)` — o relatório por atendente que depende do
vendedor na integração (Fase A, já mergeada).

## 5. Status da tarefa 7

| Item                                     | Estado                                        |
| ---------------------------------------- | --------------------------------------------- |
| Extrair fotos do Xmind em alta resolução | ✅ feito — **impossível ler** (miniatura)     |
| Transformar em specs                     | ⛔ **bloqueado** — aguardando fotos originais |
| Estrutura geral dos wireframes           | ✅ documentada (§2)                           |
| Nós novos descobertos na varredura       | ✅ `Resultados – Diferença fechamento` (§4)   |
