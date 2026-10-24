import { GoogleSheetsService, type GridDataCell, type RegistroPorCabecalho } from "../google/google-sheets.service.js";
import { env } from "../env.js";
import {
  CONPLUS_ABAS,
  CONPLUS_RESCISOES_ENTRADA,
  prepararAtualizacoesConplus,
  validarAbaConplus,
  type ConplusAba
} from "./conplus-google-mapping.js";

const TITULO_PLANILHA = "CICLUZ GP - TNP - LAN\u00C7AMENTOS GEST\u00C3O DE PESSOAS (DES)";

const CONFIG_ABAS: Record<ConplusAba, { linhaCabecalho: number; primeiraLinhaDados: number }> = {
  folha_05: { linhaCabecalho: 6, primeiraLinhaDados: 8 },
  adiantamento_20: { linhaCabecalho: 6, primeiraLinhaDados: 8 },
  rescisoes: { linhaCabecalho: 6, primeiraLinhaDados: 8 },
  ferias: { linhaCabecalho: 6, primeiraLinhaDados: 8 }
};

const CONFIG_RESCISOES_TECNICA = { linhaCabecalho: 1, primeiraLinhaDados: 2 } as const;

export type ConplusGoogleRegistro = {
  valores: RegistroPorCabecalho;
  camposPermitidos: readonly string[];
};

export type ConplusGoogleSyncOptions = {
  destinoTecnicoRescisoes?: boolean;
  linhaEsperada?: number;
};

export type ConplusGoogleSyncResult = {
  habilitada: boolean;
  aba: string;
  linhas: Array<{ linha: number; ranges: string[] }>;
};

export type ConplusGooglePreviewCell = {
  registroId: string;
  linha: number;
  coluna: number;
  endereco: string;
  cabecalho: string;
  valor: string | number | boolean;
  ocupada: boolean;
  formula: boolean;
  protegida: boolean;
  conflito: string | null;
};

export type ConplusGooglePreview = {
  habilitada: false;
  aba: string;
  linhaCabecalho: number;
  primeiraLinhaDados: number;
  registroIds: string[];
  celulas: ConplusGooglePreviewCell[];
  celulasVazias: string[];
  camposSemCorrespondencia: string[];
  conflitos: string[];
  podeGravar: boolean;
};

function colunaParaA1(indice: number): string {
  let valor = indice + 1;
  let resultado = "";
  while (valor > 0) {
    const resto = (valor - 1) % 26;
    resultado = String.fromCharCode(65 + resto) + resultado;
    valor = Math.floor((valor - 1) / 26);
  }
  return resultado;
}

function celulaOcupada(cell: GridDataCell | undefined): boolean {
  return (
    Boolean(cell?.userEnteredValue && Object.keys(cell.userEnteredValue).length > 0) ||
    Boolean(cell?.effectiveValue && Object.keys(cell.effectiveValue).length > 0)
  );
}

function temFormula(cell: GridDataCell | undefined): boolean {
  return Boolean(cell?.userEnteredValue && Object.hasOwn(cell.userEnteredValue, "formula"));
}

function linhaTemMesclagem(
  mesclagens: NonNullable<
    NonNullable<Awaited<ReturnType<GoogleSheetsService["lerGrade"]>>["sheets"]>[number]["merges"]
  >,
  linha: number
): boolean {
  const indiceLinha = linha - 1;
  return mesclagens.some(
    (mesclagem) => indiceLinha >= (mesclagem.startRowIndex ?? 0) && indiceLinha < (mesclagem.endRowIndex ?? 0)
  );
}

function celulaProtegida(
  protecoes: NonNullable<
    NonNullable<Awaited<ReturnType<GoogleSheetsService["lerGrade"]>>["sheets"]>[number]["protectedRanges"]
  >,
  linha: number,
  coluna: number
): boolean {
  const indiceLinha = linha - 1;
  return protecoes.some((protecao) => {
    const faixa = protecao.range;
    return (
      indiceLinha >= (faixa?.startRowIndex ?? 0) &&
      indiceLinha < (faixa?.endRowIndex ?? Number.MAX_SAFE_INTEGER) &&
      coluna >= (faixa?.startColumnIndex ?? 0) &&
      coluna < (faixa?.endColumnIndex ?? Number.MAX_SAFE_INTEGER)
    );
  });
}

