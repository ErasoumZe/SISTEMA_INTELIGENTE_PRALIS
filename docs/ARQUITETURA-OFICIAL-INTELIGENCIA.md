# Arquitetura Oficial — Distribuição da Inteligência do Sistema

**Data:** 02/07/2026 · **Status:** proposta para decisão do Zé antes da Fase 4
**Método:** auditoria read-only sobre código real (Padaria v2 no estado pós-Sprint 1/T2/Fase 2/Fase 3-item 1) + auditoria do código legado Pralis em `CADASTRO DE PRODUTOS/pralis/stack`. Nenhum arquivo de código alterado. Classificação: **[FATO]** confirmado em código, **[DOC]** documentado, **[INF]** inferência.

---

## 1. Como o Pralis fazia

A alegação "o frontend nunca decide regra crítica; o backend é autoritativo" é **parcialmente verdadeira** no código real:

**O servidor É autoritativo para [FATO]:**

- **Autorização/governança**: criar produto = só admin e sempre na loja BASE (`product.service.ts:24-27`); editar = admin ou colaborador da própria loja (`:74`); excluir = só admin (`:84`); tudo negado no service com 403, testado ponta a ponta com Postgres real (`product.governance.integration.test.ts`). O front esconde botões, mas o servidor não confia nisso.
- **Autenticação**: JWT em cookie httpOnly + argon2 + sessão validada no banco a cada request (`auth-handler.ts:13-23`); role definido pelo servidor (`role = email === ADMIN_EMAIL`), cliente não se autopromove.
- **Identidade/proveniência**: loja do produto **ignorada do payload** ("a LOJA não vem do cliente — o servidor define", `product.requests.ts:7-9`); `codigo`/`codigoInterno` gerados no servidor sobrepondo o payload; `createdBy` do usuário autenticado.
- **Validação de shape**: Zod do shared aplicado em toda rota via `fastify-type-provider-zod`.

**O que NÃO é do servidor [FATO]:**

- **As fórmulas de preço/margem/promoção rodam SÓ no cliente**: `calcularVVenda`/`calcularVVendaFinal` são chamadas em `ProductForm.vue:76` e `index.vue:134` — **zero ocorrências em `api/src`**. A doc do Pralis afirma que "a API usa [as regras] pra validar/gravar" (`VISAO-GERAL.md:65`) — **não se confirma no código** [FATO contra DOC].

**O detalhe que salva o modelo [FATO]:** o cliente **não envia o preço calculado** — `buildPayload()` envia só insumos (`custo`, `margemPontual`, `vVendaPontual`, `auto`); o banco **não tem coluna de preço derivado**; o preço é recomputado em toda exibição. Não existe o vetor "cliente forja preço e servidor confia" — porque preço **não trafega nem é persistido**.

**Síntese Pralis:** servidor dono de segurança, permissão e identidade; shared dono das fórmulas; cliente único executor da precificação **em modo derivação-na-leitura** (nunca como fonte persistida).

## 2. Como o Padaria v2 faz hoje (pós-estabilização)

**Onde o backend JÁ é autoritativo [FATO — muito disso construído na Sprint 1/T2/F2/F3]:**

- Default-deny global de autenticação (rota nova nasce protegida) + permissão por rota + dupla checagem nos lançamentos (`exigirPermissaoLancamento`).
- Escopo multiempresa no servidor: guards + `escopoEmpresaAtiva` + `validarReferencias*` + filtro no WHERE (F2).
- **Caixa (o melhor exemplo do modelo-alvo)**: fórmula oficial única em centavos no shared (`saldoCaixaCentavos`), **executada exclusivamente pelo servidor**; acerto com valor **calculado no servidor** (o legado que aceitava `valorDiferenca` do cliente foi removido — ADR-001); fechamento condicionado ao saldo; edição só no caixa aberto do usuário; unique parcial no banco; validação de somas em centavos no servidor (`somaConfereCentavos`).
- Barreira "somente caixa aberto" imposta no servidor (`resolverEscopoListagemPorCaixa`).
- Erros técnicos não vazam (guard central → handler global).

