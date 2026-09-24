// Montagem dos payloads de CONFERENCIA de transferencia (confirmar / recusar).
//
// Vive fora do componente porque foi exatamente aqui que nasceu um bug silencioso: o cockpit
// mandava `nLacreDoc: ""` quando o campo estava vazio, e o schema (`.min(1)`) recusava — entao um
// movimento SEM lacre, que a R-026 permite, era impossivel de conferir pela tela. String vazia nao
// e "sem lacre": e um lacre invalido.
//
// Regras que estas funcoes garantem:
//   - campo vazio vira `null` (ausencia), nunca string vazia;
//   - valor e enviado como numero, inclusive `0` — que e um valor legitimo de conferencia e nao
//     pode ser confundido com "nao informado" por um `if (valor)`;
//   - nada de residuo entre conferencias: quem limpa e `camposConferenciaVazios()`.

export type CamposConferencia = {
  contaDestinoId: string;
  lacre: string;
  valorRecebido: string;
  valorEspecieContado: string;
  valorMoedasContado: string;
  motivo: string;
};

export function camposConferenciaVazios(): CamposConferencia {
  return {
    contaDestinoId: "",
    lacre: "",
    valorRecebido: "",
    valorEspecieContado: "",
    valorMoedasContado: "",
    motivo: ""
  };
}

// `0` e valor valido. Por isso o teste e sobre a string ser vazia, e nao sobre o numero ser
// falsy — `Number("0")` e 0, e um `if (numero)` descartaria a conferencia de um envelope vazio.
export function valorConferenciaValido(valorRecebido: string): boolean {
  const texto = valorRecebido.trim();
  if (!texto) return false;
  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0;
}

function lacreOuNulo(lacre: string): string | null {
  return lacre.trim() || null;
}

// Confirmar significa que valor e lacre conferidos batem com a entrega. A recusa continua
// aceitando um lacre ausente ou diferente, pois essa e justamente uma divergencia auditavel.
export function lacreConfereEntrega(lacreInformado: string, lacreDaEntrega?: string | null): boolean {
  return lacreOuNulo(lacreInformado) === (lacreDaEntrega?.trim() || null);
}

export type PayloadConfirmacao = {
  contaDestinoId: string;
  nLacreDoc: string | null;
  // Ausente na transferencia GENERICA quando nao informado. Ver abaixo por que nao vira 0.
  valorRecebido?: number;
  valorEspecieContado?: number;
  valorMoedasContado?: number;
};

// Decisao 5/R-187: o valor so e obrigatorio no fluxo de Transferencia de retorno do Caixa.
//
// Na transferencia GENERICA o campo continua opcional, e vazio significa "nao informei" — nao
// "recebi zero". Mandar 0 ali mudaria o comportamento vigente: o servidor entenderia divergencia
// de valor, confirmaria assim mesmo e dispararia notificacao de divergencia numa conferencia que
// bateu. Por isso o campo e OMITIDO, e nao convertido.
export function montarPayloadConfirmacao(
  campos: CamposConferencia,
  contaDestinoPadrao: string,
  ehCaixaParaCofre: boolean
): PayloadConfirmacao {
  const base = {
    contaDestinoId: campos.contaDestinoId.trim() || contaDestinoPadrao,
    nLacreDoc: lacreOuNulo(campos.lacre)
  };
  const informou = valorConferenciaValido(campos.valorRecebido);
  // No retorno do Caixa a tela ja bloqueia o envio sem valor valido, entao aqui ele sempre existe.
  if (!ehCaixaParaCofre && !informou) return base;
  const payload = { ...base, valorRecebido: Number(campos.valorRecebido) };
  if (!ehCaixaParaCofre) return payload;
  return {
    ...payload,
    valorEspecieContado: Number(campos.valorEspecieContado),
    valorMoedasContado: Number(campos.valorMoedasContado)
  };
}

// R-183 · quando o envio fica bloqueado pela sobra nao confirmada.
//
// `modoRecusa` entra na conta, e nao e detalhe: a caixa de consentimento so existe DENTRO do modo
// recusa. Sem essa condicao, quem marcasse "encerrar", digitasse um valor acima do declarado e
// voltasse para "Conferir" ficava com o botao morto e o motivo escondido — sem acao possivel a nao
// ser fechar e reabrir o modal.
//
// Funcao pura, fora do SFC, pelo mesmo motivo de `fechamento-travas.ts`: dentro do componente esta
// regra so seria exercitada montando a tela inteira com Vuetify, e regra que so o olho testa acaba
// divergindo do servidor — que aqui responde 409 exatamente nesta condicao.
export function bloqueiaEnvioPorSobra(estado: {
  modoRecusa: boolean;
  encerrar: boolean;
  contouAMais: boolean;
  confirmou: boolean;
}): boolean {
  return estado.modoRecusa && estado.encerrar && estado.contouAMais && !estado.confirmou;
}

export type PayloadRecusa = PayloadConfirmacao & {
  motivo: string;
  valorRecebido?: number;
  encerrar?: boolean;
  sobraConfirmada?: boolean;
};

// Decisao 8 + R-183/R-187: a recusa exige motivo e SO existe no retorno do Caixa (na generica a rota
// responde 404). Ela tem DOIS desfechos, e a diferenca e quem paga:
//
//  - sem `encerrar`: registra a tentativa e o movimento segue `pendente`, para reconferir depois;
//  - com `encerrar`: e o DESFECHO — a conta destino credita o contado, a falta vira quebra e o caixa
//    destrava. Sem esta flag chegar ao servidor, a rota existe e o caixa fica travado do mesmo
//    jeito, que era o estado que a Fatia 2 existe para eliminar.
//
// `sobraConfirmada` acompanha `encerrar` porque o servidor recusa (409) contagem acima do declarado
// sem consentimento explicito — a D7 proibe virar quebra positiva, entao o contrapeso e assumir.
export function montarPayloadRecusa(
  campos: CamposConferencia,
  contaDestinoPadrao: string,
  desfecho: { encerrar: boolean; sobraConfirmada: boolean } = { encerrar: false, sobraConfirmada: false }
): PayloadRecusa {
  const base = { ...montarPayloadConfirmacao(campos, contaDestinoPadrao, true), motivo: campos.motivo.trim() };
  if (!desfecho.encerrar) return base;
  return { ...base, encerrar: true, sobraConfirmada: desfecho.sobraConfirmada };
}
