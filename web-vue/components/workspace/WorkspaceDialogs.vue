<script setup lang="ts">
import { computed } from "vue";
import { TELA_TEMA_RESUMO_CAIXA, montarDescricao, montarValidacaoQtd } from "@padaria/shared";
import { useWorkspaceContext } from "~/components/workspace/workspace-context";
import { dinheiro, itemPorTela, precoVendaDoFormProduto } from "~/utils/domain";

const workspace = useWorkspaceContext();

const {
  modalCaixaDrawerAberto,
  modoCaixaDrawer,
  formCaixaDrawer,
  opcoesEmpresa,
  tokenCaixaConfirmado,
  caixaSalvando,
  salvarCaixaDrawer,
  modalOperacaoAberto,
  entidadeNova,
  form,
  discriminandoDespesa,
  discriminandoMercadoria,
  valorTotalOperacao,
  itensVenda,
  tiposPagamento,
  itensDespesa,
  itensMercadoria,
  salvandoOperacao,
  salvarOperacao,
  modalMaloteAberto,
  maloteEditandoId,
  formMalote,
  maloteSalvando,
  salvarMalote,
  modalCadastroAberto,
  cadastroEditandoId,
  cadastroTela,
  formCadastro,
  mascararCpf,
  mascararCnpj,
  atualizarDocumentoCadastro,
  documentoEhCpf,
  mascararWhatsapp,
  mascararCep,
  colaboradoresSelectUsuario,
  atualizarColaboradorUsuario,
  empresasDisponiveis,
  dadosCadastro,
  permissoesDaSecao,
  estadoRegraPermissao,
  definirRegraPermissao,
  cadastroSalvando,
  salvarCadastro,
  modalTemaAberto,
  temaTelaEdicao,
  telasTemaPermitidas,
  abrirTema,
  tema,
  temaSalvando,
  salvarTema,
  modalCopiaAberto,
  copiaModo,
  copiaNivel,
  copiaEmpresaOrigemId,
  copiaEmpresaDestinoId,
  copiaSalvando,
  executarCopia
} = workspace;

// Preview do preco de venda: mesma fonte usada no payload, para preview e valor salvo nunca divergirem.
const precoVendaPreview = computed(() => precoVendaDoFormProduto(formCadastro.value));

// Nome + gramatura + medida => Descricao automatica (regra do Pralis). O campo principal e o NOME.
const unidadeSiglaProduto = computed(
  () => opcoesEmpresa.value.unidadesMedida.find((u) => u.id === formCadastro.value.unidadeIndividualId)?.sigla ?? ""
);
const descricaoAutoPreview = computed(() =>
  montarDescricao(formCadastro.value.descricao, formCadastro.value.quantidadeIndividual, unidadeSiglaProduto.value)
);

// "Como se compra" — versao amigavel do formulario do Pralis ("Saco de 25 KG — descricao").
const EMB_LABEL: Record<string, string> = {
  SACO: "Saco",
  PCT: "Pacote",
  CX: "Caixa",
  UN: "Unidade",
  FD: "Fardo",
  POTE: "Pote",
  BAND: "Bandeja",
  EMB: "Embalagem",
  MIL: "Milheiro",
  KG: "Kg",
  LT: "Litro"
};
const comoSeCompraPreview = computed(() => {
  const emb = formCadastro.value.embalagem;
  if (!emb) return "";
  const rotulo = EMB_LABEL[emb] ?? emb;
  const cde = formCadastro.value.cDe === "C/" ? "com" : "de";
  const qtCad = Number(formCadastro.value.quantidadeCaixa || 0);
  const qtd = qtCad ? `${qtCad}${formCadastro.value.medidaCompra ? " " + formCadastro.value.medidaCompra : ""}` : "";
  const desc = descricaoAutoPreview.value;
  return [rotulo, cde, qtd, desc ? "— " + desc : ""].filter(Boolean).join(" ");
});

// Validacao de quantidade (transformacao): texto automatico da regra do Pralis.
const diasSemana = ["SEG", "TER", "QUA", "QUI", "SEX", "SAB", "DOM"];
const validacaoQtdPreview = computed(() =>
  formCadastro.value.tipo === "transformacao"
    ? montarValidacaoQtd(
        descricaoAutoPreview.value,
        formCadastro.value.transformacao.precisao,
        Number(formCadastro.value.transformacao.quantidade || 0),
        formCadastro.value.transformacao.unidade
      )
    : ""
);
</script>

