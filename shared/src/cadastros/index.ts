// Serializacao formulario -> payload dos cadastros (M3/ADR-002): a montagem do contrato
// e regra compartilhada e mora no shared. O front preenche o formulario (strings de input);
// estas funcoes produzem o payload que a API valida com zod. O servidor continua sendo o
// unico com autoridade sobre valores derivados (ex.: preco de venda e recalculado la).
import type { DadosExternos } from "../api/index.js";
import type { RoleUsuario } from "../autenticacao/index.js";

/**
 * PRODUTO SAIU DAQUI (P-04, 12/08/2026). O cadastro de produto tem pagina propria
 * (`pages/produtos/novo.vue` e `[id].vue`) com estado, validacao e payload em
 * `useProdutoFormulario`. Os tipos `ProdutoFiscalForm`/`ProdutoTransformacaoForm`/
 * `ProdutoConversaoForm`, os campos de produto do `CadastroForm`, as funcoes
 * `precoVendaDoFormProduto`/`fiscalDoFormProduto`/`transformacaoDoFormProduto`/
 * `promocoesDoFormProduto` e o ramo `cadastroPayload("produtos")` foram REMOVIDOS: eram a
 * segunda implementacao do payload e do preco de produto, orfas desde que o modal morreu.
 */
export type CadastroForm = {
  nome: string;
  numeroSerie: string;
  // Conta com fundo (D8): o fundo digitado e a lista de quem opera a conta. Vivem no formulario do
  // cadastro porque sao gravados no MESMO salvar — ver cadastroPayload("contas").
  saldoInicial?: string;
  usuariosIds?: string[];
  documento: string;
  dataNascimento: string;
  whatsapp: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  cnpj: string;
  matriculaPrefixo: string;
  fusoHorario: string;
  comprasPrazoRespostaHoras: string;
  email: string;
  senha: string;
  // `""` = papel DESCONHECIDO, e nao "papel padrao". O formulario de edicao e montado da linha da
  // listagem, e a linha pode chegar sem `role` (recorte cross-tenant, pagina de outra fonte, campo
  // que a API pare de devolver). Assumir "usuario_comum" nesse caso REBAIXA o alvo no salvar. O
  // default de criacao continua existindo, mas so em `formCadastroVazio`.
  role: RoleUsuario | "";
  // O operador mexeu nos chips de empresa? Estado EXPLICITO, e nao deduzido: nasce `true` na criacao
  // (`formCadastroVazio`) e `false` ao abrir uma edicao (`formCadastroDeLinha`). Decide se o payload
  // envia `empresaIds` — e portanto se o servidor substitui ou preserva os vinculos.
  empresaIdsTocado: boolean;
  cpf: string;
  sigla: string;
  horaInicio: string;
  horaFim: string;
  /** ADM-003 V1B — turno. Vazio significa "nao informado", e o payload o traduz para `null`. */
  etiquetaTurno: "" | "M" | "T" | "I";
  diasSemanaTurno: string[];
  /** Do item de PATRIMONIO — o unico cadastro deste modal que ainda tem marca. */
  marca: string;
  contaId: string;
  ativo: boolean;
  tipoGrupo: "despesa" | "mercadoria" | "retirada" | "vendas";
  grupoPaiId: string;
  tipoAreaSetor: "area" | "setor";
  // Patrimonio (D2): a tela tem duas entidades (grupo/item), como areas/setores.
  tipoPatrimonio: "grupo" | "item";
  sig: string;
  grupoPatrimonioId: string;
  areaId: string;
  setorPaiId: string;
  setorId: string;
  turnoPadraoId: string;
  colaboradorId: string;
  novoColaborador: boolean;
  novoColaboradorNome: string;
  novoColaboradorCpf: string;
  novoColaboradorSetorId: string;
  novoColaboradorCargoId: string;
  cargoId: string;
  empresaIds: string[];
  tipoPermissao: "cargo" | "setor" | "usuario";
  usuarioId: string;
  regras: Record<string, boolean>;
};

function documentoCadastroEhCpf(documento: string) {
  const digitos = documento.replace(/\D/g, "");
  return digitos.length > 0 && digitos.length <= 11;
}

