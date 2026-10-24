# Auditoria oficial de compatibilidade Pralís × Conplus/Questor

Data: 22/10/2026 · Branch: `kaylane-branchdev` · Nada foi enviado à Conplus, commitado, publicado ou
gravado em banco.

## 1. Fontes usadas

| Fonte                                                                                                                       | Situação                                                                                                                           | Onde ficou                                                    |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Documentação web de admissão (`nfpaadmissaofuncionario`)                                                                    | **Obtida** (HTML bruto; 4 registros, 205 campos)                                                                                   | transcrita em `shared/src/conplus/questor-admissao-layout.ts` |
| Documentação web de Eventos Variáveis (CSV)                                                                                 | **Obtida**                                                                                                                         | regras em `shared/src/conplus/questor-eventos-variaveis.ts`   |
| Pasta WorkDrive "API Rodrigo"                                                                                               | Link não navegável sem navegador (API pública responde `F6016`). O conteúdo foi achado em `Downloads/API Rodrigo.zip` (15/10/2026) | `tests/fixtures/conplus-oficial/admissao/` (byte a byte)      |
| `A_FunContratoPre.nli`, `B_DadosObrigatoriosAdmissao.nli`, `C_DadosNaoObrigatoriosAdmissao.nli`, `D_DependenteRascunho.nli` | **Obtidos**                                                                                                                        | `…/admissao/layout/`                                          |
| `admissao_A.txt`, `_B`, `_C`, `_D`, `admissao_unificado.txt`                                                                | **Obtidos**                                                                                                                        | `…/admissao/exemplo/`                                         |
| **Modelo CSV de Eventos Variáveis anexado ao e-mail**                                                                       | **NÃO LOCALIZADO** (nem no zip, nem no repositório, nem em Downloads)                                                              | —                                                             |
| Layouts oficiais de Folha 05, Adiantamento 20, Rescisões e Férias                                                           | **NÃO RECEBIDOS** (o zip contém só admissão)                                                                                       | —                                                             |

`tests/fixtures/conplus-oficial/**` e `tests/fixtures/conplus-gerados/**` foram marcados `-text` no
`.gitattributes`: a regra global `eol=lf` converteria o CRLF dos originais e invalidaria a comparação.

## 2. Estado encontrado no Pralís (antes desta auditoria)

| Módulo                     | Sentido                               | O que existe                                                                  | Corresponde a layout oficial recebido?   |
| -------------------------- | ------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| Admissão                   | Pralís → Questor                      | Coleta de ficha/dependentes/internos. **Nenhum gerador de TXT.**              | Sim — layout A/B/C/D recebido            |
| Eventos Variáveis          | Pralís → Questor                      | **Nada.** Não há fonte de horas/valores por empregado nem catálogo de eventos | Documentação sim; modelo CSV não         |
| Rescisões                  | Conplus → Pralís (relatório recebido) | `parseRescisoesCalculadas` + rota de prévia/confirmação                       | **Não** — nenhum layout oficial recebido |
| Férias                     | Conplus → Pralís (relatório recebido) | `parsePeriodosAquisitivos` + rota                                             | **Não**                                  |
| Folha 05 / Adiantamento 20 | Conplus → Pralís (relatório recebido) | Leitura **bloqueada** no controller; colunas da tela vêm da planilha Google   | **Não**                                  |

Importante: os layouts recebidos são de **envio ao Questor**. Rescisões, Férias, Folha 05 e
Adiantamento 20 no Pralís são **relatórios recebidos** — não têm relação com os arquivos enviados e
continuam sem referência oficial.

Não existe configuração "Zen" no repositório (busca por `zen` sem resultado). A compatibilidade
com a configuração por empresa não é verificável sem esse material.

## 3. O que foi implementado (núcleo puro, sem I/O)

- `shared/src/conplus/questor-admissao-layout.ts` — **gerado** a partir da doc + NLI (um campo por
  linha; fora do Prettier para permitir conferência visual).
- `shared/src/conplus/questor-admissao.ts` — `montarLinhaQuestor`, `lerLinhaQuestor`,
  `validarRegistroQuestor`, `montarArquivoAdmissaoQuestor`.
- `shared/src/conplus/questor-eventos-variaveis.ts` — `montarCsvEventosVariaveis`,
  `lerCsvEventosVariaveis`, `formatarHorasEventoVariavel`.
- Testes: `tests/unit/conplus-questor-admissao.test.ts` (25), `tests/unit/conplus-questor-eventos-variaveis.test.ts` (7).
- Arquivos fictícios gerados: `tests/fixtures/conplus-gerados/admissao_ficticio_pralis.txt` e
  `eventos_variaveis_ficticio_pralis.csv` (CNPJ `11.222.333/0001-81`, CPF `123.456.789-09`, sem dado real).

**Não há tela, rota nem leitura do banco.** Pela DoD do projeto isto não é entrega vertical: é a
camada de contrato, verificada contra os originais. Ligar ao banco depende dos de-paras da seção 6.

Validações aplicadas (todas com base na documentação ou no NLI):

