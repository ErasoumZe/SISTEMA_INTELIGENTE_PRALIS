<script setup lang="ts">
import {
  cpfValido,
  finalidadesSugeridas,
  OPCOES_E5_QUESTOR,
  parentescosSugeridos,
  tiposAnexoAdmissao,
  tiposAnexoAdmissaoObrigatorios,
  tiposAnexoDependente,
  tiposAnexoDependenteObrigatorios,
  type AnexoDependenteDto,
  type AnexoAdmissaoDto,
  type DependentesDto,
  type FichaPublicaDto
} from "@padaria/shared";
import { CABECALHO_DO_CONVITE, tokenDoFragmento } from "~/utils/convite-token";

/**
 * ADM-003 V3/V4 — a ficha do candidato.
 *
 * A UNICA tela do sistema aberta a quem nao tem conta. Por isso ela nao monta `AppWorkspace`, nao
 * tem menu, nao le sessao e nao aparece em `itemPorTela` — se aparecesse, viraria item de menu.
 *
 * O token vive em memoria e so nesta aba. Ele e lido do fragmento e apagado da barra de enderecos
 * logo em seguida: link compartilhado por engano, print de tela e historico do navegador deixam de
 * carregar o segredo. Nao vai para `localStorage`, nao vai para a URL e nao vai para o console.
 */

/**
 * `scrollToTop: false` NAO e preferencia de rolagem — e o que impede o segredo de vazar.
 *
 * O `scrollBehavior` padrao do Nuxt entrega `to.hash` CRU como seletor de elemento. O vue-router,
 * em desenvolvimento, tenta `document.querySelector("#t=<token>")` so para diagnosticar; o `=` e
 * invalido em CSS, aquilo lanca, e o `catch` imprime o SELETOR INTEIRO — ou seja, o token — no
 * console do navegador. Apagar o hash no `onMounted` nao resolve: o aviso sai antes da montagem.
 *
 * Esta e a unica saida sancionada que ataca a causa: o `router.options` do Nuxt sai com `false`
 * ANTES de resolver o hash quando a rota declara isto. Nao silencia console, nao mexe no roteador
 * global e nao tira o token do fragmento.
 */
definePageMeta({ scrollToTop: false });

const { apiUrl } = useApi();

const token = ref("");
const ficha = ref<FichaPublicaDto | null>(null);
const carregando = ref(true);
const salvando = ref(false);
const erro = ref("");
const aviso = ref("");
const buscandoCep = ref(false);
const erroCep = ref("");
const aceite = ref(false);
const etapaAtual = ref(0);
const etapaTentada = ref(false);

const ETAPAS = ["Dados pessoais", "Endereço e contato", "Documentos", "Dependentes"] as const;

// `fetch` direto, como as outras telas publicas do repositorio ja fazem: `credentials: "omit"` e o
// ponto — mandar cookie de sessao numa rota de token faria o DP conseguir o que o candidato deveria,
// e mascararia falha de token em teste.
async function chamar<T>(metodo: string, rota: string, corpo?: unknown): Promise<T | null> {
  const resposta = await fetch(`${apiUrl}${rota}`, {
    method: metodo,
    credentials: "omit",
    headers: {
      [CABECALHO_DO_CONVITE]: token.value,
      ...(corpo === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo)
  });
  if (resposta.status === 204) return null;
  const corpoResposta = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const titulo = (corpoResposta as { title?: string } | null)?.title;
    throw new Error(titulo ?? "Nao foi possivel falar com o servidor.");
  }
  return (corpoResposta as { data: T }).data;
}

const formulario = reactive<Record<string, string>>({});
/** E5: código IBGE do município do endereço, vindo do ViaCEP. Não é campo digitado. */
const municipioIbge = ref("");

const CAMPOS = [
  { chave: "nascimento", rotulo: "Data de nascimento *", tipo: "date" },
  { chave: "sexo", rotulo: "Sexo *", tipo: "text" },
  { chave: "estadoCivil", rotulo: "Estado civil *", tipo: "text" },
  { chave: "racaCor", rotulo: "Raça/cor *", tipo: "text" },
  { chave: "nacionalidade", rotulo: "Nacionalidade *", tipo: "text" },
  // E5 (Questor): só aparece com nacionalidade "Estrangeira" — ver `camposDaEtapa`.
  { chave: "nacionalidadeEspecifica", rotulo: "Qual é a sua nacionalidade? *", tipo: "text" },
  { chave: "naturalidade", rotulo: "Naturalidade *", tipo: "text" },
  { chave: "naturalidadeUf", rotulo: "UF onde nasceu", tipo: "text" },
  { chave: "grauInstrucao", rotulo: "Escolaridade", tipo: "text" },
  { chave: "primeiroEmprego", rotulo: "É seu primeiro emprego com carteira assinada?", tipo: "text" },
  { chave: "recebeSeguroDesemprego", rotulo: "Está recebendo seguro-desemprego?", tipo: "text" },
  { chave: "nomeMae", rotulo: "Nome da mãe *", tipo: "text" },
  { chave: "nomePai", rotulo: "Nome do pai", tipo: "text" },
  { chave: "nomeSocial", rotulo: "Nome social", tipo: "text" },
  { chave: "cep", rotulo: "CEP *", tipo: "text" },
  { chave: "logradouro", rotulo: "Logradouro *", tipo: "text" },
  { chave: "numero", rotulo: "Número *", tipo: "text" },
  { chave: "complemento", rotulo: "Complemento", tipo: "text" },
  { chave: "bairro", rotulo: "Bairro *", tipo: "text" },
  { chave: "municipio", rotulo: "Município *", tipo: "text" },
  { chave: "uf", rotulo: "UF *", tipo: "text" },
  { chave: "telefone", rotulo: "Telefone *", tipo: "text" },
  { chave: "email", rotulo: "E-mail", tipo: "email" }
] as const;

const DOCUMENTOS = [
  ["rg", "RG"],
  ["cpf", "CPF"],
  ["titulo_eleitor", "Título de eleitor"],
  ["certidao_nascimento_casamento", "Certidão de nascimento/casamento"],
  ["comprovante_residencia", "Comprovante de residência"],
  ["foto_3x4", "Foto 3x4"],
  ["ctps_digital", "CTPS digital"],
  ["pis_pasep_nit", "PIS/PASEP/NIT"],
  ["certificado_reservista", "Certificado reservista"],
  ["comprovante_escolaridade", "Comprovante de escolaridade"],
  ["certificados_profissionais", "Certificados profissionais"],
  ["aso_admissional", "ASO admissional"]
] as const satisfies readonly [(typeof tiposAnexoAdmissao)[number], string][];

const DOCUMENTOS_DEPENDENTE = [
  ["certidao_nascimento_rg", "Certidão de nascimento ou RG"],
  ["cpf", "CPF"],
  ["cartao_vacina", "Cartão de vacina"],
  ["comprovante_escolaridade", "Comprovante de escolaridade"]
] as const satisfies readonly [(typeof tiposAnexoDependente)[number], string][];

const DOCUMENTOS_OBRIGATORIOS = new Set<string>(tiposAnexoAdmissaoObrigatorios);
const DOCUMENTOS_DEPENDENTE_OBRIGATORIOS = new Set<string>(tiposAnexoDependenteObrigatorios);

const anexos = ref<AnexoAdmissaoDto[]>([]);
const anexoEmProcessamento = ref<string | null>(null);
const erroAnexos = ref("");
const previewsAnexos = reactive<Record<string, string>>({});