**Onde o frontend ainda decide (gaps) [FATO]:**
| Decisão no front | Evidência | Risco |
|---|---|---|
| **Preço de venda calculado no front e PERSISTIDO pelo backend sem recomputo** | `precoVendaDoFormProduto` (`domain.ts:666`) → payload `precoVenda`; `api/src/produtos` **não importa** `calcularPrecoVenda` (grep vazio) | O v2 é **pior que o Pralis** aqui: persiste o número do cliente. Cliente com `cadastro_produtos_editar` grava qualquer preço "calculado" |
| Margem %→fração convertida no front | `margemFracaoDoForm` (`domain.ts:657`) | Regra de domínio fora do shared; drift possível |
| **Serialização de payloads por tela no front** | `cadastroPayload`, `fiscalDoFormProduto`, `transformacaoDoFormProduto`, `promocoesDoFormProduto` (`domain.ts:822-923`) | Contrato duplicado implicitamente; mudança de API quebra silencioso |
| **Matriz permissão↔tela só no front** | `itemPorTela`, `secoesPermissoes`, `telaVisivelNoMenu` (`domain.ts`) | Backend não conhece o mapa; clientes futuros (mobile) reimplementariam |
| Dinheiro em float no front | somas com `Number()`+`toFixed` no `AppWorkspace`; `shared/dinheiro` não é importado no web-vue | Preview pode divergir do servidor (servidor valida em centavos desde a T2, então não corrompe — mas confunde) |
| Filtro de opções por empresa client-side | `opcoesFiltradasPorEmpresa` (`domain.ts:584`) | Só UX de selects (dados já vêm escopados da API desde F2) — risco baixo |
| **Campos sensíveis aceitos do payload** | `computar` (conta ou não no caixa) e `dataPagamento` (marca como paga) em vendas/despesas/mercadorias/retiradas/transferencias | Ver §5 — este é decisão de negócio trafegando como campo comum |

**Shared hoje:** contratos de request fortes (usados pela API em 100% das rotas); schemas de response mortos (nunca validados); regras puras com **três destinos diferentes**: `caixa/regras` (executada só pelo servidor — modelo certo), `produtos/regras` (executada só pelo front — modelo errado p/ persistência), `dinheiro` (servidor sim, front ainda não), `autenticacao` (ambos — correto, front para UX e servidor para autoridade).

## 3. Diferenças

| Dimensão                           | Pralis                                                        | Padaria v2 hoje                                                               |
| ---------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Autorização                        | Servidor, testada                                             | Servidor, testada (equivalente ou melhor: default-deny global)                |
| Identidade (loja/código/criadoPor) | Servidor ignora payload                                       | Servidor (códigos de produto, criadoPor, caixa_id) ✔                          |
| Preço                              | Fórmula no shared, executor no cliente, **nunca persistido**  | Fórmula no shared, executor no cliente, **persistido sem recomputo** ⚠        |
| Payloads                           | Cliente envia insumos crus                                    | Cliente envia payloads ricos serializados no front                            |
| Dinheiro no fluxo crítico          | n/a (catálogo)                                                | Servidor em centavos (T2) ✔; front em float (preview)                         |
| Multiempresa                       | 1 loja por usuário, simples                                   | N:N com escopo no servidor (mais maduro)                                      |
| Campos sensíveis                   | `status/custo/margem` aceitos (baixo impacto, preço derivado) | `computar`/`dataPagamento` aceitos (impacto direto no caixa/contas a pagar) ⚠ |

## 4. Pontos fortes de cada modelo

**Pralis:** disciplina de identidade (servidor sobrepõe payload), preço nunca persistido (elimina o vetor por design), governança testada, filosofia declarada e ensinada.
**Padaria v2:** shared muito mais rico (30 módulos de contrato), caixa com autoridade exemplar em centavos, multiempresa real no servidor, suíte de integração 121 testes com banco real, migrations/CI/gates — a _infraestrutura_ de autoridade já existe; falta aplicá-la a produto/preço e campos sensíveis.

## 5. Riscos encontrados (Parte 3 — segurança, usuário malicioso)

