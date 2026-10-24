# Rascunho — e-mail para a equipe de Informática da Conplus

**Status:** rascunho para revisão. **Não enviado.** Não anexar nada sem autorização.

---

**Assunto:** Pralís × Questor — dúvidas sobre o layout de Eventos Variáveis e a API (ref. arquivos de 22/10/2026)

Olá, equipe de Informática da Conplus,

Obrigado pelos arquivos enviados em 22/10/2026 (`EventoVariavel.nli`, manual de importação, exemplo
`Eventos 510 - teste ficticio` e catálogos de eventos da TNP, Lisboa e Burpiz). Já adequamos o Pralís a
esse layout: o arquivo gerado reproduz o exemplo de vocês byte a byte (13 colunas, `;` no fim de cada
linha, sem cabeçalho, quebra de linha CR+LF, vírgula decimal com 2 casas).

Para concluir a homologação, precisamos da confirmação de alguns pontos que os arquivos não definem:

1. **Código da empresa no Questor (coluna 2):** qual é o código de cada empresa — COMERCIAL TUDONUPAO
   LTDA (TNP), COMERCIAL LISBOA ALIMENTOS LTDA e BURPIZ LTDA? A filial (todas "1 - Matriz" nos
   catálogos) entra em algum lugar do arquivo?
2. **Sequência do catálogo × coluna 4:** a coluna "Sequência" dos catálogos (1, e 2 no evento 800 da
   Burpiz) tem relação com a coluna 4 do arquivo? Hoje tratamos a coluna 4 como o número da linha por
   contrato e período, conforme o manual ("número que ainda não exista para esse contrato e período")
   e a chave do layout (empresa + período + sequência + contrato).
3. **Faixa de sequências:** existe uma faixa reservada para importações externas, para não colidir com
   lançamentos feitos diretamente no Questor? Hoje o usuário informa a sequência inicial (o exemplo usa 99).
4. **Coluna não utilizada:** em eventos por valor (V), a coluna 7 deve ir com `0,00` (como fazemos,
   seguindo o exemplo) ou vazia? E a coluna 8 em eventos por horas/dias (H/R)?
5. **Horas:** 7 horas e 30 minutos devem ir como `7,50` ou `7,30`? Isso depende da configuração
   "Utiliza Hora Centesimal" de cada empresa?
6. **Descontos:** eventos de natureza "Desconto" devem ir com valor positivo (como fazemos hoje) ou negativo?
7. **Formato:** aspas (o NLI declara `Delimitador = '"'`) são aceitas, obrigatórias ou devem ser evitadas?
   A quebra de linha CR+LF é obrigatória? Hoje geramos sem aspas e com CR+LF, como no exemplo.
8. **Contrato (coluna 5):** qual o tamanho máximo do código do contrato para eventos variáveis? O NLI
   permite 10 dígitos; no layout de admissão (CODIGOFUNCCONTR) são 7. É o mesmo código?

Sobre a **API** prevista a partir de 28/10/2026, pedimos, quando disponível:

- documentação técnica (endpoints, formatos de envio e retorno, códigos de erro);
- método de autenticação e como obter credenciais de homologação;
- ambiente de homologação (endereço e regras de uso);
- política de idempotência, limites de requisição e reprocessamento.

Também gostaríamos de combinar uma **validação conjunta**: podemos gerar arquivos de teste com dados
fictícios (marcados como técnicos, para não importar em empresa real) e importá-los com vocês num
ambiente de teste. Qual o procedimento recomendado para essa importação de teste?

Quando enviarmos o pacote técnico atualizado, pedimos a gentileza de confirmar o recebimento.

Atenciosamente,

[nome] — [cargo]
Pralís / TNP
[telefone] · [e-mail]
