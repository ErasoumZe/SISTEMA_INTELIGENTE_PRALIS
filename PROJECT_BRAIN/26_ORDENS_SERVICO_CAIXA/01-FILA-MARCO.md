# Fila de Marco — Caixa

Marco atua em testes de regressão, usuários/acesso, interface operacional e aceite E2E. A ordem é
sequencial. Não abrir a próxima branch antes de a anterior estar incorporada à `origin/main`.

## CX-M01 · Pagamentos divididos — EM EXECUÇÃO

**Origem:** D-06.
**Branch:** `fix/caixa-pagamentos-divididos`.

Aceite:

- venda com 2 formas;
- venda com 3 formas;
- reenvio idêntico sem empilhar;
- alteração do rateio substitui os filhos;
- uma venda no banco e total do Caixa contado uma vez;
- todos os gates e CI verdes.

## CX-M02 · Criar usuário de operação

**Origem:** B-01.
**Dependência:** `CX-M01` incorporada.
**Branch sugerida:** `fix/caixa-criacao-usuario`.

Reproduzir o “e-mail já existe” com endereço inédito, corrigir a causa no Better Auth e provar criação,
perfil, vínculo de empresa, colaborador/cargo e primeiro login. Não misturar recuperação de senha.

Aceite: um admin cria um Caixa real, o usuário nasce no escopo correto e consegue autenticar.

## CX-M03 · Recuperação e troca de senha

**Origem:** B-02 e B-03.
**Dependência:** `CX-M02`.
**Branch sugerida:** `fix/caixa-recuperacao-senha`.

Fechar o fluxo completo do e-mail até a nova senha e criar a ação administrativa de redefinição com
permissão e trilha. Tokens não podem aparecer em log ou relatório.

Aceite: link abre a rota correta, token é consumido uma vez, senha antiga falha e nova funciona.

## CX-M04 · Administração de usuário sem takeover ou promoção indevida

**Origem:** S-01 + achado pós-PR #139 (`PUT /api/usuarios/:id`).
**Dependência:** `CX-M02`.
**Branch sugerida:** `fix/usuarios-alvo-e-role-cross-tenant`.

Cobertura adicional obrigatoria na mesma fronteira: S-07, S-08, S-09, S-11, S-12, S-13 e S-18.
Provar regras vazias, `:id` divergente, autoelevacao e o cargo Operador de Caixa com permissoes
aprovadas, sem reabrir a S-06.

Validar o usuário-alvo antes de trocar nome/e-mail/vínculos; impedir ator de A de editar conta de B;
impedir `cadastro_usuarios_editar` de conceder `usuario_admin` sem autorização dedicada; auditar troca
de role.

Aceite: testes de takeover, autoelevação, própria empresa, admin e falha técnica.

## CX-M05 · Colaboradores isolados por empresa

**Origem:** achados pós-PR #139.
**Dependência:** `CX-M04`.
**Branch sugerida:** `fix/colaboradores-cross-tenant`.

Fechar leitura e escrita cross-tenant em `GET/POST/PUT /api/colaboradores`, incluindo setor e cargo.
Não alterar o contrato sem mapear os consumidores da tela de usuários.

Aceite: nenhum UUID de B chega ao browser de A e nenhuma escrita aceita alvo de B.

## CX-M06 · Campos operacionais do lançamento

**Origem:** B-04 e B-05.
**Dependência:** `CX-M01`.
**Branch sugerida:** `fix/caixa-campos-operacao`.

O código já trava a conta do Caixa (R-121); criar prova de componente/E2E e não recriar a solução.
Remover “Colaborador” de Mercadoria no caminho real, mantendo Fornecedor. Confirmar que Despesa
continua aceitando fornecedor ou colaborador.

Aceite: Caixa vê a conta do PDV preenchida e sem seletor; Mercadoria não oferece colaborador.

## CX-M07 · Descontos da discriminação persistem

**Origem:** F-15 / R-051.
**Dependência:** `CX-M06`.
**Branch sugerida:** `fix/caixa-descontos-discriminacao`.

Provar ida e volta de “com desconto” entre tela, API e banco, com arredondamento em centavos e sem
alterar fórmula aprovada. Se a fórmula atual divergir da spec, parar para decisão.

## CX-M08 · Tela de pendente de discriminação

**Origem:** B-07 do backlog (B-08 na ata).
**Dependência:** decisão de José sobre remover agora ou redesenhar.
**Branch sugerida:** `fix/caixa-pendencias-discriminacao`.

Aplicar a regra-mãe: ou entregar o fluxo útil, ou remover o caminho antigo por completo. Não esconder.

## CX-M09 · Pendências e quebra do operador

**Origem:** R-124, R-125, R-126 e C-10.
**Dependência:** `CX-Z08`, `CX-Z10` e decisão de notificação.
**Branch sugerida:** `feat/caixa-pendencias-operador`.

Entrega vertical: operador vê o próprio saldo e pendências com Caixa aberto ou fechado; recebe a
notificação da própria quebra; somente Tesouraria resolve. O filtro é sempre pelo usuário autenticado.

## CX-M10 · Remover caminho antigo de malotes

**Origem:** F-11 / R-022.
**Dependência:** `CX-Z11` e `CX-Z13`.
**Branch sugerida:** `refactor/caixa-remove-malotes`.

Remover rota, menu, modal e código morto do caminho substituído por Transferências. Preservar apenas
dados/migrations históricos necessários. Não esconder com feature flag.

## CX-M11 · E2E dos três fluxos de dinheiro

**Origem:** F-06.
**Dependência:** backend das ondas 2 a 4 incorporado.
**Branch sugerida:** `test/caixa-e2e-fluxos-dinheiro`.

Playwright:

1. abrir Caixa por lacre;
2. lançar saída pela conta do PDV;
3. fechar com e sem diferença/retorno conforme decisão final.

Incluir um fluxo de pagamento dividido e um acesso negado por empresa.

## CX-M12 · Homologação visual e funcional

**Origem:** F-07, F-09, F-10, F-16 e Definition of Done.
**Dependência:** `CX-M11`.
**Branch sugerida:** `fix/caixa-homologacao-final` somente se houver correção.

Validar todas as telas do Caixa em 1440/1024/768/390, sem scroll horizontal, texto corrompido,
estado vazio fora da tela ou segundo caminho para o mesmo ato. Evidência por checklist e capturas.
