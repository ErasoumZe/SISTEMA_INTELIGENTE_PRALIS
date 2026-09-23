import type { ContaUsuarioPayload } from "@padaria/shared/contas-usuarios";
import { erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { listarContas } from "../contas/contas.service.js";
import { buscarContaCofreEmpresaRepository } from "../caixa/caixa.repository.js";
import { listarPdvsRepository } from "../pdvs/pdvs.repository.js";
import {
  buscarContaUsuarioRepository,
  criarContaUsuarioRepository,
  excluirContaUsuarioRepository,
  existeVinculoRepository,
  listarContasDoUsuarioRepository,
  listarContasUsuariosRepository
} from "./contas-usuarios.repository.js";
import { exigirContaDaEmpresa, exigirUsuarioDaEmpresa } from "./contas-usuarios.validacao.js";

// Perfil minimo para as decisoes de escopo (usuarioId + role). O role "usuario_admin" e o unico
// com short-circuit (ve todas as contas), espelhando exatamente a regra de permissoes.
type PerfilEscopo = { usuarioId: string; role: string };

// Contas OPERAVEIS pelo usuario logado — feed dos seletores de Origem/Destino (transferencia) e
// Conta (despesa/mercadoria/retirada). Regra (Jose, 27/07):
//   - usuario_admin  -> TODAS as contas do escopo (short-circuit, como nas permissoes);
//   - demais usuarios -> SO as vinculadas em contas_usuarios;
//   - sem nenhum vinculo -> lista VAZIA (o front mostra "peca ao administrador").
export async function listarContasOperaveis(perfil: PerfilEscopo, escopoEmpresas: string[]) {
  if (!escopoEmpresas.length) return [];
  const contas =
    perfil.role === "usuario_admin"
      ? await listarContas(escopoEmpresas)
      : (await listarContasDoUsuarioRepository(perfil.usuarioId)).filter((conta) => escopoEmpresas.includes(conta.empresaId));
  const empresasDasContas = [...new Set(contas.map((conta) => conta.empresaId))];
  const [cofres, pdvs] = await Promise.all([
    Promise.all(empresasDasContas.map((empresaId) => buscarContaCofreEmpresaRepository(empresaId))),
    listarPdvsRepository()
  ]);
  const contasCofreIds = new Set(cofres.filter((id): id is string => Boolean(id)));
  const contasPdvIds = new Set(
    pdvs.filter((pdv) => empresasDasContas.includes(pdv.empresaId)).map((pdv) => pdv.contaId)
  );
  return contas.map((conta) => ({
    ...conta,
    ehCofre: contasCofreIds.has(conta.id),
    ehContaPdv: contasPdvIds.has(conta.id)
  }));
}

// Gancho para a ETAPA 2 (confirmacao de recebimento da transferencia): quem pode CONFIRMAR uma
// conta de destino e o admin ou quem tem essa conta vinculada. Mesma regra dos seletores, por conta.
export async function usuarioPodeOperarConta(perfil: PerfilEscopo, contaId: string): Promise<boolean> {
  if (perfil.role === "usuario_admin") return true;
  return Boolean(await existeVinculoRepository(contaId, perfil.usuarioId));
}

export async function listarContasUsuarios(filtro: {
  empresasPermitidas: string[];
  contaId?: string;
  usuarioId?: string;
}) {
  return listarContasUsuariosRepository(filtro);
}

export async function criarContaUsuario(payload: ContaUsuarioPayload) {
  // A conta tem de existir e pertencer a MESMA empresa do vinculo — evita ligar usuario a conta de
  // outra empresa (o FK garante existencia, nao a empresa).
  return executarEmTransacao(async (tx) => {
    await exigirContaDaEmpresa(payload.contaId, payload.empresaId, tx);
    await exigirUsuarioDaEmpresa(payload.usuarioId, payload.empresaId, tx);

    const existente = await existeVinculoRepository(payload.contaId, payload.usuarioId, tx);
    if (existente) throw erroValidacao("Usuario ja vinculado a esta conta", "VINCULO_DUPLICADO");

    const criado = await criarContaUsuarioRepository(payload, tx);
    return { id: criado?.id ?? "contas-usuarios", ...payload };
  });
}

// Retorna a empresa do vinculo para o controller validar o escopo antes de excluir; null se nao existe.
export async function excluirContaUsuario(id: string, empresasPermitidas: string[]) {
  const vinculo = await buscarContaUsuarioRepository(id);
  if (!vinculo) throw naoEncontrado("Vinculo nao encontrado", "VINCULO_NAO_ENCONTRADO");
  if (!empresasPermitidas.includes(vinculo.empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
  await excluirContaUsuarioRepository(id);
}
