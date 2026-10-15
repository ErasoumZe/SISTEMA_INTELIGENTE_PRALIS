import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import { admissoesProcessos, admissoesProcessosHistorico } from "@padaria/db/schema/admissoes";
import { colaboradores } from "@padaria/db/schema/cadastro";
import {
  cancelarProcessoPayloadSchema,
  exameExigeAtencao,
  processoDetalheDtoSchema,
  situacaoDoProcesso,
  situacoesExame,
  statusProcesso
} from "@padaria/shared/admissoes";

/**
 * ADM-002 V0 — o que a vertical NAO pode virar.
 *
 * A V0 e puramente aditiva e tem exatamente dois estados. Estes testes existem para que crescer
 * fora do escopo seja um erro de build, e nao uma descoberta na revisao.
 *
 * Roda sem banco: le o contrato Zod, a definicao Drizzle e o proprio codigo-fonte.
 */

const RAIZ = resolve(import.meta.dirname, "..", "..");
const MODULO = join(RAIZ, "api", "src", "admissoes");

function semComentarios(fonte: string): string {
  return fonte
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function fontesDoProcesso(): { nome: string; codigo: string }[] {
  return readdirSync(MODULO)
    .filter((n) => n.startsWith("processos."))
    .map((n) => ({ nome: n, codigo: semComentarios(readFileSync(join(MODULO, n), "utf8")) }));
}

describe("o fluxo de processo nao cresce para fora do escopo", () => {
  const fontes = fontesDoProcesso();

  it("varre arquivos de verdade", () => {
    expect(fontes.map((f) => f.nome).sort()).toEqual([
      "processos.controller.ts",
      "processos.repository.ts",
      "processos.service.ts"
    ]);
  });

  it("nao existe rota de iniciar admissao e a efetivacao tem rota unica", () => {
    const proibido = "/api/admissoes/" + "processos/:id/iniciar";
    for (const { nome, codigo } of fontes) expect(codigo, nome).not.toContain(proibido);

    const controller = fontes.find((f) => f.nome === "processos.controller.ts");
    expect(controller?.codigo).toContain('"/api/admissoes/processos/:id/efetivar"');
    expect(controller?.codigo).toContain('exigirPermissao("admissoes_processos_efetivar")');
  });

  it("existe UMA rota de criacao, e ela e a admissao direta", () => {
    // A V1A trouxe a admissao direta, e com ela o POST que a V0 proibia. A guarda nao foi apagada:
    // ela deixou de exigir "nenhuma criacao" e passou a exigir "exatamente uma, e so essa".
    const criacoes = fontes.flatMap(({ codigo }) => [
      ...codigo.matchAll(/app\s*\.\s*post\s*\(\s*"(\/api\/admissoes\/processos[^"]*)"/gu)
    ]);
    const rotas = criacoes.map((achado) => achado[1]).filter((rota) => !rota?.includes(":id"));
    expect(rotas).toEqual(["/api/admissoes/processos"]);

    const controller = fontes.find((f) => f.nome === "processos.controller.ts");
    expect(controller?.codigo).toContain("admissoes_processos_criar_direta");
  });

  it("o processo NUNCA nasce de POST quando ha teste", () => {
    // A garantia nao e "o service confere": o contrato nao TEM o campo, entao pedir origem teste por
    // aquela rota e impossivel, e nao apenas proibido.
    //
    // A V1B trouxe identidade para o pre-cadastro do DP — nome e CPF passaram a estar aqui, por
    // decisao. O que NAO pode aparecer nunca e `testeId`: e ele que abriria o segundo caminho.
    const contrato = readFileSync(join(RAIZ, "shared", "src", "admissoes", "processos.ts"), "utf8");
    const bloco = contrato.slice(
      contrato.indexOf("criarProcessoDiretoPayloadSchema"),
      contrato.indexOf("dadosInternosPayloadSchema")
    );
    expect(bloco).not.toContain("testeId");
    // E o pre-cadastro exige exatamente o que o DP confirmou.
    for (const campo of ["nomeCompleto", "cpf", "funcaoId", "turnoId", "dataAdmissao"]) {
      expect(bloco, campo).toContain(campo);
    }
    // Jornada em texto saiu do formulario: turno vem do catalogo.
    expect(bloco).not.toContain("jornadaHorario");
  });

  it("a lista existe, e e consulta — nao tem acao de criar por outro nome", () => {
    // A V0 nao tinha lista de proposito. A V1A precisou dela: a admissao direta nao tem teste de onde
    // ser alcancada, e sem lista um processo direto nasceria inalcancavel. A guarda mudou de "nao
    // existe" para "existe uma, e nenhuma acao paralela de criacao mora nela".
    const controller = fontes.find((f) => f.nome === "processos.controller.ts");
    expect(controller?.codigo).toMatch(/app\s*\.\s*get\s*\(\s*"\/api\/admissoes\/processos"\s*,/u);

    const tela = semComentarios(
      readFileSync(join(RAIZ, "web-vue", "components", "admissoes", "AdmissoesProcessosPage.vue"), "utf8")
    );
    for (const verbo of ["Iniciar admissão", "Efetivar", "Iniciar processo"]) {
      if (verbo === "Efetivar") continue;
      expect(tela, verbo).not.toContain(verbo);
    }
    // Um unico BOTAO de criacao. Conta o gatilho, nao a palavra: o estado vazio tambem menciona
    // "Novo cadastro" para explicar de onde vem um processo, e explicar nao e oferecer um segundo
    // caminho.
    expect([...tela.matchAll(/@click="novoAberto = true"/gu)]).toHaveLength(1);
    expect(tela).toContain("+ Novo cadastro");
    expect(tela).toContain("podeEfetivar");
    expect([...tela.matchAll(/@efetivar="abrirEfetivacao"/gu)]).toHaveLength(1);
  });

  it("somente a efetivacao cria colaborador; o processo apenas consulta o vinculo", () => {
    for (const { nome, codigo } of fontes) {
      expect(codigo, nome).not.toContain("insert(colaboradores)");
    }
    const efetivacao = readFileSync(join(MODULO, "efetivacao.repository.ts"), "utf8");
    expect(efetivacao).toContain("insert(colaboradores)");
  });

  it("motivo estruturado de cancelamento nao existe em lugar nenhum", () => {
    // Escrito em pedacos para este arquivo nao ser o unico culpado da propria varredura.
    const proibido = "motivo" + "Cancelamento";
    for (const { nome, codigo } of fontes) {
      expect(codigo, nome).not.toContain(proibido);
    }
    const schema = readFileSync(join(RAIZ, "db", "src", "schema", "app.schema.ts"), "utf8");
    const bloco = schema.slice(schema.indexOf('pgTable(\n  "admissoes_processos"'));
    expect(bloco.slice(0, 4000)).not.toContain("motivo_cancelamento");
  });

  it("o processo tem UMA entrada de menu, nao duas", () => {
    const menu = semComentarios(readFileSync(join(RAIZ, "web-vue", "utils", "menu.ts"), "utf8"));
    expect([...menu.matchAll(/"admissoes_processos"/gu)]).toHaveLength(1);

    // E uma pagina so para a LISTA. Duas rotas para a mesma tela seria o defeito que a regra-mae
    // proibe — uma rota por ATO, nao. A pasta existe desde a V5: a revisao da ficha e sub-rota do
    // processo (`/admissoes_processos/:id/ficha`), tela de outro ato, alcancada so pelo modal de
    // detalhe. `index.vue` e a lista de sempre; qualquer terceiro arquivo aqui e um segundo caminho.
    const paginas = readdirSync(join(RAIZ, "web-vue", "pages")).filter((n) => n.includes("admissoes_processos"));
    expect(paginas).toEqual(["admissoes_processos"]);
    const pasta = join(RAIZ, "web-vue", "pages", "admissoes_processos");
    expect(readdirSync(pasta).sort()).toEqual(["[id]", "index.vue"]);
    expect(readdirSync(join(pasta, "[id]")).sort()).toEqual(["efetivar.vue", "ficha.vue"]);
  });
});

describe("as permissoes do processo sao concedidas pelo catalogo", () => {
  const referencia = readFileSync(join(RAIZ, "db", "src", "referencia-permissoes.ts"), "utf8");

  it("DP e Gerencia alcancam o processo, e so o DP preenche o bloco interno", () => {
    // Concessao pelo mecanismo real: `permissoesDoCargo`. Nao ha atalho no frontend — a tela le
    // `sessao.perfil.permissoes`, que vem daqui.
    for (const cargo of ["Gerencia", "DP"]) {
      const inicio = referencia.indexOf(`${cargo}: permissoesDoCargo(`);
      expect(inicio, cargo).toBeGreaterThan(-1);
      const bloco = referencia.slice(inicio, referencia.indexOf("}),", inicio));
      // `_visualizar` vem de `ativas` (a chave de menu) desde a V1A; cancelar e criar continuam extras.
      expect(bloco, cargo).toContain("admissoes_processos");
      expect(bloco, cargo).toContain("admissoes_processos_cancelar");
      expect(bloco, cargo).toContain("admissoes_processos_criar_direta");
    }

    // O bloco interno carrega CTPS, PIS/NIT e o exame: a Gerencia inicia, o DP preenche.
    const inicioDp = referencia.indexOf("DP: permissoesDoCargo(");
    const blocoDp = referencia.slice(inicioDp, referencia.indexOf("}),", inicioDp));
    expect(blocoDp).toContain("admissoes_processos_editar_internos");

    const inicioGerencia = referencia.indexOf("Gerencia: permissoesDoCargo(");
    const blocoGerencia = referencia.slice(inicioGerencia, referencia.indexOf("}),", inicioGerencia));
    expect(blocoGerencia).not.toContain("admissoes_processos_editar_internos");
  });

  it("o cargo Diretor Geral recebe somente a conferencia de fechamento", () => {
    // O cargo continua sem acesso ao fluxo de admissoes. A excecao e intencional: Diretor Geral
    // acompanha e decide a conferencia final do caixa junto da Tesouraria.
    const inicio = referencia.indexOf('"Diretor Geral": permissoesDoCargo(');
    const bloco = referencia.slice(inicio, referencia.indexOf("}),", inicio));
    expect(bloco).toContain('"relatorio_fechamento_visualizar"');
    expect(bloco).toContain('"fechamentos_caixa_conferir"');
    expect(bloco).not.toContain("admissoes_processos");
  });

  it("a unica permissao de criacao e a da admissao DIRETA", () => {
    // Iniciar continua sendo consequencia de efetivar o teste, nao um ato separado. O que a V1A
    // acrescentou foi a admissao direta — e o nome da permissao diz qual das duas origens ela abre.
    const catalogo = readFileSync(join(RAIZ, "shared", "src", "autenticacao", "index.ts"), "utf8");
    expect(catalogo).toContain('"admissoes_processos_visualizar"');
    expect(catalogo).toContain('"admissoes_processos_cancelar"');
    expect(catalogo).toContain('"admissoes_processos_criar_direta"');
    expect(catalogo).toContain('"admissoes_processos_editar_internos"');
    expect(catalogo).not.toContain("admissoes_processos_iniciar");
    // O generico continua nao existindo: criar sem dizer a origem seria o segundo caminho.
    expect(catalogo).not.toContain('"admissoes_processos_criar"');
  });

  it("o processo entra por menu: a chave vai em ativas, nao em extras", () => {
    // Inversao consciente da guarda da V0. `ativas` mapeia chave de MENU para a permissao de
    // visualizar; a V0 mantinha o processo fora porque nao havia como chegar sem teste. A admissao
    // direta mudou a premissa: sem menu, o processo direto seria inalcancavel.
    for (const cargo of ["Gerencia", "DP"]) {
      const inicio = referencia.indexOf(`${cargo}: permissoesDoCargo(`);
      const bloco = referencia.slice(inicio, referencia.indexOf("}),", inicio));
      const ativas = bloco.slice(bloco.indexOf("ativas:"), bloco.indexOf("]", bloco.indexOf("ativas:")));
      expect(ativas, cargo).toContain("admissoes_processos");
    }
  });
});

describe("estados: exatamente dois, e nenhum antecipado", () => {
  const config = getTableConfig(admissoesProcessos);

  it("os tres estados alcancaveis, e nenhum a mais", () => {
    // A V0 tinha dois. A V1B trouxe `pausado` porque um ASO nao apto para o processo — e parar nao e
    // cancelar. A guarda nao foi afrouxada: continua exigindo a lista EXATA.
    expect([...statusProcesso]).toEqual(["iniciado", "pausado", "cancelado"]);
  });

  it("nenhum estado de vertical futura foi reservado", () => {
    // Aceitar um estado antes de a regra dele existir grava vocabulario que ninguem confirmou com o
    // DP — e que passa a ser gravavel por qualquer bug.
    const futuros = ["aguardando_candidato", "em_revisao_dp", "pronto_para_efetivar", "efetivado"];
    for (const estado of futuros) {
      expect([...statusProcesso]).not.toContain(estado);
    }
  });

  it("a situacao e derivada, e pausado NAO e ativo", () => {
    expect(statusProcesso.map(situacaoDoProcesso)).toEqual(["ativo", "pausado", "inativo"]);
    // O ponto da terceira situacao: chamar um processo parado de "Ativo" esconderia exatamente o que
    // o DP precisa ver na lista.
    expect(situacaoDoProcesso("pausado")).not.toBe("ativo");
  });

  it("a tabela nao tem coluna de situacao nem de ativo", () => {
    const colunas = config.columns.map((c) => c.name);
    expect(colunas).toContain("status");
    expect(colunas).not.toContain("situacao");
    expect(colunas).not.toContain("ativo");
  });

  it("o payload de cancelar descarta situacao e motivo", () => {
    // Motivo estruturado NAO existe na V0: uma lista provisoria vira regra definitiva no instante em
    // que o CHECK roda, e renomear valor ja gravado e caro. Entra como vertical propria depois da
    // validacao do DP.
    const dados = cancelarProcessoPayloadSchema.parse({
      versao: 1,
      situacao: "inativo",
      motivoCancelamento: "qualquer_coisa"
    });
    expect(dados).not.toHaveProperty("situacao");
    expect(dados).not.toHaveProperty("motivoCancelamento");
    expect(Object.keys(dados)).toEqual(["versao"]);
  });
});

describe("a V0 e puramente aditiva", () => {
  const config = getTableConfig(admissoesProcessos);

  it("o processo nao tem colaborador_id", () => {
    expect(config.columns.map((c) => c.name)).not.toContain("colaborador_id");
  });

  it("nenhuma FK do processo aponta para colaboradores", () => {
    const destinos = config.foreignKeys.map((fk) => fk.reference().foreignTable);
    expect(destinos).not.toContain(colaboradores);
  });

  it("colaboradores tem a UNIQUE composta que protege as FKs do vinculo", () => {
    // A V0 nao pode ter tocado a tabela. `colaboradores_usuario_id_unico` e indice parcial, nao
    // unique constraint — a lista de uniques da tabela tem de continuar vazia.
    expect(getTableConfig(colaboradores).uniqueConstraints.map((u) => u.name)).toContain(
      "colaboradores_id_empresa_unica"
    );
  });

  it("a migration nova nao altera tabela existente", () => {
    // Enquanto a migration consolidada nao existir, o teste passa por ausencia — e volta a valer no minuto em que ela
    // aparecer. E de proposito: o guarda precisa estar pronto ANTES da migration.
    const dir = join(RAIZ, "db", "migrations");
    const nova = readdirSync(dir).filter((n) => n.startsWith("0048_") && n.endsWith(".sql"));
    for (const arquivo of nova) {
      const sql = readFileSync(join(dir, arquivo), "utf8");
      const alterados = [...sql.matchAll(/ALTER TABLE "([a-z0-9_]+)"/gi)].map((m) => m[1]);
      // A consolidada cria as tabelas novas de admissao/catalogo e acrescenta os campos/unique de
      // turno que o processo usa; nenhuma outra tabela antiga pode entrar no DDL.
      const permitidas = new Set([
        "admissoes_convites",
        "admissoes_processos",
        "admissoes_processos_dependentes",
        "admissoes_processos_ficha",
        "admissoes_processos_historico",
        "admissoes_processos_internos",
        "admissoes_testes",
        "admissoes_testes_historico",
        "funcoes_operacionais",
        "turnos"
      ]);
      expect(
        alterados.filter((t) => !permitidas.has(t ?? "")),
        arquivo
      ).toEqual([]);
    }
  });
});

describe("a origem e o vinculo com o teste", () => {
  const config = getTableConfig(admissoesProcessos);

  it("a FK do teste e composta com a empresa", () => {
    const paraTeste = config.foreignKeys
      .map((fk) => fk.reference())
      .find((r) => r.columns.some((c) => c.name === "teste_id"));
    expect(paraTeste?.foreignColumns.map((c) => c.name).sort()).toEqual(["empresa_id", "id"]);
  });

  it("um teste so pode ter um processo", () => {
    // A garantia de "uma admissao por teste" mora no BANCO, nao no servico: duas transacoes
    // concorrentes passariam pelas duas pre-checagens.
    const uniques = config.uniqueConstraints.map((u) => u.columns.map((c) => c.name).join(","));
    expect(uniques).toContain("teste_id");
  });

  it("o detalhe exige a ORIGEM, e admite processo sem teste e sem nome", () => {
    const internos = {
      versao: 1,
      dataAdmissao: null,
      ctpsNumero: null,
      ctpsSerie: null,
      ctpsUf: null,
      pisPasepNit: null,
      observacoesRh: null,
      exameSituacao: "pendente" as const,
      exameExigeAtencao: true,
      exameAtualizadoPorNome: null,
      exameAtualizadoEm: null
    };
    const base = {
      id: "id",
      origem: "admissao_direta" as const,
      status: "iniciado" as const,
      situacao: "ativo" as const,
      versao: 1,
      // Admissao direta: sem teste e sem nome ate o candidato responder. O DTO precisa admitir isso
      // — inventar identidade para preencher o vazio e exatamente o que a vertical recusou.
      testeId: null,
      nomeCompleto: "Pessoa Sintetica",
      fichaSituacao: null,
      efetivado: false,
      dataEfetivacao: null,
      cpfMascarado: "•••.•••.•••-••",
      funcaoNome: "Balconista",
      turnoEtiqueta: "M",
      turnoRotulo: "Manha",
      turnoHoraInicio: "06:00:00",
      turnoHoraFim: "14:00:00",
      turnoDiasSemana: ["SEGUNDA", "TERCA"],
      // HISTORICO LEGADO: nulo em processo novo, preenchido nos que a V1A criou antes do catalogo.
      jornadaHorario: null,
      internos,
      criadoPorNome: null,
      criadoEm: "2026-09-01T12:00:00.000Z",
      atualizadoPorNome: null,
      atualizadoEm: "2026-09-01T12:00:00.000Z",
      canceladoPorNome: null,
      canceladoEm: null
    };
    const lido = processoDetalheDtoSchema.parse(base);
    // Sem teste, mas COM identidade: e a admissao direta da V1B.
    expect(lido.testeId).toBeNull();
    expect(lido.nomeCompleto).toBe("Pessoa Sintetica");
    // A projecao nunca carrega digito: mascara constante, revelacao e ato auditado a parte.
    expect(lido.cpfMascarado).not.toMatch(/[0-9]/);

    // A ORIGEM, essa, e obrigatoria: e ela que diz se falta caminho de volta ou se ele nunca existiu.
    const { origem, ...semOrigem } = base;
    expect(processoDetalheDtoSchema.safeParse(semOrigem).success).toBe(false);
  });

  it("o exame tem exatamente as seis situacoes confirmadas", () => {
    // `realizado` SAIU: virou ambiguo quando o desfecho ganhou dois lados — nao dizia se a pessoa
    // podia ser admitida. `exige_acao` ficou, para a clinica pedir exame complementar.
    expect([...situacoesExame]).toEqual([
      "pendente",
      "guia_entregue",
      "agendado",
      "aso_apto",
      "aso_nao_apto",
      "exige_acao"
    ]);
    expect([...situacoesExame]).not.toContain("realizado");
    // O alerta e DERIVADO: nao existe coluna, indice nem filtro paralelo de pendencia. So `aso_apto`
    // encerra a atencao do DP.
    expect(situacoesExame.filter(exameExigeAtencao)).toEqual([
      "pendente",
      "guia_entregue",
      "agendado",
      "aso_nao_apto",
      "exige_acao"
    ]);
  });

  it("nada de convite, upload ou storage entrou nesta vertical", () => {
    // O convite depende do aviso juridico aprovado e da politica de documentos. Ate la nao existe
    // token, rota publica, upload nem storage — e emitir link que nao abre esta fora de cogitacao.
    for (const { nome, codigo } of fontesDoProcesso()) {
      for (const proibido of ["token", "convite", "upload", "storage", "multipart"]) {
        expect(codigo.toLowerCase(), `${nome} (${proibido})`).not.toContain(proibido);
      }
    }
  });
});

describe("a trilha e append-only", () => {
  const config = getTableConfig(admissoesProcessosHistorico);

  it("guarda nomes de campo, nunca valores", () => {
    expect(config.columns.map((c) => c.name)).toContain("campos_alterados");
  });

  it("nao tem atualizado_em: nada aqui e alterado depois de gravado", () => {
    expect(config.columns.map((c) => c.name)).not.toContain("atualizado_em");
  });

  it("so as duas acoes que a V0 alcanca", () => {
    const codigo = readFileSync(join(RAIZ, "db", "src", "schema", "app.schema.ts"), "utf8");
    const bloco = codigo.slice(codigo.indexOf("admissoes_processos_historico_acao_check"));
    expect(bloco.slice(0, 160)).toContain("'criado', 'cancelado'");
  });
});

/**
 * ADM-003 V1C — a revelacao do CPF passou a ter botao na tela. A ROTA nao mudou; estas guardas
 * fixam o que a tela agora depende, para que "melhorar" a rota depois nao vaze documento.
 */
describe("revelar CPF do processo continua um ato, e nunca uma URL", () => {
  const controller = fontesDoProcesso().find((f) => f.nome === "processos.controller.ts");

  it("a rota de CPF e POST, e nao existe GET equivalente", () => {
    const codigo = controller?.codigo ?? "";
    // Escrito em pedacos para este arquivo nao ser o unico culpado da propria varredura.
    const rota = '"/api/admissoes/' + 'processos/:id/cpf"';
    const declaracao = codigo.lastIndexOf("app.", codigo.indexOf(rota));
    expect(declaracao, "rota de CPF nao encontrada").toBeGreaterThan(-1);

    // O verbo que precede a rota tem de ser POST: documento nao entra em URL, e um GET ainda o
    // deixaria no log do servidor, no historico do navegador e no `referer`.
    expect(codigo.slice(declaracao, codigo.indexOf(rota))).toContain("app.post(");
    expect([...codigo.matchAll(/app\.get\([^;]*?processos\/:id\/cpf/gsu)]).toHaveLength(0);
  });

  it("nenhuma rota do modulo aceita CPF em caminho ou query", () => {
    for (const { nome, codigo } of fontesDoProcesso()) {
      // Um `:cpf` no path ou um `cpf` lido de querystring poria o documento no log do servidor,
      // no historico do navegador e no referer. A busca da listagem e por NOME, de proposito.
      expect(codigo, `${nome} (path)`).not.toMatch(/"\/api\/admissoes\/processos[^"]*:cpf/u);
      expect(codigo, `${nome} (query)`).not.toMatch(/request\s*\.\s*query[\s\S]{0,80}?\bcpf\b/u);
    }
  });

  it("a revelacao usa a permissao de VISUALIZAR, e nao uma terceira", () => {
    const codigo = controller?.codigo ?? "";
    const bloco = codigo.slice(codigo.indexOf('processos/:id/cpf"'));
    expect(bloco.slice(0, 300)).toContain("admissoes_processos_visualizar");
  });
});
