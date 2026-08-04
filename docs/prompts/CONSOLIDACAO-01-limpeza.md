# CONSOLIDAÇÃO 01 — Limpeza (antes de qualquer feature nova)

> Plano de recomeço, aprovado em 28/07. Esta é a **primeira e única frente aberta**.
> Nenhuma feature nova entra até isto fechar. Regras: `PROJECT_BRAIN/16_DEFINITION_OF_DONE.md`.

## Mapa do problema (levantado no código, 28/07)

| Duplicidade | Onde está o NOVO (fica) | Onde está o VELHO (sai) |
|---|---|---|
| **Abertura de caixa** | `CaixaResumoPage.vue` — form inline com PDV, Turno, Transf.Entrada/N°Lacre, Maq.Cartão/N°Série (403 linhas) | `WorkspaceDialogs.vue` linha ~144 — modal antigo "Abrir caixa" com só PDV/Turno/Data |
| **Logout** | `AppShell.vue` linha ~315 — item no menu do perfil | `AppShell.vue` linhas ~211-217 — botão na sidebar |
| **Seletor de mês** | (não deve existir) | topbar do shell |
| **Menu Malotes** | (não deve existir — lacre é inline na Transferência) | `utils/domain.ts` ~linha 94 |

Componentes acima do limite (R5, ~400 linhas): `AppWorkspace.vue` (1886) ·
`WorkspaceDialogs.vue` (1268) · `OperacaoLancamentoModal.vue` (999).

---

```
RODADA DE CONSOLIDAÇÃO — limpeza antes de qualquer feature nova.
Leia PROJECT_BRAIN/16_DEFINITION_OF_DONE.md e siga à risca. A regra-mãe é:
"nada é pronto enquanto o caminho antigo ainda existir".

Contexto: a refatoração das últimas rodadas criou telas novas SEM remover as antigas. Hoje o
sistema tem DUAS aberturas de caixa, DOIS botões de logout e caminhos duplicados para o mesmo ato.
Esta rodada NÃO adiciona nada — ela REMOVE e UNIFICA.

Branch: continue em feat/backend-telas-rodrigo. Um commit por item. NÃO MERGEAR.

═══ ITEM 1 · Unificar a ABERTURA DE CAIXA (o mais importante) ═══
Existem dois caminhos hoje:
  (A) NOVO — form inline em web-vue/components/caixa/CaixaResumoPage.vue, com PDV, Turno,
      "Transf. Entrada / N° Lacre" e "Maq. Cartão / N° Série" (fiel ao desenho do Rodrigo,
      PROJECT_BRAIN/14 FOTO 5).
  (B) VELHO — modal "Abrir caixa" em web-vue/components/workspace/WorkspaceDialogs.vue (~linha 144),
      só com PDV/Turno/Data.
AÇÃO: manter (A), REMOVER (B) por completo — o modal, o estado que o controla, o handler, e
qualquer botão/rota que o abra (verifique AppWorkspace.vue, que orquestra). Depois da remoção,
DEVE existir exatamente UM caminho para abrir caixa em todo o sistema.
Verifique com busca: nenhum resultado residual de "Abrir caixa" fora do CaixaResumoPage.
Commit: "refactor(caixa): unifica a abertura de caixa em um unico fluxo (remove modal antigo)"

═══ ITEM 2 · Remover o "Sair" duplicado ═══
web-vue/components/app/AppShell.vue tem DOIS logouts:
  - linha ~315: item no menu do perfil do usuário → MANTER
  - linhas ~211-217: botão na sidebar → REMOVER
Manter o emit("logout") funcionando para o menu do perfil.
Commit: "fix(ui): remove o botao Sair duplicado da sidebar"

═══ ITEM 3 · Remover o seletor de mês e ocultar Malotes ═══
- Remover o seletor de mês/período da topbar (AppShell.vue / AppWorkspace.vue). Manter o seletor
  de EMPRESA e o menu do usuário.
- web-vue/utils/domain.ts (~linha 94): OCULTAR o item "malotes" do menu. Não existe tela de criar
  malote — o lacre é informado direto na Transferência (PROJECT_BRAIN/15, D-C).
  Apenas esconder do menu; não apagar rota nem backend nesta rodada.
Commit: "fix(ui): remove seletor de mes e oculta Malotes do menu"

═══ ITEM 4 · Quebrar o componente de 999 linhas ═══
web-vue/components/operacoes/OperacaoLancamentoModal.vue (999 linhas) faz coisa demais.
Extrair em subcomponentes coesos (ex.: bloco de valores/juros, bloco de datas, bloco de credor,
bloco de fotos, bloco de recorrência), mantendo o comportamento EXATAMENTE igual.
Meta: nenhum arquivo acima de ~400 linhas (R5). NÃO mudar campos nem regras — é refatoração pura.
Commit: "refactor(ui): quebra OperacaoLancamentoModal em subcomponentes"

═══ ITEM 5 · Varredura final de duplicidade ═══
Faça uma busca sistemática por caminhos duplicados para o mesmo ato (abrir caixa, fechar caixa,
lançar despesa, criar transferência, logout) e me REPORTE o que encontrar — não corrija por conta
própria além dos itens acima. Quero a lista antes de decidir.

═══ FECHAMENTO (Definition of Done) ═══
- Nenhum caminho antigo sobrando para os atos tratados.
- lint + check + testes verdes.
- Rodar a aplicação e conferir: abrir caixa (1 caminho só), logout (1 botão só), menu sem Malotes
  e sem seletor de mês.
- Me devolver: o que foi removido, o resultado da varredura do Item 5, e print/descrição das telas
  afetadas.
NÃO MERGEAR.
```

---

## Depois desta rodada (só depois)

1. Decidir o que fica da branch de +17 commits e mergear (com meu review do diff).
2. Retomar as entregas — mas **verticais e completas** (tela + backend + teste + remoção), uma por vez.
