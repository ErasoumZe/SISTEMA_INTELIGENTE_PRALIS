# 50 — Integração Questor: admissão e eventos variáveis

**Data:** 15/10/2026  
**Estado:** descoberta documental concluída; implementação e transmissão externas bloqueadas por contrato pendente.  
**Relacionados:** `48_CICLO_CADASTRO_CONTABILIDADE_CONFIGURACAO.md`, `49_HANDOFF_DP_KAYLANE_2026_10_14.md` e issue [#160](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/160).

## 1. Decisão desta leitura

O **Questor/Zen** é o sistema técnico que recebe ou troca os dados de admissão e de eventos variáveis. **Conplus é a contabilidade responsável pelo processo**, não um sistema concorrente. Portanto, o fluxo esperado é Pralis ↔ Questor/Zen, operado e validado junto da Conplus.

Não existe autorização para enviar dados reais, não foram fornecidos endpoint, autenticação, credenciais, ambiente sandbox, tabela de códigos por empresa nem contrato de resposta da API. Consequentemente, esta descoberta **não autoriza** migration, criação de integração ativa, backfill, exportação com dados reais, deploy ou mudança de cálculo de folha.

## 2. Fontes conferidas

| Fonte | O que foi confirmado | Limite |
| --- | --- | --- |
| E-mail da contabilidade, 07/10/2026 | O envio de admissões terá API futura; eventos variáveis começam por arquivo CSV manual. | A API ainda não foi disponibilizada. |
| Pasta compartilhada de layouts | Há layouts `A_FunContratoPre.nli`, `B_DadosObrigatoriosAdmissao.nli`, `C_DadosNaoObrigatoriosAdmissao.nli`, `D_DependenteRascunho.nli` e exemplos A–D/unificado. | Os `.nli` não foram tratados como contrato executável nem versionados no Git. |
| [Questor — 600 Admissão Funcionários](https://docs.questor.com.br/pt-br/Produtos/Integracoes/SYN/Documenta%C3%A7%C3%A3o/DadosVersao2/LayoutTxtFolhadePagamento/ERPParceiroxQuestorFolhaEnviarDados/nfpaadmissaofuncionario) | Formato e tipos de registro da admissão. | Validar com fornecedor a versão contratada e exceções por empresa. |
| [Questor — Importação de eventos variáveis](https://docs.questor.com.br/pt-br/Produtos/Gest%C3%A3oCont%C3%A1bil/FolhadePagamento/C%C3%A1lculo_Folha_e_Impostos/eventos-variaveis-importacao-planilha-por-arquivo) | Processo manual de importação CSV/TXT e unidades de eventos. | Código de empregado/evento e configuração da empresa ainda faltam. |

Nenhum dado pessoal real, anexo de admissão, credencial ou arquivo recebido foi copiado para este repositório ou para o Segundo Cérebro.

## 3. Admissão no Questor: contrato observado

O arquivo é textual, separado por `;`, com uma linha por registro e quebra de linha CRLF. Pode conter mais de um estabelecimento. A documentação prevê registros variáveis e exige que cada tipo mantenha a quantidade de separadores esperada; não é seguro montar linhas por concatenação solta.

| Tipo | Finalidade | Cardinalidade esperada |
| --- | --- | --- |
| `A` | pré-cadastro do contrato de trabalho | um por contrato/vínculo |
| `B` | dados obrigatórios da admissão | um por contrato/vínculo |
| `C` | dados não obrigatórios | no máximo um por contrato/vínculo, conforme preenchimento |
| `D` | dependente em rascunho | um por dependente |

O exemplo unificado compartilhado confirma a sequência prática A/B/C/D. Há uma inconsistência na própria documentação do fornecedor: a tabela inicial identifica o dependente como `D`, enquanto uma descrição posterior menciona fixar outra letra. A implementação deve validar esse ponto com a contabilidade/Questor antes de gerar qualquer arquivo.

### 3.1 Restrições do contrato externo

- datas são apresentadas pela documentação em `DD/MM/AAAA`;
- CPF, CNPJ, CEP e alguns documentos possuem máscara específica de saída;
- muitos campos não são texto livre: usam códigos externos de empresa, estabelecimento, contrato, sindicato, categoria eSocial, cargo/CBO, município, organograma, jornada/escala, banco, vínculo, evento e benefício;
- o tipo `B` contém campos pessoais, bancários, documentais e potencialmente sensíveis (por exemplo, deficiência e exposição). Eles não podem ser inferidos nem preenchidos com valor padrão;
- para uso pela API SYN, a documentação descreve serialização do arquivo no corpo JSON; endpoint, autenticação, tamanho, idempotência e resposta continuam desconhecidos.

## 4. Mapa Pralis → Questor

| Situação | Campos/fatos | Regra de implementação |
| --- | --- | --- |
| **Existe no Pralis, com normalização de saída** | nome, CPF, nome social, nascimento, sexo, estado civil, endereço, CEP, UF, contato, mãe/pai, documentos cadastrados, dados bancários, PIS, CTPS, data de admissão e dependentes | Formatar somente no adaptador de saída; preservar a verdade normalizada interna. |
| **Existe, mas exige tabela homologada** | função/CBO, setor, turno/jornada, empresa, banco e município | Nunca converter texto livre em código Questor por aproximação. Exigir catálogo versionado por empresa e vigência. |
| **Não confirmado no domínio atual** | termo de consentimento, códigos de contrato/sindicato/categoria eSocial, estabelecimento/organograma/escala Questor, RAIS/CAGED, tipo e valor salarial, agentes de risco e dados médico-previdenciários | Não criar coluna, enum ou valor padrão sem regra operacional, análise LGPD e aprovação de migration quando aplicável. |

O código atual tem fluxo de perfil, vínculo e onboarding candidato, mas não contém adaptador Questor, catálogo externo, fila de tentativas, chave idempotente externa ou prova de entrega. As migrations `0050`–`0056` são candidatas não aplicadas e não devem ser usadas como autorização para este projeto.

## 5. Segurança e privacidade

1. O pacote de admissão deve ser construído por **lista permitida de campos**, nunca pela serialização total do perfil.
2. A prévia fica restrita às permissões de DP já existentes; rota e API devem aplicar a mesma guarda.
3. Auditoria registra ator, horário, versão de layout, destino, resultado e hash do artefato — não CPF, documento, dados bancários ou conteúdo bruto do arquivo em evento/log.
4. Arquivo temporário precisa de retenção definida, criptografia/controle de acesso e remoção verificável antes de existir em produção.
5. O envio deve exigir ação explícita do DP e confirmação da prévia. Reenvio deve usar chave idempotente e nunca duplicar admissão no destino.

## 6. Eventos variáveis: contrato observado

O caminho inicial é **manual**: o operador escolhe empresa e competência no Zen e importa CSV/TXT. A documentação informa versão mínima 23.3.0.0 e estrutura por colunas:

| Linha/coluna | Conteúdo |
| --- | --- |
| linha 1, coluna 3 em diante | códigos dos eventos |
| linha 2, coluna 3 em diante | unidade: `H` (horas), `R` (referência) ou `V` (valor) |
| linha 3 | ignorada/opcional como cabeçalho |
| linha 4 em diante, coluna 1 | código externo do empregado; coluna 2 é ignorada; demais colunas são valores |

O separador é `;`; as posições dos eventos podem variar após a coluna 3. A interpretação de horas depende da configuração externa de hora centesimal. A importação processa novamente todas as linhas e pode duplicar lançamento quando o mesmo arquivo é importado mais de uma vez; erro de validação pode abortar o lote inteiro.

### MVP seguro para eventos variáveis

O primeiro incremento pode somente gerar **prévia e CSV local**, com validação antes do download. O DP importa manualmente no Zen. O Pralis não afirma que a importação externa ocorreu até haver retorno contratual do fornecedor.

Para permitir isso, a contabilidade deve fornecer, por empresa e competência:

- catálogo de evento: código e unidade autorizada (`H`, `R` ou `V`);
- código externo do empregado;
- formato decimal e configuração de hora centesimal;
- regras de competência, correção/cancelamento e tratamento de reimportação.

O artefato local precisa de identificador, hash de conteúdo, empresa e competência para avisar reuso. Isto reduz reenvio pelo Pralis, mas não prova nem controla uma importação manual já feita no Zen.

## 7. Sequência de entrega proposta

| Fase | Entrega vertical | Gate obrigatório |
| --- | --- | --- |
| 0 | Confirmar versão do Questor/Zen, sandbox, política de dados, responsáveis e catálogo de códigos. | Resposta formal da Conplus/Questor. |
| 1 | Mapeador puro + validador com fixtures sintéticas e relatório de campos faltantes. | Layout homologado; sem banco novo e sem rede externa. |
| 2 | Prévia do DP e exportação de admissão de teste, com permissões, hash e auditoria mínima. | Teste conjunto em sandbox e decisão de retenção. |
| 3 | Adaptador da API, retries controlados, idempotência e reconciliação de resposta. | Especificação de API, credenciais segregadas e aprovação explícita para escrita externa. |
| 4 | Prévia/CSV de eventos variáveis por competência. | Catálogo de eventos/unidades e caso de teste validado pelo Zen. |

Cada fase deve ser uma PR pequena e completa (tela, API quando houver, testes e remoção do caminho substituído), sem misturar migration com integração externa não homologada.

## 8. Perguntas que bloqueiam o início técnico

1. Qual endpoint, versão, autenticação, IP allowlist, limites e ambiente sandbox da API SYN do Questor/Zen?
2. Qual é o identificador idempotente aceito pelo Questor e como consultar/corrigir uma transmissão parcial?
3. Quais catálogos, códigos e vigências serão fornecidos por empresa (estabelecimento, contrato, sindicato, função/CBO, município, organograma, jornada, banco e empregado)?
4. Quais campos são obrigatórios por categoria de contratação e quais podem ser omitidos legalmente?
5. Confirmar o marcador do registro de dependente diante da inconsistência da documentação e homologar um arquivo sintético A–D.
6. Quem aprova a transmissão na Conplus, qual prazo de retorno e como registrar recusa/correção sem alterar histórico?
7. Para eventos: qual competência, formato decimal, regra de hora centesimal e catálogo de código/unidade por empresa?
8. Qual política de retenção, mascaramento, acesso e descarte dos arquivos e respostas que contêm dados pessoais?

## 9. Critérios de aceite futuros

- um pacote sintético A–D é aceito em sandbox e o retorno é reconciliado sem duplicidade;
- campo sem código homologado bloqueia a prévia com mensagem acionável;
- perfis sem permissão não acessam prévia, arquivo, rota ou tentativa de envio;
- repetição idêntica não cria novo envio; correção gera nova versão auditável;
- evento com unidade divergente, funcionário sem código ou competência inválida falha antes do download;
- nenhum fixture, log, comentário de issue ou commit contém PII real ou segredo;
- testes de contrato, integração isolada e responsividade da prévia passam antes da PR.

## 10. Próximo responsável

A continuidade pertence à issue [#160](https://github.com/ErasoumZe/SISTEMA_INTELIGENTE_PRALIS/issues/160), depois da reconciliação da referência de DP com a `main` (#180) e do preflight de schema (#181). A primeira ação não é programar: é obter as respostas da seção 8 e anexar apenas documentação sanitizada da contabilidade.