| Código               | Regra                                                                   | Fonte                                                |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| `ESTRUTURA`          | quantidade fixa de campos por registro; identificador sem aspas         | doc ("Formato do Registro")                          |
| `CAMPO_DESCONHECIDO` | campo fora do layout é recusado (não sai para a Conplus)                | AGENTS 4.7                                           |
| `CARACTERE_PROIBIDO` | `;`, CR ou LF dentro do valor                                           | NLI (`Delimitador = #0`: não há aspas para proteger) |
| `TAMANHO`            | menor entre tamanho da doc e do NLI                                     | doc + NLI                                            |
| `DATA`               | DD/MM/AAAA e data real                                                  | NLI `FormatoData`                                    |
| `TIPO`               | inteiro; número com `,` e casas ≤ `Precisao` do NLI                     | NLI `SeparadorDecimal`                               |
| `DOMINIO`            | listas fechadas da coluna "Observação" (65 campos)                      | doc                                                  |
| `FORMATO`            | máscaras de CNPJ, CPF (A), PIS e CEP                                    | doc                                                  |
| `OBRIGATORIO`        | campos "Requerido = Sim"                                                | doc                                                  |
| `CONDICIONAL`        | DESCRSAL se TIPOSALARIO ∈ {2,6}; CODIGOTIPOFATO só com CATEGESOCIAL 105 | doc                                                  |
| `BLOQUEADO`          | campos com coluna divergente entre doc e NLI                            | ver 4.2                                              |
| `VINCULO`            | B/C/D com o mesmo CNPJ do A; D com CPF e DATAADM do A                   | NLI (`itMaster` e `Indice`)                          |

## 4. Admissão — comparação com os originais

### 4.1 Estrutura do arquivo

| Requisito           | Oficial                                                   | Pralís (gerador)                       | Evidência                                          | Classificação                                                        |
| ------------------- | --------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Separador           | `;`                                                       | `;`                                    | NLI `Separador`, teste "cabeçalho do NLI"          | COMPATÍVEL                                                           |
| Identificador       | letra A/B/C/D sem aspas                                   | idem                                   | leitura recusa aspas                               | COMPATÍVEL                                                           |
| Campos por registro | A 21 · B 85 · C 67 · D 32                                 | 21 · 85 · 67 · 32                      | teste "quantidade fixa"                            | COMPATÍVEL com doc e exemplos (NLI: C 66 e D 31, ver 4.2)            |
| Ordem dos campos    | coluna da doc                                             | coluna da doc                          | round-trip byte a byte dos 4 exemplos              | COMPATÍVEL                                                           |
| Ordem dos registros | A, B, C, D… por contrato                                  | idem                                   | `itMaster` de B/C = A anterior; teste de ordenação | COMPATÍVEL                                                           |
| Fim de linha        | ASC 13 + ASC 10 em cada linha                             | CRLF em toda linha, inclusive a última | teste "termina toda linha em CRLF"                 | COMPATÍVEL com a doc. O exemplo oficial não tem CRLF na última linha |
| Data                | DD/MM/AAAA                                                | idem, com data real                    | teste `31/02/2025` recusado                        | COMPATÍVEL                                                           |
| Decimal             | `,`                                                       | `,`, sem milhar                        | teste `1.518,00` recusado                          | COMPATÍVEL                                                           |
| Codificação         | não definida na doc nem no NLI; exemplos em UTF-8 sem BOM | string; fixtures em UTF-8              | —                                                  | NÃO VERIFICÁVEL SEM CONFIRMAÇÃO                                      |
| Envio pela API SYN  | "JSON String" no POST                                     | não implementado                       | —                                                  | NÃO IMPLEMENTADO (depende da API)                                    |

### 4.2 Divergências nos próprios arquivos oficiais

Encontradas na comparação automática e travadas em teste. **Precisam de resposta da Conplus.**

1. **C — coluna 64 lida duas vezes no NLI**: `INDAPREND` e `ORGAOEMISSORRNE` com `Coluna = 64`.
   Na doc, `INDAPREND` é a coluna 67 (sem tipo/tamanho) e o exemplo tem 67 campos. → os dois campos
   ficaram **bloqueados** no gerador.
2. **D — `ENTREGACERT` com `Coluna = 4` no NLI**, a mesma da `DATAADM`. A doc diz coluna 32 e o
   exemplo tem 32 campos. → **bloqueado**.
3. Nomes diferentes doc × NLI: `APELIDOFUNCA`/`APELIDOFUNC`, `ENDERELETRE`/`ENDERELETR`. O gerador
   usa a posição, então não afeta o arquivo.
4. Tamanho `B.CODIGOMUNIC`: doc 12, NLI 8. O gerador aplica 8.
5. `B.PERCADTO`: doc diz "Inteiro"; o NLI tem `Precisao = 2`. O gerador aceita até 2 casas.
6. A doc do registro D diz "Fixar letra C" no identificador (erro de digitação; o NLI e o exemplo usam D).
7. **Exemplo D não cumpre a doc**: `SEXO = Masculino` e `GRAUINSTR = Educação Superior Completa`
   (texto no lugar de código), `FORMACONTROLEIR = 5` (só 1/2), sem `NOMEDEPEND`, `PARENTESCO`,
   `NACIONALIDADE`, `FUMANTE` e `CONSOMEALCOOL` (requeridos), e `10` na coluna 32 (campo de data).
8. **Exemplo unificado**: a `DATAADM` do D (17/01/2025) não é a do A (27/03/2025). Pelo índice do NLI,
   esse dependente não acharia o contrato.
9. Exemplo B: `PISFUNC` vazio (requerido), CEP sem máscara (`36037467`; a doc pede `99.999-999`) e
   `CODIGOMUNIC = 31` (código de UF, não de município — não dá para validar sem a tabela do Questor).
10. Exemplo A: `CATEGESOCIAL = 0`, que não é categoria da tabela 01 do eSocial.
11. CPF: o A usa máscara (doc), e o D vem "CPF-SEM CARACTERES". O gerador aceita os dois no D e
    compara só os dígitos no vínculo.

