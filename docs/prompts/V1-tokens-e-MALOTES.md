# Prompts prontos — V1 (visual do app inteiro) + Tela de Malotes

> Dois prompts flow-independentes, para rodar HOJE (nenhum depende de M2). Cole UM por vez no
> Claude Code (Opus, sessão nova, branch sem acento). Regra-mãe: **aditivo e reversível, NUNCA toca
> lógica/api/banco/permissões/cálculos/rotas/dados.** Ordem: rode o V1 primeiro (o Malotes usa os
> tokens dele).

---

## 1) V1 — tokens e tema (o app inteiro muda de cara)

```
Objetivo: dar ao app a cara de Mobills (Material, que é o mesmo idioma do nosso Vuetify), com as
cores de categoria da planilha. É SÓ tema/tokens — NENHUMA tela redesenhada nesta etapa. Regra-mãe:
aditivo e reversível, não toca lógica/rotas/dados.

Leia docs/research/mobills/DESIGN_TOKENS.md (tokens reais extraídos do Mobills) e
PROJECT_BRAIN/03_MODELO_DE_CORES.md (paleta traduzida da planilha). Depois:

1. web-vue/nuxt.config.ts (tema Vuetify): trocar os valores por estes neutros (manter a mecânica de
   tema por empresa):
   background/canvas #F4F6FA · surface #FFFFFF · primary/brand #6515DD · secondary #35128C ·
   success #16A34A · error #DC2626 · warning #B7791F · info #2196F3.
   Texto: ink rgba(0,0,0,.87) / ink-soft rgba(0,0,0,.54). Borda #E4E8EF.

2. web-vue/assets/main.css: ADICIONAR a camada de tokens de CATEGORIA que hoje NÃO existe (são
   FIXOS, semântica de negócio — não seguem o tema por empresa). Valores do doc 03:
   --cat-entradas-{base,soft,strong}      #B7791F / #FEF6E4 / #8F6115
   --cat-transferencias-{base,soft,strong} #C2410C / #FFF1E8 / #9A3412
   --cat-despesas-{base,soft,strong}       #C0392B / #FDECEA / #96261B
   --cat-mercadorias-{base,soft,strong}    #15803D / #E9F7EE / #106430
   --cat-retiradas-{base,soft,strong}      #1D4ED8 / #EAF0FE / #1739A8
   --cat-resultado-{base,soft,strong}      #6D28D9 / #F3EDFD / #54209F

3. Tipografia: trocar para Noto Sans (corpo). Títulos peso 500–600. (Roboto/system é fallback ok.)

4. Formato Material: botões/pills raio 25px; cards raio 12–16px; elevação via Vuetify 1–3 (não criar
   sombra custom). Não redesenhar telas — só os defaults do tema.

Verificação: npm run build verde; abrir 3 telas (login, caixa, um cadastro) e conferir por
screenshot que nada quebrou — só mudou a cara. Branch sem acento; lint+check+build; push + PR.
```

**Você vê:** o app inteiro com cores/fonte novas de uma vez, sem nenhuma tela reconstruída ainda.

---

## 2) Tela de Malotes — o lacre como identidade (usa o backend do M1, já pronto)

```
Objetivo: redesenhar a tela de Malotes para o alvo aprovado. Regra-mãe: aditivo, NÃO tocar
api/schema — o backend do M1 já tem malotes.valor e malotes.status. Só UI.

REGRA INEGOCIÁVEL (D3): o malote É o LACRE. NÃO existe "código do malote" nem campo "Malote (saco)".
Some com qualquer rótulo "código" e qualquer campo de saco da tela. Cada malote = lacre (identidade)
+ valor + status (disponivel|em_uso|devolvido).

Alvo visual: docs/mockups/malotes-tela-alvo.html (usar os tokens do V1). Entregas:
1. LISTA de malotes por LACRE: cada linha mostra o número do lacre em destaque (badge laranja
   --cat-transferencias), o valor, e o status (disponível verde / em uso laranja / devolvido cinza),
   + ação Editar. Sem coluna "código", sem "saco".
2. FORM "Novo malote": SÓ dois campos — "Número do lacre" (obrigatório, identidade única) e
   "Valor" (R$). Status nasce "disponível". NENHUM campo de código nem de saco. Remover o segundo
   botão "Editar" duplicado se ainda existir.
3. Reusar os componentes/estilos do V1 (cards, badges, pills 25px).

IMPORTANTE: se o modelo de dados atual (tabelas malotes + lacres_malotes, e a coluna codigo)
dificultar apresentar "malote = 1 lacre + 1 valor" de forma limpa, PARE e me proponha a
simplificação do modelo — não faça gambiarra na tela para contornar. Prefiro decidir o schema a
criar remendo.

Verificação: criar um malote (lacre + valor) e vê-lo na lista como disponível; editar; conferir que
não há nenhum campo "código"/"saco" em lugar nenhum. Testes de front. Branch sem acento; lint+check+
testes; push + PR.
```

**Você vê:** a tela de Malotes do jeito certo — lacre + valor + status, sem código, sem saco.

---

## Depois destes (não agora)

- **M2** (backend: suprimento/sangria/retorno + agrupamento) → destrava a **tela de Transferência**
  (V4). Abertura NÃO é criada à mão nessa tela — acontece ao selecionar o malote na abertura do caixa.
- **Cockpit** repintado com os tokens do V1.
- **Despesa/lançamentos** (V5) e a **grade de Permissões** (M3 + Fase 2).
