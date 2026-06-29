import { and, eq, ilike, ne } from "drizzle-orm";
import {
  areas,
  cargos,
  clientes,
  colaboradoresCargos,
  colaboradores,
  contas,
  empresas,
  formasPagamento,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  gruposVendas,
  pdvs,
  permissoesCargos,
  permissoesSetores,
  permissoesUsuarios,
  perfisUsuarios,
  produtos,
  produtosConversoes,
  setores,
  unidadesMedida,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import { usuarioAutenticacao } from "@padaria/db/schema/autenticacao";
import type { Permissao, RegrasPermissoes, RoleUsuario } from "@padaria/shared";
import { banco, type ExecutorBanco } from "../banco/conexao.js";

type GrupoTipo = "despesa" | "mercadoria" | "retirada" | "vendas";
type TabelaGrupo = typeof gruposDespesas | typeof gruposMercadorias | typeof gruposRetiradas | typeof gruposVendas;

function tabelaGrupo(tipo: GrupoTipo): TabelaGrupo {
  if (tipo === "despesa") return gruposDespesas;
  if (tipo === "mercadoria") return gruposMercadorias;
  if (tipo === "retirada") return gruposRetiradas;
  return gruposVendas;
}

export async function salvarEmpresaRepository(input: { id?: string; nome: string; cnpj: string | null }, db: ExecutorBanco = banco) {
  if (input.id) {
    await db.update(empresas).set({ nome: input.nome, cnpj: input.cnpj }).where(eq(empresas.id, input.id));
    return { id: input.id, nome: input.nome, cnpj: input.cnpj };
  }
  const [criada] = await db.insert(empresas).values({ nome: input.nome, cnpj: input.cnpj }).returning({ id: empresas.id });
  return criada;
}

export async function salvarFornecedorRepository(
  input: { id?: string; empresaId: string; nome: string; documento: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(fornecedores)
      .set({ nome: input.nome, documento: input.documento })
      .where(and(eq(fornecedores.id, input.id), eq(fornecedores.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(fornecedores)
    .values({ empresaId: input.empresaId, nome: input.nome, documento: input.documento })
    .returning({ id: fornecedores.id });
  return criado;
}

export async function salvarClienteRepository(
  input: {
    id?: string;
    empresaId: string;
    nome: string;
    documento: string | null;
    dataNascimento: string | null;
    whatsapp: string | null;
    email: string | null;
    cep: string | null;
    rua: string | null;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    estado: string | null;
  },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(clientes)
      .set({
        nome: input.nome,
        documento: input.documento,
        dataNascimento: input.dataNascimento,
        whatsapp: input.whatsapp,
        email: input.email,
        cep: input.cep,
        rua: input.rua,
        numero: input.numero,
        complemento: input.complemento,
        bairro: input.bairro,
        cidade: input.cidade,
        estado: input.estado,
        atualizadoEm: new Date()
      })
      .where(and(eq(clientes.id, input.id), eq(clientes.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(clientes)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      documento: input.documento,
      dataNascimento: input.dataNascimento,
      whatsapp: input.whatsapp,
      email: input.email,
      cep: input.cep,
      rua: input.rua,
      numero: input.numero,
      complemento: input.complemento,
      bairro: input.bairro,
      cidade: input.cidade,
      estado: input.estado
    })
    .returning({ id: clientes.id });
  return criado;
}

export async function salvarColaboradorRepository(
  input: { id?: string; empresaId: string; nome: string; cpf: string | null; setorId?: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(colaboradores)
      .set({ nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null })
      .where(and(eq(colaboradores.id, input.id), eq(colaboradores.empresaId, input.empresaId)));
    return {
      id: input.id,
      empresaId: input.empresaId,
      nome: input.nome,
      cpf: input.cpf,
      setorId: input.setorId ?? null
    };
  }
  const [criado] = await db
    .insert(colaboradores)
    .values({ empresaId: input.empresaId, nome: input.nome, cpf: input.cpf, setorId: input.setorId ?? null })
    .returning({ id: colaboradores.id });
  return criado;
}

export async function salvarCargoColaboradorRepository(
  input: {
    empresaId: string;
    colaboradorId: string;
    setorId: string | null;
    cargoId: string;
    remuneracaoMinuto: number;
    dataInicio: string;
    ativo: boolean;
  },
  db: ExecutorBanco = banco
) {
  const [criado] = await db
    .insert(colaboradoresCargos)
    .values({
      empresaId: input.empresaId,
      colaboradorId: input.colaboradorId,
      setorId: input.setorId,
      cargoId: input.cargoId,
      remuneracaoMinuto: String(input.remuneracaoMinuto),
      dataInicio: input.dataInicio,
      ativo: input.ativo
    })
    .returning({ id: colaboradoresCargos.id });
  return criado;
}

export async function salvarContaRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(contas)
      .set({ nome: input.nome })
      .where(and(eq(contas.id, input.id), eq(contas.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(contas)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: contas.id });
  return criada;
}

export async function salvarFormaPagamentoRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(formasPagamento)
      .set({ nome: input.nome, atualizadoEm: new Date() })
      .where(and(eq(formasPagamento.id, input.id), eq(formasPagamento.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(formasPagamento)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: formasPagamento.id });
  return criada;
}

export async function buscarContaEmpresaRepository(contaId: string, db: ExecutorBanco = banco) {
  const [conta] = await db
    .select({ id: contas.id, empresaId: contas.empresaId })
    .from(contas)
    .where(eq(contas.id, contaId))
    .limit(1);
  return conta ?? null;
}

export async function salvarPdvRepository(
  input: { id?: string; empresaId: string; nome: string; contaId: string; ativo: boolean },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(pdvs)
      .set({
        nome: input.nome,
        contaId: input.contaId,
        ativo: input.ativo,
        atualizadoEm: new Date()
      })
      .where(and(eq(pdvs.id, input.id), eq(pdvs.empresaId, input.empresaId)));
    return input;
  }
  const [criado] = await db
    .insert(pdvs)
    .values({
      empresaId: input.empresaId,
      nome: input.nome,
      contaId: input.contaId,
      ativo: input.ativo
    })
    .returning({ id: pdvs.id });
  return criado;
}

export async function salvarProdutoRepository(
  input: {
    id?: string;
    empresaId: string;
    codigo: string | null;
    codigoBarras: string | null;
    descricao: string;
    marca: string | null;
    unidadeIndividualId: string;
    quantidadeIndividual: number;
    grupoMercadoriaId: string | null;
    conversoes: Array<{ unidadeMedidaId: string; quantidade: number; unidadesIndividuais: number }>;
  }
) {
  return banco.transaction(async (tx) => {
    const valores = {
      empresaId: input.empresaId,
      codigo: input.codigo,
      codigoBarras: input.codigoBarras,
      descricao: input.descricao,
      marca: input.marca,
      unidadeMedidaId: input.unidadeIndividualId,
      unidadeIndividualId: input.unidadeIndividualId,
      quantidadeIndividual: String(input.quantidadeIndividual),
      grupoMercadoriaId: input.grupoMercadoriaId
    };
    const produtoId = input.id
      ? input.id
      : (
          await tx
            .insert(produtos)
            .values(valores)
            .returning({ id: produtos.id })
        )[0]?.id;
    if (!produtoId) throw new Error("Produto nao criado");
    if (input.id) {
      await tx
        .update(produtos)
        .set(valores)
        .where(and(eq(produtos.id, input.id), eq(produtos.empresaId, input.empresaId)));
    }
    await tx.delete(produtosConversoes).where(eq(produtosConversoes.produtoId, produtoId));
    if (input.conversoes.length) {
      await tx.insert(produtosConversoes).values(
        input.conversoes.map((conversao) => ({
          produtoId,
          unidadeMedidaId: conversao.unidadeMedidaId,
          quantidade: String(conversao.quantidade),
          unidadesIndividuais: String(conversao.unidadesIndividuais)
        }))
      );
    }
    return { id: produtoId, empresaId: input.empresaId };
  });
}

export async function salvarUnidadeRepository(
  input: { id?: string; empresaId: string; nome: string; sigla: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(unidadesMedida)
      .set({ nome: input.nome, sigla: input.sigla })
      .where(and(eq(unidadesMedida.id, input.id), eq(unidadesMedida.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome, sigla: input.sigla };
  }
  const [criada] = await db
    .insert(unidadesMedida)
    .values({ empresaId: input.empresaId, nome: input.nome, sigla: input.sigla })
    .returning({ id: unidadesMedida.id });
  return criada;
}

export async function salvarGrupoRepository(
  input: { id?: string; empresaId: string; tipoGrupo: GrupoTipo; nome: string; grupoPaiId: string | null },
  db: ExecutorBanco = banco
) {
  const tabela = tabelaGrupo(input.tipoGrupo);
  if (input.id) {
    await db
      .update(tabela)
      .set({ nome: input.nome, grupoPaiId: input.grupoPaiId })
      .where(and(eq(tabela.id, input.id), eq(tabela.empresaId, input.empresaId)));
    return {
      id: input.id,
      empresaId: input.empresaId,
      tipoGrupo: input.tipoGrupo,
      nome: input.nome,
      grupoPaiId: input.grupoPaiId
    };
  }
  const [criado] = await db
    .insert(tabela)
    .values({ empresaId: input.empresaId, nome: input.nome, grupoPaiId: input.grupoPaiId })
    .returning({ id: tabela.id });
  return criado;
}

export async function salvarAreaRepository(
  input: { id?: string; empresaId: string; nome: string },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(areas)
      .set({ nome: input.nome })
      .where(and(eq(areas.id, input.id), eq(areas.empresaId, input.empresaId)));
    return { id: input.id, empresaId: input.empresaId, nome: input.nome };
  }
  const [criada] = await db
    .insert(areas)
    .values({ empresaId: input.empresaId, nome: input.nome })
    .returning({ id: areas.id });
  return criada;
}

export async function salvarSetorRepository(
  input: { id?: string; empresaId: string; nome: string; areaId: string | null; setorPaiId: string | null },
  db: ExecutorBanco = banco
) {
  if (input.id) {
    await db
      .update(setores)
      .set({ nome: input.nome, areaId: input.areaId, setorPaiId: input.setorPaiId })
      .where(and(eq(setores.id, input.id), eq(setores.empresaId, input.empresaId)));
    return {
      id: input.id,
      empresaId: input.empresaId,
      nome: input.nome,
      areaId: input.areaId,
      setorPaiId: input.setorPaiId
    };
  }
  const [criado] = await db
    .insert(setores)
    .values({ empresaId: input.empresaId, nome: input.nome, areaId: input.areaId, setorPaiId: input.setorPaiId })
    .returning({ id: setores.id });
  return criado;
}

export async function existeEmailUsuarioRepository(
  email: string,
  usuarioIdIgnorado?: string,
  db: ExecutorBanco = banco
) {
  const filtros = [ilike(usuarioAutenticacao.email, email)];
  if (usuarioIdIgnorado) filtros.push(ne(usuarioAutenticacao.id, usuarioIdIgnorado));
  const [existente] = await db
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(and(...filtros))
    .limit(1);
  return Boolean(existente);
}

export async function atualizarUsuarioAutenticacaoRepository(
  input: { id: string; nome: string; email: string },
  db: ExecutorBanco = banco
) {
  await db
    .update(usuarioAutenticacao)
    .set({ name: input.nome, email: input.email, updatedAt: new Date() })
    .where(eq(usuarioAutenticacao.id, input.id));
}

export async function buscarUsuarioAutenticacaoPorEmailRepository(email: string, db: ExecutorBanco = banco) {
  const [usuario] = await db
    .select({ id: usuarioAutenticacao.id })
    .from(usuarioAutenticacao)
    .where(ilike(usuarioAutenticacao.email, email))
    .limit(1);
  return usuario ?? null;
}

export async function upsertPerfilUsuarioRepository(
  input: { usuarioId: string; empresaId: string; nome: string; email: string; role?: RoleUsuario },
  db: ExecutorBanco = banco
) {
  await db
    .insert(perfisUsuarios)
    .values({ ...input, role: input.role ?? "usuario_comum" })
    .onConflictDoUpdate({
      target: perfisUsuarios.usuarioId,
      set: {
        empresaId: input.empresaId,
        nome: input.nome,
        email: input.email,
        ...(input.role ? { role: input.role } : {}),
        atualizadoEm: new Date()
      }
    });
}

export async function substituirEmpresasUsuarioRepository(
  usuarioId: string,
  empresaIds: string[],
  db: ExecutorBanco = banco
) {
  await db.delete(usuariosEmpresas).where(eq(usuariosEmpresas.usuarioId, usuarioId));
  if (!empresaIds.length) return;
  await db
    .insert(usuariosEmpresas)
    .values(empresaIds.map((empresaId) => ({ usuarioId, empresaId })))
    .onConflictDoNothing();
}

export async function buscarColaboradorUsuarioRepository(colaboradorId: string, db: ExecutorBanco = banco) {
  const [colaborador] = await db
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      usuarioId: colaboradores.usuarioId,
      setorId: colaboradores.setorId
    })
    .from(colaboradores)
    .where(eq(colaboradores.id, colaboradorId))
    .limit(1);
  return colaborador ?? null;
}

export async function buscarCargoEmpresaRepository(cargoId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db.select({ empresaId: cargos.empresaId }).from(cargos).where(eq(cargos.id, cargoId)).limit(1);
  return cargo ?? null;
}

export async function buscarSetorEmpresaRepository(setorId: string, db: ExecutorBanco = banco) {
  const [setor] = await db
    .select({ empresaId: setores.empresaId })
    .from(setores)
    .where(eq(setores.id, setorId))
    .limit(1);
  return setor ?? null;
}

export async function listarEmpresasUsuarioRepository(usuarioId: string, db: ExecutorBanco = banco) {
  return db
    .select({ empresaId: usuariosEmpresas.empresaId })
    .from(usuariosEmpresas)
    .where(eq(usuariosEmpresas.usuarioId, usuarioId));
}

export async function colaboradorTemCargoAtivoRepository(colaboradorId: string, db: ExecutorBanco = banco) {
  const [cargo] = await db
    .select({ id: colaboradoresCargos.id })
    .from(colaboradoresCargos)
    .where(and(eq(colaboradoresCargos.colaboradorId, colaboradorId), eq(colaboradoresCargos.ativo, true)))
    .limit(1);
  return Boolean(cargo);
}

export async function vincularUsuarioColaboradorRepository(
  usuarioId: string,
  colaboradorId: string,
  db: ExecutorBanco = banco
) {
  await db.update(colaboradores).set({ usuarioId: null }).where(eq(colaboradores.usuarioId, usuarioId));
  await db.update(colaboradores).set({ usuarioId }).where(eq(colaboradores.id, colaboradorId));
}

export async function substituirPermissoesCargoRepository(
  cargoId: string,
  regras: RegrasPermissoes,
  db: ExecutorBanco = banco
) {
  await db.delete(permissoesCargos).where(eq(permissoesCargos.cargoId, cargoId));
  if (!Object.keys(regras).length) return;
  await db.insert(permissoesCargos).values({ cargoId, regras }).onConflictDoNothing();
}

export async function substituirPermissoesSetorRepository(
  setorId: string,
  regras: RegrasPermissoes,
  db: ExecutorBanco = banco
) {
  await db.delete(permissoesSetores).where(eq(permissoesSetores.setorId, setorId));
  if (!Object.keys(regras).length) return;
  await db.insert(permissoesSetores).values({ setorId, regras }).onConflictDoNothing();
}

export async function substituirPermissoesUsuarioRepository(
  usuarioId: string,
  regras: RegrasPermissoes,
  db: ExecutorBanco = banco
) {
  await db.delete(permissoesUsuarios).where(eq(permissoesUsuarios.usuarioId, usuarioId));
  if (!Object.keys(regras).length) return;
  await db.insert(permissoesUsuarios).values({ usuarioId, regras }).onConflictDoNothing();
}

function removerRegraPermissao(regras: RegrasPermissoes | null | undefined, permissao: Permissao): RegrasPermissoes {
  const proximas = { ...(regras ?? {}) };
  delete proximas[permissao];
  return proximas;
}

export async function excluirPermissaoCargoRepository(cargoId: string, permissao: Permissao, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ regras: permissoesCargos.regras })
    .from(permissoesCargos)
    .where(eq(permissoesCargos.cargoId, cargoId))
    .limit(1);
  const regras = removerRegraPermissao(linha?.regras, permissao);
  await db.delete(permissoesCargos).where(eq(permissoesCargos.cargoId, cargoId));
  if (Object.keys(regras).length) await db.insert(permissoesCargos).values({ cargoId, regras }).onConflictDoNothing();
}

export async function excluirPermissaoSetorRepository(setorId: string, permissao: Permissao, db: ExecutorBanco = banco) {
  const [linha] = await db
    .select({ regras: permissoesSetores.regras })
    .from(permissoesSetores)
    .where(eq(permissoesSetores.setorId, setorId))
    .limit(1);
  const regras = removerRegraPermissao(linha?.regras, permissao);
  await db.delete(permissoesSetores).where(eq(permissoesSetores.setorId, setorId));
  if (Object.keys(regras).length) await db.insert(permissoesSetores).values({ setorId, regras }).onConflictDoNothing();
}

export async function excluirPermissaoUsuarioRepository(
  usuarioId: string,
  permissao: Permissao,
  db: ExecutorBanco = banco
) {
  const [linha] = await db
    .select({ regras: permissoesUsuarios.regras })
    .from(permissoesUsuarios)
    .where(eq(permissoesUsuarios.usuarioId, usuarioId))
    .limit(1);
  const regras = removerRegraPermissao(linha?.regras, permissao);
  await db.delete(permissoesUsuarios).where(eq(permissoesUsuarios.usuarioId, usuarioId));
  if (Object.keys(regras).length) await db.insert(permissoesUsuarios).values({ usuarioId, regras }).onConflictDoNothing();
}
