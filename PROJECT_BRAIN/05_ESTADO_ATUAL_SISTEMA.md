# 05 — Estado atual do sistema (verificado no código, 22/07/2026)

## 1. Arquitetura

Monorepo npm workspaces:

| Workspace             | Stack                                                    | Papel                                              |
| --------------------- | -------------------------------------------------------- | -------------------------------------------------- |
| `api`                 | Fastify 5 + Drizzle + Postgres                           | controller → service → repository                  |
| `web-vue`             | Nuxt 4 + Vuetify (SPA)                                   | interface                                          |
| `db`                  | Drizzle schema + migrations `0000–0010+`                 | **58 tabelas**                                     |
| `shared`              | Zod contracts, regras puras, catálogo de 199+ permissões | contrato entre api e web                           |
| `integracoes-scripts` | agente Node                                              | roda no PC da loja, lê CREARE (MySQL), envia à API |
| `tests`               | Vitest + Testcontainers                                  | integração                                         |
| `design-system`       | 🗄️ arquivado em 05/08                                     | regras migradas para `67` §13                      |

CI (GitHub Actions): job `qualidade` (lint, typecheck, arch-linter, text-linter, unit, front,
build) + job `integracao` (Testcontainers). Deploy em **Coolify** (migrate → api → web-vue).

Módulos da API: `areas, auth, banco, caixa, clientes, colaboradores, contas, despesas, empresas,
formas-pagamento, fornecedores, grupos, integracoes, lancamentos, malotes, mercadorias,
notas-fiscais, pdvs, pedidos, permissoes, produtos, retiradas, setores, tema, transferencias,
turnos, unidades-medida, usuarios, vendas`.

## 2. O que já funciona em produção

- **Caixa completo:** abrir/fechar por PDV + usuário + turno; alteração de horário por token do
  gerente; revinculação retroativa de vendas; acerto de saldo com débito do colaborador;
  histórico com auditoria e filtros.
- **Lançamentos:** entradas, despesas, mercadorias, retiradas, transferências, malotes, pedidos
  (manual e automático por estoque mín/máx), com discriminação de itens e foto do documento.
- **NF-e:** importação via webhook Make → revisão/aprovação → vira mercadoria (validado com 52 notas).
- **Relatórios:** vendas (totais, filtro por turno e colaborador, hora da venda) e produtos mais vendidos.
- **Integração CREARE:** ingestão idempotente por `hash_conteudo`, cursor incremental, retry/fila,
  reprocesso manual (`npm run reprocessar --dia/--ids/--de/--ate`), conciliação diária automática
  por valor **e** contagem, com alerta por e-mail listando IDs divergentes.
- **Permissões:** catálogo por tela (v/c/e/x + discriminar/aprovar), resolução em 3 camadas
  (setor → cargos → usuário), `usuario_admin` com short-circuit, "restaurar padrão do cargo",
  bootstrap com match normalizado.

## 3. Bugs de dados já resolvidos (não regredir)

Sete correções da saga de reconciliação de vendas — todas em produção:

1. **Subtotal × líquido** — agregados somavam `valorOriginal`; passou a
   `valorOriginal − valorDesconto + valorAcrescimo`.
2. **Fuso na data de referência** — `toISOString().slice(0,10)` jogava venda pós-21h para o dia
   seguinte; passou a derivar em `America/Sao_Paulo`. 24 vendas corrigidas por SQL.
3. **Config `SYNC_FUSO_OFFSET`** — estava `-03:00` contra o próprio comentário; zerada.
4. **Venda multi-forma** — total filtrado contava o valor cheio por forma; passou a somar a parcela.
5. **429 virando 500** — erros do `@fastify/rate-limit` eram convertidos pelo handler global;
   agora 429 permanece 429 com `Retry-After`, e o agente respeita (~4 req/s).
6. **Perda silenciosa** — cursor incremental perdia vendas atrasadas; cada ciclo reprocessa o dia
   corrente inteiro + o dia anterior uma vez por dia.
7. **Desconto negativo** — CREARE grava valores negativos; Zod exigia `>= 0` e rejeitava.
   Normalizado em `payload.js`.

Mês 01–21/07 reprocessado: 21.679 vendas processadas, 14.423 criadas.

## 4. Schema — o que existe e o que falta para a planilha

### `transferencias` (hoje)

```
id, empresaId, caixaId → fechamentosCaixa, dataReferencia, descricao, observacao,
valorOriginal, valorAcrescimo, descricaoAcrescimo, valorDesconto, descricaoDesconto,
contaOrigemId (notNull), contaDestinoId (notNull), maloteId, lacreMaloteId,
computar, status (aprovado|aguardando_aprovacao|cancelado), criadoPor, criadoEm, atualizadoEm
check: contaOrigemId <> contaDestinoId
```

Falta, comparando com `02` §4:

- `tipo` do movimento (`abertura | suprimento | sangria | retorno`)
- `dataTransferencia` separada de `dataReferencia`/`criadoEm`
- `vencimento`
- `contabil` (natureza do comprovante)
- agrupamento por caixa+dia (ordinal 1ª/2ª/3ª/4ª)
- `conferido` / `diferencaLancamento` / `ocorrencias`
- lacre no sentido de **ida** (hoje há um único `lacreMaloteId`)

