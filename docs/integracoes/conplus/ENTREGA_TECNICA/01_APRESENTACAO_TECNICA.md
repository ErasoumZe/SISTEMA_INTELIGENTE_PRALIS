# 1. Apresentação técnica

## O que é

O **Sistema Inteligente Pralís** é o ERP de uma rede de padarias (Cicluz/Pralís, empresa TNP), em uso
diário. Entre seus módulos estão caixa, compras, estoque e **Departamento Pessoal** — admissão de
colaboradores, cadastro e acompanhamento das informações de folha.

## Objetivo da integração com a Conplus

| Sentido                  | O que trafega                                                           | Situação                                                                                   |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pralís → Questor         | Admissão (TXT A/B/C/D) e eventos variáveis (CSV)                        | Geração e validação implementadas; liberação depende da Conplus                            |
| Questor/Conplus → Pralís | Relatórios de Folha (dia 05), Adiantamento (dia 20), Rescisões e Férias | Rescisões e Férias implementadas por arquivo; Folha e Adiantamento aguardam layout oficial |

O objetivo final é a troca pela **API oficial (SYN)**. Enquanto ela não está liberada, os mesmos
dados são produzidos/lidos em arquivo, no layout oficial, para homologação.

## Princípios que o código segue

- **Nenhum código, layout ou equivalência é inventado.** Campo sem origem confirmada fica vazio e
  aparece como pendência; o arquivo não é liberado enquanto houver pendência.
- **Isolamento por empresa**: toda consulta e gravação usa a empresa da sessão do usuário.
- **Nada é enviado automaticamente à Conplus.** Exportação e envio exigem ato explícito do DP e
  configuração de homologação.
- **Dados pessoais sensíveis** (saúde) só serão coletados após base legal e aviso de privacidade
  aprovados.

## Tecnologias

TypeScript em todo o monorepo · API Fastify + Drizzle ORM · PostgreSQL 16 · frontend Nuxt 4 + Vuetify
· validação compartilhada com Zod · testes Vitest + Testcontainers (PostgreSQL efêmero) · implantação
via Docker/Coolify.
