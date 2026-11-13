import { ehAdministradorTotal, type PerfilUsuario } from "@padaria/shared/autenticacao";
import { nomePdvExcluido } from "@padaria/shared/pdvs";
import { empresasPermitidas } from "../auth/empresa.js";
import { executarEmTransacao } from "../banco/conexao.js";
import { buscarContaCofreEmpresaRepository } from "../caixa/caixa.repository.js";
import { saldosComPendenciaDasContasRepository } from "../contas/contas.repository.js";
import { conflito, erroValidacao, naoEncontrado, proibido } from "../erros.js";
import { listarEmpresasUsuarioRepository } from "../usuarios/usuarios.repository.js";
import {
  contaEhDePdvAtivoRepository,
  contarContasDePostoDoPdvRepository,
  desativarContaRepository,
  desativarPdvRepository,
  desativarUsuarioRepository,
  pdvTemCaixaEmAndamentoRepository,
  travarContaRepository,
  travarPdvRepository,
  travarUsuarioRepository,
  usuarioTemCaixaEmAndamentoRepository
} from "./desativacao.repository.js";

// "Excluir" usuario, conta ou PDV (Marco, 13/11/2026) = DESATIVAR. Nada e apagado: o historico e os relatorios
// continuam iguais; o item so sai das listas e deixa de aceitar operacao nova. So o administrador total.

function exigirAdministrador(perfil: PerfilUsuario | undefined): PerfilUsuario {
  if (!perfil || !ehAdministradorTotal(perfil))
    throw proibido("So o administrador pode excluir.", "FORBIDDEN_PRIVILEGE");
  return perfil;
}

function exigirEmpresa(perfil: PerfilUsuario, empresaId: string) {
  if (!empresasPermitidas(perfil).includes(empresaId)) throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
}

const carimbo = () => new Date().toISOString().slice(0, 10).replaceAll("-", "");

export async function desativarPdv(id: string, perfilEntrada?: PerfilUsuario) {
  const perfil = exigirAdministrador(perfilEntrada);
  return executarEmTransacao(async (tx) => {
    const pdv = await travarPdvRepository(id, tx);
    if (!pdv || !pdv.ativo) throw naoEncontrado("PDV nao encontrado");
    exigirEmpresa(perfil, pdv.empresaId);
    if (await pdvTemCaixaEmAndamentoRepository(id, tx))
      throw conflito("Este PDV tem caixa aberto. Feche o caixa antes de excluir.", "PDV_COM_CAIXA_ABERTO");
    const postos = await contarContasDePostoDoPdvRepository(id, tx);
    if (postos > 0)
      throw conflito(
        `Este PDV tem ${postos} conta(s) de posto do Caixa. Exclua ou passe essas contas para outro PDV antes.`,
        "PDV_COM_CONTAS_DE_POSTO"
      );
    await desativarPdvRepository(id, nomePdvExcluido(pdv.nome, carimbo()), tx);
    return { id, nome: pdv.nome };
  });
}

export async function desativarConta(id: string, perfilEntrada?: PerfilUsuario) {
  const perfil = exigirAdministrador(perfilEntrada);
  return executarEmTransacao(async (tx) => {
    const conta = await travarContaRepository(id, tx);
    if (!conta || !conta.ativa) throw naoEncontrado("Conta nao encontrada");
    exigirEmpresa(perfil, conta.empresaId);
    if ((await buscarContaCofreEmpresaRepository(conta.empresaId, tx)) === id)
      throw conflito("O Cofre da empresa nao pode ser excluido.", "CONTA_COFRE");
    const pdv = await contaEhDePdvAtivoRepository(id, tx);
    if (pdv) throw conflito(`Esta conta e do ${pdv}. Exclua o PDV antes.`, "CONTA_DE_PDV_ATIVO");
    const saldo = (await saldosComPendenciaDasContasRepository([conta.empresaId], [id])).get(id);
    if (saldo && (Math.abs(saldo.disponivel) >= 0.005 || Math.abs(saldo.pendente) >= 0.005))
      throw conflito(
        "A conta ainda tem saldo ou transferencia pendente. Zere a conta antes de excluir.",
        "CONTA_COM_SALDO"
      );
    await desativarContaRepository(id, tx);
    return { id, nome: conta.nome };
  });
}

export async function desativarUsuario(usuarioId: string, perfilEntrada?: PerfilUsuario) {
  const perfil = exigirAdministrador(perfilEntrada);
  if (usuarioId === perfil.usuarioId)
    throw erroValidacao("Voce nao pode excluir o proprio usuario.", "USUARIO_PROPRIO");
  return executarEmTransacao(async (tx) => {
    const alvo = await travarUsuarioRepository(usuarioId, tx);
    if (!alvo) throw naoEncontrado("Usuario nao encontrado");
    if (alvo.role !== "usuario_comum")
      throw proibido(
        "Administrador nao e excluido por aqui. Tire o papel de administrador antes.",
        "FORBIDDEN_PRIVILEGE"
      );
    const empresas = (await listarEmpresasUsuarioRepository(usuarioId, tx)).map((item) => item.empresaId);
    if (alvo.empresaId) empresas.push(alvo.empresaId);
    const liberadas = empresasPermitidas(perfil);
    if (!empresas.length || empresas.some((empresaId) => !liberadas.includes(empresaId)))
      throw proibido("Empresa nao permitida", "FORBIDDEN_COMPANY");
    if (await usuarioTemCaixaEmAndamentoRepository(usuarioId, tx))
      throw conflito("Este usuario tem caixa aberto. Feche o caixa antes de excluir.", "USUARIO_COM_CAIXA_ABERTO");
    await desativarUsuarioRepository(usuarioId, `${alvo.email}.desativado-${carimbo()}-${usuarioId.slice(0, 6)}`, tx);
    return { usuarioId, email: alvo.email };
  });
}
