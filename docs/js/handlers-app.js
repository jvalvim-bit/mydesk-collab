'use strict';
/* Handlers que antes eram atributos on*= no HTML.
   Foram movidos para cá para o site poder rodar sob uma
   Content-Security-Policy sem 'unsafe-inline' em script-src:
   com o atributo inline, qualquer HTML injetado por um XSS viraria
   código executável. Gerado a partir do próprio HTML — o corpo de
   cada função é exatamente o que estava no atributo. */
const MD_HANDLERS = [
  ['a1', 'click', function (event) { toggleCRMView() }],
  ['a2', 'click', function (event) { toggleEventsPanel() }],
  ['a3', 'click', function (event) { openInvitePanel() }],
  ['a4', 'click', function (event) { toggleListaWorkspaces() }],
  // a5 era o seletor de status na barra; ele agora vive só no painel Amigos.
  ['a6', 'click', function (event) { openAdminPanel() }],
  ['a7', 'click', function (event) { openNewRecordModal() }],
  ['a8', 'input', function (event) { crmFilterInput(this.value) }],
  ['a9', 'click', function (event) { confirmClearAllRecords() }],
  ['a10', 'click', function (event) { crmSortBy('name') }],
  ['a11', 'click', function (event) { crmSortBy('value') }],
  ['a12', 'click', function (event) { crmSortBy('status') }],
  ['a13', 'click', function (event) { crmSortBy('dueDate') }],
  ['a14', 'click', function (event) { openNewRecordModal() }],
  ['a15', 'click', function (event) { toggleCallMic() }],
  ['a16', 'click', function (event) { toggleCallCam() }],
  ['a17', 'click', function (event) { toggleCallScreenShare() }],
  ['a18', 'click', function (event) { leaveCall() }],
  ['a19', 'click', function (event) { switchEventsTab('events') }],
  ['a20', 'click', function (event) { switchEventsTab('budget') }],
  ['a21', 'click', function (event) { switchEventsTab('expenses') }],
  ['a22', 'click', function (event) { switchEventsTab('tasks') }],
  // a23 era o 'Conectar Outlook'. A integração exigia registro de aplicativo
  // num diretório da Microsoft, que conta pessoal não pode mais criar sem
  // antes abrir conta no Azure. O calendário do MyDesk tomou o lugar dele.
  ['a41', 'click', function (event) { calMudarMes(-1) }],
  ['a42', 'click', function (event) { calMudarMes(1) }],
  ['a43', 'click', function (event) { calHoje() }],
  ['a24', 'click', function (event) { shiftExpenseMonth(-1) }],
  ['a25', 'click', function (event) { shiftExpenseMonth(1) }],
  ['a26', 'click', function (event) { addExpenseFromForm() }],
  ['a27', 'click', function (event) { addMonthlyTask() }],
  ['a28', 'click', function (event) { pickNoteType('personal') }],
  ['a29', 'click', function (event) { pickNoteType('client') }],
  ['a53', 'click', function (event) { criarPastaVazia() }],
  ['a30', 'click', function (event) { backToTypePicker() }],
  ['a31', 'click', function (event) { backToTypePicker() }],
  ['a32', 'click', function (event) { selectCRMStatus(this,'pending') }],
  ['a33', 'click', function (event) { selectCRMStatus(this,'paid') }],
  ['a34', 'click', function (event) { closeModal() }],
  // a35 — opção "Parcial" na criação rápida de cliente (mesma função do
  // formulário completo; ela se orienta pela .crm-status-select mais próxima).
  ['a35', 'click', function (event) { selectCRMStatus(this,'partial') }],
  ['a36', 'input', function (event) { _crmAtualizarDicaParcial() }],
  ['a44', 'click', function (event) { abrirConstrutorFormulario() }],
  ['a45', 'click', function (event) { crmAlterarModelo() }],
  ['a46', 'click', function (event) { crmFormularioDaVaga() }],
  ['a47', 'click', function (event) { crmAnalisarCurriculos() }],
  ['a48', 'click', function (event) { abrirPainelVagas() }],
  ['a49', 'click', function (event) { abrirPainelVagas() }],
  ['a50', 'click', function (event) { abrirBancoTalentos() }],
  ['a51', 'click', function (event) { crmAbrirPropostas() }],
  ['a52', 'click', function (event) { crmAbrirVisaoRH() }],
  // O logo leva de volta ao quadro pessoal. Enter e espaço fazem o mesmo, para
  // quem chega nele pelo teclado — sem isto, `role="button"` promete uma coisa
  // que o elemento não cumpre.
  ['a80', 'click', function (event) { irParaMeuQuadro() }],
  ['a81', 'click', function (event) { event.stopPropagation(); toggleAtalhos() }],
  ['a81', 'click', function (event) { alternarFormatoChamada() }],
  ['a82', 'click', function (event) { alternarPipChamada() }],
  ['a80', 'keydown', function (event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    irParaMeuQuadro();
  }],
];

document.addEventListener('DOMContentLoaded', () => {
  MD_HANDLERS.forEach(([id, evt, fn]) => {
    document.querySelectorAll('[data-h="' + id + '"]').forEach(el => el.addEventListener(evt, fn));
  });
});
