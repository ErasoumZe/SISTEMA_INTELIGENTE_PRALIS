# 2. Arquitetura resumida

```
 Candidato (link)        DP (sessão)                         Conplus / Questor
      │                      │                                       ▲
      ▼                      ▼                                       │ arquivo TXT/CSV (hoje)
 ┌──────────────────────────────────────┐                            │ API SYN (futuro)
 │ Frontend — Nuxt 4 + Vuetify          │                            │
 │ /admissao  ·  /departamento_pessoal  │                            │
 │ /conplus/* ·  /questor               │                            │
 └──────────────────┬───────────────────┘                            │
                    │ HTTPS / JSON                                   │
 ┌──────────────────▼───────────────────┐   ┌──────────────────────┐ │
 │ API — Fastify                        │──▶│ Google Sheets/Drive  │ │
 │ controller → service → repository    │   │ (planilhas do DP)    │ │
 │ default-deny + permissão por rota    │   └──────────────────────┘ │
 │ Zod em toda entrada                  │                            │
 └──────────────────┬───────────────────┘                            │
                    │ Drizzle ORM                                    │
 ┌──────────────────▼───────────────────┐                            │
 │ PostgreSQL 16 — migrations versionadas│──── geradores Questor ─────┘
 └──────────────────────────────────────┘     (pacote compartilhado)
```

## Camadas

| Camada                   | Pasta                             | Papel                                                                                                                                                      |
| ------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contratos compartilhados | `shared/src`                      | Tipos e validações (Zod) usados pela API e pela tela. **Layout oficial, de-para e geradores Questor ficam aqui**, como funções puras e testáveis sem banco |
| API                      | `api/src`                         | Rotas Fastify. Regra de arquitetura verificada em CI: controller não acessa banco; repository não chama service; SQL cru proibido                          |
| Banco                    | `db/src/schema`, `db/migrations`  | Schema Drizzle e migrations versionadas; isolamento por `empresa_id` com CHECKs e FKs compostas                                                            |
| Frontend                 | `web-vue`                         | Telas do candidato e do DP                                                                                                                                 |
| Testes                   | `tests/unit`, `tests/integration` | Unitários puros e integração HTTP contra PostgreSQL efêmero (Testcontainers)                                                                               |

## Segurança

- Sessão obrigatória por padrão (default-deny); rotas públicas são uma lista fechada e testada.
- Permissão específica por operação (ex.: `conplus_questor_configurar`, `admissoes_processos_ver_ficha`).
- Empresa sempre derivada da sessão — nenhum corpo, query ou URL aceita `empresaId`.
- Segredos só em variáveis de ambiente; nada versionado.
- Sincronização Google desligada por padrão (`CONPLUS_GOOGLE_SYNC_ENABLED`), habilitada só após
  homologação.

## Google Sheets / Drive

Usados pelo DP como espelho operacional (planilhas de admissão e das quatro páginas de folha) e para
guardar documentos. A integração tem prévia somente leitura antes de qualquer escrita. **A Conplus
não depende do Google**: o envio ao Questor parte do backend Pralís, nunca da planilha.
