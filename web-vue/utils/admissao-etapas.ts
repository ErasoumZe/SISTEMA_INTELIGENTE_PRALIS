import type { ProcessoDetalheDto } from "@padaria/shared";

export type EstadoEtapaAdmissao = "concluida" | "atual" | "pendente";

export type EtapaAdmissao = {
  id: "dados" | "exame" | "ficha" | "efetivacao";
  titulo: string;
  descricao: string;
  estado: EstadoEtapaAdmissao;
};

type EntradaEtapas = Pick<ProcessoDetalheDto, "efetivado" | "fichaSituacao"> & {
  internos: Pick<ProcessoDetalheDto["internos"], "exameSituacao">;
  podeRevisarFicha: boolean;
  efetivavel: boolean;
};

const situacaoExame = {
  pendente: "Aguardando registro",
  guia_entregue: "Guia entregue",
  agendado: "Agendado",
  aso_apto: "ASO apto",
  aso_nao_apto: "ASO não apto",
  exige_acao: "Exige ação"
} as const;

const fichaConcluida = (situacao: ProcessoDetalheDto["fichaSituacao"]) =>
  situacao === "aprovada" || situacao === "concluida_dp";

/** Deriva somente o estado visual a partir de fatos devolvidos pelo servidor. */
export function etapasDoProcesso(entrada: EntradaEtapas): EtapaAdmissao[] {
  const exameConcluido = entrada.internos.exameSituacao === "aso_apto";
  const fichaOk = fichaConcluida(entrada.fichaSituacao);
  const fichaAtual = entrada.podeRevisarFicha && !fichaOk && exameConcluido;

  return [
    {
      id: "dados",
      titulo: "Dados do processo",
      descricao: "Origem, candidato, função e turno",
      estado: "concluida"
    },
    {
      id: "exame",
      titulo: "Exame admissional",
      descricao: situacaoExame[entrada.internos.exameSituacao],
      estado: exameConcluido ? "concluida" : "atual"
    },
    {
      id: "ficha",
      titulo: "Ficha do DP",
      descricao: fichaOk
        ? "Dados conferidos"
        : entrada.podeRevisarFicha
          ? "Preenchimento e conferência"
          : "Acesso conforme permissão",
      estado: fichaOk ? "concluida" : fichaAtual ? "atual" : "pendente"
    },
    {
      id: "efetivacao",
      titulo: "Efetivação",
      descricao: entrada.efetivado
        ? "Colaborador efetivado"
        : entrada.efetivavel
          ? "Pronta para revisão final"
          : "Aguardando etapas anteriores",
      estado: entrada.efetivado ? "concluida" : entrada.efetivavel ? "atual" : "pendente"
    }
  ];
}
