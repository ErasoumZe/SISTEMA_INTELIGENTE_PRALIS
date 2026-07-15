// Serializacao formulario -> payload dos cadastros (M3/ADR-002): a montagem do contrato
// e regra compartilhada e mora no shared. O front preenche o formulario (strings de input);
// estas funcoes produzem o payload que a API valida com zod. O servidor continua sendo o
// unico com autoridade sobre valores derivados (ex.: preco de venda e recalculado la).
import type { DadosExternos } from "../api/index.js";
import type { RoleUsuario } from "../autenticacao/index.js";
import { calcularPrecoVenda } from "../produtos/regras.js";

export type ProdutoFiscalForm = {
  ncm: string;
  cest: string;
  categoriaFiscal: string;
  cstPisCofins: string;
  aliquotaCheia: string;
  aliquotaFcp: string;
  aliquotaPis: string;
  aliquotaCofins: string;
  reducaoIcms: string;
  icms: string;
};

export type ProdutoTransformacaoForm = {
  precisao: string;
  quantidade: string;
  unidade: string;
  produtoReceituario: string;
};

export type ProdutoConversaoForm = {
  unidadeMedidaId: string;
  quantidade: string;
  unidadesIndividuais: string;
};

export type CadastroForm = {
  nome: string;
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
  email: string;
  senha: string;
  role: RoleUsuario;
  cpf: string;
  sigla: string;
  horaInicio: string;
  horaFim: string;
  codigo: string;
  codigoBarras: string;
  descricao: string;
  marca: string;
  unidadeIndividualId: string;
  quantidadeIndividual: string;
  embalagem: string;
  cDe: string;
  quantidadeCaixa: string;
  medidaCompra: string;
  grupoMercadoriaId: string;
  produtoConversoes: ProdutoConversaoForm[];
  custo: string;
  margem: string;
  precoVenda: string;
  auto: boolean;
  status: "ativo" | "inativo";
  tipo: "revenda" | "transformacao";
  quantidadeEstoque: string;
  estoqueMin: string;
  estoqueMax: string;
  setorEstoque: string;
  localVenda1: string;
  localVenda2: string;
  fotoUrl: string;
  fiscal: ProdutoFiscalForm;
  transformacao: ProdutoTransformacaoForm;
  promoTipo: "nenhum" | "valor" | "desconto";
  promoValor: string;
  promoDescontoPct: string;
  promoHoraInicio: string;
  promoHoraFim: string;
  promoDias: boolean[];
  promoValidaAte: string;
  contaId: string;
  ativo: boolean;
  tipoGrupo: "despesa" | "mercadoria" | "retirada" | "vendas";
  grupoPaiId: string;
  tipoAreaSetor: "area" | "setor";
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

// Margem no formulario e digitada em % (ex.: 70). Converte para fracao (0.70) com clamp 0-1000% (BUG-02 do Pralis).
export function margemFracaoDoForm(margemPct: string): number | null {
  const pct = numeroCampoOuNulo(margemPct);
  if (pct == null) return null;
  return Math.min(1000, Math.max(0, pct)) / 100;
}

// preco de referencia do produto a partir do formulario: automatico calcula por custo+margem
// (null se sem custo); manual usa o valor digitado (null se vazio). Fonte unica usada pelo
// payload e pelo preview — e o SERVIDOR recalcula na escrita (ADR-002).
export function precoVendaDoFormProduto(
  form: Pick<CadastroForm, "auto" | "custo" | "margem" | "precoVenda" | "quantidadeCaixa">
): number | null {
  const custo = numeroCampoOuNulo(form.custo);
  if (form.auto) {
    if (custo == null) return null;
    return calcularPrecoVenda({
      auto: true,
      custo,
      // custo e da CAIXA; divide pelas unidades por caixa (qtCad), nao pela gramatura (quantidadeIndividual)
      quantidadeCaixa: Number(form.quantidadeCaixa || 1),
      margem: margemFracaoDoForm(form.margem),
      margemGrupo: 0,
      precoManual: 0
    });
  }
  return numeroCampoOuNulo(form.precoVenda);
}

// Monta o bloco fiscal do payload a partir do form; null se nada preenchido (como no Pralis).
export function fiscalDoFormProduto(fiscal: CadastroForm["fiscal"]) {
  const temAlgum =
    fiscal.ncm ||
    fiscal.cest ||
    fiscal.categoriaFiscal ||
    fiscal.cstPisCofins ||
    fiscal.aliquotaCheia ||
    fiscal.aliquotaFcp ||
    fiscal.aliquotaPis ||
    fiscal.aliquotaCofins ||
    fiscal.reducaoIcms ||
    fiscal.icms;
  if (!temAlgum) return null;
  return {
    ncm: fiscal.ncm || null,
    cest: fiscal.cest || null,
    categoriaFiscal: fiscal.categoriaFiscal || null,
    cstPisCofins: fiscal.cstPisCofins || null,
    aliquotaCheia: numeroCampoOuNulo(fiscal.aliquotaCheia),
    aliquotaFcp: numeroCampoOuNulo(fiscal.aliquotaFcp),
    aliquotaPis: numeroCampoOuNulo(fiscal.aliquotaPis),
    aliquotaCofins: numeroCampoOuNulo(fiscal.aliquotaCofins),
    reducaoIcms: numeroCampoOuNulo(fiscal.reducaoIcms),
    icms: numeroCampoOuNulo(fiscal.icms)
  };
}

// Bloco transformacao do payload — so quando tipo = transformacao (como no Pralis).
export function transformacaoDoFormProduto(form: CadastroForm) {
  if (form.tipo !== "transformacao") return null;
  const t = form.transformacao;
  return {
    precisao: t.precisao || null,
    quantidade: numeroCampoOuNulo(t.quantidade),
    unidade: t.unidade || null,
    produtoReceituario: t.produtoReceituario || null
  };
}

// Promocoes do payload — so quando tipo = revenda; monta 0 ou 1 promocao (como no Pralis).
// Nenhum dia marcado => vale todos os dias.
export function promocoesDoFormProduto(form: CadastroForm) {
  if (form.tipo !== "revenda" || form.promoTipo === "nenhum") return [];
  const temDia = form.promoDias.some(Boolean);
  const dia = (i: number) => (temDia ? Boolean(form.promoDias[i]) : true);
  const pct = numeroCampoOuNulo(form.promoDescontoPct);
  return [
    {
      tipo: form.promoTipo,
      valor: form.promoTipo === "valor" ? numeroCampoOuNulo(form.promoValor) : null,
      descontoFracao: form.promoTipo === "desconto" && pct != null ? pct / 100 : null,
      horaInicio: form.promoHoraInicio || null,
      horaFim: form.promoHoraFim || null,
      seg: dia(0),
      ter: dia(1),
      qua: dia(2),
      qui: dia(3),
      sex: dia(4),
      sab: dia(5),
      dom: dia(6),
      validaAte: form.promoValidaAte || null
    }
  ];
}

export function cadastroPayload(tela: string, form: CadastroForm, empresaId: string) {
  if (tela === "empresas") return { nome: form.nome, cnpj: form.cnpj || null };
  if (tela === "contas") return { empresaId, nome: form.nome };
  if (tela === "formas_pagamento") return { empresaId, nome: form.nome };
  if (tela === "pdv") return { empresaId, nome: form.nome, contaId: form.contaId, ativo: form.ativo };
  if (tela === "grupos")
    return { empresaId, nome: form.nome, tipoGrupo: form.tipoGrupo, grupoPaiId: form.grupoPaiId || null };
  if (tela === "unidades") return { empresaId, nome: form.nome, sigla: form.sigla };
  if (tela === "turnos")
    return { empresaId, nome: form.nome, horaInicio: form.horaInicio, horaFim: form.horaFim, ativo: form.ativo };
  if (tela === "fornecedores") return { empresaId, nome: form.nome, documento: form.documento || null };
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
  if (tela === "produtos") {
    return {
      empresaId,
      codigo: form.codigo || null,
      codigoBarras: form.codigoBarras || null,
      descricao: form.descricao || form.nome,
      marca: form.marca || null,
      unidadeIndividualId: form.unidadeIndividualId,
      quantidadeIndividual: Number(form.quantidadeIndividual || 1),
      embalagem: form.embalagem || null,
      cDe: form.cDe || null,
      quantidadeCaixa: Number(form.quantidadeCaixa || 1),
      medidaCompra: form.medidaCompra || null,
      grupoMercadoriaId: form.grupoMercadoriaId || null,
      custo: numeroCampoOuNulo(form.custo),
      margem: margemFracaoDoForm(form.margem),
      precoVenda: precoVendaDoFormProduto(form),
      auto: form.auto,
      status: form.status,
      tipo: form.tipo,
      quantidadeEstoque: numeroCampoOuNulo(form.quantidadeEstoque),
      estoqueMin: numeroCampoOuNulo(form.estoqueMin),
      estoqueMax: numeroCampoOuNulo(form.estoqueMax),
      setorEstoque: form.setorEstoque || null,
      localVenda1: form.localVenda1 || null,
      localVenda2: form.localVenda2 || null,
      fotoUrl: form.fotoUrl || null,
      fiscal: fiscalDoFormProduto(form.fiscal),
      transformacao: transformacaoDoFormProduto(form),
      promocoes: promocoesDoFormProduto(form),
      conversoes: form.produtoConversoes
        .filter((conversao) => conversao.unidadeMedidaId && conversao.quantidade && conversao.unidadesIndividuais)
        .map((conversao) => ({
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: Number(conversao.quantidade),
          unidadesIndividuais: Number(conversao.unidadesIndividuais)
        }))
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
      senha: form.senha || undefined,
      role: form.role,
      empresaIds: form.empresaIds.length ? form.empresaIds : [empresaId].filter(Boolean)
    };
    if (form.novoColaborador) {
      payload["novoColaborador"] = {
        empresaId,
        nome: form.novoColaboradorNome || form.nome,
        cpf: form.novoColaboradorCpf || null,
        setorId: form.novoColaboradorSetorId || null,
        cargoId: form.novoColaboradorCargoId
      };
    } else {
      payload["colaboradorId"] = form.colaboradorId;
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