const CHAVES_POR_ETAPA = [
  new Set([
    "nascimento",
    "sexo",
    "estadoCivil",
    "racaCor",
    "nacionalidade",
    "nacionalidadeEspecifica",
    "naturalidade",
    "naturalidadeUf",
    "grauInstrucao",
    "nomeMae",
    "nomePai",
    "nomeSocial",
    "primeiroEmprego",
    "recebeSeguroDesemprego"
  ]),
  new Set(["cep", "logradouro", "numero", "complemento", "bairro", "municipio", "uf", "telefone", "email"]),
  new Set<string>(),
  new Set<string>()
] as const;

const CAMPOS_OBRIGATORIOS = new Set([
  "nascimento",
  "sexo",
  "estadoCivil",
  "racaCor",
  "nacionalidade",
  "naturalidade",
  "nomeMae",
  "cep",
  "logradouro",
  "numero",
  "bairro",
  "municipio",
  "uf",
  "telefone"
]);

const camposDaEtapa = computed(() => {
  const chaves = CHAVES_POR_ETAPA[etapaAtual.value] ?? new Set<string>();
  return CAMPOS.filter(
    (campo) =>
      chaves.has(campo.chave) &&
      (campo.chave !== "nacionalidadeEspecifica" || formulario.nacionalidade === "Estrangeira")
  );
});
const OPCOES_ENUM = {
  sexo: ["Masculino", "Feminino"],
  racaCor: ["Branca", "Preta", "Parda", "Amarela", "Indígena", "Não declarado"],
  estadoCivil: ["Solteiro(a)", "Casado(a)", "Divorciado(a)", "Separado(a) judicialmente", "Viúvo(a)", "União estável"],
  nacionalidade: ["Brasileira", "Brasileira naturalizada", "Estrangeira"]
} as const;

/** E5 (Questor): listas vindas do contrato compartilhado — a tela não redeclara opções. */
const OPCOES_E5: Record<string, readonly string[]> = {
  nacionalidadeEspecifica: OPCOES_E5_QUESTOR.nacionalidadeEstrangeira,
  naturalidadeUf: OPCOES_E5_QUESTOR.uf,
  grauInstrucao: OPCOES_E5_QUESTOR.grauInstrucao,
  primeiroEmprego: OPCOES_E5_QUESTOR.simNao,
  recebeSeguroDesemprego: OPCOES_E5_QUESTOR.simNao
};
/** Perguntas Sim/Não: na tela são texto, na API são booleano. */
const CAMPOS_SIM_NAO = new Set(["primeiroEmprego", "recebeSeguroDesemprego"]);

function opcoesDoCampo(chave: string): readonly string[] | undefined {
  return OPCOES_ENUM[chave as keyof typeof OPCOES_ENUM] ?? OPCOES_E5[chave];
}

function campoEnderecoAutomatico(chave: string): boolean {
  return ["logradouro", "bairro", "municipio", "uf"].includes(chave);
}

type RespostaViaCep = {
  erro?: boolean;
  /** Código IBGE do município — guardado para o Questor (conversão depende da Q5). */
  ibge?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
};

let consultaCep = 0;
let temporizadorCep: ReturnType<typeof setTimeout> | undefined;

async function buscarEnderecoPorCep(cep: string) {
  const consultaAtual = ++consultaCep;
  buscandoCep.value = true;
  erroCep.value = "";
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!resposta.ok) throw new Error("Não foi possível consultar o CEP.");
    const dados = (await resposta.json()) as RespostaViaCep;
    if (consultaAtual !== consultaCep || cep !== (formulario.cep ?? "").replace(/\D/g, "")) return;
    if (dados.erro) throw new Error("CEP não encontrado.");
    formulario.logradouro = dados.logradouro ?? "";
    formulario.bairro = dados.bairro ?? "";
    formulario.municipio = dados.localidade ?? "";
    formulario.uf = dados.uf ?? "";
    municipioIbge.value = /^[0-9]{7}$/u.test(dados.ibge ?? "") ? (dados.ibge ?? "") : "";
  } catch (falha) {
    if (consultaAtual !== consultaCep) return;
    erroCep.value = falha instanceof Error ? falha.message : "Não foi possível consultar o CEP.";
    formulario.logradouro = "";
    formulario.bairro = "";
    formulario.municipio = "";
    formulario.uf = "";
    municipioIbge.value = "";
  } finally {
    if (consultaAtual === consultaCep) buscandoCep.value = false;
  }
}

watch(
  () => formulario.cep,
  (valor) => {
    if (temporizadorCep) clearTimeout(temporizadorCep);
    erroCep.value = "";
    const cep = (valor ?? "").replace(/\D/g, "");
    if (cep.length !== 8) {
      consultaCep += 1;
      buscandoCep.value = false;
      formulario.logradouro = "";
      formulario.bairro = "";
      formulario.municipio = "";
      formulario.uf = "";
      municipioIbge.value = "";
      return;
    }
    temporizadorCep = setTimeout(() => void buscarEnderecoPorCep(cep), 250);
  }
);

onUnmounted(() => {
  if (temporizadorCep) clearTimeout(temporizadorCep);
  consultaCep += 1;
});

function campoObrigatorio(chave: string): boolean {
  return CAMPOS_OBRIGATORIOS.has(chave);
}

function mensagemDoCampo(chave: string): string {
  if (!etapaTentada.value || !campoObrigatorio(chave) || formulario[chave]?.trim()) return "";
  return "Preencha este campo para continuar.";
}

