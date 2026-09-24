---
tipo: especificacao_futura
modulo: Caixa
status: rascunho_pendente_revisao
atualizado_em: 2026-09-23
fonte: confirmacao de Marco no chat; mapa tecnico do Caixa no HEAD local
---

# Lume — assistente de ajuda do Caixa

## Limite desta nota

Esta é uma especificação futura. Não implementa chat, IA, endpoint, tabela, permissão, migration ou
integração Gemini. A primeira entrega é somente um catálogo revisável de perguntas e respostas em
`docs/lume/`.

## Experiência pretendida

- Botão discreto da Lume no rodapé do menu lateral, usando a logo oficial da Ciclos (não recriar a
  marca), com animação leve e o nome “Lume”.
- A bolinha pode ser fechada e reaberta pelo menu.
- Modal pequeno, responsivo e não bloqueante para o fluxo do Caixa.
- Aba **Ajuda** com perguntas rápidas, busca digitada e respostas oficiais do catálogo; sem geração
  por IA na primeira versão.
- Quando não houver resposta confiável, informar isso e registrar a pergunta para análise.
- Ações “Resolveu” e “Não resolveu”.
- Aba **Problema ou sugestão** com texto e anexo de print.
- Nome, empresa, PDV, data, hora, versão e tela atual devem ser preenchidos pela sessão quando
  possível.

## Administração futura

- Área administrativa para editar FAQs, revisar perguntas sem resposta e gerenciar problemas e
  sugestões.
- Ocorrências com estados `novo`, `em análise`, `resolvido` e `descartado`, histórico e auditoria.
- Respeitar permissões e separar TNP de Lisboa.

## Fonte e governança

- O catálogo inicial deve citar a fonte primária de cada resposta (código, schema, teste ou
  PROJECT_BRAIN).
- Sem confirmação suficiente, o item fica explicitamente **A VALIDAR**, com a dúvida operacional
  registrada; não transformar hipótese em regra.
- O mapa inicial foi levantado em 2026-09-23 a partir do HEAD local da branch
  `feat/caixa-anexos-fechamento` e dos documentos do Caixa/Segundo Cérebro.
- A aprovação do JSON e das regras operacionais continua com Marco e, quando financeira, Rodrigo.

## Fora do escopo desta etapa

Gemini ou outra IA, chat dentro do sistema, backend de FAQ, coleta de ocorrências em produção,
permissões novas, migrations, notificações e publicação.