// converte campo de texto em numero, tratando vazio e nao-numerico (NaN) como null
export function numeroCampoOuNulo(valor: string): number | null {
  if (valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

export const MENSAGEM_PERFIL_ACESSO_INDISPONIVEL =
  "Perfil de acesso deste usuario nao foi carregado. Recarregue a tela antes de editar.";

// Trava de tela para o rebaixamento silencioso: sem papel conhecido nao se salva usuario. Fica no
// `shared`, e nao no componente, porque e a mesma regra que decide o payload — e assim ela e testavel
// sem montar Vue.
export const MENSAGEM_SUBSTITUICAO_SEM_EMPRESA =
  "Marque ao menos uma empresa ou desmarque a substituicao para manter os vinculos atuais.";

export const MENSAGEM_NOVO_USUARIO_SEM_CPF = "Informe o CPF do colaborador.";
export const MENSAGEM_NOVO_USUARIO_SEM_SETOR = "Selecione o setor do colaborador.";
export const MENSAGEM_NOVO_USUARIO_SEM_CARGO = "Selecione o cargo inicial do colaborador.";

export function bloqueioCadastroUsuario(
  tela: string,
  form: Pick<
    CadastroForm,
    | "role"
    | "empresaIds"
    | "empresaIdsTocado"
    | "novoColaborador"
    | "novoColaboradorCpf"
    | "novoColaboradorSetorId"
    | "novoColaboradorCargoId"
  >,
  edicao = false
): string | null {
  if (tela !== "usuarios") return null;
  if (!form.role) return MENSAGEM_PERFIL_ACESSO_INDISPONIVEL;
  // Criar o login e a pessoa operacional e um unico ato. Estes tres campos alimentam a resolucao de
  // permissoes (setor -> cargo -> usuario) e a deduplicacao por CPF; deixar o servidor descobrir a
  // ausencia somente depois do clique produzia uma tela que parecia salvavel, mas nunca concluia.
  if (form.novoColaborador && !form.novoColaboradorCpf.trim()) return MENSAGEM_NOVO_USUARIO_SEM_CPF;
  if (form.novoColaborador && !form.novoColaboradorSetorId) return MENSAGEM_NOVO_USUARIO_SEM_SETOR;
  if (form.novoColaborador && !form.novoColaboradorCargoId) return MENSAGEM_NOVO_USUARIO_SEM_CARGO;
  // Substituicao pedida e nenhuma empresa marcada, na EDICAO: sem esta trava o payload cairia no
  // fallback `[empresaAtiva]` e apagaria os demais vinculos — o mesmo dano que a preservacao evita,
  // so que agora por um caminho que o operador nao percebe (marcar e desmarcar volta a tela ao estado
  // inicial, mas nao volta o `empresaIdsTocado`). Na CRIACAO o fallback e legitimo.
  if (edicao && form.empresaIdsTocado && !form.empresaIds.length) return MENSAGEM_SUBSTITUICAO_SEM_EMPRESA;
  return null;
}

export function cadastroPayload(tela: string, form: CadastroForm, empresaId: string) {
  if (tela === "empresas")
    return {
      nome: form.nome,
      cnpj: form.cnpj || null,
      matriculaPrefixo: form.matriculaPrefixo,
      fusoHorario: form.fusoHorario,
      comprasPrazoRespostaHoras: numeroCampoOuNulo(form.comprasPrazoRespostaHoras)
    };
  // Conta com FUNDO + quem opera (D8). saldoInicial vazio vira 0 (nao undefined): no formulario o
  // campo em branco significa "sem fundo", e mandar undefined faria o servidor MANTER o fundo
  // anterior — o admin que apagasse o campo veria o valor voltar sozinho.
  if (tela === "contas")
    return {
      empresaId,
      nome: form.nome,
      saldoInicial: Number(form.saldoInicial || 0),
      usuariosIds: form.usuariosIds ?? []
    };
  if (tela === "formas_pagamento") return { empresaId, nome: form.nome };
  if (tela === "pdv") return { empresaId, nome: form.nome, contaId: form.contaId, ativo: form.ativo };
  if (tela === "maquininhas")
    return { empresaId, numeroSerie: form.numeroSerie, apelido: form.nome, ativo: form.ativo };
  if (tela === "grupos")
    return {
      empresaId,
      nome: form.nome,
      tipoGrupo: form.tipoGrupo,
      grupoPaiId: form.grupoPaiId || null,
      ativa: form.ativo
    };
  if (tela === "unidades") return { empresaId, nome: form.nome, sigla: form.sigla };
  if (tela === "turnos")
    return {
      empresaId,
      nome: form.nome,
      horaInicio: form.horaInicio,
      horaFim: form.horaFim,
      ativo: form.ativo,
      // O formulario SEMPRE manda os dois: quem edita pela tela ve o valor atual e decide. Vazio vira
      // `null` (limpar), e nao `undefined` — "nao mexer" e para cliente que nem conhece os campos.
      etiqueta: form.etiquetaTurno || null,
      diasSemana: form.diasSemanaTurno.length ? form.diasSemanaTurno : null
    };
  if (tela === "fornecedores")
    return { empresaId, nome: form.nome, documento: form.documento || null, whatsapp: form.whatsapp || null };
  if (tela === "socios_gestores") return { empresaId, nome: form.nome, ativo: form.ativo };
  if (tela === "clientes")
    return {
      empresaId,
      nome: form.nome,
      documento: form.documento || null,
      dataNascimento: documentoCadastroEhCpf(form.documento) ? form.dataNascimento || null : null,
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      cep: form.cep || null,
      rua: form.rua || null,
      numero: form.numero || null,
      complemento: form.complemento || null,
      bairro: form.bairro || null,
      cidade: form.cidade || null,
      estado: form.estado || null
    };
  if (tela === "patrimonio") {
    return form.tipoPatrimonio === "grupo"
      ? { empresaId, sig: form.sig, nome: form.nome }
      : {
          empresaId,
          nome: form.nome,
          marca: form.marca || null,
          grupoPatrimonioId: form.grupoPatrimonioId,
          setorId: form.setorId || null
        };
  }
  if (tela === "areas_setores") {
    return form.tipoAreaSetor === "setor"
      ? { empresaId, nome: form.nome, areaId: form.areaId || null, setorPaiId: form.setorPaiId || null }
      : { empresaId, nome: form.nome };
  }
  if (tela === "usuarios") {
    const payload: Record<string, DadosExternos> = {
      nome: form.nome,
      email: form.email,
      whatsapp: form.whatsapp || null,
      senha: form.senha || undefined,
      // Papel desconhecido NAO vira payload. A tela ja recusa salvar nesse estado
      // (bloqueioCadastroUsuario); aqui e a segunda tranca: omitir o campo faz o servidor manter o
      // papel gravado (usuarios.service.ts: `dados.role ?? undefined`), enquanto mandar
      // "usuario_comum" rebaixaria o alvo.
      ...(form.role ? { role: form.role } : {}),
      // `empresaIds` so viaja quando o operador REALMENTE mexeu nos chips (ou quando e criacao, em
      // que `empresaIdsTocado` nasce true). Omitir faz o servidor PRESERVAR os vinculos gravados.
      //
      // O sinal e explicito, nunca inferido comparando com a lista da API: a listagem e recortada ao
      // escopo da tela, entao "form igual ao que veio" nao significa "nada mudou" — significa apenas
      // "nada mudou naquilo que a tela enxerga". Foi essa inferencia que apagava a empresa B.
      ...(form.empresaIdsTocado
        ? { empresaIds: form.empresaIds.length ? form.empresaIds : [empresaId].filter(Boolean) }
        : {})
    };
    if (form.novoColaborador) {
      payload["novoColaborador"] = {
        empresaId,
        // Uma pessoa, um nome. A antiga tela repetia "Nome" e "Nome do colaborador" e permitia
        // criar login e colaborador com nomes diferentes sem explicar qual apareceria no sistema.
        nome: form.nome,
        cpf: form.novoColaboradorCpf || null,
        setorId: form.novoColaboradorSetorId || null,
        cargoId: form.novoColaboradorCargoId
      };
    } else {
      // Mesma regra de `empresaIds`: colaborador vazio NAO viaja. A listagem recorta `colaboradorId`
      // para `""` quando o colaborador do alvo vive em outra empresa — mandar isso fazia o Zod
      // responder 400 "Requisicao invalida" e tornava a edicao IMPOSSIVEL justamente para o usuario
      // multiempresa. Omitindo, o servidor preserva o vinculo gravado.
      if (form.colaboradorId) payload["colaboradorId"] = form.colaboradorId;
    }
    return payload;
  }
  if (tela === "permissoes") {
    return {
      tipoPermissao: form.tipoPermissao,
      cargoId: form.tipoPermissao === "cargo" ? form.cargoId : undefined,
      setorId: form.tipoPermissao === "setor" ? form.setorId : undefined,
      usuarioId: form.tipoPermissao === "usuario" ? form.usuarioId : undefined,
      regras: form.regras
    };
  }
  if (tela === "colaboradores")
    return {
      empresaId,
      nome: form.nome,
      cpf: form.cpf || null,
      setorId: form.setorId || null,
      turnoPadraoId: form.turnoPadraoId || null,
      cargoId: form.cargoId
    };
  return { empresaId, nome: form.nome, descricao: form.nome };
}