/**
 * Sincronizador controlado. A instância padrão permanece desabilitada até
 * CONPLUS_GOOGLE_SYNC_ENABLED=true. Nenhum controller chama este serviço automaticamente
 * enquanto a migration e o mapeamento oficial dos campos não forem aprovados.
 */
type PlanilhaConplus = Pick<
  GoogleSheetsService,
  "validarIdentidade" | "lerCabecalhos" | "inserirAtualizacoesSemSobrescrever"
> & {
  lerGrade?: GoogleSheetsService["lerGrade"];
};

export class ConplusGoogleSyncService {
  constructor(
    private planilhaInjetada: PlanilhaConplus | null = null,
    private readonly habilitada = env.CONPLUS_GOOGLE_SYNC_ENABLED,
    private readonly opcoes: ConplusGoogleSyncOptions = {}
  ) {}

  // O cliente Google só é criado quando a planilha é de fato lida ou escrita: com a sincronização
  // desligada (ou sem credenciais) a rota responde "desabilitada" em vez de 500.
  private get sheets(): PlanilhaConplus {
    this.planilhaInjetada ??= new GoogleSheetsService();
    return this.planilhaInjetada;
  }

  abaParaTipo(tipo: ConplusAba): string {
    if (tipo === "rescisoes" && this.opcoes.destinoTecnicoRescisoes) return CONPLUS_RESCISOES_ENTRADA;
    return CONPLUS_ABAS[tipo];
  }

  private configParaTipo(tipo: ConplusAba): { linhaCabecalho: number; primeiraLinhaDados: number } {
    if (tipo === "rescisoes" && this.opcoes.destinoTecnicoRescisoes) return CONFIG_RESCISOES_TECNICA;
    return CONFIG_ABAS[tipo];
  }

  async sincronizar(tipo: ConplusAba, registros: readonly ConplusGoogleRegistro[]): Promise<ConplusGoogleSyncResult> {
    const aba = this.abaParaTipo(tipo);
    if (!(tipo === "rescisoes" && this.opcoes.destinoTecnicoRescisoes)) validarAbaConplus(aba, tipo);
    if (!this.habilitada) return { habilitada: false, aba, linhas: [] };
    if (!registros.length) return { habilitada: true, aba, linhas: [] };

    await this.sheets.validarIdentidade(TITULO_PLANILHA);
    const config = this.configParaTipo(tipo);
    const cabecalhos = await this.sheets.lerCabecalhos(aba, config.linhaCabecalho, "ZZ");
    const linhas: Array<{ linha: number; ranges: string[] }> = [];
    for (const registro of registros) {
      const atualizacoes = prepararAtualizacoesConplus(cabecalhos, registro.valores, registro.camposPermitidos);
      if (!atualizacoes.length) throw new Error(`Nenhum campo autorizado foi encontrado na aba ${aba}`);
      linhas.push(
        await this.sheets.inserirAtualizacoesSemSobrescrever(
          aba,
          atualizacoes,
          config.primeiraLinhaDados,
          this.opcoes.linhaEsperada,
          true
        )
      );
    }
    return { habilitada: true, aba, linhas };
  }

