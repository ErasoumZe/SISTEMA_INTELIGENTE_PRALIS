# Prompt — Responsividade das 5 telas novas

> Auditoria de 27/07 na branch `feat/visual-telas-rodrigo` (5 commits: transferência, lançamento,
> discriminação, abertura, cockpit). **Achado: ZERO media queries nas telas novas**, enquanto o
> projeto já tem um padrão responsivo maduro em `web-vue/assets/main.css`.

## Diagnóstico (fatos do código)

| Componente | Media queries | v-col com breakpoint | Layout | Veredito |
|---|---|---|---|---|
| `OperacaoLancamentoModal.vue` (935 linhas) | **0** | **0** | 14 grid/flex CSS puro | ⚠ maior risco — é o form mais denso (Valor/Juros/Total, 3 datas, credor, 2 fotos, recorrência) |
| `OperacaoTransferenciaModal.vue` (468) | **0** | **0** | 11 grid/flex · `max-width="470"` fixo | ⚠ largura fixa no dialog |
| `PermissoesGrade.vue` (168) | **0** | **0** | `grid-template-columns: 120px repeat(9, 1fr)` | 🔴 **10 colunas fixas** — impossível em telas pequenas |
| `MalotesList.vue` (204) | **0** | **0** | 3 flex | ⚠ card-list com valor/status à direita |
| `CaixaResumoPage.vue` (+310) | **0** | 10 (usa `v-row/v-col`) | 4 grid/flex | 🟡 melhor dos cinco (herda grid do Vuetify), mas sem ajuste fino |

**Padrão que o projeto já usa** (`main.css`) e que as telas novas devem seguir:
`1260px · 1024px · 768px · 720px · 560px · 400px · 390px` (sintaxe `@media (width <= Npx)`).
Referência de regras: `design-system/PROJECT_BRAIN/65_RESPONSIVE_UI_STANDARD.md`.

---

```
Corrija a RESPONSIVIDADE das 5 telas novas da branch feat/visual-telas-rodrigo. Elas foram
construídas sem nenhuma media query e quebram em telas menores. Esta rodada é SÓ layout/CSS.

REGRAS:
- NÃO mudar campos, rótulos, regras, lógica, api, db nem schema. Nada de novo comportamento.
- NÃO remover nem renomear campos: a fidelidade aos desenhos do Rodrigo
  (PROJECT_BRAIN/14_TELAS_RODRIGO_TRANSCRICAO.md) tem que ser preservada em TODAS as larguras —
  em telas pequenas os campos EMPILHAM, nunca somem.
- Seguir o padrão responsivo que o projeto JÁ tem em web-vue/assets/main.css
  (breakpoints: 1260 / 1024 / 768 / 720 / 560 / 400 / 390, sintaxe `@media (width <= Npx)`),
  e as regras de design-system/PROJECT_BRAIN/65_RESPONSIVE_UI_STANDARD.md. Não inventar
  breakpoints novos.
- Preferir CSS fluido (minmax, 1fr, clamp) a media query quando resolver igual.
- Nada de scroll horizontal em nenhuma tela, em nenhuma largura.
- Alvos de teste: 1440 (desktop) · 1024 (tablet) · 768 · 390 (celular).

POR COMPONENTE:

1) PermissoesGrade.vue — PRIORIDADE MÁXIMA
   Hoje: grid-template-columns: 120px repeat(9, 1fr) — 10 colunas fixas, inviável em <900px.
   Alvo: em telas largas, manter a grade telas × 9 ações.
   Em telas médias/pequenas, trocar de estratégia (escolha a melhor e me explique):
     (a) scroll horizontal APENAS na grade, com a coluna "Tela" fixa (sticky à esquerda); ou
     (b) virar cards: um card por tela, com as 9 ações em grid 3x3 dentro.
   Os cabeçalhos abreviados (Lanç/Pagar/Discr/Ver/Ver$/Edit/Edit$/Excl/Excl$) devem continuar
   legíveis — se precisar, tooltip com o nome completo.

2) OperacaoLancamentoModal.vue — o form mais denso
   As linhas de 3 campos (Valor|Juros|Valor Total e Data Lanç|Data Doc.Fiscal|N° Doc.Fiscal)
   devem virar 2 colunas em tablet e 1 coluna no celular.
   O bloco Recorrência (Número|dia|Frequência) empilha no celular.
   As duas fotos ficam lado a lado no desktop e empilham no celular.
   O modal deve ocupar quase a tela inteira no celular (fullscreen em <=560px) com o rodapé de
   ações fixo e acessível — o usuário não pode ficar sem alcançar "Salvar".

3) OperacaoTransferenciaModal.vue
   Trocar o max-width="470" fixo por largura responsiva (fullscreen em <=560px).
   Origem→Destino: lado a lado no desktop, empilhado no celular (a seta vira vertical ou some).
   As linhas repetíveis do bloco "Transf. Entrada" (sinal/valor/lacre) empilham no celular.
   O bloco Resumo (Saída/Entrada/Saldo) fica sempre visível e legível.

4) MalotesList.vue
   Card-list: no celular, o valor e o status vão para baixo do lacre (não espremer à direita).
   Área de toque dos botões >= 44px.

5) CaixaResumoPage.vue (cockpit)
   Já usa v-row/v-col — ajustar os breakpoints das colunas para que os cards de total não fiquem
   estreitos demais em tablet, e as seções por categoria empilhem no celular mantendo a barra de
   cor e o total visíveis.

VERIFICAÇÃO (obrigatória antes de terminar):
- Rodar a aplicação e conferir cada uma das 5 telas em 1440, 1024, 768 e 390.
- Nenhum scroll horizontal; nenhum texto cortado; nenhum campo inacessível.
- Se alguma tela não couber sem sacrificar campo, PARE e me proponha a alternativa (ex.: seção
  colapsável) em vez de esconder informação por conta própria.
- lint + check + testes de front verdes.

Branch: continue em feat/visual-telas-rodrigo (não criar branch nova). Um commit:
"fix(ui): responsividade das telas novas (1440/1024/768/390)". NÃO MERGEAR.
Resumo final: o que mudou por tela e a estratégia escolhida para a grade de permissões.
```

---

## Por que a grade de permissões é o caso mais grave

`120px + 9 colunas` não cabe em 390px de largura — cada ação teria ~30px. É a única das cinco que
**não tem solução por empilhamento simples**: ou vira scroll horizontal com coluna fixa, ou muda de
paradigma (cards). Por isso o prompt pede que o agente **escolha e justifique**, em vez de chutar.
