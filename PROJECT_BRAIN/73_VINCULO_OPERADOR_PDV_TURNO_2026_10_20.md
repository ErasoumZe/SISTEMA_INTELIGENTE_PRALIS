# 73 — Vínculo obrigatório de operador, PDV e turno

**Data:** 20/10/2026
**Status:** integrado na `main` pela [PR #198](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/pull/198), commit `42f795a`. Deploy, aplicação da migration e cadastro operacional dos oito operadores continuam atos separados.
**Branch de origem:** `feat/caixa-vinculo-pdv-turno-20261020`

## Decisão operacional

Uma conta de operador de Caixa representa um único posto de operação em um único turno.

- `PDV 1 - Manhã` abre somente o PDV 1 no turno Manhã.
- `PDV 1 - Tarde` abre somente o PDV 1 no turno Tarde.
- A mesma regra será usada nos quatro PDVs.
- Gerência e Tesouraria são usuários globais: não recebem vínculo de Caixa e, por isso, não abrem Caixa como operador.

O PDV e o turno não podem ser escolhidos pelo operador durante a abertura. A interface pode exibir a configuração, mas a API é a autoridade: chamadas diretas fora do vínculo são recusadas.

A tela de abertura lê o vínculo no status do Caixa, preenche os dois campos e os deixa bloqueados. Sem vínculo, ela explica o bloqueio antes do operador preencher o malote.

## Implementação

O cadastro de usuário novo permite informar `PDV vinculado ao Caixa` e `Turno vinculado ao Caixa` juntos. Ambos são opcionais para usuários globais, porém um sem o outro é inválido.

O banco recebe `colaboradores.pdv_padrao_id`, com FK para `pdvs` e índice por empresa/PDV. A coluna é anulável para preservar colaboradores e históricos existentes; nenhuma atualização de dado histórico foi executada.

Na abertura e na prévia de malote:

1. o colaborador autenticado precisa ter PDV e turno configurados;
2. o PDV solicitado precisa ser o PDV configurado;
3. se a requisição enviar turno, ele precisa ser o turno configurado;
4. o fechamento gravado usa exclusivamente o turno configurado, nunca o valor vindo do navegador.

## Migration autorizada

```sql
ALTER TABLE colaboradores
  ADD COLUMN pdv_padrao_id uuid
  REFERENCES pdvs(id)
  ON DELETE SET NULL;

CREATE INDEX colaboradores_empresa_pdv_padrao_idx
  ON colaboradores (empresa_id, pdv_padrao_id);
```

A migration gerada é `db/migrations/0061_true_reptil.sql`. Ela ainda não foi aplicada em produção: merge, deploy e migration são atos separados.

## Testes previstos

- usuário global sem vínculo continua cadastrável;
- PDV sem turno e turno sem PDV são bloqueados no front e na API;
- abertura sem turno informado usa o turno vinculado;
- abertura e consulta de malote em outro PDV são recusadas;
- a fixture de integração cria PDV, turno e vínculo por caso, sem atalho da regra de produção.

## Pendência explícita

Após merge e antes de operação real, cadastrar os oito operadores: quatro PDVs × Manhã/Tarde. A configuração de cada usuário precisa ser revisada pela operação antes da primeira abertura.
