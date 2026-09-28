import { camposObrigatoriosDaFicha } from "@padaria/shared";

export type ChaveCampoFicha =
  | "nascimento"
  | "sexo"
  | "estadoCivil"
  | "racaCor"
  | "grauInstrucao"
  | "nacionalidade"
  | "naturalidade"
  | "nomeMae"
  | "nomePai"
  | "nomeSocial"
  | "cep"
  | "logradouro"
  | "numero"
  | "complemento"
  | "bairro"
  | "municipio"
  | "uf"
  | "telefone"
  | "email"
  | "rgNumero"
  | "rgOrgao"
  | "rgUf"
  | "rgEmissao"
  | "tituloEleitor"
  | "tituloZona"
  | "tituloSecao"
  | "banco"
  | "agencia"
  | "conta"
  | "contaDigito"
  | "contaTipo";

export type CampoFicha = {
  chave: ChaveCampoFicha;
  rotulo: string;
  grupo: "pessoal" | "endereco" | "contato" | "identidade" | "eleitoral" | "bancario";
  tipo?: "date" | "email";
  opcoes?: readonly string[];
  obrigatorio: boolean;
};

const obrigatorios = new Set(camposObrigatoriosDaFicha);

function campo(
  chave: ChaveCampoFicha,
  rotulo: string,
  grupo: CampoFicha["grupo"],
  opcoes?: readonly string[],
  tipo?: CampoFicha["tipo"]
): CampoFicha {
  return { chave, rotulo, grupo, opcoes, tipo, obrigatorio: obrigatorios.has(chave) };
}

/** Uma lista única para carregar, salvar e renderizar os campos da ficha pública. */
export const camposDaFichaPublica: readonly CampoFicha[] = [
  campo("nascimento", "Data de nascimento", "pessoal", undefined, "date"),
  campo("sexo", "Sexo", "pessoal", ["Masculino", "Feminino"]),
  campo("estadoCivil", "Estado civil", "pessoal"),
  campo("racaCor", "Raça/cor", "pessoal"),
  campo("grauInstrucao", "Grau de instrução", "pessoal"),
  campo("nacionalidade", "Nacionalidade", "pessoal"),
  campo("naturalidade", "Naturalidade", "pessoal"),
  campo("nomeMae", "Nome da mãe", "pessoal"),
  campo("nomePai", "Nome do pai", "pessoal"),
  campo("nomeSocial", "Nome social", "pessoal"),
  campo("cep", "CEP", "endereco"),
  campo("logradouro", "Logradouro", "endereco"),
  campo("numero", "Número", "endereco"),
  campo("complemento", "Complemento", "endereco"),
  campo("bairro", "Bairro", "endereco"),
  campo("municipio", "Município", "endereco"),
  campo("uf", "UF", "endereco"),
  campo("telefone", "Telefone", "contato"),
  campo("email", "E-mail", "contato", undefined, "email"),
  campo("rgNumero", "RG — número", "identidade"),
  campo("rgOrgao", "RG — órgão emissor", "identidade"),
  campo("rgUf", "RG — UF", "identidade"),
  campo("rgEmissao", "RG — data de emissão", "identidade", undefined, "date"),
  campo("tituloEleitor", "Título de eleitor", "eleitoral"),
  campo("tituloZona", "Zona", "eleitoral"),
  campo("tituloSecao", "Seção", "eleitoral"),
  campo("banco", "Banco", "bancario"),
  campo("agencia", "Agência", "bancario"),
  campo("conta", "Conta", "bancario"),
  campo("contaDigito", "Dígito", "bancario"),
  campo("contaTipo", "Tipo de conta", "bancario")
];

export const gruposDaFichaPublica = [
  { id: "pessoal", titulo: "Dados pessoais", descricao: "Informações de identificação da pessoa." },
  { id: "endereco", titulo: "Endereço", descricao: "Use o CEP para preencher o endereço mais rápido." },
  { id: "contato", titulo: "Contato" },
  { id: "identidade", titulo: "Documento de identificação" },
  { id: "eleitoral", titulo: "Título eleitoral", descricao: "Opcional." },
  { id: "bancario", titulo: "Dados bancários", descricao: "Opcional." }
] as const;

export function rotuloCampoFicha(campo: CampoFicha): string {
  return campo.obrigatorio ? `${campo.rotulo} *` : campo.rotulo;
}

export function normalizarCep(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 8);
}