function avancarEtapa() {
  etapaTentada.value = true;
  if (etapaAtual.value === 2 && anexosObrigatoriosFaltantes.value.length > 0) {
    erro.value = "Envie o CPF e o comprovante de residência antes de continuar.";
    return;
  }
  const faltando = camposDaEtapa.value.filter(
    (campo) => campoObrigatorio(campo.chave) && !formulario[campo.chave]?.trim()
  );
  if (faltando.length > 0) {
    erro.value = "Preencha os campos obrigatórios desta etapa antes de continuar.";
    return;
  }
  erro.value = "";
  etapaTentada.value = false;
  etapaAtual.value = Math.min(etapaAtual.value + 1, ETAPAS.length - 1);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function voltarEtapa() {
  etapaTentada.value = false;
  erro.value = "";
  etapaAtual.value = Math.max(etapaAtual.value - 1, 0);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function preencher(dados: FichaPublicaDto) {
  const campos = dados.campos as Record<string, string | boolean | null>;
  for (const { chave } of CAMPOS) {
    const valor = campos[chave];
    formulario[chave] = typeof valor === "boolean" ? (valor ? "Sim" : "Não") : (valor ?? "");
  }
  municipioIbge.value = typeof campos["municipioIbge"] === "string" ? campos["municipioIbge"] : "";
  // Convites antigos podem vir de uma API anterior à inclusão dos anexos.
  // Nesse caso, a ausência do campo significa simplesmente que ainda não há arquivos.
  const anexosRecebidos = Array.isArray(dados.anexos) ? dados.anexos : [];
  anexos.value = anexosRecebidos;
  for (const anexo of anexosRecebidos) void carregarPreviewAnexo(anexo);
}

function anexoDoTipo(tipo: string | undefined) {
  return anexos.value.find((anexo) => anexo.tipo === tipo);
}

function documentoObrigatorio(tipo: string): boolean {
  return DOCUMENTOS_OBRIGATORIOS.has(tipo);
}

function documentoDependenteObrigatorio(tipo: string): boolean {
  return DOCUMENTOS_DEPENDENTE_OBRIGATORIOS.has(tipo);
}

function tamanhoDoAnexo(tamanho: number): string {
  if (tamanho < 1024 * 1024) return `${Math.max(1, Math.round(tamanho / 1024))} KB`;
  return `${(tamanho / (1024 * 1024)).toFixed(1)} MB`;
}

async function carregarPreviewAnexo(anexo: AnexoAdmissaoDto) {
  if (!anexo.mimeType.startsWith("image/") || previewsAnexos[anexo.id]) return;
  const resposta = await fetch(`${apiUrl}/api/admissao/anexos/${anexo.id}`, {
    headers: { [CABECALHO_DO_CONVITE]: token.value }
  });
  if (resposta.ok) previewsAnexos[anexo.id] = URL.createObjectURL(await resposta.blob());
}

async function selecionarAnexo(tipo: string, evento: Event) {
  const tipoSeguro = tiposAnexoAdmissao.find((opcao) => opcao === tipo);
  if (!tipoSeguro) return;
  const input = evento.target as HTMLInputElement;
  const arquivo = input.files?.[0];
  input.value = "";
  if (!arquivo) return;
  if (arquivo.size > 10 * 1024 * 1024) {
    erroAnexos.value = "Cada arquivo pode ter no máximo 10 MB.";
    return;
  }
  anexoEmProcessamento.value = tipoSeguro;
  erroAnexos.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", tipoSeguro);
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/admissao/anexos`, {
      method: "POST",
      headers: { [CABECALHO_DO_CONVITE]: token.value },
      body: corpo
    });
    const corpoResposta = (await resposta.json().catch(() => null)) as {
      data?: AnexoAdmissaoDto;
      title?: string;
    } | null;
    if (!resposta.ok || !corpoResposta?.data)
      throw new Error(corpoResposta?.title ?? "Não foi possível enviar o documento.");
    const anterior = anexoDoTipo(tipoSeguro);
    const previewAnterior = anterior ? previewsAnexos[anterior.id] : undefined;
    if (previewAnterior) URL.revokeObjectURL(previewAnterior);
    anexos.value = [...anexos.value.filter((anexo) => anexo.tipo !== tipoSeguro), corpoResposta.data];
    await carregarPreviewAnexo(corpoResposta.data);
  } catch (falha) {
    erroAnexos.value = falha instanceof Error ? falha.message : "Não foi possível enviar o documento.";
  } finally {
    anexoEmProcessamento.value = null;
  }
}

async function removerAnexo(anexo: AnexoAdmissaoDto) {
  anexoEmProcessamento.value = anexo.tipo;
  erroAnexos.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/admissao/anexos/${anexo.id}`, {
      method: "DELETE",
      headers: { [CABECALHO_DO_CONVITE]: token.value }
    });
    if (!resposta.ok) {
      const corpoResposta = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(corpoResposta?.title ?? "Não foi possível remover o documento.");
    }
    const preview = previewsAnexos[anexo.id];
    if (preview) URL.revokeObjectURL(preview);
    delete previewsAnexos[anexo.id];
    anexos.value = anexos.value.filter((atual) => atual.id !== anexo.id);
  } catch (falha) {
    erroAnexos.value = falha instanceof Error ? falha.message : "Não foi possível remover o documento.";
  } finally {
    anexoEmProcessamento.value = null;
  }
}

const somenteLeitura = computed(() => ficha.value?.situacao === "enviada" || ficha.value?.situacao === "aprovada");

function corpoDaFicha() {
  const campos: Record<string, string | boolean> = {};
  for (const { chave } of CAMPOS) {
    const valor = formulario[chave]?.trim() ?? "";
    if (!valor) continue;
    if (chave === "nacionalidadeEspecifica" && formulario.nacionalidade !== "Estrangeira") continue;
    campos[chave] = CAMPOS_SIM_NAO.has(chave) ? valor === "Sim" : valor;
  }
  if (municipioIbge.value) campos.municipioIbge = municipioIbge.value;
  return campos;
}

// --- Dependentes (V4) ---------------------------------------------------------------------------
//
// A declaracao tem TRES estados, e a tela precisa mostrar os tres: `null` e "ainda nao respondeu",
// e nao "tem dependentes". Quem apaga o ultimo dependente volta para `null` de proposito — apagar
// nao e declarar, e o servidor devolve esse `null` para a pessoa responder de novo, conscientemente.
//
// O valor local so vai para o servidor junto com o rascunho ou com o envio. As rotas de dependente,
// essas sim, devolvem a declaracao ja gravada, e o que elas devolvem manda: cadastrar alguem
// desmarca "nao tenho" no servidor, e a tela precisa refletir isso sem discutir.

type LinhaDependente = {
  chave: string;
  /** `null` enquanto a linha existe so na tela. */
  id: string | null;
  nomeCompleto: string;
  nascimento: string;
  parentesco: string;
  cpf: string;
  finalidades: string[];
  // E5 (Questor) — opcionais; "" = não respondido.
  sexo: string;
  estadoCivil: string;
  grauInstrucao: string;
  nacionalidade: string;
  anexos: AnexoDependenteDto[];
  documentosAbertos: boolean;
  /** Assinatura do que o servidor tem. Vazia numa linha nova, que por isso ja nasce por gravar. */
  gravado: string;
};

const PARENTESCOS = [...parentescosSugeridos];
/** E5 (Questor): campos comuns do dependente. Fumo e álcool (saúde) não são coletados — Q11. */
const CAMPOS_E5_DEPENDENTE = [
  { chave: "sexo", rotulo: "Sexo", opcoes: OPCOES_E5_QUESTOR.sexo },
  { chave: "estadoCivil", rotulo: "Estado civil", opcoes: OPCOES_E5_QUESTOR.estadoCivil },
  { chave: "grauInstrucao", rotulo: "Escolaridade", opcoes: OPCOES_E5_QUESTOR.grauInstrucao },
  { chave: "nacionalidade", rotulo: "Nacionalidade", opcoes: OPCOES_E5_QUESTOR.nacionalidade }
] as const;
const FINALIDADES = [...finalidadesSugeridas];

const declaracao = ref<boolean | null>(null);
const dependentes = ref<LinhaDependente[]>([]);
const previewsAnexosDependentes = reactive<Record<string, string>>({});
const salvandoDependente = ref("");
const botaoAdicionar = ref<{ $el?: HTMLElement } | null>(null);
/** Destino do foco quando o ultimo dependente sai e a secao inteira some. Ver `devolverOFoco`. */
const grupoDeclaracao = ref<{ $el?: HTMLElement } | null>(null);

let sequencia = 0;

function assinatura(linha: LinhaDependente): string {
  return JSON.stringify([
    linha.nomeCompleto.trim(),
    linha.nascimento,
    linha.parentesco.trim(),
    linha.cpf.trim(),
    [...linha.finalidades].sort(),
    linha.sexo,
    linha.estadoCivil,
    linha.grauInstrucao,
    linha.nacionalidade
  ]);
}

function porGravar(linha: LinhaDependente): boolean {
  return assinatura(linha) !== linha.gravado;
}

/** O erro que a pessoa ve ANTES de o servidor responder. O servidor e o banco repetem a conta. */
function erroDoCpf(linha: LinhaDependente): string {
  const valor = linha.cpf.trim();
  if (valor === "") return "";
  return cpfValido(valor) ? "" : "CPF inválido — confira os números.";
}

/**
 * O texto do botao muda quando a linha passa a existir no servidor. O `aria-label` e montado a
 * partir DAQUI, e nao com um texto proprio: WCAG 2.5.3 exige que o nome acessivel contenha o
 * rotulo visivel. Antes o botao mostrava "Salvar alteracoes" e o leitor de tela ouvia "Salvar
 * dependente 1" — quem usa comando de voz dizia o que via e nada acontecia.
 */
function rotuloSalvar(linha: LinhaDependente): string {
  return linha.id ? "Salvar alterações" : "Salvar dependente";
}

function erroDaLinha(linha: LinhaDependente): string {
  if (linha.nomeCompleto.trim() === "") return "Informe o nome do dependente.";
  if (!linha.nascimento) return "Informe a data de nascimento.";
  if (linha.parentesco.trim() === "") return "Informe o parentesco.";
  return erroDoCpf(linha);
}