1. **[ALTO — domínio caixa] `computar: false` vindo do cliente.** Qualquer usuário com `entradas_criar` pode lançar venda com `computar:false` → o movimento **não entra no saldo do caixa** (fórmula filtra `computar=true`). Vetor de desvio: registra-se a venda "para constar" sem que o caixa cobre a diferença. Proteção atual: nenhuma além da permissão de criar. Correção: `computar` não deve ser decidível pelo cliente comum — ou é derivado por regra (como mercadorias via `deveComputarMercadoria`), ou exige permissão própria + trilha de auditoria.
2. **[MÉDIO] `dataPagamento` na criação/edição.** Cliente marca despesa como já paga → some de "contas a pagar pendentes" sem qualquer fluxo de baixa. Correção: baixa de pagamento como operação própria (endpoint/permissão), não campo livre.
3. **[MÉDIO] Preço/custo/margem persistidos verbatim** (`produtos`). Hoje o preço é "referência de catálogo" (vendas reais vêm do CREARE), então não há perda financeira direta — mas a Fase 4 (unificação de produtos) vai promover esse catálogo a fonte de verdade comercial. Sem autoridade de preço no servidor, a Fase 4 constrói sobre areia.
4. **[BAIXO] Engenharia reversa:** o shared inteiro embarca no bundle SPA — catálogo de 197 permissões, fórmulas de preço/promoção são públicas para quem abrir o DevTools. Para uma padaria, sigilo de fórmula não é requisito real (INF); se um dia for, exigirá split do shared (ver §9-M5). Manipulação, não sigilo, é o risco que importa — e essa é tratável.
5. **[COBERTO] Chamadas diretas/payload/empresa:** default-deny, guards por rota, zod em tudo, escopo de empresa no WHERE + `validarReferencias`, caixa aberto obrigatório, unique parcial, 121 testes — um usuário chamando a API na mão hoje **não** cria em outra empresa, não edita caixa alheio, não força `valorDiferenca`. Resíduo de banco: tabelas-filhas sem FK composta por empresa (defesa é da aplicação; anotado desde o diagnóstico).
6. **[COBERTO] Validações só de cliente:** máscaras/CPF/UX; o servidor revalida shape em 100% das rotas. Exceção semântica: preço (item 3).

## 6. Opiniões individuais

**Principal Engineer** — Backend autoritativo, sem fanatismo: o caixa da T2 é o gabarito (fórmula no shared, execução no servidor, cliente só intenção). Reaplicar o gabarito a produtos/campos sensíveis antes da Fase 4. Não gastar um dia sequer com "sigilo de fórmula".
**Software Architect** — A pergunta certa não é "onde ficam as regras", é **"quem tem autoridade sobre o que é persistido"**. Regra pode ser isomórfica (shared, roda nos dois lados); autoridade é sempre do servidor. Pralis acertou por design (não persistir preço); v2 deve acertar por recomputo. ADR obrigatória.
**Security Architect** — Os vetores reais são `computar` e `dataPagamento`, não a fórmula de preço vazada. Prioridade: campos sensíveis viram operações com permissão própria. Divergência: eu **não** faria split do shared agora — mover regra para esconder do bundle só se vier requisito contratual.
**Backend Architect** — `salvarProduto` deve recomputar `precoVenda` com `calcularPrecoVenda` do shared quando `auto=true` e ignorar o número do cliente; quando `auto=false`, aceitar manual. É 1 função + testes. A serialização de payloads (`cadastroPayload`) deve descer do front para o shared.
**Frontend Architect** — _Divergência parcial:_ o front DEVE continuar executando as fórmulas do shared — preview ao vivo é UX essencial do Pralis e do v2. O que o front deve perder é a **exclusividade**: mesmo cálculo nos dois lados, servidor decide. E quero o front em centavos (`shared/dinheiro`) para o preview nunca divergir do servidor.
**Database Architect** — Autoridade final é constraint: os CHECKs de `produtos.status/tipo` que faltam, FK composta por empresa nas filhas (pendência conhecida), e qualquer política de `computar` deve ter trilha (quem, quando). Banco não executa fórmula, mas impede estado inválido.
**QA Lead** — O que decide isso na prática é o contrato de teste: para cada campo de payload, um teste responde "se o cliente mentir aqui, o que acontece?". Hoje `precoVenda`/`computar` não têm essa resposta. A migração (§9) precisa nascer com esses testes, como foi na T2.
**Product Engineer** — _Divergência de ênfase:_ preço hoje é referência (venda real = CREARE), então nada disso bloqueia receita imediata — mas a Fase 4 muda isso. Concordo com M1/M2 antes da Fase 4; M3/M4 podem correr em paralelo com ela. Não atrasar a Fase 4 por perfeição arquitetural.

