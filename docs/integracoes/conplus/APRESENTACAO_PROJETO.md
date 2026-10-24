# Pralís — apresentação da integração Conplus

O Pralís é o sistema central de cadastro, validação e acompanhamento do Departamento Pessoal.
Ele mantém os dados no PostgreSQL, apresenta as informações nas telas internas e integra destinos
autorizados do Google Sheets e Google Drive.

## Escopo atual

- Cadastro e revisão de colaboradores e dependentes.
- Importação Conplus por arquivo para Rescisões e Férias.
- Estrutura visual para Folha 05 e Adiantamento 20.
- Persistência, histórico, idempotência e permissões no backend.
- Prévia de sincronização Google em modo somente leitura.

A integração oficial com a API Conplus permanece condicionada ao contrato, credenciais e homologação
fornecidos pela Conplus.