function anexoDependenteDoTipo(linha: LinhaDependente, tipo: string) {
  return linha.anexos.find((anexo) => anexo.tipo === tipo);
}

function chavePreviewDependente(linha: LinhaDependente, anexo: AnexoDependenteDto): string {
  return `${linha.id}:${anexo.id}`;
}

async function carregarPreviewAnexoDependente(linha: LinhaDependente, anexo: AnexoDependenteDto) {
  if (!linha.id || !anexo.mimeType.startsWith("image/")) return;
  const chave = chavePreviewDependente(linha, anexo);
  if (previewsAnexosDependentes[chave]) return;
  const resposta = await fetch(`${apiUrl}/api/admissao/dependentes/${linha.id}/anexos/${anexo.id}`, {
    headers: { [CABECALHO_DO_CONVITE]: token.value }
  });
  if (resposta.ok) previewsAnexosDependentes[chave] = URL.createObjectURL(await resposta.blob());
}

async function selecionarAnexoDependente(linha: LinhaDependente, tipo: string, evento: Event) {
  const tipoSeguro = tiposAnexoDependente.find((opcao) => opcao === tipo);
  const input = evento.target as HTMLInputElement;
  const arquivo = input.files?.[0];
  input.value = "";
  if (!tipoSeguro || !arquivo) return;
  if (!linha.id) {
    erro.value = "Salve o dependente antes de enviar os documentos.";
    return;
  }
  if (arquivo.size > 10 * 1024 * 1024) {
    erro.value = "Cada arquivo pode ter no máximo 10 MB.";
    return;
  }
  salvandoDependente.value = linha.chave;
  erro.value = "";
  try {
    const corpo = new FormData();
    corpo.append("tipo", tipoSeguro);
    corpo.append("arquivo", arquivo);
    const resposta = await fetch(`${apiUrl}/api/admissao/dependentes/${linha.id}/anexos`, {
      method: "POST",
      headers: { [CABECALHO_DO_CONVITE]: token.value },
      body: corpo
    });
    const respostaJson = (await resposta.json().catch(() => null)) as {
      data?: AnexoDependenteDto;
      title?: string;
    } | null;
    if (!resposta.ok || !respostaJson?.data)
      throw new Error(respostaJson?.title ?? "Não foi possível enviar o documento.");
    const anterior = anexoDependenteDoTipo(linha, tipoSeguro);
    if (anterior) {
      const chave = chavePreviewDependente(linha, anterior);
      if (previewsAnexosDependentes[chave]) URL.revokeObjectURL(previewsAnexosDependentes[chave]);
      delete previewsAnexosDependentes[chave];
    }
    linha.anexos = [...linha.anexos.filter((anexo) => anexo.tipo !== tipoSeguro), respostaJson.data];
    await carregarPreviewAnexoDependente(linha, respostaJson.data);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível enviar o documento.";
  } finally {
    salvandoDependente.value = "";
  }
}

async function removerAnexoDependente(linha: LinhaDependente, anexo: AnexoDependenteDto) {
  if (!linha.id) return;
  salvandoDependente.value = linha.chave;
  erro.value = "";
  try {
    const resposta = await fetch(`${apiUrl}/api/admissao/dependentes/${linha.id}/anexos/${anexo.id}`, {
      method: "DELETE",
      headers: { [CABECALHO_DO_CONVITE]: token.value }
    });
    if (!resposta.ok) {
      const corpo = (await resposta.json().catch(() => null)) as { title?: string } | null;
      throw new Error(corpo?.title ?? "Não foi possível remover o documento.");
    }
    const chave = chavePreviewDependente(linha, anexo);
    if (previewsAnexosDependentes[chave]) URL.revokeObjectURL(previewsAnexosDependentes[chave]);
    delete previewsAnexosDependentes[chave];
    linha.anexos = linha.anexos.filter((atual) => atual.id !== anexo.id);
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover o documento.";
  } finally {
    salvandoDependente.value = "";
  }
}

function aplicarDependentes(dados: DependentesDto) {
  if (ficha.value) ficha.value.versao = dados.versao;
  declaracao.value = dados.semDependentes;
  dependentes.value = dados.itens.map((item) => {
    const linha: LinhaDependente = {
      chave: item.id,
      id: item.id,
      nomeCompleto: item.nomeCompleto,
      nascimento: item.nascimento,
      parentesco: item.parentesco,
      cpf: item.cpf ?? "",
      finalidades: [...item.finalidades],
      sexo: item.sexo ?? "",
      estadoCivil: item.estadoCivil ?? "",
      grauInstrucao: item.grauInstrucao ?? "",
      nacionalidade: item.nacionalidade ?? "",
      anexos: item.anexos ?? [],
      documentosAbertos: false,
      gravado: ""
    };
    linha.gravado = assinatura(linha);
    return linha;
  });
  for (const linha of dependentes.value) {
    for (const anexo of linha.anexos) void carregarPreviewAnexoDependente(linha, anexo);
  }
}

function adicionarDependente() {
  sequencia += 1;
  dependentes.value.push({
    chave: `nova-${sequencia}`,
    id: null,
    nomeCompleto: "",
    nascimento: "",
    parentesco: "",
    cpf: "",
    finalidades: [],
    sexo: "",
    estadoCivil: "",
    grauInstrucao: "",
    nacionalidade: "",
    anexos: [],
    documentosAbertos: false,
    gravado: ""
  });
  // Marcar "tenho dependentes" e a consequencia obvia de comecar a cadastrar um; o servidor grava
  // isso sozinho no primeiro POST, e antecipar aqui evita a tela piscar entre os dois estados.
  declaracao.value = false;
}

async function salvarDependente(linha: LinhaDependente) {
  if (salvandoDependente.value || erroDaLinha(linha)) return;
  salvandoDependente.value = linha.chave;
  erro.value = "";
  aviso.value = "";
  try {
    const corpo = {
      nomeCompleto: linha.nomeCompleto.trim(),
      nascimento: linha.nascimento,
      parentesco: linha.parentesco.trim(),
      cpf: linha.cpf.trim(),
      finalidades: linha.finalidades,
      sexo: linha.sexo || null,
      estadoCivil: linha.estadoCivil || null,
      grauInstrucao: linha.grauInstrucao || null,
      nacionalidade: linha.nacionalidade || null
    };
    const dados = linha.id
      ? await chamar<DependentesDto>("PUT", `/api/admissao/dependentes/${linha.id}`, corpo)
      : await chamar<DependentesDto>("POST", "/api/admissao/dependentes", corpo);
    if (dados) aplicarDependentes(dados);
    aviso.value = "Dependente salvo.";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar o dependente.";
  } finally {
    salvandoDependente.value = "";
  }
}

async function removerDependente(linha: LinhaDependente) {
  if (salvandoDependente.value) return;
  // Linha que nunca foi gravada some sem ida ao servidor: nao ha o que apagar la.
  if (!linha.id) {
    dependentes.value = dependentes.value.filter((atual) => atual.chave !== linha.chave);
    await devolverOFoco();
    return;
  }
  salvandoDependente.value = linha.chave;
  erro.value = "";
  aviso.value = "";
  try {
    const dados = await chamar<DependentesDto>("DELETE", `/api/admissao/dependentes/${linha.id}`);
    if (dados) aplicarDependentes(dados);
    aviso.value = "Dependente removido.";
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível remover o dependente.";
  } finally {
    salvandoDependente.value = "";
    await devolverOFoco();
  }
}

