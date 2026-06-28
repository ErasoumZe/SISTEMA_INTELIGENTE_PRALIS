import { eq } from "drizzle-orm";
import {
  areas,
  cargos,
  colaboradores,
  contas,
  fornecedores,
  gruposDespesas,
  gruposMercadorias,
  gruposRetiradas,
  lacresMalotes,
  malotes,
  produtos,
  setores,
  unidadesMedida
} from "@padaria/db/schema/cadastro";
import { executarEmTransacao, type ExecutorBanco } from "../banco/conexao.js";

type FiltroCopia = { id?: string; empresaOrigemId?: string };
type ModoCopia = "simples" | "completo";
type ResultadoCopia = { tipo: string; inseridos: number };
type EntidadeComEmpresa = { id: string; empresaId: string };

function permitido(linha: EntidadeComEmpresa, empresasPermitidasIds: string[] | null): boolean {
  return empresasPermitidasIds === null || empresasPermitidasIds.includes(linha.empresaId);
}

function filtrarOrigem<T extends EntidadeComEmpresa>(
  linhas: T[],
  filtro: FiltroCopia,
  empresasPermitidasIds: string[] | null
): T[] {
  return linhas.filter((linha) => {
    const origemCorreta = filtro.id ? linha.id === filtro.id : linha.empresaId === filtro.empresaOrigemId;
    return origemCorreta && permitido(linha, empresasPermitidasIds);
  });
}

function jaImportado<T extends { importadoDe: string | null; idImportado: string | null }>(
  destinos: T[],
  importadoDe: string,
  idImportado: string
) {
  return destinos.some((destino) => destino.importadoDe === importadoDe && destino.idImportado === idImportado);
}

async function copiarContas(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(contas), filtro, permitidas);
  const destinos = await db.select().from(contas).where(eq(contas.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const conta of origem) {
    if (jaImportado(destinos, conta.empresaId, conta.id)) continue;
    await db
      .insert(contas)
      .values({ empresaId: empresaDestinoId, nome: conta.nome, importadoDe: conta.empresaId, idImportado: conta.id });
    inseridos += 1;
  }
  return inseridos;
}

async function copiarFornecedores(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(fornecedores), filtro, permitidas);
  const destinos = await db.select().from(fornecedores).where(eq(fornecedores.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const fornecedor of origem) {
    if (jaImportado(destinos, fornecedor.empresaId, fornecedor.id)) continue;
    await db.insert(fornecedores).values({
      empresaId: empresaDestinoId,
      nome: fornecedor.nome,
      documento: fornecedor.documento,
      importadoDe: fornecedor.empresaId,
      idImportado: fornecedor.id
    });
    inseridos += 1;
  }
  return inseridos;
}

async function copiarColaboradores(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(colaboradores), filtro, permitidas);
  const destinos = await db.select().from(colaboradores).where(eq(colaboradores.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const colaborador of origem) {
    if (jaImportado(destinos, colaborador.empresaId, colaborador.id)) continue;
    await db.insert(colaboradores).values({
      empresaId: empresaDestinoId,
      nome: colaborador.nome,
      cpf: colaborador.cpf,
      setorId: null,
      usuarioId: null,
      importadoDe: colaborador.empresaId,
      idImportado: colaborador.id
    });
    inseridos += 1;
  }
  return inseridos;
}

async function copiarGrupos(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  let inseridos = 0;
  const specs = [gruposDespesas, gruposMercadorias, gruposRetiradas] as const;
  for (const tabela of specs) {
    const origem = filtrarOrigem(await db.select().from(tabela), filtro, permitidas);
    const destinos = await db.select().from(tabela).where(eq(tabela.empresaId, empresaDestinoId));
    for (const grupo of origem) {
      if (jaImportado(destinos, grupo.empresaId, grupo.id)) continue;
      await db.insert(tabela).values({
        empresaId: empresaDestinoId,
        nome: grupo.nome,
        grupoPaiId: null,
        importadoDe: grupo.empresaId,
        idImportado: grupo.id
      });
      inseridos += 1;
    }
  }
  return inseridos;
}

async function copiarUnidades(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(unidadesMedida), filtro, permitidas);
  const destinos = await db.select().from(unidadesMedida).where(eq(unidadesMedida.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const unidade of origem) {
    if (jaImportado(destinos, unidade.empresaId, unidade.id)) continue;
    await db.insert(unidadesMedida).values({
      empresaId: empresaDestinoId,
      nome: unidade.nome,
      sigla: unidade.sigla,
      importadoDe: unidade.empresaId,
      idImportado: unidade.id
    });
    inseridos += 1;
  }
  return inseridos;
}

