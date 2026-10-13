export type FiltrosVendas = {
  dataInicio: string;
  dataFim: string;
  horaInicio: string;
  horaFim: string;
  idVenda: string;
  produto: string;
  pdvId: string;
  turnoId: string;
  clienteId: string;
  colaboradorId: string;
  formaPagamentoId: string;
  status: string;
};

export function filtrosVendasVazios(): FiltrosVendas {
  return {
    dataInicio: "",
    dataFim: "",
    horaInicio: "",
    horaFim: "",
    idVenda: "",
    produto: "",
    pdvId: "",
    turnoId: "",
    clienteId: "",
    colaboradorId: "",
    formaPagamentoId: "",
    status: ""
  };
}
