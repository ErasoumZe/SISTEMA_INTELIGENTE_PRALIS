import type { DadosExternos } from "@padaria/shared/api";
import {
  fornecedorPayloadSchema,
  type ExportarFornecedorPayload as ExportarPayload,
  type ImportarFornecedoresPayload as ImportarPayload
} from "@padaria/shared/fornecedores";
import { temAlgumaPermissao, type PerfilUsuario } from "@padaria/shared";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { apenasDigitos, validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import {
  copiarFornecedoresRepository,
  listarFornecedoresRepository,
  salvarFornecedorRepository
} from "./fornecedores.repository.js";

// B-1 (decisao do Jose, 10/08/2026): quem entra por permissao OPERACIONAL — lanca despesa,
// mercadoria ou retirada — recebe so o que um campo de credor precisa: `{ id, empresaId, nome }`.
//
// Ate aqui esta rota nao tinha projecao NENHUMA: `despesas_visualizar` e `mercadorias_visualizar` ja
// passavam no gate e recebiam o contrato inteiro, `documento` (CNPJ/CPF do fornecedor) incluso. A
// decisao acrescentou `retiradas_visualizar` ao gate, e junto fecha o vazamento que ja existia.
//
// Mesmo mecanismo de `listarColaboradores`, que roda em producao desde a CX-M05 — nao e desenho novo.
const PERMISSOES_CONTRATO_COMPLETO = ["cadastro_fornecedores_visualizar"] as const;

export async function listarFornecedores(escopoDados: string[], perfil?: PerfilUsuario) {
  // O filtro por empresa vem PRIMEIRO e continua valendo para os dois contratos: reduzir campos nao
  // e o mesmo que reduzir linhas, e o isolamento entre empresas nao depende da projecao.
  const linhas = filtrarPorEmpresas(await listarFornecedoresRepository(), escopoDados);
  if (perfil && temAlgumaPermissao(perfil.permissoes, [...PERMISSOES_CONTRATO_COMPLETO])) return linhas;
  return linhas.map((linha) => ({ id: linha.id, empresaId: linha.empresaId, nome: linha.nome }));
}

export async function salvarFornecedor(id: string | null, body: DadosExternos) {
  const dados = fornecedorPayloadSchema.parse(body);
  return salvarFornecedorRepository({
    ...(id ? { id } : {}),
    empresaId: dados.empresaId,
    nome: dados.nome.trim(),
    documento: apenasDigitos(dados.documento),
    whatsapp: dados.whatsapp ? apenasDigitos(dados.whatsapp) : null,
    situacao: dados.situacao
  });
}

export async function importarFornecedores(body: ImportarPayload, perfil?: PerfilComEmpresa) {
  validarImportacaoEntreEmpresas(body.empresaOrigemId, body.empresaDestinoId, perfil);
  return copiarFornecedoresRepository(
    { empresaOrigemId: body.empresaOrigemId },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}

export async function exportarFornecedor(id: string, body: ExportarPayload, perfil?: PerfilComEmpresa) {
  validarExportacaoParaEmpresa(body.empresaDestinoId, perfil);
  return copiarFornecedoresRepository(
    { id },
    body.empresaDestinoId,
    perfil ? empresasPermitidas(perfil) : [],
    body.modo
  );
}