async function copiarAreasSetores(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const areasOrigem = filtrarOrigem(await db.select().from(areas), filtro, permitidas);
  const setoresOrigem = filtrarOrigem(await db.select().from(setores), filtro, permitidas);
  const areasDestino = await db.select().from(areas).where(eq(areas.empresaId, empresaDestinoId));
  const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const area of areasOrigem) {
    if (jaImportado(areasDestino, area.empresaId, area.id)) continue;
    await db
      .insert(areas)
      .values({ empresaId: empresaDestinoId, nome: area.nome, importadoDe: area.empresaId, idImportado: area.id });
    inseridos += 1;
  }
  for (const setor of setoresOrigem) {
    if (jaImportado(setoresDestino, setor.empresaId, setor.id)) continue;
    await db.insert(setores).values({
      empresaId: empresaDestinoId,
      nome: setor.nome,
      areaId: null,
      setorPaiId: null,
      importadoDe: setor.empresaId,
      idImportado: setor.id
    });
    inseridos += 1;
  }
  return inseridos;
}

async function copiarCargos(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(cargos), filtro, permitidas);
  const destinos = await db.select().from(cargos).where(eq(cargos.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const cargo of origem) {
    if (jaImportado(destinos, cargo.empresaId, cargo.id)) continue;
    await db
      .insert(cargos)
      .values({ empresaId: empresaDestinoId, nome: cargo.nome, importadoDe: cargo.empresaId, idImportado: cargo.id })
      .onConflictDoNothing();
    inseridos += 1;
  }
  return inseridos;
}

async function copiarProdutos(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(produtos), filtro, permitidas);
  const destinos = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const produto of origem) {
    if (jaImportado(destinos, produto.empresaId, produto.id)) continue;
    await db.insert(produtos).values({
      empresaId: empresaDestinoId,
      codigo: produto.codigo,
      codigoBarras: produto.codigoBarras,
      descricao: produto.descricao,
      grupoMercadoriaId: null,
      unidadeMedidaId: null,
      importadoDe: produto.empresaId,
      idImportado: produto.id
    });
    inseridos += 1;
  }
  return inseridos;
}

async function copiarMalotes(
  filtro: FiltroCopia,
  empresaDestinoId: string,
  permitidas: string[] | null,
  db: ExecutorBanco
) {
  const origem = filtrarOrigem(await db.select().from(malotes), filtro, permitidas);
  const destinos = await db.select().from(malotes).where(eq(malotes.empresaId, empresaDestinoId));
  let inseridos = 0;
  for (const malote of origem) {
    if (jaImportado(destinos, malote.empresaId, malote.id)) continue;
    await db.insert(malotes).values({
      empresaId: empresaDestinoId,
      codigo: malote.codigo,
      descricao: malote.descricao,
      criadoPor: null,
      importadoDe: malote.empresaId,
      idImportado: malote.id
    });
    inseridos += 1;
  }
  return inseridos;
}

