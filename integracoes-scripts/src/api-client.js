export async function verificarApi(apiUrl) {
  try {
    const resposta = await fetch(`${apiUrl}/health`);
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  } catch (error) {
    const detalhe = error instanceof Error ? error.message : String(error);
    throw new Error(`Nao foi possivel conectar na API principal em ${apiUrl}. Detalhe: ${detalhe}`);
  }
}

// Conciliacao do dia: manda o agregado do CREARE e a API responde o comparativo por PDV.
// Mesma chave da ingestao. So le do lado do sistema — nada e gravado por esta chamada.
export async function enviarConciliacao({ apiUrl, codigoIntegracao, data, porPdv }) {
  const resposta = await fetch(`${apiUrl}/api/integracoes/conciliacao`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": codigoIntegracao },
    body: JSON.stringify({ data, porPdv })
  });

  const corpoTexto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`Falha na conciliacao de ${data}: HTTP ${resposta.status} ${corpoTexto}`);
  }
  const corpo = corpoTexto ? JSON.parse(corpoTexto) : null;
  return corpo?.data ?? null;
}

export async function enviarVendaIntegracao({ apiUrl, codigoIntegracao, payload }) {
  const resposta = await fetch(`${apiUrl}/api/integracoes`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": codigoIntegracao },
    body: JSON.stringify(payload)
  });

  const corpoTexto = await resposta.text();
  let corpo;
  try {
    corpo = corpoTexto ? JSON.parse(corpoTexto) : null;
  } catch {
    corpo = corpoTexto;
  }

  if (!resposta.ok) {
    throw new Error(`Falha ao enviar venda ${payload.Venda.idVenda}: HTTP ${resposta.status} ${corpoTexto}`);
  }

  return corpo;
}
