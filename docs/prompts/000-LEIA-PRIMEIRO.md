# 000 · LEIA PRIMEIRO — índice dos prompts

> Atualizado 28/07. **Só existem 2 prompts vivos.** Os demais estão EXECUTADOS ou SUBSTITUÍDOS e
> ficam apenas como histórico — não rode nenhum deles.

## ✅ VIVOS (é isto que se roda)

> **Plano de recomeço (28/07).** Só existe UMA frente aberta: a consolidação. Nenhuma feature nova
> entra até ela fechar. Regras permanentes em `PROJECT_BRAIN/16_DEFINITION_OF_DONE.md`.

| Ordem | Arquivo | O que é | Estado |
|---|---|---|---|
| **1º** | **`CONSOLIDACAO-01-limpeza.md`** | Unifica a abertura de caixa, mata os duplicados, quebra o componente de 999 linhas | se ainda não rodou, rodar antes |
| **2º** | **`SPRINT-LANCAMENTOS-2026-07-29.md`** | S1–S8: Lançamentos completos (menu, core, discriminação, contas c/ fundo, recorrência, entradas, seeding, QA). Spec: `PROJECT_BRAIN/17` | ⬅ **VIVO — rodar na ordem** |
| 3º | (merge) | José testa local → decide deploy | depois do sprint |
| — | `TUDO-PRA-RODAR.md` | **HISTÓRICO** — superado: 0-B foi absorvido no S4; A/B/C/D serão replanejados pós-sprint | não rodar |

## 🗄 HISTÓRICO — executado ou substituído (NÃO rodar)

| Arquivo | Por quê |
|---|---|
| `M1_malote-deficit.md` | ✅ executado e mergeado — **e a regra foi revogada** (fundo simples, brain/12) |
| `FIX_fuso_toISOString.md` | ✅ executado e mergeado; dado histórico verificado limpo |
| `M2.1-deficit-suprimento-sangria.md` | ⛔ **obsoleto** — tratava da dívida do malote, que não existe mais |
| `PROMPTS-EXECUCAO-COMPLETO.md` | parcialmente executado; substituído por `TUDO-PRA-RODAR` |
| `V1-tokens-e-MALOTES.md` | tokens ✅ mergeados; a parte de **tela de Malotes é obsoleta** (menu oculto, brain/15) |
| `TODAS-AS-TELAS-AGORA.md` | substituído por `VISUAL-COMPLETO-TELAS-RODRIGO` |
| `VISUAL-COMPLETO-TELAS-RODRIGO.md` | ✅ executado (as 5 telas foram construídas) |
| `POS-AUDITORIA-2026-07-24.md` | parcialmente executado |
| `BACKEND-E-SHELL-MOBILLS.md` | substituído por `TUDO-PRA-RODAR` |
| `ADENDO-TRABALHO-PERDIDO.md` | incorporado ao `TUDO-PRA-RODAR` |

---

# 🔒 REGRA DE PROCESSO (para não virar Frankenstein de novo)

Estabelecida em 28/07 depois de acumularmos 12 prompts com apenas 2 vivos.

**Antes de escrever QUALQUER prompt novo, obrigatoriamente:**

1. **Ler o estado real do código** — `git log --oneline -15`, o schema, e as telas envolvidas.
   Nunca escrever prompt a partir de memória da conversa.
2. **Ler este índice + o `PROJECT_BRAIN/00_INDICE.md`** — conferir se a decisão já foi tomada e
   se já existe prompt para aquilo.
3. **Atualizar o prompt vivo em vez de criar arquivo novo.** Arquivo novo só quando for um
   trabalho genuinamente novo — e então este índice é atualizado no mesmo movimento.
4. **Marcar como histórico** o que foi executado, no mesmo dia em que executou.

**Regras de execução (para o Claude Code):**
- Commitar sempre, mesmo WIP (foi assim que perdemos `lacres` e `contas_usuarios` em 24/07).
- Um trabalho por branch; nada de duas frentes na mesma árvore.
- Migration ou fórmula de dinheiro → PARA e mostra antes de aplicar.

**Onde as decisões de negócio vivem:** `PROJECT_BRAIN/` (não nos prompts). Prompt é instrução
descartável; decisão é permanente. Se uma decisão só existe num prompt, ela vai se perder.
