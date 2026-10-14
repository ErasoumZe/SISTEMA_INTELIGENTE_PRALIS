# PROJECT BRAIN — Sistema Pralis (SISTEMA_CAIXA)

> **Versão 2 — aberta em 22/07/2026, índice revisado em 05/08/2026.**
>
> Este brain é a fonte de verdade de **produto**. Ele substituiu `PROJECT_BRAIN - Copia/` (63
> documentos em inglês, fase anterior do Luís), que segue válida apenas como referência **técnica**.
>
> **Motivo da v2:** o projeto vinha sendo construído a partir de interpretação. Em 22/07 abrimos as
> três fontes reais (planilha operacional, conta Mobills, anotações do Rodrigo) e o modelo de negócio
> ficou explícito.

## Como ler

Se você está entrando agora, leia nesta ordem: **16 → 19 → 20 → 22 → 21 → 25**. Depois o resto, conforme
a necessidade.

| #                                                           | Documento                                 | Responde                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01](01_VISAO_E_FONTES.md)                                  | Visão e fontes da verdade                 | de onde vem cada decisão e quem ganha em caso de conflito                                                                                                                                                       |
| [02](02_REGRAS_DE_NEGOCIO_PLANILHA.md)                      | Regras de negócio (planilha)              | como o dinheiro anda de verdade na padaria ⚠️ _R8 revogada; ver R-001 e R-008_                                                                                                                                  |
| [03](03_MODELO_DE_CORES.md)                                 | Modelo de cores                           | o que cada cor significa — os hex vivem em `web-vue/utils/cores-categoria.ts`                                                                                                                                   |
| [04](04_UX_MOBILLS.md)                                      | UX Mobills                                | o que copiar e o que não copiar ⚠️ _§7 (tela de malotes) morta pela R-040_                                                                                                                                      |
| [05](05_ESTADO_ATUAL_SISTEMA.md)                            | Estado atual (22/07)                      | 🕰️ **histórico.** Fala de 58 tabelas e da tabela `malotes`; hoje são 70 e ela não existe                                                                                                                        |
| [06](06_GAPS_E_DECISOES.md)                                 | Gaps e decisões (22/07)                   | D1–D14 já respondidas pelo Rodrigo; G1 e G8 seguem válidos como escopo                                                                                                                                          |
| [07](07_METODO_CLONE_UI.md)                                 | Método de clone de UI                     | 🕰️ superado: a direção virou linguagem Cicluz (`67`), e C-03 inverteu a ordem                                                                                                                                   |
| [08](08_PLANO_DE_ACAO.md)                                   | Plano de ação (22/07)                     | 🕰️ **obsoleto.** A execução foi por verticais S1–S7 e Corujões; ver `20`                                                                                                                                        |
| [09](09_AUDITORIA_PERMISSOES.md)                            | Auditoria de permissões                   | matriz cargo × ação e usuários de teste — a matriz §4 segue sendo a referência                                                                                                                                  |
| [10](10_XMIND_V2_MUDANCAS.md)                               | Xmind V2 (24/07)                          | menu por setor (R-097, não iniciado) e os módulos novos                                                                                                                                                         |
| [12](12_DECISAO_FUNDO_SIMPLES.md)                           | Fundo simples (24/07)                     | o déficit foi revogado — o caixa não nasce devendo (R-001)                                                                                                                                                      |
| [13](13_TELAS_DESENHADAS_RODRIGO.md)                        | Telas do Rodrigo (tentativa)              | 🕰️ superado pelo `14`, quando as fotos originais chegaram                                                                                                                                                       |
| [14](14_TELAS_RODRIGO_TRANSCRICAO.md)                       | **Telas do Rodrigo (27/07)**              | transcrição dos 5 wireframes: campos, regras e o componente Vue de cada um                                                                                                                                      |
| [15](15_DECISOES_27_07.md)                                  | Decisões 27/07                            | sem seletor de mês · um só Sair · lacre inline · contas do usuário                                                                                                                                              |
| [16](16_DEFINITION_OF_DONE.md)                              | **Definition of Done**                    | o contrato de qualidade: quando uma entrega pode ser chamada de pronta                                                                                                                                          |
| [17](17_REGRAS_LANCAMENTOS_FINAIS.md)                       | Regras de Lançamentos                     | a spec vigente ⚠️ _§3 (seeding) desatualizada — vale o quadro do `20`_                                                                                                                                          |
| [18](18_DIVIDAS_TECNICAS.md)                                | **Dívidas técnicas**                      | D-01 a D-23: o que foi achado e adiado de propósito                                                                                                                                                             |
| [19](19_REGISTRO_DE_REGRAS.md)                              | **Registro de regras**                    | **a fonte única.** R-001 a R-151, contradições C-01 a C-09, regras revogadas                                                                                                                                    |
| [20](20_ESTADO_DA_ENTREGA.md)                               | **Estado da entrega**                     | onde a entrega parou, o que trava, e os comandos de validação                                                                                                                                                   |
| [21](21_DECISOES_04_08.md)                                  | **Reunião 04/08 (Marco)**                 | escopo de Compras/Estoque/Relatórios, 8 bugs ao vivo, 11 perguntas em aberto                                                                                                                                    |
| [22](22_AUDITORIA_STACK_2026_08_05.md)                      | **Auditoria de stack (05/08)**            | stack real, 20 riscos com arquivo:linha, ferramental e plano priorizado                                                                                                                                         |
| [23](23_PERMISSOES_MODELO_E_AUDITORIA.md)                   | **Permissões (05/08)**                    | modelo vigente, matriz cargo × ação, 10 achados abertos, testes que faltam                                                                                                                                      |
| [24](24_CADASTRO_DE_PRODUTOS.md)                            | **Cadastro de Produtos**                  | o que já existe e está testado, o que falta, e o conflito de fontes de importação                                                                                                                               |
| [25](25_BACKLOG_2026_08_05.md)                              | **Backlog (05/08)**                       | as 98 tarefas que fecham tudo o que as auditorias acharam, divididas entre os tres                                                                                                                              |
| [26](26_PLANO_CAIXA_100.md)                                 | **Plano do Caixa (05/08)**                | causa raiz dos bugs de acesso, plano em 3 blocos, Resend+Cloudflare, 6 decisoes                                                                                                                                 |
| [27](27_AVALIACAO_FINAL_CAIXA.md)                           | **Avaliacao final (05/08)**               | reconciliacao das tres leituras, 2 correcoes minhas, plano em ondas com gate                                                                                                                                    |
| [28](28_ENTREGA_AO_COFRE_D1_D10_B1_B5.md)                   | **Entrega ao cofre (06/08)**              | D1-D10 e B1-B5: parcial, atomico, idempotente. §11: a Fatia 3 removeu o caminho D4 (R-179)                                                                                                                      |
| [29](29_RUNBOOK_ROTACAO_ADMIN.md)                           | **Runbook do admin (R-162)**              | primeira instalacao, rotacao explicita e prova de que redeploy preserva credencial                                                                                                                              |
| [30](30_PRODUTOS_PRALIS_X_ERP.md)                           | **Produtos: Pralis × ERP**                | mapa de campos, o que falta trazer do app antigo e em que ordem                                                                                                                                                 |
| [29](29_PLANILHAS_DA_OPERACAO.md)                           | **Planilhas da operacao**                 | contas reais, taxas de cartao, conciliacao, dominio de producao e 9 regras novas                                                                                                                                |
| [30](30_RETOMADA_CAIXA_TESTAVEL_2026_08_24.md)              | **Retomada do Caixa testável**            | estado real em 24/08, decisões R-166–R-172 e fila vertical até CT-00–CT-19                                                                                                                                      |
| [31](31_PACOTE_ISSUES_CAIXA_TESTAVEL_2026_08_24.md)         | **Pacote de issues do Caixa testável**    | fila GitHub deduplicada e corpos das entregas até a auditoria final                                                                                                                                             |
| [32](32_ROTEAMENTO_FINANCEIRO_DA_VENDA_PROPOSTA.md)         | **Roteamento financeiro da venda**        | #152: 4 revisões, 8 P0, gate fechado — 5 pontos já eram regra, 4 confirmações e a #41 na frente                                                                                                                 |
| [33](33_IDEMPOTENCIA_VENDA_INTEGRADA_41.md)                 | **Idempotência da venda integrada (#41)** | desenho da 0032: SQL, consulta de duplicidade, rollback, `ON CONFLICT` e os três RED                                                                                                                            |
| [34](34_GOVERNANCA_CAIXA_MARCO_2026_08_24.md)               | **Governança atual do Caixa (24/08)**     | Marco é o único executor atual; gates de revisão, merge e autorizações separadas                                                                                                                                |
| [35](35_ADMISSAO_FLUXO_COMPLETO.md)                         | **Admissao: fluxo completo (mapa)**       | ADM-003: as 8 estacoes ate o colaborador, matriz de campos, SQL proposto e os 4 bloqueios ⚠️ _envelheceu: V2-V5 sairam; ler a §0.1 antes_                                                                       |
| [36](36_CADASTRO_COLABORADORES_PRE_CADASTRO_E_SITUACOES.md) | **Pre-cadastro e situacoes**              | de onde vem quem ja trabalha: ficha contabil nao e carga, a fila de pre-cadastro, e os dois vocabularios de situacao                                                                                            |
| [37](37_ADMISSAO_FICHA_PUBLICA_E_DEPENDENTES.md)            | **Ficha publica e dependentes**           | ADM-003 V3/V4 implementadas: link sem login, token so no fragmento e no cabecalho, dependentes com CPF conferido tambem pelo BANCO (D-7)                                                                        |
| [38](38_ADMISSAO_REVISAO_DA_FICHA_PELO_DP.md)               | **Revisao da ficha pelo DP**              | ADM-003 V5 implementada: tela propria com uma porta so, dependentes sem CPF (nao e mascara: a coluna nao e lida), processo alheio virou 404                                                                     |
| [39](39_ADMISSAO_FILA_DO_DP_E_CONTRATOS_DO_QUE_FALTA.md)    | **Fila do DP e contratos do que falta**   | ADM-003 V6 implementada: fila e recorte da lista, situacao da ficha derivada, sem estado novo — e os contratos das 6 verticais restantes, com o que trava cada uma ⚠️ _a §2 (funcoes) foi respondida pelo `40`_ |
| [40](40_CATALOGO_DE_FUNCOES_OPERACIONAIS.md)                | **Catalogo de funcoes operacionais**      | quem administra: DP ve/cria/edita/desativa, Gerencia so visualiza, e NAO existe exclusao — nem rota, nem botao, nem permissao                                                                                   |
| [41](41_RETRATO_DA_FUNCAO_PACOTE_DE_APROVACAO.md)           | **Retrato da funcao (pacote)**            | ⛔ NADA IMPLEMENTADO: o SQL da migration `0039` escrito para ser lido e aprovado antes de qualquer arquivo nascer — renomear funcao hoje reescreve o historico                                                  |
| [42](42_ADMISSAO_PERIODO_DE_TESTE.md)                       | **Admissao: periodo de teste**            | ADM-001: empresa derivada, Ativo/Inativo derivado, "excluir" = arquivar, CPF fora de GET                                                                                                                        |
| [43](43_ADMISSAO_PROCESSO_INICIADO.md)                      | **Admissao: processo iniciado**           | ADM-002 V0: nasce da efetivacao, sem botao de iniciar, dois estados, idempotencia simetrica                                                                                                                     |
| [44](44_ADMISSAO_DIRETA_TURNO_ASO.md)                       | **Admissao direta, turno e ASO**          | ADM-003 V1B: pre-cadastro do DP, turno por catalogo com retrato, CPF por lock, ASO pausa e retoma                                                                                                               |
| [45](45_ROBO_CARTOGRAFO_PLANILHAS.md)                       | **Robo Cartografo das planilhas**         | analise tecnica do extrator somente-leitura das planilhas PraLis: onde mora, scopes minimos, segredos fora do Git e criterios do piloto                                                                         |
| [46](46_INTEGRACAO_ADMISSOES_NA_MAIN.md)                    | **Integracao de admissoes na main**       | consolidacao das verticais de colaboradores na main, preservando o Caixa e usando a migration 0048 consolidada                                                                                                  |
| [47](47_EFETIVACAO_COLABORADOR_E_VINCULOS.md)               | **Efetivacao e vinculos**                 | decisao de pessoa por CPF, recontratacao por novo vinculo, ficha unica, timeline, checklist e ordem das proximas verticais                                                                                      |
| [48](48_CICLO_CADASTRO_CONTABILIDADE_CONFIGURACAO.md)      | **Ciclo de cadastro e contabilidade**     | ordem vigente: cadastro completo, contabilidade, retorno e configuracao operacional; separa onboarding do vinculo trabalhista                                                                                   |
| [49](49_HANDOFF_DP_KAYLANE_2026_10_14.md)                  | **Handoff DP para Kaylane**               | HEAD de referência, limites de integração, mapa técnico, provas e fila de continuidade                                                                                                                        |
| [67](67_LINGUAGEM_VISUAL_CICLUZ.md)                         | Linguagem visual Cicluz                   | tokens `--cx-*`, cor, espaço, raio, movimento, tipografia — **e §13 responsividade**                                                                                                                            |
| [68](68_RELATORIO_MODERNIZACAO_VISUAL.md)                   | Relatório da rodada visual                | o que mudou por arquivo em 01/08 e o que ficou aberto                                                                                                                                                           |
| [69](69_PLANO_DESIGN_2026_08.md)                            | Plano do design novo (ago/26)             | fila, decisões (D-01 a D-08), etapas até o fim e regras de convivência entre as frentes                                                                                                                         |

> **Por que 20 pula para 67:** `67` e `68` não pertencem à série do brain de produto — continuam a
> numeração da série de **design system**, que vive em `design-system/PROJECT_BRAIN/` e vai de 61 a 66. Quem os escreveu pegou o próximo número da série visual e gravou na pasta do brain de produto.
> **Não existe e nunca existiu arquivo 11.** Próximo número livre para o brain de produto: **47**.
>
> ⚠️ **Dois números estão ocupados duas vezes**, porque duas linhas de trabalho avançaram em
> paralelo e cada uma pegou o próximo livre que via: **29** (`29_RUNBOOK_ROTACAO_ADMIN.md` e
> `29_PLANILHAS_DA_OPERACAO.md`) e **30** (`30_PRODUTOS_PRALIS_X_ERP.md` e
> `30_RETOMADA_CAIXA_TESTAVEL_2026_08_24.md`). Os quatro arquivos existem e estão listados acima;
> renumerar é decisão à parte, porque quebra link em relatório e commit já publicado.
>
> Os documentos **33** e **34** vieram da branch da **#41**: o `33` é o desenho da idempotência da
> venda integrada (migration `0032`), e o `34` registra a governança atual do Caixa. As regras
> R-174, R-175 e R-178 que os acompanham estão no documento `19`.

> **A série de Admissões (35–45) chegou depois, de uma branch que ficou 118 commits atrás.** Nesse
> intervalo os dois lados gravaram documentos diferentes nos números **31, 32, 33 e 34** — e isso
> não é conflito que o git acuse: os nomes de arquivo diferem, o merge passa, e o brain ficaria
> ambíguo em silêncio. Como a `main` é o tronco e os documentos dela já estavam publicados e
> citados, **quem cedeu foi a branch**: `31` → `42`, `33` → `43`, `34` → `44`, e o Robô Cartógrafo
> nasceu `45` em vez de `32`. As 35 referências cruzadas nos documentos e as 10 em comentário de
> código foram reescritas junto.
>
> **Ordem de leitura de Admissões** (a numérica não serve, e é por isso):
> **42** (ADM-001, período de teste) → **43** (ADM-002 V0, processo) → **44** (ADM-003 V1B,
> admissão direta) → **35** (o mapa das 8 estações) → **36** (pré-cadastro) → **37** (V3/V4, ficha
> pública e dependentes) → **38** (V5, revisão do DP) → **39** (V6, fila — e os contratos do que
> falta) → **40** (catálogo de funções) → **41** (retrato da função, ⛔ esperando aprovação do SQL).

## Documento adicional

- [35 — Lume, assistente futuro do Caixa](35_LUME_ASSISTENTE_CAIXA.md): escopo futuro, governança e limites da primeira base de FAQs.

## Regra de ouro deste brain

> **Funcionamento = planilha. Aparência = Mobills. Escopo = Xmind. Detalhe de tela = anotações do
> Rodrigo. O código é o estado real.**

Ordem de precedência completa em `01`, seção 3. Registrada como R-119.

## Vocabulário

**Transferência**, nunca "malote" — o termo e a tabela morreram na R-040. **Lacre** é identificador
único e de uso único. **Dia de negócio** é `America/Sao_Paulo`. **Dinheiro** é centavo inteiro.

## Estado em uma linha (24/08/2026)

O Caixa principal está em retomada para ficar testável de ponta a ponta. A branch
`fix/caixa-saldo-insuficiente` contém a porta R-165, mas está bloqueada até a receita futura do
CREARE ganhar roteamento financeiro explícito ou pendência financeira sem saldo disponível. A fila
vertical, as decisões atuais e os gates estão no documento `30`; os planos anteriores são
históricos. O contrato proposto para destravar a #152 e a migration 0032 estão no documento `32`,
**aguardando autorização do José** — nada de schema foi aplicado.