/**
 * Depois de remover, o foco do teclado ficaria num botao que deixou de existir — e o navegador o
 * devolve para o `body`, jogando quem usa teclado ou leitor de tela para o comeco da pagina.
 *
 * Sao DOIS destinos, porque sao dois desfechos. Removendo um dependente entre outros, o botao de
 * adicionar continua na tela e recebe o foco. Removendo o ULTIMO, o servidor devolve a declaracao
 * para `null`, a secao inteira desaparece — e com ela o botao de adicionar. Ate aqui o `focus()`
 * virava no-op silencioso e o foco caia no corpo da pagina.
 *
 * Nesse caso o destino certo e a PERGUNTA que voltou a ficar sem resposta: focar o grupo de radios
 * leva a pessoa exatamente para o que ela precisa responder de novo, e o leitor de tela anuncia o
 * rotulo do grupo, que e como ela descobre que o estado mudou.
 *
 * O `v-radio-group` do Vuetify nao expoe `focus()` — nem ele, nem `VInput`, nem `VRadio`. O que da
 * para alcancar e o `input[type=radio]` de dentro, pelo `$el` do grupo.
 */
async function devolverOFoco() {
  await nextTick();
  const adicionar = botaoAdicionar.value?.$el;
  if (adicionar) {
    adicionar.focus();
    return;
  }
  grupoDeclaracao.value?.$el?.querySelector<HTMLElement>('input[type="radio"]')?.focus();
}

async function carregarDependentes() {
  const dados = await chamar<DependentesDto>("GET", "/api/admissao/dependentes");
  if (dados) aplicarDependentes(dados);
}

const temDependentesGravados = computed(() => dependentes.value.some((linha) => linha.id !== null));
const dependentesPorGravar = computed(() => dependentes.value.some(porGravar));
const camposObrigatoriosCompletos = computed(() =>
  [...CAMPOS_OBRIGATORIOS].every((chave) => formulario[chave]?.trim())
);
const anexosObrigatoriosFaltantes = computed(() => tiposAnexoAdmissaoObrigatorios.filter((tipo) => !anexoDoTipo(tipo)));
const dependentesAnexosObrigatoriosCompletos = computed(
  () =>
    declaracao.value !== false ||
    dependentes.value.every(
      (linha) =>
        linha.id !== null &&
        tiposAnexoDependenteObrigatorios.every((tipo) => linha.anexos.some((anexo) => anexo.tipo === tipo))
    )
);
const podeEnviar = computed(
  () =>
    aceite.value &&
    declaracao.value !== null &&
    camposObrigatoriosCompletos.value &&
    anexosObrigatoriosFaltantes.value.length === 0 &&
    dependentesAnexosObrigatoriosCompletos.value &&
    !dependentesPorGravar.value
);

async function carregar() {
  carregando.value = true;
  erro.value = "";
  try {
    const dados = await chamar<FichaPublicaDto>("GET", "/api/admissao/ficha");
    if (dados) {
      ficha.value = dados;
      preencher(dados);
      aceite.value = dados.avisoAceitoEm !== null;
      declaracao.value = dados.semDependentes;
      await carregarDependentes();
    }
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Nao foi possivel abrir o formulario.";
  } finally {
    carregando.value = false;
  }
}

async function salvarRascunho() {
  if (!ficha.value || salvando.value) return;
  salvando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    await chamar("PUT", "/api/admissao/ficha", {
      versao: ficha.value.versao,
      semDependentes: declaracao.value,
      ...corpoDaFicha()
    });
    aviso.value = "Rascunho salvo. Você pode voltar depois pelo mesmo link.";
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível salvar.";
  } finally {
    salvando.value = false;
  }
}

async function enviar() {
  if (!ficha.value || salvando.value || declaracao.value === null) return;
  salvando.value = true;
  erro.value = "";
  aviso.value = "";
  try {
    await chamar("POST", "/api/admissao/ficha/enviar", {
      versao: ficha.value.versao,
      semDependentes: declaracao.value,
      avisoPrivacidadeVersao: ficha.value.avisoVersaoVigente,
      ...corpoDaFicha()
    });
    aviso.value = "Ficha enviada. O RH vai conferir e falar com você.";
    await carregar();
  } catch (falha) {
    erro.value = falha instanceof Error ? falha.message : "Não foi possível enviar.";
  } finally {
    salvando.value = false;
  }
}

onMounted(async () => {
  token.value = tokenDoFragmento(window.location.hash);
  // Tira o segredo da barra de endereços e do histórico, sem navegar.
  if (token.value) history.replaceState(null, "", window.location.pathname);
  if (!token.value) {
    erro.value = "Link inválido. Peça um novo ao RH.";
    carregando.value = false;
    return;
  }
  await carregar();
});
</script>