async function completarGrupos(empresaDestinoId: string, db: ExecutorBanco) {
  for (const tabela of [gruposDespesas, gruposMercadorias, gruposRetiradas] as const) {
    const destinos = await db.select().from(tabela).where(eq(tabela.empresaId, empresaDestinoId));
    const origens = await db.select().from(tabela);
    for (const destino of destinos) {
      if (!destino.importadoDe || !destino.idImportado) continue;
      const origem = origens.find((item) => item.id === destino.idImportado);
      if (!origem?.grupoPaiId) continue;
      const paiDestino = destinos.find(
        (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.grupoPaiId
      );
      if (paiDestino) await db.update(tabela).set({ grupoPaiId: paiDestino.id }).where(eq(tabela.id, destino.id));
    }
  }
}

async function completarAreasSetores(empresaDestinoId: string, db: ExecutorBanco) {
  const areasDestino = await db.select().from(areas).where(eq(areas.empresaId, empresaDestinoId));
  const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
  const setoresOrigem = await db.select().from(setores);
  for (const destino of setoresDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = setoresOrigem.find((item) => item.id === destino.idImportado);
    if (!origem) continue;
    const areaDestino = origem.areaId
      ? areasDestino.find((item) => item.importadoDe === origem.empresaId && item.idImportado === origem.areaId)
      : null;
    const setorPaiDestino = origem.setorPaiId
      ? setoresDestino.find((item) => item.importadoDe === origem.empresaId && item.idImportado === origem.setorPaiId)
      : null;
    await db
      .update(setores)
      .set({ areaId: areaDestino?.id ?? null, setorPaiId: setorPaiDestino?.id ?? null })
      .where(eq(setores.id, destino.id));
  }
}

async function completarColaboradores(empresaDestinoId: string, db: ExecutorBanco) {
  const colaboradoresDestino = await db
    .select()
    .from(colaboradores)
    .where(eq(colaboradores.empresaId, empresaDestinoId));
  const setoresDestino = await db.select().from(setores).where(eq(setores.empresaId, empresaDestinoId));
  const colaboradoresOrigem = await db.select().from(colaboradores);
  for (const destino of colaboradoresDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = colaboradoresOrigem.find((item) => item.id === destino.idImportado);
    if (!origem?.setorId) continue;
    const setorDestino = setoresDestino.find(
      (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.setorId
    );
    if (setorDestino)
      await db.update(colaboradores).set({ setorId: setorDestino.id }).where(eq(colaboradores.id, destino.id));
  }
}

async function completarProdutos(empresaDestinoId: string, db: ExecutorBanco) {
  const produtosDestino = await db.select().from(produtos).where(eq(produtos.empresaId, empresaDestinoId));
  const produtosOrigem = await db.select().from(produtos);
  const gruposDestino = await db
    .select()
    .from(gruposMercadorias)
    .where(eq(gruposMercadorias.empresaId, empresaDestinoId));
  const unidadesDestino = await db.select().from(unidadesMedida).where(eq(unidadesMedida.empresaId, empresaDestinoId));
  for (const destino of produtosDestino) {
    if (!destino.importadoDe || !destino.idImportado) continue;
    const origem = produtosOrigem.find((item) => item.id === destino.idImportado);
    if (!origem) continue;
    const grupoDestino = origem.grupoMercadoriaId
      ? gruposDestino.find(
          (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.grupoMercadoriaId
        )
      : null;
    const unidadeDestino = origem.unidadeMedidaId
      ? unidadesDestino.find(
          (item) => item.importadoDe === origem.empresaId && item.idImportado === origem.unidadeMedidaId
        )
      : null;
    await db
      .update(produtos)
      .set({ grupoMercadoriaId: grupoDestino?.id ?? null, unidadeMedidaId: unidadeDestino?.id ?? null })
      .where(eq(produtos.id, destino.id));
  }
}

async function completarMalotes(empresaDestinoId: string, db: ExecutorBanco) {
  const destinos = await db.select().from(malotes).where(eq(malotes.empresaId, empresaDestinoId));
  const lacresExistentes = await db.select({ numero: lacresMalotes.numero }).from(lacresMalotes);
  const lacresExistentesChaves = new Set(lacresExistentes.map((lacre) => lacre.numero.toLocaleLowerCase("pt-BR")));
  for (const destino of destinos) {
    if (!destino.idImportado) continue;
    const lacresOrigem = await db.select().from(lacresMalotes).where(eq(lacresMalotes.maloteId, destino.idImportado));
    const novos = lacresOrigem
      .filter((lacre) => !lacresExistentesChaves.has(lacre.numero.toLocaleLowerCase("pt-BR")))
      .map((lacre) => ({
        empresaId: empresaDestinoId,
        maloteId: destino.id,
        numero: lacre.numero,
        status: "disponivel"
      }));
    if (novos.length) await db.insert(lacresMalotes).values(novos).onConflictDoNothing();
  }
}

async function completarRelacionamentosCopiaRepository(
  tipo: string,
  empresaDestinoId: string,
  db: ExecutorBanco
): Promise<void> {
  if (tipo === "grupos") await completarGrupos(empresaDestinoId, db);
  if (tipo === "areas_setores" || tipo === "colaboradores") await completarAreasSetores(empresaDestinoId, db);
  if (tipo === "colaboradores") await completarColaboradores(empresaDestinoId, db);
  if (tipo === "produtos") await completarProdutos(empresaDestinoId, db);
  if (tipo === "malotes") await completarMalotes(empresaDestinoId, db);
}

export async function copiarDadosEmpresaRepository(
  tipo: string,
  filtro: FiltroCopia,
  empresaDestinoId: string,
  empresasPermitidasIds: string[] | null,
  modo: ModoCopia = "simples"
): Promise<ResultadoCopia> {
  return executarEmTransacao(async (tx) => {
    let inseridos: number;
    if (tipo === "contas") inseridos = await copiarContas(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "fornecedores")
      inseridos = await copiarFornecedores(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "colaboradores")
      inseridos = await copiarColaboradores(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "grupos") inseridos = await copiarGrupos(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "unidades") inseridos = await copiarUnidades(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "areas_setores")
      inseridos = await copiarAreasSetores(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "cargos") inseridos = await copiarCargos(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "produtos") inseridos = await copiarProdutos(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else if (tipo === "malotes") inseridos = await copiarMalotes(filtro, empresaDestinoId, empresasPermitidasIds, tx);
    else throw new Error("Tipo sem suporte para copia");

    if (modo === "completo") await completarRelacionamentosCopiaRepository(tipo, empresaDestinoId, tx);
    return { tipo, inseridos };
  });
}
