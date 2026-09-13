import type { DadosExternos } from "@padaria/shared/api";
import { empresaPayloadSchema } from "@padaria/shared/empresas";
import { empresasPermitidas, type PerfilComEmpresa } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { erroValidacao } from "../erros.js";
import { apenasDigitos } from "../utils.js";
import {
  listarEmpresasRepository,
  salvarEmpresaRepository,
  vincularUsuarioEmpresaRepository
} from "./empresas.repository.js";

export async function listarEmpresas(perfil?: PerfilComEmpresa) {
  const empresasLiberadas = perfil ? empresasPermitidas(perfil) : [];
  if (!empresasLiberadas.length) return [];
  return listarEmpresasRepository(empresasLiberadas);
}

export async function salvarEmpresa(id: string | null, body: DadosExternos, usuarioCriadorId?: string) {
  const dados = empresaPayloadSchema.parse(body);
  const empresa = { ...(id ? { id } : {}), nome: dados.nome.trim(), cnpj: apenasDigitos(dados.cnpj) };

  if (id) return salvarEmpresaRepository(empresa);
  if (!usuarioCriadorId) throw erroValidacao("Usuario criador obrigatorio", "USUARIO_CRIADOR_OBRIGATORIO");

  return executarEmTransacao(async (tx) => {
    const criada = await salvarEmpresaRepository(empresa, tx);
    if (!criada?.id) throw erroValidacao("Empresa nao foi criada", "EMPRESA_NAO_CRIADA");
    await vincularUsuarioEmpresaRepository(usuarioCriadorId, criada.id, tx);
    return criada;
  });
}
