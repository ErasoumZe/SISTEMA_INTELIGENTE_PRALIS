# Fluxo completo

## Entrada Conplus

`arquivo ou API oficial → parser → validação → prévia → confirmação → PostgreSQL → tela DP`

Rescisões utilizam o parser TXT existente. Férias utilizam o parser CSV existente. Folha 05 e
Adiantamento 20 só devem receber arquivos quando o layout de origem oficial estiver homologado.

## Saída Google

`registro confirmado → mapeamento por cabeçalho → prévia somente leitura → autorização operacional → escrita controlada`

A prévia verifica cabeçalhos, linha candidata, células ocupadas, fórmulas, mesclagens, proteções e
conflitos. A flag `CONPLUS_GOOGLE_SYNC_ENABLED` permanece desligada até homologação.