## 7. Recomendação da equipe (unânime no essencial)

**Adotar oficialmente a filosofia Pralis, corrigida e endurecida:**

> **O cliente envia intenções. Toda decisão persistida é do servidor. O shared define as fórmulas e contratos; o servidor as executa com autoridade; o cliente pode executá-las apenas como preview.**

Não é "tirar inteligência do front" — é tirar do front a **autoridade**. O shared isomórfico continua sendo o diferencial do projeto (preview idêntico ao servidor, um só lugar para a fórmula); o que muda é que **nenhum valor calculado/decidido no cliente é persistido sem recomputo ou regra no servidor**.

## 8. Arquitetura alvo (responsabilidades)

| Item                                                        | Dono da autoridade                                                                                            | Nota                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Regras de negócio / cálculos / preços / margens / promoções | **Shared define, Backend executa e decide**; Front executa só como preview                                    | Gabarito = caixa da T2                                                     |
| Validações                                                  | Shape: shared (zod) revalidado pelo backend em toda rota (já é assim). Semântica: backend. UX/máscaras: front |                                                                            |
| Permissões / autorização / autenticação                     | **Backend** (default-deny + guards); catálogo e resolução no shared; front só esconde UI                      | Matriz permissão↔tela migra do front p/ shared (fonte única p/ web+mobile) |
| Filtros / escopo multiempresa                               | **Backend (WHERE)**; front filtra só apresentação                                                             | Feito na F2                                                                |
| Caixa / financeiro / estoque (futuro)                       | **Backend em centavos**, fórmula no shared                                                                    | ADR-001/T2                                                                 |
| Relatórios / importações / exportações / transformações     | **Backend** (agregação, escopo, side-effects); front renderiza                                                |                                                                            |
| Payloads / DTOs / contratos / serialização                  | **Shared** (montagem tipada de payload sai do `domain.ts` do front para o shared)                             |                                                                            |
| Formatação / exibição / estado temporário / navegação       | **Front**                                                                                                     | Com `shared/dinheiro` p/ valores                                           |
| Integridade / unicidade / histórico                         | **Banco** (constraints, uniques, FKs, triggers) — última linha de defesa                                      |                                                                            |
| Auditoria                                                   | Backend grava (quem/quando/o quê) + banco imutável                                                            | `edicoes_caixa` é o modelo; estender a campos sensíveis                    |

## 9. Plano de migração (sem novos módulos; prepara a Fase 4)

**M1 — Autoridade de preço no servidor** · Prioridade P0 (pré-Fase 4) · ~½ dia
Objetivo: `salvarProduto` recomputa `precoVenda` via `calcularPrecoVenda`/`resolverMargemGrupo` do shared quando `auto=true` (ignora o número do cliente); `auto=false` aceita manual. Conversão margem %→fração citada no contrato (payload segue em fração; documentar). Arquivos: `api/src/produtos/produtos.service.ts`, testes novos em `tests/integration/produtos/` ("cliente mente o preço → servidor grava o calculado"). Riscos: divergência com valores já cadastrados (nenhum dado de produção; dev re-seeda). Aceite: teste provando payload com preço forjado → banco com preço do servidor; preview do front continua idêntico (mesma fórmula).

