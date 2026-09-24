# Base inicial da Lume — revisão de FAQs do Caixa

Arquivos desta etapa:

- `lume-faq.html`: editor independente, sem API, banco ou dependência externa.
- `lume-faq-inicial.json`: conjunto inicial de perguntas levantadas a partir do código e do Project Brain.

## Como revisar

Abra `lume-faq.html` diretamente no navegador (`file:///.../docs/lume/lume-faq.html`). A base demonstrativa é carregada na primeira abertura. As edições ficam automaticamente no `localStorage` deste navegador; elas não alteram o sistema Pralis.

Use a busca e os filtros de categoria/status para revisar os registros. Cada registro possui ID, categoria, pergunta, variações, resposta curta, passo a passo, avisos, perfil autorizado, fonte e status. O status `a validar` significa que a documentação encontrada não foi suficiente para publicar aquela regra como orientação oficial.

## Importar e exportar

1. Edite uma pergunta ou use **Nova pergunta**.
2. Marque como `validado` somente depois de confirmar a regra com a fonte operacional responsável.
3. Clique em **Exportar JSON**. O editor valida campos obrigatórios, IDs duplicados, status e listas antes de gerar `lume-faq-revisado.json`.
4. Para continuar uma revisão, use **Importar JSON** com um arquivo exportado ou com `lume-faq-inicial.json`.

O navegador precisa permitir `localStorage` para o salvamento automático. O arquivo funciona offline.
Ele contém apenas uma prévia visual local do botão/modal da Lume (sem respostas, API, Gemini ou outra
IA); o chat definitivo continua fora do escopo até a revisão do JSON.