<template>
  <v-dialog v-model="modalCaixaDrawerAberto" max-width="680">
    <v-card>
      <v-card-title>{{ modoCaixaDrawer === "abrir" ? "Abrir caixa" : "Editar abertura" }}</v-card-title>
      <v-card-text>
        <v-row v-if="modoCaixaDrawer === 'abrir'" dense>
          <v-col cols="12" md="6">
            <v-select
              v-model="formCaixaDrawer.pdvId"
              :items="opcoesEmpresa.pdvs"
              item-title="nome"
              item-value="id"
              label="PDV"
            />
          </v-col>
          <v-col cols="12" md="6">
            <v-text-field
              v-model="formCaixaDrawer.dataHoraAbertura"
              type="datetime-local"
              label="Data e hora de abertura"
            />
          </v-col>
        </v-row>
        <v-row v-else dense>
          <v-col v-if="!tokenCaixaConfirmado" cols="12">
            <v-text-field v-model="formCaixaDrawer.tokenEdicao" label="Codigo de edicao" autofocus />
          </v-col>
          <template v-else>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCaixaDrawer.pdvId"
                :items="opcoesEmpresa.pdvs"
                item-title="nome"
                item-value="id"
                label="PDV"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="formCaixaDrawer.dataHoraAbertura"
                type="datetime-local"
                label="Data e hora de abertura"
              />
            </v-col>
          </template>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="caixaSalvando" @click="modalCaixaDrawerAberto = false">Cancelar</v-btn>
        <v-btn
          v-if="modoCaixaDrawer === 'editar' && !tokenCaixaConfirmado"
          color="primary"
          :disabled="!formCaixaDrawer.tokenEdicao"
          @click="tokenCaixaConfirmado = true"
        >
          Continuar
        </v-btn>
        <v-btn
          v-else
          color="primary"
          :loading="caixaSalvando"
          :disabled="!formCaixaDrawer.pdvId || !formCaixaDrawer.dataHoraAbertura"
          @click="salvarCaixaDrawer"
        >
          Salvar
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalOperacaoAberto" max-width="960" scrollable>
    <v-card>
      <v-card-title>{{ entidadeNova.charAt(0).toUpperCase() + entidadeNova.slice(1) }}</v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="12" md="4"
            ><v-text-field v-model="form.dataReferencia" type="date" label="Data de referencia"
          /></v-col>
          <v-col cols="12" md="4"
            ><v-text-field v-model="form.dataVencimento" type="date" label="Data de vencimento"
          /></v-col>
          <v-col cols="12" md="4"
            ><v-text-field
              v-model="form.valorOriginal"
              type="number"
              label="Valor original"
              :readonly="discriminandoDespesa || discriminandoMercadoria"
          /></v-col>
          <v-col cols="12"><v-text-field v-model="form.descricao" label="Descricao" /></v-col>
          <v-col cols="12"><v-textarea v-model="form.observacao" label="Observacao" rows="2" /></v-col>
          <v-col
            v-if="['venda', 'despesa', 'transferencia', 'mercadoria', 'retirada'].includes(entidadeNova)"
            cols="12"
            md="6"
          >
            <v-select
              v-model="form.contaOrigemId"
              :items="opcoesEmpresa.contas"
              item-title="nome"
              item-value="id"
              label="Conta origem"
            />
          </v-col>
          <v-col v-if="['venda', 'despesa', 'mercadoria', 'retirada'].includes(entidadeNova)" cols="12" md="6"
            ><v-text-field v-model="form.dataPagamento" type="date" label="Data de pagamento"
          /></v-col>
          <v-col v-if="entidadeNova === 'transferencia'" cols="12" md="6">
            <v-select
              v-model="form.contaDestinoId"
              :items="opcoesEmpresa.contas"
              item-title="nome"
              item-value="id"
              label="Conta destino"
            />
          </v-col>
          <v-col v-if="['despesa', 'mercadoria'].includes(entidadeNova)" cols="12" md="6">
            <v-select
              v-model="form.fornecedorId"
              :items="opcoesEmpresa.fornecedores"
              item-title="nome"
              item-value="id"
              label="Fornecedor"
              clearable
            />
          </v-col>
          <v-col v-if="entidadeNova === 'retirada'" cols="12" md="6">
            <v-select
              v-model="form.colaboradorId"
              :items="opcoesEmpresa.colaboradores"
              item-title="nome"
              item-value="id"
              label="Colaborador"
              clearable
            />
          </v-col>
          <v-col v-if="entidadeNova === 'despesa'" cols="12" md="6">
            <v-select
              v-model="form.grupoDespesaId"
              :items="opcoesEmpresa.gruposDespesas"
              item-title="nome"
              item-value="id"
              label="Grupo despesa"
              clearable
            />
          </v-col>
          <v-col v-if="entidadeNova === 'mercadoria'" cols="12" md="6">
            <v-select
              v-model="form.grupoMercadoriaId"
              :items="opcoesEmpresa.gruposMercadorias"
              item-title="nome"
              item-value="id"
              label="Grupo mercadoria"
              clearable
            />
          </v-col>
          <v-col v-if="entidadeNova === 'retirada'" cols="12" md="6">
            <v-select
              v-model="form.grupoRetiradaId"
              :items="opcoesEmpresa.gruposRetiradas"
              item-title="nome"
              item-value="id"
              label="Grupo retirada"
              clearable
            />
          </v-col>
          <v-col v-if="entidadeNova === 'transferencia'" cols="12" md="6">
            <v-select
              v-model="form.maloteId"
              :items="opcoesEmpresa.malotes"
              item-title="codigo"
              item-value="id"
              label="Malote"
              clearable
            />
          </v-col>
          <v-col v-if="entidadeNova === 'transferencia'" cols="12" md="6"
            ><v-text-field v-model="form.numeroLacre" label="Numero do lacre"
          /></v-col>
          <v-col cols="12" md="4"><v-text-field v-model="form.valorAcrescimo" type="number" label="Acrescimo" /></v-col>
          <v-col cols="12" md="8"
            ><v-text-field v-model="form.descricaoAcrescimo" label="Descricao do acrescimo"
          /></v-col>
          <v-col cols="12" md="4"><v-text-field v-model="form.valorDesconto" type="number" label="Desconto" /></v-col>
          <v-col cols="12" md="8"
            ><v-text-field v-model="form.descricaoDesconto" label="Descricao do desconto"
          /></v-col>
          <v-col cols="12" md="4"><v-switch v-model="form.computar" label="Computar" color="primary" /></v-col>
          <v-col cols="12" md="4"
            ><v-switch v-model="form.temNotaFiscal" label="Tem nota fiscal" color="primary"
          /></v-col>
          <v-col cols="12" md="4"
            ><div class="text-caption text-muted">Total</div>
            <div class="text-h6">{{ dinheiro(valorTotalOperacao) }}</div></v-col
          >
        </v-row>
        <v-divider class="my-4" />
        <div v-if="entidadeNova === 'venda'" class="d-grid ga-4">
          <section>
            <div class="d-flex align-center justify-space-between mb-2">
              <h3 class="text-subtitle-1">Itens da venda</h3>
              <v-btn
                size="small"
                variant="outlined"
                prepend-icon="mdi-plus"
                @click="
                  itensVenda.push({
                    descricaoProduto: '',
                    quantidade: '1',
                    valorUnitario: '',
                    valorTotal: '',
                    produtoId: ''
                  })
                "
                >Adicionar item</v-btn
              >
            </div>
            <v-row v-for="(item, index) in itensVenda" :key="`venda-${index}`" dense>
              <v-col cols="12" md="4">
                <v-select
                  v-model="item.produtoId"
                  :items="opcoesEmpresa.produtos"
                  item-title="descricao"
                  item-value="id"
                  label="Produto"
                  clearable
                />
              </v-col>
              <v-col cols="12" md="3"><v-text-field v-model="item.descricaoProduto" label="Descricao" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="item.quantidade" type="number" label="Qtd." /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="item.valorTotal" type="number" label="Total" /></v-col>
              <v-col cols="12" md="1" class="d-flex align-center justify-end">
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  :disabled="itensVenda.length === 1"
                  @click="itensVenda.splice(index, 1)"
                />
              </v-col>
            </v-row>
          </section>

          <section>
            <div class="d-flex align-center justify-space-between mb-2">
              <h3 class="text-subtitle-1">Tipos de pagamento</h3>
              <v-btn
                size="small"
                variant="outlined"
                prepend-icon="mdi-plus"
                @click="tiposPagamento.push({ formaPagamentoId: '', totalPago: '', numeroVendas: '1' })"
                >Adicionar pagamento</v-btn
              >
            </div>
            <v-row v-for="(item, index) in tiposPagamento" :key="`pagamento-${index}`" dense>
              <v-col cols="12" md="5">
                <v-select
                  v-model="item.formaPagamentoId"
                  :items="opcoesEmpresa.formasPagamento"
                  item-title="nome"
                  item-value="id"
                  label="Forma de pagamento"
                  clearable
                />
              </v-col>
              <v-col cols="6" md="3"
                ><v-text-field v-model="item.numeroVendas" type="number" label="Numero vendas"
              /></v-col>
              <v-col cols="6" md="3"><v-text-field v-model="item.totalPago" type="number" label="Total pago" /></v-col>
              <v-col cols="12" md="1" class="d-flex align-center justify-end">
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  :disabled="tiposPagamento.length === 1"
                  @click="tiposPagamento.splice(index, 1)"
                />
              </v-col>
            </v-row>
          </section>
        </div>

        <section v-if="entidadeNova === 'despesa'" class="mt-2">
          <v-switch v-model="discriminandoDespesa" label="Discriminar itens da despesa" color="primary" />
          <div v-if="discriminandoDespesa">
            <div class="d-flex justify-end mb-2">
              <v-btn
                size="small"
                variant="outlined"
                prepend-icon="mdi-plus"
                @click="itensDespesa.push({ descricao: '', valor: '', grupoDespesaId: '' })"
                >Adicionar item</v-btn
              >
            </div>
            <v-row v-for="(item, index) in itensDespesa" :key="`despesa-${index}`" dense>
              <v-col cols="12" md="5"><v-text-field v-model="item.descricao" label="Descricao" /></v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="item.grupoDespesaId"
                  :items="opcoesEmpresa.gruposDespesas"
                  item-title="nome"
                  item-value="id"
                  label="Grupo"
                  clearable
                />
              </v-col>
              <v-col cols="8" md="2"><v-text-field v-model="item.valor" type="number" label="Valor" /></v-col>
              <v-col cols="4" md="1" class="d-flex align-center justify-end">
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  :disabled="itensDespesa.length === 1"
                  @click="itensDespesa.splice(index, 1)"
                />
              </v-col>
            </v-row>
          </div>
        </section>

        <section v-if="entidadeNova === 'mercadoria'" class="mt-2">
          <v-switch v-model="discriminandoMercadoria" label="Discriminar mercadorias" color="primary" />
          <div v-if="discriminandoMercadoria">
            <div class="d-flex justify-end mb-2">
              <v-btn
                size="small"
                variant="outlined"
                prepend-icon="mdi-plus"
                @click="
                  itensMercadoria.push({
                    descricao: '',
                    quantidade: '1',
                    valorUnitario: '',
                    valorTotal: '',
                    produtoId: '',
                    grupoMercadoriaId: '',
                    unidadeMedidaId: ''
                  })
                "
                >Adicionar mercadoria</v-btn
              >
            </div>
            <v-row v-for="(item, index) in itensMercadoria" :key="`mercadoria-${index}`" dense>
              <v-col cols="12" md="4">
                <v-select
                  v-model="item.produtoId"
                  :items="opcoesEmpresa.produtos"
                  item-title="descricao"
                  item-value="id"
                  label="Produto"
                  clearable
                />
              </v-col>
              <v-col cols="12" md="3"><v-text-field v-model="item.descricao" label="Descricao" /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="item.quantidade" type="number" label="Qtd." /></v-col>
              <v-col cols="6" md="2"><v-text-field v-model="item.valorTotal" type="number" label="Total" /></v-col>
              <v-col cols="12" md="1" class="d-flex align-center justify-end">
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  :disabled="itensMercadoria.length === 1"
                  @click="itensMercadoria.splice(index, 1)"
                />
              </v-col>
            </v-row>
          </div>
        </section>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="salvandoOperacao" @click="modalOperacaoAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="salvandoOperacao" @click="salvarOperacao">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalMaloteAberto" max-width="640">
    <v-card>
      <v-card-title>{{ maloteEditandoId ? "Editar malote" : "Novo malote" }}</v-card-title>
      <v-card-text>
        <v-text-field v-model="formMalote.codigo" label="Codigo" />
        <div class="d-grid ga-2">
          <div v-for="(_, index) in formMalote.lacres" :key="index" class="d-flex ga-2">
            <v-text-field v-model="formMalote.lacres[index]" label="Lacre" hide-details />
            <v-btn
              icon="mdi-delete"
              variant="text"
              :disabled="formMalote.lacres.length === 1"
              @click="formMalote.lacres.splice(index, 1)"
            />
          </div>
          <v-btn variant="outlined" prepend-icon="mdi-plus" @click="formMalote.lacres.push('')">Adicionar lacre</v-btn>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="maloteSalvando" @click="modalMaloteAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="maloteSalvando" @click="salvarMalote">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalCadastroAberto" max-width="820" scrollable>
    <v-card>
      <v-card-title>{{ cadastroEditandoId ? "Editar cadastro" : "Novo cadastro" }}</v-card-title>
      <v-card-subtitle>{{ itemPorTela[cadastroTela]?.titulo ?? "Cadastro operacional" }}</v-card-subtitle>
      <v-card-text>
        <v-row dense>
          <v-col v-if="cadastroTela === 'grupos'" cols="12">
            <v-select
              v-model="formCadastro.tipoGrupo"
              :items="['despesa', 'mercadoria', 'retirada', 'vendas']"
              label="Tipo de grupo"
              :disabled="Boolean(cadastroEditandoId)"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'areas_setores'" cols="12">
            <v-select
              v-model="formCadastro.tipoAreaSetor"
              :items="['area', 'setor']"
              label="Tipo"
              :disabled="Boolean(cadastroEditandoId)"
            />
          </v-col>
          <v-col
            v-if="cadastroTela !== 'produtos'"
            cols="12"
            :md="['unidades', 'pdv', 'empresas', 'fornecedores', 'clientes'].includes(cadastroTela) ? 6 : 12"
            ><v-text-field v-model="formCadastro.nome" label="Nome"
          /></v-col>
          <v-col v-if="cadastroTela === 'empresas'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.cnpj"
              label="CNPJ"
              maxlength="18"
              @update:model-value="formCadastro.cnpj = mascararCnpj(String($event || ''))"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'fornecedores' || cadastroTela === 'clientes'" cols="12" md="6">
            <v-text-field
              :model-value="formCadastro.documento"
              label="Documento"
              maxlength="18"
              @update:model-value="atualizarDocumentoCadastro(String($event || ''))"
            />
          </v-col>
          <template v-if="cadastroTela === 'clientes'">
            <v-col v-if="documentoEhCpf(formCadastro.documento)" cols="12" md="6">
              <v-text-field v-model="formCadastro.dataNascimento" type="date" label="Data de nascimento" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                :model-value="formCadastro.whatsapp"
                label="WhatsApp"
                maxlength="15"
                @update:model-value="formCadastro.whatsapp = mascararWhatsapp(String($event || ''))"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field v-model="formCadastro.email" type="email" label="Email" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field
                :model-value="formCadastro.cep"
                label="CEP"
                maxlength="9"
                @update:model-value="formCadastro.cep = mascararCep(String($event || ''))"
              />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="formCadastro.rua" label="Rua" />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="formCadastro.numero" label="Numero" />
            </v-col>
            <v-col cols="12" md="8">
              <v-text-field v-model="formCadastro.complemento" label="Complemento" />
            </v-col>
            <v-col cols="12" md="5">
              <v-text-field v-model="formCadastro.bairro" label="Bairro" />
            </v-col>
            <v-col cols="12" md="5">
              <v-text-field v-model="formCadastro.cidade" label="Cidade" />
            </v-col>
            <v-col cols="12" md="2">
              <v-text-field
                :model-value="formCadastro.estado"
                label="Estado"
                maxlength="2"
                @update:model-value="
                  formCadastro.estado = String($event || '')
                    .toUpperCase()
                    .slice(0, 2)
                "
              />
            </v-col>
          </template>
          <v-col v-if="cadastroTela === 'pdv'" cols="12" md="8">
            <v-select
              v-model="formCadastro.contaId"
              :items="opcoesEmpresa.contas"
              item-title="nome"
              item-value="id"
              label="Conta do PDV"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'pdv'" cols="12" md="4">
            <v-switch v-model="formCadastro.ativo" color="primary" label="Ativo" />
          </v-col>
          <v-col v-if="cadastroTela === 'unidades'" cols="12" md="4"
            ><v-text-field v-model="formCadastro.sigla" label="Sigla"
          /></v-col>
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12" md="6"
            ><v-text-field
              :model-value="formCadastro.cpf"
              label="CPF"
              maxlength="14"
              @update:model-value="formCadastro.cpf = mascararCpf(String($event || ''))"
          /></v-col>
          <template v-if="cadastroTela === 'produtos'">
            <v-col cols="12" md="4"><v-text-field v-model="formCadastro.codigo" label="Codigo" /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field v-model="formCadastro.codigoBarras" label="Codigo de barras"
            /></v-col>
            <v-col cols="12" md="4"><v-text-field v-model="formCadastro.marca" label="Marca" /></v-col>
            <v-col cols="12"><v-text-field v-model="formCadastro.descricao" label="Nome do produto *" /></v-col>
            <v-col cols="12">
              <v-text-field
                :model-value="descricaoAutoPreview"
                label="Descricao (automatica)"
                readonly
                bg-color="grey-lighten-4"
                placeholder="Preencha nome, quantidade individual e unidade"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-select
                v-model="formCadastro.grupoMercadoriaId"
                :items="opcoesEmpresa.gruposMercadorias"
                item-title="nome"
                item-value="id"
                label="Grupo"
                clearable
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-select
                v-model="formCadastro.unidadeIndividualId"
                :items="opcoesEmpresa.unidadesMedida"
                item-title="nome"
                item-value="id"
                label="Unidade individual"
              />
            </v-col>
            <v-col cols="12" md="4">
              <v-text-field v-model="formCadastro.quantidadeIndividual" type="number" label="Quantidade individual" />
            </v-col>
            <v-col cols="12"><div class="text-body-2 font-weight-bold">Como se compra</div></v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="formCadastro.embalagem"
                :items="['UN', 'KG', 'LT', 'MIL', 'FD', 'PCT', 'CX', 'POTE', 'EMB', 'SACO', 'BAND']"
                label="Embalagem"
                clearable
              />
            </v-col>
            <v-col cols="12" md="3">
              <v-select v-model="formCadastro.cDe" :items="['C/', 'DE']" label="C/ ou DE" clearable />
            </v-col>
            <v-col cols="12" md="3">
              <v-text-field v-model="formCadastro.quantidadeCaixa" type="number" label="Qtd por caixa (qtCad)" />
            </v-col>
            <v-col cols="12" md="3">
              <v-select
                v-model="formCadastro.medidaCompra"
                :items="['UN', 'KG', 'LT']"
                label="Medida de compra"
                clearable
              />
            </v-col>
            <v-col cols="12">
              <v-text-field
                :model-value="comoSeCompraPreview"
                label="Como se compra (automatico)"
                readonly
                bg-color="grey-lighten-4"
                placeholder="Preencha a embalagem para gerar"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCadastro.tipo"
                :items="[
                  { titulo: 'Revenda', valor: 'revenda' },
                  { titulo: 'Transformacao', valor: 'transformacao' }
                ]"
                item-title="titulo"
                item-value="valor"
                label="Tipo"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCadastro.status"
                :items="[
                  { titulo: 'Ativo', valor: 'ativo' },
                  { titulo: 'Inativo', valor: 'inativo' }
                ]"
                item-title="titulo"
                item-value="valor"
                label="Status"
              />
            </v-col>
            <v-col cols="12" md="4"
              ><v-text-field v-model="formCadastro.custo" type="number" label="Custo (caixa)"
            /></v-col>
            <v-col cols="12" md="4"
              ><v-text-field v-model="formCadastro.margem" type="number" step="0.01" label="Margem (fracao, ex 0.30)"
            /></v-col>
            <v-col cols="12" md="4" class="d-flex align-center">
              <v-switch v-model="formCadastro.auto" label="Preco automatico" color="primary" hide-details />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                v-model="formCadastro.precoVenda"
                type="number"
                label="Preco de venda"
                :disabled="formCadastro.auto"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                :model-value="precoVendaPreview == null ? '-' : dinheiro(precoVendaPreview)"
                label="Preco calculado (automatico)"
                readonly
                bg-color="purple-lighten-5"
              />
            </v-col>
            <v-col cols="12"><div class="text-body-2 font-weight-bold">Fiscal</div></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="formCadastro.fiscal.ncm" label="NCM" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="formCadastro.fiscal.cest" label="CEST" /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="formCadastro.fiscal.categoriaFiscal" label="Categoria fiscal"
            /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="formCadastro.fiscal.cstPisCofins" label="CST PIS/COFINS"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-text-field v-model="formCadastro.fiscal.aliquotaCheia" type="number" label="Aliquota cheia %"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-text-field v-model="formCadastro.fiscal.aliquotaFcp" type="number" label="Aliquota FCP %"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-text-field v-model="formCadastro.fiscal.icms" type="number" label="ICMS %"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-text-field v-model="formCadastro.fiscal.aliquotaPis" type="number" label="Aliquota PIS %"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-text-field v-model="formCadastro.fiscal.aliquotaCofins" type="number" label="Aliquota COFINS %"
            /></v-col>
            <v-col cols="6" md="4"
              ><v-text-field v-model="formCadastro.fiscal.reducaoIcms" type="number" label="Reducao ICMS %"
            /></v-col>
            <template v-if="formCadastro.tipo === 'transformacao'">
              <v-col cols="12"><div class="text-body-2 font-weight-bold">Transformacao</div></v-col>
              <v-col cols="6" md="3">
                <v-select
                  v-model="formCadastro.transformacao.precisao"
                  :items="['EXATOS', 'APROXIMADOS']"
                  label="Precisao"
                  clearable
                />
              </v-col>
              <v-col cols="6" md="3"
                ><v-text-field v-model="formCadastro.transformacao.quantidade" type="number" label="Quantidade"
              /></v-col>
              <v-col cols="6" md="3">
                <v-select
                  v-model="formCadastro.transformacao.unidade"
                  :items="['UN', 'G', 'ML']"
                  label="Unidade"
                  clearable
                />
              </v-col>
              <v-col cols="6" md="3"
                ><v-text-field v-model="formCadastro.transformacao.produtoReceituario" label="Produto receituario"
              /></v-col>
              <v-col cols="12">
                <v-text-field
                  :model-value="validacaoQtdPreview"
                  label="Validacao de quantidade (automatico)"
                  readonly
                  bg-color="grey-lighten-4"
                />
              </v-col>
            </template>
            <template v-if="formCadastro.tipo === 'revenda'">
              <v-col cols="12"><div class="text-body-2 font-weight-bold">Promocao</div></v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="formCadastro.promoTipo"
                  :items="[
                    { titulo: 'Sem promocao', valor: 'nenhum' },
                    { titulo: 'Valor fixo', valor: 'valor' },
                    { titulo: 'Desconto %', valor: 'desconto' }
                  ]"
                  item-title="titulo"
                  item-value="valor"
                  label="Promocao"
                />
              </v-col>
              <template v-if="formCadastro.promoTipo !== 'nenhum'">
                <v-col v-if="formCadastro.promoTipo === 'valor'" cols="6" md="4"
                  ><v-text-field v-model="formCadastro.promoValor" type="number" label="Valor promo (R$)"
                /></v-col>
                <v-col v-if="formCadastro.promoTipo === 'desconto'" cols="6" md="4"
                  ><v-text-field v-model="formCadastro.promoDescontoPct" type="number" label="Desconto %"
                /></v-col>
                <v-col cols="6" md="2"
                  ><v-text-field v-model="formCadastro.promoHoraInicio" type="time" label="Inicio"
                /></v-col>
                <v-col cols="6" md="2"
                  ><v-text-field v-model="formCadastro.promoHoraFim" type="time" label="Termino"
                /></v-col>
                <v-col cols="12" md="4"
                  ><v-text-field v-model="formCadastro.promoValidaAte" type="date" label="Valida ate"
                /></v-col>
                <v-col cols="12">
                  <div class="text-caption text-medium-emphasis mb-1">Dias da semana (nenhum marcado = todos)</div>
                  <div class="d-flex flex-wrap ga-3">
                    <v-checkbox
                      v-for="(dia, i) in diasSemana"
                      :key="i"
                      v-model="formCadastro.promoDias[i]"
                      :label="dia"
                      density="compact"
                      hide-details
                      color="primary"
                    />
                  </div>
                </v-col>
              </template>
            </template>
            <v-col cols="12">
              <div class="d-flex align-center justify-space-between mb-2">
                <div class="text-body-2 font-weight-bold">Conversoes</div>
                <v-btn
                  size="small"
                  variant="outlined"
                  prepend-icon="mdi-plus"
                  @click="
                    formCadastro.produtoConversoes.push({
                      unidadeMedidaId: '',
                      quantidade: '1',
                      unidadesIndividuais: '1'
                    })
                  "
                  >Adicionar conversao</v-btn
                >
              </div>
              <v-row v-for="(conversao, index) in formCadastro.produtoConversoes" :key="index" dense>
                <v-col cols="12" md="4">
                  <v-select
                    v-model="conversao.unidadeMedidaId"
                    :items="opcoesEmpresa.unidadesMedida"
                    item-title="nome"
                    item-value="id"
                    label="Unidade"
                  />
                </v-col>
                <v-col cols="6" md="3"
                  ><v-text-field v-model="conversao.quantidade" type="number" label="Quantidade"
                /></v-col>
                <v-col cols="6" md="4">
                  <v-text-field v-model="conversao.unidadesIndividuais" type="number" label="Unidades individuais" />
                </v-col>
                <v-col cols="12" md="1" class="d-flex align-center justify-end">
                  <v-btn icon="mdi-delete" variant="text" @click="formCadastro.produtoConversoes.splice(index, 1)" />
                </v-col>
              </v-row>
            </v-col>
          </template>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6"
            ><v-text-field v-model="formCadastro.email" type="email" label="Email"
          /></v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12" md="6">
            <v-select
              :model-value="formCadastro.novoColaborador ? '__novo__' : formCadastro.colaboradorId"
              :items="colaboradoresSelectUsuario"
              item-title="nome"
              item-value="id"
              label="Colaborador"
              @update:model-value="atualizarColaboradorUsuario(String($event || ''))"
            />
          </v-col>
          <template v-if="cadastroTela === 'usuarios' && formCadastro.novoColaborador">
            <v-col cols="12" md="6">
              <v-text-field v-model="formCadastro.novoColaboradorNome" label="Nome do colaborador" />
            </v-col>
            <v-col cols="12" md="6">
              <v-text-field
                :model-value="formCadastro.novoColaboradorCpf"
                label="CPF do colaborador"
                maxlength="14"
                @update:model-value="formCadastro.novoColaboradorCpf = mascararCpf(String($event || ''))"
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCadastro.novoColaboradorSetorId"
                :items="opcoesEmpresa.setores"
                item-title="nome"
                item-value="id"
                label="Setor"
                clearable
              />
            </v-col>
            <v-col cols="12" md="6">
              <v-select
                v-model="formCadastro.novoColaboradorCargoId"
                :items="opcoesEmpresa.cargos"
                item-title="nome"
                item-value="id"
                label="Cargo inicial"
              />
            </v-col>
          </template>
          <v-col v-if="cadastroTela === 'usuarios' && !cadastroEditandoId" cols="12"
            ><v-text-field v-model="formCadastro.senha" type="password" label="Senha"
          /></v-col>
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
            <v-select
              v-model="formCadastro.setorId"
              :items="opcoesEmpresa.setores"
              item-title="nome"
              item-value="id"
              label="Setor"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'colaboradores'" cols="12">
            <v-select
              v-model="formCadastro.cargoId"
              :items="opcoesEmpresa.cargos"
              item-title="nome"
              item-value="id"
              label="Cargo"
            />
          </v-col>
          <v-col v-if="cadastroTela === 'areas_setores' && formCadastro.tipoAreaSetor === 'setor'" cols="12" md="6">
            <v-select
              v-model="formCadastro.areaId"
              :items="opcoesEmpresa.areas"
              item-title="nome"
              item-value="id"
              label="Area"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'areas_setores' && formCadastro.tipoAreaSetor === 'setor'" cols="12" md="6">
            <v-select
              v-model="formCadastro.setorPaiId"
              :items="opcoesEmpresa.setores"
              item-title="nome"
              item-value="id"
              label="Setor pai"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'grupos'" cols="12">
            <v-select
              v-model="formCadastro.grupoPaiId"
              :items="
                dadosCadastro('grupos').filter(
                  (grupo) => grupo.tipoGrupo === formCadastro.tipoGrupo && grupo.id !== cadastroEditandoId
                )
              "
              item-title="nome"
              item-value="id"
              label="Grupo pai"
              clearable
            />
          </v-col>
          <v-col v-if="cadastroTela === 'usuarios'" cols="12">
            <div class="text-body-2 font-weight-bold mb-2">Empresas</div>
            <v-chip-group v-model="formCadastro.empresaIds" multiple column>
              <v-chip v-for="empresa in empresasDisponiveis" :key="empresa.id" :value="empresa.id" filter>{{
                empresa.nome
              }}</v-chip>
            </v-chip-group>
          </v-col>
          <template v-if="cadastroTela === 'permissoes'">
            <v-col cols="12" md="4"
              ><v-select
                v-model="formCadastro.tipoPermissao"
                :items="['cargo', 'setor', 'usuario']"
                label="Tipo de permissao"
            /></v-col>
            <v-col v-if="formCadastro.tipoPermissao === 'cargo'" cols="12" md="8">
              <v-select
                v-model="formCadastro.cargoId"
                :items="opcoesEmpresa.cargos"
                item-title="nome"
                item-value="id"
                label="Cargo"
              />
            </v-col>
            <v-col v-if="formCadastro.tipoPermissao === 'setor'" cols="12" md="8"
              ><v-select
                v-model="formCadastro.setorId"
                :items="opcoesEmpresa.setores"
                item-title="nome"
                item-value="id"
                label="Setor"
            /></v-col>
            <v-col v-if="formCadastro.tipoPermissao === 'usuario'" cols="12" md="8"
              ><v-select
                v-model="formCadastro.usuarioId"
                :items="opcoesEmpresa.usuarios"
                item-title="nome"
                item-value="usuarioId"
                label="Usuario"
            /></v-col>
            <template v-for="secao in secoesPermissoes" :key="secao.titulo">
              <v-col v-if="permissoesDaSecao(secao).length" cols="12">
                <v-sheet class="pa-3 rounded-lg soft-bg">
                  <div class="text-body-2 font-weight-bold mb-2">{{ secao.titulo }}</div>
                  <div class="text-caption text-muted mb-3">
                    Herdar nao concede acesso sozinho; a permissao precisa estar como Permitir em alguma camada efetiva.
                  </div>
                  <v-row dense>
                    <v-col v-for="permissao in permissoesDaSecao(secao)" :key="permissao" cols="12">
                      <div class="permission-rule-row">
                        <span class="permission-rule-label">{{ permissao.replaceAll("_", " ") }}</span>
                        <v-btn-toggle
                          :model-value="estadoRegraPermissao(permissao)"
                          density="compact"
                          divided
                          mandatory
                          @update:model-value="definirRegraPermissao(permissao, String($event || 'herdar'))"
                        >
                          <v-btn size="small" value="herdar">Herdar</v-btn>
                          <v-btn size="small" value="permitir">Permitir</v-btn>
                          <v-btn size="small" value="negar">Negar</v-btn>
                        </v-btn-toggle>
                      </div>
                    </v-col>
                  </v-row>
                </v-sheet>
              </v-col>
            </template>
          </template>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="cadastroSalvando" @click="modalCadastroAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="cadastroSalvando" @click="salvarCadastro">Salvar</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalTemaAberto" max-width="560">
    <v-card>
      <v-card-title>Aparencia</v-card-title>
      <v-card-subtitle>Cores editaveis por pagina/secao.</v-card-subtitle>
      <v-card-text>
        <v-select
          v-model="temaTelaEdicao"
          :items="telasTemaPermitidas"
          item-title="titulo"
          item-value="id"
          label="Pagina/secao"
          @update:model-value="abrirTema(String($event))"
        />
        <v-row dense>
          <template v-if="temaTelaEdicao === TELA_TEMA_RESUMO_CAIXA">
            <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Entradas" /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="tema.corSecundaria" type="color" label="Transferencias"
            /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Despesas" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Retiradas" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Saldo" /></v-col>
          </template>
          <template v-else>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corPrimaria" type="color" label="Primaria" /></v-col>
            <v-col cols="12" md="6"
              ><v-text-field v-model="tema.corSecundaria" type="color" label="Secundaria"
            /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corFundo" type="color" label="Fundo" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corCartao" type="color" label="Cartao" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corSucesso" type="color" label="Sucesso" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corAviso" type="color" label="Aviso" /></v-col>
            <v-col cols="12" md="6"><v-text-field v-model="tema.corErro" type="color" label="Erro" /></v-col>
          </template>
        </v-row>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="temaSalvando" @click="modalTemaAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="temaSalvando" @click="salvarTema">Salvar tema</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="modalCopiaAberto" max-width="560">
    <v-card>
      <v-card-title>{{ copiaModo === "importar" ? "Importar dados" : "Exportar registro" }}</v-card-title>
      <v-card-text>
        <v-select v-model="copiaNivel" :items="['simples', 'completo']" label="Modo" />
        <v-select
          v-if="copiaModo === 'importar'"
          v-model="copiaEmpresaOrigemId"
          :items="empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaDestinoId)"
          item-title="nome"
          item-value="id"
          label="Empresa origem"
        />
        <v-select
          v-model="copiaEmpresaDestinoId"
          :items="empresasDisponiveis.filter((empresa) => empresa.id !== copiaEmpresaOrigemId)"
          item-title="nome"
          item-value="id"
          label="Empresa destino"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="outlined" :disabled="copiaSalvando" @click="modalCopiaAberto = false">Cancelar</v-btn>
        <v-btn color="primary" :loading="copiaSalvando" @click="executarCopia">{{
          copiaModo === "importar" ? "Importar" : "Exportar"
        }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.permission-rule-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
}

.permission-rule-label {
  min-width: 0;
  overflow-wrap: anywhere;
}

@media (max-width: 600px) {
  .permission-rule-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
