import type { DadosExternos } from "@padaria/shared/api";
import {
  fornecedorPayloadSchema,
  type ExportarFornecedorPayload as ExportarPayload,
  type ImportarFornecedoresPayload as ImportarPayload
} from "@padaria/shared/fornecedores";
import { temAlgumaPermissao, type PerfilUsuario } from "@padaria/shared";
import { empresasPermitidas, filtrarPorEmpresas, type PerfilComEmpresa } from "../auth/empresa.js";
import { apenasDigitos, validarExportacaoParaEmpresa, validarImportacaoEntreEmpresas } from "../utils.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { conflito, naoEncontrado } from "../erros.js";
import {
  copiarFornecedoresRepository,
  listarFornecedoresRepository,
  salvarFornecedorRepository
} from "./fornecedores.repository.js";
import {
  apagarFornecedorComComprasRepository,
  bloqueiosDaExclusaoRepository,
  travarFornecedorParaExclusaoRepository
} from "./fornecedores-exclusao.repository.js";

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
    situacao: dados.situacao,
    categoria: dados.categoria === undefined ? undefined : dados.categoria?.trim() || null
  });
}

/**
 * Excluir fornecedor (decisao do Jose, 25/11/2026): sai junto a "compra sem efeito" — convites de
 * cotacao e pedidos que nunca foram recebidos. Despesa, mercadoria, retirada, nota fiscal, historico de
 * preco e pedido recebido bloqueiam: viraram dinheiro, estoque ou referencia de preco, e historico
 * financeiro nunca e apagado. A recusa diz o que fazer (inativar). Ver fornecedores-exclusao.repository.
 *
 * O 23503 continua traduzido como rede de seguranca: uma tabela nova que aponte para o fornecedor sem
 * entrar na lista de bloqueios e recusada pelo banco, e o operador ve a mesma orientacao, nao um 500.
 */
function ehFornecedorEmUso(erro: Error): boolean {
  // O driver embrulha o erro em `cause` quando passa pelo Drizzle (mesma forma de turnos.service).
  const candidatos = [erro, erro.cause instanceof Error ? erro.cause : null];
  return candidatos.some((atual) => {
    if (!atual) return false;
    const detalhes = atual as Error & { code?: string };
    return detalhes.code === "23503";
  });
}

const ORIENTACAO_INATIVAR = "Para tira-lo de uso, edite e marque como inativo.";

function listarEmTexto(itens: string[]): string {
  return itens.length > 1 ? `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}` : (itens[0] ?? "");
}

export async function excluirFornecedor(id: string, empresaId: string) {
  try {
    await executarEmTransacao(async (tx) => {
      const travado = await travarFornecedorParaExclusaoRepository(id, empresaId, tx);
      if (!travado) throw naoEncontrado("Fornecedor nao encontrado");
      const bloqueios = await bloqueiosDaExclusaoRepository(id, empresaId, travado.pedidosIds, tx);
      if (bloqueios.length) {
        throw conflito(
          `Este fornecedor tem ${listarEmTexto(bloqueios)} e nao pode ser excluido. ${ORIENTACAO_INATIVAR}`,
          "FORNECEDOR_EM_USO",
          bloqueios
        );
      }
      await apagarFornecedorComComprasRepository({ id, empresaId, ...travado }, tx);
    });
  } catch (erro) {
    if (erro instanceof Error && ehFornecedorEmUso(erro)) {
      throw conflito(
        `Este fornecedor tem historico ligado a ele e nao pode ser excluido. ${ORIENTACAO_INATIVAR}`,
        "FORNECEDOR_EM_USO"
      );
    }
    throw erro;
  }
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
