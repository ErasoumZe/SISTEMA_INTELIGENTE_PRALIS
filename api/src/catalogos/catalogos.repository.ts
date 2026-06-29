import { asc, eq } from "drizzle-orm";
import {
  areas,
  cargos,
  colaboradores,
  colaboradoresCargos,
  contas,
  empresas,
  formasPagamento,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  pdvs,
  permissoesCargos,
  permissoesSetores,
  permissoesTabela,
  permissoesUsuarios,
  perfisUsuarios,
  produtos,
  setores,
  unidadesMedida,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import { banco } from "../banco/conexao.js";

type GrupoLinhaBase = {
  id: string;
  empresaId: string;
  nome: string;
  grupoPaiId: string | null;
};

export type GrupoLinha = GrupoLinhaBase & {
  nivel: number;
  selecionavel: boolean;
};

export type UsuarioCatalogoLinha = {
  usuarioId: string;
  empresaId: string | null;
  empresaIds: string[];
  nome: string;
  email: string;
  colaboradorId: string;
  setorId: string | null;
  cargoIds: string[];
  cargos: string[];
  role: string;
};

function ordenarGrupos(linhas: GrupoLinhaBase[]): GrupoLinha[] {
  const filhosPorPai = new Map<string | null, GrupoLinhaBase[]>();
  for (const linha of linhas) {
    const filhos = filhosPorPai.get(linha.grupoPaiId) ?? [];
    filhos.push(linha);
    filhosPorPai.set(linha.grupoPaiId, filhos);
  }
  for (const filhos of filhosPorPai.values()) filhos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  const resultado: GrupoLinha[] = [];
  const visitar = (grupo: GrupoLinhaBase, nivel: number) => {
    const filhos = filhosPorPai.get(grupo.id) ?? [];
    resultado.push({ ...grupo, nivel, selecionavel: filhos.length === 0 });
    for (const filho of filhos) visitar(filho, nivel + 1);
  };
  for (const raiz of filhosPorPai.get(null) ?? []) visitar(raiz, 0);
  return resultado;
}

export async function listarEmpresasRepository() {
  return banco.select({ id: empresas.id, nome: empresas.nome }).from(empresas).orderBy(asc(empresas.nome));
}

export async function listarContasRepository() {
  return banco
    .select({ id: contas.id, empresaId: contas.empresaId, nome: contas.nome })
    .from(contas)
    .orderBy(asc(contas.nome));
}

export async function listarFormasPagamentoRepository() {
  return banco
    .select({ id: formasPagamento.id, empresaId: formasPagamento.empresaId, nome: formasPagamento.nome })
    .from(formasPagamento)
    .orderBy(asc(formasPagamento.nome));
}

export async function listarPdvsRepository() {
  return banco
    .select({
      id: pdvs.id,
      empresaId: pdvs.empresaId,
      nome: pdvs.nome,
      codigo: pdvs.codigo,
      contaId: pdvs.contaId,
      ativo: pdvs.ativo
    })
    .from(pdvs)
    .orderBy(asc(pdvs.nome));
}

export async function listarFornecedoresRepository() {
  return banco
    .select({ id: fornecedores.id, empresaId: fornecedores.empresaId, nome: fornecedores.nome })
    .from(fornecedores)
    .orderBy(asc(fornecedores.nome));
}

export async function listarColaboradoresRepository() {
  return banco
    .select({
      id: colaboradores.id,
      empresaId: colaboradores.empresaId,
      nome: colaboradores.nome,
      cpf: colaboradores.cpf,
      setorId: colaboradores.setorId,
      usuarioId: colaboradores.usuarioId
    })
    .from(colaboradores)
    .orderBy(asc(colaboradores.nome));
}

export async function listarGruposRepository() {
  const [despesas, mercadorias, retiradas] = await Promise.all([
    banco
      .select({
        id: gruposDespesas.id,
        empresaId: gruposDespesas.empresaId,
        nome: gruposDespesas.nome,
        grupoPaiId: gruposDespesas.grupoPaiId
      })
      .from(gruposDespesas),
    banco
      .select({
        id: gruposMercadorias.id,
        empresaId: gruposMercadorias.empresaId,
        nome: gruposMercadorias.nome,
        grupoPaiId: gruposMercadorias.grupoPaiId
      })
      .from(gruposMercadorias),
    banco
      .select({
        id: gruposRetiradas.id,
        empresaId: gruposRetiradas.empresaId,
        nome: gruposRetiradas.nome,
        grupoPaiId: gruposRetiradas.grupoPaiId
      })
      .from(gruposRetiradas)
  ]);
  return {
    gruposDespesas: ordenarGrupos(despesas),
    gruposMercadorias: ordenarGrupos(mercadorias),
    gruposRetiradas: ordenarGrupos(retiradas)
  };
}

export async function listarUnidadesMedidaRepository() {
  return banco
    .select({
      id: unidadesMedida.id,
      empresaId: unidadesMedida.empresaId,
      nome: unidadesMedida.nome,
      sigla: unidadesMedida.sigla
    })
    .from(unidadesMedida)
    .orderBy(asc(unidadesMedida.nome));
}

export async function listarAreasRepository() {
  return banco
    .select({ id: areas.id, empresaId: areas.empresaId, nome: areas.nome })
    .from(areas)
    .orderBy(asc(areas.nome));
}

export async function listarSetoresRepository() {
  return banco
    .select({
      id: setores.id,
      empresaId: setores.empresaId,
      areaId: setores.areaId,
      setorPaiId: setores.setorPaiId,
      nome: setores.nome
    })
    .from(setores)
    .orderBy(asc(setores.nome));
}

export async function listarProdutosRepository() {
  return banco
    .select({ id: produtos.id, empresaId: produtos.empresaId, descricao: produtos.descricao })
    .from(produtos)
    .orderBy(asc(produtos.descricao));
}

export async function listarUsuariosRepository(): Promise<UsuarioCatalogoLinha[]> {
  const [perfis, empresasUsuarios, colaboradoresUsuarios, cargosUsuarios] = await Promise.all([
    banco
      .select({
        usuarioId: perfisUsuarios.usuarioId,
        empresaId: perfisUsuarios.empresaId,
        nome: perfisUsuarios.nome,
        email: perfisUsuarios.email,
        role: perfisUsuarios.role
      })
      .from(perfisUsuarios)
      .orderBy(asc(perfisUsuarios.nome)),
    banco
      .select({ usuarioId: usuariosEmpresas.usuarioId, empresaId: usuariosEmpresas.empresaId })
      .from(usuariosEmpresas),
    banco
      .select({ id: colaboradores.id, usuarioId: colaboradores.usuarioId, setorId: colaboradores.setorId })
      .from(colaboradores),
    banco
      .select({
        colaboradorId: colaboradoresCargos.colaboradorId,
        cargoId: colaboradoresCargos.cargoId,
        cargoNome: cargos.nome
      })
      .from(colaboradoresCargos)
      .innerJoin(cargos, eq(cargos.id, colaboradoresCargos.cargoId))
      .where(eq(colaboradoresCargos.ativo, true))
  ]);

  return perfis.map((perfil) => {
    const colaborador = colaboradoresUsuarios.find((item) => item.usuarioId === perfil.usuarioId);
    const cargosDoUsuario = colaborador ? cargosUsuarios.filter((cargo) => cargo.colaboradorId === colaborador.id) : [];
    return {
      usuarioId: perfil.usuarioId,
      empresaId: perfil.empresaId,
      empresaIds: empresasUsuarios
        .filter((empresa) => empresa.usuarioId === perfil.usuarioId)
        .map((empresa) => empresa.empresaId),
      nome: perfil.nome,
      email: perfil.email,
      colaboradorId: colaborador?.id ?? "",
      setorId: colaborador?.setorId ?? null,
      cargoIds: cargosDoUsuario.map((cargo) => cargo.cargoId),
      cargos: cargosDoUsuario.map((cargo) => cargo.cargoNome),
      role: perfil.role
    };
  });
}

export async function listarPermissoesRepository() {
  const [permissoes, cargosLista, cargosPermissoes, setoresLista, setoresPermissoes, usuarios, usuariosPermissoes] =
    await Promise.all([
      banco
        .select({ codigo: permissoesTabela.codigo, nome: permissoesTabela.nome, descricao: permissoesTabela.descricao })
        .from(permissoesTabela)
        .orderBy(asc(permissoesTabela.codigo)),
      banco
        .select({ id: cargos.id, empresaId: cargos.empresaId, nome: cargos.nome })
        .from(cargos)
        .orderBy(asc(cargos.nome)),
      banco
        .select({ cargoId: permissoesCargos.cargoId, permissaoCodigo: permissoesCargos.permissaoCodigo })
        .from(permissoesCargos)
        .orderBy(asc(permissoesCargos.cargoId), asc(permissoesCargos.permissaoCodigo)),
      listarSetoresRepository(),
      banco
        .select({ setorId: permissoesSetores.setorId, permissaoCodigo: permissoesSetores.permissaoCodigo })
        .from(permissoesSetores)
        .orderBy(asc(permissoesSetores.setorId), asc(permissoesSetores.permissaoCodigo)),
      listarUsuariosRepository(),
      banco
        .select({ usuarioId: permissoesUsuarios.usuarioId, permissaoCodigo: permissoesUsuarios.permissaoCodigo })
        .from(permissoesUsuarios)
        .orderBy(asc(permissoesUsuarios.usuarioId), asc(permissoesUsuarios.permissaoCodigo))
    ]);

  return {
    permissoes,
    cargos: cargosLista,
    cargosPermissoes,
    setores: setoresLista,
    setoresPermissoes,
    usuarios,
    usuariosPermissoes
  };
}

export async function existeColaboradorEmpresaRepository(colaboradorId: string, empresaId: string) {
  const [colaborador] = await banco
    .select({ id: colaboradores.id })
    .from(colaboradores)
    .where(eq(colaboradores.id, colaboradorId))
    .limit(1);
  return (
    Boolean(colaborador) &&
    (await listarColaboradoresRepository()).some((item) => item.id === colaboradorId && item.empresaId === empresaId)
  );
}
