import { and, eq, inArray } from "drizzle-orm";
import {
  cargos,
  colaboradores,
  colaboradoresCargos,
  permissoesCargos,
  permissoesSetores,
  permissoesUsuarios,
  perfisUsuarios,
  setores,
  usuariosEmpresas
} from "@padaria/db/schema/cadastro";
import type { PerfilUsuario, RegrasPermissoes } from "@padaria/shared";
import { banco } from "../banco/conexao.js";

export interface PerfilLinha {
  usuario_id: string;
  empresa_id: string | null;
  colaborador_id: string;
  setor_id: string | null;
  cargo_ids: string[];
  cargos: Array<{ id: string; nome: string }>;
  role: PerfilUsuario["role"];
  nome: string;
  email: string;
  empresa_ids: string[];
  regras_permissoes: {
    setor: RegrasPermissoes | null;
    cargos: RegrasPermissoes[];
    usuario: RegrasPermissoes | null;
  };
}

export async function obterPerfilPorUsuarioId(usuarioId: string): Promise<PerfilLinha | null> {
  const [perfil] = await banco
    .select({
      usuarioId: perfisUsuarios.usuarioId,
      empresaId: perfisUsuarios.empresaId,
      nome: perfisUsuarios.nome,
      email: perfisUsuarios.email,
      role: perfisUsuarios.role
    })
    .from(perfisUsuarios)
    .where(eq(perfisUsuarios.usuarioId, usuarioId))
    .limit(1);

  if (!perfil) return null;

  const [colaborador] = await banco
    .select({
      id: colaboradores.id,
      // A empresa REAL do colaborador. E a ancora de integridade de tudo o que vem abaixo: cargo e
      // setor so valem se pertencerem a ELA.
      empresaId: colaboradores.empresaId,
      setorId: colaboradores.setorId
    })
    .from(colaboradores)
    .where(eq(colaboradores.usuarioId, usuarioId))
    .limit(1);

  if (!colaborador) return null;

  // `setorProprio` entra AQUI, e nao depois: ele depende so de `colaborador`, e este arquivo roda em
  // TODA requisicao autenticada (api/src/auth/guards.ts:29-32). Deixa-lo sequencial somaria um
  // round-trip ao caminho quente so por causa do join novo.
  const [empresas, permissoesDoUsuario, cargosAtivos, setorProprio] = await Promise.all([
    banco
      .select({ empresaId: usuariosEmpresas.empresaId })
      .from(usuariosEmpresas)
      .where(eq(usuariosEmpresas.usuarioId, usuarioId)),
    banco
      .select({ regras: permissoesUsuarios.regras })
      .from(permissoesUsuarios)
      .where(eq(permissoesUsuarios.usuarioId, usuarioId)),
    // As DUAS igualdades de empresa sao o conserto do P1-A. Antes o filtro era so
    // `colaborador_id + ativo`, e o join de `cargos` casava so por id — entao uma linha corrompida
    // (vinculo marcado com outra empresa, ou apontando para cargo de outra empresa) entrava no
    // perfil, resolvia `permissoes_cargos` e ainda devolvia UUID e NOME do cargo estrangeiro para o
    // browser. Medido: um usuario com ZERO permissoes passava a receber 200 numa rota protegida.
    //
    // A ancora e a empresa do proprio colaborador, nao o escopo do ator — de proposito. Isto NAO
    // mexe na P-07 (PROJECT_BRAIN/23 §3), que homologou que o conjunto de permissoes de um cargo
    // legitimo vale em todo o escopo do usuario. O que se recusa aqui e o LINK corrompido: cargo que
    // pertence a uma empresa diferente da do colaborador. Linha legitima sempre tem as duas iguais —
    // quem grava usa a empresa do proprio colaborador (colaboradores.service.ts e
    // usuarios.service.ts), entao nenhum vinculo valido e perdido.
    banco
      .select({ cargoId: colaboradoresCargos.cargoId, cargoNome: cargos.nome })
      .from(colaboradoresCargos)
      .innerJoin(cargos, and(eq(cargos.id, colaboradoresCargos.cargoId), eq(cargos.empresaId, colaborador.empresaId)))
      .where(
        and(
          eq(colaboradoresCargos.colaboradorId, colaborador.id),
          eq(colaboradoresCargos.empresaId, colaborador.empresaId),
          eq(colaboradoresCargos.ativo, true)
        )
      ),
    // Mesmo conserto do lado do setor, e numa consulta so: a partida e `setores` (nao
    // `permissoes_setores`), exigindo que o setor seja da empresa REAL do colaborador. Um ponteiro
    // estrangeiro nao devolve linha — entao nao resolve permissao E nao volta no perfil.
    //
    // `colaboradores.setor_id` tem FK para `setores.id` sem compor `empresa_id`
    // (db/src/schema/app.schema.ts:327), entao apontar para setor de outra empresa e um estado
    // representavel no banco. A CX-M05 fechou a escrita desse ponteiro; aqui fecha a leitura, para o
    // que ja esta gravado parar de conceder.
    //
    // `leftJoin` e NAO `innerJoin` em `permissoes_setores`: setor legitimo SEM regras cadastradas
    // (o caso comum — o seed inteiro e assim) precisa continuar devolvendo `setor_id`. Com
    // `innerJoin` o campo sumiria para quase todo usuario real.
    colaborador.setorId
      ? banco
          .select({ id: setores.id, regras: permissoesSetores.regras })
          .from(setores)
          .leftJoin(permissoesSetores, eq(permissoesSetores.setorId, setores.id))
          .where(and(eq(setores.id, colaborador.setorId), eq(setores.empresaId, colaborador.empresaId)))
          .limit(1)
      : Promise.resolve([])
  ]);

  const cargosPerfil = cargosAtivos.map((cargo) => ({ id: cargo.cargoId, nome: cargo.cargoNome }));
  const permissoesDosCargos = cargosPerfil.length
    ? await banco
        .select({ regras: permissoesCargos.regras })
        .from(permissoesCargos)
        .where(
          inArray(
            permissoesCargos.cargoId,
            cargosPerfil.map((cargo) => cargo.id)
          )
        )
    : [];

  const setorId = setorProprio[0]?.id ?? null;
  const permissoesDoSetor = setorProprio[0]?.regras ? [{ regras: setorProprio[0].regras }] : [];

  return {
    usuario_id: perfil.usuarioId,
    empresa_id: perfil.empresaId,
    colaborador_id: colaborador.id,
    setor_id: setorId,
    cargo_ids: cargosPerfil.map((cargo) => cargo.id),
    cargos: cargosPerfil,
    role: perfil.role,
    nome: perfil.nome,
    email: perfil.email,
    empresa_ids: empresas.map((empresa) => empresa.empresaId),
    regras_permissoes: {
      setor: permissoesDoSetor[0]?.regras ?? null,
      cargos: permissoesDosCargos.map((permissao) => permissao.regras),
      usuario: permissoesDoUsuario[0]?.regras ?? null
    }
  };
}