<template>
  <v-main class="min-h-screen panel-bg d-flex justify-center pa-4">
    <div class="ficha">
      <header class="ficha__cabecalho">
        <h1 class="ficha__titulo">Cadastro de admissão</h1>
        <p v-if="ficha" class="ficha__sub">
          {{ ficha.cabecalho.empresaNome }}
          <span v-if="ficha.cabecalho.nomeCompleto"> · {{ ficha.cabecalho.nomeCompleto }}</span>
        </p>
      </header>

      <v-alert v-if="erro" type="error" variant="tonal" density="compact" class="mb-4">{{ erro }}</v-alert>
      <v-alert v-if="aviso" type="success" variant="tonal" density="compact" class="mb-4">{{ aviso }}</v-alert>

      <p v-if="carregando" class="ficha__estado">Carregando o formulário…</p>

      <template v-else-if="ficha">
        <v-alert
          v-if="ficha.situacao === 'devolvida' && ficha.revisaoPendencias"
          type="warning"
          variant="tonal"
          density="compact"
          class="mb-4"
        >
          <strong>O RH pediu correções.</strong> {{ ficha.revisaoPendencias }}
        </v-alert>

        <v-alert v-if="somenteLeitura" type="info" variant="tonal" density="compact" class="mb-4">
          Sua ficha já foi enviada e está em análise. Não é possível editar agora.
        </v-alert>

        <section class="ficha__secao">
          <h2>Confira os dados do RH</h2>
          <dl class="ficha__conferencia">
            <div>
              <dt>Função</dt>
              <dd>{{ ficha.cabecalho.funcaoNome ?? "—" }}</dd>
            </div>
            <div>
              <dt>Turno</dt>
              <dd>{{ ficha.cabecalho.turnoRotulo ?? "—" }}</dd>
            </div>
            <div>
              <dt>Data de admissão</dt>
              <dd>{{ ficha.cabecalho.dataAdmissao ?? "—" }}</dd>
            </div>
          </dl>
          <p class="ficha__nota">
            Se algo aqui estiver errado, fale com o RH antes de enviar — estes campos não são editados por você.
          </p>
        </section>

        <form class="ficha__secao" @submit.prevent="enviar">
          <nav class="ficha__etapas" aria-label="Etapas da ficha">
            <button
              v-for="(nome, indice) in ETAPAS"
              :key="nome"
              type="button"
              :class="{ ativo: etapaAtual === indice, concluida: etapaAtual > indice }"
              :disabled="indice > etapaAtual"
              @click="indice < etapaAtual && (etapaAtual = indice)"
            >
              <span>{{ indice + 1 }}</span
              >{{ nome }}
            </button>
          </nav>

          <section v-if="etapaAtual < 3" class="ficha__etapa" :aria-labelledby="`titulo-etapa-${etapaAtual}`">
            <div class="ficha__etapa-cabecalho">
              <p class="ficha__etapa-contador">Etapa {{ etapaAtual + 1 }} de {{ ETAPAS.length }}</p>
              <h2 :id="`titulo-etapa-${etapaAtual}`">{{ ETAPAS[etapaAtual] }}</h2>
            </div>
            <p v-if="etapaAtual === 2" class="ficha__nota">
              Envie as fotos ou arquivos dos documentos solicitados. CPF e comprovante de residência são obrigatórios.
            </p>
            <div v-if="etapaAtual === 2" class="ficha__documentos">
              <article v-for="[tipo, rotulo] in DOCUMENTOS" :key="tipo" class="ficha__documento">
                <div class="ficha__documento-cabecalho">
                  <div>
                    <h3>{{ rotulo }}{{ documentoObrigatorio(tipo) ? " *" : "" }}</h3>
                    <p v-if="anexoDoTipo(tipo)" class="ficha__documento-status">
                      {{ anexoDoTipo(tipo)?.nomeOriginal }} · {{ tamanhoDoAnexo(anexoDoTipo(tipo)?.tamanhoBytes ?? 0) }}
                    </p>
                    <p v-else class="ficha__documento-status">Ainda não enviado</p>
                  </div>
                  <img
                    v-if="anexoDoTipo(tipo) && previewsAnexos[anexoDoTipo(tipo)!.id]"
                    :src="previewsAnexos[anexoDoTipo(tipo)!.id]"
                    :alt="`Prévia de ${rotulo}`"
                    class="ficha__documento-preview"
                  />
                </div>
                <div class="ficha__documento-acoes">
                  <label
                    class="ficha__documento-escolher"
                    :class="{ desabilitado: somenteLeitura || anexoEmProcessamento === tipo }"
                  >
                    <v-icon icon="mdi-camera-outline" size="20" aria-hidden="true" />
                    <span>{{ anexoDoTipo(tipo) ? "Trocar documento" : "Adicionar documento" }}</span>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      capture="environment"
                      :disabled="somenteLeitura || anexoEmProcessamento === tipo"
                      @change="selecionarAnexo(tipo, $event)"
                    />
                  </label>
                  <button
                    v-if="anexoDoTipo(tipo)"
                    type="button"
                    class="ficha__documento-remover"
                    :disabled="somenteLeitura || anexoEmProcessamento === tipo"
                    @click="removerAnexo(anexoDoTipo(tipo)!)"
                  >
                    Remover
                  </button>
                </div>
              </article>
            </div>
            <v-alert v-if="etapaAtual === 2 && erroAnexos" type="error" variant="tonal" density="compact" class="mt-2">
              {{ erroAnexos }}
            </v-alert>
            <v-alert
              v-if="etapaAtual === 2 && etapaTentada && anexosObrigatoriosFaltantes.length > 0"
              type="warning"
              variant="tonal"
              density="compact"
              class="mt-2"
            >
              Envie o CPF e o comprovante de residência para continuar.
            </v-alert>
            <div v-if="etapaAtual !== 2" class="ficha__campos">
              <template v-for="campo in camposDaEtapa" :key="campo.chave">
                <v-select
                  v-if="opcoesDoCampo(campo.chave)"
                  v-model="formulario[campo.chave]"
                  :items="opcoesDoCampo(campo.chave)"
                  :label="campo.rotulo"
                  :disabled="somenteLeitura"
                  :error-messages="mensagemDoCampo(campo.chave)"
                  density="comfortable"
                />
                <v-text-field
                  v-else
                  v-model="formulario[campo.chave]"
                  :label="campo.rotulo"
                  :type="campo.tipo"
                  :disabled="somenteLeitura"
                  :readonly="campoEnderecoAutomatico(campo.chave)"
                  :loading="campo.chave === 'cep' && buscandoCep"
                  :error-messages="mensagemDoCampo(campo.chave)"
                  density="comfortable"
                />
              </template>
            </div>
            <v-alert v-if="etapaAtual === 1 && erroCep" type="warning" variant="tonal" density="compact" class="mt-2">
              {{ erroCep }}
            </v-alert>
            <p v-if="etapaAtual === 1 && buscandoCep" class="ficha__nota">Buscando o endereço pelo CEP…</p>
          </section>

          <section v-if="etapaAtual === 3" class="ficha__etapa" aria-labelledby="titulo-etapa-3">
            <div class="ficha__etapa-cabecalho">
              <p class="ficha__etapa-contador">Etapa 4 de {{ ETAPAS.length }}</p>
              <h2 id="titulo-etapa-3">{{ ETAPAS[3] }}</h2>
            </div>
            <section class="dep">
              <div class="dep__resumo">
                <v-text-field
                  :model-value="String(dependentes.length)"
                  label="Quantos filhos?"
                  readonly
                  density="comfortable"
                  hint="Calculado pelos dependentes cadastrados."
                  persistent-hint
                  class="dep__quantidade"
                />
                <!-- A coluna guardada e `sem_dependentes`, entao "tenho" e false e "nao tenho" e true.
                 A inversao mora aqui, num lugar so, em vez de virar um segundo campo na tela. -->
                <v-radio-group
                  ref="grupoDeclaracao"
                  v-model="declaracao"
                  :disabled="somenteLeitura"
                  density="compact"
                  hide-details="auto"
                  label="Você tem dependentes a informar?"
                >
                  <v-radio :value="false" label="Sim, tenho dependentes" />
                  <v-radio
                    :value="true"
                    :disabled="somenteLeitura || temDependentesGravados"
                    label="Não tenho dependentes"
                  />
                </v-radio-group>
              </div>

              <p v-if="temDependentesGravados" class="ficha__nota">
                Para declarar que não tem dependentes, remova antes os que já estão cadastrados.
              </p>

              <template v-if="declaracao === false">
                <TransitionGroup name="dep-lista" tag="div" class="dep__lista">
                  <fieldset v-for="(linha, indice) in dependentes" :key="linha.chave" class="dep__item">
                    <legend class="dep__legenda">Dependente {{ indice + 1 }}</legend>

                    <div class="dep__campos">
                      <v-text-field
                        v-model="linha.nomeCompleto"
                        label="Nome completo *"
                        :disabled="somenteLeitura"
                        density="comfortable"
                        hide-details="auto"
                      />
                      <v-text-field
                        v-model="linha.nascimento"
                        label="Data de nascimento *"
                        type="date"
                        :disabled="somenteLeitura"
                        density="comfortable"
                        hide-details="auto"
                      />
                      <v-select
                        v-model="linha.parentesco"
                        :items="PARENTESCOS"
                        label="Parentesco *"
                        :disabled="somenteLeitura"
                        density="comfortable"
                        hide-details="auto"
                      />
                      <v-select
                        v-for="campo in CAMPOS_E5_DEPENDENTE"
                        :key="campo.chave"
                        v-model="linha[campo.chave]"
                        :items="campo.opcoes"
                        :label="campo.rotulo"
                        :disabled="somenteLeitura"
                        clearable
                        density="comfortable"
                        hide-details="auto"
                      />
                      <v-text-field
                        v-model="linha.cpf"
                        label="CPF (se tiver)"
                        inputmode="numeric"
                        :disabled="somenteLeitura"
                        :error-messages="erroDoCpf(linha)"
                        density="comfortable"
                        hide-details="auto"
                      />
                      <v-select
                        v-model="linha.finalidades"
                        :items="FINALIDADES"
                        label="Para que este dependente é informado"
                        multiple
                        chips
                        :disabled="somenteLeitura"
                        density="comfortable"
                        hide-details="auto"
                        class="dep__campo-largo"
                      />
                    </div>

                    <section class="dep__documentos">
                      <button
                        type="button"
                        class="dep__documentos-toggle"
                        :aria-expanded="linha.documentosAbertos"
                        @click="linha.documentosAbertos = !linha.documentosAbertos"
                      >
                        <span>
                          <v-icon icon="mdi-camera-outline" size="20" aria-hidden="true" />
                          Mandar documentações *
                        </span>
                        <v-icon
                          :icon="linha.documentosAbertos ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                          size="22"
                          aria-hidden="true"
                        />
                      </button>
                      <div v-show="linha.documentosAbertos" class="dep__documentos-lista">
                        <article v-for="[tipo, rotulo] in DOCUMENTOS_DEPENDENTE" :key="tipo" class="dep__documento">
                          <div class="dep__documento-cabecalho">
                            <div>
                              <h3>{{ rotulo }}{{ documentoDependenteObrigatorio(tipo) ? " *" : "" }}</h3>
                              <p v-if="anexoDependenteDoTipo(linha, tipo)" class="ficha__documento-status">
                                {{ anexoDependenteDoTipo(linha, tipo)?.nomeOriginal }} ·
                                {{ tamanhoDoAnexo(anexoDependenteDoTipo(linha, tipo)?.tamanhoBytes ?? 0) }}
                              </p>
                              <p v-else class="ficha__documento-status">Ainda não enviado</p>
                            </div>
                            <img
                              v-if="
                                anexoDependenteDoTipo(linha, tipo) &&
                                previewsAnexosDependentes[
                                  chavePreviewDependente(linha, anexoDependenteDoTipo(linha, tipo)!)
                                ]
                              "
                              :src="
                                previewsAnexosDependentes[
                                  chavePreviewDependente(linha, anexoDependenteDoTipo(linha, tipo)!)
                                ]
                              "
                              :alt="`Prévia de ${rotulo}`"
                              class="dep__documento-preview"
                            />
                          </div>
                          <div class="dep__documento-acoes">
                            <label
                              class="dep__documento-escolher"
                              :class="{
                                desabilitado: somenteLeitura || !linha.id || salvandoDependente === linha.chave
                              }"
                            >
                              <v-icon icon="mdi-camera-outline" size="20" aria-hidden="true" />
                              <span>{{
                                anexoDependenteDoTipo(linha, tipo) ? "Trocar documento" : "Adicionar documento"
                              }}</span>
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                capture="environment"
                                :disabled="somenteLeitura || !linha.id || salvandoDependente === linha.chave"
                                @change="selecionarAnexoDependente(linha, tipo, $event)"
                              />
                            </label>
                            <button
                              v-if="anexoDependenteDoTipo(linha, tipo)"
                              type="button"
                              class="dep__documento-remover"
                              :disabled="somenteLeitura || salvandoDependente === linha.chave"
                              @click="removerAnexoDependente(linha, anexoDependenteDoTipo(linha, tipo)!)"
                            >
                              Remover
                            </button>
                          </div>
                        </article>
                      </div>
                    </section>

                    <footer v-if="!somenteLeitura" class="dep__acoes">
                      <v-btn
                        type="button"
                        variant="text"
                        color="error"
                        :disabled="salvandoDependente !== ''"
                        :aria-label="`Remover dependente ${indice + 1}`"
                        @click="removerDependente(linha)"
                      >
                        Remover
                      </v-btn>
                      <v-btn
                        type="button"
                        variant="tonal"
                        :loading="salvandoDependente === linha.chave"
                        :disabled="!porGravar(linha) || erroDaLinha(linha) !== ''"
                        :aria-label="`${rotuloSalvar(linha)} — dependente ${indice + 1}`"
                        @click="salvarDependente(linha)"
                      >
                        {{ rotuloSalvar(linha) }}
                      </v-btn>
                    </footer>
                  </fieldset>
                </TransitionGroup>

                <v-btn
                  v-if="!somenteLeitura"
                  ref="botaoAdicionar"
                  type="button"
                  variant="outlined"
                  class="dep__adicionar"
                  @click="adicionarDependente"
                >
                  Adicionar dependente
                </v-btn>

                <p v-if="dependentes.length === 0" class="ficha__nota">
                  Você marcou que tem dependentes. Cadastre pelo menos um antes de enviar a ficha.
                </p>
              </template>

              <p v-else-if="declaracao === true" class="ficha__nota">
                Você declarou que não há dependentes a informar. Se isso mudar, volte por este mesmo link.
              </p>
            </section>

            <section class="ficha__aviso">
              <h2>Aviso de privacidade</h2>
              <pre class="ficha__aviso-texto">{{ ficha.avisoTexto }}</pre>
              <v-checkbox
                v-model="aceite"
                :disabled="somenteLeitura"
                density="compact"
                :label="`Li e aceito o aviso de privacidade (versão ${ficha.avisoVersaoVigente}).`"
              />
            </section>
          </section>

          <footer v-if="!somenteLeitura" class="ficha__acoes">
            <p v-if="dependentesPorGravar" class="ficha__nota">
              Há dependente com alterações não salvas. Salve-o antes de enviar a ficha.
            </p>
            <p v-else-if="declaracao === false && !dependentesAnexosObrigatoriosCompletos" class="ficha__nota">
              Envie os quatro documentos obrigatórios de cada dependente antes de enviar a ficha.
            </p>
            <p v-else-if="declaracao === null" class="ficha__nota">Responda se você tem dependentes antes de enviar.</p>
            <div class="ficha__botoes">
              <v-btn type="button" variant="text" :disabled="salvando" @click="salvarRascunho"> Salvar rascunho </v-btn>
              <v-btn v-if="etapaAtual > 0" type="button" variant="text" :disabled="salvando" @click="voltarEtapa">
                Voltar
              </v-btn>
              <v-btn
                v-if="etapaAtual < ETAPAS.length - 1"
                type="button"
                color="primary"
                variant="flat"
                :disabled="salvando"
                @click="avancarEtapa"
              >
                Continuar
              </v-btn>
              <v-btn v-else color="primary" variant="flat" type="submit" :loading="salvando" :disabled="!podeEnviar">
                Enviar ficha
              </v-btn>
            </div>
          </footer>
        </form>
      </template>
    </div>
  </v-main>
