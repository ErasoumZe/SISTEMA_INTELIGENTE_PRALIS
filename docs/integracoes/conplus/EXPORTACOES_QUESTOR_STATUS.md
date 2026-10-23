# Exportações Questor — estado técnico

Atualizado em 23/10/2026 (Tarefa 14: eventos variáveis no layout oficial da Conplus). Detalhe de rotas e regras: `ENTREGA_TECNICA/05` (TXT),
`ENTREGA_TECNICA/06` (CSV) e `ENTREGA_TECNICA/10` (migrations).

## Implementado e testado

- Geradores puros do TXT de admissão (A/B/C/D) e do CSV de eventos variáveis no pacote compartilhado,
  validados sem chamadas à Conplus, Google ou banco.
- **TXT de admissão**: prévia, TXT técnico (`TECNICO-NAO-IMPORTAR-…`, auditoria `previa`) e TXT oficial
  (gates de homologação + arquivo sem pendência; tentativa recusada fica na auditoria como `bloqueado`).
- **Eventos variáveis no layout OFICIAL** (`EventoVariavel.nli`, 22/10/2026): uma linha por evento, 13
  colunas — empresa, período de cálculo, sequência por contrato, contrato, evento, referência (H/R) ou
  valor (V). Catálogo por empresa importado do arquivo oficial da Conplus; arquivo técnico e oficial;
  chave do Questor única entre arquivos oficiais. Detalhe em `EVENTOS_VARIAVEIS_LAYOUT_OFICIAL.md`.
- **Auditoria e histórico**: SHA-256, idempotência por conteúdo, motivo obrigatório para reexportar o
  que já saiu em arquivo oficial, arquivo no storage endereçado pelo SHA e novo download conferido
  contra a auditoria.
- Tudo limitado à empresa da sessão; permissões `conplus_exportar_admissoes` e
  `conplus_exportar_eventos` (DP).
- Tela `/conplus/exportar` (Departamento Pessoal → Exportações Questor), validada no navegador em
  1440, 1024, 768 e 390 px.

## Migration

`0068_questor_exportacoes` está no journal com snapshot (o snapshot foi gerado fora do repositório,
contornando o `ENOMEM` do ambiente, e o SQL original foi mantido). A cadeia 0000→0069 sobe em banco
vazio pelo comando oficial do deploy. A homologação (5544) recebeu 0064–0069 em 22/10/2026, depois de
backup e ensaio (registro em `HOMOLOGACAO_MIGRATIONS_0064_0069.md`).

## Continua bloqueado (depende da Conplus)

- TXT oficial: respostas e tabelas do `ENTREGA_TECNICA/07` (sem elas o arquivo sempre tem pendências).
- Arquivo oficial de eventos: código de cada empresa no Questor e as respostas listadas em
  `EVENTOS_VARIAVEIS_LAYOUT_OFICIAL.md` §9. A migration 0070 ainda não foi aplicada na homologação.
- Os gates `CONPLUS_QUESTOR_EXPORT_ENABLED` e `CONPLUS_QUESTOR_EXPORT_HOMOLOGADA` só são ligados depois
  dessa confirmação.