**M2 — Campos sensíveis viram decisão de servidor** · P0 (pré-Fase 4) · ~1 dia + 1 decisão de negócio
Objetivo: `computar` deixa de ser aceito do cliente comum (derivado por regra; override só com permissão dedicada + registro de quem/quando); `dataPagamento` sai do payload de criação/edição e vira operação de baixa (`POST /api/despesas/:id/baixa` etc.) com permissão própria. **Decisão do Zé/Luis:** quem pode marcar não-computável e quem dá baixa. Arquivos: shared schemas dos 5 lançamentos, services, front (form), testes. Riscos: telas atuais usam esses campos — ajustar UI junto. Aceite: teste "cliente envia computar:false sem permissão → 403/ignorado".

**M3 — Serialização de payloads desce do front para o shared** · P1 (paralelo à Fase 4) · ~1-2 dias
Objetivo: `cadastroPayload`, `fiscalDoFormProduto`, `transformacaoDoFormProduto`, `promocoesDoFormProduto`, `margemFracaoDoForm` (e a matriz permissão↔tela) migram de `web-vue/utils/domain.ts` para módulos do shared, tipados pelos contratos. Front importa. Riscos: refactor de superfície no `domain.ts` (929 linhas); mitigado por typecheck estrito + suíte. Aceite: `domain.ts` sem montagem de payload; knip limpo.

**M4 — Front em centavos + máscara monetária** · P1 (item já previsto na Fase 3) · ~1 dia
Objetivo: web-vue consome `shared/dinheiro` (somas/preview em centavos, exibição via helper único); inputs monetários com máscara. Aceite: zero `Number(x)+Number(y)` monetário no front; preview de totais igual ao servidor ao centavo.

**M5 — (Somente se virar requisito) Split do shared por sigilo** · P3 · não recomendado agora
Separar contratos públicos de regras server-only se sigilo de fórmula virar exigência contratual. Hoje: custo alto, benefício nulo para o negócio.

## 10. ADRs recomendadas

- **ADR-002 — Backend autoritativo (regra oficial):** cliente envia intenções; toda decisão persistida é recomputada/decidida no servidor; shared define, servidor executa, cliente faz preview. (Formaliza §7.)
- **ADR-003 — Shared isomórfico com autoridade de execução:** regras puras determinísticas podem rodar no cliente exclusivamente como preview; proibido persistir resultado calculado no cliente. Response schemas do shared ou passam a validar ou são removidos (knip).
- **ADR-004 — Campos sensíveis de lançamento:** `computar` e `dataPagamento` como decisões de servidor com permissão/auditoria (resultado do M2 + decisão de negócio).
- **Adendo ao ADR-001:** registrar que a fórmula de saldo do caixa é o gabarito da ADR-002.

## 11. Checklist para novas funcionalidades (gate de arquitetura)

Antes de qualquer feature nova, responder por escrito no PR:

1. Que **intenção** o cliente envia? (nunca "que resultado o cliente envia")
2. Que decisão o servidor toma/recomputa? Onde está a fórmula no shared?
3. Que permissão guarda a rota? O default-deny cobre? Precisa de dupla checagem no service?
4. O escopo de empresa está no WHERE/validarReferencias?
5. Dinheiro: tudo em centavos no servidor? O preview do front usa a MESMA função do shared?
6. Algum campo do payload permite ao cliente "mentir" com efeito persistido? (teste obrigatório de payload hostil)
7. Que constraint do banco garante o invariante se a aplicação falhar?
8. Que registro de auditoria fica de quem decidiu o quê?

## 12. Decisão recomendada antes da Fase 4

**Adotar a ADR-002 (backend autoritativo, modelo shared-isomórfico-com-autoridade) como regra oficial do Padaria v2** e executar **M1 + M2 antes de iniciar a Fase 4** — porque a Fase 4 é exatamente o módulo de produtos/preço, e hoje o servidor não tem autoridade sobre preço nem sobre os campos que afetam o caixa. M3/M4 correm em paralelo à Fase 4; M5 não se faz.

Custo total de M1+M2: ~1,5-2 dias de trabalho + duas decisões de negócio (política de `computar`; política de baixa de pagamento).

_Aguardando a decisão do Zé. Nada será implementado sem autorização explícita._
