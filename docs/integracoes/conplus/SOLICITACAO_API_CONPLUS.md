# Solicitação técnica de homologação — Pralís ↔ Conplus

Prezados,

O Pralís está preparando a integração do Departamento Pessoal com a Conplus. Precisamos dos
contratos oficiais e de um ambiente de homologação antes de habilitar qualquer comunicação real.

## Fluxos pretendidos

### Fluxo A — Pralís para Conplus

Após o envio e a validação da admissão no Pralís:

`formulário de admissão → PostgreSQL → API Conplus`

Solicitamos o contrato oficial para envio de admissões, incluindo autenticação, endpoint, payload,
idempotência, retorno, validações e procedimento de retificação.

### Fluxo B — Conplus para Pralís

Para os arquivos ou endpoints de folha:

`Conplus → parser/adaptador Pralís → PostgreSQL → Departamento Pessoal → Google Sheets`

Os módulos previstos são:

- Folha de Pagamento — Dia 05;
- Adiantamento — Dia 20;
- Rescisões;
- Férias.

## Informações solicitadas

1. URL base e endpoints de homologação e produção;
2. método de autenticação, escopos, expiração e renovação de credenciais;
3. documentação OpenAPI ou equivalente;
4. layouts oficiais de TXT, CSV, XLSX e JSON, quando aplicável;
5. exemplos fictícios completos de cada formato;
6. identificação da empresa, competência, colaborador e registro;
7. códigos oficiais de eventos e unidades `H`, `R` e `V`;
8. regras para datas, valores, casas decimais, sinais e separadores;
9. regras de retificação, cancelamento, rejeição e duplicidade;
10. paginação, limites, timeouts, rate limit, retries e códigos HTTP;
11. webhooks, consulta de status e rastreabilidade;
12. requisitos de segurança, IPs permitidos e certificados;
13. credenciais fictícias de homologação e dados de teste;
14. checklist e critérios formais de homologação.

## Observações

Não assumiremos que o layout da planilha Google seja o layout de origem da Conplus. Também não
alteraremos códigos oficiais, unidades ou regras sem confirmação formal. Enquanto os contratos,
exemplos e credenciais de homologação não forem fornecidos, os adaptadores externos permanecerão
simulados e sem chamadas reais.