### `malotes` / `lacres_malotes` (hoje)

```
malotes:        id, empresaId, codigo (notNull), descricao   [unique empresaId+codigo]
lacres_malotes: id, maloteId (FK cascade), numero (notNull),
                status (disponivel|usado|cancelado)           [unique empresaId+lower(numero)]
```

Boa notícia: **o lacre já é único por empresa**. Problema: **não se conecta ao caixa** — abrir
caixa não consome lacre nem define troco inicial; fechar não gera lacre novo.

### Demais lançamentos

`despesas`, `mercadorias`, `retiradas`, `entradas` têm `dataReferencia`, `valorOriginal`,
acréscimo/desconto, `dataPagamento`, `contaId`, `grupoId`, discriminação e comprovante.
Faltam, versus planilha: **`juros` separado**, **`contabil`**, **`V (efetuado)`**,
**`CONF (conferido)`**, **`DIF. LANÇ`**, **`OCORRÊNCIAS`**.

## 5. Frontend — estado

`web-vue/pages` tem 37 telas. Placeholders vazios (casca sem conteúdo):
`promocoes, relatorio_dre, perdas_sobras, estoque_produtos, folha_ponto, avaliacao_qualidade,
avaliacao_colaboradores, relatorio_fiscal, fiscal_produtos, patrimonio, ficha_tecnica,
ingredientes, relatorio_faltas, relatorio_advertencias`.

Componentes em `web-vue/components/{app,cadastros,caixa,comum,financeiro,notas-fiscais,relatorios,workspace}`.

Tema atual (`nuxt.config.ts`): `background #f7f5f2 · surface #ffffff · primary #c0521d ·
secondary #b8480f · success #16a34a · warning #f59e0b · error #ef4444 · info #0284c7`.
Tokens `--pralis-*` em `web-vue/assets/main.css`. Fonte Montserrat.

**Não existe camada de cor por categoria** — é o que `03` introduz.

## 6. Bugs de UI abertos

- **Malotes com dois botões "Editar"** — `CadastroTable.vue` renderiza `acoesExtras` (linha ~200)
  e o botão embutido `v-if="podeEditar"` (linha ~212); há uma ação extra "Editar" duplicada
  configurada só para malotes.
- Tela de malotes pede código em vez de lacre.
- Cockpit do caixa ainda não agrupa por categoria nas cores do Xmind.

## 7. Backlog da visão-alvo (Xmind) — estado real

| #   | Item                                                     | Estado                                                       | Esforço    |
| --- | -------------------------------------------------------- | ------------------------------------------------------------ | ---------- |
| 4   | Vendedor nas vendas integradas                           | schema e relatório prontos; agente envia `null`              | BAIXO      |
| 1   | Cockpit DRE / lançamentos por caixa                      | tela `/caixa` agrega; falta visão DRE e agrupamento colorido | MÉDIO      |
| 2   | Permissões por 9 ações                                   | modelo atual 4–6 ações; faltam `*_pagar` e `*_dpago`         | MÉDIO-ALTO |
| 3   | Robô 2ª padaria + Firebird (HORA)                        | não existe; agente CREARE serve de molde                     | MÉDIO      |
| 5   | Estoque + contagens + perdas/sobras                      | só saldo no cadastro                                         | ALTO       |
| 6   | Conciliação cartões / extrato bancário                   | não existe                                                   | ALTO       |
| 7   | DP: iPonto / folha / ponto / assinatura                  | só jornadas e faltas                                         | ALTO       |
| 8   | Avaliações, ficha técnica, patrimônio, crediário, sócios | placeholders                                                 | VARIÁVEL   |

## 8. Dívidas e riscos a não esquecer

- Emissão de NF-e é do CREARE. Aposentá-lo vira projeto grande (provedor tipo Focus NFe).
- Dependência do **Make.com** para NF-e (caixa-preta paga) — descobrir o provedor por trás.
- **Segredos do legado em texto puro** (senhas de banco, token Make, service account Google) —
  rotacionar ao desligar o bot antigo.
- **Projeto em OneDrive/Desktop** — já corrompeu `.git` (config, HEAD, index, packed-refs).
  Mover para fora é higiene, não capricho.
- 5 vendas com desconto negativo (514603, 521002, 523234, 523316, 524493) aguardam reprocesso
  com o agente atualizado no PC da loja.

## 9. Relação com o brain anterior

`PROJECT_BRAIN - Copia` foi para `_ARQUIVO_MORTO/` em 05/08. O que valia está em
`23_PERMISSOES_MODELO_E_AUDITORIA.md` e `24_CADASTRO_DE_PRODUTOS.md`. Referência histórica:
`28–39` (auditoria profunda de permissões, matriz do caixa, validações), `41`/`61` (integração
com o repo oficial), `50–51` (protocolo de QA). Nada ali é descartado — este brain v2 trata de
**produto e modelo de negócio**, que era justamente o que faltava.