  async prepararPrevia(
    tipo: ConplusAba,
    registros: readonly (ConplusGoogleRegistro & { registroId: string })[]
  ): Promise<ConplusGooglePreview> {
    const aba = this.abaParaTipo(tipo);
    if (!(tipo === "rescisoes" && this.opcoes.destinoTecnicoRescisoes)) validarAbaConplus(aba, tipo);
    if (!registros.length) throw new Error("Nenhum registro foi selecionado para a prévia");
    await this.sheets.validarIdentidade(TITULO_PLANILHA);
    const config = this.configParaTipo(tipo);
    const cabecalhos = await this.sheets.lerCabecalhos(aba, config.linhaCabecalho, "ZZ");
    const camposPermitidos = new Set(
      registros.flatMap((registro) => registro.camposPermitidos.map((campo) => normalizarCabecalhoLocal(campo)))
    );
    const camposSemCorrespondencia = [...camposPermitidos].filter(
      (campo) => !cabecalhos.some((cabecalho) => normalizarCabecalhoLocal(cabecalho) === campo)
    );
    if (!this.sheets.lerGrade) throw new Error("Leitura da grade Google não está disponível para prévia");
    const grade = await this.sheets.lerGrade(aba, "A" + config.primeiraLinhaDados + ":ZZ");
    const dadosAba = grade.sheets?.[0];
    const linhasLidas = dadosAba?.data?.[0]?.rowData ?? [];
    const destinoTecnico = tipo === "rescisoes" && this.opcoes.destinoTecnicoRescisoes;
    const linhas = destinoTecnico && linhasLidas.length === 0 ? [{ values: [] }] : linhasLidas;
    const atualizacoesPorRegistro = registros.map((registro) => {
      const atualizacoes = prepararAtualizacoesConplus(cabecalhos, registro.valores, registro.camposPermitidos);
      if (!atualizacoes.length) throw new Error(`Nenhum campo autorizado foi encontrado na aba ${aba}`);
      return atualizacoes;
    });
    const indicesLinhas: number[] = [];
    let cursorLinha = 0;
    const conflitos = camposSemCorrespondencia.map((campo) => "Campo sem correspondência: " + campo);
    for (const atualizacoes of atualizacoesPorRegistro) {
      let indiceSeguro = -1;
      while (cursorLinha < linhas.length) {
        const linha = config.primeiraLinhaDados + cursorLinha;
        const linhaOcupada = (linhas[cursorLinha]?.values ?? []).some((cell) => celulaOcupada(cell));
        const linhaEstrutural = linhaTemMesclagem(dadosAba?.merges ?? [], linha);
        const possuiProtecao = atualizacoes.some((atualizacao) =>
          celulaProtegida(dadosAba?.protectedRanges ?? [], linha, atualizacao.coluna)
        );
        if (!linhaOcupada && !linhaEstrutural && !possuiProtecao) {
          indiceSeguro = cursorLinha;
          break;
        }
        cursorLinha += 1;
      }
      if (indiceSeguro < 0) {
        conflitos.push(`Nenhuma linha livre e estruturalmente segura foi encontrada na grade conhecida da aba ${aba}`);
      }
      indicesLinhas.push(indiceSeguro);
      cursorLinha = indiceSeguro >= 0 ? indiceSeguro + 1 : linhas.length;
    }
    const celulas: ConplusGooglePreviewCell[] = [];
    const celulasVazias: string[] = [];

    for (const [indiceRegistro, registro] of registros.entries()) {
      const indiceLinha = indicesLinhas[indiceRegistro]!;
      if (indiceLinha < 0) continue;
      const linha = config.primeiraLinhaDados + indiceLinha;
      const linhaExistente = linhas[indiceLinha];
      for (const atualizacao of atualizacoesPorRegistro[indiceRegistro]!) {
        const cell = linhaExistente?.values?.[atualizacao.coluna];
        const formula = temFormula(cell);
        const ocupada = celulaOcupada(cell);
        const protegida = celulaProtegida(dadosAba?.protectedRanges ?? [], linha, atualizacao.coluna);
        const mesclada = linhaTemMesclagem(dadosAba?.merges ?? [], linha);
        const endereco = colunaParaA1(atualizacao.coluna) + linha;
        const conflito = protegida
          ? "Célula protegida"
          : mesclada
            ? "Célula mesclada"
            : formula
              ? "Fórmula existente"
              : ocupada
                ? "Célula ocupada"
                : null;
        if (conflito) conflitos.push(endereco + ": " + conflito);
        celulas.push({
          registroId: registro.registroId,
          linha,
          coluna: atualizacao.coluna + 1,
          endereco,
          cabecalho: cabecalhos[atualizacao.coluna] ?? "",
          valor: atualizacao.valor,
          ocupada,
          formula,
          protegida,
          conflito
        });
      }
      const valoresNormalizados = new Map(
        Object.entries(registro.valores).map(([campo, valor]) => [normalizarCabecalhoLocal(campo), valor] as const)
      );
      for (const [coluna, cabecalho] of cabecalhos.entries()) {
        const valor = valoresNormalizados.get(normalizarCabecalhoLocal(cabecalho));
        if (valor === null || valor === undefined || valor === "") {
          celulasVazias.push(colunaParaA1(coluna) + linha);
        }
      }
    }
    return {
      habilitada: false,
      aba,
      linhaCabecalho: config.linhaCabecalho,
      primeiraLinhaDados: config.primeiraLinhaDados,
      registroIds: registros.map((registro) => registro.registroId),
      celulas,
      celulasVazias,
      camposSemCorrespondencia,
      conflitos,
      podeGravar: conflitos.length === 0
    };
  }
}

export { CONFIG_ABAS, TITULO_PLANILHA };

function normalizarCabecalhoLocal(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/\n/gu, " ")
    .replace(/\s+/gu, " ")
    .replace(/[;,.]+$/u, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}
