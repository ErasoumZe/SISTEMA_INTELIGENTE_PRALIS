# Gemini para discriminação de notas fiscais

1. Abra o arquivo `.env.local` na raiz do projeto.
2. Preencha apenas `GEMINI_API_KEY=` com a chave criada no Google AI Studio.
3. Mantenha a chave somente nesse arquivo. Ele é ignorado pelo Git e nunca deve usar o prefixo
   `NUXT_PUBLIC_`.
4. Reinicie somente a API para carregar a chave. O front em `http://localhost:5174` pode continuar
   aberto.
5. Em **Despesa** ou **Mercadoria**, abra **Discriminar itens > Discriminar com IA**, tire uma foto
   ou escolha a imagem da galeria, revise a prévia, clique em **Aplicar sugestões** e só então use o
   botão **Salvar** já existente.

Sem chave, sem internet, com imagem ruim ou resposta incompleta, o preenchimento manual e o anexo
selecionado são preservados. A análise não cria nem confirma lançamentos.