</template>

<style scoped>
.ficha {
  width: 100%;
  max-width: 880px;
  display: grid;
  gap: var(--cx-sp-4);
  align-content: start;
}

.ficha__cabecalho {
  display: grid;
  gap: var(--cx-sp-1);
}

.ficha__titulo {
  margin: 0;
  font-size: var(--cx-fs-h1);
  letter-spacing: var(--cx-tracking-tight);
  color: var(--cx-ink);
}

.ficha__sub {
  margin: 0;
  color: var(--cx-ink-soft);
}

.ficha__estado {
  color: var(--cx-ink-soft);
}

.ficha__secao {
  display: grid;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-5);
  border-radius: var(--cx-r-lg);
  background: var(--cx-surface);
  box-shadow: var(--cx-e-1);
}

.ficha__secao h2 {
  margin: 0;
  font-size: var(--cx-fs-title);
  color: var(--cx-ink);
}

.ficha__etapas {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--cx-sp-2);
  padding-bottom: var(--cx-sp-2);
  border-bottom: 1px solid var(--cx-line);
}

.ficha__etapas button {
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--cx-ink-soft);
  text-align: left;
  font: inherit;
  cursor: pointer;
  padding: var(--cx-sp-2);
  border-radius: var(--cx-r-md);
}

.ficha__etapas button:disabled {
  cursor: default;
  opacity: 0.55;
}

.ficha__etapas button.ativo,
.ficha__etapas button.concluida {
  color: var(--cx-ink);
}

.ficha__etapas button.ativo {
  background: var(--cx-surface-sunken);
  font-weight: 600;
}

