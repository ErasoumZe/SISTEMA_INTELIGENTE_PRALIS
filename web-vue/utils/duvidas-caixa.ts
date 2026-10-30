import type { Duvida } from "./duvidas";

// Perguntas e respostas do Caixa, conferidas no codigo em 30/10/2026 (branch da R-232). Regra: so entra aqui o
// que o sistema faz HOJE. Quando uma regra mudar, a resposta muda junto — texto errado aqui faz o operador
// errar com confianca. Nenhuma resposta revela o valor esperado do caixa (contagem cega, R-232).
export const DUVIDAS_CAIXA: readonly Duvida[] = [
  // ── Abertura ──────────────────────────────────────────────────────────────────────────────────────────
  {
    id: "abertura-quem-abre",
    tema: "abertura",
    pergunta: "Quem pode abrir o caixa?",
    resposta:
      "Só um login que tenha posto do caixa (PDV e turno) escolhido em Usuários. Se aparecer “Este login ainda não tem posto do caixa”, peça ao administrador para escolher o posto.",
    palavras: ["nao consigo abrir", "posto", "login"]
  },
  {
    id: "abertura-outro-pdv",
    tema: "abertura",
    pergunta: "Posso abrir o caixa em outro PDV?",
    resposta:
      "Não. O PDV vem travado pelo posto do seu login. Para trocar de PDV, o administrador muda o posto em Usuários.",
    palavras: ["so pode abrir o pdv vinculado", "trocar pdv"]
  },
  {
    id: "abertura-turno",
    tema: "abertura",
    pergunta: "Eu escolho se é manhã ou tarde?",
    resposta:
      "Não. O turno vem do posto do login. Se aparecer “O turno deste login não está marcado no PDV”, o administrador precisa ajustar os turnos em PDVs.",
    palavras: ["manha", "tarde", "turno errado"]
  },
  {
    id: "abertura-anterior-aberto",
    tema: "abertura",
    pergunta: "A manhã ainda não fechou. Consigo abrir a tarde?",
    resposta:
      "Não. O caixa anterior do mesmo PDV precisa terminar o fechamento antes. Peça para quem estava no turno anterior concluir o fechamento.",
    palavras: ["caixa anterior", "ainda esta aberto", "em fechamento"]
  },
  {
    id: "abertura-ja-tem-caixa",
    tema: "abertura",
    pergunta: "Diz que eu já tenho um caixa aberto. E agora?",
    resposta:
      "Cada login só pode ter um caixa aberto por vez. Termine o fechamento do caixa anterior desse login e depois abra o novo.",
    palavras: ["ja possui um caixa aberto"]
  },
  {
    id: "abertura-sem-malote",
    tema: "abertura",
    pergunta: "Dá para abrir sem o malote de troco?",
    resposta:
      "Não. O lacre do malote de abertura é obrigatório: é ele que mostra o troco que veio do Cofre para o seu PDV.",
    palavras: ["sem lacre", "sem troco", "lacre de abertura"]
  },
  {
    id: "abertura-ver-troco",
    tema: "abertura",
    pergunta: "Onde vejo quanto veio de troco?",
    resposta:
      "Digite o lacre do malote. Aparece “Malote declarado” com o valor, o dinheiro e as moedas, junto com os lacres de sangria e o lacre reservado para o fechamento.",
    palavras: ["malote declarado", "valor do malote"]
  },
  {
    id: "abertura-malote-nao-bate",
    tema: "abertura",
    pergunta: "Contei o malote e não bate com o declarado. O que faço?",
    resposta:
      "Toque em “Não confere”, digite o dinheiro e as moedas que você contou e escreva o motivo (é obrigatório). O caixa abre com o valor contado e a Tesouraria é avisada.",
    palavras: ["divergencia na abertura", "nao confere", "faltando no malote"]
  },
  {
    id: "abertura-lacre-erros",
    tema: "abertura",
    pergunta: "Deu erro no lacre da abertura. O que significa?",
    resposta:
      "“Lacre inexistente”: confira e digite de novo. “Lacre já rompido”: esse lacre já foi usado, procure a Tesouraria. “Ainda não foi liberada”: aguarde a Tesouraria liberar. “Não é destino desta transferência”: o malote é de outro PDV. “Já pertence a outro caixa”: esse malote já foi usado em outro caixa.",
    palavras: ["lacre inexistente", "lacre ja rompido", "nao foi liberada", "outro caixa", "nao e destino"]
  },
  {
    id: "abertura-responsavel-supervisor",
    tema: "abertura",
    pergunta: "O que coloco em Responsável pelo caixa e em Supervisor?",
    resposta:
      "O nome de quem vai ficar na gaveta e o nome do gerente do turno. Os dois são obrigatórios. O login é a conta do posto; o nome do responsável é o que mostra quem estava no caixa.",
    palavras: ["gerente", "nome", "responsavel"]
  },
  {
    id: "abertura-maquininha",
    tema: "abertura",
    pergunta: "Qual maquininha eu escolho na abertura?",
    resposta:
      "A maquininha que está no seu PDV. É obrigatório escolher, e é dela que você vai mandar o relatório no fechamento.",
    palavras: ["maquininha nao encontrada", "pagbank"]
  },
  {
    id: "abertura-hora",
    tema: "abertura",
    pergunta: "Posso mudar a hora da abertura?",
    resposta:
      "Não. A hora é a do sistema. Se o cupom do CREARE começar um pouco antes, no fechamento você usa “Ajustar início” (até 60 minutos antes da abertura).",
    palavras: ["horario", "abri atrasado"]
  },
  {
    id: "abertura-erro-cadastro",
    tema: "abertura",
    pergunta: "Apareceu erro de PDV ou colaborador na abertura.",
    resposta:
      "Mensagens como “PDV sem conta vinculada”, “PDV não encontrado” ou “precisa estar vinculado a colaborador” são de cadastro. Chame o administrador.",
    palavras: ["pdv sem conta", "pdv nao encontrado", "colaborador", "cadastro"]
  },
  {
    id: "abertura-horario-ocupado",
    tema: "abertura",
    pergunta: "Diz que a data e hora da abertura já pertence a outro caixa.",
    resposta: "O horário bate com outro caixa desse PDV. Chame a gerência para ver qual caixa ficou aberto.",
    palavras: ["ja pertence a outro caixa", "sobreposicao"]
  },

  // ── Durante o turno ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "turno-sangria-como",
    tema: "turno",
    pergunta: "Como faço uma sangria?",
    resposta:
      "Vá em Transferências, aba “Retorno / sangria”. Preencha o valor, o dinheiro e as moedas, escolha um lacre da lista e, se quiser, uma observação. O dinheiro vai para o Cofre.",
    palavras: ["retirar dinheiro da gaveta", "mandar para o cofre"]
  },
  {
    id: "turno-sangria-x-retorno",
    tema: "turno",
    pergunta: "Retorno e sangria são coisas diferentes?",
    resposta:
      "Não. É o mesmo ato: dinheiro do caixa para o Cofre. Quando o dinheiro vem do Cofre para o caixa, é suprimento.",
    palavras: ["suprimento"]
  },
  {
    id: "turno-sangria-banco",
    tema: "turno",
    pergunta: "Posso mandar a sangria direto para o banco?",
    resposta: "Não. A sangria sempre vai para o Cofre da empresa. Quem leva ao banco é a Tesouraria.",
    palavras: ["deposito", "banco"]
  },
  {
    id: "turno-sangria-sem-lacre",
    tema: "turno",
    pergunta: "Não aparece lacre para a sangria.",
    resposta:
      "Só servem os lacres que vieram no malote de abertura. Se acabaram (“Nenhum lacre disponível”), peça mais à Tesouraria.",
    palavras: ["nenhum lacre disponivel", "lacre indisponivel"]
  },
  {
    id: "turno-sangria-lacre-usado",
    tema: "turno",
    pergunta: "Diz que o lacre da sangria já foi usado.",
    resposta: "Cada lacre serve uma vez só. Escolha outro lacre da lista.",
    palavras: ["lacre ja utilizado"]
  },
  {
    id: "turno-sangria-soma",
    tema: "turno",
    pergunta: "Digitei a sangria e diz que não fecha a conta.",
    resposta: "Dinheiro + moedas precisa dar exatamente o valor total da sangria. Confira os três campos.",
    palavras: ["deve ser igual ao valor entregue", "moedas"]
  },
  {
    id: "turno-sangria-acima",
    tema: "turno",
    pergunta: "Diz “Valor acima do dinheiro disponível no caixa”.",
    resposta:
      "O valor da sangria passou do dinheiro que o sistema registra no caixa. Reconte o dinheiro da sangria e confira o valor digitado. Se continuar, chame o gerente.",
    palavras: ["acima do dinheiro", "valor maior"]
  },
  {
    id: "turno-sangria-sem-especie",
    tema: "turno",
    pergunta: "Diz “Caixa sem saldo em espécie para enviar ao cofre”.",
    resposta: "Pelo sistema não há dinheiro na gaveta para essa sangria. Confira com o gerente antes de mandar.",
    palavras: ["sem saldo em especie"]
  },
  {
    id: "turno-sangria-cofre-sem-responsavel",
    tema: "turno",
    pergunta: "Diz que a conta do cofre está sem responsável para conferir.",
    resposta: "Não há ninguém cadastrado para conferir no Cofre, então o dinheiro não sai. Chame a Tesouraria.",
    palavras: ["sem responsavel elegivel"]
  },
  {
    id: "turno-sangria-espera",
    tema: "turno",
    pergunta: "Preciso esperar a Tesouraria conferir a sangria para fechar?",
    resposta: "Não. A sangria que ainda não foi conferida não trava o fechamento. A Tesouraria confere depois.",
    palavras: ["conferencia pendente"]
  },
  {
    id: "turno-sangria-desfazer",
    tema: "turno",
    pergunta: "Posso desfazer ou editar uma sangria?",
    resposta:
      "Não. Depois de lançada, a sangria não muda: o Cofre confere ou recusa. Se lançou errado, avise a Tesouraria na hora.",
    palavras: ["errei a sangria", "apagar", "cancelar sangria", "digitei errado"]
  },
  {
    id: "turno-nao-vejo-saldo",
    tema: "turno",
    pergunta: "Por que eu não vejo o saldo do caixa?",
    resposta:
      "É de propósito: o operador não vê o valor esperado do caixa, para a contagem do fechamento ser feita sem influência. O gerente e a Tesouraria veem.",
    palavras: ["disponivel para retorno", "saldo escondido", "quanto tem no caixa"]
  },
  {
    id: "turno-recebimento-pendente",
    tema: "turno",
    pergunta: "A gerência mandou dinheiro no meio do turno. O que faço?",
    resposta:
      "Aparece em “Recebimentos pendentes” na tela do Caixa. Conte o dinheiro e toque em “Confirmar recebimento”. Só depois disso ele entra no seu caixa.",
    palavras: ["transferencia sem lacre", "troco no meio do turno", "confirmar recebimento"]
  },
  {
    id: "turno-nao-recebi",
    tema: "turno",
    pergunta: "Disseram que mandaram dinheiro, mas não chegou.",
    resposta:
      "Toque em “Não recebi”. A transferência é cancelada, o valor volta para quem mandou e a Tesouraria é avisada.",
    palavras: ["nao recebi", "nao chegou"]
  },
  {
    id: "turno-recebimento-valor-errado",
    tema: "turno",
    pergunta: "O dinheiro que chegou está com valor diferente do lançado.",
    resposta:
      "A transferência não se edita. Marque “Não recebi” e peça para a gerência lançar de novo com o valor certo.",
    palavras: ["valor errado", "veio a mais", "veio a menos"]
  },
  {
    id: "turno-gerente-confirma",
    tema: "turno",
    pergunta: "O gerente que mandou pode confirmar o recebimento por mim?",
    resposta: "Não. Quem enviou o dinheiro não confirma o próprio envio. Quem confirma é o caixa que recebeu.",
    palavras: ["confirmar pelo operador"]
  },
  {
    id: "turno-sem-lacre-quem",
    tema: "turno",
    pergunta: "Quem pode lançar “Transferência sem Lacre”?",
    resposta:
      "Só quem tem essa permissão (normalmente a gerência). Para mandar a um PDV, o caixa desse PDV precisa estar aberto; sem caixa aberto, o dinheiro vai pelo malote.",
    palavras: ["transferencia sem lacre", "sem caixa aberto"]
  },
  {
    id: "turno-despesa",
    tema: "turno",
    pergunta: "Como lanço uma despesa, mercadoria ou retirada?",
    resposta: "Pelas telas de Despesas, Mercadorias ou Retiradas, com o caixa aberto. Elas saem do dinheiro da gaveta.",
    palavras: ["gasto", "pagar fornecedor", "saida"]
  },
  {
    id: "turno-saldo-insuficiente",
    tema: "turno",
    pergunta: "Diz “Saldo insuficiente na conta de origem”.",
    resposta:
      "Não há dinheiro suficiente registrado para essa saída. Confira o valor digitado e, se estiver certo, chame o gerente.",
    palavras: ["saldo insuficiente"]
  },
  {
    id: "turno-lancar-em-fechamento",
    tema: "turno",
    pergunta: "Posso lançar despesa ou sangria depois de começar o fechamento?",
    resposta:
      "Não. Depois de “Encerrar vendas”, transferências, saídas e sangrias do PDV ficam bloqueadas. Lance tudo antes de começar o fechamento.",
    palavras: ["caixa em fechamento", "bloqueadas", "abra um caixa antes"]
  },
  {
    id: "turno-retorno-programado",
    tema: "turno",
    pergunta: "Apareceu um retorno programado com “Executar agora”.",
    resposta:
      "É uma sangria que a Tesouraria programou. Execute quando o dinheiro sair da gaveta e antes de encerrar as vendas. Se já encerrou e ele não sai, chame a retaguarda para cancelar.",
    palavras: ["planejamento", "executar agora", "retorno planejado"]
  },
  {
    id: "turno-pdv-desligou",
    tema: "turno",
    pergunta: "O computador do PDV desligou ou travou. O que faço?",
    resposta:
      "Toque no botão “PDV LIGADO” na tela do Caixa e escolha o motivo (em “Outro”, descreva). Quando o computador voltar, registre o retorno. Enquanto estiver como desligado, não dá para encerrar as vendas.",
    palavras: ["pdv desligado", "travou", "caiu", "sem energia", "computador"]
  },
  {
    id: "turno-pdv-desligou-erros",
    tema: "turno",
    pergunta: "Deu erro no botão de PDV desligado.",
    resposta:
      "“Já existe uma indisponibilidade em andamento”: o PDV já está marcado como desligado, registre o retorno. “Nenhuma indisponibilidade em andamento”: não há o que encerrar. “Descreva o outro motivo”: escreva o que aconteceu.",
    palavras: ["indisponibilidade"]
  },
  {
    id: "turno-venda-atrasada",
    tema: "turno",
    pergunta: "Uma venda do CREARE chegou atrasada. Entra no meu caixa?",
    resposta: "Entra, se a venda for depois do início das vendas do seu caixa. A tela atualiza e puxa as vendas novas.",
    palavras: ["venda nao apareceu", "sincronizar", "creare"]
  },

  // ── Fechamento · Vendas ───────────────────────────────────────────────────────────────────────────────
  {
    id: "vendas-comecar",
    tema: "vendas",
    pergunta: "Como começo o fechamento?",
    resposta:
      "Toque em “Fechar caixa” e depois em “Encerrar vendas e ir para conferência”. As vendas param nessa hora e não dá para voltar ao caixa aberto.",
    palavras: ["encerrar vendas", "fechar caixa"]
  },
  {
    id: "vendas-nao-encerra",
    tema: "vendas",
    pergunta: "Não deixa encerrar as vendas.",
    resposta:
      "Veja a mensagem: se o PDV está marcado como desligado, registre o retorno do computador. Se há dinheiro sem lacre esperando, confirme ou marque “Não recebi” em Recebimentos pendentes.",
    palavras: ["registre o retorno do computador", "dinheiro sem lacre aguardando"]
  },
  {
    id: "vendas-popup-gerente",
    tema: "vendas",
    pergunta: "Apareceu “Gerente responsável pelo fechamento”.",
    resposta:
      "Mostra o gerente da abertura. Se é ele, toque em “Sim, confirmar”. Se mudou, toque em “Não, é outro” e digite o nome. O responsável pelo caixa continua sendo quem abriu.",
    palavras: ["popup", "supervisor", "gerente"]
  },
  {
    id: "vendas-popup-sumiu",
    tema: "vendas",
    pergunta: "Recarreguei a página e o popup do gerente não apareceu de novo.",
    resposta: "É normal: a confirmação vale para este caixa enquanto a aba do navegador estiver aberta.",
    palavras: ["recarreguei", "f5"]
  },
  {
    id: "vendas-passo1-o-que-digito",
    tema: "vendas",
    pergunta: "No passo 1, o que eu digito?",
    resposta:
      "As cédulas e as moedas com que você fecha a gaveta, o dinheiro que vai no malote de fechamento. Conte com calma: o sistema não mostra quanto deveria ter.",
    palavras: ["dinheiro do fechamento", "cedulas", "moedas", "contagem", "malote de fechamento"]
  },
  {
    id: "vendas-por-que-nao-mostra",
    tema: "vendas",
    pergunta: "Por que o sistema não mostra quanto deveria ter na gaveta?",
    resposta:
      "Para a contagem ser do que está na mão, sem influência. A comparação com o sistema aparece só depois, na etapa final.",
    palavras: ["esperado", "contagem cega"]
  },
  {
    id: "vendas-errei-contagem",
    tema: "vendas",
    pergunta: "Errei a contagem depois de gerar o relatório.",
    resposta:
      "Toque em “Corrigir contagem”, digite o valor certo e explique o motivo (pelo menos 5 letras). O valor antigo fica guardado e a correção é registrada com data e quem corrigiu.",
    palavras: ["digitei errado", "corrigir contagem", "explique o motivo", "contei errado"]
  },
  {
    id: "vendas-folha-como",
    tema: "vendas",
    pergunta: "Passo 2: como mando a folha do CREARE?",
    resposta:
      "Toque em “Câmera” e fotografe o cupom, ou em “Galeria” (aceita PDF). O sistema lê os valores. Revise período, troco inicial, formas de pagamento, total, despesas e sangria como estão no cupom.",
    palavras: ["foto", "cupom", "relatorio de venda geral", "anexar"]
  },
  {
    id: "vendas-folha-corrigir",
    tema: "vendas",
    pergunta: "O sistema leu um valor errado da folha do CREARE.",
    resposta:
      "Toque em “Corrigir manualmente”, ajuste o campo e explique o motivo (pelo menos 5 letras). A correção fica registrada.",
    palavras: ["leitura errada", "ia leu errado", "corrigir manualmente"]
  },
  {
    id: "vendas-folha-nao-leu",
    tema: "vendas",
    pergunta: "A leitura automática da folha não funcionou.",
    resposta:
      "A foto fica anexada. Digite os valores como estão no cupom: período, troco inicial, formas de pagamento, total, despesas e sangria.",
    palavras: ["leitura automatica nao ficou disponivel", "preencha os valores"]
  },
  {
    id: "vendas-ajustar-inicio",
    tema: "vendas",
    pergunta: "O horário da folha não bate. O que é “Ajustar início”?",
    resposta:
      "Serve para quando o cupom começa antes da abertura do caixa. Você recua o início das vendas em até 60 minutos, no mesmo dia, e explica o motivo. Depois gere o relatório de novo.",
    palavras: ["periodo", "horario nao bate", "inicio das vendas"]
  },
  {
    id: "vendas-ajustar-inicio-erros",
    tema: "vendas",
    pergunta: "Deu erro no “Ajustar início”.",
    resposta:
      "O início só pode ir para antes da abertura, no máximo 60 minutos antes, no mesmo dia, e nunca antes do fechamento do caixa anterior do PDV. Se precisa de mais que isso, chame o gerente.",
    palavras: ["no maximo 60 minutos", "mesmo dia", "caixa anterior"]
  },
  {
    id: "vendas-folhas-diferentes",
    tema: "vendas",
    pergunta: "Folha do CREARE e folha do malote são a mesma coisa?",
    resposta:
      "Não. A folha do CREARE (cupom de vendas) vai na etapa 1. A folha do malote (o papel que vai junto com o dinheiro) vai na etapa 4.",
    palavras: ["folha do malote", "duas folhas"]
  },
  {
    id: "vendas-gerar-apagado",
    tema: "vendas",
    pergunta: "O botão “Gerar relatório de vendas” está apagado.",
    resposta:
      "Falta alguma coisa: as cédulas e moedas do passo 1, a foto da folha do CREARE, a leitura pronta ou a justificativa de uma correção.",
    palavras: ["nao libera", "desabilitado", "cinza"]
  },
  {
    id: "vendas-relatorio-sumiu",
    tema: "vendas",
    pergunta: "Mandei outra foto do CREARE e o relatório sumiu.",
    resposta:
      "Uma folha nova descarta o relatório anterior. Gere de novo. O dinheiro que você digitou no passo 1 continua guardado.",
    palavras: ["outra foto", "trocar foto"]
  },
  {
    id: "vendas-gerar-erros",
    tema: "vendas",
    pergunta: "Deu erro ao gerar o relatório de vendas.",
    resposta:
      "“O período do caixa mudou”: gere de novo. “Folha no modelo antigo”: recarregue a página. “Inicie o fechamento”: toque antes em “Encerrar vendas”.",
    palavras: ["periodo do caixa mudou", "modelo antigo", "recarregue"]
  },
  {
    id: "vendas-maquininha-nao-libera",
    tema: "vendas",
    pergunta: "O botão para ir à maquininha não libera.",
    resposta: "Ele libera depois que o relatório de vendas é gerado, porque é aí que o dinheiro do passo 1 é gravado.",
    palavras: ["conferir maquininha", "proxima etapa"]
  },

  // ── Fechamento · Maquininha ───────────────────────────────────────────────────────────────────────────
  {
    id: "maquininha-qual-relatorio",
    tema: "maquininha",
    pergunta: "Qual relatório da maquininha eu mando?",
    resposta:
      "A foto do relatório que a maquininha imprime. Na manhã, o do turno. Na tarde, o do dia todo (acumulado): o sistema desconta sozinho o que foi da manhã no mesmo PDV e maquininha.",
    palavras: ["pagbank", "relatorio resumido", "acumulado", "comprovante"]
  },
  {
    id: "maquininha-nao-muda-valor",
    tema: "maquininha",
    pergunta: "Não consigo mudar o valor que o sistema leu da maquininha.",
    resposta:
      "É de propósito: na maquininha não existe correção manual. Você só digita o que a leitura não pegou ou marcou como duvidoso. Se a leitura está errada, tire outra foto mais nítida.",
    palavras: ["corrigir manualmente", "leu errado", "valor travado"]
  },
  {
    id: "maquininha-leitura-falhou",
    tema: "maquininha",
    pergunta: "A leitura da maquininha não funcionou.",
    resposta: "A foto fica anexada. Digite os valores do comprovante (crédito, débito, Pix e voucher) e salve.",
    palavras: ["leitura automatica nao funcionou"]
  },
  {
    id: "maquininha-sem-manha",
    tema: "maquininha",
    pergunta: "Diz que não encontrou o caixa da manhã.",
    resposta:
      "Na tarde, quando a manhã desse PDV não fechou no dia, explique o que aconteceu (pelo menos 5 letras) antes de salvar.",
    palavras: ["nao encontramos o caixa da manha", "sem manha"]
  },
  {
    id: "maquininha-erros",
    tema: "maquininha",
    pergunta: "Deu erro ao salvar a maquininha.",
    resposta:
      "“Acumulada menor que a da manhã”: a foto da tarde precisa ser do dia todo. “Informe crédito, débito, Pix e voucher”: preencha os quatro (pode ser 0). “Já registrou manhã e tarde”: as duas leituras do dia já foram salvas. “Envie a foto”: anexe antes de salvar.",
    palavras: ["menor que a leitura da manha", "informe credito", "ja registrou manha e tarde", "envie a foto"]
  },
  {
    id: "maquininha-sem-vinculo",
    tema: "maquininha",
    pergunta: "Diz que o caixa foi aberto sem maquininha.",
    resposta:
      "O relatório só pode ser da maquininha escolhida na abertura. Se o caixa abriu sem maquininha, chame o gerente.",
    palavras: ["sem maquininha vinculada"]
  },
  {
    id: "maquininha-pular",
    tema: "maquininha",
    pergunta: "Posso pular a maquininha?",
    resposta:
      "A tela deixa avançar, mas o caixa não fecha sem a maquininha salva. Se mandar outra foto depois, salve de novo.",
    palavras: ["salve a conferencia da maquininha", "pular"]
  },
  {
    id: "maquininha-cartao-a-mais",
    tema: "maquininha",
    pergunta: "A maquininha mostra mais cartão do que eu vendi no CREARE.",
    resposta:
      "Não lance venda para igualar. Sobra no cartão não é quebra sua. Deixe a diferença como está e explique na observação do fechamento; a Tesouraria verifica.",
    palavras: ["cartao a mais", "nao bate cartao", "igualar", "lancar venda"]
  },

  // ── Fechamento · Relatório final ──────────────────────────────────────────────────────────────────────
  {
    id: "relatorio-o-que-confiro",
    tema: "relatorio-final",
    pergunta: "Na etapa 3, o que eu confiro?",
    resposta:
      "A comparação CREARE × sistema, os pagamentos por tipo, a maquininha, as vendas canceladas, as sangrias com lacre e as entradas e saídas.",
    palavras: ["relatorio final", "conferir"]
  },
  {
    id: "relatorio-divergiu",
    tema: "relatorio-final",
    pergunta: "Algo não bateu no relatório final. E agora?",
    resposta:
      "Volte à etapa do problema, corrija e gere ou salve de novo. Se a diferença for real, explique na observação do fechamento.",
    palavras: ["nao bateu", "diferenca", "voltar etapa"]
  },

  // ── Fechamento · Encerrar ─────────────────────────────────────────────────────────────────────────────
  {
    id: "fechamento-o-que-preencho",
    tema: "fechamento",
    pergunta: "Na etapa 4, o que eu preencho?",
    resposta:
      "Anexe a foto da folha do malote, informe o lacre de fechamento e escreva a observação (por texto ou voz). O dinheiro não é contado de novo: vale o que você digitou em Vendas.",
    palavras: ["folha do malote", "lacre de fechamento", "observacao"]
  },
  {
    id: "fechamento-lacre",
    tema: "fechamento",
    pergunta: "O lacre de fechamento: eu digito ou escolho?",
    resposta:
      "Se a Tesouraria reservou um lacre, escolha esse. Se não reservou, digite o lacre do malote (é obrigatório). Lacre diferente do reservado não é aceito.",
    palavras: ["lacre reservado", "nao corresponde ao lacre"]
  },
  {
    id: "fechamento-lacre-usado",
    tema: "fechamento",
    pergunta: "Diz “Lacre de fechamento já utilizado ou indisponível”.",
    resposta: "Esse lacre já foi usado. Confira o número no malote ou peça outro lacre à Tesouraria.",
    palavras: ["lacre ja utilizado", "indisponivel"]
  },
  {
    id: "fechamento-botao-apagado",
    tema: "fechamento",
    pergunta: "O botão de encerrar está apagado.",
    resposta:
      "A tela mostra o que falta: o relatório de vendas com o dinheiro do passo 1, o lacre de fechamento, a observação (quando há diferença), o gerente confirmado ou a foto da folha do malote.",
    palavras: ["nao deixa fechar", "desabilitado", "cinza"]
  },
  {
    id: "fechamento-travado",
    tema: "fechamento",
    pergunta: "Apareceu “Fechamento travado”.",
    resposta:
      "Há um retorno programado esperando ou dinheiro sem lacre esperando confirmação. Resolva o item que a tela mostra. Se for retorno programado e não sair, chame a retaguarda.",
    palavras: ["travado", "planejada aguardando"]
  },
  {
    id: "fechamento-erros",
    tema: "fechamento",
    pergunta: "Deu erro ao encerrar o caixa.",
    resposta:
      "A mensagem diz o que falta: foto da folha de fechamento, relatório de vendas, maquininha salva, retorno do PDV desligado ou observação da diferença. Se aparecer “saldo físico negativo”, chame o gerente para revisar as saídas.",
    palavras: ["anexe ao menos uma foto", "gere o relatorio completo", "saldo fisico calculado esta negativo"]
  },
  {
    id: "fechamento-dinheiro-vai",
    tema: "fechamento",
    pergunta: "Quando encerro, para onde vai o dinheiro?",
    resposta:
      "No mesmo clique, o dinheiro contado vira entrega ao Cofre (esperando a conferência da Tesouraria) e o caixa fecha. Não tem segundo botão.",
    palavras: ["entrega ao cofre", "malote"]
  },
  {
    id: "fechamento-trocar-responsavel",
    tema: "fechamento",
    pergunta: "Posso trocar o responsável pelo caixa no fechamento?",
    resposta: "Não. O responsável é quem abriu. No fechamento, só o nome do gerente pode mudar.",
    palavras: ["outra pessoa fechou", "troca de operador"]
  },

  // ── Falta e sobra ─────────────────────────────────────────────────────────────────────────────────────
  {
    id: "quebra-faltou",
    tema: "quebra",
    pergunta: "Faltou dinheiro. O que acontece?",
    resposta:
      "Gera quebra de caixa no valor da falta, com a sua observação, e a Tesouraria é avisada. Explique o que aconteceu na observação.",
    palavras: ["falta", "quebra de caixa", "faltando"]
  },
  {
    id: "quebra-sobrou",
    tema: "quebra",
    pergunta: "Sobrou dinheiro. Isso vira crédito para mim?",
    resposta: "Não. A sobra não vira crédito. A observação é obrigatória e a Tesouraria é avisada.",
    palavras: ["sobra", "a mais"]
  },
  {
    id: "quebra-nome",
    tema: "quebra",
    pergunta: "A quebra fica no nome de quem?",
    resposta:
      "No login do posto (por exemplo, PDV 1 · Manhã). Quem estava na gaveta aparece pelo nome digitado em “Responsável pelo caixa” na abertura.",
    palavras: ["dono da quebra", "meu nome"]
  },
  {
    id: "quebra-esconder",
    tema: "quebra",
    pergunta: "Posso lançar uma venda para cobrir uma diferença?",
    resposta:
      "Não. Venda que não aconteceu esconde o problema. Deixe a diferença aparecer e explique na observação; a Tesouraria analisa.",
    palavras: ["cobrir diferenca", "bater o caixa", "simular venda", "igualar"]
  },
  {
    id: "quebra-abertura",
    tema: "quebra",
    pergunta: "Diferença no malote da abertura vira quebra?",
    resposta: "Não. A Tesouraria é avisada e o caixa abre com o valor que você contou.",
    palavras: ["divergencia na abertura"]
  },
  {
    id: "quebra-cofre-recusou",
    tema: "quebra",
    pergunta: "O Cofre recusou meu malote ou minha sangria.",
    resposta:
      "A Tesouraria conferiu e o valor não bateu. Se ela fechar a diferença como falta, nasce uma quebra para quem lançou a entrega, e essa pessoa é avisada.",
    palavras: ["recusa", "cofre recusou", "conferencia divergente"]
  },

  // ── Depois de fechar ──────────────────────────────────────────────────────────────────────────────────
  {
    id: "depois-tesouraria-confere",
    tema: "depois",
    pergunta: "Como a Tesouraria confere o malote?",
    resposta:
      "Ela confere valor, dinheiro, moedas e lacre. Se tudo bater, aceita. Se não bater, registra a recusa com o motivo.",
    palavras: ["conferencia", "tesouraria"]
  },
  {
    id: "depois-reabrir",
    tema: "depois",
    pergunta: "Dá para reabrir um caixa fechado?",
    resposta: "Não. Depois de fechado, o caixa não reabre. Se algo ficou errado, avise a Tesouraria.",
    palavras: ["reabrir", "desfazer fechamento"]
  },
  {
    id: "depois-venda-atrasada",
    tema: "depois",
    pergunta: "Uma venda do CREARE chegou depois que fechei.",
    resposta: "Ela fica registrada como alteração depois do fechamento, no detalhe do caixa, para a Tesouraria ver.",
    palavras: ["alteracao pos fechamento"]
  },
  {
    id: "depois-tirar-foto",
    tema: "depois",
    pergunta: "Posso tirar uma foto anexada depois de fechar?",
    resposta: "Não. Os anexos só podem ser removidos antes do fechamento.",
    palavras: ["remover anexo", "apagar foto"]
  },
  {
    id: "depois-historico",
    tema: "depois",
    pergunta: "Depois de fechar, consigo ver o histórico do meu caixa?",
    resposta: "O histórico de caixas é da gerência. Depois de fechar, a tela do operador volta para a abertura.",
    palavras: ["historico"]
  },
  {
    id: "depois-ajustar-saldo",
    tema: "depois",
    pergunta: "Quem pode ajustar o saldo de uma conta?",
    resposta: "Só o Administrador total ou a Tesouraria. O ajuste é da conta e não reabre o caixa.",
    palavras: ["ajuste de saldo"]
  },

  // ── Quem pode o quê ───────────────────────────────────────────────────────────────────────────────────
  {
    id: "acessos-operador",
    tema: "acessos",
    pergunta: "O que o operador de caixa não vê ou não pode fazer?",
    resposta:
      "Não vê o valor esperado do caixa nem o disponível para sangria, não cancela retorno programado, não lança transferência sem lacre (sem permissão própria) e não abre o histórico de caixas.",
    palavras: ["permissao", "operador"]
  },
  {
    id: "acessos-gerente",
    tema: "acessos",
    pergunta: "O que o gerente pode a mais?",
    resposta:
      "Ver o saldo do caixa e o disponível para sangria, acompanhar os caixas abertos e o histórico, e operar os caixas da empresa.",
    palavras: ["gerencia", "permissao"]
  },
  {
    id: "acessos-gerente-abrir",
    tema: "acessos",
    pergunta: "O gerente pode abrir caixa?",
    resposta: "Só se o login dele tiver posto do caixa. Sem posto, aparece a mensagem pedindo para escolher o posto.",
    palavras: ["gerente abrir"]
  },
  {
    id: "acessos-malote-outro-pdv",
    tema: "acessos",
    pergunta: "Posso ver o malote de outro PDV?",
    resposta: "Não. O operador só consulta o malote do PDV do seu posto.",
    palavras: ["outro pdv"]
  },
  {
    id: "acessos-caixa-nao-permitido",
    tema: "acessos",
    pergunta: "Diz “Caixa não permitido”.",
    resposta: "Você está tentando mexer num caixa que não é o seu. Entre com o login do seu posto.",
    palavras: ["caixa nao permitido"]
  },
  {
    id: "acessos-transferencia-outro-pdv",
    tema: "acessos",
    pergunta: "Diz que a transferência precisa envolver a conta do PDV aberto.",
    resposta: "O operador só transfere de ou para o próprio PDV. Outras transferências são da gerência.",
    palavras: ["precisa envolver a conta do pdv"]
  },
  {
    id: "acessos-malote-em-transferencias",
    tema: "acessos",
    pergunta: "Como confirmo o malote em Transferências?",
    resposta: "Não se confirma ali. O malote para o PDV é recebido na abertura do caixa, digitando o lacre.",
    palavras: ["recebido pela abertura", "confirmar malote"]
  },
  {
    id: "acessos-voz",
    tema: "acessos",
    pergunta: "A observação por voz não funciona.",
    resposta: "Se aparecer “A transcrição por voz ainda não foi configurada”, escreva a observação no campo de texto.",
    palavras: ["audio", "microfone", "transcricao"]
  }
];
