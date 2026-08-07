# Template de ordem de serviço e relatório

## Cabeçalho da OS

```text
ID:
Título:
Dono:
Prioridade:
Branch:
Base origin/main:
Dependências satisfeitas:
Arquivos/áreas permitidos:
Fora do escopo:
Critérios de aceite:
Condições de parada:
Gates finais:
```

## Regras que todo prompt deve conter

```text
- Ler AGENTS.md e somente referências necessárias.
- Confirmar estado real antes de criar código.
- Branch nova a partir de origin/main; nunca checkout/edição da main local.
- Cache/TEMP/TMP somente no D:.
- Proteger Conteudo Ze/ e PROJECT_BRAIN.zip.
- Agentes paralelos somente-leitura; Claude principal único escritor.
- Nenhuma suíte concorrente; encerrar agentes antes dos gates.
- Teste específico durante edição; suíte completa uma vez no fechamento.
- Sem merge; push e PR somente quando autorizados.
- Migration, fórmula de dinheiro, histórico ou regra ausente: parar com evidência.
```

## Relatório obrigatório

```text
Estado inicial e base:
Causa raiz:
Prova RED/GREEN ou caracterização:
Mudanças por arquivo:
Caminho antigo removido:
Revisões dos agentes:
Testes e exit codes reais:
Riscos fora do escopo:
Commits e HEAD remoto:
Link da PR:
Confirmação: sem merge, main local intacta, untracked protegidos:
```

## Critério de liberação

Uma OS só muda para concluída quando código final, testes locais relevantes, CI, revisão e escopo
estão verdes. “Teste terminou mas wrapper deu 1”, “erro preexistente” ou “CI ainda rodando” nunca
viram aprovação automática; a ressalva precisa ser examinada antes do merge.
