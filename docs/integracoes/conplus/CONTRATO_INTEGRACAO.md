# Contrato interno da integração

## Contratos conhecidos

- `POST /api/conplus/importacoes/preview`
- `POST /api/conplus/importacoes/confirmar`
- `GET /api/conplus/importacoes`
- `GET /api/conplus/importacoes/:id`
- `GET /api/conplus/importacoes/:id/historico`
- `POST /api/conplus/importacoes/:id/sincronizar/previsualizar`
- `POST /api/conplus/importacoes/:id/sincronizar`

As rotas exigem autenticação e permissões Conplus específicas. O endpoint de prévia Google não grava
no Sheets e recebe somente o ID do registro persistido; endereços de célula não são aceitos do
navegador.

## Destino técnico de Rescisões

O código possui suporte opt-in ao destino `CONPLUS RESCISOES - ENTRADA`, ainda não ativado nas
rotas. A estrutura prevista mantém os 13 campos oficiais e acrescenta `ID_IMPORTACAO`, `ID_REGISTRO`,
`HASH_REGISTRO`, `STATUS_SINCRONIZACAO`, `CRIADO_EM` e `ATUALIZADO_EM`. A aba oficial visual de
Rescisões permanece preservada e só deve ser relacionada ao destino técnico depois de homologação
da Conplus.

Criar essa aba, definir suas permissões ou ligá-la à visualização oficial exige alteração real na
planilha e autorização separada.

## Contrato externo pendente

Não foram inventados endpoint, payload, autenticação ou código de evento da API Conplus. Esses itens
dependem da documentação e das credenciais oficiais do fornecedor.