.ficha__etapas span {
  display: inline-grid;
  place-items: center;
  inline-size: 28px;
  height: 28px;
  margin-right: var(--cx-sp-2);
  border-radius: 999px;
  background: var(--cx-line);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.ficha__etapas .ativo span,
.ficha__etapas .concluida span {
  background: var(--cx-brand);
  color: white;
}

.ficha__etapa {
  display: grid;
  gap: var(--cx-sp-3);
}

.ficha__etapa-cabecalho {
  display: grid;
  gap: var(--cx-sp-1);
}

.ficha__etapa-contador {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.ficha__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}

.ficha__conferencia {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  margin: 0;
}

.ficha__conferencia dt {
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.ficha__conferencia dd {
  margin: 0;
  color: var(--cx-ink);
}

.ficha__aviso {
  display: grid;
  gap: var(--cx-sp-2);
}

.ficha__aviso-texto {
  margin: 0;
  padding: var(--cx-sp-3);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  white-space: pre-wrap;
  font-family: inherit;
}

.ficha__nota {
  margin: 0;
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
}

.ficha__documentos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}

.ficha__documento {
  display: grid;
  gap: var(--cx-sp-3);
  min-width: 0;
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}

.ficha__documento-cabecalho,
.ficha__documento-acoes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.ficha__documento-cabecalho h3,
.ficha__documento-status {
  margin: 0;
}

.ficha__documento-status {
  color: var(--cx-ink-soft);
  font-size: var(--cx-fs-caption);
  overflow-wrap: anywhere;
}

.ficha__documento-preview {
  inline-size: 56px;
  block-size: 56px;
  object-fit: cover;
  border-radius: var(--cx-r-sm);
}

.ficha__documento-escolher,
.ficha__documento-remover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cx-sp-1);
  min-height: 40px;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  color: var(--cx-ink);
  background: var(--cx-surface);
  cursor: pointer;
  font: inherit;
}

.ficha__documento-escolher:hover,
.ficha__documento-escolher:focus-within {
  border-color: var(--cx-ink-soft);
  background: var(--cx-surface-sunken);
}

.ficha__documento-escolher input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
}

.ficha__documento-escolher.desabilitado,
.ficha__documento-remover:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ficha__documento-remover {
  color: var(--cx-ink);
  background: var(--cx-line);
}

.ficha__acoes {
  display: grid;
  gap: var(--cx-sp-2);
  justify-items: end;
}

.ficha__botoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
}

/* --- Dependentes ------------------------------------------------------------------------------ */

.dep {
  display: grid;
  gap: var(--cx-sp-3);
}

.dep__resumo {
  display: grid;
  grid-template-columns: minmax(180px, 0.7fr) minmax(0, 1.3fr);
  align-items: start;
  gap: var(--cx-sp-4);
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}

.dep__quantidade {
  min-width: 0;
}

.dep__lista {
  display: grid;
  gap: var(--cx-sp-3);
  /* Ancora para o item que sai: sem isto o 'position: absolute' da saida escaparia do cartao. */
  position: relative;
}

/* `fieldset` de verdade, com `legend`: os campos se repetem por dependente, e sem o agrupamento um
   leitor de tela anuncia cinco vezes "Nome completo" sem dizer de quem. */
.dep__item {
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  padding: var(--cx-sp-4);
  display: grid;
  gap: var(--cx-sp-3);
  min-width: 0;
}

.dep__legenda {
  padding-inline: var(--cx-sp-2);
  font-size: var(--cx-fs-caption);
  color: var(--cx-ink-soft);
}

.dep__campos {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
  min-width: 0;
}

.dep__campo-largo {
  grid-column: 1 / -1;
}

.dep__documentos {
  display: grid;
  gap: var(--cx-sp-3);
  order: 2;
  padding-top: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line);
}

.dep__documentos-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
  min-height: 44px;
  padding: var(--cx-sp-2) 0;
  border: 0;
  color: var(--cx-ink);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  text-align: start;
}

.dep__documentos-toggle span {
  display: inline-flex;
  align-items: center;
  gap: var(--cx-sp-2);
}

.dep__documentos-toggle:focus-visible {
  outline: 2px solid var(--cx-brand);
  outline-offset: 3px;
}

.dep__documentos-lista {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--cx-sp-3);
}

.dep__documento {
  display: grid;
  gap: var(--cx-sp-3);
  min-width: 0;
  padding: var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  background: var(--cx-surface-sunken);
}

.dep__documento-cabecalho,
.dep__documento-acoes {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cx-sp-2);
}

.dep__documento-cabecalho h3 {
  margin: 0;
  font-size: var(--cx-fs-caption);
}

.dep__documento-preview {
  inline-size: 56px;
  block-size: 56px;
  object-fit: cover;
  border-radius: var(--cx-r-sm);
}

.dep__documento-escolher,
.dep__documento-remover {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cx-sp-1);
  min-height: 40px;
  padding: var(--cx-sp-2) var(--cx-sp-3);
  border: 1px solid var(--cx-line);
  border-radius: var(--cx-r-md);
  color: var(--cx-ink);
  background: var(--cx-surface);
  cursor: pointer;
  font: inherit;
}

.dep__documento-escolher:hover,
.dep__documento-escolher:focus-within {
  border-color: var(--cx-ink-soft);
  background: var(--cx-surface-sunken);
}

.dep__documento-escolher input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
}

.dep__documento-remover {
  background: var(--cx-line);
}

.dep__documento-escolher.desabilitado,
.dep__documento-remover:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dep__acoes {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cx-sp-2);
  order: 1;
  padding-top: var(--cx-sp-2);
  border-top: 1px solid var(--cx-line);
}

.dep__adicionar {
  justify-self: start;
}

@media (max-width: 700px) {
  .dep__resumo {
    grid-template-columns: 1fr;
  }
}

/* --- Alvo de toque -------------------------------------------------------------------------- */

/* O `67` §9 pede 40px de piso e o §13.4 pede 44px em primarias e no mobile. O default do Vuetify
   entrega 36px no botao e 28px em radio/checkbox — medido em navegador real, esta ficha reprovava
   nos quatro. Cresce a AREA CLICAVEL, nao o desenho: so `min-height`, sem mexer em fonte ou padding.

   Regra ESCOPADA a esta ficha, como o bloco de Produtos em `main.css` ja faz para aquela tela.
   Nada global muda. `:deep()` porque o alvo e o no interno de um componente filho. */
.ficha :deep(.v-btn) {
  min-height: 40px;
}

.ficha :deep(.v-selection-control) {
  min-height: 40px;
}

/* Entrada e saida assimetricas: quem chega desliza para o lugar, quem sai apenas recolhe — sem
   promessa de movimento onde ja nao ha nada para olhar. So `opacity` e `transform`, que o
   compositor resolve sem relayout. */
.dep-lista-enter-active {
  transition:
    opacity 220ms ease,
    transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1);
}

.dep-lista-leave-active {
  transition:
    opacity 140ms ease,
    transform 140ms ease;
  position: absolute;
}

.dep-lista-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}

.dep-lista-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.dep-lista-move {
  transition: transform 220ms cubic-bezier(0.2, 0.7, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .dep-lista-enter-active,
  .dep-lista-leave-active,
  .dep-lista-move {
    transition: none;
  }
}

@media (max-width: 768px) {
  .ficha__etapas {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .ficha__documentos {
    grid-template-columns: minmax(0, 1fr);
  }

  .ficha__documento-acoes {
    align-items: stretch;
    flex-direction: column;
  }

  .ficha__campos,
  .ficha__conferencia,
  .dep__campos,
  .dep__documentos-lista {
    grid-template-columns: minmax(0, 1fr);
  }

  /* No celular o dedo nao tem a precisao do ponteiro: 44px, como o `67` §13.4 exige. Vale para
     todos os controles da ficha — adicionar, salvar, remover, enviar, os radios e o aceite. */
  .ficha :deep(.v-btn),
  .ficha :deep(.v-selection-control) {
    min-height: 44px;
  }
}
</style>
