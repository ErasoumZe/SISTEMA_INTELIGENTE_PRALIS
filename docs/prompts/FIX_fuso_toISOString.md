# Varredura de fuso — `toISOString().slice(0,10)` restantes (22/07)

> Origem: o usuário viu vendas rotuladas "23/07" na tela de Integrações às 21:49 BRT (= 00:49 UTC
> do dia 23). Investigação read-only encontrou 13 usos de `toISOString().slice(0,10)`. Classificados
> abaixo. A `data_referencia` das VENDAS está correta (usa `diaNegocio` em São Paulo) — o problema
> está em outros caminhos que a correção de fuso anterior não cobriu.
>
> **Regra de ouro:** `toISOString().slice(0,10)` só é correto sobre uma **string de data ancorada em
> `T00:00:00Z`** (aritmética de dias). É BUG quando aplicado a um **instante real** (venda, abertura,
> "agora") para obter o **dia contábil** — aí tem que ser `diaNegocio()` (`shared/src/datas`), que
> formata em `America/Sao_Paulo`.

## Categoria A — CORRETO, não mexer (aritmética de data-string ancorada em UTC)

| Arquivo | Função | Por que está certo |
|---|---|---|
| `shared/src/datas/index.ts` | `somarDias` | opera sobre `\`${dia}T00:00:00Z\``, soma dias, fatia. Data neutra de fuso. |
| `integracoes-scripts/src/creare-repository.js` | `enumerarDias` | idem — enumera dias entre duas strings YYYY-MM-DD. |
| `integracoes-scripts/src/creare-repository.js` | `subtrairDias` | idem. |
| `integracoes-scripts/src/reprocessar.js` | `ehDataValida` | valida formato YYYY-MM-DD por round-trip em meia-noite UTC. |

Estes ancoram em `T00:00:00Z` de propósito — fatiar em UTC é exatamente o certo. **Deixar como está.**

## Categoria B — BUG DE DADO REAL (instante → dia contábil GRAVADO, em UTC) · PRIORIDADE ALTA

> Aqui um instante real vira **dado persistido** no dia errado. Manifesta para eventos entre
> **21:00 e 23:59 BRT** (quando o UTC já virou o dia seguinte). Janela estreita, mas é dado gravado
> errado, não rótulo de tela.

| Arquivo | Local | O que grava errado | Correção |
|---|---|---|---|
| `api/src/caixa/caixa.repository.ts` | insert de abertura (`dataMovimento: input.dataHoraAbertura.toISOString().slice(0,10)`) — **3 ocorrências** (abrir, e dois caminhos de reabertura/edição) | **`data_movimento`** = data contábil do caixa. Caixa aberto após 21h BRT vai para o dia seguinte no histórico. | `diaNegocio(input.dataHoraAbertura)` |
| `api/src/caixa/caixa.service.ts` | edição de abertura (`dataReferencia: dataHoraAbertura.toISOString().slice(0,10)`) | re-deriva a data de referência ao alterar horário — em UTC. | `diaNegocio(dataHoraAbertura)` |
| `api/src/caixa/caixa.service.ts` | acerto de saldo (`data: new Date().toISOString().slice(0,10)`) | o lançamento de ajuste/débito do acerto recebe a data contábil em UTC. Acerto após 21h BRT → ajuste no dia errado. | `diaNegocio(new Date())` |

**Atenção — pode haver dado histórico já errado.** Antes/depois do fix, rodar um diagnóstico:
caixas cujo `data_movimento` ≠ `diaNegocio(data_hora_abertura)` (ou seja, abertos na janela 21–24h).
Se houver, é uma correção pontual por `UPDATE` (como já fizemos com as 24 vendas do bug anterior) —
**mostrar a query e a contagem antes de qualquer UPDATE.**

## Categoria C — BUG COSMÉTICO (instante → dia EXIBIDO, em UTC) · PRIORIDADE MÉDIA

| Arquivo | Local | Efeito | Correção |
|---|---|---|---|
| `api/src/integracoes/integracoes.repository.ts` | `listarHistoricoIntegracaoRepository` (`const dia = linha.criadoEm.toISOString().slice(0,10)`) | **É o "23/07" que você viu.** Agrupa os ciclos de ingestão pelo dia de `criadoEm` em UTC; após 21h BRT cai no dia seguinte. Não altera dado — só o rótulo do agrupamento. | `diaNegocio(linha.criadoEm)` |

## Categoria D — MENOR / BORDA (instante "hoje" em UTC, baixo impacto) · PRIORIDADE BAIXA

| Arquivo | Local | Efeito | Correção |
|---|---|---|---|
| `api/src/colaboradores/colaboradores.service.ts` | `dataInicio: new Date().toISOString().slice(0,10)` (cargo do colaborador) | cadastro após 21h BRT → `dataInicio` no dia seguinte. RH, baixo risco. | `diaNegocio(new Date())` |
| `api/src/usuarios/usuarios.service.ts` | `dataInicio` (2 ocorrências, vínculo de cargo) | idem. | `diaNegocio(new Date())` |
| `api/src/integracoes/integracoes.service.ts` | `diaAnteriorIso` (alerta "sem vendas") | alerta interno best-effort pode checar o dia errado perto da virada de UTC. | derivar o "hoje" com `diaNegocio` antes de subtrair |

## Prompt pronto para o Claude Code (rodar DEPOIS do M1 mergear)

```
Corrija os usos de toISOString().slice(0,10) que derivam DIA CONTÁBIL de um INSTANTE em UTC —
substituindo por diaNegocio() de shared/src/datas (America/Sao_Paulo). NÃO tocar nos usos corretos
(aritmética de data-string ancorada em T00:00:00Z): somarDias, enumerarDias, subtrairDias,
ehDataValida — esses ficam.

Corrigir (ver docs/prompts/FIX_fuso_toISOString.md):
1. ALTA — api/src/caixa/caixa.repository.ts: os 3 dataMovimento (abertura/edição) → diaNegocio(dataHoraAbertura).
2. ALTA — api/src/caixa/caixa.service.ts: dataReferencia na edição de abertura → diaNegocio(dataHoraAbertura);
   e o data: do acerto de saldo → diaNegocio(new Date()).
3. MÉDIA — api/src/integracoes/integracoes.repository.ts: o agrupamento do histórico por criadoEm
   → diaNegocio(linha.criadoEm).
4. BAIXA — colaboradores.service e usuarios.service (dataInicio) e integracoes.service (diaAnteriorIso)
   → derivar o dia em America/Sao_Paulo.

Antes de qualquer correção de DADO histórico: rode um SELECT que conte fechamentos_caixa onde
data_movimento <> diaNegocio(data_hora_abertura) e me mostre a contagem + amostra. PARE e mostre
antes de qualquer UPDATE.

Testes: cobrir um instante às 22:00 BRT (01:00Z do dia seguinte) e verificar que o dia contábil
resultante é o dia LOCAL, não o UTC — para caixa (data_movimento), histórico de integração e acerto.
Branch sem acento; lint+check+test; push + PR.
```

## Resumo executivo

- O que você viu (23/07) é **cosmético** — rótulo de agrupamento do histórico em UTC. Venda certa.
- Mas a varredura achou **bug de dado real no módulo de caixa** (`data_movimento` e a data do acerto
  derivados em UTC) — mesma classe, pior consequência, janela 21–24h BRT.
- 4 usos são **corretos** e não devem ser tocados (aritmética de data-string).
- Correção é `diaNegocio()` em cada ponto (uma linha), + um diagnóstico de dado histórico do caixa
  antes de qualquer UPDATE. Tudo num PR pequeno, depois do M1.