Diagnósticos dos exemplos oficiais, como o validador os devolve (teste "aponta onde o próprio
exemplo oficial não cumpre a documentação"):

| Registro | Diagnósticos                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | FORMATO:CODIGOEMPRESA, FORMATO:CPFFUNC (placeholders)                                                                                              |
| B        | FORMATO:CODIGOEMPRESA, OBRIGATORIO:PISFUNC, FORMATO:CEPFUNC, TAMANHO+TIPO:NUMEROENDER (`54(número)`), TAMANHO:SIGLAESTADO/NASC/CTPS (`MG(Estado)`) |
| C        | FORMATO:CODIGOEMPRESA                                                                                                                              |
| D        | 13 diagnósticos (item 7 acima) + BLOQUEADO:ENTREGACERT                                                                                             |

### 4.3 Comparação do arquivo gerado com o exemplo oficial

Teste "é válido e só difere do exemplo oficial nos placeholders substituídos": o arquivo fictício
foi montado a partir do exemplo oficial, trocando **somente** placeholders e campos inválidos. O teste
compara coluna a coluna e falha se qualquer outra coluna mudar.

| Registro | Colunas iguais ao oficial | Colunas trocadas                                                                                                                              |
| -------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| A        | 18 de 20                  | CODIGOEMPRESA, CPFFUNC                                                                                                                        |
| B        | 77 de 84                  | CODIGOEMPRESA, PISFUNC, CEPFUNC, NUMEROENDER, SIGLAESTADO, SIGLAESTADONASC, SIGLAESTADOCTPS                                                   |
| C        | 65 de 66                  | CODIGOEMPRESA                                                                                                                                 |
| D        | 19 de 31                  | CODIGOEMPRESA, CPFFUNC, DATAADM, NOMEDEPEND, PARENTESCO, SEXO, GRAUINSTR, FORMACONTROLEIR, NACIONALIDADE, FUMANTE, CONSOMEALCOOL, ENTREGACERT |

Resultado: **zero diagnósticos** e conteúdo idêntico ao versionado em
`tests/fixtures/conplus-gerados/admissao_ficticio_pralis.txt`:

```text
A;0;0;11.222.333/0001-81;3;123.456.789-09;Nome do Funcionário;05/05/2000;27/03/2025;0;01;1;15;15;;;0;56;5;1518;
B;11.222.333/0001-81;123.45678.90.1;;36.037-467;1;Rua;54;;Bairro;MG;31;MG;31;1;2;0;0;0;0;0;0;0;;1;9;10;;;;;0;0;0;MG;;0;;15;323;1;1;10;0;;;;;0;0;0;0;0;;0;0;1;1;;1;;;;;;;;;;0;0;2;1;2;;0;;;00;0;;Nome da Mãe;1;1;0
C;11.222.333/0001-81;7;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;1;1;18;;;;;;;;;;;;
D;11.222.333/0001-81;12345678909;27/03/2025;;Dependente Ficticio;05/05/2000;01;;1;2;9;;;;;;1;;;;;10;;;;;;20;0;0;
```

Validade no Questor: o arquivo passa em todas as regras escritas na doc e no NLI. **Isso não prova
que o Questor importa**: códigos como tipo de contrato `3`, sindicato `1`, cargo `56`, escala `2`,
estabelecimento `323` e município `31` são do exemplo e só existem (ou não) no Questor da empresa.

### 4.4 Cobertura dos dados do Pralís (85 campos requeridos)

| Registro  | Requeridos | Disponível no Pralís | Texto livre → precisa de-para | Não coletado |
| --------- | ---------- | -------------------- | ----------------------------- | ------------ |
| A         | 15         | 5                    | 1 (TERMOCONSENTIMENTO)        | 9            |
| B         | 56         | 10                   | 9                             | 37           |
| C         | 1          | 1                    | 0                             | 0            |
| D         | 13         | 5                    | 1 (PARENTESCO)                | 7            |
| **Total** | **85**     | **21**               | **11**                        | **53**       |

Conclusão: com o que o Pralís coleta hoje, **não é possível gerar um arquivo de admissão completo
para nenhum colaborador real**. A matriz campo a campo está no Anexo.

## 5. Eventos Variáveis

| Requisito                                                 | Documentação                                           | Pralís (gerador/leitor)                                          | Classificação                                                        |
| --------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | -------------------------------------------------------------------- |
| Linha 1: códigos a partir da coluna 3                     | sim                                                    | sim                                                              | COMPATÍVEL com a doc                                                 |
| Linha 2: letra H/V/R a partir da coluna 3                 | sim                                                    | sim; outra letra é recusada                                      | COMPATÍVEL com a doc                                                 |
| Linha 3: não importada                                    | sim                                                    | título livre; leitor ignora                                      | COMPATÍVEL com a doc                                                 |
| Linha 4+: col 1 = código do empregado; col 2 não avaliada | sim                                                    | sim; col 1 só dígitos                                            | COMPATÍVEL com a doc                                                 |
| Colunas 1–2 das linhas 1–3 recebem `#` do Questor         | sim                                                    | gerador deixa vazio; leitor aceita `#`                           | COMPATÍVEL com a doc                                                 |
| Separador `;`                                             | sim                                                    | sim                                                              | COMPATÍVEL com a doc                                                 |
| Coluna vazia aceita                                       | sim                                                    | sim (teste)                                                      | COMPATÍVEL com a doc                                                 |
| Unidade **H**                                             | conforme "Utiliza Hora Centesimal" da empresa (`1,50`) | `formatarHorasEventoVariavel`; recusa minuto ≥ 60 sem centesimal | COMPATÍVEL com a doc                                                 |
| Unidade **R** / **V**                                     | número                                                 | número com `,`, sem milhar                                       | COMPATÍVEL com a doc; formato exato **não verificável** sem o modelo |
| Códigos de evento por empresa                             | variam por empresa                                     | entram por parâmetro (`catalogo`); nada fixo no código           | COMPATÍVEL; **catálogo por empresa NÃO IMPLEMENTADO**                |
| Codificação e fim de linha                                | não informados                                         | CRLF; string sem BOM (leitor tolera BOM)                         | NÃO VERIFICÁVEL SEM ARQUIVO OFICIAL                                  |
| Cabeçalhos exatos do modelo CSV da Conplus                | modelo não recebido                                    | —                                                                | NÃO VERIFICÁVEL SEM ARQUIVO OFICIAL                                  |
| Reimportar duplica; erro aborta tudo                      | sim                                                    | gerador bloqueia empregado repetido (guarda do Pralís)           | COMPATÍVEL                                                           |
| Origem dos valores (horas extras, faltas, etc.)           | —                                                      | não existe no Pralís                                             | NÃO IMPLEMENTADO                                                     |
| Código do empregado no Questor                            | —                                                      | Pralís usa matrícula `TNP…`; sem de-para                         | NÃO IMPLEMENTADO                                                     |

## 6. O que falta para homologar

Decisões e dados (Marco/Rodrigo/Conplus):

1. Resposta da Conplus para os itens 1, 2, 7, 8 e 11 de 4.2 e para a codificação do TXT.
2. Tabelas do Questor **por empresa**: tipo de contrato, sindicato, cargo, escala, estabelecimento,
   organograma, tipo de logradouro, município (código), categoria eSocial e eventos variáveis com
   suas letras.
3. De-para de sexo, raça/cor, estado civil, nacionalidade e parentesco: hoje são texto livre no
   formulário e o layout pede código. Criar coluna ou enum é migration e mudança de regra →
   precisa de autorização.
4. Coleta dos 53 requeridos ausentes (salário, tipo de salário, experiência, deficiências, grau de
   instrução, FGTS, vínculo, RAIS/CAGED, sindicais, adiantamento, pagamento, jornada, primeiro
   emprego…). Parte é dado do contrato (DP), não do candidato. Também exige migration.
5. Saber se "Termo de Consentimento" equivale ao aviso de privacidade aceito.
6. O modelo CSV de Eventos Variáveis do e-mail de 07/10/2026.
7. Layouts oficiais dos relatórios de Folha 05, Adiantamento 20, Rescisões e Férias.

Depende da API futura (SYN): autenticação, endpoint, envio "JSON String", retorno e erros,
idempotência e reenvio, e o vínculo `CODIGOFUNCCONTR` devolvido pelo Questor (C.3 do exemplo = `7`).

## 7. Riscos encontrados fora do escopo corrigido

- `parseFolhaTabular` (`shared/src/conplus/parsers.ts`) **deduz** H/R/V a partir do texto da
  natureza e da presença de referência/valor, e grava o valor da célula em `referencia` (`valor` fica
  `null`). Isso mistura o H/R/V da **importação** com colunas de **relatório**. Não é usado por
  nenhuma rota (o controller bloqueia Folha/Adiantamento). Não foi alterado: não há layout oficial
  para provar o comportamento certo. **Não deve ser reaproveitado para Eventos Variáveis.**
- `tests/fixtures/conplus-manual/*` são arquivos de teste locais, não oficiais.

## 8. Comandos executados

```text
npx vitest run --project unit tests/unit/conplus-questor-*.test.ts   → 2 arquivos, 32 testes verdes
npx vitest run --project unit                                         → 53 arquivos, 481 testes verdes
npm run check --workspace @padaria/shared                             → sem erros
npm run check --workspace @padaria/tests                              → sem erros
npx eslint shared/src/conplus tests/unit/conplus-questor-*.test.ts    → sem erros
npm run check:texto && npm run check:arquitetura                      → OK
```

Não executados: `npm run check` completo (api/web-vue têm alterações em andamento de outra frente
na branch), testes de integração e build.

## Anexo — matriz campo a campo (admissão)

Legenda: **Gerador Pralís** = posição, tipo, tamanho e regra conferidos contra doc + NLI.
**Coluna NLI** em negrito = diverge da doc. "lookup" = `CODIGOEMPRESA`, resolvido pelo Questor
a partir do CNPJ (`itEventoPreDefinido INSCRFEDERAL`).

| Reg | Col | Campo                   | Tipo       | Tam. doc / NLI | Req. | Coluna NLI | Gerador Pralís              | Origem do dado no Pralís                                           | Dado             |
| --- | --- | ----------------------- | ---------- | -------------- | ---- | ---------- | --------------------------- | ------------------------------------------------------------------ | ---------------- |
| A   | 1   | Identificador           | texto      | 1              | Sim  | —          | COMPATÍVEL                  | constante `A`                                                      | —                |
| A   | 2   | TERMOCONSENTIMENTO      | inteiro    | 5 / 5          | Sim  | 2          | COMPATÍVEL                  | aviso de privacidade aceito? (equivalência não confirmada)         | de-para pendente |
| A   | 3   | GERARPRELIMINAR         | texto      | 1 / 1          | Sim  | 3          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 4   | CODIGOEMPRESA           | texto      | 18 / —         | Sim  | lookup     | COMPATÍVEL                  | empresas.cnpj (nulo permitido; aplicar máscara)                    | disponível       |
| A   | 5   | CODIGOTIPOCONTR         | inteiro    | 3 / 3          | Sim  | 5          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 6   | CPFFUNC                 | texto      | 14 / 14        | Sim  | 6          | COMPATÍVEL                  | processo.cpf (11 dígitos → máscara)                                | disponível       |
| A   | 7   | NOMEFUNC                | texto      | 70 / 70        | Sim  | 7          | COMPATÍVEL                  | processo.nomeCompleto (até 200; layout 70)                         | disponível       |
| A   | 8   | DATANASC                | data       | 10 / 10        | Sim  | 8          | COMPATÍVEL                  | ficha.nascimento (ISO → DD/MM/AAAA)                                | disponível       |
| A   | 9   | DATAADM                 | data       | 10 / 10        | Sim  | 9          | COMPATÍVEL                  | processo.dataAdmissao (ISO → DD/MM/AAAA)                           | disponível       |
| A   | 10  | CATEGESOCIAL            | inteiro    | 3 / 3          | Sim  | 10         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 11  | CATEGORIA               | texto      | 2 / 2          | Sim  | 11         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 12  | CODIGOSIND              | inteiro    | 5 / 5          | Sim  | 12         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 13  | DIACONTREXP             | inteiro    | 5 / 5          | Sim  | 13         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 14  | DIAPRORROGCONTREXP      | inteiro    | 4 / 4          | Sim  | 14         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 15  | DATACONTREXP1           | data       | 10 / 10        | Não  | 15         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 16  | DATACONTREXP2           | data       | 10 / 10        | Não  | 16         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 17  | CODIGOTIPOFATO          | inteiro    | 5 / 5          | Não  | 17         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 18  | CODIGOCARGO             | inteiro    | 7 / 7          | Não  | 18         | COMPATÍVEL                  | funcaoId = função operacional, não cargo Questor                   | de-para pendente |
| A   | 19  | TIPOSALARIO             | inteiro    | 5 / 5          | Sim  | 19         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 20  | VALORSAL                | numerico   | 16 / 16        | Sim  | 20         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| A   | 21  | DESCRSAL                | texto      | 999 / 999      | Não  | 21         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 1   | Identificador           | texto      | 1              | Sim  | —          | COMPATÍVEL                  | constante `B`                                                      | —                |
| B   | 2   | CODIGOEMPRESA           | texto      | 18 / —         | Sim  | lookup     | COMPATÍVEL                  | empresas.cnpj                                                      | disponível       |
| B   | 3   | PISFUNC                 | texto      | 14 / 14        | Sim  | 3          | COMPATÍVEL                  | internos.pisPasepNit (11 dígitos → máscara)                        | disponível       |
| B   | 4   | DATACADPIS              | data       | 10 / 10        | Não  | 4          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 5   | CEPFUNC                 | texto      | 10 / 10        | Sim  | 5          | COMPATÍVEL                  | ficha.cep (8 dígitos → máscara)                                    | disponível       |
| B   | 6   | CODIGOTIPOLOGRAD        | inteiro    | 21 / 21        | Sim  | 6          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 7   | ENDERFUNC               | texto      | 40 / 40        | Sim  | 7          | COMPATÍVEL                  | ficha.logradouro (até 240; layout 40)                              | disponível       |
| B   | 8   | NUMEROENDER             | inteiro    | 7 / 7          | Sim  | 8          | COMPATÍVEL                  | ficha.numero (texto 20; layout inteiro 7 — "S/N" não cabe)         | de-para pendente |
| B   | 9   | COMPLENDER              | texto      | 20 / 20        | Não  | 9          | COMPATÍVEL                  | ficha.complemento (até 120; layout 20)                             | disponível       |
| B   | 10  | BAIRROFUNC              | texto      | 30 / 30        | Sim  | 10         | COMPATÍVEL                  | ficha.bairro (até 120; layout 30)                                  | disponível       |
| B   | 11  | SIGLAESTADO             | texto      | 2 / 2          | Sim  | 11         | COMPATÍVEL                  | ficha.uf                                                           | disponível       |
| B   | 12  | CODIGOMUNIC             | inteiro    | 12 / 8         | Sim  | 12         | COMPATÍVEL                  | ficha.municipio é texto; layout pede código                        | de-para pendente |
| B   | 13  | SIGLAESTADONASC         | texto      | 2 / 2          | Sim  | 13         | COMPATÍVEL                  | ficha.naturalidade é texto livre                                   | de-para pendente |
| B   | 14  | CODIGOMUNICNASC         | inteiro    | 8 / 8          | Sim  | 14         | COMPATÍVEL                  | ficha.naturalidade é texto livre                                   | de-para pendente |
| B   | 15  | SEXO                    | inteiro    | 2 / 2          | Sim  | 15         | COMPATÍVEL                  | ficha.sexo é texto; layout pede 1/2                                | de-para pendente |
| B   | 16  | RACACOR                 | inteiro    | 5 / 5          | Sim  | 16         | COMPATÍVEL                  | ficha.racaCor é texto; layout pede código                          | de-para pendente |
| B   | 17  | DEFFISICA               | logico     | 1 / 1          | Sim  | 17         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 18  | DEFVISUAL               | logico     | 1 / 1          | Sim  | 18         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 19  | DEFAUDITIVA             | logico     | 1 / 1          | Sim  | 19         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 20  | DEFINTELECTUAL          | logico     | 1 / 1          | Sim  | 20         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 21  | DEFMENTAL               | logico     | 1 / 1          | Sim  | 21         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 22  | DEFCOTA                 | logico     | 1 / 1          | Sim  | 22         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 23  | DEFREABILITADO          | logico     | 1 / 1          | Sim  | 23         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 24  | DEFOBS                  | texto      | 255 / 255      | Não  | 24         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 25  | ESTADOCIVIL             | inteiro    | 2 / 2          | Sim  | 25         | COMPATÍVEL                  | ficha.estadoCivil é texto; layout pede código                      | de-para pendente |
| B   | 26  | GRAUINSTR               | inteiro    | 3 / 3          | Sim  | 26         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 27  | NACIONALIDADE           | inteiro    | 3 / 3          | Sim  | 27         | COMPATÍVEL                  | ficha.nacionalidade é texto; layout pede código                    | de-para pendente |
| B   | 28  | PAISORIGEM              | inteiro    | 5 / 5          | Não  | 28         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 29  | DATANATURAL             | data       | 10 / 10        | Não  | 29         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 30  | TMPRESID                | inteiro    | 5 / 5          | Não  | 30         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 31  | TIPOVISTO               | inteiro    | 2 / 2          | Não  | 31         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 32  | UTILIZACARTEIRADIGITAL  | logico     | 1 / 1          | Sim  | 32         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 33  | NUMEROCTPS              | texto      | 11 / 11        | Sim  | 33         | COMPATÍVEL                  | internos.ctpsNumero (até 120; layout 11)                           | disponível       |
| B   | 34  | SERIECTPS               | texto      | 5 / 5          | Sim  | 34         | COMPATÍVEL                  | internos.ctpsSerie (até 120; layout 5)                             | disponível       |
| B   | 35  | SIGLAESTADOCTPS         | texto      | 2 / 2          | Sim  | 35         | COMPATÍVEL                  | internos.ctpsUf                                                    | disponível       |
| B   | 36  | EXPEDCTPS               | data       | 10 / 10        | Não  | 36         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 37  | OPTANTEFGTS             | logico     | 1 / 1          | Sim  | 37         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 38  | DATAOPCAOFGTS           | data       | 10 / 10        | Não  | 38         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 39  | TIPOVINCULO             | texto      | 2 / 2          | Sim  | 39         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 40  | CODIGOESTAB             | inteiro    | 5 / 5          | Sim  | 40         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 41  | CLASSIFORGAN            | texto      | 20 / 20        | Sim  | 41         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 42  | TIPOADMRAIS             | inteiro    | 5 / 5          | Sim  | 42         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 43  | TIPOADMCAGED            | texto      | 2 / 2          | Sim  | 43         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 44  | RECEBSEGURODESEMPREGO   | logico     | 1 / 1          | Sim  | 44         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 45  | LIVROREG                | inteiro    | 5 / 5          | Não  | 45         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 46  | FOLHALIVROREG           | inteiro    | 5 / 5          | Não  | 46         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 47  | FICHAREG                | inteiro    | 10 / 10        | Não  | 47         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 48  | CODIGOLOCALCTB          | inteiro    | 5 / 5          | Não  | 48         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 49  | SINDICALIZADO           | logico     | 1 / 1          | Sim  | 49         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 50  | DESCMENSSIND            | logico     | 1 / 1          | Sim  | 50         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 51  | DESCCUSTCONFED          | logico     | 1 / 1          | Sim  | 51         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 52  | DESCTAXAASSIST          | logico     | 1 / 1          | Sim  | 52         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 53  | DESCONTAREVSAL          | logico     | 1 / 1          | Sim  | 53         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 54  | DESCCONTRIBSIND         | logico     | 1 / 1          | Não  | 54         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 55  | DESCANOADMISSAO         | logico     | 1 / 1          | Sim  | 55         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 56  | CLAUSULAASSEGRESC       | logico     | 1 / 1          | Sim  | 56         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 57  | RECEBEADTO              | inteiro    | 2 / 2          | Sim  | 57         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 58  | RECEBE13SAL             | logico     | 1 / 1          | Sim  | 58         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 59  | PERCADTO                | inteiro    | 8 / 8          | Não  | 59         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 60  | MODOPGTO                | inteiro    | 2 / 2          | Sim  | 60         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 61  | TIPOCONTA               | inteiro    | 2 / 2          | Não  | 61         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 62  | CODIGOBANCO             | inteiro    | 5 / 5          | Não  | 62         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 63  | NUMEROAGENCIA           | inteiro    | 6 / 6          | Não  | 63         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 64  | NUMEROCONTA             | texto      | 30 / 30        | Não  | 64         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 65  | DIGITOCONTA             | texto      | 2 / 2          | Não  | 65         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 66  | TIPOPIX                 | inteiro    | 5 / 5          | Não  | 66         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 67  | TIPOCHAVEPIX            | texto      | 2 / 2          | Não  | 67         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 68  | CHAVEPIX                | texto      | 99 / 99        | Não  | 68         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 69  | CHAVEPIXQRCODE          | texto      | 30 / 30        | Não  | 69         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 70  | PARTICPAT               | logico     | 1 / 1          | Sim  | 70         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 71  | POSSUIALVARA            | logico     | 1 / 1          | Sim  | 71         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 72  | CODIGOESCALA            | inteiro    | 6 / 6          | Sim  | 72         | COMPATÍVEL                  | turnoId = turno do catálogo, não escala Questor                    | de-para pendente |
| B   | 73  | REGIMEJOR               | inteiro    | 5 / 5          | Sim  | 73         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 74  | TIPOJORNADA             | inteiro    | 5 / 5          | Sim  | 74         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 75  | DESCRTIPOJORNADA        | texto      | 999 / 999      | Não  | 75         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 76  | TEMPOPARCIAL            | inteiro    | 5 / 5          | Sim  | 76         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 77  | PERCINSALUB             | inteiro    | 16 / 16        | Não  | 77         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 78  | PERCPERICUL             | inteiro    | 16 / 16        | Não  | 78         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 79  | AGENTENOCIVO            | texto      | 2 / 2          | Sim  | 79         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 80  | JAEXPOSTO               | logico     | 1 / 1          | Sim  | 80         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 81  | PAI                     | texto      | 70 / 70        | Não  | 81         | COMPATÍVEL                  | ficha.nomePai (até 240; layout 70)                                 | disponível       |
| B   | 82  | MAE                     | texto      | 70 / 70        | Sim  | 82         | COMPATÍVEL                  | ficha.nomeMae (até 240; layout 70)                                 | disponível       |
| B   | 83  | TIPOADM                 | inteiro    | 5 / 5          | Sim  | 83         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 84  | INDICATPRIMEMP          | logico     | 1 / 1          | Sim  | 84         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| B   | 85  | UTILIZAQCOLABORE        | logico     | 1 / 1          | Sim  | 85         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 1   | Identificador           | texto      | 1              | Sim  | —          | COMPATÍVEL                  | constante `C`                                                      | —                |
| C   | 2   | CODIGOEMPRESA           | texto      | 18 / —         | Sim  | lookup     | COMPATÍVEL                  | empresas.cnpj                                                      | disponível       |
| C   | 3   | CODIGOFUNCCONTR         | inteiro    | 7 / 7          | Não  | 3          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 4   | NOMESOCIAL              | texto      | 70 / 70        | Não  | 4          | COMPATÍVEL                  | ficha.nomeSocial                                                   | disponível       |
| C   | 5   | APELIDOFUNCA            | texto      | 30 / 30        | Não  | 5          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 6   | CODIGOPOSTAL            | texto      | 10 / 10        | Não  | 6          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 7   | DDDFONE                 | inteiro    | 5 / 5          | Não  | 7          | COMPATÍVEL                  | ficha.telefone (10–11 dígitos juntos; fixo x celular não separado) | de-para pendente |
| C   | 8   | NUMEROFONE              | inteiro    | 10 / 10        | Não  | 8          | COMPATÍVEL                  | ficha.telefone                                                     | de-para pendente |
| C   | 9   | RAMALFONE               | inteiro    | 5 / 5          | Não  | 9          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 10  | DDDCELULAR              | inteiro    | 5 / 5          | Não  | 10         | COMPATÍVEL                  | ficha.telefone                                                     | de-para pendente |
| C   | 11  | NUMEROCELULAR           | inteiro    | 11 / 11        | Não  | 11         | COMPATÍVEL                  | ficha.telefone                                                     | de-para pendente |
| C   | 12  | ENDERELETRE             | texto      | 100 / 100      | Não  | 12         | COMPATÍVEL                  | ficha.email (até 240; layout 100)                                  | disponível       |
| C   | 13  | DATACHEGADA             | data       | 10 / 10        | Não  | 13         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 14  | CASADOBR                | logico     | 1 / 1          | Não  | 14         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 15  | FILHOSBR                | logico     | 1 / 1          | Não  | 15         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 16  | CARTRNE                 | texto      | 20 / 20        | Não  | 16         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 17  | EXPEDICAORNE            | data       | 10 / 10        | Não  | 17         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 18  | CODIGOORGAOEMISSORRNE   | inteiro    | 21 / 21        | Não  | 18         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 19  | VALIDRNE                | data       | 10 / 10        | Não  | 19         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 20  | PORTNATNUMERO           | inteiro    | 10 / 10        | Não  | 20         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 21  | PORTNATDATA             | data       | 10 / 10        | Não  | 21         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 22  | NUMERORG                | texto      | 20 / 20        | Não  | 22         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 23  | COMPLRG                 | texto      | 20 / 20        | Não  | 23         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 24  | CODIGOORGAOEMISSORRG    | inteiro    | 21 / 21        | Não  | 24         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 25  | SIGLAESTADORG           | texto      | 2 / 2          | Não  | 25         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 26  | EMISSRG                 | data       | 10 / 10        | Não  | 26         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 27  | TITELEIT                | texto      | 13 / 13        | Não  | 27         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 28  | ZONATITELEIT            | inteiro    | 4 / 4          | Não  | 28         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 29  | SECAOTITELEIT           | inteiro    | 5 / 5          | Não  | 29         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 30  | CNHFUNC                 | texto      | 15 / 15        | Não  | 30         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 31  | CATEGCNH                | texto      | 3 / 3          | Não  | 31         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 32  | EXPEDICAOCNH            | data       | 10 / 10        | Não  | 32         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 33  | CODIGOORGAOEMISSORCNH   | inteiro    | 21 / 21        | Não  | 33         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 34  | VALIDCNH                | data       | 10 / 10        | Não  | 34         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 35  | UFCNH                   | texto      | 2 / 2          | Não  | 35         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 36  | PRIMHABCNH              | data       | 10 / 10        | Não  | 36         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 37  | CARTRESERV              | texto      | 20 / 20        | Não  | 37         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 38  | CATEGCARTRESERV         | texto      | 3 / 3          | Não  | 38         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 39  | CODIGOCONSELHO          | inteiro    | 4 / 4          | Não  | 39         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 40  | NUMEROREGIST            | texto      | 15 / 15        | Não  | 40         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 41  | DATAREGIST              | data       | 10 / 10        | Não  | 41         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 42  | VALIDADEREGIST          | data       | 10 / 10        | Não  | 42         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 43  | NUMEROCNS               | texto      | 18 / 18        | Não  | 43         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 44  | CERTCIVILTIPO           | texto      | 1 / 1          | Não  | 44         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 45  | CERTCIVILEMISSAO        | data       | 10 / 10        | Não  | 45         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 46  | CERTCIVILTERMO          | texto      | 40 / 40        | Não  | 46         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 47  | CERTCIVILLIVRO          | texto      | 15 / 15        | Não  | 47         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 48  | CERTCIVILFOLHA          | inteiro    | 10 / 10        | Não  | 48         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 49  | CERTCIVILCARTORIO       | texto      | 40 / 40        | Não  | 49         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 50  | CERTCIVILSIGLAESTADO    | texto      | 2 / 2          | Não  | 50         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 51  | CERTCIVILMUNIC          | inteiro    | 21 / 21        | Não  | 51         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 52  | DATAAPOSENT             | data       | 10 / 10        | Não  | 52         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 53  | NATUREZAESTAGIO         | texto      | 1 / 1          | Não  | 53         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 54  | NIVELESTAGIO            | inteiro    | 5 / 5          | Não  | 54         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 55  | AREAATUACAO             | texto      | 100 / 100      | Não  | 55         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 56  | INSTITUICAOENSINO       | inteiro    | 6 / 6          | Não  | 56         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 57  | AGENTEINTEGRACAO        | inteiro    | 6 / 6          | Não  | 57         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 58  | CODIGOSUPERVISORESTAGIO | inteiro    | 9 / 9          | Não  | 58         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 59  | MOTIVOCONTRAT           | inteiro    | 5 / 5          | Não  | 59         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 60  | JUSTCONTR               | texto      | 999 / 999      | Não  | 60         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 61  | TPINCLCONTR             | inteiro    | 5 / 5          | Não  | 61         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 62  | ORGEMISRG               | texto      | 10 / 10        | Não  | 62         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 63  | ORGAOEMISSORCNH         | texto      | 10 / 10        | Não  | 63         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 64  | ORGAOEMISSORRNE         | texto      | 10 / 10        | Não  | 64         | NÃO VERIFICÁVEL (doc × NLI) | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 65  | CNPJENTQUAL             | texto      | 18 / 18        | Não  | 65         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 66  | CNPJPRAT                | texto      | 18 / 18        | Não  | 66         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| C   | 67  | INDAPREND               | indefinido | — / 1          | Não  | **64**     | NÃO VERIFICÁVEL (doc × NLI) | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 1   | Identificador           | texto      | 1              | Sim  | —          | COMPATÍVEL                  | constante `D`                                                      | —                |
| D   | 2   | CODIGOEMPRESA           | texto      | 18 / —         | Sim  | lookup     | COMPATÍVEL                  | empresas.cnpj                                                      | disponível       |
| D   | 3   | CPFFUNC                 | texto      | 14 / 14        | Sim  | 3          | COMPATÍVEL                  | processo.cpf do titular                                            | disponível       |
| D   | 4   | DATAADM                 | data       | 10 / 10        | Sim  | 4          | COMPATÍVEL                  | processo.dataAdmissao do titular                                   | disponível       |
| D   | 5   | CODIGODEPEND            | inteiro    | 5 / 5          | Não  | 5          | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 6   | NOMEDEPEND              | texto      | 70 / 70        | Sim  | 6          | COMPATÍVEL                  | dependente.nomeCompleto (até 180; layout 70)                       | disponível       |
| D   | 7   | DATANASC                | data       | 10 / 10        | Sim  | 7          | COMPATÍVEL                  | dependente.nascimento                                              | disponível       |
| D   | 8   | PARENTESCO              | texto      | 2 / 2          | Sim  | 8          | COMPATÍVEL                  | dependente.parentesco é texto livre; layout pede código            | de-para pendente |
| D   | 9   | CPFDEPEND               | texto      | 14 / 14        | Não  | 9          | COMPATÍVEL                  | dependente.cpf (opcional)                                          | disponível       |
| D   | 10  | SEXO                    | texto      | 2 / 2          | Sim  | 10         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 11  | ESTADOCIVIL             | texto      | 2 / 2          | Sim  | 11         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 12  | GRAUINSTR               | texto      | 3 / 3          | Sim  | 12         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 13  | IDADEMINCRECHE          | texto      | 5 / 5          | Não  | 13         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 14  | IDADELIMCRECHE          | texto      | 5 / 5          | Não  | 14         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 15  | IDADELIMSALFAM          | texto      | 3 / 3          | Não  | 15         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 16  | IDADELIMIR              | texto      | 4 / 4          | Não  | 16         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 17  | INCAPAZTRABALHAR        | logico     | 1 / 1          | Não  | 17         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 18  | FORMACONTROLEIR         | texto      | 5 / 5          | Sim  | 18         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 19  | CONTROLEVACIN           | texto      | 2 / 2          | Não  | 19         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 20  | DATAVACIN               | data       | 10 / 10        | Não  | 20         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 21  | SIGLAESTADO             | texto      | 2 / 2          | Não  | 21         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 22  | CODIGOMUNIC             | texto      | 8 / 8          | Não  | 22         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 23  | NACIONALIDADE           | texto      | 3 / 3          | Sim  | 23         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 24  | CARTORIO                | texto      | 30 / 30        | Não  | 24         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 25  | LIVROREG                | texto      | 6 / 6          | Não  | 25         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 26  | FOLHALIVROREG           | texto      | 6 / 6          | Não  | 26         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 27  | NUMEROREG               | texto      | 10 / 10        | Não  | 27         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 28  | MATRICULA               | texto      | 50 / 50        | Não  | 28         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 29  | NUMDECLARNASCVIVO       | texto      | 20 / 20        | Não  | 29         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 30  | FUMANTE                 | logico     | 1 / 1          | Sim  | 30         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 31  | CONSOMEALCOOL           | logico     | 1 / 1          | Sim  | 31         | COMPATÍVEL                  | não coletado                                                       | NÃO IMPLEMENTADO |
| D   | 32  | ENTREGACERT             | data       | 10 / 10        | Não  | **4**      | NÃO VERIFICÁVEL (doc × NLI) | não coletado                                                       | NÃO IMPLEMENTADO |
