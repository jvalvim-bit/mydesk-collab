'use strict';

/*
 * MyDesk i18n
 * -----------
 * Um núcleo pequeno e independente de framework para as páginas públicas e
 * para o app. O catálogo é código local (não há tradução remota), portanto
 * nenhum texto digitado por usuário é enviado, inspecionado ou traduzido.
 *
 * Markup novo deve preferir os atributos explícitos:
 *   data-i18n="chave"
 *   data-i18n-placeholder="chave"
 *   data-i18n-title="chave"
 *   data-i18n-aria-label="chave"
 *   data-i18n-content="chave"          (meta tags)
 *
 * A tradução de texto estático sem atributo existe apenas para os nós que já
 * estavam no documento quando este script carregou. Nós criados depois (nome,
 * nota, comentário, resposta de formulário etc.) nunca entram nessa varredura.
 */
(function iniciarI18n(window, document) {
  const STORAGE_KEY = 'md_lang';
  const LOCALES = Object.freeze({ pt: 'pt-BR', en: 'en-US', es: 'es-ES' });
  const FLAGS = Object.freeze({ pt: '🇧🇷', en: '🇺🇸', es: '🇪🇸' });
  const LANGUAGE_NAMES = Object.freeze({
    pt: 'Português (Brasil)',
    en: 'English (US)',
    es: 'Español (España)',
  });

  /*
   * Cada chave possui exatamente três valores. Além de reduzir repetição, esse
   * formato torna impossível esquecer um idioma sem o teste acusar.
   */
  const CATALOG = Object.freeze({
    'common.language': ['Idioma', 'Language', 'Idioma'],
    'common.chooseLanguage': ['Escolher idioma', 'Choose language', 'Elegir idioma'],
    'common.close': ['Fechar', 'Close', 'Cerrar'],
    'common.cancel': ['Cancelar', 'Cancel', 'Cancelar'],
    'common.confirm': ['Confirmar', 'Confirm', 'Confirmar'],
    'common.loading': ['Carregando…', 'Loading…', 'Cargando…'],
    'common.sending': ['Enviando…', 'Sending…', 'Enviando…'],
    'common.save': ['Salvar', 'Save', 'Guardar'],
    'common.add': ['Adicionar', 'Add', 'Añadir'],
    'common.back': ['Voltar', 'Back', 'Volver'],
    'common.today': ['Hoje', 'Today', 'Hoy'],
    'common.yes': ['Sim', 'Yes', 'Sí'],
    'common.no': ['Não', 'No', 'No'],
    'common.privacy': ['Política de Privacidade', 'Privacy Policy', 'Política de Privacidad'],
    'common.terms': ['Termos de Uso', 'Terms of Use', 'Términos de Uso'],

    /* Identidade: escolher o @. "não deu para checar" existe porque falha de
       leitura NÃO é "já em uso" — dizer que está tomado o que não foi possível
       verificar fez todo @ digitado parecer indisponível. */
    'auth.checkFailed': [
      'não deu para checar agora',
      "couldn't check right now",
      'no se pudo verificar ahora',
    ],
    'app.identTitle': ['Escolha seu @', 'Choose your @', 'Elija su @'],
    'app.identBody': [
      'É por ele que as pessoas encontram você para conversar e compartilhar quadros. Letras minúsculas, números e _ — de 3 a 20 caracteres.',
      "It's how people find you to chat and share boards. Lowercase letters, numbers and _ — 3 to 20 characters.",
      'Es como la gente le encuentra para conversar y compartir tableros. Minúsculas, números y _ — de 3 a 20 caracteres.',
    ],
    'app.identShort': ['mín. 3 caracteres', 'min. 3 characters', 'mín. 3 caracteres'],
    'app.cancelRequest': ['Cancelar pedido', 'Cancel request', 'Cancelar solicitud'],

    /* Vagas: a vaga deixou de ser um rótulo digitado e virou registro. */
    'app.noAiScore': ['sem triagem', 'not screened', 'sin criba'],
    'app.needsScreening': ['rode a triagem por IA para ter nota', 'run the AI screening to get scores', 'ejecute la criba por IA para tener nota'],
    'app.photoLocalWarn': ['Fica guardada so neste navegador, para nao pesar no banco. Em outro aparelho aparece a inicial.', 'Kept in this browser only, to keep the database light. On another device the initial shows.', 'Se guarda solo en este navegador, para no pesar en la base. En otro aparato aparece la inicial.'],
    'app.autoAdvance': ['Avancar sozinho pela nota da IA', 'Auto-advance by the AI score', 'Avanzar solo por la nota de la IA'],
    'app.autoAdvanceFrom': ['A partir de', 'From', 'A partir de'],
    'app.autoAdvanceTo': ['vai para a 2a etapa (Entrevista RH).', 'goes to the 2nd stage (HR interview).', 'va a la 2a etapa (Entrevista RRHH).'],
    'app.autoAdvanceWarn': ['So move para a frente, nunca para tras, e nunca reprova. Quem ficar abaixo da nota permanece onde esta, para voce decidir.', 'It only moves forward, never back, and never rejects. Whoever scores below stays put, for you to decide.', 'Solo mueve hacia adelante, nunca hacia atras, y nunca rechaza. Quien quede debajo permanece donde esta, para que usted decida.'],
    'rh.autoAdvanced': ['{n} candidato(s) com nota {corte}+ foram para \"{etapa}\": {nomes}.', '{n} candidate(s) scoring {corte}+ moved to \"{etapa}\": {nomes}.', '{n} candidato(s) con nota {corte}+ pasaron a \"{etapa}\": {nomes}.'],
    'rh.collaboratorNeedsName': ['O colaborador precisa de um nome.', 'The collaborator needs a name.', 'El colaborador necesita un nombre.'],
    'rh.saveCollaboratorError': ['Erro ao salvar o colaborador.', 'Could not save the collaborator.', 'Error al guardar el colaborador.'],
    'rh.alreadyCollaborator': ['{nome} já está no quadro de colaboradores.', '{nome} is already on the team roster.', '{nome} ya está en el cuadro de colaboradores.'],
    'rh.nowCollaborator': ['{nome} entrou no quadro de colaboradores.', '{nome} joined the team roster.', '{nome} entró al cuadro de colaboradores.'],
    'rh.admDocs': ['Documentos', 'Documents', 'Documentos'],
    'rh.admDocsSub': ['RG, CPF, comprovante de residência, PIS, CTPS, etc.', 'ID, tax number, proof of address, work record, etc.', 'DNI, CUIT/RUT, comprobante de domicilio, etc.'],
    'rh.admContrato': ['Contrato', 'Contract', 'Contrato'],
    'rh.admContratoSub': ['Assinatura do contrato de trabalho', 'Signing the employment contract', 'Firma del contrato de trabajo'],
    'rh.admEmail': ['E-mail corporativo', 'Company e-mail', 'Correo corporativo'],
    'rh.admEmailSub': ['Criação e liberação do e-mail', 'Creating and releasing the mailbox', 'Creación y habilitación del correo'],
    'rh.admAcesso': ['Acesso ao MyDesk', 'MyDesk access', 'Acceso a MyDesk'],
    'rh.admAcessoSub': ['Criação de conta e permissões', 'Account and permissions setup', 'Creación de cuenta y permisos'],
    'rh.admEquip': ['Equipamentos', 'Equipment', 'Equipos'],
    'rh.admEquipSub': ['Entrega de notebook e acessórios', 'Handing over laptop and accessories', 'Entrega de notebook y accesorios'],
    'rh.offerAdmission': ['Proposta e Admissão', 'Offer and onboarding', 'Propuesta y admisión'],
    'rh.currentStatus': ['Status atual', 'Current status', 'Estado actual'],
    'rh.noOffer': ['Sem proposta', 'No offer yet', 'Sin propuesta'],
    'rh.offerSummary': ['Resumo da proposta', 'Offer summary', 'Resumen de la propuesta'],
    'rh.offerHistory': ['Histórico da proposta', 'Offer history', 'Historial de la propuesta'],
    'rh.editOffer': ['Editar', 'Edit', 'Editar'],
    'rh.editOfferTitle': ['Proposta', 'Offer', 'Propuesta'],
    'rh.role': ['Cargo', 'Role', 'Puesto'],
    'rh.salary': ['Salário', 'Salary', 'Salario'],
    'rh.benefits': ['Benefícios', 'Benefits', 'Beneficios'],
    'rh.contract': ['Modalidade', 'Contract type', 'Modalidad'],
    'rh.workload': ['Jornada', 'Working hours', 'Jornada'],
    'rh.startDate': ['Data de início', 'Start date', 'Fecha de inicio'],
    'rh.answerBy': ['Prazo para resposta', 'Reply by', 'Plazo de respuesta'],
    'rh.owner': ['Responsável', 'Owner', 'Responsable'],
    'rh.department': ['Departamento', 'Department', 'Departamento'],
    'rh.propDraft': ['Rascunho', 'Draft', 'Borrador'],
    'rh.propSent': ['Enviada', 'Sent', 'Enviada'],
    'rh.propSeen': ['Visualizada', 'Viewed', 'Vista'],
    'rh.propAccepted': ['Aceita', 'Accepted', 'Aceptada'],
    'rh.propAdmitted': ['Admissão', 'Onboarding', 'Admisión'],
    'rh.propStage': ['Proposta', 'Offer', 'Propuesta'],
    'rh.stampStep': ['Registrar', 'Mark', 'Registrar'],
    'rh.downloadPdf': ['Baixar PDF', 'Download PDF', 'Descargar PDF'],
    'rh.resend': ['Reenviar', 'Resend', 'Reenviar'],
    'rh.counterOffer': ['Registrar contraproposta', 'Log counter-offer', 'Registrar contrapropuesta'],
    'rh.counterAsked': ['Valor pedido', 'Amount asked', 'Valor pedido'],
    'rh.counterNote': ['O que foi conversado', 'What was discussed', 'Lo que se conversó'],
    'rh.counterLine': ['Contraproposta em {data}: {valor}{nota}', 'Counter-offer on {data}: {valor}{nota}', 'Contrapropuesta el {data}: {valor}{nota}'],
    'rh.counterSaved': ['Contraproposta registrada.', 'Counter-offer logged.', 'Contrapropuesta registrada.'],
    'rh.noValue': ['sem valor informado', 'no amount given', 'sin valor informado'],
    'rh.convert': ['Converter em colaborador', 'Add to the team', 'Convertir en colaborador'],
    'rh.convertAsk': ['{nome} entra no quadro de colaboradores. A ficha do candidato continua no funil, marcada como admitida.', '{nome} joins the team roster. The candidate record stays in the funnel, marked as hired.', '{nome} entra al cuadro de colaboradores. La ficha del candidato sigue en el embudo, marcada como admitida.'],
    'rh.alreadyOnTeam': ['Já é colaborador', 'Already on the team', 'Ya es colaborador'],
    'rh.admissionChecklist': ['Checklist de admissão', 'Onboarding checklist', 'Checklist de admisión'],
    'rh.doneOf': ['{feitos}/{total} concluído(s)', '{feitos}/{total} done', '{feitos}/{total} completado(s)'],
    'rh.addItem': ['Item', 'Item', 'Ítem'],
    'rh.newItem': ['Novo item', 'New item', 'Nuevo ítem'],
    'rh.renameItem': ['Renomear item', 'Rename item', 'Renombrar ítem'],
    'rh.item': ['Item', 'Item', 'Ítem'],
    'rh.detail': ['Detalhe', 'Detail', 'Detalle'],
    'rh.status': ['Status', 'Status', 'Estado'],
    'rh.done': ['Concluído', 'Done', 'Completado'],
    'rh.pending': ['Pendente', 'Pending', 'Pendiente'],
    'rh.whoDoes': ['quem faz', 'who does it', 'quién lo hace'],
    'rh.rowActions': ['Ações', 'Actions', 'Acciones'],
    'rh.offerLetter': ['Proposta de trabalho', 'Job offer', 'Propuesta de trabajo'],
    'rh.offerFooter': ['Documento gerado pelo MyDesk em {data}.', 'Document generated by MyDesk on {data}.', 'Documento generado por MyDesk el {data}.'],
    'rh.noOffersYet': ['Nenhuma proposta ainda. Leve alguém até a etapa Proposta, ou abra a ficha e use \"Proposta e admissão\".', 'No offers yet. Move someone to the Offer stage, or open a card and use \"Offer and onboarding\".', 'Ninguna propuesta aún. Lleve a alguien a la etapa Propuesta, o abra la ficha y use \"Propuesta y admisión\".'],
    'rh.hrOverview': ['Visão geral do RH', 'HR overview', 'Visión general de RR. HH.'],
    'rh.hrSearch': ['Buscar colaborador, área ou documento...', 'Search person, area or document...', 'Buscar colaborador, área o documento...'],
    'rh.newCollaborator': ['Novo colaborador', 'New team member', 'Nuevo colaborador'],
    'rh.editCollaborator': ['Editar colaborador', 'Edit team member', 'Editar colaborador'],
    'rh.deleteCollaborator': ['Excluir do quadro', 'Remove from roster', 'Eliminar del cuadro'],
    'rh.deleteCollaboratorAsk': ['{nome} sai do quadro de colaboradores. A ficha do candidato que deu origem a ele não é tocada.', '{nome} leaves the team roster. The candidate record they came from is untouched.', '{nome} sale del cuadro de colaboradores. La ficha del candidato que le dio origen no se toca.'],
    'rh.activeCollaborators': ['Colaboradores ativos', 'Active team members', 'Colaboradores activos'],
    'rh.hiresThisMonth': ['Contratações no mês', 'Hires this month', 'Contrataciones del mes'],
    'rh.inProbation': ['Em experiência', 'In probation', 'En periodo de prueba'],
    'rh.onVacation': ['Em férias', 'On vacation', 'De vacaciones'],
    'rh.away': ['Afastados', 'On leave', 'Ausentes'],
    'rh.pendingRequests': ['Solicitações pendentes', 'Pending requests', 'Solicitudes pendientes'],
    'rh.vsLastMonth': ['vs. mês anterior', 'vs. last month', 'vs. mes anterior'],
    'rh.probationFoot': ['até {n} dias de casa', 'up to {n} days in', 'hasta {n} días de casa'],
    'rh.plusAway': ['+{n} afastado(s)', '+{n} on leave', '+{n} ausente(s)'],
    'rh.fromOnboarding': ['itens de admissão em aberto', 'open onboarding items', 'ítems de admisión abiertos'],
    'rh.headcountEvolution': ['Evolução do quadro', 'Headcount over time', 'Evolución del cuadro'],
    'rh.months': ['meses', 'months', 'meses'],
    'rh.byDepartment': ['Colaboradores por departamento', 'Team by department', 'Colaboradores por departamento'],
    'rh.total': ['Total', 'Total', 'Total'],
    'rh.noDept': ['Sem departamento', 'No department', 'Sin departamento'],
    'rh.noTeam': ['Nenhum colaborador no quadro ainda. O departamento é preenchido na ficha de cada um — o cargo do candidato não vira departamento sozinho.', 'Nobody on the roster yet. The department is set on each person record — a candidate role does not become a department on its own.', 'Ningún colaborador en el cuadro aún. El departamento se completa en la ficha de cada uno — el puesto del candidato no se vuelve departamento solo.'],
    'rh.noHistory': ['Ainda não há histórico suficiente para desenhar a evolução.', 'Not enough history yet to draw the trend.', 'Aún no hay historial suficiente para dibujar la evolución.'],
    'rh.nothingHere': ['Nada por aqui.', 'Nothing here.', 'Nada por aquí.'],
    'rh.seeAllN': ['Ver todos ({n})', 'See all ({n})', 'Ver todos ({n})'],
    'rh.seeLess': ['Ver menos', 'See less', 'Ver menos'],
    'rh.onboardings': ['Onboardings em andamento', 'Onboardings in progress', 'Onboardings en curso'],
    'rh.pendingDocs': ['Documentos pendentes', 'Pending documents', 'Documentos pendientes'],
    'rh.absences': ['Férias e ausências', 'Vacation and leave', 'Vacaciones y ausencias'],
    'rh.pendingReviews': ['Avaliações pendentes', 'Pending reviews', 'Evaluaciones pendientes'],
    'rh.reviewProbation': ['Avaliação de experiência', 'Probation review', 'Evaluación de prueba'],
    'rh.reviewPerformance': ['Avaliação de efetivação', 'Confirmation review', 'Evaluación de efectivización'],
    'rh.birthdays': ['Aniversariantes do mês', 'Birthdays this month', 'Cumpleaños del mes'],
    'rh.nextAdmissions': ['Próximas admissões', 'Upcoming start dates', 'Próximas admisiones'],
    'rh.importantPending': ['Pendências importantes', 'Important pending items', 'Pendientes importantes'],
    'rh.pendItem': ['{item} — admissões em andamento', '{item} — onboardings in progress', '{item} — admisiones en curso'],
    'rh.pendCount': ['{n} pendente(s)', '{n} pending', '{n} pendiente(s)'],
    'rh.pendExp': ['Avaliação de experiência (45 dias)', 'Probation review (45 days)', 'Evaluación de prueba (45 días)'],
    'rh.pendPerf': ['Avaliação de efetivação (90 dias)', 'Confirmation review (90 days)', 'Evaluación de efectivización (90 días)'],
    'rh.pendProposta': ['Proposta sem resposta — {nome}', 'Offer with no answer — {nome}', 'Propuesta sin respuesta — {nome}'],
    'rh.dueToday': ['vence hoje', 'due today', 'vence hoy'],
    'rh.overdueDays': ['venceu há {n} dia(s)', '{n} day(s) overdue', 'venció hace {n} día(s)'],
    'rh.teamRoster': ['Quadro de colaboradores', 'Team roster', 'Cuadro de colaboradores'],
    'rh.rosterEmpty': ['Ninguém no quadro ainda. Um candidato vira colaborador na tela de Proposta e Admissão.', 'Nobody on the roster yet. A candidate becomes a team member on the Offer and onboarding screen.', 'Nadie en el cuadro aún. Un candidato se convierte en colaborador en la pantalla de Propuesta y Admisión.'],
    'rh.name': ['Nome', 'Name', 'Nombre'],
    'rh.admittedOn': ['Admissão', 'Start date', 'Admisión'],
    'rh.situation': ['Situação', 'Status', 'Situación'],
    'rh.sit_ativo': ['Ativo', 'Active', 'Activo'],
    'rh.sit_ferias': ['Férias', 'Vacation', 'Vacaciones'],
    'rh.sit_afastado': ['Afastado', 'On leave', 'Ausente'],
    'rh.sit_desligado': ['Desligado', 'Left', 'Desvinculado'],
    'rh.markActive': ['Marcar como ativo', 'Mark as active', 'Marcar como activo'],
    'rh.markVacation': ['Marcar em férias', 'Mark on vacation', 'Marcar de vacaciones'],
    'rh.markAway': ['Marcar afastado', 'Mark on leave', 'Marcar ausente'],
    'rh.markOff': ['Registrar desligamento', 'Log departure', 'Registrar desvinculación'],
    'rh.month0': ['jan', 'Jan', 'ene'],
    'rh.month1': ['fev', 'Feb', 'feb'],
    'rh.month2': ['mar', 'Mar', 'mar'],
    'rh.month3': ['abr', 'Apr', 'abr'],
    'rh.month4': ['mai', 'May', 'may'],
    'rh.month5': ['jun', 'Jun', 'jun'],
    'rh.month6': ['jul', 'Jul', 'jul'],
    'rh.month7': ['ago', 'Aug', 'ago'],
    'rh.month8': ['set', 'Sep', 'sep'],
    'rh.month9': ['out', 'Oct', 'oct'],
    'rh.month10': ['nov', 'Nov', 'nov'],
    'rh.month11': ['dez', 'Dec', 'dic'],
    'rh.offers': ['Propostas', 'Offers', 'Propuestas'],
    'rh.duties': ['O que vai fazer', 'What they will do', 'Qué va a hacer'],
    'rh.company': ['Empresa', 'Company', 'Empresa'],
    'rh.replyTo': ['Resposta para', 'Reply to', 'Respuesta a'],
    'rh.replyToField': ['E-mail para a resposta do candidato', 'Email for the candidate\'s reply', 'Correo para la respuesta del candidato'],
    'rh.phoneOnLetter': ['Telefone no papel timbrado (opcional)', 'Phone on the letterhead (optional)', 'Teléfono en el membrete (opcional)'],
    'rh.undoStep': ['Desfazer', 'Undo', 'Deshacer'],
    'rh.sendByEmail': ['Enviar por e-mail', 'Send by email', 'Enviar por correo'],
    'rh.send': ['Enviar', 'Send', 'Enviar'],
    'rh.sendAsk': ['A proposta em PDF vai para {email}. A resposta dele volta para {resposta}.', 'The offer PDF goes to {email}. Their reply comes back to {resposta}.', 'La propuesta en PDF va a {email}. Su respuesta vuelve a {resposta}.'],
    'rh.whichTemplate': ['Qual proposta enviar?', 'Which offer to send?', '¿Qué propuesta enviar?'],
    'rh.whichTemplateSub': ['O e-mail e o destinatário são os mesmos nos dois casos. Muda só o documento que vai anexado.', 'The email and the recipient are the same either way. Only the attached document changes.', 'El correo y el destinatario son los mismos en ambos casos. Cambia solo el documento adjunto.'],
    'rh.templateMyDesk': ['Modelo do MyDesk', 'MyDesk template', 'Modelo de MyDesk'],
    'rh.templateMyDeskSub': ['A carta montada com o cargo, o salário e as condições que você preencheu.', 'The letter built from the role, the salary and the terms you filled in.', 'La carta armada con el puesto, el salario y las condiciones que completaste.'],
    'rh.templateOwn': ['Meu próprio modelo', 'My own template', 'Mi propio modelo'],
    'rh.templateOwnSub': ['Envie o seu documento em PDF ou Word — ele vai anexado no lugar da nossa carta.', 'Send your own document as PDF or Word — it goes attached instead of our letter.', 'Envía tu documento en PDF o Word — va adjunto en lugar de nuestra carta.'],
    'rh.sendAskFile': ['"{arquivo}" vai anexado para {email}. A resposta dele volta para {resposta}.', '"{arquivo}" goes attached to {email}. Their reply comes back to {resposta}.', '"{arquivo}" va adjunto a {email}. Su respuesta vuelve a {resposta}.'],
    'rh.fileKind': ['Envie um PDF ou um documento do Word (.doc ou .docx).', 'Send a PDF or a Word document (.doc or .docx).', 'Envía un PDF o un documento de Word (.doc o .docx).'],
    'rh.fileTooBig': ['O arquivo passa de 5 MB. Envie um menor.', 'The file is over 5 MB. Send a smaller one.', 'El archivo supera los 5 MB. Envía uno más pequeño.'],
    'rh.fileUnreadable': ['Não consegui ler este arquivo.', 'I could not read this file.', 'No pude leer este archivo.'],
    'rh.sentTo': ['Proposta enviada para {email}.', 'Offer sent to {email}.', 'Propuesta enviada a {email}.'],
    'rh.sendFailed': ['Não consegui enviar agora.', 'Could not send right now.', 'No pude enviar ahora.'],
    'rh.sendNoEmail': ['{nome} não tem e-mail na ficha. Abra a ficha e informe um antes de enviar.', '{nome} has no email on file. Open the record and add one before sending.', '{nome} no tiene correo en la ficha. Abre la ficha e informa uno antes de enviar.'],
    'rh.sendNoReply': ['Informe o e-mail para a resposta do candidato em "Editar" antes de enviar — sem ele, quem assinar não sabe para onde devolver.', 'Set the email for the candidate\'s reply under "Edit" before sending — without it, whoever signs has nowhere to send it back.', 'Informa el correo para la respuesta del candidato en "Editar" antes de enviar — sin él, quien firme no sabe adónde devolverlo.'],
    'rh.offerFile': ['Proposta', 'Offer', 'Propuesta'],
    'rh.signHere': ['Assinatura do(a) candidato(a)', 'Signature of the candidate', 'Firma del candidato(a)'],
    'rh.signDate': ['Data:  ___/___/______', 'Date:  ___/___/______', 'Fecha:  ___/___/______'],
    'rh.letterTitle': ['Proposta de Contratação', 'Offer of Employment', 'Propuesta de Contratación'],
    'rh.letterVacancy': ['Vaga de {vaga}', 'Opening for {vaga}', 'Vacante de {vaga}'],
    'rh.letterHi': ['Prezada(o) {nome},', 'Dear {nome},', 'Estimada(o) {nome}:'],
    'rh.letterOpen': ['É com satisfação que apresentamos nossa proposta para que você integre nosso time{cargo}. Abaixo estão as condições combinadas.', 'We are glad to present our offer for you to join our team{cargo}. The agreed terms are below.', 'Nos complace presentar nuestra propuesta para que te sumes a nuestro equipo{cargo}. Abajo están las condiciones acordadas.'],
    'rh.letterAsRole': [' como {cargo}', ' as {cargo}', ' como {cargo}'],
    'rh.letterTerms': ['CONDIÇÕES DA PROPOSTA', 'OFFER TERMS', 'CONDICIONES DE LA PROPUESTA'],
    'rh.letterDuties': ['O que você vai fazer', 'What you will do', 'Qué vas a hacer'],
    'rh.letterReply': ['Para aceitar, assine no campo abaixo e devolva este documento para {email}{prazo}. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.', 'To accept, sign below and send this document back to {email}{prazo}. We look forward to your answer, and welcome aboard in advance.', 'Para aceptar, firma abajo y devuelve este documento a {email}{prazo}. Esperamos tu respuesta con entusiasmo, y desde ya te damos la bienvenida.'],
    'rh.letterReplyNoMail': ['Para aceitar, assine no campo abaixo e devolva este documento a quem enviou esta proposta. Esperamos a sua resposta com expectativa e desde já damos as boas-vindas.', 'To accept, sign below and send this document back to whoever sent you this offer. We look forward to your answer, and welcome aboard in advance.', 'Para aceptar, firma abajo y devuelve este documento a quien te envió esta propuesta. Esperamos tu respuesta con entusiasmo, y desde ya te damos la bienvenida.'],
    'rh.letterUntil': [' até {data}', ' by {data}', ' hasta {data}'],
    'rh.letterRegards': ['Atenciosamente,', 'Best regards,', 'Atentamente,'],
    'rh.offerCleared': ['A proposta e o checklist de admissão de {nome} foram apagados: ele voltou para a triagem.', '{nome}\'s offer and onboarding checklist were cleared: they went back to screening.', 'La propuesta y el checklist de admisión de {nome} fueron borrados: volvió al cribado.'],
    'rh.grpNegotiating': ['Em negociação', 'In negotiation', 'En negociación'],
    'rh.grpNegotiatingSub': ['Proposta feita, esperando a resposta do candidato.', 'Offer made, waiting for the candidate\'s answer.', 'Propuesta hecha, esperando la respuesta del candidato.'],
    'rh.grpAccepted': ['Aceitas — falta admitir', 'Accepted — to onboard', 'Aceptadas — falta admitir'],
    'rh.grpAcceptedSub': ['Estão na coluna Admissão. Converta em colaborador para entrar no quadro do RH.', 'They are in the Onboarding column. Convert to a team member to enter the HR roster.', 'Están en la columna Admisión. Conviértelo en colaborador para entrar al cuadro de RR. HH.'],
    'rh.grpArriving': ['Chegando ao fim do funil', 'Reaching the end of the funnel', 'Llegando al final del embudo'],
    'rh.grpArrivingSub': ['Nas duas últimas colunas, ainda sem proposta registrada.', 'In the last two columns, with no offer registered yet.', 'En las dos últimas columnas, aún sin propuesta registrada.'],
    'rh.grpHired': ['Já no time', 'Already on the team', 'Ya en el equipo'],
    'rh.grpHiredSub': ['Viraram colaboradores. A ficha do candidato continua guardada.', 'They became team members. The candidate record is still kept.', 'Se volvieron colaboradores. La ficha del candidato sigue guardada.'],
    'rh.nobodyHere': ['Ninguém nesta situação agora.', 'Nobody in this situation right now.', 'Nadie en esta situación ahora.'],
    'rh.startsOn': ['início {data}', 'starts {data}', 'inicio {data}'],
    'rh.dueInDays': ['faltam {n} dia(s)', '{n} day(s) left', 'faltan {n} día(s)'],
    'rh.emptyNoTeam': ['Ninguém no quadro ainda — converta um candidato admitido em "Propostas".', 'Nobody on the roster yet — convert a hired candidate under "Offers".', 'Nadie en el cuadro aún — convierte a un candidato admitido en "Propuestas".'],
    'rh.noBirthdayThisMonth': ['Ninguém do time faz aniversário em {mes}.', 'Nobody on the team has a birthday in {mes}.', 'Nadie del equipo cumple años en {mes}.'],
    'rh.noBirthdayData': ['{n} colaborador(es) sem data de nascimento na ficha — abra a ficha de cada um para preencher.', '{n} team member(s) with no birth date on file — open each record to fill it in.', '{n} colaborador(es) sin fecha de nacimiento en la ficha — abre la ficha de cada uno para completarla.'],
    'rh.letterP1': ['Obrigado por todo o cuidado e o tempo que você dedicou ao nosso processo seletivo. Conversamos com muita gente boa, e a sua trajetória foi a que mais se aproximou do que procurávamos.', 'Thank you for the care and the time you gave our hiring process. We met a lot of great people, and your track record came closest to what we were looking for.', 'Gracias por todo el cuidado y el tiempo que dedicaste a nuestro proceso de selección. Conversamos con mucha gente valiosa, y tu trayectoria fue la que más se acercó a lo que buscábamos.'],
    'rh.letterP2': ['É com muita satisfação que convidamos você a fazer parte da nossa equipe{cargo}.', 'It is with great pleasure that we invite you to join our team{cargo}.', 'Es con mucha satisfacción que te invitamos a formar parte de nuestro equipo{cargo}.'],
    'rh.letterP3': ['No dia a dia, você vai {atividades}', 'Day to day, you will {atividades}', 'En el día a día, vas a {atividades}'],
    'rh.letterP4': ['Ficaríamos felizes em ter você conosco a partir de {inicio}. Abaixo estão as condições que combinamos. Se algo aqui não corresponder ao que conversamos, por favor, informe antes de assinar; preferimos acertar agora do que começar com dúvida.', 'We would be glad to have you with us from {inicio}. The terms we agreed on are below. If anything here does not match what we discussed, please say so before signing; we would rather sort it out now than start with a doubt.', 'Nos encantaría tenerte con nosotros a partir de {inicio}. Abajo están las condiciones que acordamos. Si algo aquí no corresponde a lo que conversamos, por favor, avísanos antes de firmar; preferimos ajustarlo ahora que empezar con una duda.'],
    'rh.letterP5': ['Esperamos a sua resposta com expectativa, e desde já damos as boas-vindas.', 'We look forward to your answer, and welcome aboard in advance.', 'Esperamos tu respuesta con entusiasmo, y desde ya te damos la bienvenida.'],
    'rh.letterSoon': ['data a combinar', 'a date to be agreed', 'una fecha a acordar'],
    'rh.startingSoon': ['{n} ainda não começou/começaram', '{n} has not started yet', '{n} aún no comenzó/comenzaron'],
    'rh.employmentSection': ['Vínculo', 'Employment', 'Vínculo'],
    'rh.fromProcess': ['Do processo seletivo', 'From the hiring process', 'Del proceso de selección'],
    'rh.pullFromRecord': ['Trazer dados da ficha do candidato', 'Pull data from the candidate record', 'Traer datos de la ficha del candidato'],
    'rh.pulledFields': ['{n} campo(s) trazidos da ficha do candidato.', '{n} field(s) pulled from the candidate record.', '{n} campo(s) traídos de la ficha del candidato.'],
    'rh.nothingToPull': ['A ficha do candidato não tem nada que já não esteja aqui.', 'The candidate record has nothing that is not already here.', 'La ficha del candidato no tiene nada que no esté ya aquí.'],
    'rh.noSourceRecord': ['A ficha do candidato que deu origem a este colaborador não está mais neste quadro.', 'The candidate record this person came from is no longer on this board.', 'La ficha del candidato que dio origen a este colaborador ya no está en este tablero.'],
    'rh.linkedTo': ['Esta ficha está ligada ao colaborador {nome}, admitido em {data}.', 'This record is linked to team member {nome}, who started on {data}.', 'Esta ficha está ligada al colaborador {nome}, admitido el {data}.'],
    'rh.openCollaborator': ['Abrir a ficha dele', 'Open their record', 'Abrir su ficha'],
    'rh.unlink': ['Desvincular', 'Unlink', 'Desvincular'],
    'rh.unlinkAsk': ['A ficha de {cand} deixa de estar ligada ao colaborador {colab}. Ninguém é excluído: os dois continuam existindo, separados.', 'The record of {cand} stops being linked to team member {colab}. Nobody is deleted: both keep existing, separately.', 'La ficha de {cand} deja de estar ligada al colaborador {colab}. Nadie es eliminado: ambos siguen existiendo, por separado.'],
    'rh.hiredOutOne': ['{count} candidato já admitido saiu do funil e está no quadro de colaboradores', '{count} hired candidate left the funnel and is on the team roster', '{count} candidato ya admitido salió del embudo y está en el cuadro de colaboradores'],
    'rh.hiredOutMany': ['{count} candidatos já admitidos saíram do funil e estão no quadro de colaboradores', '{count} hired candidates left the funnel and are on the team roster', '{count} candidatos ya admitidos salieron del embudo y están en el cuadro de colaboradores'],
    'rh.seeHired': ['ver', 'show', 'ver'],
    'rh.showingHired': ['Mostrando também quem já foi admitido.', 'Also showing people already hired.', 'Mostrando también a quienes ya fueron admitidos.'],
    'rh.inInterviewStages': ['nas etapas de entrevista ou com data marcada', 'in interview stages or with a date set', 'en etapas de entrevista o con fecha marcada'],
    'rh.removeOffer': ['Remover proposta', 'Remove offer', 'Quitar propuesta'],
    'rh.removeOfferAsk': ['A proposta de {nome} é apagada, com o histórico de datas. O checklist de admissão e a ficha dele continuam como estão.', 'The offer for {nome} is deleted, along with the date history. The onboarding checklist and their record stay as they are.', 'La propuesta de {nome} se borra, junto con el historial de fechas. El checklist de admisión y su ficha siguen como están.'],
    'rh.offerRemoved': ['Proposta removida.', 'Offer removed.', 'Propuesta eliminada.'],
    'rh.remote': ['Remoto', 'Remote', 'Remoto'],
    'rh.justNow': ['agora', 'just now', 'ahora'],
    'rh.agoMin': ['há {n}min', '{n}min ago', 'hace {n}min'],
    'rh.agoHour': ['há {n}h', '{n}h ago', 'hace {n}h'],
    'rh.agoDay': ['há {n}d', '{n}d ago', 'hace {n}d'],
    'rh.agoMonth': ['há {n}m', '{n}mo ago', 'hace {n}m'],
    'rh.starHint': ['Nota {n} na triagem por IA', 'Scored {n} in the AI screening', 'Nota {n} en el cribado por IA'],
    'rh.starHintVaga': ['Nota {n} na triagem para "{vaga}"', 'Score {n} in the screening for "{vaga}"', 'Nota {n} en la criba para "{vaga}"'],
    'rh.starHintVagaData': ['Nota {n} na triagem para "{vaga}", em {data}', 'Score {n} in the screening for "{vaga}", on {data}', 'Nota {n} en la criba para "{vaga}", el {data}'],
    'rh.addCandidate': ['Adicionar candidato', 'Add candidate', 'Agregar candidato'],
    'rh.autoAdvanceOff': ['Ninguem foi movido: o avanco automatico esta desligado em \"{vaga}\". Ligue em Vagas, na caixa \"Avancar sozinho pela nota da IA\".', 'Nobody moved: automatic advancing is off for \"{vaga}\". Turn it on under Openings, in the \"Advance automatically by the AI score\" box.', 'Nadie fue movido: el avance automatico esta apagado en \"{vaga}\". Activelo en Vacantes, en la casilla \"Avanzar solo por la nota de la IA\".'],
    'rh.autoAdvanceNoVacancy': ['Ninguem foi movido: nao ha vaga cadastrada para estes candidatos, e a regra de nota vive na vaga. Cadastre-a em Vagas para o avanco funcionar.', 'Nobody moved: there is no registered opening for these candidates, and the score rule lives on the opening. Register it under Openings for advancing to work.', 'Nadie fue movido: no hay vacante registrada para estos candidatos, y la regla de nota vive en la vacante. Registrela en Vacantes para que el avance funcione.'],
    'rh.iaRoleOther': ['Outra vaga (digitar)', 'Another opening (type it)', 'Otra vacante (escribir)'],
    'rh.iaRoleFree': ['A lista traz as vagas cadastradas e as que ja aparecem nos candidatos. Voce pode digitar qualquer outro nome.', 'The list shows registered openings and those already seen on candidates. You can type any other name.', 'La lista trae las vacantes registradas y las que ya aparecen en los candidatos. Puede escribir cualquier otro nombre.'],
    'rh.keepInPool': ['Guardar no banco de talentos', 'Keep in the talent pool', 'Guardar en el banco de talentos'],
    'rh.keepInPoolHint': ['Para chamar em vagas futuras. O motivo acima vai junto como observacao.', 'To call for future openings. The reason above goes along as a note.', 'Para llamar en vacantes futuras. El motivo de arriba va como observacion.'],
    'rh.rejectedAndKept': ['{name} foi reprovado e esta no banco de talentos.', '{name} was rejected and is in the talent pool.', '{name} fue rechazado y esta en el banco de talentos.'],
    'app.fromRejected': ['Reprovado em processo', 'Rejected in a process', 'Rechazado en un proceso'],
    'app.talentPool': ['Banco de talentos', 'Talent pool', 'Banco de talentos'],
    'app.talentPoolSub': ['Encontre e gerencie talentos para oportunidades atuais e futuras.', 'Find and manage talent for current and future openings.', 'Encuentre y gestione talentos para oportunidades actuales y futuras.'],
    'app.searchTalent': ['Buscar talento...', 'Search talent...', 'Buscar talento...'],
    'app.newTalent': ['Novo talento', 'New talent', 'Nuevo talento'],
    'app.editTalent': ['Editar talento', 'Edit talent', 'Editar talento'],
    'app.deleteTalent': ['Excluir talento', 'Delete talent', 'Eliminar talento'],
    'app.deleteTalentAsk': ['"{nome}" sai do banco. Candidaturas ja criadas a partir dele continuam nos processos.', '"{nome}" leaves the pool. Applications already created from it stay in their processes.', '"{nome}" sale del banco. Las candidaturas ya creadas siguen en sus procesos.'],
    'app.talentSaved': ['Talento salvo.', 'Talent saved.', 'Talento guardado.'],
    'app.talentNeedsName': ['O talento precisa de um nome.', 'The talent needs a name.', 'El talento necesita un nombre.'],
    'app.saveTalentError': ['Erro ao salvar o talento.', 'Error saving the talent.', 'Error al guardar el talento.'],
    'app.noTalentYet': ['Nenhuma pessoa no banco de talentos.', 'No one in the talent pool yet.', 'Nadie en el banco de talentos.'],
    'app.noTalentHint': ['Guarde aqui quem nao foi contratado agora mas serve para depois. Voce pode cadastrar direto ou trazer de um processo anterior.', 'Keep here whoever was not hired now but fits later. You can add directly or bring from a past process.', 'Guarde aqui a quien no fue contratado ahora pero sirve despues. Puede registrar directo o traer de un proceso anterior.'],
    'app.totalInPool': ['Total no banco', 'Total in pool', 'Total en el banco'],
    'app.peopleSaved': ['pessoas guardadas', 'people saved', 'personas guardadas'],
    'app.emptyPool': ['nenhuma ainda', 'none yet', 'ninguna aun'],
    'app.availableNow': ['Disponiveis agora', 'Available now', 'Disponibles ahora'],
    'app.ofTotal': ['do total', 'of total', 'del total'],
    'app.highMatch': ['Nota alta na triagem', 'High screening score', 'Nota alta en la criba'],
    'app.matchAtLeast': ['nota 80+ na triagem por IA', '80+ on the AI screening', 'nota 80+ en la criba por IA'],
    'app.needsOpenVacancy': ['cadastre uma vaga para comparar', 'add an opening to compare', 'registre una vacante para comparar'],
    'app.lastContact': ['Ultimo contato', 'Last contact', 'Ultimo contacto'],
    'app.mostRecent': ['o mais recente', 'the most recent', 'el mas reciente'],
    'app.filters': ['Filtros', 'Filters', 'Filtros'],
    'app.clearFilters': ['Limpar filtros', 'Clear filters', 'Limpiar filtros'],
    'app.anyOption': ['Todos', 'All', 'Todos'],
    'app.area': ['Area', 'Area', 'Area'],
    'app.seniority': ['Senioridade', 'Seniority', 'Senioridad'],
    'app.availability': ['Disponibilidade', 'Availability', 'Disponibilidad'],
    'app.tags': ['Tags', 'Tags', 'Etiquetas'],
    'app.tagsPh': ['Separadas por virgula', 'Comma separated', 'Separadas por coma'],
    'app.salaryRange': ['Faixa salarial (R$)', 'Salary range (R$)', 'Rango salarial (R$)'],
    'app.min': ['Minimo', 'Minimum', 'Minimo'],
    'app.max': ['Maximo', 'Maximum', 'Maximo'],
    'app.talentsFound': ['Talentos encontrados', 'Talents found', 'Talentos encontrados'],
    'app.name': ['Nome', 'Name', 'Nombre'],
    'app.role': ['Cargo', 'Role', 'Cargo'],
    'app.expectedSalary': ['Pretensao', 'Expected salary', 'Pretension'],
    'app.matchScore': ['Nota da triagem', 'Screening score', 'Nota de criba'],
    'app.matchNoData': ['Sem dados para comparar: preencha habilidades, área ou modalidade no perfil — a nota da triagem lê o currículo, esta conta lê a ficha.', 'Nothing to compare yet: fill in skills, area or work mode on the profile — the screening score reads the resume, this match reads the profile.', 'Sin datos para comparar: complete habilidades, área o modalidad en el perfil — la nota de criba lee el currículum, este cálculo lee la ficha.'],
    'app.showingRange': ['Mostrando {de} a {ate} de {total}', 'Showing {de} to {ate} of {total}', 'Mostrando {de} a {ate} de {total}'],
    'app.pickTalent': ['Escolha alguem na lista para ver o perfil e as vagas compativeis.', 'Pick someone in the list to see the profile and matching openings.', 'Elija a alguien de la lista para ver el perfil y las vacantes compatibles.'],
    'app.editProfile': ['Editar perfil', 'Edit profile', 'Editar perfil'],
    'app.logContact': ['Registrar contato', 'Log contact', 'Registrar contacto'],
    'app.contactLogged': ['Contato registrado hoje.', 'Contact logged today.', 'Contacto registrado hoy.'],
    'app.skills': ['Habilidades', 'Skills', 'Habilidades'],
    'app.skillsPh': ['E o que a compatibilidade compara com os requisitos da vaga.', 'This is what the match compares against the opening requirements.', 'Es lo que la compatibilidad compara con los requisitos de la vacante.'],
    'app.matchingVacancies': ['Vagas compativeis', 'Matching openings', 'Vacantes compatibles'],
    'app.noOpenVacancy': ['Nenhuma vaga aberta para comparar. Cadastre uma vaga e a compatibilidade aparece aqui.', 'No open opening to compare. Add one and the match shows up here.', 'Ninguna vacante abierta para comparar. Registre una y la compatibilidad aparece aqui.'],
    'app.inviteToVacancy': ['Convidar para esta vaga', 'Invite to this opening', 'Invitar a esta vacante'],
    'app.talentInvited': ['{nome} entrou em "{vaga}", na triagem.', '{nome} joined "{vaga}", at screening.', '{nome} entro en "{vaga}", en la criba.'],
    'app.talentAlreadyInvited': ['{nome} ja esta nesta vaga.', '{nome} is already in this opening.', '{nome} ya esta en esta vacante.'],
    'app.fromTalentPool': ['Banco de talentos', 'Talent pool', 'Banco de talentos'],
    'app.privateNote': ['Observacao', 'Note', 'Observacion'],
    'app.matchRequirements': ['{n} de {t} requisitos', '{n} of {t} requirements', '{n} de {t} requisitos'],
    'app.matchArea': ['Area', 'Area', 'Area'],
    'app.matchSalary': ['Pretensao dentro da faixa', 'Expected salary within range', 'Pretension dentro del rango'],
    'app.photo': ['Foto', 'Photo', 'Foto'],
    'app.addPhoto': ['Adicionar foto', 'Add photo', 'Agregar foto'],
    'app.removePhoto': ['Remover', 'Remove', 'Quitar'],
    'app.photoHint': ['Clique para escolher uma foto.', 'Click to choose a photo.', 'Haga clic para elegir una foto.'],
    'app.photoNeedsImage': ['Escolha um arquivo de imagem.', 'Choose an image file.', 'Elija un archivo de imagen.'],
    'app.photoUnreadable': ['Nao consegui ler essa imagem.', 'Could not read that image.', 'No pude leer esa imagen.'],
    'app.email': ['E-mail', 'Email', 'Correo'],
    'app.openVacancies': ['Vagas abertas', 'Open positions', 'Vacantes abiertas'],
    'app.receivingApplications': ['recebendo candidatura', 'accepting applications', 'recibiendo candidaturas'],
    'app.vacancies': ['Vagas', 'Job openings', 'Vacantes'],
    'app.vacanciesSub': ['A vaga guarda o que o processo precisa saber: prazo, requisitos, quantas posições e em que pé está.', 'The opening holds what the process needs: deadline, requirements, how many positions and where it stands.', 'La vacante guarda lo que el proceso necesita: plazo, requisitos, cuántas posiciones y en qué punto está.'],
    'app.newVacancy': ['Nova vaga', 'New opening', 'Nueva vacante'],
    'app.editVacancy': ['Editar vaga', 'Edit opening', 'Editar vacante'],
    'app.createVacancy': ['Criar vaga', 'Create opening', 'Crear vacante'],
    'app.deleteVacancy': ['Excluir vaga', 'Delete opening', 'Eliminar vacante'],
    'app.deleteVacancyAsk': ['A vaga "{nome}" será removida. Os candidatos não são apagados.', 'The opening "{nome}" will be removed. Candidates are not deleted.', 'La vacante "{nome}" será eliminada. Los candidatos no se borran.'],
    'app.deleteVacancyAskCandidates': ['A vaga "{nome}" será removida. Os {n} candidato(s) dela continuam no funil, com o nome da vaga guardado como texto.', 'The opening "{nome}" will be removed. Its {n} candidate(s) stay in the funnel, with the opening name kept as text.', 'La vacante "{nome}" será eliminada. Sus {n} candidato(s) siguen en el embudo, con el nombre de la vacante guardado como texto.'],
    'app.vacancySaved': ['Vaga salva.', 'Opening saved.', 'Vacante guardada.'],
    'app.noVacanciesYet': ['Nenhuma vaga cadastrada. Crie a primeira para organizar os candidatos por processo.', 'No openings yet. Create the first one to organise candidates by process.', 'Ninguna vacante creada. Cree la primera para organizar a los candidatos por proceso.'],
    'app.vacancyName': ['Nome da vaga', 'Opening name', 'Nombre de la vacante'],
    'app.vacancyNamePh': ['Ex.: Desenvolvedora Front-end Pleno', 'E.g. Mid-level Front-end Developer', 'Ej.: Desarrolladora Front-end Semi Senior'],
    'app.vacancyCandidateCount': ['{n} candidato(s) nesta vaga · faixa {faixa}', '{n} candidate(s) in this opening · range {faixa}', '{n} candidato(s) en esta vacante · rango {faixa}'],
    'app.department': ['Departamento', 'Department', 'Departamento'],
    'app.owner': ['Responsável', 'Owner', 'Responsable'],
    'app.priority': ['Prioridade', 'Priority', 'Prioridad'],
    'app.workMode': ['Modalidade', 'Work mode', 'Modalidad'],
    'app.contractType': ['Contratação', 'Contract', 'Contratación'],
    'app.stateUf': ['UF', 'State', 'Provincia'],
    'app.positions': ['Posições', 'Positions', 'Posiciones'],
    'app.salaryFrom': ['Salário de (R$)', 'Salary from (R$)', 'Salario desde (R$)'],
    'app.salaryTo': ['até (R$)', 'to (R$)', 'hasta (R$)'],
    'app.hideSalary': ['Não divulgar o salário', 'Do not disclose the salary', 'No divulgar el salario'],
    'app.salaryHidden': ['Salário não divulgado', 'Salary not disclosed', 'Salario no divulgado'],
    'app.openedOn': ['Aberta em', 'Opened on', 'Abierta el'],
    'app.requirements': ['Requisitos obrigatórios', 'Required', 'Requisitos obligatorios'],
    'app.requirementsPh': ['Um por linha. É o que a triagem por IA usa para comparar os currículos.', 'One per line. This is what the AI screening compares résumés against.', 'Uno por línea. Es lo que la selección por IA usa para comparar los currículos.'],
    'app.niceToHave': ['Desejáveis', 'Nice to have', 'Deseables'],
    'app.benefits': ['Benefícios', 'Benefits', 'Beneficios'],
    'app.candidateOne': ['candidato', 'candidate', 'candidato'],
    'app.candidateMany': ['candidatos', 'candidates', 'candidatos'],
    'app.deadlinePassed': ['prazo vencido', 'deadline passed', 'plazo vencido'],
    'app.daysLeft': ['{n} dia(s) para o prazo', '{n} day(s) to the deadline', '{n} día(s) para el plazo'],
    'app.vacancyNeedsTitle': [
      'A vaga precisa de um nome.', 'The job opening needs a name.',
      'La vacante necesita un nombre.',
    ],
    'app.saveVacancyError': [
      'Erro ao salvar a vaga: {message}', 'Error saving the job opening: {message}',
      'Error al guardar la vacante: {message}',
    ],
    'app.vacancyHasCandidates': [
      '{n} candidato(s) estão nesta vaga. Encerre-a em vez de excluir — assim o histórico deles fica de pé.',
      '{n} candidate(s) are in this opening. Close it instead of deleting — that keeps their history standing.',
      '{n} candidato(s) están en esta vacante. Ciérrela en vez de eliminarla — así el historial de ellos queda en pie.',
    ],

    /* Pagamento parcial: terceiro estado entre pendente e pago. */
    'app.statusPartial': ['Parcial', 'Partial', 'Parcial'],
    'app.partialMany': ['Parciais', 'Partial', 'Parciales'],
    'app.amountReceived': ['Já recebido (R$)', 'Already received (R$)', 'Ya recibido (R$)'],
    'app.receivedShort': ['recebido', 'received', 'recibido'],
    'app.toReceiveShort': ['a receber', 'to receive', 'por recibir'],
    'app.partialRemaining': [
      'Falta receber {valor}', 'Still to receive {valor}', 'Falta recibir {valor}',
    ],
    'app.partialNeedsTotal': [
      'Informe o valor total acima.', 'Enter the total amount above.',
      'Informe el valor total arriba.',
    ],
    'app.partialNeedsAmount': [
      'Sem valor recebido, será salvo como Pendente.',
      'With no amount received, it will be saved as Pending.',
      'Sin valor recibido, se guardará como Pendiente.',
    ],
    'app.partialBecomesPaid': [
      'Cobre o total — será salvo como Pago.',
      'Covers the full amount — it will be saved as Paid.',
      'Cubre el total — se guardará como Pagado.',
    ],
    'app.requestCancelled': ['Pedido cancelado.', 'Request cancelled.', 'Solicitud cancelada.'],

    /* Aviso de consentimento (LGPD). O texto diz o que a tag faz de fato —
       medir anúncio —, porque consentir sem saber para quê não é consentir. */
    'consent.region': ['Aviso de consentimento', 'Consent notice', 'Aviso de consentimiento'],
    'consent.title': ['Medição de anúncios', 'Ad measurement', 'Medición de anuncios'],
    'consent.text': [
      'Usamos uma tag do Google Ads para saber quais anúncios trazem gente ao MyDesk. Ela grava cookies de publicidade no seu navegador. Nada disso é necessário para usar o app, e recusar não muda nada no que você vê.',
      'We use a Google Ads tag to learn which ads bring people to MyDesk. It stores advertising cookies in your browser. None of it is required to use the app, and declining changes nothing in what you see.',
      'Usamos una etiqueta de Google Ads para saber qué anuncios traen gente a MyDesk. Guarda cookies publicitarias en su navegador. Nada de esto es necesario para usar la app, y rechazar no cambia nada de lo que usted ve.',
    ],
    'consent.accept': ['Aceitar', 'Accept', 'Aceptar'],
    'consent.reject': ['Recusar', 'Decline', 'Rechazar'],
    'consent.manage': ['Gerenciar consentimento', 'Manage consent', 'Gestionar consentimiento'],

    'landing.title': [
      'MyDesk — Notas, CRM financeiro e equipe no mesmo lugar',
      'MyDesk — Notes, financial CRM and teamwork in one place',
      'MyDesk — Notas, CRM financiero y equipo en un solo lugar',
    ],
    'landing.metaDescription': [
      'MyDesk é um workspace de notas com CRM financeiro, workspaces em grupo, chat e videochamada em tempo real. Grátis para começar, sem cartão de crédito.',
      'MyDesk is a notes workspace with financial CRM, group workspaces, chat and real-time video calls. Start free, no credit card required.',
      'MyDesk es un espacio de notas con CRM financiero, espacios grupales, chat y videollamadas en tiempo real. Empieza gratis, sin tarjeta.',
    ],
    'landing.ogLocale': ['pt_BR', 'en_US', 'es_ES'],
    'landing.ogDescription': [
      'Capture ideias, organize clientes e nunca mais perca um prazo. Grátis para começar, sem cartão de crédito.',
      'Capture ideas, organize clients, and never miss a deadline. Start free, no credit card required.',
      'Captura ideas, organiza clientes y no vuelvas a perder un plazo. Empieza gratis, sin tarjeta.',
    ],
    'landing.ogImageAlt': [
      'MyDesk — notas, CRM financeiro e equipe no mesmo lugar',
      'MyDesk — notes, financial CRM and teamwork in one place',
      'MyDesk — notas, CRM financiero y equipo en un solo lugar',
    ],
    'landing.heroAlt': [
      'MyDesk em uso: board de notas com fundo personalizado, barra de ferramentas e chats abertos',
      'MyDesk in use: notes board with a custom background, toolbar, and open chats',
      'MyDesk en uso: tablero de notas con fondo personalizado, barra de herramientas y chats abiertos',
    ],
    'landing.schemaDescription': [
      'Workspace de notas com CRM financeiro, workspaces em grupo, chat e videochamada em tempo real.',
      'Notes workspace with financial CRM, group workspaces, chat, and real-time video calls.',
      'Espacio de notas con CRM financiero, espacios grupales, chat y videollamadas en tiempo real.',
    ],
    'landing.resources': ['Recursos', 'Features', 'Funciones'],
    'landing.pricing': ['Preços', 'Pricing', 'Precios'],
    'landing.faq': ['Perguntas frequentes', 'Frequently asked questions', 'Preguntas frecuentes'],
    'landing.signIn': ['Entrar', 'Sign in', 'Entrar'],
    'landing.createFree': ['Criar conta grátis', 'Create a free account', 'Crear cuenta gratis'],
    'landing.eyebrow': ['Workspace corporativo', 'Business workspace', 'Espacio de trabajo empresarial'],
    'landing.heroLead': [
      'Capture ideias, organize clientes e nunca mais perca um prazo — um workspace completo pra você e sua equipe.',
      'Capture ideas, organize clients and never miss a deadline — one complete workspace for you and your team.',
      'Captura ideas, organiza clientes y no vuelvas a perder un plazo: un espacio completo para ti y tu equipo.',
    ],
    'landing.heroWhere': ['Onde', 'Where', 'Donde'],
    'landing.heroYourF': ['suas', 'your', 'tus'],
    'landing.heroNotes': ['notas', 'notes', 'notas'],
    'landing.heroAnd': ['e', 'and', 'y'],
    'landing.heroYourM': ['seu', 'your', 'tu'],
    'landing.heroTeam': ['time', 'team', 'equipo'],
    'landing.heroThink': ['pensam', 'think', 'piensan'],
    'landing.heroTogether': ['juntos.', 'together.', 'juntos.'],
    'landing.viewTour': ['▶ Ver o tour de 50s', '▶ Watch the 50s tour', '▶ Ver el tour de 50s'],
    'landing.trial': ['7 dias com tudo liberado', '7 days with everything unlocked', '7 días con todo desbloqueado'],
    'landing.noCard': ['sem cartão de crédito', 'no credit card', 'sin tarjeta de crédito'],
    'landing.readyMinute': ['pronto em menos de 1 minuto', 'ready in under a minute', 'listo en menos de un minuto'],
    'landing.viewAll': ['Ver todos os recursos', 'See all features', 'Ver todas las funciones'],
    'landing.receivedMonth': ['Recebido este mês', 'Received this month', 'Recibido este mes'],
    'landing.inProgress': ['em andamento', 'in progress', 'en curso'],
    'landing.planSprint': ['Planejar sprint', 'Plan sprint', 'Planificar sprint'],
    'landing.backlog': ['Backlog priorizado', 'Prioritized backlog', 'Backlog priorizado'],
    'landing.estimates': ['Estimativas do time', 'Team estimates', 'Estimaciones del equipo'],
    'landing.kickoff': ['Kickoff agendado', 'Kickoff scheduled', 'Kickoff programado'],
    'landing.live': ['AO VIVO', 'LIVE', 'EN VIVO'],
    'landing.teamWorkspace': ['Workspace do time', 'Team workspace', 'Espacio del equipo'],
    'landing.featuresHeading': ['Tudo que o MyDesk faz,', 'Everything MyDesk does,', 'Todo lo que hace MyDesk,'],
    'landing.onePlace': ['em um só lugar.', 'all in one place.', 'en un solo lugar.'],
    'landing.fourPillars': [
      'Quatro pilares, sem dez ferramentas diferentes.',
      'Four pillars, without ten different tools.',
      'Cuatro pilares, sin diez herramientas distintas.',
    ],
    'landing.smartNotes': ['Notas que se organizam sozinhas', 'Notes that organize themselves', 'Notas que se organizan solas'],
    'landing.collaborate': ['Colabore em tempo real', 'Collaborate in real time', 'Colabora en tiempo real'],
    'landing.crm': ['CRM financeiro embutido', 'Built-in financial CRM', 'CRM financiero integrado'],
    'landing.protected': ['Seu ambiente, protegido', 'Your workspace, protected', 'Tu espacio, protegido'],
    'landing.personalWorkspace': ['Workspace pessoal', 'Personal workspace', 'Espacio personal'],
    'landing.groupWorkspace': ['Workspace de grupo', 'Group workspace', 'Espacio grupal'],
    'landing.twoModes': ['Dois modos, um só board', 'Two modes, one board', 'Dos modos, un solo tablero'],
    'landing.soloTeam': ['Sozinho ou em equipe.', 'Solo or with a team.', 'Solo o en equipo.'],
    'landing.youChoose': ['Você escolhe.', 'You choose.', 'Tú eliges.'],
    'landing.howWorks': ['Como funciona', 'How it works', 'Cómo funciona'],
    'landing.createAccount': ['Crie sua conta', 'Create your account', 'Crea tu cuenta'],
    'landing.addNotes': ['Adicione suas notas', 'Add your notes', 'Añade tus notas'],
    'landing.inviteTeam': ['Convide sua equipe', 'Invite your team', 'Invita a tu equipo'],
    'landing.integrations': ['Integrações', 'Integrations', 'Integraciones'],
    'landing.plans': ['Planos', 'Plans', 'Planes'],
    'landing.free': ['Grátis', 'Free', 'Gratis'],
    'landing.forever': ['para sempre', 'forever', 'para siempre'],
    'landing.startFree': ['Começar grátis', 'Start free', 'Empezar gratis'],
    'landing.mostPopular': ['Mais popular', 'Most popular', 'Más popular'],
    'landing.monthlyPremium': ['Premium mensal', 'Monthly Premium', 'Premium mensual'],
    'landing.perMonth': ['por mês · renovação automática', 'per month · automatic renewal', 'al mes · renovación automática'],
    'landing.subscribePremium': ['Assinar Premium', 'Subscribe to Premium', 'Suscribirse a Premium'],
    'landing.bestValue': ['Melhor valor', 'Best value', 'Mejor valor'],
    'landing.annualPremium': ['Premium anual', 'Annual Premium', 'Premium anual'],
    'landing.subscribeAnnual': ['Assinar plano anual', 'Subscribe annually', 'Suscribirse al plan anual'],
    'landing.notNow': ['Ainda não é a hora?', 'Not ready yet?', '¿Aún no es el momento?'],
    'landing.newsletter': ['Quero receber', 'Keep me updated', 'Quiero recibir novedades'],
    'landing.startNow': ['Comece agora', 'Start now', 'Empieza ahora'],
    'landing.startFreeHeading': ['Comece grátis.', 'Start for free.', 'Empieza gratis.'],
    'landing.growAnytime': ['Evolua quando quiser.', 'Upgrade whenever you want.', 'Mejora cuando quieras.'],
    'landing.createMine': ['Criar minha conta grátis', 'Create my free account', 'Crear mi cuenta gratis'],
    'landing.product': ['Produto', 'Product', 'Producto'],
    'landing.account': ['Conta', 'Account', 'Cuenta'],
    'landing.legalSupport': ['Legal & Suporte', 'Legal & Support', 'Legal y soporte'],
    'landing.talk': ['Falar com a gente', 'Talk to us', 'Hablar con nosotros'],
    'landing.madeFor': ['Feito com 💜 para equipes e freelancers.', 'Made with 💜 for teams and freelancers.', 'Hecho con 💜 para equipos y freelancers.'],
    'landing.tourTitle': ['Tour do MyDesk · 50s', 'MyDesk tour · 50s', 'Tour de MyDesk · 50s'],
    'landing.soundOn': ['Ativar som', 'Turn sound on', 'Activar sonido'],
    'landing.soundOff': ['Desativar som', 'Turn sound off', 'Desactivar sonido'],
    'landing.expand': ['Ampliar', 'Expand', 'Ampliar'],
    'landing.reduce': ['Reduzir', 'Reduce', 'Reducir'],
    'landing.supportQuestion': [
      'Olá! Tenho uma dúvida sobre o MyDesk.',
      'Hi! I have a question about MyDesk.',
      '¡Hola! Tengo una pregunta sobre MyDesk.',
    ],
    'landing.supportSubject': ['Dúvida sobre o MyDesk', 'Question about MyDesk', 'Consulta sobre MyDesk'],
    'landing.whatsapp': ['Falar no WhatsApp', 'Talk on WhatsApp', 'Hablar por WhatsApp'],
    'landing.email': ['Falar por e-mail', 'Talk by email', 'Hablar por correo'],
    'landing.badEmail': ['Confira o e-mail digitado.', 'Check the email address.', 'Revisa el correo ingresado.'],
    'landing.newsOk': ['Pronto! Você entrou na lista. 💜', 'Done! You are on the list. 💜', '¡Listo! Ya estás en la lista. 💜'],
    'landing.newsError': [
      'Não deu certo agora. Tente de novo em instantes.',
      'That did not work. Try again in a moment.',
      'No funcionó. Inténtalo de nuevo en unos instantes.',
    ],
    'landing.heroMeta': [
      '· sem cartão de crédito · pronto em menos de 1 minuto',
      '· no credit card · ready in under a minute',
      '· sin tarjeta · listo en menos de un minuto',
    ],
    'landing.workspaceInvite': [
      'Cria um workspace comigo?',
      'Want to create a workspace with me?',
      '¿Creamos un espacio de trabajo juntos?',
    ],
    'landing.workspaceInviteReply': [
      'Claro! Mandei o convite 🎉',
      'Sure! I sent the invite 🎉',
      '¡Claro! Te envié la invitación 🎉',
    ],
    'landing.workspaceInviteReplyShort': [
      'Claro! Manda o convite 🎉',
      'Sure! Send the invite 🎉',
      '¡Claro! Envía la invitación 🎉',
    ],
    'landing.workspaceJoined': [
      'Entrei! Já tô vendo tudo ✨',
      'I joined! I can see everything now ✨',
      '¡Ya entré! Ahora puedo verlo todo ✨',
    ],
    'landing.noteMoved': ['moveu uma nota →', 'moved a note →', 'movió una nota →'],
    'landing.noteCreated': ['criou “Sprint 12” ✨', 'created “Sprint 12” ✨', 'creó «Sprint 12» ✨'],
    'landing.commented': ['comentou 💬', 'commented 💬', 'comentó 💬'],
    'landing.notesDescription': [
      'Cada nota é um card livre: arraste, redimensione e escolha entre 19 paletas de cor. Empilhe notas relacionadas arrastando uma sobre a outra, defina prazos com lembretes automáticos e, quando o board bagunçar, um botão realinha tudo em grid.',
      'Each note is a free-form card: drag it, resize it, and choose from 19 color palettes. Stack related notes, set deadlines with automatic reminders, and realign the board into a grid with one click.',
      'Cada nota es una tarjeta libre: arrástrala, cambia su tamaño y elige entre 19 paletas. Apila notas relacionadas, define plazos con recordatorios automáticos y vuelve a alinear el tablero con un clic.',
    ],
    'landing.dashboardRedesign': ['Redesign do dashboard', 'Dashboard redesign', 'Rediseño del panel'],
    'landing.deadlineJul15': ['Prazo: 15/07', 'Due: 07/15', 'Plazo: 15/07'],
    'landing.completed': ['Concluído', 'Completed', 'Completado'],
    'landing.clientMeeting': ['Reunião com cliente', 'Client meeting', 'Reunión con cliente'],
    'landing.deadlineJul18': ['Prazo: 18/07', 'Due: 07/18', 'Plazo: 18/07'],
    'landing.smartStacks': ['Pilhas inteligentes', 'Smart stacks', 'Pilas inteligentes'],
    'landing.oneClickOrganize': ['Reorganizar com 1 clique', 'Reorganize in one click', 'Reorganizar con un clic'],
    'landing.attachedFiles': ['Arquivos anexados', 'Attached files', 'Archivos adjuntos'],
    'landing.collaborationDescription': [
      'Adicione qualquer pessoa pelo @usuário e converse por chat com texto, imagem e arquivos — mensagens chegam mesmo se ela estava offline. Quando precisar, inicie uma videochamada 1:1 ou em grupo, com tela compartilhada.',
      'Add anyone by @username and chat with text, images, and files—even when they were offline. Start a 1:1 or group video call with screen sharing whenever you need it.',
      'Añade a cualquier persona por @usuario y conversa con texto, imágenes y archivos, incluso si estaba desconectada. Inicia una videollamada individual o grupal con pantalla compartida cuando la necesites.',
    ],
    'landing.chatFloating': ['Chat flutuante', 'Floating chat', 'Chat flotante'],
    'landing.videoScreen': ['Vídeo + tela compartilhada', 'Video + screen sharing', 'Video + pantalla compartida'],
    'landing.crmDescription': [
      'Cadastre clientes e acompanhe recebíveis num painel só: total esperado, recebido, pendente e atrasado, com gráficos que atualizam sozinhos. Sem precisar de uma planilha ou ferramenta separada.',
      'Register clients and track receivables in one dashboard: expected, received, pending, and overdue totals, with charts that update automatically. No separate spreadsheet or tool required.',
      'Registra clientes y controla los cobros en un solo panel: total esperado, recibido, pendiente y atrasado, con gráficos que se actualizan solos. Sin hojas de cálculo ni herramientas aparte.',
    ],
    'landing.premiumPlan': ['Plano Premium.', 'Premium plan.', 'Plan Premium.'],
    'landing.expected': ['Esperado', 'Expected', 'Esperado'],
    'landing.received': ['Recebido', 'Received', 'Recibido'],
    'landing.liveDashboard': ['Dashboard ao vivo', 'Live dashboard', 'Panel en vivo'],
    'landing.clientSearch': ['Busca de clientes', 'Client search', 'Búsqueda de clientes'],
    'landing.securityDescription': [
      'Personalize o fundo do seu board com cores, gradientes ou vídeo em loop, e sincronize prazos com Google Agenda, Outlook ou um arquivo .ics. Por trás, cada conta tem seus dados isolados no Firebase, com upload de arquivos validado por tipo.',
      'Customize your board with colors, gradients, or looping video, and sync deadlines with Google Calendar, Outlook, or an .ics file. Each account has isolated Firebase data and file uploads validated by type.',
      'Personaliza el fondo con colores, degradados o video en bucle y sincroniza plazos con Google Calendar, Outlook o un archivo .ics. Cada cuenta mantiene sus datos aislados en Firebase y valida los archivos por tipo.',
    ],
    'landing.firebaseAuth': ['Autenticação Firebase', 'Firebase authentication', 'Autenticación con Firebase'],
    'landing.customBackground': ['Fundo personalizado', 'Custom background', 'Fondo personalizado'],
    'landing.calendarIntegration': ['Integração de calendário', 'Calendar integration', 'Integración de calendario'],
    'landing.sameBoard': [
      'O mesmo board por trás — só muda quem enxerga.',
      'The same board underneath—only who can see it changes.',
      'El mismo tablero por dentro; solo cambia quién lo ve.',
    ],
    'landing.privateBoardsDescription': [
      'Múltiplos boards privados por padrão. Ninguém vê, a não ser que você compartilhe.',
      'Multiple private boards by default. Nobody sees them unless you share.',
      'Varios tableros privados de forma predeterminada. Nadie los ve a menos que los compartas.',
    ],
    'landing.privateNotes': ['Notas privadas por padrão', 'Private notes by default', 'Notas privadas por defecto'],
    'landing.accountBackgrounds': ['Fundo e cores por conta', 'Background and colors per account', 'Fondo y colores por cuenta'],
    'landing.personalCrm': ['CRM financeiro pessoal', 'Personal financial CRM', 'CRM financiero personal'],
    'landing.groupDescription': [
      'Convide por @usuário. Todo mundo vê exatamente o mesmo board, ao vivo.',
      'Invite by @username. Everyone sees exactly the same board, live.',
      'Invita por @usuario. Todos ven exactamente el mismo tablero en vivo.',
    ],
    'landing.realtimeSync': ['Sincronização em tempo real', 'Real-time sync', 'Sincronización en tiempo real'],
    'landing.embeddedChat': ['Chat embutido no workspace', 'Workspace chat', 'Chat integrado en el espacio'],
    'landing.groupCrm': ['CRM de grupo (Premium)', 'Group CRM (Premium)', 'CRM grupal (Premium)'],
    'landing.zeroToOrganized': ['Do zero ao organizado', 'From zero to organized', 'De cero a organizado'],
    'landing.fourSteps': ['em quatro passos.', 'in four steps.', 'en cuatro pasos.'],
    'landing.noLearningCurve': [
      'Sem curva de aprendizado — comece a usar em minutos.',
      'No learning curve—start using it in minutes.',
      'Sin curva de aprendizaje: empieza a usarlo en minutos.',
    ],
    'landing.createNote': ['Crie uma nota', 'Create a note', 'Crea una nota'],
    'landing.noteIngredients': [
      'Título, descrição e uma cor entre 19 paletas.',
      'A title, description, and one of 19 color palettes.',
      'Título, descripción y uno de 19 colores.',
    ],
    'landing.setDeadlines': ['Defina prazos', 'Set deadlines', 'Define plazos'],
    'landing.deadlineDescription': [
      'Datas de início e vencimento com lembretes.',
      'Start and due dates with reminders.',
      'Fechas de inicio y vencimiento con recordatorios.',
    ],
    'landing.trackStatus': ['Acompanhe o status', 'Track progress', 'Sigue el estado'],
    'landing.statusDescription': [
      'Um clique muda entre A fazer, Andamento, Concluído.',
      'One click switches between To do, In progress, and Completed.',
      'Un clic cambia entre Por hacer, En curso y Completado.',
    ],
    'landing.reorganize': ['Reorganize', 'Reorganize', 'Reorganiza'],
    'landing.reorganizeDescription': [
      'Um botão alinha tudo em grid, sem sobreposição.',
      'One button aligns everything to a grid with no overlap.',
      'Un botón alinea todo en una cuadrícula, sin superposición.',
    ],
    'landing.integrateHeading': ['Não substitua. Integre.', 'Do not replace. Integrate.', 'No reemplaces. Integra.'],
    'landing.integrateDescription': [
      'O MyDesk se conecta ao que você já usa no dia a dia.',
      'MyDesk connects to the tools you already use every day.',
      'MyDesk se conecta con las herramientas que ya usas cada día.',
    ],
    'landing.faqHeading': ['Dúvidas frequentes', 'Frequently asked questions', 'Preguntas frecuentes'],
    'landing.questions': ['Perguntas', 'Questions', 'Preguntas'],
    'landing.answers': ['& Respostas.', '& Answers.', 'y respuestas.'],
    'landing.faqSavedQuestion': [
      'Meus dados ficam salvos se eu fechar o navegador?',
      'Are my data saved if I close the browser?',
      '¿Mis datos se guardan si cierro el navegador?',
    ],
    'landing.faqSavedAnswer': [
      'Sim. As notas são salvas na nuvem em tempo real. Ao voltar, tudo estará como você deixou, em qualquer dispositivo.',
      'Yes. Notes are saved to the cloud in real time. When you return, everything will be as you left it on any device.',
      'Sí. Las notas se guardan en la nube en tiempo real. Cuando vuelvas, todo estará como lo dejaste en cualquier dispositivo.',
    ],
    'landing.faqDevicesQuestion': [
      'Posso usar em vários dispositivos ao mesmo tempo?',
      'Can I use it on multiple devices at the same time?',
      '¿Puedo usarlo en varios dispositivos a la vez?',
    ],
    'landing.faqDevicesAnswer': [
      'Sim. Faça login com a mesma conta em qualquer navegador. As notas sincronizam automaticamente.',
      'Yes. Sign in with the same account in any browser. Notes sync automatically.',
      'Sí. Inicia sesión con la misma cuenta en cualquier navegador. Las notas se sincronizan automáticamente.',
    ],
    'landing.faqWorkspaceQuestion': [
      'Como funcionam os workspaces compartilhados?',
      'How do shared workspaces work?',
      '¿Cómo funcionan los espacios compartidos?',
    ],
    'landing.faqWorkspaceAnswer': [
      'Você pode criar um workspace 1:1 com um amigo ou um workspace de grupo. As notas sincronizam em tempo real para todos.',
      'You can create a 1:1 workspace with a friend or a group workspace. Notes sync for everyone in real time.',
      'Puedes crear un espacio individual con un amigo o uno grupal. Las notas se sincronizan para todos en tiempo real.',
    ],
    'landing.faqFilesQuestion': [
      'É possível anexar arquivos nas notas?',
      'Can I attach files to notes?',
      '¿Puedo adjuntar archivos a las notas?',
    ],
    'landing.faqFilesAnswer': [
      'Sim. Cada nota aceita imagens, PDFs e outros arquivos até 5MB, com visualizador embutido.',
      'Yes. Each note accepts images, PDFs, and other files up to 5 MB, with a built-in viewer.',
      'Sí. Cada nota admite imágenes, PDF y otros archivos de hasta 5 MB, con visor integrado.',
    ],
    'landing.faqOfflineQuestion': ['O MyDesk funciona offline?', 'Does MyDesk work offline?', '¿MyDesk funciona sin conexión?'],
    'landing.faqOfflineAnswer': [
      'Parcialmente. O board carrega normalmente, mas sincronização, chat e chamadas precisam de internet.',
      'Partially. The board loads normally, but syncing, chat, and calls require an internet connection.',
      'Parcialmente. El tablero carga con normalidad, pero la sincronización, el chat y las llamadas requieren internet.',
    ],
    'landing.faqRenewalQuestion': [
      'Como funciona a renovação e o cancelamento?',
      'How do renewal and cancellation work?',
      '¿Cómo funcionan la renovación y la cancelación?',
    ],
    'landing.faqRenewalAnswer': [
      'O Premium é uma assinatura recorrente mensal ou anual processada pela Stripe. A renovação acontece automaticamente no fim de cada período. Você pode atualizar a forma de pagamento, consultar cobranças ou cancelar a renovação a qualquer momento pelo Portal do Cliente.',
      'Premium is a recurring monthly or annual subscription processed by Stripe. It renews automatically at the end of each period. You can update your payment method, view charges, or cancel renewal at any time through the Customer Portal.',
      'Premium es una suscripción mensual o anual recurrente procesada por Stripe. Se renueva automáticamente al final de cada período. Puedes actualizar el método de pago, consultar cobros o cancelar la renovación en cualquier momento desde el Portal del Cliente.',
    ],
    'landing.faqDowngradeQuestion': [
      'O que acontece com minhas notas se eu parar de pagar?',
      'What happens to my notes if I stop paying?',
      '¿Qué pasa con mis notas si dejo de pagar?',
    ],
    'landing.faqDowngradeAnswer': [
      'Nada é apagado. Você continua vendo e editando tudo que já criou — o que volta a valer são os limites do plano gratuito para criar coisas novas e os recursos exclusivos do Premium ficam indisponíveis até um novo pagamento.',
      'Nothing is deleted. You can keep viewing and editing everything you created. Free-plan limits apply to new content, and Premium-only features remain unavailable until you subscribe again.',
      'No se elimina nada. Puedes seguir viendo y editando todo lo creado. Los límites del plan gratuito vuelven a aplicarse al contenido nuevo y las funciones Premium quedan desactivadas hasta una nueva suscripción.',
    ],
    'landing.faqRefundQuestion': [
      'E se eu me arrepender depois de pagar?',
      'What if I change my mind after paying?',
      '¿Y si cambio de opinión después de pagar?',
    ],
    'landing.faqRefundAnswer': [
      'Você tem 7 dias para desistir e receber o valor de volta integralmente, como manda o Código de Defesa do Consumidor. É só mandar um e-mail com o endereço da sua conta.',
      'You have 7 days to request a full refund under Brazilian consumer law. Just email us from the address linked to your account.',
      'Tienes 7 días para solicitar un reembolso completo conforme a la legislación brasileña de consumo. Solo envíanos un correo desde la dirección de tu cuenta.',
    ],
    'landing.faqPrivacyQuestion': ['Quem consegue ver minhas notas?', 'Who can see my notes?', '¿Quién puede ver mis notas?'],
    'landing.faqPrivacyAnswerLead': [
      'Só você e as pessoas com quem você compartilhou um workspace. As regras do banco de dados restringem cada conta aos seus próprios dados, o tráfego é criptografado e seu conteúdo não é usado para treinar modelos nem vendido a terceiros. Detalhes na',
      'Only you and the people you share a workspace with. Database rules restrict each account to its own data, traffic is encrypted, and your content is not used to train models or sold to third parties. Details in the',
      'Solo tú y las personas con quienes compartes un espacio. Las reglas de la base de datos aíslan los datos de cada cuenta, el tráfico está cifrado y tu contenido no se usa para entrenar modelos ni se vende a terceros. Detalles en la',
    ],
    'landing.faqTrialQuestion': [
      'Como funcionam os 7 dias de teste?',
      'How does the 7-day trial work?',
      '¿Cómo funciona la prueba de 7 días?',
    ],
    'landing.faqTrialAnswer': [
      'Toda conta nova nasce com 7 dias de acesso completo: notas ilimitadas, CRM Financeiro e workspaces de grupo, sem pedir cartão. Terminado o prazo, esses recursos voltam a ser exclusivos do Premium e a criação de notas volta ao limite do plano gratuito — nada do que você criou é apagado.',
      'Every new account starts with 7 days of full access: unlimited notes, Financial CRM, and group workspaces, with no card required. After that, those features become Premium-only and new notes follow the free-plan limit—nothing you created is deleted.',
      'Cada cuenta nueva empieza con 7 días de acceso completo: notas ilimitadas, CRM financiero y espacios grupales, sin tarjeta. Al finalizar, esas funciones vuelven a ser exclusivas de Premium y las notas nuevas respetan el límite gratuito; nada de lo creado se elimina.',
    ],
    'landing.faqCardQuestion': [
      'Preciso de cartão de crédito para começar?',
      'Do I need a credit card to get started?',
      '¿Necesito una tarjeta para empezar?',
    ],
    'landing.faqCardAnswer': [
      'Não. O plano gratuito e os 7 dias iniciais não pedem cartão. Os dados de pagamento do Premium são coletados e armazenados diretamente pela Stripe; o MyDesk não recebe o número completo do cartão.',
      'No. The free plan and the first 7 days require no card. Premium payment details are collected and stored directly by Stripe; MyDesk never receives the full card number.',
      'No. El plan gratuito y los primeros 7 días no requieren tarjeta. Stripe recopila y almacena directamente los datos de pago de Premium; MyDesk nunca recibe el número completo.',
    ],
    'landing.simple': ['Simples e', 'Simple and', 'Simple y'],
    'landing.transparent': ['transparente.', 'transparent.', 'transparente.'],
    'landing.newAccountStarts': ['Toda conta nova começa com', 'Every new account starts with', 'Cada cuenta nueva empieza con'],
    'landing.fullAccessSeven': ['7 dias de acesso completo', '7 days of full access', '7 días de acceso completo'],
    'landing.afterTrial': [
      ', sem pedir cartão. Depois disso você escolhe: seguir no plano gratuito ou assinar.',
      ', with no card required. After that, choose the free plan or subscribe.',
      ', sin tarjeta. Después, elige seguir en el plan gratuito o suscribirte.',
    ],
    'landing.freePlan': ['Gratuito', 'Free', 'Gratuito'],
    'landing.freePriceSub': [
      'para sempre · com 7 dias de tudo liberado no começo',
      'forever · with everything unlocked for the first 7 days',
      'para siempre · con todo desbloqueado durante los primeros 7 días',
    ],
    'landing.notesPerMonth': ['15 notas por mês', '15 notes per month', '15 notas al mes'],
    'landing.personalWorkspaces': ['Workspaces pessoais', 'Personal workspaces', 'Espacios personales'],
    'landing.chatTwo': ['Chat e chamada de vídeo (até 2)', 'Chat and video calls (up to 2)', 'Chat y videollamadas (hasta 2)'],
    'landing.noteColors': ['19 cores de notas', '19 note colors', '19 colores para notas'],
    'landing.filesFree': ['Anexos de 5 MB · 50 MB no total', '5 MB attachments · 50 MB total', 'Adjuntos de 5 MB · 50 MB en total'],
    'landing.calendarAgenda': ['Calendário e agenda pessoal', 'Personal calendar and schedule', 'Calendario y agenda personal'],
    'landing.docViewer': ['Leitura de .docx e PDF nos anexos', '.docx and PDF attachment viewer', 'Visor de .docx y PDF adjuntos'],
    'landing.financialCrm': ['CRM Financeiro', 'Financial CRM', 'CRM financiero'],
    'landing.groupWorkspaces': ['Workspaces de grupo', 'Group workspaces', 'Espacios grupales'],
    'landing.signedReceipt': ['Recibo em PDF assinado', 'Signed PDF receipt', 'Recibo PDF firmado'],
    'landing.financialReport': ['Relatório financeiro em PDF', 'Financial report in PDF', 'Informe financiero en PDF'],
    'landing.aiSummary': ['Resumo de documento por IA', 'AI document summary', 'Resumen de documentos con IA'],
    'landing.animatedBackgrounds': ['Fundos em vídeo e animados', 'Video and animated backgrounds', 'Fondos de video y animados'],
    'landing.prioritySupport': ['Suporte prioritário', 'Priority support', 'Soporte prioritario'],
    'landing.unlimitedNotes': ['Notas ilimitadas', 'Unlimited notes', 'Notas ilimitadas'],
    'landing.unlimitedPersonal': ['Workspaces pessoais ilimitados', 'Unlimited personal workspaces', 'Espacios personales ilimitados'],
    'landing.videoSix': ['Chamada de vídeo com até 6', 'Video calls with up to 6', 'Videollamadas de hasta 6'],
    'landing.nineteenColors': ['19 cores', '19 colors', '19 colores'],
    'landing.gradients': ['+ gradientes', '+ gradients', '+ degradados'],
    /* 7 MB, e não 25: o banco recusa string acima de 10 MB, e o anexo é
       gravado em base64, que é ~4/3 do arquivo. 25 MB nunca foi gravável —
       anunciá-lo era vender o que não se entrega. */
    'landing.filesPremium': ['Anexos de 5 MB · 1 GB no total', '5 MB attachments · 1 GB total', 'Adjuntos de 5 MB · 1 GB en total'],
    'landing.fullCrm': ['CRM Financeiro completo', 'Full Financial CRM', 'CRM financiero completo'],
    'landing.customSignedReceipt': ['Recibo em PDF com sua assinatura', 'PDF receipt with your signature', 'Recibo PDF con tu firma'],
    'landing.videoBackgrounds': ['Fundos em vídeo', 'Video backgrounds', 'Fondos de video'],
    'landing.fiveScenes': ['e 5 cenas animadas', 'and 5 animated scenes', 'y 5 escenas animadas'],
    'landing.annualSub': [
      'por ano · renovação automática · equivale a R$ 16,67/mês',
      'per year · automatic renewal · equivalent to R$ 16.67/month',
      'al año · renovación automática · equivale a R$ 16,67/mes',
    ],
    'landing.monthlyIncluded': ['Tudo do Premium mensal', 'Everything in Monthly Premium', 'Todo lo de Premium mensual'],
    'landing.saveAnnual': ['Economize R$ 40 no ano', 'Save R$ 40 per year', 'Ahorra R$ 40 al año'],
    /* O PT precisa ser igual ao texto que está na página: a tradução casa pelo
       texto de origem, não pelo nome da chave. Estava "São 2 meses de graça",
       que não existe em lugar nenhum do HTML — o item ficava em português nas
       outras duas línguas, sem erro nenhum aparecer. */
    'landing.twoMonthsFree': ['Equivale a 2 meses de graça', 'Equivalent to 2 months free', 'Equivale a 2 meses gratis'],
    'landing.oneCharge': ['Uma cobrança por ano, não doze', 'One charge per year, not twelve', 'Un cobro al año, no doce'],
    'landing.annualRenewal': ['Renovação anual automática', 'Automatic annual renewal', 'Renovación anual automática'],
    'landing.billingLead': [
      'R$ 19,99 por mês ou R$ 199,99 por ano. Assinatura recorrente processada pela Stripe,',
      'R$ 19.99 per month or R$ 199.99 per year. Recurring subscription processed by Stripe,',
      'R$ 19,99 al mes o R$ 199,99 al año. Suscripción recurrente procesada por Stripe,',
    ],
    'landing.billingPortal': [
      'com gerenciamento e cancelamento pelo Portal do Cliente.',
      'managed and canceled through the Customer Portal.',
      'con gestión y cancelación desde el Portal del Cliente.',
    ],
    'landing.noCommitment': [
      'Sem fidelidade · cancele quando quiser · 7 dias para desistir e receber o valor de volta',
      'No commitment · cancel anytime · 7-day refund window',
      'Sin permanencia · cancela cuando quieras · 7 días para solicitar un reembolso',
    ],
    'landing.newsletterLead': [
      'Deixe seu e-mail e a gente avisa quando sair novidade no MyDesk. Sem spam, sem repasse a',
      'Leave your email and we will tell you about MyDesk updates. No spam and no sharing with',
      'Déjanos tu correo y te avisaremos sobre las novedades de MyDesk. Sin spam ni cesión a',
    ],
    'landing.newsletterTail': [
      'terceiros, e você sai da lista quando quiser.',
      'third parties, and you can unsubscribe anytime.',
      'terceros; puedes darte de baja cuando quieras.',
    ],
    'landing.secureCloud': [
      'Nenhum cartão de crédito necessário. Seus dados ficam sincronizados com segurança na nuvem.',
      'No credit card required. Your data stays securely synced in the cloud.',
      'No necesitas tarjeta. Tus datos se sincronizan de forma segura en la nube.',
    ],
    'landing.checkFreeForever': ['✓ Plano gratuito para sempre', '✓ Free plan forever', '✓ Plan gratuito para siempre'],
    'landing.checkNoCard': ['✓ Sem cartão de crédito', '✓ No credit card', '✓ Sin tarjeta'],
    'landing.checkNoRecurring': ['✓ Sem cobrança recorrente', '✓ No recurring charge', '✓ Sin cobro recurrente'],
    'landing.checkAnyDevice': ['✓ Funciona em qualquer dispositivo', '✓ Works on any device', '✓ Funciona en cualquier dispositivo'],
    'landing.checkRefund': ['✓ 7 dias para desistir', '✓ 7-day refund window', '✓ 7 días para desistir'],
    'landing.footerDescription': [
      'Workspace de notas, CRM financeiro e colaboração em tempo real — tudo em um único lugar.',
      'Notes, financial CRM, and real-time collaboration—all in one place.',
      'Notas, CRM financiero y colaboración en tiempo real, todo en un solo lugar.',
    ],
    'landing.privacyShort': ['Privacidade', 'Privacy', 'Privacidad'],
    'landing.termsShort': ['Termos', 'Terms', 'Términos'],

    'auth.title': ['MyDesk — Entrar', 'MyDesk — Sign in', 'MyDesk — Entrar'],
    'auth.create': ['Criar conta', 'Create account', 'Crear cuenta'],
    'auth.welcomeBack': ['Bem-vindo de volta', 'Welcome back', 'Te damos la bienvenida'],
    'auth.signIn': ['Entrar', 'Sign in', 'Entrar'],
    'auth.firstName': ['Nome', 'First name', 'Nombre'],
    'auth.lastName': ['Sobrenome', 'Last name', 'Apellido'],
    'auth.usernamePlaceholder': ['usuário (é como te encontram)', 'username (how people find you)', 'usuario (así te encuentran)'],
    'auth.usernameHint': ['3–20 caracteres · letras, números e _', '3–20 characters · letters, numbers and _', '3–20 caracteres · letras, números y _'],
    'auth.emailPlaceholder': ['Seu e-mail', 'Your email', 'Tu correo'],
    'auth.passwordPlaceholder': ['Sua senha', 'Your password', 'Tu contraseña'],
    'auth.showPassword': ['Mostrar senha', 'Show password', 'Mostrar contraseña'],
    'auth.hidePassword': ['Ocultar senha', 'Hide password', 'Ocultar contraseña'],
    'auth.forgot': ['Esqueci minha senha', 'I forgot my password', 'Olvidé mi contraseña'],
    'auth.orContinue': ['OU ENTRE COM', 'OR CONTINUE WITH', 'O CONTINÚA CON'],
    'auth.google': ['Continuar com Google', 'Continue with Google', 'Continuar con Google'],
    'auth.facebook': ['Continuar com Facebook', 'Continue with Facebook', 'Continuar con Facebook'],
    'auth.agreementLead': ['Ao criar uma conta, você concorda com os', 'By creating an account, you agree to the', 'Al crear una cuenta, aceptas los'],
    'auth.agreementAnd': ['e a', 'and the', 'y la'],
    'auth.chooseUsername': ['Escolha seu @', 'Choose your @', 'Elige tu @'],
    'auth.chooseUsernameDesc': [
      'É o nome pelo qual seus amigos vão te encontrar e convidar. Você não poderá enviar/receber convites sem ele.',
      'This is how friends will find and invite you. You cannot send or receive invitations without it.',
      'Es el nombre con el que tus amigos te encontrarán e invitarán. Sin él no podrás enviar ni recibir invitaciones.',
    ],
    'auth.minUsername': ['mín. 3 caracteres', 'min. 3 characters', 'mín. 3 caracteres'],
    'auth.checking': ['checando…', 'checking…', 'comprobando…'],
    'auth.available': ['disponível', 'available', 'disponible'],
    'auth.taken': ['já em uso', 'already taken', 'ya está en uso'],
    'auth.confirming': ['Confirmando…', 'Confirming…', 'Confirmando…'],
    'auth.creating': ['Criando…', 'Creating…', 'Creando…'],
    'auth.signingIn': ['Entrando…', 'Signing in…', 'Entrando…'],
    'auth.errName': ['Informe seu nome.', 'Enter your name.', 'Ingresa tu nombre.'],
    'auth.errEmail': ['Informe um e-mail válido.', 'Enter a valid email.', 'Ingresa un correo válido.'],
    'auth.errUsername': [
      'Escolha um @ com 3–20 caracteres (letras, números e _).',
      'Choose an @ with 3–20 characters (letters, numbers and _).',
      'Elige un @ de 3–20 caracteres (letras, números y _).',
    ],
    'auth.errPasswordLength': [
      'A senha precisa ter pelo menos 8 caracteres.',
      'Your password must be at least 8 characters.',
      'La contraseña debe tener al menos 8 caracteres.',
    ],
    'auth.errAccountExists': ['Já existe uma conta com este e-mail.', 'An account already exists with this email.', 'Ya existe una cuenta con este correo.'],
    'auth.errUsernameTaken': ['Esse @ já está em uso. Escolha outro.', 'That @ is already taken. Choose another.', 'Ese @ ya está en uso. Elige otro.'],
    'auth.errUsernameRace': [
      'Esse @ acabou de ser tomado. Escolha outro e tente de novo.',
      'That @ was just taken. Choose another and try again.',
      'Ese @ acaba de ser ocupado. Elige otro e inténtalo de nuevo.',
    ],
    'auth.errPassword': ['Informe sua senha.', 'Enter your password.', 'Ingresa tu contraseña.'],
    'auth.errWrongPassword': ['Senha incorreta.', 'Incorrect password.', 'Contraseña incorrecta.'],
    'auth.errResetEmail': [
      'Informe seu e-mail pra redefinir a senha.',
      'Enter your email to reset your password.',
      'Ingresa tu correo para restablecer la contraseña.',
    ],
    'auth.demoReset': [
      'Modo demo: não há e-mail real pra enviar a redefinição.',
      'Demo mode: there is no real email address for a reset.',
      'Modo demo: no hay un correo real para enviar el restablecimiento.',
    ],
    'auth.resetSent': [
      'E-mail de redefinição enviado! Verifique sua caixa de entrada.',
      'Password reset email sent! Check your inbox.',
      '¡Correo de restablecimiento enviado! Revisa tu bandeja.',
    ],
    'auth.unavailable': ['Autenticação não disponível.', 'Authentication is unavailable.', 'La autenticación no está disponible.'],
    'auth.firebaseMissing': ['Firebase não carregado.', 'Firebase did not load.', 'Firebase no se cargó.'],
    'auth.newUser': ['Novo usuário', 'New user', 'Nuevo usuario'],
    'auth.providerExisting': [
      'Esse e-mail já tem conta no MyDesk, criada por outro método. Entre da mesma forma que da primeira vez.',
      'This email already has a MyDesk account created with another method. Sign in the same way you did the first time.',
      'Este correo ya tiene una cuenta MyDesk creada con otro método. Entra igual que la primera vez.',
    ],
    'auth.providerError': [
      'Não foi possível entrar com {provider}. Tente novamente.',
      'Could not sign in with {provider}. Try again.',
      'No se pudo entrar con {provider}. Inténtalo de nuevo.',
    ],
    'auth.errEmailInUse': ['Este e-mail já está cadastrado.', 'This email is already registered.', 'Este correo ya está registrado.'],
    'auth.errInvalidEmail': ['E-mail inválido.', 'Invalid email.', 'Correo inválido.'],
    'auth.errWeakPassword': ['Senha muito fraca. Use pelo menos 8 caracteres.', 'Password too weak. Use at least 8 characters.', 'Contraseña muy débil. Usa al menos 8 caracteres.'],
    'auth.errUserNotFound': ['E-mail não encontrado.', 'Email not found.', 'Correo no encontrado.'],
    'auth.errCredentials': ['E-mail ou senha incorretos.', 'Incorrect email or password.', 'Correo o contraseña incorrectos.'],
    'auth.errMissingPassword': ['Informe a senha.', 'Enter your password.', 'Ingresa la contraseña.'],
    'auth.errTooMany': ['Muitas tentativas. Tente novamente mais tarde.', 'Too many attempts. Try again later.', 'Demasiados intentos. Inténtalo más tarde.'],
    'auth.errNetwork': ['Sem conexão com a internet.', 'No internet connection.', 'Sin conexión a internet.'],
    'auth.errDisabled': ['Esta conta foi desativada.', 'This account has been disabled.', 'Esta cuenta fue desactivada.'],
    'auth.errOperation': ['Registro desativado. Contate o administrador.', 'Registration is disabled. Contact the administrator.', 'El registro está desactivado. Contacta al administrador.'],
    'auth.errConfig': ['Firebase não configurado corretamente.', 'Firebase is not configured correctly.', 'Firebase no está configurado correctamente.'],
    'auth.errDefault': ['Erro ao autenticar. Tente novamente.', 'Authentication error. Try again.', 'Error de autenticación. Inténtalo de nuevo.'],

    'form.title': ['Formulário · MyDesk', 'Form · MyDesk', 'Formulario · MyDesk'],
    'form.knowMyDesk': ['Conheça o MyDesk', 'Discover MyDesk', 'Conoce MyDesk'],
    'form.secure': ['Ambiente seguro', 'Secure environment', 'Entorno seguro'],
    'form.loading': ['Carregando formulário…', 'Loading form…', 'Cargando formulario…'],
    'form.createdWith': ['Formulário criado com', 'Form created with', 'Formulario creado con'],
    'form.tagline': ['Organização simples, trabalho claro.', 'Simple organization, clear work.', 'Organización simple, trabajo claro.'],
    'form.state': ['Estado', 'State', 'Provincia/estado'],
    'form.birthDate': ['Data de nascimento', 'Date of birth', 'Fecha de nacimiento'],
    'form.education': ['Escolaridade', 'Education', 'Nivel educativo'],
    'form.maritalStatus': ['Estado civil', 'Marital status', 'Estado civil'],
    'form.stateFilter': ['Estado para filtrar os municípios', 'State to filter cities', 'Provincia/estado para filtrar municipios'],
    'form.loadingStates': ['Carregando estados…', 'Loading states…', 'Cargando estados…'],
    'form.selectState': ['Selecione o estado', 'Select a state', 'Selecciona una provincia/estado'],
    'form.statesUnavailable': ['Estados indisponíveis', 'States unavailable', 'Provincias/estados no disponibles'],
    'form.loadingCities': ['Carregando municípios…', 'Loading cities…', 'Cargando municipios…'],
    'form.selectStateFirst': ['Selecione primeiro o estado', 'Select a state first', 'Selecciona primero una provincia/estado'],
    'form.selectCity': ['Selecione o município', 'Select a city', 'Selecciona un municipio'],
    'form.citiesUnavailable': ['Municípios indisponíveis', 'Cities unavailable', 'Municipios no disponibles'],
    'form.writeHere': ['Escreva aqui…', 'Write here…', 'Escribe aquí…'],
    'form.selectOption': ['Selecione uma opção', 'Select an option', 'Selecciona una opción'],
    'form.emailPlaceholder': ['seu@email.com', 'you@email.com', 'tu@correo.com'],
    'form.selectEducation': ['Selecione a escolaridade', 'Select education level', 'Selecciona el nivel educativo'],
    'form.selectMarital': ['Selecione o estado civil', 'Select marital status', 'Selecciona el estado civil'],
    'form.eduFundamentalIncomplete': ['Ensino fundamental incompleto', 'Incomplete elementary education', 'Educación primaria incompleta'],
    'form.eduFundamentalComplete': ['Ensino fundamental completo', 'Complete elementary education', 'Educación primaria completa'],
    'form.eduHighIncomplete': ['Ensino médio incompleto', 'Incomplete high school', 'Educación secundaria incompleta'],
    'form.eduHighComplete': ['Ensino médio completo', 'High school graduate', 'Educación secundaria completa'],
    'form.eduCollegeIncomplete': ['Ensino superior incompleto', 'Incomplete higher education', 'Educación superior incompleta'],
    'form.eduCollegeComplete': ['Ensino superior completo', 'Higher education degree', 'Educación superior completa'],
    'form.eduPostgraduate': ['Pós-graduação', 'Postgraduate degree', 'Posgrado'],
    'form.eduMasters': ['Mestrado', "Master's degree", 'Maestría'],
    'form.eduDoctorate': ['Doutorado', 'Doctorate', 'Doctorado'],
    'form.preferNotSay': ['Prefiro não informar', 'Prefer not to say', 'Prefiero no informar'],
    'form.single': ['Solteiro(a)', 'Single', 'Soltero(a)'],
    'form.married': ['Casado(a)', 'Married', 'Casado(a)'],
    'form.domesticPartnership': ['União estável', 'Domestic partnership', 'Unión de hecho'],
    'form.separated': ['Separado(a)', 'Separated', 'Separado(a)'],
    'form.divorced': ['Divorciado(a)', 'Divorced', 'Divorciado(a)'],
    'form.widowed': ['Viúvo(a)', 'Widowed', 'Viudo(a)'],
    'form.cpfUnavailable': [
      'A validação de CPF está indisponível. Recarregue a página antes de continuar.',
      'CPF validation is unavailable. Reload the page before continuing.',
      'La validación del CPF no está disponible. Recarga la página antes de continuar.',
    ],
    'form.invalidCpf': ['Informe um CPF válido.', 'Enter a valid CPF.', 'Ingresa un CPF válido.'],
    'form.cpfValid': ['CPF conferido.', 'CPF verified.', 'CPF verificado.'],
    'form.cpfCheck': ['Confira os números do CPF.', 'Check the CPF digits.', 'Revisa los números del CPF.'],
    'form.searchAddress': ['Buscando endereço…', 'Looking up address…', 'Buscando dirección…'],
    'form.cepNotFound': ['CEP não encontrado.', 'Postal code not found.', 'Código postal no encontrado.'],
    'form.checkCnpj': ['Confira o CNPJ informado.', 'Check the CNPJ.', 'Revisa el CNPJ ingresado.'],
    'form.searchCompany': ['Consultando empresa…', 'Looking up company…', 'Consultando empresa…'],
    'form.cnpjNotFound': ['CNPJ não encontrado.', 'CNPJ not found.', 'CNPJ no encontrado.'],
    'form.collection': ['COLETA DE INFORMAÇÕES', 'INFORMATION REQUEST', 'RECOPILACIÓN DE INFORMACIÓN'],
    'form.fieldOne': ['{count} campo', '{count} field', '{count} campo'],
    'form.fieldMany': ['{count} campos', '{count} fields', '{count} campos'],
    'form.formFallback': ['Formulário', 'Form', 'Formulario'],
    'form.submit': ['Enviar', 'Submit', 'Enviar'],
    'form.privacyLead': [
      'Seus dados são processados pelo MyDesk e armazenados para acesso do responsável por este formulário.',
      'Your data is processed by MyDesk and stored for the owner of this form to access.',
      'Tus datos son procesados por MyDesk y almacenados para que acceda la persona responsable de este formulario.',
    ],
    'form.readFileError': ['Não foi possível ler o arquivo.', 'The file could not be read.', 'No se pudo leer el archivo.'],
    'form.fileTooBig': ['O arquivo passa de 5 MB. Envie um menor.', 'The file is larger than 5 MB. Send a smaller one.', 'El archivo supera 5 MB. Envía uno más pequeño.'],
    'form.errEmpty': [
      'Preencha ao menos um campo ou anexe o arquivo pedido.',
      'Fill in at least one field or attach the requested file.',
      'Completa al menos un campo o adjunta el archivo solicitado.',
    ],
    'form.errFile': [
      'O arquivo não pôde ser lido. Tente enviar em outro formato.',
      'The file could not be read. Try sending it in another format.',
      'No se pudo leer el archivo. Intenta enviarlo en otro formato.',
    ],
    'form.errClosed': [
      'Este formulário não está mais aberto para respostas.',
      'This form is no longer open for responses.',
      'Este formulario ya no está abierto a respuestas.',
    ],
    'form.errLimit': [
      'Este formulário atingiu o limite de respostas.',
      'This form has reached its response limit.',
      'Este formulario alcanzó el límite de respuestas.',
    ],
    'form.errSave': [
      'Sua resposta não pôde ser registrada agora. Tente de novo em instantes.',
      'Your response could not be recorded right now. Try again in a moment.',
      'Tu respuesta no pudo registrarse ahora. Inténtalo de nuevo en unos instantes.',
    ],
    'form.photo': ['Foto', 'Photo', 'Foto'],
    'form.photoPick': ['Escolher uma foto', 'Choose a photo', 'Elegir una foto'],
    'form.photoHint': [
      'Opcional. Ajuda quem vai avaliar a reconhecer você.',
      'Optional. It helps whoever reviews your application recognize you.',
      'Opcional. Ayuda a quien evalúa a reconocerte.',
    ],
    'form.photoRemove': ['Remover', 'Remove', 'Quitar'],
    'form.photoNeedsImage': ['Escolha um arquivo de imagem.', 'Choose an image file.', 'Elige un archivo de imagen.'],
    'form.photoUnreadable': ['Não consegui ler essa imagem.', 'That image could not be read.', 'No se pudo leer esa imagen.'],
    'form.photoTooBig': [
      'A foto ficou grande demais. Escolha outra imagem.',
      'The photo came out too large. Choose another image.',
      'La foto quedó demasiado grande. Elige otra imagen.',
    ],
    'form.errPhoto': [
      'A foto não pôde ser lida. Tente outra imagem.',
      'The photo could not be read. Try another image.',
      'La foto no pudo leerse. Prueba con otra imagen.',
    ],
    'form.requiredFile': ['Anexe o arquivo pedido em "{field}".', 'Attach the file requested in “{field}”.', 'Adjunta el archivo solicitado en «{field}».'],
    'form.required': ['Preencha "{field}".', 'Fill in “{field}”.', 'Completa «{field}».'],
    'form.invalidCpfField': ['Informe um CPF válido em "{field}".', 'Enter a valid CPF in “{field}”.', 'Ingresa un CPF válido en «{field}».'],
    'form.checkField': ['Confira "{field}".', 'Check “{field}”.', 'Revisa «{field}».'],
    'form.sendError': ['Não foi possível enviar.', 'Could not submit the form.', 'No se pudo enviar.'],
    'form.sentTitle': ['Resposta enviada ✓', 'Response sent ✓', 'Respuesta enviada ✓'],
    'form.sentBody': [
      'Obrigado! Suas informações chegaram a quem enviou este formulário.',
      'Thank you! Your information reached the person who sent this form.',
      '¡Gracias! Tu información llegó a quien envió este formulario.',
    ],
    'form.incompleteLink': ['Link incompleto', 'Incomplete link', 'Enlace incompleto'],
    'form.incompleteLinkBody': [
      'O endereço não traz o código do formulário. Peça o link de novo a quem o enviou.',
      'The address does not include a form code. Ask the sender for the link again.',
      'La dirección no incluye el código del formulario. Pide de nuevo el enlace a quien lo envió.',
    ],
    'form.unavailable': ['Formulário indisponível', 'Form unavailable', 'Formulario no disponible'],
    'form.unavailableBody': [
      'Não foi possível carregar este formulário. Tente novamente.',
      'This form could not be loaded. Try again.',
      'No se pudo cargar este formulario. Inténtalo de nuevo.',
    ],

    'mobile.navLabel': ['Navegação principal', 'Main navigation', 'Navegación principal'],
    'mobile.new': ['Nova', 'New', 'Nueva'],
    'mobile.clients': ['Clientes', 'Clients', 'Clientes'],
    'mobile.friends': ['Amigos', 'Friends', 'Amigos'],
    'mobile.events': ['Eventos', 'Events', 'Eventos'],
    'mobile.more': ['Mais', 'More', 'Más'],
    'mobile.moreOptions': ['Mais opções', 'More options', 'Más opciones'],
    'mobile.workspaces': ['Workspaces', 'Workspaces', 'Espacios'],
    'mobile.background': ['Fundo', 'Background', 'Fondo'],
    'mobile.reorganize': ['Reorganizar', 'Reorganize', 'Reorganizar'],
    'mobile.invite': ['Convidar', 'Invite', 'Invitar'],
    'mobile.restore': ['Restaurar', 'Restore', 'Restaurar'],
    'mobile.report': ['Reportar', 'Report', 'Reportar'],
    'mobile.admin': ['Admin', 'Admin', 'Admin'],
    'mobile.clear': ['Limpar tudo', 'Clear all', 'Borrar todo'],
    'mobile.exit': ['Sair', 'Sign out', 'Salir'],
    'mobile.noteWidth': ['Largura das notas', 'Note width', 'Ancho de las notas'],
    'mobile.noteWidthHint': [
      'Arraste para ajustar a largura das notas · duplo clique volta ao padrão',
      'Drag to adjust note width · double-click resets to default',
      'Arrastra para ajustar el ancho de las notas · doble clic restaura el valor original',
    ],
    'mobile.resetWidth': ['Voltar ao padrão', 'Reset to default', 'Restaurar valor original'],
    'mobile.minimize': ['Minimizar', 'Minimize', 'Minimizar'],
    'mobile.maximize': ['Ampliar', 'Maximize', 'Ampliar'],
    'mobile.minimizeCall': ['Minimizar chamada', 'Minimize call', 'Minimizar llamada'],

    'app.title': ['MyDesk — Workspace de Notas Inteligente', 'MyDesk — Smart Notes Workspace', 'MyDesk — Espacio de notas inteligente'],
    'app.newNote': ['Nova nota', 'New note', 'Nueva nota'],
    'app.reorganize': ['Reorganizar', 'Reorganize', 'Reorganizar'],
    'app.clearAll': ['Limpar tudo', 'Clear all', 'Borrar todo'],
    'app.restore': ['Restaurar', 'Restore', 'Restaurar'],
    'app.background': ['Fundo', 'Background', 'Fondo'],
    'app.clients': ['Clientes', 'Clients', 'Clientes'],
    'app.events': ['Eventos', 'Events', 'Eventos'],
    'app.friends': ['Amigos', 'Friends', 'Amigos'],
    'app.invite': ['Convidar', 'Invite', 'Invitar'],
    'app.workspaces': ['Workspaces', 'Workspaces', 'Espacios'],
    'app.presenceDelegation': ['Presença e delegação', 'Presence and delegation', 'Presencia y delegación'],
    'app.delegateTaskFor': ['Delegar tarefa para', 'Delegate task to', 'Delegar tarea a'],
    'app.loadingParticipants': ['Carregando participantes…', 'Loading participants…', 'Cargando participantes…'],
    'app.noParticipants': [
      'Nenhum participante disponível.',
      'No participants available.',
      'No hay participantes disponibles.',
    ],
    'app.loadParticipantsError': [
      'Não foi possível carregar os participantes.',
      'Could not load participants.',
      'No se pudieron cargar los participantes.',
    ],
    'app.delegatedBy': ['delegado por', 'delegated by', 'delegado por'],
    'app.delegateSuccess': [
      'Nota delegada para @{name}.',
      'Note delegated to @{name}.',
      'Nota delegada a @{name}.',
    ],
    'app.delegateRemoved': [
      '@{name} não está mais delegado a esta nota.',
      '@{name} is no longer assigned to this note.',
      '@{name} ya no está asignado a esta nota.',
    ],
    'app.delegateUpdateError': [
      'Não foi possível atualizar a delegação.',
      'Could not update the assignment.',
      'No se pudo actualizar la delegación.',
    ],
    // ── Construtor de formulário ──────────────────────────────────────
    'app.formNoTemplate': [
      'Sem modelo — eu monto os campos',
      'No template — I will build the fields',
      'Sin plantilla — yo armo los campos',
    ],
    'app.formTemplateSwapConfirm': [
      'Trocar o modelo refaz a lista de campos. Continuar?',
      'Switching the template rebuilds the field list. Continue?',
      'Cambiar la plantilla rehace la lista de campos. ¿Continuar?',
    ],
    'app.optionN': ['Opção {n}', 'Option {n}', 'Opción {n}'],
    'app.emailPlaceholder': ['seu@email.com', 'you@email.com', 'tu@correo.com'],
    'app.attachToClient': ['Anexar a um cliente…', 'Attach to a client…', 'Adjuntar a un cliente…'],
    'app.noNameLower': ['sem nome', 'no name', 'sin nombre'],
    'app.clientFromResponse': [
      'Cliente criado a partir da resposta.',
      'Client created from the response.',
      'Cliente creado a partir de la respuesta.',
    ],
    // Nome de cor: vai no title e no aria-label do seletor de tema.
    'app.color_indigo': ['Índigo', 'Indigo', 'Índigo'],
    'app.color_violeta': ['Violeta', 'Violet', 'Violeta'],
    'app.color_azul': ['Azul', 'Blue', 'Azul'],
    'app.color_oceano': ['Oceano', 'Ocean', 'Océano'],
    'app.color_ciano': ['Ciano', 'Cyan', 'Cian'],
    'app.color_esmeralda': ['Esmeralda', 'Emerald', 'Esmeralda'],
    'app.color_lima': ['Lima', 'Lime', 'Lima'],
    'app.color_ambar': ['Âmbar', 'Amber', 'Ámbar'],
    'app.color_laranja': ['Laranja', 'Orange', 'Naranja'],
    'app.color_rubi': ['Rubi', 'Ruby', 'Rubí'],
    'app.color_rosa': ['Rosa', 'Pink', 'Rosa'],
    'app.color_grafite': ['Grafite', 'Graphite', 'Grafito'],

    /* Nomes das cores da nota. A chave da cor (`indigo`, `gNebulosa`) é o que
       vai para o banco e nunca muda; isto aqui é só o nome que se lê no
       seletor e no chip da nota. */
    'app.pal_indigo': ['Índigo', 'Indigo', 'Índigo'],
    'app.pal_violet': ['Violeta', 'Violet', 'Violeta'],
    'app.pal_fuchsia': ['Fúcsia', 'Fuchsia', 'Fucsia'],
    'app.pal_rose': ['Rosa', 'Rose', 'Rosa'],
    'app.pal_red': ['Vermelho', 'Red', 'Rojo'],
    'app.pal_orange': ['Laranja', 'Orange', 'Naranja'],
    'app.pal_amber': ['Âmbar', 'Amber', 'Ámbar'],
    'app.pal_gold': ['Ouro', 'Gold', 'Oro'],
    'app.pal_lime': ['Lima', 'Lime', 'Lima'],
    'app.pal_emerald': ['Esmeralda', 'Emerald', 'Esmeralda'],
    'app.pal_teal': ['Teal', 'Teal', 'Verde azulado'],
    'app.pal_cyan': ['Ciano', 'Cyan', 'Cian'],
    'app.pal_sky': ['Céu', 'Sky', 'Cielo'],
    'app.pal_blue': ['Azul', 'Blue', 'Azul'],
    'app.pal_slate': ['Cinza', 'Slate', 'Gris'],
    'app.pal_pink': ['Pink', 'Pink', 'Rosado'],
    'app.pal_white': ['Branco', 'White', 'Blanco'],
    'app.pal_black': ['Preto', 'Black', 'Negro'],
    'app.pal_golden': ['Amarelo', 'Yellow', 'Amarillo'],
    'app.pal_gAurora': ['Aurora', 'Aurora', 'Aurora'],
    'app.pal_gSunset': ['Pôr do sol', 'Sunset', 'Atardecer'],
    'app.pal_gNeon': ['Neon', 'Neon', 'Neón'],
    'app.pal_gMint': ['Menta', 'Mint', 'Menta'],
    'app.pal_gLava': ['Lava', 'Lava', 'Lava'],
    'app.pal_gOceano': ['Oceano', 'Ocean', 'Océano'],
    'app.pal_gRose': ['Rosé', 'Rosé', 'Rosé'],
    'app.pal_gGrafite': ['Grafite', 'Graphite', 'Grafito'],
    'app.pal_gNebulosa': ['Nebulosa', 'Nebula', 'Nebulosa'],
    'app.pal_gCrepusculo': ['Crepúsculo', 'Dusk', 'Crepúsculo'],
    'app.pal_gFloresta': ['Floresta', 'Forest', 'Bosque'],
    'app.pal_gAbissal': ['Abissal', 'Abyss', 'Abisal'],
    'app.pal_gVulcao': ['Vulcão', 'Volcano', 'Volcán'],
    'app.pal_gAmetista': ['Ametista', 'Amethyst', 'Amatista'],
    'app.pal_gTundra': ['Tundra', 'Tundra', 'Tundra'],
    'app.pal_gDeserto': ['Deserto', 'Desert', 'Desierto'],
    'app.pal_gOrquidea': ['Orquídea', 'Orchid', 'Orquídea'],
    'app.pal_gEclipse': ['Eclipse', 'Eclipse', 'Eclipse'],
    'app.pal_gCorViva': ['Cor viva', 'Living color', 'Color vivo'],

    'app.googleApiDisabledNamed': [
      'A {api} não está ativada no projeto do Google Cloud. Ative e tente de novo.',
      'The {api} is not enabled in the Google Cloud project. Enable it and try again.',
      'La {api} no está activada en el proyecto de Google Cloud. Actívala e inténtalo de nuevo.',
    ],
    'app.googleConnectTimeout': [
      'O Google não respondeu. Verifique se a janela foi bloqueada e tente de novo.',
      'Google did not respond. Check whether the window was blocked and try again.',
      'Google no respondió. Comprueba si la ventana fue bloqueada e inténtalo de nuevo.',
    ],
    // Ficha exportada no modelo oficial
    'app.situation': ['Situação', 'State', 'Situación'],
    'app.stepDone': ['Concluída', 'Done', 'Concluida'],
    'app.stepPending': ['Pendente', 'Pending', 'Pendiente'],
    'app.cardExportedDocx': [
      'Ficha gerada no modelo oficial do MyDesk.',
      'Record created using the official MyDesk template.',
      'Ficha generada con la plantilla oficial de MyDesk.',
    ],
    'app.restoreWrongWorkspace': [
      'Este backup é de outro workspace. Volte para ele para restaurar.',
      'This backup belongs to another workspace. Switch back to it to restore.',
      'Esta copia es de otro espacio. Vuelve a él para restaurar.',
    ],
    'app.folderDelegation': ['Delegar esta pasta', 'Delegate this folder', 'Delegar esta carpeta'],
    'app.folderTakenBy': [
      'Quem assumiu esta pasta',
      'Who has taken this folder',
      'Quién asumió esta carpeta',
    ],
    'app.delegateFolderFor': ['Delegar pasta para', 'Delegate folder to', 'Delegar carpeta a'],
    'app.noFolderDelegation': [
      'Ninguém assumiu esta pasta.',
      'Nobody has taken this folder.',
      'Nadie asumió esta carpeta.',
    ],
    'app.assignFolderDelegationTo': [
      'Delegar esta pasta para @{name}',
      'Assign this folder to @{name}',
      'Delegar esta carpeta a @{name}',
    ],
    'app.delegateFolderSuccess': [
      'Pasta delegada para @{name}.',
      'Folder delegated to @{name}.',
      'Carpeta delegada a @{name}.',
    ],
    'app.delegateFolderRemoved': [
      '@{name} não está mais delegado a esta pasta.',
      '@{name} is no longer assigned to this folder.',
      '@{name} ya no está asignado a esta carpeta.',
    ],
    'app.participantOrFolderNotFound': [
      'Participante ou pasta não encontrado.',
      'Participant or folder not found.',
      'No se encontró el participante o la carpeta.',
    ],
    'app.delegateFolderNotOnBoard': [
      'Esta pasta ainda não está salva no quadro compartilhado.',
      'This folder is not saved to the shared board yet.',
      'Esta carpeta aún no está guardada en el tablero compartido.',
    ],
    'app.delegationNewNote': [
      '@{by} delegou a nota "{title}" para você.',
      '@{by} delegated the note "{title}" to you.',
      '@{by} te delegó la nota "{title}".',
    ],
    'app.delegationNewFolder': [
      '@{by} delegou a pasta "{title}" para você.',
      '@{by} delegated the folder "{title}" to you.',
      '@{by} te delegó la carpeta "{title}".',
    ],
    'app.delegationRemovedNote': [
      '@{by} tirou sua delegação da nota "{title}".',
      '@{by} removed your assignment from the note "{title}".',
      '@{by} quitó tu delegación de la nota "{title}".',
    ],
    'app.delegationRemovedFolder': [
      '@{by} tirou sua delegação da pasta "{title}".',
      '@{by} removed your assignment from the folder "{title}".',
      '@{by} quitó tu delegación de la carpeta "{title}".',
    ],
    'app.delegationNoWorkspace': [
      'A delegação não veio de um workspace que dê para abrir daqui.',
      'This assignment did not come from a workspace that can be opened from here.',
      'Esta delegación no vino de un espacio que se pueda abrir desde aquí.',
    ],
    'app.collaborativeWorkspaceInactive': [
      'Workspace colaborativo inativo.',
      'The collaborative workspace is inactive.',
      'El espacio colaborativo está inactivo.',
    ],
    'app.participantOrNoteNotFound': [
      'Participante ou nota não encontrado.',
      'Participant or note not found.',
      'No se encontró el participante o la nota.',
    ],
    'app.invalidParticipantId': [
      'Identificador de participante inválido.',
      'Invalid participant identifier.',
      'Identificador de participante no válido.',
    ],
    'app.authenticatedFirebase': [
      'Autenticado com segurança via Firebase.',
      'Securely authenticated with Firebase.',
      'Autenticación segura mediante Firebase.',
    ],
    'app.admin': ['Admin', 'Admin', 'Admin'],
    'app.exit': ['Sair', 'Sign out', 'Salir'],
    'app.personal': ['pessoal', 'personal', 'personal'],
    'app.temporaryLeave': ['↩ Sair temporariamente', '↩ Leave temporarily', '↩ Salir temporalmente'],
    'app.delete': ['Excluir', 'Delete', 'Eliminar'],
    'app.deleteIcon': ['🗑 Excluir', '🗑 Delete', '🗑 Eliminar'],
    'app.clientPanel': ['Painel de Clientes', 'Client Dashboard', 'Panel de clientes'],
    'app.searchClient': ['Buscar cliente...', 'Search clients...', 'Buscar clientes...'],
    'app.receivedMonth': ['Recebido no mês', 'Received this month', 'Recibido este mes'],
    'app.receivable': ['A receber', 'Receivable', 'Por cobrar'],
    'app.averageTicket': ['Ticket médio', 'Average ticket', 'Ticket medio'],
    'app.revenue': ['Faturamento', 'Revenue', 'Facturación'],
    'app.receipts': ['Recebimentos', 'Receipts', 'Cobros'],
    'app.daily': ['Diário', 'Daily', 'Diario'],
    'app.weekly': ['Semanal', 'Weekly', 'Semanal'],
    'app.monthly': ['Mensal', 'Monthly', 'Mensual'],
    'app.annual': ['Anual', 'Annual', 'Anual'],
    'app.report': ['Relatório', 'Report', 'Informe'],
    'app.filter': ['Filtrar', 'Filter', 'Filtrar'],
    'app.client': ['Cliente', 'Client', 'Cliente'],
    'app.value': ['Valor', 'Amount', 'Valor'],
    'app.due': ['Vencimento', 'Due date', 'Vencimiento'],
    'app.status': ['Status', 'Status', 'Estado'],
    'app.noClients': ['Nenhum cliente ainda', 'No clients yet', 'Aún no hay clientes'],
    'app.addClient': ['Adicionar Cliente', 'Add Client', 'Añadir cliente'],
    'app.videoCall': ['Videochamada', 'Video call', 'Videollamada'],
    'app.personalPanel': ['🔔 Painel pessoal', '🔔 Personal panel', '🔔 Panel personal'],
    'app.budget': ['Orçamento', 'Budget', 'Presupuesto'],
    'app.expenses': ['Despesas', 'Expenses', 'Gastos'],
    'app.tasks': ['Tarefas', 'Tasks', 'Tareas'],
    'app.emailReminders': ['Lembretes por e-mail', 'Email reminders', 'Recordatorios por correo'],
    'app.importIcs': ['📅 Importar .ics', '📅 Import .ics', '📅 Importar .ics'],
    'app.description': ['Descrição', 'Description', 'Descripción'],
    'app.addTask': ['+ Adicionar tarefa', '+ Add task', '+ Añadir tarea'],
    'app.sortBy': ['⚡ Reorganizar por', '⚡ Reorganize by', '⚡ Reorganizar por'],
    'app.order': ['Ordem', 'Order', 'Orden'],
    'app.solidColors': ['Cores sólidas', 'Solid colors', 'Colores sólidos'],
    'app.gradients': ['Gradientes', 'Gradients', 'Degradados'],
    'app.collection': ['Coleção', 'Collection', 'Colección'],
    'app.loopVideo': ['Vídeo em loop', 'Looping video', 'Video en bucle'],
    'app.chooseImage': ['📂 Escolher imagem do computador', '📂 Choose an image from your computer', '📂 Elegir imagen del ordenador'],
    'app.restoreDefault': ['↺ Restaurar padrão', '↺ Restore default', '↺ Restaurar predeterminado'],
    'app.chooseNoteType': ['Escolha o tipo de nota que deseja criar', 'Choose the type of note to create', 'Elige el tipo de nota que quieres crear'],
    'app.personalNote': ['Nota Pessoal', 'Personal Note', 'Nota personal'],
    'app.clientNote': ['Nota de Cliente', 'Client Note', 'Nota de cliente'],
    'app.form': ['Formulário', 'Form', 'Formulario'],
    'app.titleLabel': ['Título', 'Title', 'Título'],
    'app.contentLabel': ['Conteúdo', 'Content', 'Contenido'],
    'app.deadlines': ['Prazos', 'Deadlines', 'Plazos'],
    'app.startDate': ['Data de início', 'Start date', 'Fecha de inicio'],
    'app.finalDeadline': ['Prazo final', 'Final deadline', 'Plazo final'],
    'app.enableReminder': ['Ativar lembrete de prazo', 'Enable deadline reminder', 'Activar recordatorio de plazo'],
    'app.daysBefore': ['dias antes do prazo', 'days before the deadline', 'días antes del plazo'],
    'app.cardColor': ['Cor do card', 'Card color', 'Color de la tarjeta'],
    'app.createNote': ['Criar nota', 'Create note', 'Crear nota'],
    'app.createClient': ['Criar cliente', 'Create client', 'Crear cliente'],
    'app.pending': ['Pendente', 'Pending', 'Pendiente'],
    'app.paid': ['Pago', 'Paid', 'Pagado'],
    'app.currentMonth': ['no mês atual', 'in the current month', 'en el mes actual'],
    'app.totalOpen': ['total em aberto', 'total outstanding', 'total pendiente'],
    'app.inPortfolio': ['na carteira', 'in the portfolio', 'en la cartera'],
    'app.portfolioAverage': ['média da carteira', 'portfolio average', 'promedio de la cartera'],
    'app.sortRecentlyCreated': [
      'Ordenar por: Recém-criados',
      'Sort by: Recently created',
      'Ordenar por: Recién creados',
    ],
    'app.addFirstClient': [
      'Adicione seu primeiro cliente ou converta uma nota existente em registro financeiro.',
      'Add your first client or convert an existing note into a financial record.',
      'Añade tu primer cliente o convierte una nota existente en un registro financiero.',
    ],
    'app.requests': ['Pedidos', 'Requests', 'Solicitudes'],
    'app.groups': ['Grupos', 'Groups', 'Grupos'],
    'app.personalPanelFree': [
      'grátis · eventos, orçamento, despesas e tarefas',
      'free · events, budget, expenses, and tasks',
      'gratis · eventos, presupuesto, gastos y tareas',
    ],
    'app.reminderSchedule': [
      'Avisos em 3, 2 e 1 dia antes e no dia · Premium',
      'Alerts 3, 2, and 1 day before and on the day · Premium',
      'Avisos 3, 2 y 1 día antes y el mismo día · Premium',
    ],
    'app.timedEventNotice': [
      'Compromisso com hora avisa 20 min antes e na hora, com som — na tela e por notificação, com o MyDesk aberto em alguma aba.',
      'Timed events alert you 20 minutes before and at the scheduled time, with sound, on-screen, and notification alerts while MyDesk is open in a tab.',
      'Los eventos con hora avisan 20 minutos antes y en el momento, con sonido, en pantalla y por notificación mientras MyDesk esté abierto en una pestaña.',
    ],
    'app.eventTypeAppointment': ['compromisso', 'appointment', 'compromiso'],
    'app.eventTypeNote': ['nota', 'note', 'nota'],
    'app.eventTypeClient': ['cliente', 'client', 'cliente'],
    'app.eventTypeImported': ['importado', 'imported', 'importado'],
    'app.monthlyBudget': ['Orçamento mensal (R$)', 'Monthly budget (R$)', 'Presupuesto mensual (R$)'],
    'app.byCategory': ['Por categoria', 'By category', 'Por categoría'],
    'app.add': ['+ Adicionar', '+ Add', '+ Añadir'],
    'app.monthlyReset': [
      'Reseta automaticamente todo mês · dia opcional pra alerta de atraso',
      'Resets automatically every month · optional day for overdue alerts',
      'Se reinicia automáticamente cada mes · día opcional para alertas de atraso',
    ],
    'app.defaultOrder': ['padrão', 'default', 'predeterminado'],
    'app.reset': ['↺ Resetar', '↺ Reset', '↺ Restablecer'],
    'app.creationDefault': ['🕐 Criação (padrão)', '🕐 Created (default)', '🕐 Creación (predeterminado)'],
    'app.oldestFirst': ['↑ Mais antigas primeiro', '↑ Oldest first', '↑ Más antiguas primero'],
    'app.newestFirst': ['↓ Mais recentes primeiro', '↓ Newest first', '↓ Más recientes primero'],
    'app.titleAZ': ['A→Z Título', 'A→Z Title', 'A→Z Título'],
    'app.titleZA': ['Z→A Título', 'Z→A Title', 'Z→A Título'],
    'app.nearestDeadline': ['📅 Prazo mais próximo', '📅 Nearest deadline', '📅 Plazo más próximo'],
    'app.farthestDeadline': ['📅 Prazo mais distante', '📅 Farthest deadline', '📅 Plazo más lejano'],
    'app.byStatus': ['● Por status', '● By status', '● Por estado'],
    'app.byColor': ['🎨 Por cor', '🎨 By color', '🎨 Por color'],
    'app.boardBackground': ['🎨 Fundo do painel', '🎨 Board background', '🎨 Fondo del panel'],
    'app.pixelArt': ['Pixel Art', 'Pixel Art', 'Pixel Art'],
    'app.freeNoteDescription': [
      'Texto livre, tarefas, links e prazos',
      'Free text, tasks, links, and deadlines',
      'Texto libre, tareas, enlaces y plazos',
    ],
    'app.clientNoteDescription': [
      'Nome, valor a pagar e status de pagamento',
      'Name, amount due, and payment status',
      'Nombre, importe y estado del pago',
    ],
    'app.publicFormDescription': [
      'Link público para o cliente preencher; as respostas voltam pra cá',
      'Public link for the client to complete; responses return here',
      'Enlace público para que el cliente lo complete; las respuestas vuelven aquí',
    ],
    'app.newBadge': ['NOVO', 'NEW', 'NUEVO'],
    'app.backArrow': ['← Voltar', '← Back', '← Volver'],
    'app.personalNoteIcon': ['📝 Nota Pessoal', '📝 Personal Note', '📝 Nota personal'],
    'app.requiredTitle': [
      'Título obrigatório · demais campos opcionais',
      'Title required · all other fields optional',
      'Título obligatorio · los demás campos son opcionales',
    ],
    'app.clientNoteIcon': ['💼 Nota de Cliente', '💼 Client Note', '💼 Nota de cliente'],
    'app.clientNoteCreates': [
      'Cria uma nota no board e registra automaticamente em Clientes',
      'Creates a board note and automatically registers it under Clients',
      'Crea una nota en el tablero y la registra automáticamente en Clientes',
    ],
    'app.clientName': ['Nome do cliente', 'Client name', 'Nombre del cliente'],
    'app.serviceDescription': ['Descrição do serviço (opcional)', 'Service description (optional)', 'Descripción del servicio (opcional)'],
    'app.amountBrl': ['Valor (R$)', 'Amount (R$)', 'Importe (R$)'],
    'app.paymentStatus': ['Status do pagamento', 'Payment status', 'Estado del pago'],
    'app.pendingIcon': ['⏳ Pendente', '⏳ Pending', '⏳ Pendiente'],
    'app.paidIcon': ['✓ Pago', '✓ Paid', '✓ Pagado'],
    'app.toggleNotesCrm': [
      'Alternar: Notas / CRM Financeiro',
      'Switch: Notes / Financial CRM',
      'Cambiar: Notas / CRM financiero',
    ],
    'app.upcomingEvents': ['Próximos eventos', 'Upcoming events', 'Próximos eventos'],
    'app.friendsChat': ['Amigos & Chat', 'Friends & Chat', 'Amigos y chat'],
    'app.invitePremium': [
      'Convide amigos e ganhe Premium',
      'Invite friends and earn Premium',
      'Invita amigos y consigue Premium',
    ],
    'app.sharedWorkspaces': ['Workspaces compartilhados', 'Shared workspaces', 'Espacios compartidos'],
    'app.adminPanel': ['Painel Administrativo', 'Administration panel', 'Panel de administración'],
    'app.workspaceNamePlaceholder': ['Nome do workspace...', 'Workspace name...', 'Nombre del espacio...'],
    'app.newClient': ['Novo cliente', 'New client', 'Nuevo cliente'],
    'app.createSheetTitle': [
      'Criar uma planilha com a lista exibida',
      'Create a spreadsheet from the displayed list',
      'Crear una hoja de cálculo con la lista mostrada',
    ],
    'app.deleteRecordsTitle': ['Apagar todos os registros', 'Delete all records', 'Eliminar todos los registros'],
    'app.callAudioLevel': ['Nível de áudio da chamada', 'Call audio level', 'Nivel de audio de la llamada'],
    'app.muted': ['Mudo', 'Muted', 'Silenciado'],
    'app.camera': ['Camera', 'Camera', 'Cámara'],
    'app.shareScreen': ['Compartilhar tela', 'Share screen', 'Compartir pantalla'],
    'app.leaveCall': ['Sair da chamada', 'Leave call', 'Salir de la llamada'],
    'app.toggle': ['Ligar/desligar', 'Turn on/off', 'Activar/desactivar'],
    'app.previousMonth': ['Mês anterior', 'Previous month', 'Mes anterior'],
    'app.nextMonth': ['Próximo mês', 'Next month', 'Mes siguiente'],
    'app.noteSubjectPlaceholder': [
      'Do que se trata esta nota?',
      'What is this note about?',
      '¿De qué trata esta nota?',
    ],
    'app.noteBodyPlaceholder': [
      'Anotações, links, tarefas...',
      'Notes, links, tasks...',
      'Notas, enlaces, tareas...',
    ],
    'app.clientExample': ['Ex.: João Silva', 'Example: John Smith', 'Ej.: Juan Pérez'],
    'app.serviceExample': [
      'Desenvolvimento web, consultoria, design...',
      'Web development, consulting, design...',
      'Desarrollo web, consultoría, diseño...',
    ],

    /* Textos montados dinamicamente pelo app. Estas chaves nunca são aplicadas
       por varredura ao conteúdo das notas, comentários, clientes ou respostas:
       app.js as consome apenas nos controles e mensagens da interface. */
    'app.cancel': ['Cancelar', 'Cancel', 'Cancelar'],
    'app.save': ['Salvar', 'Save', 'Guardar'],
    'app.saving': ['Salvando…', 'Saving…', 'Guardando…'],
    'app.close': ['Fechar', 'Close', 'Cerrar'],
    'app.open': ['Abrir', 'Open', 'Abrir'],
    'app.download': ['Baixar', 'Download', 'Descargar'],
    'app.remove': ['Remover', 'Remove', 'Quitar'],
    'app.edit': ['Editar', 'Edit', 'Editar'],
    'app.actions': ['Ações', 'Actions', 'Acciones'],
    'app.next': ['Avançar →', 'Next →', 'Continuar →'],
    'app.back': ['← Voltar', '← Back', '← Volver'],
    'app.tryAgain': ['Tentar novamente', 'Try again', 'Intentar de nuevo'],
    'app.noTitle': ['Sem título', 'Untitled', 'Sin título'],
    'app.noName': ['Sem nome', 'Unnamed', 'Sin nombre'],
    'app.noDate': ['Sem data', 'No date', 'Sin fecha'],
    'app.noteRestored': ['Nota restaurada.', 'Note restored.', 'Nota restaurada.'],
    'app.boardRestored': ['Board restaurado.', 'Board restored.', 'Tablero restaurado.'],
    'app.noteAndClientRestored': ['Nota e cliente restaurados.',
      'Note and client restored.', 'Nota y cliente restaurados.'],
    'app.formDefault': ['Formulário', 'Form', 'Formulario'],
    'app.aForm': ['um formulário', 'a form', 'un formulario'],
    'app.aNote': ['uma nota', 'a note', 'una nota'],
    'app.folderDefault': ['uma pasta', 'a folder', 'una carpeta'],
    'app.responseDefault': ['Resposta', 'Response', 'Respuesta'],
    'app.clientDefault': ['Cliente', 'Client', 'Cliente'],
    'app.eventDefault': ['Evento', 'Event', 'Evento'],
    'app.appointmentDefault': ['Compromisso', 'Appointment', 'Compromiso'],
    'app.fileDefault': ['arquivo', 'file', 'archivo'],

    /* Formulário que vira ficha de cliente, e o envio por e-mail. As chaves
       entraram com o recurso mas ficaram fora do catálogo: sem elas o texto
       aparecia em português para quem escolheu inglês ou espanhol. */
    'app.free': ['Grátis', 'Free', 'Gratis'],
    'app.group': ['Grupo', 'Group', 'Grupo'],
    'app.personalWorkspace': ['Workspace pessoal', 'Personal workspace', 'Espacio personal'],
    'app.formClientDestinationGroup': [
      'Clientes · grupo {name}',
      'Clients · {name} group',
      'Clientes · grupo {name}',
    ],
    'app.formClientDestinationShared': [
      'Clientes · workspace com @{name}',
      'Clients · workspace with @{name}',
      'Clientes · espacio con @{name}',
    ],
    'app.formClientDestinationPersonalWorkspace': [
      'Clientes · {name}',
      'Clients · {name}',
      'Clientes · {name}',
    ],
    'app.formClientDestinationPersonal': [
      'Clientes · Principal',
      'Clients · Main',
      'Clientes · Principal',
    ],
    'app.formClientDestination': [
      'Destino: {destination}',
      'Destination: {destination}',
      'Destino: {destination}',
    ],
    'app.formCreateClient': [
      'Criar cliente com cada resposta',
      'Create a client from each response',
      'Crear un cliente con cada respuesta',
    ],
    'app.formCreateClientDesc': [
      'Transformar automaticamente os dados respondidos em uma ficha de cliente.',
      'Automatically turn the submitted data into a client record.',
      'Convertir automáticamente los datos enviados en una ficha de cliente.',
    ],
    'app.createClientFromResponse': ['Criar cliente', 'Create client', 'Crear cliente'],
    'app.formEmailFallbackSubject': [
      'Formulário MyDesk: {title}',
      'MyDesk form: {title}',
      'Formulario MyDesk: {title}',
    ],
    'app.formEmailFallbackBody': [
      'Use o link abaixo para preencher o formulário:',
      'Use the link below to fill out the form:',
      'Usa el enlace de abajo para completar el formulario:',
    ],
    'app.formEmailFallbackOpened': [
      'Abrimos seu aplicativo de e-mail com a mensagem pronta. Revise e clique em Enviar para concluir.',
      'We opened your email app with the message ready. Review it and click Send to finish.',
      'Abrimos tu aplicación de correo con el mensaje listo. Revísalo y haz clic en Enviar para terminar.',
    ],
    'app.formEmailFallbackButton': [
      'Abrir novamente no aplicativo de e-mail',
      'Open in the email app again',
      'Abrir de nuevo en la aplicación de correo',
    ],
    'app.formEmailFallbackToast': [
      'Conclua o envio no seu aplicativo de e-mail.',
      'Finish sending from your email app.',
      'Completa el envío desde tu aplicación de correo.',
    ],

    /* ── Avisos e rótulos que o app.js escrevia direto na tela ─────────────
       Eram cerca de 60 frases em português dentro do código — toast de erro,
       placeholder, estado vazio. Nenhuma passava pelo _appText, então nenhuma
       trocava de idioma, e nenhuma acusava erro: a pessoa em inglês só via
       português no meio da interface traduzida. */
    /* "Criar conta →" e "Usuário não encontrado." não entram aqui de propósito:
       já existem no LANGS do app.js (T.btnRegister e T.errNotFound), que troca
       de idioma junto com este catálogo. Duas fontes para a mesma frase é como
       uma delas fica para trás. */
    'app.confirmEmailBar': [
      'Confirme seu e-mail — enviamos um link para <b>{email}</b>.',
      'Confirm your email — we sent a link to <b>{email}</b>.',
      'Confirma tu correo — enviamos un enlace a <b>{email}</b>.',
    ],
    'app.resend': ['Reenviar', 'Resend', 'Reenviar'],
    'app.assignDelegation': ['Delegar', 'Assign', 'Delegar'],
    'app.removeDelegation': ['Remover', 'Remove', 'Quitar'],
    'app.assignDelegationTo': [
      'Delegar esta nota para @{name}',
      'Assign this note to @{name}',
      'Delegar esta nota a @{name}',
    ],
    'app.removeDelegationFrom': [
      'Tirar a delegação de @{name}',
      'Remove the assignment from @{name}',
      'Quitar la delegación de @{name}',
    ],
    'app.unavailableShort': ['indisponível', 'unavailable', 'no disponible'],
    'app.memberUnresolved': [
      '@{name} está no grupo, mas a conta não foi encontrada para delegar.',
      '@{name} is in the group, but the account could not be found to assign.',
      '@{name} está en el grupo, pero no se encontró la cuenta para delegar.',
    ],
    'app.delegateNotMember': [
      'Sua conta não consta como membro deste grupo (@{name}).',
      'Your account is not listed as a member of this group (@{name}).',
      'Tu cuenta no figura como miembro de este grupo (@{name}).',
    ],
    'app.delegateTargetNotMember': [
      '@{name} não consta na lista de membros do grupo.',
      '@{name} is not on the group member list.',
      '@{name} no figura en la lista de miembros del grupo.',
    ],
    'app.delegateNoteNotOnBoard': [
      'Esta nota ainda não está salva no quadro do grupo.',
      'This note is not saved to the group board yet.',
      'Esta nota aún no está guardada en el tablero del grupo.',
    ],
    'app.delegateIdentityMissing': [
      'A conta de {name} não tem o registro de identidade que a delegação exige.',
      'The account {name} is missing the identity record delegation requires.',
      'La cuenta {name} no tiene el registro de identidad que la delegación exige.',
    ],
    'app.userExists': ['Usuário já existe.', 'That username already exists.', 'Ese usuario ya existe.'],
    'app.authUnavailable':['Auth não disponível.', 'Authentication unavailable.', 'Autenticación no disponible.'],
    'app.notNow': ['Agora não', 'Not now', 'Ahora no'],
    'app.alreadyConfirmed': ['Já confirmei', 'I already confirmed', 'Ya confirmé'],
    'app.notYetConfirmed': [
      'Ainda não consta como confirmado. Abra o link do e-mail e tente de novo.',
      'It is not confirmed yet. Open the link in the email and try again.',
      'Todavía no consta como confirmado. Abre el enlace del correo e inténtalo de nuevo.',
    ],
    // Singular e plural separados: "1 de 3 concluído" e "2 de 3 concluídos".
    'app.checklistProgressOne': ['{done} de {total} concluído', '{done} of {total} done', '{done} de {total} completado'],
    'app.checklistProgressMany': ['{done} de {total} concluídos', '{done} of {total} done', '{done} de {total} completados'],
    'app.stackExists': [
      'Já existe a pasta "{name}" — as notas foram para ela.',
      'The folder "{name}" already exists — the notes went there.',
      'La carpeta "{name}" ya existe — las notas fueron allí.',
    ],
    'app.stackTitlePlaceholder': ['Título da pilha…', 'Stack title…', 'Título de la pila…'],
    'app.stackStatusExists': [
      'A pasta de "{status}" já existe — esta fica como pasta comum.',
      'The "{status}" folder already exists — this one stays a regular folder.',
      'La carpeta de "{status}" ya existe — esta queda como carpeta común.',
    ],
    'app.overdueDays': ['Vencido há {days}d', '{days}d overdue', 'Vencido hace {days}d'],
    'app.closeNotification': ['Fechar notificação', 'Close notification', 'Cerrar notificación'],
    'app.emailMaintenanceTitle': [
      'Envio por e-mail em manutenção',
      'Email sending under maintenance',
      'Envío por correo en mantenimiento',
    ],
    'app.emailMaintenanceBody': [
      'Estamos ajustando o serviço de e-mail e ele volta em instantes. Seu formulário já está publicado e recebendo respostas normalmente — basta enviar o link abaixo por onde preferir.',
      'We are adjusting the email service and it will be back shortly. Your form is already published and receiving responses normally — just send the link below however you prefer.',
      'Estamos ajustando el servicio de correo y volverá en instantes. Tu formulario ya está publicado y recibiendo respuestas normalmente — solo envía el enlace de abajo por donde prefieras.',
    ],
    'app.copyFailed': [
      'Não consegui copiar. Selecione o link à mão.',
      'Could not copy. Select the link manually.',
      'No se pudo copiar. Selecciona el enlace a mano.',
    ],
    'app.alreadySentTo': ['já foi para {name}', 'already went to {name}', 'ya fue para {name}'],
    'app.apptSavedNoReminder': [
      'Compromisso salvo, mas o lembrete por e-mail não foi agendado.',
      'Appointment saved, but the email reminder was not scheduled.',
      'Compromiso guardado, pero el recordatorio por correo no se programó.',
    ],
    'app.noBackup': ['Nenhum backup disponível.', 'No backup available.', 'No hay copia disponible.'],
    'app.untitledParens': ['(sem título)', '(untitled)', '(sin título)'],
    'app.invalidFile': ['Arquivo inválido: {name}', 'Invalid file: {name}', 'Archivo inválido: {name}'],
    'app.layoutReset': ['Reorganização resetada', 'Layout reset', 'Reorganización restablecida'],
    'app.saveNameError': [
      'Erro ao salvar nome. Verifique sua conexão.',
      'Could not save the name. Check your connection.',
      'No se pudo guardar el nombre. Revisa tu conexión.',
    ],
    'app.searchUserPlaceholder': ['buscar usuário...', 'search user...', 'buscar usuario...'],
    'app.thisIsYou': ['Este é você 😄', 'This is you 😄', 'Este eres tú 😄'],
    'app.removedFromGroupBy': [
      'Você foi removido do grupo "{group}" por @{by}.',
      'You were removed from the "{group}" group by @{by}.',
      'Fuiste eliminado del grupo "{group}" por @{by}.',
    ],
    'app.removedFromGroup': [
      'Você foi removido do grupo "{group}".',
      'You were removed from the "{group}" group.',
      'Fuiste eliminado del grupo "{group}".',
    ],
    'app.serverOffline': ['Sem conexão com o servidor.', 'No connection to the server.', 'Sin conexión con el servidor.'],
    'app.noConnection': ['Sem conexão.', 'No connection.', 'Sin conexión.'],
    'app.noServerConnection': ['Sem conexão com servidor.', 'No server connection.', 'Sin conexión con el servidor.'],
    'app.noConnectionSaveName': [
      'Sem conexão para salvar o nome.',
      'No connection to save the name.',
      'Sin conexión para guardar el nombre.',
    ],
    'app.photoMax6': ['Foto: máximo 6MB', 'Photo: 6MB maximum', 'Foto: máximo 6MB'],
    'app.groupDeleted': ['Grupo excluído.', 'Group deleted.', 'Grupo eliminado.'],
    'app.leftGroup': ['Você saiu do grupo.', 'You left the group.', 'Saliste del grupo.'],
    'app.cannotKickSelf': ['Você não pode se kickar.', 'You cannot remove yourself.', 'No puedes expulsarte a ti mismo.'],
    'app.kickError': ['Erro ao kickar usuário.', 'Could not remove the user.', 'No se pudo expulsar al usuario.'],
    'app.alreadyInAllGroups': [
      'Já está em todos os seus grupos.',
      'Already in all of your groups.',
      'Ya está en todos tus grupos.',
    ],
    'app.joinedGroup': [
      'Você entrou no grupo "{group}"!',
      'You joined the "{group}" group!',
      '¡Entraste al grupo "{group}"!',
    ],
    'app.joinGroupError': [
      'Não foi possível entrar no grupo. Tente novamente.',
      'Could not join the group. Try again.',
      'No se pudo entrar al grupo. Inténtalo de nuevo.',
    ],
    'app.alreadyInCall': ['Você já está em uma chamada.', 'You are already in a call.', 'Ya estás en una llamada.'],
    'app.mediaAccessError': [
      'Não foi possível acessar câmera/microfone.',
      'Could not access the camera/microphone.',
      'No se pudo acceder a la cámara/micrófono.',
    ],
    'app.joinCallError': [
      'Não foi possível entrar na chamada. Tente novamente.',
      'Could not join the call. Try again.',
      'No se pudo entrar a la llamada. Inténtalo de nuevo.',
    ],
    'app.inviteSentTo': ['Convite enviado para @{user}!', 'Invite sent to @{user}!', '¡Invitación enviada a @{user}!'],
    'app.inviteSentWaiting': [
      'Convite enviado para @{user}. Aguardando autorização…',
      'Invite sent to @{user}. Waiting for authorization…',
      'Invitación enviada a @{user}. Esperando autorización…',
    ],
    'app.loginToInvite': [
      'Faça login para convidar amigos.',
      'Sign in to invite friends.',
      'Inicia sesión para invitar amigos.',
    ],
    'app.formDefaultTitle': ['Formulário', 'Form', 'Formulario'],
    'app.formReadError': [
      'Não consegui ler este formulário.',
      'Could not read this form.',
      'No se pudo leer este formulario.',
    ],
    'app.formNoResponsesYet': [
      'Este formulário ainda não recebeu respostas.',
      'This form has not received any responses yet.',
      'Este formulario aún no ha recibido respuestas.',
    ],
    'app.reportPremiumOnly': [
      'O relatório financeiro é exclusivo do Premium.',
      'The financial report is Premium only.',
      'El informe financiero es exclusivo de Premium.',
    ],
    'app.aging30': ['até 30 dias', 'up to 30 days', 'hasta 30 dias'],
    'app.aging60': ['31 a 60 dias', '31 to 60 days', '31 a 60 dias'],
    'app.aging90': ['61 a 90 dias', '61 to 90 days', '61 a 90 dias'],
    'app.aging90mais': ['mais de 90 dias', 'over 90 days', 'mas de 90 dias'],
    'app.lateByDays': ['venceu há {n} dias', 'overdue by {n} days', 'vencio hace {n} dias'],
    'app.dueToday': ['vence hoje', 'due today', 'vence hoy'],
    'app.dueInDays': ['em {n} dias', 'in {n} days', 'en {n} dias'],
    'app.readCollection': ['Recebimento em {pct}', 'Collection at {pct}', 'Cobranza en {pct}'],
    'app.readCollectionSub': ['De {total} em contratos, {pago} entrou e {falta} continua em aberto.', 'Of {total} contracted, {pago} came in and {falta} is still open.', 'De {total} contratados, {pago} entro y {falta} sigue abierto.'],
    'app.readOverdue': ['{n} em atraso, somando {valor}', '{n} overdue, adding up to {valor}', '{n} vencidos, sumando {valor}'],
    'app.readOverdueSub': ['O mais antigo é de {nome}, vencido há {dias} dias.', 'The oldest is from {nome}, overdue by {dias} days.', 'El mas antiguo es de {nome}, vencido hace {dias} dias.'],
    'app.readConcentration': ['Os cinco maiores são {pct} da carteira', 'The top five are {pct} of the book', 'Los cinco mayores son {pct} de la cartera'],
    'app.readConcentrationHigh': ['Concentração alta: perder um deles muda o mês inteiro.', 'High concentration: losing one of them changes the whole month.', 'Concentracion alta: perder a uno cambia el mes entero.'],
    'app.readConcentrationOk': ['Carteira distribuída — nenhum cliente sozinho decide o mês.', 'Spread out book — no single client decides the month.', 'Cartera distribuida — ningun cliente solo decide el mes.'],
    'app.readNext': ['{valor} a receber nas próximas semanas', '{valor} coming in over the next weeks', '{valor} a recibir en las proximas semanas'],
    'app.readNextSub': ['{n} vencimentos até {data}.', '{n} due dates through {data}.', '{n} vencimientos hasta {data}.'],
    'app.readTicket': ['Ticket médio de {valor}', 'Average ticket of {valor}', 'Ticket medio de {valor}'],
    'app.readTicketSub': ['Sobre {n} registros no período.', 'Across {n} records in the period.', 'Sobre {n} registros del periodo.'],
    'app.pptUnavailable': ['O gerador de apresentação não carregou. Recarregue a página.', 'The presentation generator did not load. Reload the page.', 'El generador de presentacion no cargo. Recarga la pagina.'],
    'app.pptTitle': ['Relatório financeiro', 'Financial report', 'Informe financiero'],
    'app.pptPeriod': ['Últimos 6 meses · posição em {data}', 'Last 6 months · position on {data}', 'Ultimos 6 meses · posicion al {data}'],
    'app.pptIssued': ['Gerado pelo MyDesk em {data}', 'Generated by MyDesk on {data}', 'Generado por MyDesk el {data}'],
    'app.pptFooter': ['Relatório financeiro · {data}', 'Financial report · {data}', 'Informe financiero · {data}'],
    'app.pptReceived': ['RECEBIDO', 'RECEIVED', 'RECIBIDO'],
    'app.pptOfTotal': ['{pct} do total', '{pct} of the total', '{pct} del total'],
    'app.pptOpen': ['EM ABERTO', 'OPEN', 'ABIERTO'],
    'app.pptOnTime': ['dentro do prazo', 'within the due date', 'dentro del plazo'],
    'app.pptOverdue': ['EM ATRASO', 'OVERDUE', 'VENCIDO'],
    'app.pptOverdueN': ['{n} registros', '{n} records', '{n} registros'],
    'app.pptContracted': ['CONTRATADO', 'CONTRACTED', 'CONTRATADO'],
    'app.pptInPeriod': ['soma da carteira', 'total of the book', 'suma de la cartera'],
    'app.pptTicket': ['TICKET MÉDIO', 'AVERAGE TICKET', 'TICKET MEDIO'],
    'app.pptPerRecord': ['por registro', 'per record', 'por registro'],
    'app.pptClients': ['REGISTROS', 'RECORDS', 'REGISTROS'],
    'app.pptClientsSub': ['na carteira', 'in the book', 'en la cartera'],
    'app.pptPaid': ['Recebido', 'Received', 'Recibido'],
    'app.pptNPaid': ['{n} quitados', '{n} settled', '{n} liquidados'],
    'app.pptPartialOpen': ['Saldo de parciais', 'Balance of partials', 'Saldo de parciales'],
    'app.pptNPartial': ['{n} com entrada', '{n} with a down payment', '{n} con entrada'],
    'app.pptOpenLabel': ['Em aberto no prazo', 'Open, within the due date', 'Abierto en plazo'],
    'app.pptNOpen': ['{n} a vencer', '{n} coming due', '{n} por vencer'],
    'app.pptOverdueLabel': ['Vencido', 'Overdue', 'Vencido'],
    'app.pptNOverdue': ['{n} em atraso', '{n} overdue', '{n} vencidos'],
    'app.pptNRecords': ['{n} registros', '{n} records', '{n} registros'],
    'app.pptWorst': ['{nome} — {valor}, vencido há {dias} dias.', '{nome} — {valor}, overdue by {dias} days.', '{nome} — {valor}, vencido hace {dias} dias.'],
    'app.pptTop5': ['Os cinco maiores clientes somam {pct} de tudo o que foi contratado.', 'The top five clients add up to {pct} of everything contracted.', 'Los cinco mayores clientes suman {pct} de todo lo contratado.'],
    'app.pptNewTotal': ['ENTRARAM NO PERÍODO', 'CAME IN THIS PERIOD', 'ENTRARON EN EL PERIODO'],
    'app.pptNewSub': ['registros criados', 'records created', 'registros creados'],
    'app.pptAvgTicket': ['TICKET MÉDIO', 'AVERAGE TICKET', 'TICKET MEDIO'],
    'app.pptDisclaimer': ['Os números saem dos registros cadastrados no MyDesk na data de emissão. Documento de gestão, sem valor contábil ou fiscal.', 'The numbers come from the records in MyDesk on the issue date. Management document, with no accounting or tax value.', 'Los numeros salen de los registros en MyDesk en la fecha de emision. Documento de gestion, sin valor contable ni fiscal.'],
    'app.pptS2': ['Os números do período', 'The numbers for the period', 'Los numeros del periodo'],
    'app.pptS2Sub': ['Posição da carteira na data de emissão.', 'Position of the book on the issue date.', 'Posicion de la cartera en la fecha de emision.'],
    'app.pptS3': ['Evolução dos últimos 6 meses', 'Last 6 months', 'Evolucion de los ultimos 6 meses'],
    'app.pptS3Sub': ['O que foi contratado em cada mês e quanto disso entrou.', 'What was contracted each month and how much of it came in.', 'Lo contratado cada mes y cuanto entro.'],
    'app.pptContractedLabel': ['Contratado', 'Contracted', 'Contratado'],
    'app.pptReceivedLabel': ['Recebido', 'Received', 'Recibido'],
    'app.pptS4': ['Composição da carteira', 'Make-up of the book', 'Composicion de la cartera'],
    'app.pptS4Sub': ['Cada real em um estado só — parcial entra dos dois lados.', 'Every real in one state only — partials count on both sides.', 'Cada peso en un solo estado — los parciales entran en ambos lados.'],
    'app.pptTotalLabel': ['contratado', 'contracted', 'contratado'],
    'app.pptS5': ['Inadimplência por idade', 'Overdue by age', 'Morosidad por antiguedad'],
    'app.pptS5Sub': ['Há quanto tempo cada real em atraso está parado.', 'How long each overdue amount has been sitting.', 'Cuanto tiempo lleva parado cada monto vencido.'],
    'app.pptOldest': ['O MAIS ANTIGO', 'THE OLDEST', 'EL MAS ANTIGUO'],
    'app.pptS6': ['Maiores clientes', 'Largest clients', 'Mayores clientes'],
    'app.pptS6Sub': ['Por valor contratado no período.', 'By amount contracted in the period.', 'Por monto contratado en el periodo.'],
    'app.pptConcentrationLabel': ['CONCENTRAÇÃO', 'CONCENTRATION', 'CONCENTRACION'],
    'app.pptS7': ['Próximos vencimentos', 'Upcoming due dates', 'Proximos vencimientos'],
    'app.pptS7Sub': ['O que há para entrar nas próximas semanas, e o que já venceu.', 'What is coming in over the next weeks, and what is already overdue.', 'Lo que entra en las proximas semanas, y lo que ya vencio.'],
    'app.pptColDate': ['VENCIMENTO', 'DUE DATE', 'VENCIMIENTO'],
    'app.pptColClient': ['CLIENTE', 'CLIENT', 'CLIENTE'],
    'app.pptColStatus': ['SITUAÇÃO', 'STATUS', 'SITUACION'],
    'app.pptColValue': ['A RECEBER', 'TO RECEIVE', 'A RECIBIR'],
    'app.pptNoDue': ['Nenhum vencimento nas próximas semanas.', 'No due dates over the next weeks.', 'Sin vencimientos en las proximas semanas.'],
    'app.pptS8': ['Base de clientes', 'Client base', 'Base de clientes'],
    'app.pptS8Sub': ['Quantos registros entraram em cada mês.', 'How many records came in each month.', 'Cuantos registros entraron cada mes.'],
    'app.pptS9': ['Leitura do período', 'Reading the period', 'Lectura del periodo'],
    'app.pptS9Sub': ['Cada frase abaixo sai de um número das páginas anteriores.', 'Every line below comes from a number on the previous pages.', 'Cada frase sale de un numero de las paginas anteriores.'],
    'app.pptDone': ['Apresentação gerada.', 'Presentation generated.', 'Presentacion generada.'],
    'app.pptFailed': ['Não consegui gerar a apresentação.', 'I could not generate the presentation.', 'No pude generar la presentacion.'],
    'app.print': ['Imprimir', 'Print', 'Imprimir'],
    'app.downloadPptx': ['Baixar PowerPoint', 'Download PowerPoint', 'Descargar PowerPoint'],
    'app.addClientsFirst': [
      'Cadastre clientes antes de gerar o relatório.',
      'Add clients before generating the report.',
      'Registra clientes antes de generar el informe.',
    ],
    'app.closeEsc': ['Fechar (Esc)', 'Close (Esc)', 'Cerrar (Esc)'],
    'app.closeReport': ['Fechar relatório', 'Close report', 'Cerrar informe'],
    'app.remindersPremiumOnly': [
      'Lembretes por e-mail são exclusivos do Premium.',
      'Email reminders are Premium only.',
      'Los recordatorios por correo son exclusivos de Premium.',
    ],
    'app.savePreferenceError': [
      'Não foi possível salvar a preferência.',
      'Could not save the preference.',
      'No se pudo guardar la preferencia.',
    ],
    'app.receiptPremiumOnly': [
      'O recibo em PDF é exclusivo do Premium.',
      'The PDF receipt is Premium only.',
      'El recibo en PDF es exclusivo de Premium.',
    ],
    'app.stackAlreadyThere': ['A pasta "{name}" já está no quadro.', 'The "{name}" folder is already on the board.', 'La carpeta "{name}" ya esta en el tablero.'],
    'app.stackCreated': ['Pasta "{name}" criada. Arraste notas para dentro dela.', 'Folder "{name}" created. Drag notes into it.', 'Carpeta "{name}" creada. Arrastra notas hacia ella.'],
    'app.stackEmptyHint': ['Arraste notas para cá', 'Drag notes here', 'Arrastra notas aqui'],
    /* ── PAINÉIS RESTRITOS DO GRUPO ─────────────────────────────────── */
    'app.panelAccessRevoked': ['O líder do grupo mudou o seu acesso a este painel.', 'The group leader changed your access to this panel.', 'El líder del grupo cambió tu acceso a este panel.'],
    'app.panelNeedsLeader': ['só o líder do grupo pode liberar', 'only the group leader can grant this', 'solo el líder del grupo puede liberarlo'],
    'app.panelBlockedBy': ['{painel} é restrito neste grupo. Peça a @{lider} para liberar.', '{painel} is restricted in this group. Ask @{lider} to grant access.', '{painel} es restringido en este grupo. Pide a @{lider} que lo libere.'],
    'app.panelBlocked': ['{painel} é restrito neste grupo.', '{painel} is restricted in this group.', '{painel} es restringido en este grupo.'],
    'app.panelOpenToYou': ['Você entra em {n}', 'You can open {n}', 'Puedes entrar en {n}'],
    'app.panelClosedToYou': ['{n} — restrito pelo líder', '{n} — restricted by the leader', '{n} — restringido por el líder'],
    'app.onlyLeaderPermissions': ['Só o líder do grupo define quem entra em cada painel.', 'Only the group leader decides who enters each panel.', 'Solo el líder del grupo define quién entra en cada panel.'],
    'app.groupPermissions': ['Quem entra em cada painel', 'Who enters each panel', 'Quién entra en cada panel'],
    'app.groupPermissionsSub': ['Você é o líder de {grupo}. Só você muda isto.', 'You are the leader of {grupo}. Only you can change this.', 'Eres el líder de {grupo}. Solo tú cambias esto.'],
    'app.groupPermissionsMenuSub': ['RH, Financeiro e Clientes', 'HR, Finance and Clients', 'RR. HH., Finanzas y Clientes'],
    'app.groupPermissionsLimit': ['Isto controla a entrada pelos painéis do MyDesk. Não é um cofre: os dados ficam no mesmo quadro que todo membro do grupo já pode abrir.', 'This controls entry through the MyDesk panels. It is not a vault: the data lives in the same board every group member can already open.', 'Esto controla la entrada por los paneles de MyDesk. No es una caja fuerte: los datos están en el mismo tablero que todo miembro ya puede abrir.'],
    'app.groupNoMembersYet': ['Este grupo ainda só tem você. Convide alguém para poder liberar painéis.', 'This group is still just you. Invite someone to be able to grant panels.', 'Este grupo todavía eres solo tú. Invita a alguien para poder liberar paneles.'],
    'app.permissionsSaved': ['Permissões atualizadas.', 'Permissions updated.', 'Permisos actualizados.'],
    'app.permissionsFailed': ['Não consegui salvar: {erro}', 'Could not save: {erro}', 'No pude guardar: {erro}'],
    'app.member': ['Membro', 'Member', 'Miembro'],
    'app.youAreLeader': ['você é o líder', 'you are the leader', 'eres el líder'],
    'app.leaderIs': ['líder: @{n}', 'leader: @{n}', 'líder: @{n}'],
    'app.leader': ['líder', 'leader', 'líder'],
    'app.offline': ['offline', 'offline', 'desconectado'],
    'app.onlineNow': ['online agora', 'online now', 'en línea ahora'],
    'app.panels': ['Painéis', 'Panels', 'Paneles'],
    'app.leave': ['Sair', 'Leave', 'Salir'],
    'app.openBoard': ['Abrir quadro', 'Open board', 'Abrir tablero'],
    'app.chat': ['Chat', 'Chat', 'Chat'],
    'app.moreOptions': ['Mais opções', 'More options', 'Más opciones'],
    'app.groupMembers': ['Ver membros', 'See members', 'Ver miembros'],
    'app.removeMember': ['Remover', 'Remove', 'Quitar'],
    'app.personLower': ['pessoa', 'person', 'persona'],
    'app.peopleLower': ['pessoas', 'people', 'personas'],
    'app.deleteGroup': ['Excluir grupo', 'Delete group', 'Eliminar grupo'],
    'app.leaveGroup': ['Sair do grupo', 'Leave group', 'Salir del grupo'],
    'app.aGroup': ['este grupo', 'this group', 'este grupo'],
    'app.deleteGroupQ': ['Excluir o grupo "{n}"?', 'Delete the group "{n}"?', '¿Eliminar el grupo "{n}"?'],
    'app.leaveGroupQ': ['Sair do grupo "{n}"?', 'Leave the group "{n}"?', '¿Salir del grupo "{n}"?'],
    'app.deleteGroupDesc': ['O grupo acaba para as {q} pessoas dentro dele, junto com o chat. As notas do quadro do grupo não são apagadas por aqui.', 'The group ends for the {q} people in it, along with the chat. The group board notes are not deleted here.', 'El grupo termina para las {q} personas dentro, junto con el chat. Las notas del tablero no se eliminan aquí.'],
    'app.leaveGroupDesc': ['Você perde o acesso ao quadro e ao chat deste grupo. Para voltar, precisa de um convite novo.', 'You lose access to this group\'s board and chat. To come back, you need a new invite.', 'Pierdes el acceso al tablero y al chat de este grupo. Para volver, necesitas una invitación nueva.'],
    'app.serieStatusHint': ['Marcar o pagamento da parcela {n}/{de}', 'Mark payment for instalment {n}/{de}', 'Marcar el pago de la cuota {n}/{de}'],
    'app.instalmentTarget': ['Parcela {n}/{de} · vence {data}', 'Instalment {n}/{de} · due {data}', 'Cuota {n}/{de} · vence {data}'],
    /* ── MODELO CLIENTES ────────────────────────────────────────────── */
    'app.modelClients': ['Clientes', 'Clients', 'Clientes'],
    'app.modelClientsSub': ['relacionamento e acompanhamentos', 'relationships and follow-ups', 'relaciones y seguimientos'],
    'app.modelFinanceSub': ['valores, vencimentos e recebimentos', 'amounts, due dates and payments', 'importes, vencimientos y cobros'],
    'app.modelRecruitingSub': ['vagas, candidatos e funil', 'jobs, candidates and pipeline', 'vacantes, candidatos y embudo'],

    'cli.panelTitle': ['Painel de Clientes', 'Clients Panel', 'Panel de Clientes'],
    'cli.panelSubtitle': ['Gerencie sua carteira e acompanhe cada relacionamento em um só lugar.', 'Manage your portfolio and follow every relationship in one place.', 'Gestiona tu cartera y sigue cada relación en un solo lugar.'],
    'cli.detailSubtitle': ['Relacionamentos que impulsionam resultados.', 'Relationships that drive results.', 'Relaciones que impulsan resultados.'],
    'cli.clients': ['Clientes', 'Clients', 'Clientes'],
    'cli.newClient': ['Novo cliente', 'New client', 'Nuevo cliente'],
    'cli.searchPlaceholder': ['Buscar clientes...', 'Search clients...', 'Buscar clientes...'],
    'cli.model': ['Modelo: Clientes', 'Model: Clients', 'Modelo: Clientes'],
    'cli.switchModelHint': ['Alternar entre Financeiro, Recrutamento e Clientes', 'Switch between Finance, Recruiting and Clients', 'Alternar entre Financiero, Reclutamiento y Clientes'],
    'cli.columns': ['Colunas', 'Columns', 'Columnas'],
    'cli.export': ['Exportar', 'Export', 'Exportar'],
    'cli.viewSettings': ['Visualização', 'View', 'Vista'],
    'cli.densityCozy': ['Densidade confortável', 'Comfortable density', 'Densidad cómoda'],
    'cli.densityCompact': ['Densidade compacta', 'Compact density', 'Densidad compacta'],
    'cli.showSecondary': ['Mostrar contato sob o nome', 'Show contact under the name', 'Mostrar contacto bajo el nombre'],
    'cli.resetView': ['Restaurar visualização', 'Reset view', 'Restaurar vista'],
    'cli.nothingToExport': ['Não há clientes para exportar com os filtros atuais.', 'No clients to export with the current filters.', 'No hay clientes para exportar con los filtros actuales.'],
    'cli.exported': ['{n} clientes exportados.', '{n} clients exported.', '{n} clientes exportados.'],
    'cli.notEnoughData': ['Sem dados suficientes para calcular.', 'Not enough data to calculate.', 'Sin datos suficientes para calcular.'],
    'cli.allActions': ['Ver todas as ações', 'See all actions', 'Ver todas las acciones'],
    'cli.filteredWeek': ['Mostrando quem tem retorno nesta semana.', 'Showing who has a return this week.', 'Mostrando quien tiene retorno esta semana.'],
    'cli.actionsSummary': ['{n} ações no total', '{n} actions in total', '{n} acciones en total'],
    'cli.actionsSummaryOne': ['1 ação no total', '1 action in total', '1 acción en total'],
    'cli.actionsLateOne': ['1 atrasada', '1 overdue', '1 atrasada'],
    'cli.actionsLateMany': ['{a} atrasadas', '{a} overdue', '{a} atrasadas'],
    'cli.chipArchived': ['Só arquivados', 'Archived only', 'Solo archivados'],
    'cli.chipOutOfWallet': ['Só quem saiu da carteira', 'Removed from wallet only', 'Solo quienes salieron de la cartera'],
    'cli.filteringBy': ['Filtrando por:', 'Filtering by:', 'Filtrando por:'],
    'cli.removeFilter': ['Remover filtro {n}', 'Remove filter {n}', 'Quitar filtro {n}'],
    'cli.searchChip': ['Busca: "{q}"', 'Search: "{q}"', 'Búsqueda: "{q}"'],
    'cli.hiddenByFilter': ['{n} fora do filtro', '{n} outside the filter', '{n} fuera del filtro'],
    'cli.deleteAlsoFinance': ['O registro dele no Financeiro também é apagado.', 'Their record in Finance is deleted too.', 'Su registro en Finanzas también se elimina.'],
    'cli.deleteAlsoFinanceN': ['Os registros deles no Financeiro também são apagados.', 'Their records in Finance are deleted too.', 'Sus registros en Finanzas también se eliminan.'],
    'cli.deleteEverywhere': ['Excluir de tudo', 'Delete everywhere', 'Eliminar de todo'],
    'cli.removeFromWalletOnly': ['Tirar só da carteira', 'Remove from wallet only', 'Quitar solo de la cartera'],
    'cli.removeFromWalletDesc': ['Ele sai da lista de clientes e continua no Financeiro, com valores e vencimentos.', 'They leave the client list and stay in Finance, with amounts and due dates.', 'Sale de la lista de clientes y sigue en Finanzas, con importes y vencimientos.'],
    'cli.removedFromWallet': ['"{n}" saiu da carteira. O financeiro dele continua lá.', '"{n}" left the wallet. Their finance record is still there.', '"{n}" salió de la cartera. Su registro financiero sigue ahí.'],
    'cli.removedFromWalletN': ['{n} clientes saíram da carteira. O financeiro deles continua lá.', '{n} clients left the wallet. Their finance records are still there.', '{n} clientes salieron de la cartera. Sus registros financieros siguen ahí.'],
    'cli.showOutOfWallet': ['Mostrar apenas quem saiu da carteira (segue no Financeiro)', 'Show only those removed from the wallet (still in Finance)', 'Mostrar solo quienes salieron de la cartera (siguen en Finanzas)'],
    'cli.backToWallet': ['Trazer de volta para a carteira', 'Bring back to the wallet', 'Devolver a la cartera'],
    'cli.backInWallet': ['"{n}" voltou para a carteira.', '"{n}" is back in the wallet.', '"{n}" volvió a la cartera.'],
    'cli.needClientFirst': ['Cadastre um cliente para marcar um acompanhamento.', 'Add a client to schedule a follow-up.', 'Registra un cliente para programar un seguimiento.'],
    'cli.selectClient': ['Selecionar {n}', 'Select {n}', 'Seleccionar {n}'],
    'cli.selectPage': ['Selecionar esta página', 'Select this page', 'Seleccionar esta página'],
    'cli.nSelected': ['{n} selecionados', '{n} selected', '{n} seleccionados'],
    'cli.clearSelection': ['Limpar seleção', 'Clear selection', 'Limpiar selección'],
    'cli.archiveNQ': ['Arquivar {n} clientes?', 'Archive {n} clients?', '¿Archivar {n} clientes?'],
    'cli.archiveNDesc': ['Eles saem da lista padrão e continuam achaveis pelo filtro "Arquivados".', 'They leave the default list and stay findable under the "Archived" filter.', 'Salen de la lista predeterminada y siguen encontrables con el filtro "Archivados".'],
    'cli.deleteNQ': ['Excluir {n} clientes?', 'Delete {n} clients?', '¿Eliminar {n} clientes?'],
    'cli.deleteNDesc': ['Sai o cadastro, o histórico e os documentos de cada um. As notas do quadro não são apagadas.', 'The record, history and documents of each one are removed. Board notes are not deleted.', 'Se elimina el registro, el historial y los documentos de cada uno. Las notas del tablero no se borran.'],
    'app.financePanel': ['Painel Financeiro', 'Finance Panel', 'Panel Financiero'],
    'cli.newClientHow': ['Como quer cadastrar este cliente?', 'How do you want to add this client?', '¿Cómo quieres registrar este cliente?'],
    'cli.newClientHowSub': ['Você pode preencher agora ou deixar que a própria pessoa preencha.', 'You can fill it in now or let the person fill it in.', 'Puedes rellenarlo ahora o dejar que la persona lo rellene.'],
    'cli.fillNow': ['Preencher agora', 'Fill in now', 'Rellenar ahora'],
    'cli.fillNowSub': ['Você digita os dados que já tem em mãos.', 'You type the data you already have.', 'Tú escribes los datos que ya tienes.'],
    'cli.askToFill': ['Pedir para o cliente preencher', 'Ask the client to fill it in', 'Pedir al cliente que lo rellene'],
    'cli.askToFillSub': ['Monta um formulário com os campos que você escolher e envia por link ou e-mail. A resposta entra aqui como cliente.', 'Build a form with the fields you choose and send it by link or email. The answer lands here as a client.', 'Crea un formulario con los campos que elijas y lo envía por enlace o correo. La respuesta entra aquí como cliente.'],
    'cli.formDefaultTitle': ['Cadastro de cliente', 'Client registration', 'Registro de cliente'],
    'app.fmStd_cpf': ['CPF', 'Tax ID (CPF)', 'CPF'],
    'app.fmStd_nascimento': ['Data de nascimento', 'Date of birth', 'Fecha de nacimiento'],
    'app.fmStd_genero': ['Gênero', 'Gender', 'Género'],
    'app.fmStd_estado_civil': ['Estado civil', 'Marital status', 'Estado civil'],
    'app.fmStd_escolaridade': ['Escolaridade', 'Education', 'Escolaridad'],
    'app.fmStd_profissao': ['Profissão', 'Occupation', 'Profesión'],
    'app.fmStd_cep': ['CEP', 'Postal code', 'Código postal'],
    'app.fmStd_municipio': ['Município', 'City', 'Municipio'],
    'app.fmStd_estado': ['Estado', 'State', 'Estado'],
    'cli.tabCases': ['Processos', 'Cases', 'Procesos'],
    'cli.newCase': ['Novo processo', 'New case', 'Nuevo proceso'],
    'cli.editCase': ['Editar processo', 'Edit case', 'Editar proceso'],
    'cli.caseSub': ['O que o escritório acompanha. Prazo e audiência entram nos avisos do cliente.', 'What the firm tracks. Deadline and hearing feed the client reminders.', 'Lo que el despacho sigue. Plazo y audiencia entran en los avisos del cliente.'],
    'cli.noCases': ['Nenhum processo cadastrado para este cliente.', 'No case registered for this client.', 'Ningún proceso registrado para este cliente.'],
    'cli.caseFromForm': ['Criar a partir do que veio no formulário', 'Create from what came in the form', 'Crear a partir de lo que vino en el formulario'],
    'cli.caseNumber': ['Número do processo', 'Case number', 'Número del proceso'],
    'cli.caseNoNumber': ['Sem número', 'No number', 'Sin número'],
    'cli.casePhase': ['Fase', 'Phase', 'Fase'],
    'cli.caseArea': ['Área', 'Area', 'Área'],
    'cli.caseCourt': ['Vara / Foro', 'Court', 'Juzgado'],
    'cli.caseParty': ['Parte contrária', 'Opposing party', 'Parte contraria'],
    'cli.caseDeadline': ['Prazo', 'Deadline', 'Plazo'],
    'cli.caseHearing': ['Próxima audiência', 'Next hearing', 'Próxima audiencia'],
    'cli.caseValue': ['Valor da causa', 'Claim value', 'Valor de la causa'],
    'cli.caseFees': ['Honorários', 'Fees', 'Honorarios'],
    'cli.caseNotes': ['Andamento e observações', 'Progress and notes', 'Avance y observaciones'],
    'cli.caseNeedsSomething': ['Informe ao menos o número, a área ou a vara.', 'Enter at least the number, the area or the court.', 'Indica al menos el número, el área o el juzgado.'],
    'cli.deleteCaseQ': ['Excluir este processo?', 'Delete this case?', '¿Eliminar este proceso?'],
    'cli.deleteCaseDesc': ['O acompanhamento dele sai da ficha deste cliente e não volta.', 'Its tracking leaves this client record and does not come back.', 'Su seguimiento sale de la ficha de este cliente y no vuelve.'],
    'cli.faseConsulta': ['Consulta', 'Consultation', 'Consulta'],
    'cli.fasePeticao': ['Petição inicial', 'Initial petition', 'Petición inicial'],
    'cli.faseInstrucao': ['Instrução', 'Discovery', 'Instrucción'],
    'cli.faseSentenca': ['Sentença', 'Judgment', 'Sentencia'],
    'cli.faseRecurso': ['Recurso', 'Appeal', 'Recurso'],
    'cli.faseExecucao': ['Execução', 'Enforcement', 'Ejecución'],
    'cli.faseEncerrado': ['Encerrado', 'Closed', 'Cerrado'],
    'cli.faseArquivado': ['Arquivado', 'Archived', 'Archivado'],
    'cli.filters': ['Filtros', 'Filters', 'Filtros'],
    'cli.clearFilters': ['Limpar filtros', 'Clear filters', 'Limpiar filtros'],
    'cli.apply': ['Aplicar', 'Apply', 'Aplicar'],
    'cli.confirm': ['Confirmar', 'Confirm', 'Confirmar'],
    'cli.save': ['Salvar', 'Save', 'Guardar'],
    'cli.delete': ['Excluir', 'Delete', 'Eliminar'],
    'cli.you': ['Você', 'You', 'Tú'],
    'cli.noData': ['sem dados', 'no data', 'sin datos'],
    'cli.notInformed': ['Não informado', 'Not informed', 'No informado'],

    'cli.kpiActive': ['Clientes ativos', 'Active clients', 'Clientes activos'],
    'cli.kpiAddedWeek': ['{n} nos últimos 7 dias', '{n} in the last 7 days', '{n} en los últimos 7 días'],
    'cli.kpiOfTotal': ['de {n} na carteira', 'of {n} in the portfolio', 'de {n} en la cartera'],
    'cli.kpiNewMonth': ['Novos este mês', 'New this month', 'Nuevos este mes'],
    'cli.kpiVsMonth': ['{n}% vs mês anterior', '{n}% vs last month', '{n}% vs mes anterior'],
    'cli.kpiNoCompare': ['sem mês anterior para comparar', 'no previous month to compare', 'sin mes anterior para comparar'],
    'cli.kpiToday': ['Acompanhamentos hoje', 'Follow-ups today', 'Seguimientos hoy'],
    'cli.kpiLate': ['{n} atrasados', '{n} overdue', '{n} atrasados'],
    'cli.kpiNoLate': ['nenhum atrasado', 'none overdue', 'ninguno atrasado'],
    'cli.kpiNextReturns': ['Próximos retornos', 'Upcoming returns', 'Próximos retornos'],
    'cli.kpiNextWeek': ['{n} nesta semana', '{n} this week', '{n} esta semana'],
    'cli.kpiInteractions': ['Interações realizadas', 'Interactions logged', 'Interacciones registradas'],
    'cli.kpiLastOn': ['última em {n}', 'last on {n}', 'última el {n}'],
    'cli.kpiRecent': ['Atividades recentes', 'Recent activity', 'Actividades recientes'],
    'cli.kpiLast30': ['nos últimos 30 dias', 'in the last 30 days', 'en los últimos 30 días'],
    'cli.kpiPending': ['Acompanhamentos pendentes', 'Pending follow-ups', 'Seguimientos pendientes'],
    'cli.kpiOneLate': ['há um atrasado', 'one is overdue', 'hay uno atrasado'],
    'cli.kpiSatisfaction': ['Satisfação média', 'Average satisfaction', 'Satisfacción media'],
    'cli.kpiOutOf5': ['de 5', 'out of 5', 'de 5'],
    'cli.kpiRatedOn': ['baseado no que você registrou', 'based on what you recorded', 'según lo que registraste'],
    'cli.noRatings': ['Sem avaliações', 'No ratings', 'Sin valoraciones'],
    'cli.noActivity': ['Nenhuma atividade', 'No activity', 'Ninguna actividad'],

    'cli.colClient': ['Cliente', 'Client', 'Cliente'],
    'cli.colSegment': ['Segmento', 'Segment', 'Segmento'],
    'cli.colStatus': ['Status', 'Status', 'Estado'],
    'cli.colLast': ['Último contato', 'Last contact', 'Último contacto'],
    'cli.colNext': ['Próximo contato', 'Next contact', 'Próximo contacto'],
    'cli.colTags': ['Tags', 'Tags', 'Etiquetas'],
    'cli.colOwner': ['Responsável', 'Owner', 'Responsable'],
    'cli.colActions': ['Ações', 'Actions', 'Acciones'],
    'cli.select': ['Selecionar', 'Select', 'Seleccionar'],
    'cli.openClient': ['Abrir {n}', 'Open {n}', 'Abrir {n}'],
    'cli.rowActions': ['Ações do cliente', 'Client actions', 'Acciones del cliente'],
    'cli.lateBy': ['atrasado', 'overdue', 'atrasado'],
    'cli.today': ['hoje', 'today', 'hoy'],
    'cli.tomorrow': ['amanhã', 'tomorrow', 'mañana'],
    'cli.yesterday': ['ontem', 'yesterday', 'ayer'],
    'cli.inDays': ['em {n} dias', 'in {n} days', 'en {n} días'],
    'cli.agoDays': ['há {n} dias', '{n} days ago', 'hace {n} días'],

    'cli.showingRange': ['Mostrando {a} a {b} de {n} clientes', 'Showing {a} to {b} of {n} clients', 'Mostrando {a} a {b} de {n} clientes'],
    'cli.prev': ['Anterior', 'Previous', 'Anterior'],
    'cli.next': ['Próxima', 'Next', 'Siguiente'],
    'cli.perPage': ['Linhas por página', 'Rows per page', 'Filas por página'],
    'cli.sortBy': ['Ordenar: {n}', 'Sort: {n}', 'Ordenar: {n}'],
    'cli.ordNewest': ['Mais recentes', 'Newest first', 'Más recientes'],
    'cli.ordOldest': ['Mais antigos', 'Oldest first', 'Más antiguos'],
    'cli.ordAZ': ['Nome de A a Z', 'Name A to Z', 'Nombre de A a Z'],
    'cli.ordZA': ['Nome de Z a A', 'Name Z to A', 'Nombre de Z a A'],
    'cli.ordLast': ['Último contato mais recente', 'Most recent contact', 'Contacto más reciente'],
    'cli.ordNext': ['Próximo contato mais próximo', 'Soonest next contact', 'Próximo contacto más cercano'],
    'cli.ordPriority': ['Maior prioridade', 'Highest priority', 'Mayor prioridad'],
    'cli.ordStatus': ['Status', 'Status', 'Estado'],

    'cli.emptyTitle': ['Sua carteira está vazia', 'Your portfolio is empty', 'Tu cartera está vacía'],
    'cli.emptyDesc': ['Cadastre o primeiro cliente para começar a acompanhar contatos, retornos e histórico.', 'Add your first client to start tracking contacts, returns and history.', 'Registra el primer cliente para empezar a seguir contactos, retornos e historial.'],
    'cli.emptyCta': ['Adicionar primeiro cliente', 'Add first client', 'Añadir primer cliente'],
    'cli.noResults': ['Nenhum cliente encontrado', 'No clients found', 'Ningún cliente encontrado'],
    'cli.noResultsDesc': ['Nenhum cliente atende à busca e aos filtros atuais.', 'No client matches the current search and filters.', 'Ningún cliente coincide con la búsqueda y los filtros actuales.'],
    'cli.notFound': ['Cliente não encontrado', 'Client not found', 'Cliente no encontrado'],
    'cli.notFoundDesc': ['Ele pode ter sido excluído, ou pertencer a outro espaço de trabalho.', 'It may have been deleted, or belong to another workspace.', 'Puede haber sido eliminado o pertenecer a otro espacio de trabajo.'],
    'cli.backToClients': ['Voltar para clientes', 'Back to clients', 'Volver a clientes'],

    'cli.quickSummary': ['Resumo rápido', 'Quick summary', 'Resumen rápido'],
    'cli.perMonth': ['Este mês', 'This month', 'Este mes'],
    'cli.per30': ['Últimos 30 dias', 'Last 30 days', 'Últimos 30 días'],
    'cli.per3m': ['Últimos 3 meses', 'Last 3 months', 'Últimos 3 meses'],
    'cli.perYear': ['Este ano', 'This year', 'Este año'],
    'cli.sumNew': ['Novos clientes', 'New clients', 'Nuevos clientes'],
    'cli.sumActive': ['Clientes ativos', 'Active clients', 'Clientes activos'],
    'cli.sumInactive': ['Inativos', 'Inactive', 'Inactivos'],
    'cli.sumWaiting': ['Aguardando retorno', 'Awaiting reply', 'Esperando respuesta'],
    'cli.sumPending': ['Acompanhamentos pendentes', 'Pending follow-ups', 'Seguimientos pendientes'],
    'cli.sumReturnRate': ['Taxa de retorno', 'Return rate', 'Tasa de retorno'],
    'cli.distByStatus': ['Distribuição por status', 'Distribution by status', 'Distribución por estado'],
    'cli.fullReport': ['Ver relatório completo', 'View full report', 'Ver informe completo'],

    'cli.nextActions': ['Próximas ações', 'Next actions', 'Próximas acciones'],
    'cli.noNextActions': ['Nenhum acompanhamento marcado.', 'No follow-up scheduled.', 'Ningún seguimiento programado.'],
    'cli.nextContactAction': ['Próximo contato', 'Next contact', 'Próximo contacto'],

    'cli.stActive': ['Ativo', 'Active', 'Activo'],
    'cli.stDeal': ['Em negociação', 'In negotiation', 'En negociación'],
    'cli.stWaiting': ['Aguardando retorno', 'Awaiting reply', 'Esperando respuesta'],
    'cli.stFollowing': ['Em acompanhamento', 'Being followed up', 'En seguimiento'],
    'cli.stInactive': ['Inativo', 'Inactive', 'Inactivo'],
    'cli.stClosed': ['Encerrado', 'Closed', 'Cerrado'],

    'cli.segTech': ['Tecnologia', 'Technology', 'Tecnología'],
    'cli.segConsulting': ['Consultoria', 'Consulting', 'Consultoría'],
    'cli.segHealth': ['Saúde', 'Healthcare', 'Salud'],
    'cli.segLegal': ['Jurídico', 'Legal', 'Jurídico'],
    'cli.segEducation': ['Educação', 'Education', 'Educación'],
    'cli.segRetail': ['Varejo', 'Retail', 'Comercio'],
    'cli.segMarketing': ['Marketing', 'Marketing', 'Marketing'],
    'cli.segAccounting': ['Contabilidade', 'Accounting', 'Contabilidad'],
    'cli.segServices': ['Serviços', 'Services', 'Servicios'],
    'cli.segEcommerce': ['E-commerce', 'E-commerce', 'Comercio electrónico'],
    'cli.segPerson': ['Pessoa física', 'Individual', 'Persona física'],
    'cli.segOther': ['Outro', 'Other', 'Otro'],

    'cli.typePerson': ['Pessoa física', 'Individual', 'Persona física'],
    'cli.typeCompany': ['Pessoa jurídica', 'Company', 'Persona jurídica'],
    'cli.typeFreelan': ['Profissional autônomo', 'Freelancer', 'Profesional autónomo'],
    'cli.typeOrg': ['Organização', 'Organization', 'Organización'],
    'cli.typeOther': ['Outro', 'Other', 'Otro'],

    'cli.prHigh': ['Alta', 'High', 'Alta'],
    'cli.prMedium': ['Média', 'Medium', 'Media'],
    'cli.prLow': ['Baixa', 'Low', 'Baja'],

    'cli.orRef': ['Indicação', 'Referral', 'Recomendación'],
    'cli.orSite': ['Site', 'Website', 'Sitio web'],
    'cli.orSocial': ['Redes sociais', 'Social media', 'Redes sociales'],
    'cli.orEvent': ['Evento', 'Event', 'Evento'],
    'cli.orAd': ['Anúncio', 'Ad', 'Anuncio'],
    'cli.orOutbound': ['Prospecção', 'Outbound', 'Prospección'],
    'cli.orOther': ['Outro', 'Other', 'Otro'],

    'cli.allStatus': ['Todos os status', 'All statuses', 'Todos los estados'],
    'cli.allSegments': ['Todos os segmentos', 'All segments', 'Todos los segmentos'],
    'cli.allTypes': ['Todos os tipos', 'All types', 'Todos los tipos'],
    'cli.allTypes2': ['Todos', 'All', 'Todos'],
    'cli.allPriorities': ['Todas', 'All', 'Todas'],
    'cli.allOrigins': ['Todas', 'All', 'Todas'],
    'cli.allTags': ['Todas as tags', 'All tags', 'Todas las etiquetas'],
    'cli.allOwners': ['Todos', 'All', 'Todos'],
    'cli.anyContact': ['Qualquer', 'Any', 'Cualquiera'],
    'cli.contactFilter': ['Contato', 'Contact', 'Contacto'],
    'cli.fLate': ['Acompanhamentos atrasados', 'Overdue follow-ups', 'Seguimientos atrasados'],
    'cli.fWeek': ['Retorno nesta semana', 'Return this week', 'Retorno esta semana'],
    'cli.fNoNext': ['Sem próximo contato', 'No next contact', 'Sin próximo contacto'],
    'cli.showArchived': ['Mostrar apenas arquivados', 'Show archived only', 'Mostrar solo archivados'],

    'cli.viewDetails': ['Ver detalhes', 'View details', 'Ver detalles'],
    'cli.editClient': ['Editar cliente', 'Edit client', 'Editar cliente'],
    'cli.changeStatus': ['Alterar status', 'Change status', 'Cambiar estado'],
    'cli.addTag': ['Adicionar tag', 'Add tag', 'Añadir etiqueta'],
    'cli.favorite': ['Favoritar', 'Add to favorites', 'Marcar favorito'],
    'cli.unfavorite': ['Desfavoritar', 'Remove from favorites', 'Quitar de favoritos'],
    'cli.duplicate': ['Duplicar', 'Duplicate', 'Duplicar'],
    'cli.duplicated': ['Cliente duplicado.', 'Client duplicated.', 'Cliente duplicado.'],
    'cli.copySuffix': ['(cópia)', '(copy)', '(copia)'],
    'cli.archive': ['Arquivar', 'Archive', 'Archivar'],
    'cli.unarchive': ['Desarquivar', 'Unarchive', 'Desarchivar'],
    'cli.archived': ['Cliente arquivado. Ele continua na busca por "Arquivados".', 'Client archived. It stays available under "Archived".', 'Cliente archivado. Sigue disponible en "Archivados".'],
    'cli.unarchived': ['Cliente desarquivado.', 'Client unarchived.', 'Cliente desarchivado.'],
    'cli.statusChanged': ['Status: {de} → {para}', 'Status: {de} → {para}', 'Estado: {de} → {para}'],
    'cli.statusSaved': ['Status atualizado.', 'Status updated.', 'Estado actualizado.'],
    'cli.tagLabel': ['Tag', 'Tag', 'Etiqueta'],
    'cli.tagHint': ['Ex.: VIP, Estratégico, Recorrente', 'E.g. VIP, Strategic, Recurring', 'Ej.: VIP, Estratégico, Recurrente'],
    'cli.tagAlready': ['Esta tag já está no cliente.', 'This tag is already on the client.', 'Esta etiqueta ya está en el cliente.'],
    'cli.tagLimit': ['Limite de 12 tags por cliente.', 'Limit of 12 tags per client.', 'Límite de 12 etiquetas por cliente.'],
    'cli.typeSomething': ['Escreva alguma coisa.', 'Type something.', 'Escribe algo.'],

    'cli.deleteQuestion': ['Excluir "{n}"?', 'Delete "{n}"?', '¿Eliminar "{n}"?'],
    'cli.deleteImpact': ['Saem junto: {lista}. As notas do quadro não são apagadas.', 'Also removed: {lista}. Board notes are not deleted.', 'También se eliminan: {lista}. Las notas del tablero no se borran.'],
    'cli.deleteNoImpact': ['Este cliente não tem histórico registrado.', 'This client has no recorded history.', 'Este cliente no tiene historial registrado.'],
    'cli.impactInteractions': ['{n} interações', '{n} interactions', '{n} interacciones'],
    'cli.impactDocs': ['{n} documentos', '{n} documents', '{n} documentos'],
    'cli.impactNotes': ['{n} notas ligadas', '{n} linked notes', '{n} notas vinculadas'],

    'cli.inFocus': ['Cliente em foco', 'Client in focus', 'Cliente en foco'],
    'cli.since': ['Desde {n}', 'Since {n}', 'Desde {n}'],
    'cli.quickNote': ['Nova nota', 'New note', 'Nueva nota'],
    'cli.quickTask': ['Nova tarefa', 'New task', 'Nueva tarea'],
    'cli.quickSchedule': ['Agendar', 'Schedule', 'Agendar'],
    'cli.quickEmail': ['Enviar e-mail', 'Send email', 'Enviar correo'],
    'cli.quickCall': ['Ligar', 'Call', 'Llamar'],
    'cli.quickProfile': ['Ver perfil', 'View profile', 'Ver perfil'],
    'cli.noEmail': ['Este cliente não tem e-mail cadastrado', 'This client has no email on file', 'Este cliente no tiene correo registrado'],
    'cli.noPhone': ['Este cliente não tem telefone cadastrado', 'This client has no phone on file', 'Este cliente no tiene teléfono registrado'],
    'cli.noteText': ['O que registrar', 'What to record', 'Qué registrar'],
    'cli.noteHint': ['Ex.: cliente pediu proposta revisada', 'E.g. client asked for a revised proposal', 'Ej.: el cliente pidió una propuesta revisada'],
    'cli.taskText': ['A tarefa', 'The task', 'La tarea'],
    'cli.taskHint': ['Ex.: enviar contrato revisado', 'E.g. send revised contract', 'Ej.: enviar contrato revisado'],

    'cli.scheduleFor': ['Agendar com {n}', 'Schedule with {n}', 'Agendar con {n}'],
    'cli.subject': ['Assunto', 'Subject', 'Asunto'],
    'cli.subjectHint': ['Ex.: Reunião de alinhamento', 'E.g. Alignment meeting', 'Ej.: Reunión de alineación'],
    'cli.subjectRequired': ['Diga do que se trata.', 'Say what it is about.', 'Indica de qué se trata.'],
    'cli.dateRequired': ['Escolha uma data válida.', 'Choose a valid date.', 'Elige una fecha válida.'],
    'cli.date': ['Data', 'Date', 'Fecha'],
    'cli.time': ['Horário', 'Time', 'Hora'],
    'cli.schedule': ['Agendar', 'Schedule', 'Agendar'],
    'cli.scheduled': ['Acompanhamento agendado.', 'Follow-up scheduled.', 'Seguimiento programado.'],
    'cli.nextFollowups': ['Próximos acompanhamentos', 'Upcoming follow-ups', 'Próximos seguimientos'],
    'cli.noFollowups': ['Nenhum acompanhamento marcado para este cliente.', 'No follow-up scheduled for this client.', 'Ningún seguimiento programado para este cliente.'],
    'cli.newFollowup': ['Criar acompanhamento', 'Create follow-up', 'Crear seguimiento'],
    'cli.viewCalendar': ['Ver calendário', 'View calendar', 'Ver calendario'],
    'cli.calendarOpened': ['Os acompanhamentos de {n} estão no calendário.', 'The follow-ups for {n} are in the calendar.', 'Los seguimientos de {n} están en el calendario.'],
    'cli.calendarHint': ['Os acompanhamentos aparecem no calendário do MyDesk.', 'Follow-ups appear in the MyDesk calendar.', 'Los seguimientos aparecen en el calendario de MyDesk.'],
    'cli.followupActions': ['Ações do acompanhamento', 'Follow-up actions', 'Acciones del seguimiento'],
    'cli.complete': ['Concluir', 'Complete', 'Completar'],
    'cli.reschedule': ['Reagendar', 'Reschedule', 'Reprogramar'],
    'cli.deleteFollowup': ['Excluir', 'Delete', 'Eliminar'],
    'cli.deleteFollowupQ': ['Excluir este acompanhamento?', 'Delete this follow-up?', '¿Eliminar este seguimiento?'],
    'cli.deleteFollowupDesc': ['O compromisso sai do calendário e o aviso por e-mail é cancelado.', 'The appointment leaves the calendar and the email reminder is cancelled.', 'La cita sale del calendario y el aviso por correo se cancela.'],
    'cli.followupDone': ['Acompanhamento concluído.', 'Follow-up completed.', 'Seguimiento completado.'],
    'cli.done': ['Concluído: {n}', 'Completed: {n}', 'Completado: {n}'],

    'cli.tabOverview': ['Visão geral', 'Overview', 'Vista general'],
    'cli.tabTimeline': ['Interações', 'Interactions', 'Interacciones'],
    'cli.tabActivity': ['Atividades', 'Activities', 'Actividades'],
    'cli.tabNotes': ['Observações', 'Notes', 'Observaciones'],
    'cli.newNote': ['Nova observação', 'New note', 'Nueva observación'],
    'cli.editNote': ['Editar observação', 'Edit note', 'Editar observación'],
    'cli.noNotes': ['Nenhuma observação escrita ainda.', 'No note written yet.', 'Ninguna observación escrita aún.'],
    'cli.noteAbout': ['A observação', 'The note', 'La observación'],
    'cli.noteAboutHint': ['Ex.: prefere ser chamada de manhã; não decide sem o sócio; pediu revisão do escopo antes de renovar', 'E.g. prefers morning calls; does not decide without the partner; asked for a scope review before renewing', 'Ej.: prefiere llamadas por la mañana; no decide sin el socio; pidió revisar el alcance antes de renovar'],
    'cli.deleteEntry': ['Excluir esta entrada', 'Delete this entry', 'Eliminar esta entrada'],
    'cli.deleteEntryQ': ['Excluir esta entrada?', 'Delete this entry?', '¿Eliminar esta entrada?'],
    'cli.deleteEntryDesc': ['Ela sai da linha do tempo deste cliente e não volta.', 'It leaves this client timeline and does not come back.', 'Sale de la línea de tiempo de este cliente y no vuelve.'],
    'cli.deleteNoteQ': ['Excluir esta observação?', 'Delete this note?', '¿Eliminar esta observación?'],
    'cli.deleteNoteDesc': ['Ela sai do histórico deste cliente e não volta.', 'It leaves this client history and does not come back.', 'Sale del historial de este cliente y no vuelve.'],
    'cli.pinnedNote': ['Nota fixa', 'Pinned note', 'Nota fija'],
    'cli.pinnedHint': ['O que vale sempre para este cliente, e que você quer ler antes de qualquer conversa.', 'What always applies to this client, and that you want to read before any conversation.', 'Lo que siempre vale para este cliente, y que quieres leer antes de cualquier conversación.'],
    'cli.edit': ['Editar', 'Edit', 'Editar'],
    'cli.write': ['Escrever', 'Write', 'Escribir'],
    'cli.satisfaction': ['Satisfação', 'Satisfaction', 'Satisfacción'],
    'cli.noRating': ['Sem avaliação', 'No rating', 'Sin valoración'],
    'cli.sat5': ['5 — ótima', '5 — great', '5 — excelente'],
    'cli.sat4': ['4 — boa', '4 — good', '4 — buena'],
    'cli.sat3': ['3 — regular', '3 — fair', '3 — regular'],
    'cli.sat2': ['2 — ruim', '2 — poor', '2 — mala'],
    'cli.sat1': ['1 — péssima', '1 — very poor', '1 — pésima'],
    'cli.lastInFuture': ['O último contato não pode estar no futuro.', 'The last contact cannot be in the future.', 'El último contacto no puede estar en el futuro.'],
    'cli.tabDocs': ['Documentos', 'Documents', 'Documentos'],
    'cli.tabData': ['Dados do cliente', 'Client data', 'Datos del cliente'],
    'cli.recentHistory': ['Histórico recente', 'Recent history', 'Historial reciente'],
    'cli.noActivityLogged': ['Nenhuma atividade registrada.', 'No activity recorded.', 'Ninguna actividad registrada.'],
    'cli.internalNotes': ['Observações internas', 'Internal notes', 'Notas internas'],
    'cli.logInteraction': ['Registrar interação', 'Log interaction', 'Registrar interacción'],
    'cli.whatHappened': ['O que aconteceu', 'What happened', 'Qué pasó'],
    'cli.type': ['Tipo', 'Type', 'Tipo'],
    'cli.by': ['por {n}', 'by {n}', 'por {n}'],

    'cli.inCall': ['Ligação', 'Call', 'Llamada'],
    'cli.inEmail': ['E-mail', 'Email', 'Correo'],
    'cli.inMeeting': ['Reunião', 'Meeting', 'Reunión'],
    'cli.inMessage': ['Mensagem', 'Message', 'Mensaje'],
    'cli.inNote': ['Nota', 'Note', 'Nota'],
    'cli.inTask': ['Tarefa', 'Task', 'Tarea'],
    'cli.inEvent': ['Evento', 'Event', 'Evento'],
    'cli.inStatus': ['Alteração de status', 'Status change', 'Cambio de estado'],
    'cli.inDoc': ['Documento', 'Document', 'Documento'],
    'cli.inForm': ['Formulário respondido', 'Form submitted', 'Formulario respondido'],

    'cli.fAll': ['Todas', 'All', 'Todas'],
    'cli.fPending': ['Pendentes', 'Pending', 'Pendientes'],
    'cli.fFuture': ['Futuras', 'Upcoming', 'Futuras'],
    'cli.fLate2': ['Atrasadas', 'Overdue', 'Atrasadas'],
    'cli.fDone': ['Concluídas', 'Completed', 'Completadas'],
    'cli.noActivities': ['Nenhuma atividade neste filtro.', 'No activity in this filter.', 'Ninguna actividad en este filtro.'],
    'cli.stDone': ['concluída', 'completed', 'completada'],
    'cli.stLate': ['atrasada', 'overdue', 'atrasada'],
    'cli.stFuture': ['futura', 'upcoming', 'futura'],

    'cli.uploadDoc': ['Enviar arquivo', 'Upload file', 'Subir archivo'],
    'cli.noDocs': ['Nenhum documento vinculado.', 'No document linked.', 'Ningún documento vinculado.'],
    'cli.docActions': ['Ações do documento', 'Document actions', 'Acciones del documento'],
    'cli.docView': ['Visualizar', 'View', 'Ver'],
    'cli.docRename': ['Renomear', 'Rename', 'Renombrar'],
    'cli.docName': ['Nome do arquivo', 'File name', 'Nombre del archivo'],
    'cli.docDescribe': ['Adicionar descrição', 'Add description', 'Añadir descripción'],
    'cli.docDesc': ['Descrição', 'Description', 'Descripción'],
    'cli.docRemove': ['Remover', 'Remove', 'Quitar'],
    'cli.docRemoveQ': ['Remover "{n}"?', 'Remove "{n}"?', '¿Quitar "{n}"?'],
    'cli.docRemoveDesc': ['O arquivo sai da ficha deste cliente.', 'The file leaves this client record.', 'El archivo sale de la ficha de este cliente.'],
    'cli.docAdded': ['Documento anexado', 'Document attached', 'Documento adjuntado'],

    'cli.name': ['Nome', 'Name', 'Nombre'],
    'cli.nameHint': ['Como você chama este cliente', 'What you call this client', 'Cómo llamas a este cliente'],
    'cli.nameRequired': ['O nome é obrigatório.', 'Name is required.', 'El nombre es obligatorio.'],
    'cli.company': ['Empresa', 'Company', 'Empresa'],
    'cli.contact': ['Contato principal', 'Main contact', 'Contacto principal'],
    'cli.email': ['E-mail', 'Email', 'Correo'],
    'cli.emailInvalid': ['E-mail inválido.', 'Invalid email.', 'Correo inválido.'],
    'cli.phone': ['Telefone', 'Phone', 'Teléfono'],
    'cli.phoneInvalid': ['Telefone muito curto.', 'Phone number too short.', 'Teléfono demasiado corto.'],
    'cli.cpfInvalid': ['CPF inválido.', 'Invalid CPF.', 'CPF inválido.'],
    'cli.cnpjInvalid': ['CNPJ inválido.', 'Invalid CNPJ.', 'CNPJ inválido.'],
    'cli.cepHint': ['Preenche cidade e estado', 'Fills in city and state', 'Rellena ciudad y estado'],
    'cli.cepInvalid': ['CEP deve ter 8 dígitos.', 'Postal code must have 8 digits.', 'El código postal debe tener 8 dígitos.'],
    'cli.dateInvalid': ['Data inválida.', 'Invalid date.', 'Fecha inválida.'],
    'cli.address': ['Endereço', 'Address', 'Dirección'],
    'cli.city': ['Cidade', 'City', 'Ciudad'],
    'cli.state': ['Estado', 'State', 'Estado'],
    'cli.clientType': ['Tipo de cliente', 'Client type', 'Tipo de cliente'],
    'cli.chooseType': ['Escolher', 'Choose', 'Elegir'],
    'cli.chooseSegment': ['Escolher', 'Choose', 'Elegir'],
    'cli.chooseOrigin': ['Escolher', 'Choose', 'Elegir'],
    'cli.origin': ['Origem', 'Origin', 'Origen'],
    'cli.priority': ['Prioridade', 'Priority', 'Prioridad'],
    'cli.ownerHint': ['Quem cuida desta conta', 'Who owns this account', 'Quién lleva esta cuenta'],
    'cli.tagsHint': ['Separe por vírgula', 'Separate with commas', 'Separa con comas'],
    'cli.description': ['Descrição', 'Description', 'Descripción'],
    'cli.registeredOn': ['Data de cadastro', 'Registered on', 'Fecha de registro'],
    'cli.formSub': ['Só o nome é obrigatório. O resto pode entrar depois, conforme a relação avança.', 'Only the name is required. The rest can come later, as the relationship develops.', 'Solo el nombre es obligatorio. El resto puede entrar después, según avance la relación.'],
    'cli.createClient': ['Cadastrar cliente', 'Create client', 'Registrar cliente'],
    'cli.saveChanges': ['Salvar alterações', 'Save changes', 'Guardar cambios'],
    'cli.created': ['Cliente cadastrado.', 'Client created.', 'Cliente registrado.'],
    'cli.saved': ['Cliente atualizado.', 'Client updated.', 'Cliente actualizado.'],

    'cli.reportTitle': ['Relatório da carteira', 'Portfolio report', 'Informe de la cartera'],
    'cli.repGrowth': ['Crescimento da carteira', 'Portfolio growth', 'Crecimiento de la cartera'],
    'cli.repTotal': ['Total na carteira', 'Total in portfolio', 'Total en la cartera'],
    'cli.repByStatus': ['Por status', 'By status', 'Por estado'],
    'cli.repBySegment': ['Por segmento', 'By segment', 'Por segmento'],
    'cli.repEngagement': ['Interações e acompanhamentos', 'Interactions and follow-ups', 'Interacciones y seguimientos'],
    'cli.repInteractions': ['Interações registradas', 'Interactions logged', 'Interacciones registradas'],
    'cli.repByOwner': ['Por responsável', 'By owner', 'Por responsable'],
    'cli.noOwner': ['Sem responsável', 'No owner', 'Sin responsable'],
    'app.shortcuts': ['Atalhos', 'Shortcuts', 'Atajos'],
    'app.shortcutsHint': ['Atalhos da conta', 'Account shortcuts', 'Atajos de la cuenta'],
    'app.language': ['Idioma', 'Language', 'Idioma'],
    'app.deleteStack': ['Excluir pasta', 'Delete folder', 'Eliminar carpeta'],
    'app.stackNoName': ['Pasta sem nome', 'Untitled folder', 'Carpeta sin nombre'],
    'app.deleteStackQuestion': ['Excluir a pasta "{name}"?', 'Delete the folder "{name}"?', '¿Eliminar la carpeta "{name}"?'],
    'app.deleteStackDesc': ['As {n} notas de dentro voltam para o quadro. Nenhuma nota é apagada.', 'The {n} notes inside go back to the board. No note is deleted.', 'Las {n} notas de dentro vuelven al tablero. Ninguna nota se elimina.'],
    'app.deleteStackOk': ['Excluir pasta', 'Delete folder', 'Eliminar carpeta'],
    'app.stackDissolved': ['Pasta "{name}" excluída. As notas voltaram para o quadro.', 'Folder "{name}" deleted. The notes went back to the board.', 'Carpeta "{name}" eliminada. Las notas volvieron al tablero.'],
    'app.stackDeleted': ['Pasta "{name}" excluída.', 'Folder "{name}" deleted.', 'Carpeta "{name}" eliminada.'],
    'app.expCatPeople': ['Pessoal e encargos', 'Payroll and charges', 'Personal y cargas'],
    'app.expCatOffice': ['Estrutura e aluguel', 'Premises and rent', 'Estructura y alquiler'],
    'app.expCatTools': ['Ferramentas e assinaturas', 'Tools and subscriptions', 'Herramientas y suscripciones'],
    'app.expCatTax': ['Impostos e taxas', 'Taxes and fees', 'Impuestos y tasas'],
    'app.expCatMarketing': ['Marketing', 'Marketing', 'Marketing'],
    'app.expCatOutsourced': ['Terceiros e fornecedores', 'Contractors and suppliers', 'Terceros y proveedores'],
    'app.expCatOther': ['Outros', 'Other', 'Otros'],
    'app.expNeedsBoth': ['A despesa precisa de descrição e valor.', 'The expense needs a description and an amount.', 'El gasto necesita descripcion e importe.'],
    'app.expSaveError': ['Erro ao salvar a despesa.', 'Error saving the expense.', 'Error al guardar el gasto.'],
    'app.expTitle': ['Despesas do quadro', 'Board expenses', 'Gastos del tablero'],
    'app.expSub': ['O que sai — para o relatório mostrar resultado, e não só faturamento.', 'What goes out — so the report shows profit, not just revenue.', 'Lo que sale — para que el informe muestre resultado, y no solo facturacion.'],
    'app.expIn': ['ENTROU', 'CAME IN', 'ENTRO'],
    'app.expOut': ['SAIU', 'WENT OUT', 'SALIO'],
    'app.expLeft': ['SOBROU', 'LEFT OVER', 'SOBRO'],
    'app.expMargin': ['MARGEM', 'MARGIN', 'MARGEN'],
    'app.expWhat': ['O que foi', 'What it was', 'Que fue'],
    'app.expHowMuch': ['Quanto', 'How much', 'Cuanto'],
    'app.expAdd': ['Lançar', 'Add', 'Registrar'],
    'app.expFixed': ['fixa', 'fixed', 'fija'],
    'app.expEmpty': ['Nenhuma despesa lançada em {mes}.', 'No expenses recorded in {mes}.', 'Ningun gasto registrado en {mes}.'],
    'app.prevMonth': ['Mês anterior', 'Previous month', 'Mes anterior'],
    'app.cashTitle': ['Fluxo de caixa projetado', 'Projected cash flow', 'Flujo de caja proyectado'],
    'app.cashStepWeek': ['Semanal', 'Weekly', 'Semanal'],
    'app.cashStepMonth': ['Mensal', 'Monthly', 'Mensual'],
    'app.cashStepBiMonth': ['Bimestral', 'Every 2 months', 'Bimestral'],
    'app.cashStepQuarter': ['Trimestral', 'Quarterly', 'Trimestral'],
    'app.cashStepHalf': ['Semestral', 'Half-yearly', 'Semestral'],
    'app.cashStepYear': ['Anual', 'Yearly', 'Anual'],
    'app.cashInRange': ['NO PERÍODO', 'IN THE RANGE', 'EN EL PERIODO'],
    'app.cashAfter': ['DEPOIS', 'AFTER', 'DESPUES'],
    'app.cashEmptyRanges': ['{n} de {total} colunas não têm nada combinado para entrar.', '{n} of {total} columns have nothing agreed to come in.', '{n} de {total} columnas no tienen nada acordado para entrar.'],
    'app.cashSubGeneric': ['O que está combinado para entrar, no passo que você escolher.', 'What is agreed to come in, at the step you choose.', 'Lo que esta acordado para entrar, en el paso que elijas.'],
    'app.cashSub': ['O que está combinado para entrar nas próximas 12 semanas.', 'What is agreed to come in over the next 12 weeks.', 'Lo que esta acordado para entrar en las proximas 12 semanas.'],
    'app.cashIn12': ['NAS 12 SEMANAS', 'OVER 12 WEEKS', 'EN 12 SEMANAS'],
    'app.cashLate': ['JÁ VENCIDO', 'ALREADY OVERDUE', 'YA VENCIDO'],
    'app.cashNoDate': ['SEM VENCIMENTO', 'NO DUE DATE', 'SIN VENCIMIENTO'],
    'app.cashLater': ['DEPOIS DAS 12', 'BEYOND 12 WEEKS', 'DESPUES DE LAS 12'],
    'app.cashToCome': ['A receber', 'To come in', 'A recibir'],
    'app.cashOverdue': ['Vencido e não pago', 'Overdue and unpaid', 'Vencido y no pagado'],
    'app.cashEmptyWeeks': ['{n} das 12 semanas não têm nada combinado para entrar.', '{n} of the 12 weeks have nothing agreed to come in.', '{n} de las 12 semanas no tienen nada acordado para entrar.'],
    'app.cashNoDateNote': ['{valor} não têm data de vencimento e por isso não aparecem em semana nenhuma.', '{valor} have no due date and so appear in no week.', '{valor} no tienen fecha de vencimiento y por eso no aparecen en ninguna semana.'],
    'app.cashDisclaimer': ['Isto é o que está combinado, não o que vai acontecer: o app não sabe quem vai pagar.', 'This is what is agreed, not what will happen: the app does not know who will pay.', 'Esto es lo acordado, no lo que va a pasar: la app no sabe quien va a pagar.'],
    'app.repeatNone': ['Não se repete', 'Does not repeat', 'No se repite'],
    'app.repeatWeekly': ['Toda semana', 'Every week', 'Cada semana'],
    'app.repeatBiweekly': ['A cada 15 dias', 'Every 15 days', 'Cada 15 dias'],
    'app.repeatMonthly': ['Todo mês', 'Every month', 'Cada mes'],
    'app.repeatBimonthly': ['A cada 2 meses', 'Every 2 months', 'Cada 2 meses'],
    'app.repeatQuarterly': ['A cada 3 meses', 'Every 3 months', 'Cada 3 meses'],
    'app.repeatYearly': ['Todo ano', 'Every year', 'Cada ano'],
    'app.repeatLabel': ['Se repete?', 'Repeats?', 'Se repite?'],
    'app.repeatUntil': ['Até quando', 'Until when', 'Hasta cuando'],
    'app.repeatNeedsDue': ['Informe a data de vencimento acima: é dela que sai a primeira parcela.', 'Fill in the due date above: the first instalment comes from it.', 'Completa la fecha de vencimiento arriba: de ella sale la primera cuota.'],
    'app.repeatNeedsUntil': ['Informe até quando o contrato vai.', 'Say how far the contract goes.', 'Indica hasta cuando va el contrato.'],
    'app.repeatTooShort': ['Neste intervalo cabe uma parcela só — não há o que repetir.', 'Only one instalment fits in this range — there is nothing to repeat.', 'En este intervalo cabe una sola cuota — no hay que repetir.'],
    'app.repeatWillCreate': ['{n} parcelas de {valor}, de {de} até {ate}.', '{n} instalments of {valor}, from {de} through {ate}.', '{n} cuotas de {valor}, de {de} hasta {ate}.'],
    'app.repeatCreated': ['{n} parcelas criadas.', '{n} instalments created.', '{n} cuotas creadas.'],
    'app.repeatHitLimit': ['Criei {n} de {total} parcelas — o limite do plano foi atingido.', 'I created {n} of {total} instalments — the plan limit was reached.', 'Cree {n} de {total} cuotas — se alcanzo el limite del plan.'],
    'app.repeatPartOf': ['Parcela {n} de {total} — {como}, até {ate}', 'Instalment {n} of {total} — {como}, through {ate}', 'Cuota {n} de {total} — {como}, hasta {ate}'],
    'app.repeatPartOfShort': ['Parcela {n} de {total}', 'Instalment {n} of {total}', 'Cuota {n} de {total}'],
    'app.deleteSeries': ['Excluir as {n} seguintes', 'Delete the next {n}', 'Eliminar las {n} siguientes'],
    'app.deleteSeriesDesc': ['Esta é a parcela {n} de {total}. As anteriores não são tocadas.', 'This is instalment {n} of {total}. The earlier ones are left alone.', 'Esta es la cuota {n} de {total}. Las anteriores no se tocan.'],
    'app.seriesDeleted': ['{n} parcelas removidas.', '{n} instalments removed.', '{n} cuotas eliminadas.'],
    'app.dunAction': ['Cobrar por e-mail', 'Send a payment reminder', 'Cobrar por correo'],
    'app.dunTitle': ['Cobrar {nome}', 'Remind {nome}', 'Cobrar a {nome}'],
    'app.dunSubOverdue': ['Em aberto há {dias} dias.', 'Outstanding for {dias} days.', 'Pendiente hace {dias} dias.'],
    'app.dunSubOnTime': ['Ainda dentro do prazo — este é um lembrete.', 'Still within the due date — this is a reminder.', 'Aun dentro del plazo — esto es un recordatorio.'],
    'app.dunAmount': ['EM ABERTO', 'OUTSTANDING', 'PENDIENTE'],
    'app.dunDueDate': ['VENCIMENTO', 'DUE DATE', 'VENCIMIENTO'],
    'app.dunTo': ['PARA', 'TO', 'PARA'],
    'app.dunNoEmailShort': ['sem e-mail na ficha', 'no email on file', 'sin correo en la ficha'],
    'app.dunLastSent': ['A última cobrança deste registro saiu em {data}.', 'The last reminder for this record went out on {data}.', 'El ultimo cobro de este registro salio el {data}.'],
    'app.dunClientEmail': ['E-mail do cliente', 'Client email', 'Correo del cliente'],
    'app.dunNote': ['Recado (opcional)', 'Note (optional)', 'Recado (opcional)'],
    'app.dunNotePh': ['ex.: combinamos o pagamento para esta semana — consegue confirmar?', 'e.g. we agreed on payment this week — can you confirm?', 'ej.: acordamos el pago para esta semana — puedes confirmar?'],
    'app.dunPreview': ['O que vai ser enviado', 'What will be sent', 'Lo que se enviara'],
    'app.dunCopy': ['Copiar o texto', 'Copy the text', 'Copiar el texto'],
    'app.dunSend': ['Enviar por e-mail', 'Send by email', 'Enviar por correo'],
    'app.dunCopied': ['Texto copiado.', 'Text copied.', 'Texto copiado.'],
    'app.dunCopyFailed': ['O navegador não deixou copiar. Selecione o texto acima e copie à mão.', 'The browser blocked the copy. Select the text above and copy it by hand.', 'El navegador no dejo copiar. Selecciona el texto y copialo a mano.'],
    'app.dunCheckEmail': ['Confira o e-mail do cliente.', 'Check the client email.', 'Revisa el correo del cliente.'],
    'app.dunSent': ['Cobrança enviada para {email}.', 'Reminder sent to {email}.', 'Cobro enviado a {email}.'],
    'app.dunFailed': ['Não consegui enviar agora.', 'I could not send it right now.', 'No pude enviarlo ahora.'],
    'app.dunNothingDue': ['{nome} não tem valor em aberto.', '{nome} has nothing outstanding.', '{nome} no tiene importe pendiente.'],
    'app.dunHi': ['Olá, {nome}!', 'Hi, {nome}!', 'Hola, {nome}!'],
    'app.dunOverdue': ['Passando para lembrar de {valor}, com vencimento em {data} — {dias} dias atrás.', 'A reminder about {valor}, due on {data} — {dias} days ago.', 'Un recordatorio de {valor}, con vencimiento el {data} — hace {dias} dias.'],
    'app.dunDue': ['Passando para lembrar de {valor}, com vencimento em {data}.', 'A reminder about {valor}, due on {data}.', 'Un recordatorio de {valor}, con vencimiento el {data}.'],
    'app.dunNoDate': ['Passando para lembrar de {valor}, ainda em aberto.', 'A reminder about {valor}, still outstanding.', 'Un recordatorio de {valor}, aun pendiente.'],
    'app.dunPartial': ['Deste contrato de {total}, já recebemos {pago} — resta o valor acima.', 'Of this {total} contract, {pago} has come in — the amount above is what remains.', 'De este contrato de {total}, ya recibimos {pago} — resta el importe de arriba.'],
    'app.dunAbout': ['Referente a: {ref}', 'For: {ref}', 'Referente a: {ref}'],
    'app.dunClose': ['Se já tiver sido pago, é só desconsiderar e me avisar. Qualquer dúvida, estou à disposição.', 'If it has already been paid, please disregard this and let me know. Any questions, I am here.', 'Si ya fue pagado, ignora este mensaje y avisame. Cualquier duda, estoy a disposicion.'],
    'app.receiptReady': ['Recibo nº {n} pronto', 'Receipt no. {n} is ready', 'Recibo nº {n} listo'],
    'app.receiptReadySub': ['O recibo tem duas linhas de assinatura: a sua e a de {nome}.', 'The receipt has two signature lines: yours and {nome}.', 'El recibo tiene dos lineas de firma: la tuya y la de {nome}.'],
    'app.receiptDownload': ['Baixar o PDF', 'Download the PDF', 'Descargar el PDF'],
    'app.receiptDownloadSub': ['Para imprimir e colher a assinatura na mão, ou anexar você mesmo.', 'To print and collect the signature by hand, or attach it yourself.', 'Para imprimir y recoger la firma a mano, o adjuntarlo tu mismo.'],
    'app.receiptSend': ['Enviar para {nome} assinar', 'Send to {nome} to sign', 'Enviar a {nome} para firmar'],
    'app.receiptSendSub': ['Vai anexado para {email}.', 'It goes attached to {email}.', 'Va adjunto a {email}.'],
    'app.receiptNoEmail': ['Este cliente não tem e-mail na ficha. Informe um em "Editar" para enviar daqui.', 'This client has no email on file. Add one under "Edit" to send from here.', 'Este cliente no tiene correo en la ficha. Agrega uno en "Editar" para enviar desde aqui.'],
    'app.receiptDone': ['Recibo gerado.', 'Receipt generated.', 'Recibo generado.'],
    'app.receiptSent': ['Recibo enviado para {email}.', 'Receipt sent to {email}.', 'Recibo enviado a {email}.'],
    'app.receiptSendFailed': ['Não consegui enviar agora.', 'I could not send it right now.', 'No pude enviarlo ahora.'],
    'app.receiptEmailPh': ['para enviar o recibo', 'to send the receipt', 'para enviar el recibo'],
    'app.receiptCheckEmail': ['Confira o e-mail do cliente.', 'Check the client email.', 'Revisa el correo del cliente.'],
    'app.receiptReplyToPh': ['o seu e-mail de trabalho — é para cá que o cliente devolve o recibo assinado', 'your work email — this is where the client sends the signed receipt back', 'tu correo de trabajo — es a donde el cliente devuelve el recibo firmado'],
    'app.receiptCheckReplyTo': ['Confira o seu e-mail para a via assinada.', 'Check your email for the signed copy.', 'Revisa tu correo para la via firmada.'],
    'app.recordNotFound': ['Registro não encontrado.', 'Record not found.', 'Registro no encontrado.'],
    'app.receiptDescPlaceholder': [
      'ex.: honorários advocatícios referentes ao processo nº …',
      'e.g.: legal fees for case no. …',
      'ej.: honorarios legales del expediente n.º …',
    ],
    'app.imageReadError': [
      'Não foi possível ler essa imagem.',
      'Could not read that image.',
      'No se pudo leer esa imagen.',
    ],
    'app.clientNotInList': [
      'Esse cliente não está mais na lista.',
      'That client is no longer on the list.',
      'Ese cliente ya no está en la lista.',
    ],

    'app.sendError': [
      'Não foi possível enviar.',
      'Could not send it.',
      'No se pudo enviar.',
    ],
    'app.messageSendError': [
      'Não foi possível enviar a mensagem. Tente novamente.',
      'Could not send the message. Try again.',
      'No se pudo enviar el mensaje. Inténtalo de nuevo.',
    ],
    'app.fileShareError': [
      'Erro ao compartilhar arquivo.',
      'Could not share the file.',
      'No se pudo compartir el archivo.',
    ],
    'app.workspaceSharedRestored': [
      'Workspace compartilhado restaurado.',
      'Shared workspace restored.',
      'Espacio compartido restaurado.',
    ],
    'app.unsupportedFilePreview': [
      'Pré-visualização não disponível para arquivos <strong>.{extension}</strong>',
      'Preview is not available for <strong>.{extension}</strong> files',
      'La vista previa no está disponible para archivos <strong>.{extension}</strong>',
    ],
    'app.htmlAttachmentPremium': [
      'Anexar páginas HTML é exclusivo do Premium.',
      'Attaching HTML pages is exclusive to Premium.',
      'Adjuntar páginas HTML es exclusivo de Premium.',
    ],
    'app.fileTypeUnsafe': [
      '"{name}" — tipo de arquivo não permitido por segurança.',
      '“{name}” — this file type is not allowed for security reasons.',
      '«{name}» — este tipo de archivo no está permitido por seguridad.',
    ],
    'app.animatedBackgroundPremium': [
      'Este fundo animado é exclusivo do Premium.',
      'This animated background is exclusive to Premium.',
      'Este fondo animado es exclusivo de Premium.',
    ],
    'app.videoBackgroundPremium': [
      'Este fundo em vídeo é exclusivo do Premium.',
      'This video background is exclusive to Premium.',
      'Este fondo de video es exclusivo de Premium.',
    ],

    'app.paymentDetected': [
      'Pagamento detectado! Aguarde a confirmação (pode levar até 1 min).',
      'Payment detected! Please wait for confirmation (it may take up to 1 min).',
      '¡Pago detectado! Espera la confirmación (puede tardar hasta 1 min).',
    ],
    'app.premiumActivated': [
      'Premium ativado com sucesso!',
      'Premium activated successfully!',
      '¡Premium activado correctamente!',
    ],
    'app.activationProcessing': [
      'Ativação em processamento. Atualize a página em alguns instantes.',
      'Activation is being processed. Refresh the page in a few moments.',
      'La activación está en proceso. Actualiza la página en unos instantes.',
    ],
    'app.checkoutCancelled': [
      'Checkout cancelado. Nenhuma cobrança foi feita.',
      'Checkout canceled. No charge was made.',
      'Pago cancelado. No se realizó ningún cobro.',
    ],
    'app.premiumPlanActive': ['Plano Premium ativo', 'Premium plan active', 'Plan Premium activo'],
    'app.planExtendedUntil': ['Plano estendido até {date}.', 'Plan extended until {date}.', 'Plan extendido hasta {date}.'],
    'app.premiumOnlySuffix': [
      ' — exclusivo do Premium',
      ' — Premium only',
      ' — exclusivo de Premium',
    ],
    'app.gradientPremiumOnly': [
      'Cores em gradiente são exclusivas do Premium.',
      'Gradient colors are exclusive to Premium.',
      'Los colores degradados son exclusivos de Premium.',
    ],
    'app.fileLimit': [
      '"{name}" tem {size} — o limite por arquivo é {limit}{suffix}',
      '“{name}” is {size}—the per-file limit is {limit}{suffix}',
      '«{name}» tiene {size}; el límite por archivo es {limit}{suffix}',
    ],
    'app.freePlanSuffix': [' no plano gratuito.', ' on the free plan.', ' en el plan gratuito.'],
    'app.noStorageSpace': [
      'Sem espaço: a conta usa {used} de {limit}.',
      'No storage space: the account uses {used} of {limit}.',
      'Sin espacio: la cuenta usa {used} de {limit}.',
    ],
    'app.trialBadgeDay': ['🎁 {count} dia', '🎁 {count} day', '🎁 {count} día'],
    'app.trialBadgeDays': ['🎁 {count} dias', '🎁 {count} days', '🎁 {count} días'],
    'app.trialTooltipDay': [
      'Teste grátis: tudo liberado por mais {count} dia. Depois, os recursos exclusivos voltam a pedir Premium.',
      'Free trial: everything is unlocked for {count} more day. After that, Premium-only features will be locked again.',
      'Prueba gratis: todo estará disponible durante {count} día más. Después, las funciones exclusivas volverán a requerir Premium.',
    ],
    'app.trialTooltipDays': [
      'Teste grátis: tudo liberado por mais {count} dias. Depois, os recursos exclusivos voltam a pedir Premium.',
      'Free trial: everything is unlocked for {count} more days. After that, Premium-only features will be locked again.',
      'Prueba gratis: todo estará disponible durante {count} días más. Después, las funciones exclusivas volverán a requerir Premium.',
    ],
    'app.limitReached': ['🔒 Limite atingido', '🔒 Limit reached', '🔒 Límite alcanzado'],
    'app.itemsLimitReached': [
      'Limite de {limit} itens atingido. Faça upgrade!',
      'The {limit}-item limit has been reached. Upgrade your plan!',
      'Alcanzaste el límite de {limit} elementos. ¡Mejora tu plan!',
    ],
    'app.notesUsedMonth': [
      '{used} de {limit} notas usadas este mês',
      '{used} of {limit} notes used this month',
      '{used} de {limit} notas usadas este mes',
    ],
    'app.premiumUnlockTitle': [
      'Desbloqueie o<br><span class="hl">poder total.</span>',
      'Unlock the<br><span class="hl">full power.</span>',
      'Desbloquea<br><span class="hl">todo el poder.</span>',
    ],
    'app.premiumDescription': [
      'Crie notas ilimitadas, sem restrições mensais. Acesso completo a todos os workspaces.',
      'Create unlimited notes with no monthly restrictions. Get full access to every workspace.',
      'Crea notas ilimitadas sin restricciones mensuales. Accede por completo a todos los espacios.',
    ],
    'app.premiumActiveUntil': [
      '✓ Plano Premium ativo até {date}',
      '✓ Premium plan active until {date}',
      '✓ Plan Premium activo hasta {date}',
    ],
    'app.premiumActiveNoDate': ['✓ Plano Premium ativo', '✓ Premium plan active', '✓ Plan Premium activo'],
    'app.subscriptionRenews': [
      'Sua assinatura renova automaticamente. Você pode gerenciá-la a qualquer momento.',
      'Your subscription renews automatically. You can manage it at any time.',
      'Tu suscripción se renueva automáticamente. Puedes gestionarla en cualquier momento.',
    ],
    'app.subscriptionMigrationPreserves': [
      'Seu período já pago será preservado ao migrar para a assinatura Stripe.',
      'Your paid period will be preserved when you move to a Stripe subscription.',
      'Tu período pagado se conservará al migrar a la suscripción de Stripe.',
    ],
    'app.trialModalDay': [
      '🎁 Teste grátis — tudo liberado por mais {count} dia.',
      '🎁 Free trial — everything is unlocked for {count} more day.',
      '🎁 Prueba gratis: todo disponible durante {count} día más.',
    ],
    'app.trialModalDays': [
      '🎁 Teste grátis — tudo liberado por mais {count} dias.',
      '🎁 Free trial — everything is unlocked for {count} more days.',
      '🎁 Prueba gratis: todo disponible durante {count} días más.',
    ],
    'app.subscribeBeforeTrialEnds': [
      'Assinando agora você não perde o acesso quando o prazo acabar.',
      'Subscribe now to keep your access when the trial ends.',
      'Suscríbete ahora para conservar el acceso cuando termine la prueba.',
    ],
    'app.notesCreatedMonth': ['Notas criadas este mês', 'Notes created this month', 'Notas creadas este mes'],
    'app.featureUnlimited': ['Notas e workspaces ilimitados', 'Unlimited notes and workspaces', 'Notas y espacios ilimitados'],
    'app.featureCrmPdf': ['CRM Financeiro e relatório em PDF', 'Financial CRM and PDF reports', 'CRM financiero e informes en PDF'],
    'app.featureGroupCall': ['Workspaces de grupo e chamada com 6', 'Group workspaces and calls for 6', 'Espacios grupales y llamadas para 6'],
    'app.featureStorage': ['Anexos de 5 MB · 1 GB de espaço', '5 MB attachments · 1 GB storage', 'Adjuntos de 5 MB · 1 GB de espacio'],
    'app.featureVideoBackgrounds': ['Biblioteca completa de fundos em vídeo', 'Complete video background library', 'Biblioteca completa de fondos de video'],
    'app.featurePrioritySupport': ['Suporte prioritário', 'Priority support', 'Soporte prioritario'],
    'app.stripeSubscription': ['Assinatura Stripe', 'Stripe subscription', 'Suscripción de Stripe'],
    'app.manageSubscription': ['Gerenciar assinatura →', 'Manage subscription →', 'Gestionar suscripción →'],
    'app.stripePortalNote': [
      'No portal seguro da Stripe você pode atualizar a forma de pagamento, ver cobranças e cancelar a renovação.',
      'In Stripe’s secure portal, you can update your payment method, view charges, and cancel renewal.',
      'En el portal seguro de Stripe puedes actualizar el método de pago, ver cobros y cancelar la renovación.',
    ],
    'app.migrateRecurring': ['Migrar para assinatura recorrente', 'Move to a recurring subscription', 'Migrar a una suscripción recurrente'],
    'app.billedMonthly': ['cobrados por mês', 'billed monthly', 'cobrados al mes'],
    'app.saveMoney': ['Economize R$ 40', 'Save R$ 40', 'Ahorra R$ 40'],
    'app.billedAnnual': ['cobrados por ano · R$ 16,67/mês', 'billed yearly · R$ 16.67/month', 'cobrados al año · R$ 16,67/mes'],
    'app.stripeSecureCheckout': ['Checkout seguro processado pela Stripe', 'Secure checkout processed by Stripe', 'Pago seguro procesado por Stripe'],
    'app.subscribeMonthly': ['Assinar por R$ 19,99/mês →', 'Subscribe for R$ 19.99/month →', 'Suscribirse por R$ 19,99/mes →'],
    'app.subscribeAnnual': ['Assinar por R$ 199,99/ano →', 'Subscribe for R$ 199.99/year →', 'Suscribirse por R$ 199,99/año →'],
    'app.recurringActivation': [
      'A assinatura é recorrente e o Premium é ativado automaticamente após a confirmação.',
      'The subscription is recurring and Premium is activated automatically after confirmation.',
      'La suscripción es recurrente y Premium se activa automáticamente tras la confirmación.',
    ],
    'app.monthlyCharge': ['R$ 19,99 cobrados a cada mês.', 'R$ 19.99 billed every month.', 'R$ 19,99 cobrados cada mes.'],
    'app.annualCharge': ['R$ 199,99 cobrados a cada ano.', 'R$ 199.99 billed every year.', 'R$ 199,99 cobrados cada año.'],
    'app.cancelPortal': ['Cancele quando quiser no Portal do Cliente.', 'Cancel anytime in the Customer Portal.', 'Cancela cuando quieras en el Portal del Cliente.'],
    'app.terms': ['Termos', 'Terms', 'Términos'],
    'app.privacy': ['Privacidade', 'Privacy', 'Privacidad'],
    'app.signInToSubscribe': ['Entre na sua conta para assinar', 'Sign in to subscribe', 'Inicia sesión para suscribirte'],
    'app.paymentUnavailable': ['Serviço de pagamento indisponível', 'Payment service unavailable', 'Servicio de pago no disponible'],
    'app.invalidPaymentResponse': ['Resposta de pagamento inválida', 'Invalid payment response', 'Respuesta de pago no válida'],
    'app.invalidStripeAddress': ['Endereço Stripe inválido', 'Invalid Stripe address', 'Dirección de Stripe no válida'],
    'app.openingPortal': ['Abrindo portal…', 'Opening portal…', 'Abriendo portal…'],
    'app.retryPortal': ['Tentar abrir o portal novamente', 'Try opening the portal again', 'Intentar abrir el portal de nuevo'],
    'app.openingCheckout': ['Abrindo checkout seguro…', 'Opening secure checkout…', 'Abriendo pago seguro…'],
    'app.premiumCelebrationTitle': ['Premium Ativado!', 'Premium Activated!', '¡Premium activado!'],
    'app.premiumCelebrationBody': [
      'Seu pagamento foi confirmado. Agora você tem <b>notas ilimitadas</b> e acesso completo a todos os recursos. ⭐',
      'Your payment was confirmed. You now have <b>unlimited notes</b> and full access to every feature. ⭐',
      'Tu pago fue confirmado. Ahora tienes <b>notas ilimitadas</b> y acceso completo a todas las funciones. ⭐',
    ],
    'app.letsGo': ['Vamos lá!', 'Let’s go!', '¡Vamos!'],

    'app.formSignIn': [
      'Entre na sua conta para criar um formulário.',
      'Sign in to create a form.',
      'Inicia sesión para crear un formulario.',
    ],
    'app.fieldShortText': ['Texto curto', 'Short text', 'Texto corto'],
    'app.fieldEmail': ['E-mail', 'Email', 'Correo'],
    'app.fieldPhone': ['Telefone', 'Phone', 'Teléfono'],
    'app.fieldCpf': ['CPF', 'CPF', 'CPF'],
    'app.fieldRgIe': ['RG / IE', 'ID / State reg.', 'DNI / Reg. estatal'],
    'app.fieldGender': ['Gênero', 'Gender', 'Género'],
    'app.fieldNationality': ['Nacionalidade', 'Nationality', 'Nacionalidad'],
    'app.fieldProfession': ['Profissão', 'Profession', 'Profesión'],
    'app.fieldOccupationRole': ['Ocupação / cargo', 'Occupation / role', 'Ocupación / cargo'],
    'app.fieldMotherName': ['Nome da mãe', "Mother's name", 'Nombre de la madre'],
    'app.fieldFatherName': ['Nome do pai', "Father's name", 'Nombre del padre'],
    'app.fieldPlaceOfBirth': ['Naturalidade', 'Place of birth', 'Lugar de nacimiento'],
    'app.fieldCompanyName': ['Razão social', 'Legal name', 'Razón social'],
    'app.fieldTradeName': ['Nome fantasia', 'Trade name', 'Nombre comercial'],
    'app.fieldSecondaryEmail': ['E-mail secundário', 'Secondary email', 'Correo secundario'],
    'app.fieldWhatsapp': ['WhatsApp', 'WhatsApp', 'WhatsApp'],
    'app.fieldWebsiteSocial': ['Site / redes sociais', 'Website / social media', 'Sitio / redes sociales'],
    'app.fieldAddress': ['Endereço', 'Address', 'Dirección'],
    'app.fieldAddressNumber': ['Número', 'Number', 'Número'],
    'app.fieldComplement': ['Complemento', 'Address line 2', 'Complemento'],
    'app.fieldNeighborhood': ['Bairro', 'Neighborhood', 'Barrio'],
    'app.fieldGroupContactAddress': ['Contato e endereço', 'Contact and address', 'Contacto y dirección'],
    'app.fieldBirthDate': ['Data de nascimento', 'Date of birth', 'Fecha de nacimiento'],
    'app.fieldEducation': ['Escolaridade', 'Education', 'Escolaridad'],
    'app.fieldMaritalStatus': ['Estado civil', 'Marital status', 'Estado civil'],
    'app.fieldSmartCep': ['CEP inteligente', 'Smart CEP', 'CEP inteligente'],
    'app.fieldSmartCnpj': ['CNPJ inteligente', 'Smart CNPJ', 'CNPJ inteligente'],
    'app.fieldStateIbge': ['Estado (IBGE)', 'State (IBGE)', 'Estado (IBGE)'],
    'app.fieldCityIbge': ['Município (IBGE)', 'City (IBGE)', 'Municipio (IBGE)'],
    'app.fieldSelection': ['Seleção', 'Selection', 'Selección'],
    'app.fieldDate': ['Data', 'Date', 'Fecha'],
    'app.fieldLongText': ['Texto longo', 'Long text', 'Texto largo'],
    'app.fieldUpload': ['Upload de arquivo', 'File upload', 'Subida de archivo'],
    'app.fieldPhoto': ['Foto da pessoa', "The person's photo", 'Foto de la persona'],
    'app.fieldGroupBasic': ['Básicos', 'Basics', 'Básicos'],
    'app.fieldGroupProfile': ['Dados cadastrais', 'Profile details', 'Datos personales'],
    'app.fieldGroupLocation': ['Localização', 'Location', 'Ubicación'],
    'app.fieldGroupContent': ['Conteúdo', 'Content', 'Contenido'],
    'app.fullName': ['Nome completo', 'Full name', 'Nombre completo'],
    'app.formBuilderTitle': ['Criar formulário', 'Create form', 'Crear formulario'],
    'app.formBuilderSubtitle': [
      'Crie formulários personalizados para coletar informações de forma organizada.',
      'Create custom forms to collect information in an organized way.',
      'Crea formularios personalizados para recopilar información de forma organizada.',
    ],
    'app.preview': ['Pré-visualização', 'Preview', 'Vista previa'],
    'app.structure': ['Estrutura', 'Structure', 'Estructura'],
    'app.defineFields': ['Defina os campos', 'Define the fields', 'Define los campos'],
    'app.design': ['Design', 'Design', 'Diseño'],
    'app.formAppearance': ['Aparência do formulário', 'Form appearance', 'Apariencia del formulario'],
    'app.sharing': ['Compartilhamento', 'Sharing', 'Compartir'],
    'app.publishAndShare': ['Publique e compartilhe', 'Publish and share', 'Publica y comparte'],
    'app.formName': ['Nome do formulário', 'Form name', 'Nombre del formulario'],
    'app.formTemplate': ['Modelo do formulário', 'Form template', 'Modelo del formulario'],
    'app.formTemplateHint': ['(monta os campos por você)', '(builds the fields for you)', '(crea los campos por ti)'],
    'app.formNameExample': ['Ex.: Solicitação de Orçamento', 'Example: Quote Request', 'Ej.: Solicitud de presupuesto'],
    'app.optional': ['(opcional)', '(optional)', '(opcional)'],
    'app.formPurpose': ['Explique para que serve este formulário.', 'Explain what this form is for.', 'Explica para qué sirve este formulario.'],
    'app.fields': ['Campos', 'Fields', 'Campos'],
    'app.addField': ['+ Adicionar campo', '+ Add field', '+ Añadir campo'],
    'app.formOptions': ['Opções do formulário', 'Form options', 'Opciones del formulario'],
    'app.formMaxFields': [
      'Um formulário aceita até {limit} campos.',
      'A form can have up to {limit} fields.',
      'Un formulario admite hasta {limit} campos.',
    ],
    'app.formNeedsName': ['Dê um nome ao formulário.', 'Give the form a name.', 'Ponle un nombre al formulario.'],
    'app.formNeedsField': ['Um formulário precisa de pelo menos um campo.', 'A form needs at least one field.', 'Un formulario necesita al menos un campo.'],
    'app.formFieldNeedsLabel': [
      'Todo campo precisa de um rótulo — é o que a pessoa lê ao preencher.',
      'Every field needs a label—the person completing the form will read it.',
      'Cada campo necesita una etiqueta: es lo que leerá quien complete el formulario.',
    ],
    'app.formSelectionNeedsOptions': [
      'O campo "{label}" é de seleção e está sem opções.',
      'The selection field “{label}” has no options.',
      'El campo de selección «{label}» no tiene opciones.',
    ],
    'app.fieldLabel': ['Rótulo do campo', 'Field label', 'Etiqueta del campo'],
    'app.moveUp': ['Subir', 'Move up', 'Subir'],
    'app.moveDown': ['Descer', 'Move down', 'Bajar'],
    'app.requiredField': ['Campo obrigatório', 'Required field', 'Campo obligatorio'],
    'app.optionalField': ['Campo opcional', 'Optional field', 'Campo opcional'],
    'app.removeField': ['Remover campo', 'Remove field', 'Quitar campo'],
    'app.optionPerLine': ['Uma opção por linha', 'One option per line', 'Una opción por línea'],
    'app.requiredAll': ['Obrigatório', 'Required', 'Obligatorio'],
    'app.requiredAllDesc': [
      'Exigir que todos os campos sejam preenchidos.',
      'Require every field to be completed.',
      'Exigir que se completen todos los campos.',
    ],
    'app.collectResponses': ['Coletar respostas', 'Collect responses', 'Recopilar respuestas'],
    'app.collectResponsesDesc': [
      'Guardar as respostas automaticamente no MyDesk.',
      'Save responses automatically in MyDesk.',
      'Guardar las respuestas automáticamente en MyDesk.',
    ],
    'app.publicLink': ['Link público', 'Public link', 'Enlace público'],
    'app.publicLinkDesc': [
      'Permitir acesso ao formulário por um link.',
      'Allow access to the form through a link.',
      'Permitir el acceso al formulario mediante un enlace.',
    ],
    /* O e-mail a cada resposta deixou de existir (ver api/form.js), e com ele
       saíram as chaves app.formAlerts*, app.notifications e
       app.notificationsDesc. */
    /* O logo como caminho de volta (docs/js/app.js → irParaMeuQuadro) */
    'app.backHome': ['Voltar para o meu quadro', 'Back to my board', 'Volver a mi tablero'],
    /* Sair de grupo ou 1:1 pelo logo usa as telas de saída que já existem
       (app.leaveTemporarily, app.closeForEveryone, app.closeForBoth). */
    'app.alreadyHome': [
      'Você já está no seu quadro.', 'You are already on your board.',
      'Ya estás en tu tablero.',
    ],
    'app.attachNotSaved': [
      '"{name}" não pôde ser salvo e foi removido da nota.',
      '"{name}" could not be saved and was removed from the note.',
      '"{name}" no pudo guardarse y se quitó de la nota.',
    ],
    'app.pipUnsupported': [
      'Este navegador não tem janela flutuante. A chamada continua enquanto o MyDesk estiver aberto.',
      'This browser has no floating window. The call continues while MyDesk stays open.',
      'Este navegador no tiene ventana flotante. La llamada sigue mientras MyDesk esté abierto.',
    ],
    'app.pipNoVideo': [
      'Ligue a câmera de alguém para usar a janela flutuante. O áudio já continua sozinho em segundo plano.',
      'Turn on a camera to use the floating window. Audio already continues in the background.',
      'Enciende la cámara de alguien para usar la ventana flotante. El audio ya sigue en segundo plano.',
    ],
    'app.pipOn': [
      'A chamada continua nesta janelinha, por cima de outros aplicativos.',
      'The call continues in this small window, on top of other apps.',
      'La llamada sigue en esta ventanita, encima de otras aplicaciones.',
    ],
    'app.pipFailed': [
      'Não consegui abrir a janela flutuante.', 'Could not open the floating window.',
      'No pude abrir la ventana flotante.',
    ],
    'app.videoCall': ['Videochamada', 'Video call', 'Videollamada'],
    'app.callSizeCompact': ['compacta', 'compact', 'compacta'],
    'app.callSizeWide': ['deitada', 'wide', 'apaisada'],
    'app.callSizeTall': ['em pé', 'tall', 'vertical'],
    'app.callSizeFull': ['tela cheia', 'full screen', 'pantalla completa'],
    'app.callSizeNext': [
      'Chamada {atual} — clique para {proxima}',
      'Call {atual} — click for {proxima}',
      'Llamada {atual} — clic para {proxima}',
    ],
    'app.videoOpenFailed': [
      'Não consegui abrir este vídeo.', 'Could not open this video.', 'No pude abrir este video.',
    ],
    'app.saveFailed': [
      'Não consegui salvar o quadro. Verifique a conexão antes de fechar a página.',
      'Could not save the board. Check your connection before closing the page.',
      'No pude guardar el tablero. Revisa la conexión antes de cerrar la página.',
    ],
    'app.fileTooBigEvenZipped': [
      '"{name}" não cabe nem compactado: {from} viram {to}, e o máximo é {limit}.',
      '"{name}" does not fit even zipped: {from} became {to}, and the maximum is {limit}.',
      '"{name}" no cabe ni comprimido: {from} pasaron a {to}, y el máximo es {limit}.',
    ],
    'app.fileZipped': [
      '"{name}" foi compactado de {from} para {to}. Para abrir, baixe o arquivo.',
      '"{name}" was compressed from {from} to {to}. Download it to open.',
      '"{name}" se comprimió de {from} a {to}. Descárgalo para abrirlo.',
    ],
    'app.zippedNoPreview': [
      '"{name}" está compactado para caber. Baixe para abrir.',
      '"{name}" is compressed so it fits. Download it to open.',
      '"{name}" está comprimido para caber. Descárgalo para abrirlo.',
    ],
    'app.downloadZipped': [
      'Baixar (descompactando)', 'Download (decompressing)', 'Descargar (descomprimiendo)',
    ],
    'app.unzipFailed': [
      'Não consegui descompactar este anexo.',
      'Could not decompress this attachment.',
      'No pude descomprimir este adjunto.',
    ],
    'app.fileTooBigForDb': [
      '"{name}" não cabe: depois de codificado passa do máximo que o banco aceita por arquivo.',
      '"{name}" does not fit: once encoded it exceeds the maximum the database accepts per file.',
      '"{name}" no cabe: una vez codificado supera el máximo que la base acepta por archivo.',
    ],
    /* Itens de checklist com prazo e responsável */
    'app.checklistItemPh': ['Item da checklist…', 'Checklist item…', 'Ítem de la lista…'],
    'app.checklistItemOptions': [
      'Prazo e responsável', 'Due date and assignee', 'Plazo y responsable',
    ],
    'app.checklistDue': ['Prazo', 'Due date', 'Plazo'],
    'app.checklistAssign': ['Delegar para', 'Assign to', 'Delegar a'],
    'app.checklistAssignPersonal': [
      'Delegar existe nos workspaces compartilhados, onde há outras pessoas.',
      'Assigning exists in shared workspaces, where there are other people.',
      'Delegar existe en los workspaces compartidos, donde hay otras personas.',
    ],
    'app.checklistAssignError': [
      'Não consegui carregar os participantes.',
      'Could not load the participants.',
      'No pude cargar los participantes.',
    ],
    'app.checklistClearMeta': [
      'Limpar prazo e responsável', 'Clear due date and assignee',
      'Quitar plazo y responsable',
    ],
    'app.remove': ['Remover', 'Remove', 'Quitar'],
    'app.you': ['você', 'you', 'tú'],
    'app.accentColor': ['Cor de destaque', 'Accent color', 'Color de acento'],
    'app.accentColorDesc': [
      'Vale para o botão, o foco dos campos e o brilho do topo da página.',
      'Used for the button, field focus, and the glow at the top of the page.',
      'Se usa en el botón, el foco de los campos y el brillo superior de la página.',
    ],
    'app.publish': ['Publicar', 'Publish', 'Publicar'],
    'app.formBecomesNote': [
      'O formulário vira uma nota no quadro. As respostas chegam nela.',
      'The form becomes a note on the board. Responses arrive there.',
      'El formulario se convierte en una nota del tablero. Las respuestas llegan allí.',
    ],
    'app.publishForm': ['Publicar formulário', 'Publish form', 'Publicar formulario'],
    'app.publishing': ['Publicando…', 'Publishing…', 'Publicando…'],
    'app.freeNotesLimit': [
      'Você atingiu o limite de notas do plano gratuito.',
      'You reached the free plan’s note limit.',
      'Alcanzaste el límite de notas del plan gratuito.',
    ],
    'app.formPublishedToast': [
      'Formulário publicado! A nota está no seu quadro.',
      'Form published! The note is on your board.',
      '¡Formulario publicado! La nota está en tu tablero.',
    ],
    'app.formPublishError': [
      'Não foi possível publicar o formulário. Tente de novo.',
      'Could not publish the form. Try again.',
      'No se pudo publicar el formulario. Inténtalo de nuevo.',
    ],
    'app.formPublished': ['Formulário publicado ✓', 'Form published ✓', 'Formulario publicado ✓'],
    'app.linkToSend': ['Link para enviar', 'Link to share', 'Enlace para enviar'],
    'app.copy': ['Copiar', 'Copy', 'Copiar'],
    'app.copied': ['Copiado!', 'Copied!', '¡Copiado!'],
    'app.copyCtrlC': ['Copie com Ctrl+C', 'Copy with Ctrl+C', 'Copia con Ctrl+C'],
    'app.sendByEmail': ['Enviar por e-mail', 'Send by email', 'Enviar por correo'],
    'app.oneEmailPerLine': ['Um endereço por linha, até 10.', 'One address per line, up to 10.', 'Una dirección por línea, hasta 10.'],
    'app.optionalMessage': ['Mensagem (opcional)', 'Message (optional)', 'Mensaje (opcional)'],
    'app.sendLinkByEmail': ['Enviar link por e-mail', 'Send link by email', 'Enviar enlace por correo'],
    'app.finish': ['Concluir', 'Finish', 'Finalizar'],
    'app.enterAtLeastOneEmail': ['Informe ao menos um e-mail.', 'Enter at least one email.', 'Introduce al menos un correo.'],
    'app.sending': ['Enviando…', 'Sending…', 'Enviando…'],
    'app.sent': ['Enviado ✓', 'Sent ✓', 'Enviado ✓'],
    'app.linkSentOne': ['Link enviado para {count} pessoa.', 'Link sent to {count} person.', 'Enlace enviado a {count} persona.'],
    'app.linkSentMany': ['Link enviado para {count} pessoas.', 'Link sent to {count} people.', 'Enlace enviado a {count} personas.'],
    'app.secureForm': ['Formulário seguro', 'Secure form', 'Formulario seguro'],
    'app.infoCollection': ['COLETA DE INFORMAÇÕES', 'INFORMATION COLLECTION', 'RECOPILACIÓN DE INFORMACIÓN'],
    'app.formTitlePlaceholder': ['Título do formulário', 'Form title', 'Título del formulario'],
    'app.noLabel': ['(sem rótulo)', '(no label)', '(sin etiqueta)'],
    'app.selectEducation': ['Selecione a escolaridade', 'Select education', 'Selecciona la escolaridad'],
    'app.selectMaritalStatus': ['Selecione o estado civil', 'Select marital status', 'Selecciona el estado civil'],
    'app.automaticLookup': ['busca automática', 'automatic lookup', 'búsqueda automática'],
    'app.selectState': ['Selecione um estado', 'Select a state', 'Selecciona un estado'],
    'app.selectStateCity': ['Selecione UF e município', 'Select state and city', 'Selecciona estado y municipio'],
    'app.selectOption': ['Selecione uma opção', 'Select an option', 'Selecciona una opción'],
    'app.noOptions': ['sem opções', 'no options', 'sin opciones'],
    'app.tellUsMore': ['Conte-nos mais…', 'Tell us more…', 'Cuéntanos más…'],
    'app.clickUpload': ['Clique para enviar um arquivo (até 1,5 MB)', 'Click to upload a file (up to 1.5 MB)', 'Haz clic para subir un archivo (hasta 1,5 MB)'],
    'app.photoOptionalPreview': ['Foto — opcional, escolhida no celular', 'Photo — optional, picked on the phone', 'Foto — opcional, elegida en el celular'],
    'app.typeHere': ['Digite aqui', 'Type here', 'Escribe aquí'],
    'app.submit': ['Enviar', 'Submit', 'Enviar'],
    'app.dataProtected': [
      '🔒 Dados protegidos e enviados diretamente ao responsável',
      '🔒 Data protected and sent directly to the person responsible',
      '🔒 Datos protegidos y enviados directamente al responsable',
    ],
    'app.newResponseIn': ['Nova resposta em "{title}".', 'New response in “{title}”.', 'Nueva respuesta en «{title}».'],
    'app.formTag': ['FORMULÁRIO', 'FORM', 'FORMULARIO'],
    'app.responses': ['Respostas', 'Responses', 'Respuestas'],
    'app.copyLink': ['Copiar link', 'Copy link', 'Copiar enlace'],
    'app.linkCopied': ['Link copiado.', 'Link copied.', 'Enlace copiado.'],
    'app.linkCopyError': [
      'Não consegui copiar. O link está no corpo da nota.',
      'Could not copy it. The link is in the note body.',
      'No se pudo copiar. El enlace está en el cuerpo de la nota.',
    ],
    'app.responsesTitle': ['Respostas · {title}', 'Responses · {title}', 'Respuestas · {title}'],
    'app.noResponses': [
      'Ainda não chegou nenhuma resposta. Envie o link para receber a primeira.',
      'No responses yet. Share the link to receive the first one.',
      'Aún no hay respuestas. Envía el enlace para recibir la primera.',
    ],
    'app.createNoteFromResponse': ['Criar nota', 'Create note', 'Crear nota'],
    'app.deleteResponseError': ['Não foi possível apagar a resposta.', 'Could not delete the response.', 'No se pudo eliminar la respuesta.'],
    'app.responseBecameNote': ['Resposta virou nota no quadro.', 'Response became a note on the board.', 'La respuesta se convirtió en una nota del tablero.'],
    'app.comments': ['Comentários', 'Comments', 'Comentarios'],
    'app.commentPlaceholder': ['Escreva um comentário…', 'Write a comment…', 'Escribe un comentario…'],
    'app.noComments': ['Nenhum comentário ainda.', 'No comments yet.', 'Aún no hay comentarios.'],
    'app.deleteComment': ['Apagar comentário', 'Delete comment', 'Eliminar comentario'],
    'app.commentOffline': ['Sem conexão para comentar agora.', 'You are offline and cannot comment right now.', 'Sin conexión para comentar ahora.'],
    'app.commentSendError': ['Não foi possível enviar o comentário.', 'Could not send the comment.', 'No se pudo enviar el comentario.'],
    'app.commentDeleteError': ['Não foi possível apagar o comentário.', 'Could not delete the comment.', 'No se pudo eliminar el comentario.'],
    'app.editingNow': ['Editando agora', 'Editing now', 'Editando ahora'],
    'app.movingNow': ['Movendo agora', 'Moving now', 'Moviendo ahora'],
    'app.viewingNow': ['Visualizando', 'Viewing', 'Viendo'],
    'app.activeNow': ['Ativo agora', 'Active now', 'Activo ahora'],
    'app.delegated': ['Delegado', 'Assigned', 'Delegado'],
    'app.noNotePresence': [
      'Ninguém está usando ou assumiu esta nota.',
      'No one is using or assigned to this note.',
      'Nadie está usando ni tiene asignada esta nota.',
    ],
    'app.personDefault': ['pessoa', 'person', 'persona'],
    'app.pinExpanded': ['Fixar expandida', 'Keep expanded', 'Fijar expandida'],
    'app.start': ['Início', 'Start', 'Inicio'],
    'app.deadline': ['Prazo', 'Deadline', 'Plazo'],
    'app.checklist': ['Checklist', 'Checklist', 'Lista de tareas'],
    'app.addItem': ['Adicionar item', 'Add item', 'Añadir elemento'],
    'app.color': ['Cor', 'Color', 'Color'],
    'app.commentAction': ['Comentar (Enter)', 'Comment (Enter)', 'Comentar (Enter)'],
    'app.resize': ['Redimensionar', 'Resize', 'Redimensionar'],
    'app.now': ['agora', 'now', 'ahora'],
    'app.minutesAgo': ['há {count} min', '{count} min ago', 'hace {count} min'],
    'app.hoursAgo': ['há {count}h', '{count}h ago', 'hace {count} h'],
    'app.yesterday': ['ontem', 'yesterday', 'ayer'],

    'app.chooseDay': [
      'Escolha um dia para ver e criar compromissos.',
      'Choose a day to view and create appointments.',
      'Elige un día para ver y crear compromisos.',
    ],
    'app.today': ['Hoje', 'Today', 'Hoy'],
    'app.tomorrow': ['Amanhã', 'Tomorrow', 'Mañana'],
    'app.inDays': ['em {count} dias', 'in {count} days', 'en {count} días'],
    'app.itemCount': ['{count} item(ns)', '{count} item(s)', '{count} elemento(s)'],
    'app.addAppointment': ['＋ Compromisso', '＋ Appointment', '＋ Compromiso'],
    'app.addCalendarItem': ['＋ Adicionar', '＋ Add', '＋ Añadir'],
    'app.noteDeadline': ['prazo de nota', 'note deadline', 'plazo de nota'],
    'app.imported': ['importado', 'imported', 'importado'],
    'app.nothingScheduled': ['Nada marcado neste dia.', 'Nothing scheduled for this day.', 'No hay nada programado para este día.'],
    'app.appointmentRemoved': ['Compromisso removido.', 'Appointment removed.', 'Compromiso eliminado.'],
    'app.newAppointment': ['Novo compromisso', 'New appointment', 'Nuevo compromiso'],
    'app.appointmentTitleExample': ['ex.: Audiência de conciliação', 'e.g. Settlement hearing', 'ej.: Audiencia de conciliación'],
    'app.date': ['Data', 'Date', 'Fecha'],
    'app.time': ['Hora', 'Time', 'Hora'],
    'app.appointmentNeedsTitle': ['Dê um título ao compromisso.', 'Give the appointment a title.', 'Ponle un título al compromiso.'],
    'app.chooseDate': ['Escolha a data.', 'Choose the date.', 'Elige la fecha.'],
    'app.appointmentMarkedReminder': ['Compromisso marcado. Aviso 20 min antes.', 'Appointment scheduled. Alert 20 min beforehand.', 'Compromiso programado. Aviso 20 min antes.'],
    'app.appointmentMarked': ['Compromisso marcado.', 'Appointment scheduled.', 'Compromiso programado.'],
    'app.saveError': ['Não foi possível salvar. Tente de novo.', 'Could not save. Try again.', 'No se pudo guardar. Inténtalo de nuevo.'],
    'app.noEvents14Days': ['Nenhum evento nos próximos 14 dias 🎉', 'No events in the next 14 days 🎉', 'No hay eventos en los próximos 14 días 🎉'],
    'app.expenseFood': ['Alimentação', 'Food', 'Alimentación'],
    'app.expenseTransport': ['Transporte', 'Transportation', 'Transporte'],
    'app.expenseHousing': ['Moradia', 'Housing', 'Vivienda'],
    'app.expenseLeisure': ['Lazer', 'Leisure', 'Ocio'],
    'app.expenseHealth': ['Saúde', 'Health', 'Salud'],
    'app.expenseSubscriptions': ['Assinaturas', 'Subscriptions', 'Suscripciones'],
    'app.expenseOther': ['Outros', 'Other', 'Otros'],
    'app.budgetLabel': ['Orçamento', 'Budget', 'Presupuesto'],
    'app.spentThisMonth': ['Gasto este mês', 'Spent this month', 'Gastado este mes'],
    'app.overBy': ['Estourou em', 'Over by', 'Excedido en'],
    'app.remaining': ['Resta', 'Remaining', 'Queda'],
    'app.dailySuggestion': ['Sugestão/dia ({count}d restantes)', 'Daily suggestion ({count}d left)', 'Sugerencia/día (quedan {count}d)'],
    'app.noExpensesMonth': ['Sem despesas este mês.', 'No expenses this month.', 'Sin gastos este mes.'],
    'app.fillExpense': ['Preencha descrição e valor.', 'Enter a description and amount.', 'Completa la descripción y el valor.'],
    'app.noExpensesSelectedMonth': ['Nenhuma despesa nesse mês.', 'No expenses in this month.', 'No hay gastos en este mes.'],
    'app.monthTotal': ['Total do mês', 'Monthly total', 'Total del mes'],
    'app.noMonthlyTasks': ['Nenhuma tarefa ainda.', 'No tasks yet.', 'Aún no hay tareas.'],
    'app.monthTaskPlaceholder': ['Tarefa do mês…', 'Monthly task…', 'Tarea del mes…'],
    'app.dayPlaceholder': ['dia', 'day', 'día'],
    'app.dayOptionalTitle': [
      'Dia do mês (opcional) — alerta se passar sem concluir',
      'Day of month (optional)—alerts you if it passes before completion',
      'Día del mes (opcional): avisa si pasa sin completarse',
    ],
    'app.noIcsEvents': ['Nenhum evento encontrado no arquivo.', 'No events found in the file.', 'No se encontraron eventos en el archivo.'],
    'app.icsImported': ['{count} evento(s) importado(s)!', '{count} event(s) imported!', '¡{count} evento(s) importado(s)!'],

    'app.workspaceListTitle': ['Workspaces compartilhados', 'Shared workspaces', 'Espacios compartidos'],
    'app.loading': ['Carregando…', 'Loading…', 'Cargando…'],
    'app.oneToOneWorkspace': ['workspace com uma pessoa', 'one-to-one workspace', 'espacio con una persona'],
    'app.participantOne': ['{count} participante', '{count} participant', '{count} participante'],
    'app.participantMany': ['{count} participantes', '{count} participants', '{count} participantes'],
    'app.notStarted': ['não iniciado', 'not started', 'no iniciado'],
    'app.openNow': ['aberto', 'open', 'abierto'],
    'app.noSharedWorkspaces': [
      'Você ainda não participa de nenhum workspace compartilhado.',
      'You are not part of any shared workspace yet.',
      'Aún no participas en ningún espacio compartido.',
    ],
    'app.noSharedWorkspacesHelp': [
      'Crie um pelo painel Amigos — em um grupo, ou direto com alguém.',
      'Create one from the Friends panel—in a group or directly with someone.',
      'Crea uno desde el panel Amigos, en un grupo o directamente con alguien.',
    ],
    'app.leaveWorkspace': ['Sair do workspace', 'Leave workspace', 'Salir del espacio'],
    'app.ownerLeaveDescription': [
      'Como dono, você pode sair temporariamente (o workspace continua para os membros) ou encerrá-lo permanentemente para todos.',
      'As owner, you can leave temporarily (the workspace stays available to members) or close it permanently for everyone.',
      'Como propietario, puedes salir temporalmente (el espacio seguirá para los miembros) o cerrarlo permanentemente para todos.',
    ],
    'app.memberLeaveDescription': [
      'Você pode sair temporariamente. O workspace continuará ativo para os outros membros.',
      'You can leave temporarily. The workspace will remain active for the other members.',
      'Puedes salir temporalmente. El espacio seguirá activo para los demás miembros.',
    ],
    'app.leaveTemporarily': ['Sair temporariamente', 'Leave temporarily', 'Salir temporalmente'],
    'app.closeForEveryone': ['Encerrar para todos', 'Close for everyone', 'Cerrar para todos'],
    'app.closeForBoth': ['Encerrar para ambos', 'Close for both', 'Cerrar para ambos'],
    'app.oneToOneLeaveDescription': [
      'Você pode sair temporariamente — o workspace continua ativo para @{name} — ou encerrá-lo permanentemente para ambos.',
      'You can leave temporarily—the workspace remains active for @{name}—or close it permanently for both of you.',
      'Puedes salir temporalmente —el espacio seguirá activo para @{name}— o cerrarlo permanentemente para ambos.',
    ],
    'app.renameWorkspaceTitle': ['Renomear workspace', 'Rename workspace', 'Renombrar espacio'],
    'app.renameWorkspaceDescription': [
      'O nome vale para você e para @{name}. Deixe em branco para voltar a chamá-lo de @{name}.',
      'The name applies to you and @{name}. Leave it blank to call it @{name} again.',
      'El nombre se aplica a ti y a @{name}. Déjalo en blanco para volver a llamarlo @{name}.',
    ],
    'app.renameWorkspaceExample': ['Ex.: Processo Silva', 'Example: Silva Case', 'Ej.: Caso Silva'],
    'app.main': ['Principal', 'Main', 'Principal'],
    'app.renameWorkspace': ['Renomear este workspace', 'Rename this workspace', 'Renombrar este espacio'],
    'app.onlyGroupOwner': [
      'Apenas o dono do grupo pode iniciar o workspace.',
      'Only the group owner can start the workspace.',
      'Solo el propietario del grupo puede iniciar el espacio.',
    ],
    'app.groupWorkspaceStarted': ['Workspace do grupo "{name}" iniciado!', 'Group workspace “{name}” started!', '¡Espacio del grupo «{name}» iniciado!'],
    'app.joinedGroupWorkspace': ['Entrou no workspace do grupo "{name}"!', 'Joined group workspace “{name}”!', '¡Entraste al espacio del grupo «{name}»!'],
    'app.groupWorkspaceEnded': ['Workspace do grupo encerrado para todos.', 'Group workspace ended for everyone.', 'Espacio grupal cerrado para todos.'],
    'app.groupWorkspaceRestored': ['Workspace do grupo restaurado.', 'Group workspace restored.', 'Espacio grupal restaurado.'],
    'app.namedWorkspaceRestored': ['Workspace "{name}" restaurado.', 'Workspace “{name}” restored.', 'Espacio «{name}» restaurado.'],
    'app.personalWorkspaceRestored': ['Workspace pessoal restaurado.', 'Personal workspace restored.', 'Espacio personal restaurado.'],
    'app.groupWorkspaceClosed': ['O workspace do grupo foi encerrado.', 'The group workspace was closed.', 'El espacio grupal fue cerrado.'],
    'app.collabFileTooLarge': [
      '"{name}" é grande demais para o workspace colaborativo (máx 400KB para não-imagens).',
      '“{name}” is too large for the collaborative workspace (max 400 KB for non-images).',
      '«{name}» es demasiado grande para el espacio colaborativo (máx. 400 KB para archivos que no sean imágenes).',
    ],
    'app.workspaceWithPerson': ['Workspace com uma pessoa', 'Workspace with one person', 'Espacio con una persona'],
    'app.leaveCloseWorkspace': ['Sair / Encerrar workspace', 'Leave / Close workspace', 'Salir / Cerrar espacio'],
    'app.renameWorkspaceError': ['Não foi possível renomear este workspace.', 'Could not rename this workspace.', 'No se pudo renombrar este espacio.'],
    'app.workspaceRenamed': ['Workspace renomeado para "{name}".', 'Workspace renamed to “{name}”.', 'Espacio renombrado como «{name}».'],
    'app.workspaceAliasRemoved': ['Apelido removido — o workspace volta a ser @{name}.', 'Alias removed—the workspace is back to @{name}.', 'Alias eliminado: el espacio vuelve a ser @{name}.'],
    'app.workspaceActivated': ['Workspace com @{name} ativado!', 'Workspace with @{name} activated!', '¡Espacio con @{name} activado!'],
    'app.workspaceCreated': ['Workspace "{name}" criado!', 'Workspace “{name}” created!', '¡Espacio «{name}» creado!'],
    'app.leaveCurrentWorkspace': [
      'Saia do workspace atual antes de trocar de workspace pessoal.',
      'Leave the current workspace before switching personal workspaces.',
      'Sal del espacio actual antes de cambiar de espacio personal.',
    ],
    'app.mainWorkspace': ['Workspace principal', 'Main workspace', 'Espacio principal'],
    'app.deleteWorkspaceConfirm': [
      'Excluir o workspace "{name}"? Todas as notas serão apagadas.',
      'Delete workspace “{name}”? All notes will be deleted.',
      '¿Eliminar el espacio «{name}»? Se borrarán todas las notas.',
    ],
    'app.workspaceDeleted': ['Workspace "{name}" excluído.', 'Workspace “{name}” deleted.', 'Espacio «{name}» eliminado.'],
    'app.backPersonalWorkspace': [
      'Voltou ao workspace pessoal. O workspace com @{name} continua ativo.',
      'Back to your personal workspace. The workspace with @{name} remains active.',
      'Volviste al espacio personal. El espacio con @{name} sigue activo.',
    ],
    'app.workspaceClosedForever': ['Workspace encerrado definitivamente.', 'Workspace permanently closed.', 'Espacio cerrado definitivamente.'],

    'app.crmPremiumOnly': ['CRM Financeiro é exclusivo do plano Premium.', 'Financial CRM is exclusive to Premium.', 'El CRM financiero es exclusivo de Premium.'],
    'app.monthlyNoteLimitReached': [
      'Limite de {count} notas/mês atingido. Assine o Premium!',
      'You reached the limit of {count} notes per month. Subscribe to Premium!',
      'Alcanzaste el límite de {count} notas al mes. ¡Suscríbete a Premium!',
    ],
    'app.itemLimitReached': [
      'Limite de {count} itens atingido. Faça upgrade!',
      'You reached the limit of {count} items. Upgrade your plan!',
      'Alcanzaste el límite de {count} elementos. ¡Mejora tu plan!',
    ],
    'app.creating': ['Criando…', 'Creating…', 'Creando…'],
    'app.clientBoardAdded': [
      '"{name}" adicionado ao board e a Clientes!',
      '“{name}” was added to the board and Clients!',
      '¡«{name}» se añadió al tablero y a Clientes!',
    ],
    'app.createErrorRetry': [
      'Erro ao criar. Tente novamente.',
      'Could not create it. Try again.',
      'No se pudo crear. Inténtalo de nuevo.',
    ],
    'app.clientChip': ['💼 Cliente', '💼 Client', '💼 Cliente'],
    'app.clientSyncedCrm': [
      'Nota de Cliente — sincronizada com CRM',
      'Client Note — synced with CRM',
      'Nota de cliente — sincronizada con el CRM',
    ],
    'app.noRecordsToDelete': [
      'Nenhum registro para apagar.',
      'There are no records to delete.',
      'No hay registros que eliminar.',
    ],
    'app.deleteAllClientsQuestion': [
      'Apagar todos os clientes?',
      'Delete all clients?',
      '¿Eliminar todos los clientes?',
    ],
    'app.deleteRecordsDescriptionOne': [
      'Esta ação removerá <strong>{count} registro</strong> permanentemente. Não pode ser desfeito.',
      'This will permanently remove <strong>{count} record</strong>. It cannot be undone.',
      'Esta acción eliminará permanentemente <strong>{count} registro</strong>. No se puede deshacer.',
    ],
    'app.deleteRecordsDescriptionMany': [
      'Esta ação removerá <strong>{count} registros</strong> permanentemente. Não pode ser desfeito.',
      'This will permanently remove <strong>{count} records</strong>. It cannot be undone.',
      'Esta acción eliminará permanentemente <strong>{count} registros</strong>. No se puede deshacer.',
    ],
    'app.deleteAll': ['Apagar tudo', 'Delete all', 'Eliminar todo'],
    'app.recordsRemovedOne': [
      '{count} registro removido.',
      '{count} record removed.',
      '{count} registro eliminado.',
    ],
    'app.recordsRemovedMany': [
      '{count} registros removidos.',
      '{count} records removed.',
      '{count} registros eliminados.',
    ],
    'app.notesLabel': ['Notas', 'Notes', 'Notas'],
    'app.loadError': ['Erro ao carregar: {message}', 'Could not load: {message}', 'Error al cargar: {message}'],
    'app.signInFirst': ['Faça login primeiro.', 'Sign in first.', 'Inicia sesión primero.'],
    'app.clientAddedDemo': ['Cliente adicionado! (modo demo)', 'Client added! (demo mode)', '¡Cliente añadido! (modo demo)'],
    'app.clientAdded': ['Cliente adicionado!', 'Client added!', '¡Cliente añadido!'],
    'app.saveRecordError': ['Erro ao salvar: {message}', 'Could not save: {message}', 'Error al guardar: {message}'],
    'app.firebasePermissionDenied': [
      'Permissão negada. Verifique as regras do Firebase.',
      'Permission denied. Check the Firebase rules.',
      'Permiso denegado. Revisa las reglas de Firebase.',
    ],
    'app.unknownError': ['Erro desconhecido', 'Unknown error', 'Error desconocido'],
    'app.recordRemoved': ['Registro removido.', 'Record removed.', 'Registro eliminado.'],
    'app.updateRecordError': ['Erro ao atualizar: {message}', 'Could not update: {message}', 'Error al actualizar: {message}'],
    'app.removeRecordError': ['Erro ao remover: {message}', 'Could not remove: {message}', 'Error al eliminar: {message}'],
    'app.noteAlreadyConverted': ['Esta nota já foi convertida.', 'This note has already been converted.', 'Esta nota ya fue convertida.'],
    'app.inClients': ['✓ Em Clientes', '✓ In Clients', '✓ En Clientes'],
    'app.noteConverted': ['Nota convertida em registro de cliente!', 'Note converted into a client record!', '¡Nota convertida en registro de cliente!'],
    'app.totalOutstanding': ['total em aberto', 'total outstanding', 'total pendiente'],
    'app.inPortfolioLabel': ['na carteira', 'in portfolio', 'en cartera'],
    'app.portfolioAverageLabel': ['média da carteira', 'portfolio average', 'promedio de cartera'],
    'app.overdueOne': ['{count} atrasado', '{count} overdue', '{count} atrasado'],
    'app.overdueMany': ['{count} atrasados', '{count} overdue', '{count} atrasados'],
    'app.newLabel': ['novo', 'new', 'nuevo'],
    'app.inCurrentMonth': ['em {month}', 'in {month}', 'en {month}'],
    'app.vsMonth': ['vs. {month}', 'vs. {month}', 'vs. {month}'],
    'app.noDataYet': ['Sem dados ainda', 'No data yet', 'Aún no hay datos'],
    'app.noReceiptsPeriod': ['Nenhum recebimento neste período', 'No receipts in this period', 'No hay cobros en este período'],
    'app.noValuesPeriod': ['Nenhum valor lançado neste período', 'No amounts entered in this period', 'No hay valores en este período'],
    'app.sortByLabel': ['Ordenar por: {label}', 'Sort by: {label}', 'Ordenar por: {label}'],
    'app.recentlyCreated': ['Recém-criados', 'Recently created', 'Recién creados'],
    'app.all': ['Todos', 'All', 'Todos'],
    'app.paidMany': ['Pagos', 'Paid', 'Pagados'],
    'app.pendingMany': ['Pendentes', 'Pending', 'Pendientes'],
    'app.overdueManyLabel': ['Atrasados', 'Overdue', 'Atrasados'],
    'app.issueReceiptPdf': ['Emitir recibo (PDF)', 'Issue receipt (PDF)', 'Emitir recibo (PDF)'],
    'app.exportWord': ['Exportar para Word', 'Export to Word', 'Exportar a Word'],
    'app.createGoogleDocsCard': ['Criar ficha no Google Docs', 'Create profile in Google Docs', 'Crear ficha en Google Docs'],
    'app.noClientFoundSearch': ['Nenhum cliente encontrado {target}', 'No clients found {target}', 'No se encontraron clientes {target}'],
    'app.searchTarget': ['para "{query}"', 'for “{query}”', 'para «{query}»'],
    'app.filterTarget': ['com esse filtro', 'with this filter', 'con ese filtro'],
    'app.recordOne': ['{count} registro', '{count} record', '{count} registro'],
    'app.recordMany': ['{count} registros', '{count} records', '{count} registros'],
    'app.viewDocuments': ['Ver documentos', 'View documents', 'Ver documentos'],
    'app.clickToEdit': ['Clique para editar', 'Click to edit', 'Haz clic para editar'],
    'app.changePaymentStatus': ['Clique para mudar o status do pagamento', 'Click to change the payment status', 'Haz clic para cambiar el estado del pago'],
    'app.informAmount': ['informar quanto entrou', 'enter how much came in', 'informar cuánto entró'],
    'app.deleteRecordTitle': ['Excluir registro?', 'Delete record?', '¿Eliminar registro?'],
    'app.deleteRecordDesc': [
      'O cliente <strong>{name}</strong> será removido permanentemente.',
      'Client <strong>{name}</strong> will be permanently removed.',
      'El cliente <strong>{name}</strong> se eliminará permanentemente.',
    ],
    'app.sharedParticipants': ['👥 Compartilhado com participantes', '👥 Shared with participants', '👥 Compartido con participantes'],
    'app.privateData': ['🔒 Dados privados', '🔒 Private data', '🔒 Datos privados'],
    'app.editClient': ['Editar cliente', 'Edit client', 'Editar cliente'],
    'app.updateClientDesc': ['Atualize o perfil cadastral e financeiro.', 'Update the client profile and financial details.', 'Actualiza el perfil y los datos financieros.'],
    'app.newClientDesc': ['Centralize dados cadastrais, endereço e cobrança.', 'Keep profile, address, and billing details together.', 'Centraliza datos personales, dirección y cobro.'],
    'app.personalData': ['Dados pessoais', 'Personal details', 'Datos personales'],
    'app.phone': ['Telefone', 'Phone', 'Teléfono'],
    'app.cpfOptional': ['CPF/CNPJ (opcional)', 'CPF/CNPJ (optional)', 'CPF/CNPJ (opcional)'],
    'app.checkCnpj': ['Consultar CNPJ', 'Look up CNPJ', 'Consultar CNPJ'],
    'app.birthDate': ['Data de nascimento', 'Date of birth', 'Fecha de nacimiento'],
    'app.maritalStatus': ['Estado civil', 'Marital status', 'Estado civil'],
    'app.select': ['Selecione', 'Select', 'Selecciona'],
    'app.education': ['Escolaridade', 'Education', 'Escolaridad'],
    'app.eduPrimaryIncomplete': ['Ensino fundamental incompleto', 'Incomplete primary education', 'Educación primaria incompleta'],
    'app.eduPrimaryComplete': ['Ensino fundamental completo', 'Primary education complete', 'Educación primaria completa'],
    'app.eduSecondaryIncomplete': ['Ensino médio incompleto', 'Incomplete secondary education', 'Educación secundaria incompleta'],
    'app.eduSecondaryComplete': ['Ensino médio completo', 'Secondary education complete', 'Educación secundaria completa'],
    'app.eduHigherIncomplete': ['Ensino superior incompleto', 'Incomplete higher education', 'Educación superior incompleta'],
    'app.eduHigherComplete': ['Ensino superior completo', 'Higher education complete', 'Educación superior completa'],
    'app.eduPostgraduate': ['Pós-graduação', 'Postgraduate degree', 'Posgrado'],
    'app.eduMasters': ['Mestrado', 'Master’s degree', 'Maestría'],
    'app.eduDoctorate': ['Doutorado', 'Doctorate', 'Doctorado'],
    'app.preferNotSay': ['Prefiro não informar', 'Prefer not to say', 'Prefiero no informar'],
    'app.maritalSingle': ['Solteiro(a)', 'Single', 'Soltero(a)'],
    'app.maritalMarried': ['Casado(a)', 'Married', 'Casado(a)'],
    'app.maritalDomestic': ['União estável', 'Domestic partnership', 'Unión de hecho'],
    'app.maritalSeparated': ['Separado(a)', 'Separated', 'Separado(a)'],
    'app.maritalDivorced': ['Divorciado(a)', 'Divorced', 'Divorciado(a)'],
    'app.maritalWidowed': ['Viúvo(a)', 'Widowed', 'Viudo(a)'],
    'app.serviceBilling': ['Atendimento e cobrança', 'Service and billing', 'Atención y cobro'],
    'app.recordTemplate': ['Modelo da ficha', 'Record template', 'Modelo de la ficha'],
    'app.followUpType': ['Tipo de acompanhamento', 'Follow-up type', 'Tipo de seguimiento'],
    'app.simpleRecord': ['Ficha simples', 'Simple record', 'Ficha simple'],
    'app.descriptionOptional': ['Descrição (opcional)', 'Description (optional)', 'Descripción (opcional)'],
    'app.servicePlaceholder': ['Serviço prestado, projeto, etc.', 'Service provided, project, etc.', 'Servicio prestado, proyecto, etc.'],
    'app.dueDate': ['Data de vencimento', 'Due date', 'Fecha de vencimiento'],
    'app.addressSection': ['Endereço', 'Address', 'Dirección'],
    'app.cepOptional': ['CEP (opcional)', 'CEP (optional)', 'CEP (opcional)'],
    'app.searchCep': ['Buscar CEP', 'Look up CEP', 'Buscar CEP'],
    'app.addressOptional': ['Endereço (opcional)', 'Address (optional)', 'Dirección (opcional)'],
    'app.addressPlaceholder': ['Rua, número e complemento', 'Street, number, and additional details', 'Calle, número y complemento'],
    'app.neighborhood': ['Bairro', 'Neighborhood', 'Barrio'],
    'app.state': ['Estado', 'State', 'Estado'],
    'app.city': ['Município', 'City', 'Municipio'],
    'app.loadingStates': ['Carregando estados…', 'Loading states…', 'Cargando estados…'],
    'app.loadingCities': ['Carregando municípios…', 'Loading cities…', 'Cargando municipios…'],
    'app.selectCity': ['Selecione o município', 'Select a city', 'Selecciona el municipio'],
    'app.citiesUnavailable': ['Municípios indisponíveis', 'Cities unavailable', 'Municipios no disponibles'],
    'app.statesUnavailable': ['Estados indisponíveis', 'States unavailable', 'Estados no disponibles'],
    'app.filesAndStatus': ['Arquivos e status', 'Files and status', 'Archivos y estado'],
    'app.documentsOptional': ['Documentos (opcional)', 'Documents (optional)', 'Documentos (opcional)'],
    'app.attachDocument': ['📎 Anexar documento (CPF, contrato, etc.)', '📎 Attach document (ID, contract, etc.)', '📎 Adjuntar documento (ID, contrato, etc.)'],
    'app.paymentStatusLabel': ['Status do pagamento', 'Payment status', 'Estado del pago'],
    'app.addClientButton': ['Adicionar', 'Add', 'Añadir'],
    'app.consulting': ['Consultando…', 'Looking up…', 'Consultando…'],
    'app.consultingCompany': ['Consultando dados públicos da empresa…', 'Looking up public company data…', 'Consultando datos públicos de la empresa…'],
    'app.companyFound': ['Empresa encontrada.', 'Company found.', 'Empresa encontrada.'],
    'app.cnpjNotFound': ['CNPJ não encontrado.', 'CNPJ not found.', 'CNPJ no encontrado.'],
    'app.enterCepDigits': ['Informe os 8 dígitos do CEP.', 'Enter all 8 CEP digits.', 'Introduce los 8 dígitos del CEP.'],
    'app.searching': ['Buscando…', 'Searching…', 'Buscando…'],
    'app.searchingAddress': ['Buscando endereço…', 'Looking up address…', 'Buscando dirección…'],
    'app.cepNotFound': ['CEP não encontrado.', 'CEP not found.', 'CEP no encontrado.'],
    'app.clickToView': ['Clique para visualizar', 'Click to view', 'Haz clic para ver'],
    'app.securePreview': [
      'Prévia sem scripts, por segurança. Baixe o arquivo para abrir a página completa.',
      'Script-free preview for your safety. Download the file to open the complete page.',
      'Vista previa sin scripts por seguridad. Descarga el archivo para abrir la página completa.',
    ],
    'app.pageOpenError': ['Não foi possível abrir esta página.', 'Could not open this page.', 'No se pudo abrir esta página.'],
    'app.loadingPdf': ['Carregando PDF…', 'Loading PDF…', 'Cargando PDF…'],
    'app.pdfLoadError': ['Não foi possível carregar o PDF.', 'Could not load the PDF.', 'No se pudo cargar el PDF.'],
    'app.downloadFile': ['Baixar arquivo', 'Download file', 'Descargar archivo'],
    'app.previewUnavailable': [
      'Pré-visualização não disponível para este tipo de arquivo.',
      'Preview is not available for this file type.',
      'La vista previa no está disponible para este tipo de archivo.',
    ],
    'app.view': ['Visualizar', 'View', 'Ver'],
    'app.attachFile': ['＋ Anexar arquivo', '＋ Attach file', '＋ Adjuntar archivo'],
    'app.summarizeAi': ['✦ Resumir', '✦ Summarize', '✦ Resumir'],
    'app.summarizeAiTitle': ['Resumir com IA', 'Summarize with AI', 'Resumir con IA'],
    'app.pdfJsUnavailable': ['PDF.js não carregou.', 'PDF.js did not load.', 'PDF.js no cargó.'],
    'app.downloadPdf': ['Baixar PDF', 'Download PDF', 'Descargar PDF'],
    'app.pdfRenderError': ['Erro ao renderizar PDF.', 'Could not render the PDF.', 'Error al renderizar el PDF.'],
    'app.pdfViewerError': ['Não foi possível carregar o visualizador de PDF.', 'Could not load the PDF viewer.', 'No se pudo cargar el visor de PDF.'],
    'app.openingDocument': ['Abrindo documento…', 'Opening document…', 'Abriendo documento…'],
    'app.signInSummary': ['Faça login para usar o resumo.', 'Sign in to use summaries.', 'Inicia sesión para usar los resúmenes.'],
    'app.summaryError': ['Não foi possível gerar o resumo.', 'Could not generate the summary.', 'No se pudo generar el resumen.'],
    'app.keyPoints': ['✦ Pontos principais', '✦ Key points', '✦ Puntos principales'],
    'app.keyPointsTitle': ['Resumir os pontos importantes com IA', 'Summarize the key points with AI', 'Resumir los puntos importantes con IA'],
    'app.summarizing': ['Resumindo…', 'Summarizing…', 'Resumiendo…'],
    'app.longDocumentSummary': ['Documento longo: resumido até o limite de leitura. ', 'Long document: summarized up to the reading limit. ', 'Documento largo: resumido hasta el límite de lectura. '],
    'app.copyFailedShort': ['Não deu', 'Failed', 'Falló'],
    'app.noNotesSummary': ['Não há notas para resumir.', 'There are no notes to summarize.', 'No hay notas para resumir.'],
    'app.notEnoughSummary': ['Há pouco conteúdo para um resumo útil.', 'There is not enough content for a useful summary.', 'Hay poco contenido para un resumen útil.'],
    'app.preparingWeeklySummary': ['Preparando o resumo da semana…', 'Preparing the weekly summary…', 'Preparando el resumen semanal…'],
    'app.checkClientEmail': ['Confira o e-mail do cliente.', 'Check the client email.', 'Revisa el correo del cliente.'],
    'app.brazilValidationUnavailable': [
      'A validação brasileira está temporariamente indisponível. Recarregue a página.',
      'Brazilian document validation is temporarily unavailable. Reload the page.',
      'La validación brasileña no está disponible temporalmente. Recarga la página.',
    ],
    'app.checkCpfCnpj': ['Confira o CPF ou CNPJ informado.', 'Check the CPF or CNPJ.', 'Revisa el CPF o CNPJ ingresado.'],
    'app.checkBirthDate': ['Confira a data de nascimento.', 'Check the date of birth.', 'Revisa la fecha de nacimiento.'],
    'app.checkDueYear': ['Confira o ano do vencimento.', 'Check the due-date year.', 'Revisa el año del vencimiento.'],
    'app.clientUpdated': ['Cliente atualizado!', 'Client updated!', '¡Cliente actualizado!'],

    'app.sendGoogleQuestion': ['Enviar para o Google {type}?', 'Send to Google {type}?', '¿Enviar a Google {type}?'],
    'app.googleSheetDescriptionOne': [
      'O MyDesk criará uma planilha com {count} cliente da lista exibida na conta Google que você escolher.',
      'MyDesk will create a spreadsheet with {count} client from the displayed list in the Google account you choose.',
      'MyDesk creará una hoja con {count} cliente de la lista mostrada en la cuenta de Google que elijas.',
    ],
    'app.googleSheetDescriptionMany': [
      'O MyDesk criará uma planilha com {count} clientes da lista exibida na conta Google que você escolher.',
      'MyDesk will create a spreadsheet with {count} clients from the displayed list in the Google account you choose.',
      'MyDesk creará una hoja con {count} clientes de la lista mostrada en la cuenta de Google que elijas.',
    ],
    'app.googleDocDescription': [
      'O MyDesk criará uma ficha cadastral deste cliente na conta Google que você escolher.',
      'MyDesk will create this client’s profile in the Google account you choose.',
      'MyDesk creará la ficha de este cliente en la cuenta de Google que elijas.',
    ],
    'app.dataSent': ['Dados que serão enviados', 'Data that will be sent', 'Datos que se enviarán'],
    'app.dataSentDescription': [
      'Nome e contato, CPF/CNPJ, nascimento, escolaridade, estado civil, endereço, atendimento e cobrança. Anexos não são incluídos e o token não é armazenado.',
      'Name and contact details, CPF/CNPJ, date of birth, education, marital status, address, service, and billing. Attachments are not included and the token is not stored.',
      'Nombre y contacto, CPF/CNPJ, nacimiento, escolaridad, estado civil, dirección, atención y cobro. No se incluyen adjuntos y el token no se almacena.',
    ],
    'app.authorizeCreate': ['Autorizar e criar →', 'Authorize and create →', 'Autorizar y crear →'],
    'app.connectingGoogle': ['Conectando ao Google…', 'Connecting to Google…', 'Conectando con Google…'],
    'app.googleAuthorizeError': ['Não foi possível autorizar a conta Google.', 'Could not authorize the Google account.', 'No se pudo autorizar la cuenta de Google.'],
    'app.googleSecureNotLoaded': [
      'A conexão segura do Google não carregou. Recarregue a página e tente novamente.',
      'The secure Google connection did not load. Reload the page and try again.',
      'La conexión segura de Google no cargó. Recarga la página e inténtalo de nuevo.',
    ],
    'app.googleSessionEnded': ['A sessão do Google foi encerrada.', 'The Google session ended.', 'La sesión de Google terminó.'],
    'app.googleAccessDenied': ['O Google não concedeu acesso para criar o arquivo.', 'Google did not grant access to create the file.', 'Google no concedió acceso para crear el archivo.'],
    'app.googlePermissionDenied': ['A permissão para criar arquivos não foi concedida.', 'Permission to create files was not granted.', 'No se concedió permiso para crear archivos.'],
    'app.googleAuthorizationCancelled': ['A autorização do Google foi cancelada.', 'Google authorization was canceled.', 'Se canceló la autorización de Google.'],
    'app.googlePopupBlocked': ['O navegador bloqueou a janela do Google. Libere pop-ups e tente novamente.', 'The browser blocked the Google window. Allow pop-ups and try again.', 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes e inténtalo de nuevo.'],
    'app.googleConnectError': ['Não foi possível conectar à conta Google.', 'Could not connect to the Google account.', 'No se pudo conectar con la cuenta de Google.'],
    'app.googleOpenAuthError': ['Não foi possível abrir a autorização do Google.', 'Could not open Google authorization.', 'No se pudo abrir la autorización de Google.'],
    'app.googleAuthExpired': ['A autorização do Google expirou. Clique novamente para reconectar.', 'Google authorization expired. Click again to reconnect.', 'La autorización de Google expiró. Haz clic de nuevo para reconectar.'],
    'app.googleApisDisabled': [
      'A API do Google ainda não está habilitada no projeto MyDesk. Ative Google Docs API e Google Sheets API no Google Cloud e tente novamente.',
      'The Google API is not enabled for the MyDesk project. Enable the Google Docs API and Google Sheets API in Google Cloud and try again.',
      'La API de Google aún no está habilitada en el proyecto MyDesk. Activa Google Docs API y Google Sheets API en Google Cloud e inténtalo de nuevo.',
    ],
    'app.googleRequiredPermission': ['A conta Google não concedeu a permissão necessária para criar este arquivo.', 'The Google account did not grant the permission required to create this file.', 'La cuenta de Google no concedió el permiso necesario para crear este archivo.'],
    'app.googleRateLimit': ['O Google recebeu muitas solicitações. Aguarde um instante e tente novamente.', 'Google received too many requests. Wait a moment and try again.', 'Google recibió demasiadas solicitudes. Espera un momento e inténtalo de nuevo.'],
    'app.googleCreateError': ['O Google não conseguiu criar o arquivo.', 'Google could not create the file.', 'Google no pudo crear el archivo.'],
    'app.googleFileIncomplete': ['Arquivo criado, mas incompleto', 'File created, but incomplete', 'Archivo creado, pero incompleto'],
    'app.googleFileCreated': ['Arquivo criado no Google {type}', 'File created in Google {type}', 'Archivo creado en Google {type}'],
    'app.openGoogle': ['Abrir no Google →', 'Open in Google →', 'Abrir en Google →'],
    'app.googleExportBusy': ['Uma exportação Google já está em andamento.', 'A Google export is already in progress.', 'Ya hay una exportación de Google en curso.'],
    'app.connectingGoogleDocs': ['Conectando ao Google Docs…', 'Connecting to Google Docs…', 'Conectando con Google Docs…'],
    'app.googleDocCreated': ['Ficha criada no Google Docs.', 'Profile created in Google Docs.', 'Ficha creada en Google Docs.'],
    'app.googleDocCreateError': ['Não foi possível criar a ficha no Google Docs.', 'Could not create the profile in Google Docs.', 'No se pudo crear la ficha en Google Docs.'],
    'app.googleDocPartial': ['A ficha foi criada, mas não pôde ser preenchida por completo.', 'The profile was created but could not be filled completely.', 'La ficha se creó, pero no pudo completarse.'],
    'app.noClientsToExport': ['Não há clientes na lista exibida para exportar.', 'There are no clients in the displayed list to export.', 'No hay clientes en la lista mostrada para exportar.'],
    'app.connectingGoogleSheets': ['Conectando ao Google Sheets…', 'Connecting to Google Sheets…', 'Conectando con Google Sheets…'],
    'app.googleFormattingWarning': ['Os dados foram enviados, mas o Google não aplicou toda a formatação visual.', 'The data was sent, but Google did not apply all visual formatting.', 'Los datos se enviaron, pero Google no aplicó todo el formato visual.'],
    'app.clientsExportedOne': ['{count} cliente exportado para o Google Sheets.', '{count} client exported to Google Sheets.', '{count} cliente exportado a Google Sheets.'],
    'app.clientsExportedMany': ['{count} clientes exportados para o Google Sheets.', '{count} clients exported to Google Sheets.', '{count} clientes exportados a Google Sheets.'],
    'app.googleSheetCreateError': ['Não foi possível criar a planilha no Google Sheets.', 'Could not create the spreadsheet in Google Sheets.', 'No se pudo crear la hoja en Google Sheets.'],
    'app.googleSheetPartial': ['A planilha foi criada, mas não recebeu todos os dados.', 'The spreadsheet was created but did not receive all data.', 'La hoja se creó, pero no recibió todos los datos.'],
    'app.cardExportedWord': ['Ficha exportada! Abre com o Word.', 'Profile exported! It opens in Word.', '¡Ficha exportada! Se abre con Word.'],
    'app.clientProfileTitle': ['Ficha de cliente — {name}', 'Client profile — {name}', 'Ficha de cliente — {name}'],
    'app.clientCard': ['Ficha de Cliente', 'Client Profile', 'Ficha de cliente'],
    'app.createdInMyDesk': ['Criada no MyDesk em {date}', 'Created in MyDesk on {date}', 'Creada en MyDesk el {date}'],
    'app.personalDataUpper': ['DADOS PESSOAIS', 'PERSONAL DETAILS', 'DATOS PERSONALES'],
    'app.addressUpper': ['ENDEREÇO', 'ADDRESS', 'DIRECCIÓN'],
    'app.serviceBillingUpper': ['ATENDIMENTO E COBRANÇA', 'SERVICE AND BILLING', 'ATENCIÓN Y COBRO'],
    'app.instalmentN': ['Parcela {n} de {total}', 'Instalment {n} of {total}', 'Cuota {n} de {total}'],
    'app.instalmentCount': ['{n} parcelas', '{n} instalments', '{n} cuotas'],
    'app.instalmentPaidOf': ['{pagas} de {total} pagas', '{pagas} of {total} paid', '{pagas} de {total} pagadas'],
    'app.instalmentLate': ['{n} em atraso', '{n} overdue', '{n} vencidas'],
    'app.instalmentReceived': ['{valor} recebido', '{valor} received', '{valor} recibido'],
    'app.instalmentDone': ['quitada', 'settled', 'liquidada'],
    'app.instalmentShowAll': ['Ver as outras {n} parcelas', 'Show the other {n} instalments', 'Ver las otras {n} cuotas'],
    'app.instalmentShowLess': ['Mostrar menos', 'Show less', 'Mostrar menos'],
    'app.statusPaid': ['Pago', 'Paid', 'Pagado'],
    'app.statusPending': ['Pendente', 'Pending', 'Pendiente'],
    'app.statusOverdue': ['Atrasado', 'Overdue', 'Atrasado'],
    'app.noDefinedDate': ['Sem data definida', 'No date set', 'Sin fecha definida'],
    'app.exportedFromMyDesk': ['Exportado do MyDesk em {date}', 'Exported from MyDesk on {date}', 'Exportado de MyDesk el {date}'],
    'app.attachedDocuments': ['Documentos anexados', 'Attached documents', 'Documentos adjuntos'],
    'app.locality': ['Localidade', 'Location', 'Localidad'],

    /* O admin consome o mesmo catálogo. O markup/JS dele é integrado em outra
       frente para evitar conflito de edição, mas as chaves já ficam disponíveis. */
    'admin.title': ['Administração', 'Administration', 'Administración'],
    'admin.overview': ['Visão geral', 'Overview', 'Vista general'],
    'admin.users': ['Usuários', 'Users', 'Usuarios'],
    'admin.subscriptions': ['Assinaturas', 'Subscriptions', 'Suscripciones'],
    'admin.administrators': ['Administradores', 'Administrators', 'Administradores'],
    'admin.activity': ['Atividade', 'Activity', 'Actividad'],
    'admin.reports': ['Reportes', 'Reports', 'Reportes'],
    'admin.settings': ['Configurações', 'Settings', 'Configuración'],
    'admin.backToMyDesk': ['Voltar ao MyDesk', 'Back to MyDesk', 'Volver a MyDesk'],
    'admin.searchUsers': [
      'Buscar por nome, @, e-mail ou UID…',
      'Search by name, @, email or UID…',
      'Buscar por nombre, @, correo o UID…',
    ],
    /* Placeholder, title e aria-label também são traduzidos pelo i18n, e também
       por comparação de texto. Ficaram de fora até agora — e o aria-label é o
       que o leitor de tela anuncia, então em inglês a navegação era anunciada
       em português. */
    'admin.searchReports': [
      'Buscar por título, descrição, @ ou e-mail…',
      'Search by title, description, @ or email…',
      'Buscar por título, descripción, @ o correo…',
    ],
    'admin.reload': ['Recarregar', 'Reload', 'Recargar'],
    'admin.reloadData': ['Recarregar dados', 'Reload data', 'Recargar datos'],
    'admin.adminConnected': ['Administrador conectado', 'Administrator signed in', 'Administrador conectado'],
    'admin.navAdmin': ['Navegação administrativa', 'Administrative navigation', 'Navegación administrativa'],
    'admin.openMenu': ['Abrir menu', 'Open menu', 'Abrir menú'],
    'admin.searchUser': ['Buscar usuário', 'Search user', 'Buscar usuario'],
    'admin.filterUsers': ['Filtrar usuários', 'Filter users', 'Filtrar usuarios'],
    'admin.sortUsers': ['Ordenar usuários', 'Sort users', 'Ordenar usuarios'],
    'admin.itemsPerPage': ['Itens por página', 'Items per page', 'Elementos por página'],
    'admin.filterSubs': ['Filtrar assinaturas', 'Filter subscriptions', 'Filtrar suscripciones'],
    'admin.searchReportsLabel': ['Buscar reportes', 'Search reports', 'Buscar reportes'],
    'admin.filterReportsStatus': [
      'Filtrar reportes por status',
      'Filter reports by status',
      'Filtrar reportes por estado',
    ],
    'admin.filterReportsCategory': [
      'Filtrar reportes por categoria',
      'Filter reports by category',
      'Filtrar reportes por categoría',
    ],
    'admin.closeDetails': ['Fechar detalhes', 'Close details', 'Cerrar detalles'],
    'admin.filter': ['Filtro', 'Filter', 'Filtro'],
    'admin.sort': ['Ordenar', 'Sort', 'Ordenar'],
    'admin.perPage': ['Por página', 'Per page', 'Por página'],
    'admin.all': ['Todos', 'All', 'Todos'],
    'admin.mostRecent': ['Mais recentes', 'Most recent', 'Más recientes'],
    'admin.name': ['Nome', 'Name', 'Nombre'],
    'admin.email': ['E-mail', 'Email', 'Correo'],
    'admin.plan': ['Plano', 'Plan', 'Plan'],
    'admin.monthlyUse': ['Uso mensal', 'Monthly usage', 'Uso mensual'],
    'admin.status': ['Status', 'Status', 'Estado'],
    'admin.lastAccess': ['Último acesso', 'Last access', 'Último acceso'],
    'admin.reportTitle': ['Reportes de usuários', 'User reports', 'Reportes de usuarios'],
    'admin.reportOpen': ['Aberto', 'Open', 'Abierto'],
    'admin.reportInProgress': ['Em análise', 'In review', 'En revisión'],
    'admin.reportResolved': ['Resolvido', 'Resolved', 'Resuelto'],
    'admin.reportClosed': ['Fechado', 'Closed', 'Cerrado'],
    'admin.reportProblem': ['Problema reportado', 'Reported issue', 'Problema reportado'],
    'admin.reportReply': ['Resposta do administrador', 'Administrator reply', 'Respuesta del administrador'],
    'admin.reportMarkResolved': ['Marcar como resolvido', 'Mark as resolved', 'Marcar como resuelto'],
    'admin.reportEmpty': ['Nenhum reporte encontrado', 'No reports found', 'No se encontraron reportes'],
    'admin.premiumNotice': [
      '{name} acabou de virar Premium.',
      '{name} just upgraded to Premium.',
      '{name} acaba de hacerse Premium.',
    ],

    /* ── Texto da página admin que ainda não tinha tradução ──────────────
       O português aqui precisa ser IGUAL, caractere por caractere, ao que
       está em admin/index.html: a tradução casa pelo texto de origem, e uma
       vírgula de diferença faz a chave nunca disparar.

       O portão de entrada entra primeiro de propósito — é a primeira tela que
       a página mostra, antes de qualquer permissão ser confirmada, e era ela
       que aparecia em português com a interface em inglês. */
    'admin.gateChecking': ['Verificando acesso…', 'Checking access…', 'Verificando acceso…'],
    'admin.gateConfirming': [
      'Confirmando a sua sessão e a permissão administrativa.',
      'Confirming your session and administrative permission.',
      'Confirmando tu sesión y el permiso administrativo.',
    ],
    'admin.gateGoApp': ['Ir para o MyDesk', 'Go to MyDesk', 'Ir a MyDesk'],

    'admin.controlCenter': ['Central de controle', 'Control center', 'Centro de control'],
    'admin.freeAndPremium': ['Grátis e Premium', 'Free and Premium', 'Gratis y Premium'],
    'admin.signupsPerMonth': ['Cadastros por mês', 'Sign-ups per month', 'Registros por mes'],
    'admin.lastSixMonths': ['últimos 6 meses', 'last 6 months', 'últimos 6 meses'],
    'admin.subsWithDueDate': [
      'Assinaturas com vencimento',
      'Subscriptions with a due date',
      'Suscripciones con vencimiento',
    ],
    'admin.subsSortHint': [
      'todas, da mais próxima para a mais distante',
      'all, from soonest to furthest',
      'todas, de la más próxima a la más lejana',
    ],

    'admin.online': ['Online', 'Online', 'En línea'],
    'admin.offline': ['Offline', 'Offline', 'Sin conexión'],
    'admin.blocked': ['Bloqueados', 'Blocked', 'Bloqueados'],
    'admin.deleteBlocked': ['Excluir bloqueadas', 'Delete blocked', 'Eliminar bloqueadas'],
    'admin.oldest': ['Mais antigos', 'Oldest', 'Más antiguos'],
    'admin.highestUse': ['Maior uso', 'Highest usage', 'Mayor uso'],
    'admin.lowestUse': ['Menor uso', 'Lowest usage', 'Menor uso'],
    'admin.show': ['Mostrar', 'Show', 'Mostrar'],
    'admin.allPremium': ['Todas as Premium', 'All Premium', 'Todas las Premium'],
    'admin.activeFem': ['Ativas', 'Active', 'Activas'],
    'admin.dueInSevenDays': ['Vencendo em 7 dias', 'Due in 7 days', 'Vencen en 7 días'],
    'admin.overdueFem': ['Vencidas', 'Overdue', 'Vencidas'],
    'admin.noDueDate': ['Sem prazo', 'No due date', 'Sin plazo'],
    'admin.grantPremium': ['＋ Conceder Premium', '＋ Grant Premium', '＋ Conceder Premium'],
    'admin.openMasc': ['Abertos', 'Open', 'Abiertos'],
    'admin.resolvedMasc': ['Resolvidos', 'Resolved', 'Resueltos'],
    'admin.category': ['Categoria', 'Category', 'Categoría'],
    'admin.allFem': ['Todas', 'All', 'Todas'],
    'admin.issue': ['Problema', 'Issue', 'Problema'],
    'admin.user': ['Usuário', 'User', 'Usuario'],

    /* Texto que o admin.js escreve na tela: cabeçalho de tabela, estado vazio e
       erro de formulário. Diferente do bloco acima, este não casa por texto —
       é montado por innerHTML depois que a página carregou, então precisa
       passar pelo tr() com a chave. */
    /* ── Visão geral do admin ──────────────────────────────────────────
       Tudo aqui é montado pelo admin.js depois que a página carrega, então
       precisa de chave: a comparação por texto só alcança o HTML estático. */
    'admin.navigation': ['Navegação', 'Navigation', 'Navegación'],
    'admin.cardTotalUsers': ['Total de usuários', 'Total users', 'Total de usuarios'],
    'admin.cardPremiumActive': ['Premium ativos', 'Active Premium', 'Premium activos'],
    'admin.cardFree': ['Gratuitos', 'Free', 'Gratuitos'],
    'admin.cardOnlineNow': ['Online agora', 'Online now', 'En línea ahora'],
    'admin.cardNewToday': ['Novos hoje', 'New today', 'Nuevos hoy'],
    'admin.cardNewSevenDays': ['Novos em 7 dias', 'New in 7 days', 'Nuevos en 7 días'],
    'admin.cardAdmins': ['Administradores', 'Administrators', 'Administradores'],
    'admin.cardDueSevenDays': ['Vencem em 7 dias', 'Due in 7 days', 'Vencen en 7 días'],
    'admin.cardBlocked': ['Contas bloqueadas', 'Blocked accounts', 'Cuentas bloqueadas'],
    'admin.platformSnapshot': [
      'Visão atual da plataforma',
      'Current platform snapshot',
      'Vista actual de la plataforma',
    ],
    'admin.percentOfBase': ['{pct}% da base', '{pct}% of the base', '{pct}% de la base'],
    'admin.withoutSignupDate': [
      '{n} sem data de cadastro',
      '{n} without a sign-up date',
      '{n} sin fecha de registro',
    ],
    'admin.planPremium': ['Premium', 'Premium', 'Premium'],
    'admin.planFree': ['Grátis', 'Free', 'Gratis'],
    'admin.activeAccountsMonth': [
      'Contas ativas no mês',
      'Active accounts this month',
      'Cuentas activas del mes',
    ],
    'admin.vsPreviousMonth': [
      '{sinal}{pct}% vs. mês anterior',
      '{sinal}{pct}% vs. previous month',
      '{sinal}{pct}% vs. mes anterior',
    ],
    'admin.lastSevenDays': ['Nos últimos 7 dias', 'In the last 7 days', 'En los últimos 7 días'],
    'admin.signedInAtLeastOnce': [
      'entraram pelo menos uma vez',
      'signed in at least once',
      'entraron al menos una vez',
    ],
    'admin.lastTwentyFourHours': ['Nas últimas 24h', 'In the last 24h', 'En las últimas 24h'],
    'admin.newAccountsMonth': ['Novas contas no mês', 'New accounts this month', 'Cuentas nuevas del mes'],
    'admin.signInsNotVisits': [
      'Contas que entraram, não visitas ao site',
      'Accounts that signed in, not site visits',
      'Cuentas que entraron, no visitas al sitio',
    ],
    'admin.adminOutOne': [
      '{n} administrador fora da conta',
      '{n} administrator not counted',
      '{n} administrador fuera del conteo',
    ],
    'admin.adminOutMany': [
      '{n} administradores fora da conta',
      '{n} administrators not counted',
      '{n} administradores fuera del conteo',
    ],
    'admin.revenue': ['Receita', 'Revenue', 'Ingresos'],
    'admin.revenueLead': [
      'Assinaturas ativas, renovações previstas e faturas em aberto — direto da Stripe.',
      'Active subscriptions, upcoming renewals and open invoices — straight from Stripe.',
      'Suscripciones activas, renovaciones previstas y facturas abiertas — directo de Stripe.',
    ],
    'admin.loadRevenue': ['Carregar receita', 'Load revenue', 'Cargar ingresos'],
    'admin.stripeQueryFailed': [
      'Não deu para consultar a Stripe',
      'Could not query Stripe',
      'No se pudo consultar Stripe',
    ],
    'admin.tryAgainMoment': [
      'Tente de novo em instantes.',
      'Try again in a moment.',
      'Inténtalo de nuevo en un momento.',
    ],
    'admin.tryAgain': ['Tentar de novo', 'Try again', 'Intentar de nuevo'],

    'admin.userActions': ['Ações para este usuário', 'Actions for this user', 'Acciones para este usuario'],
    'admin.userDetails': ['Detalhes do usuário', 'User details', 'Detalles del usuario'],
    'admin.noUsersFound': ['Nenhum usuário encontrado', 'No users found', 'No se encontraron usuarios'],
    'admin.tryAnotherTerm': [
      'Tente outro termo ou limpe o filtro.',
      'Try another term or clear the filter.',
      'Prueba otro término o limpia el filtro.',
    ],
    'admin.noUsersForFilter': [
      'Não há usuários que atendam a este filtro.',
      'No users match this filter.',
      'No hay usuarios que cumplan este filtro.',
    ],
    'admin.colStart': ['Início', 'Start', 'Inicio'],
    'admin.colDue': ['Vencimento', 'Due date', 'Vencimiento'],
    'admin.colSituation': ['Situação', 'Situation', 'Situación'],
    'admin.colSource': ['Origem', 'Source', 'Origen'],
    'admin.colReceivedOn': ['Recebeu em', 'Received on', 'Recibido el'],
    'admin.colGrantedBy': ['Concedido por', 'Granted by', 'Concedido por'],
    'admin.colWhen': ['Quando', 'When', 'Cuándo'],
    'admin.colAction': ['Ação', 'Action', 'Acción'],
    'admin.colAffectedUser': ['Usuário afetado', 'Affected user', 'Usuario afectado'],
    'admin.colResponsible': ['Responsável', 'Responsible', 'Responsable'],
    'admin.colDetail': ['Detalhe', 'Detail', 'Detalle'],
    'admin.reportsUnavailable': ['Reportes indisponíveis', 'Reports unavailable', 'Reportes no disponibles'],
    'admin.saveUpdate': ['Salvar atualização', 'Save update', 'Guardar actualización'],
    'admin.reportUpdateFailed': [
      'Não foi possível atualizar o reporte.',
      'Could not update the report.',
      'No se pudo actualizar el reporte.',
    ],
    'admin.noAdmins': ['Nenhum administrador', 'No administrators', 'Ningún administrador'],
    'admin.noAdminAccounts': [
      'Nenhuma conta tem a permissão administrativa.',
      'No account has administrative permission.',
      'Ninguna cuenta tiene el permiso administrativo.',
    ],
    'admin.logUnavailable': ['Registro indisponível', 'Log unavailable', 'Registro no disponible'],
    'admin.logReadFailed': [
      'Não foi possível ler o histórico administrativo. Verifique as regras do banco.',
      'Could not read the administrative history. Check the database rules.',
      'No se pudo leer el historial administrativo. Revisa las reglas de la base de datos.',
    ],
    'admin.invalidDays': [
      'Informe um número de dias válido.',
      'Enter a valid number of days.',
      'Introduce un número de días válido.',
    ],
    'admin.chooseUser': ['Escolha um usuário.', 'Choose a user.', 'Elige un usuario.'],
    'admin.invalidDate': ['Data inválida.', 'Invalid date.', 'Fecha inválida.'],
    'admin.datePassed': [
      'A data já passou. Isso encerraria a assinatura imediatamente.',
      'That date has already passed. This would end the subscription immediately.',
      'Esa fecha ya pasó. Esto terminaría la suscripción de inmediato.',
    ],
    'admin.textMismatch': ['O texto não confere.', 'The text does not match.', 'El texto no coincide.'],
    /* ── Modelo de recrutamento da aba Clientes (docs/js/rh.js) ── */
    'rh.changeModel': ['Alterar modelo', 'Change model', 'Cambiar modelo'],
    'rh.switchModelHint': [
      'Alternar entre o painel financeiro e o de recrutamento',
      'Switch between the finance panel and the recruiting one',
      'Alternar entre el panel financiero y el de reclutamiento',
    ],
    'rh.modelFinance': ['Financeiro', 'Finance', 'Finanzas'],
    'rh.modelRecruiting': ['Recrutamento', 'Recruiting', 'Reclutamiento'],
    'rh.modelRecruitingShort': ['Recrutamento', 'Recruiting', 'Reclutamiento'],
    'rh.panelTitle': ['Painel de Recrutamento', 'Recruiting panel', 'Panel de reclutamiento'],
    'rh.searchCandidate': ['Buscar candidato...', 'Search candidate...', 'Buscar candidato...'],
    'rh.applicationsTitle': ['Candidaturas', 'Applications', 'Candidaturas'],
    'rh.funnelTitle': ['Funil por etapa', 'Funnel by stage', 'Embudo por etapa'],
    'rh.candidates': ['Candidatos', 'Candidates', 'Candidatos'],
    'rh.candidate': ['Candidato', 'Candidate', 'Candidato'],
    'rh.candidateOne': ['{count} candidato', '{count} candidate', '{count} candidato'],
    'rh.candidateMany': ['{count} candidatos', '{count} candidates', '{count} candidatos'],
    'rh.candidateCount': ['{count} candidatos', '{count} candidates', '{count} candidatos'],
    'rh.allCandidates': ['Todos os candidatos', 'All candidates', 'Todos los candidatos'],
    'rh.newCandidate': ['Novo candidato', 'New candidate', 'Nuevo candidato'],
    'rh.newCandidateDesc': [
      'Dados do candidato, vaga e etapas do processo seletivo.',
      'Candidate details, role and hiring stages.',
      'Datos del candidato, vacante y etapas del proceso.',
    ],
    'rh.kpiCandidates': ['Candidatos', 'Candidates', 'Candidatos'],
    'rh.kpiInterviews': ['Entrevistas marcadas', 'Interviews scheduled', 'Entrevistas agendadas'],
    'rh.kpiInProcess': ['Em processo', 'In process', 'En proceso'],
    'rh.kpiHireRate': ['Taxa de contratação', 'Hire rate', 'Tasa de contratación'],
    'rh.fromTodayOn': ['de hoje em diante', 'from today on', 'de hoy en adelante'],
    'rh.rejectedCount': ['{count} reprovados', '{count} rejected', '{count} rechazados'],
    'rh.noneRejected': ['ninguém reprovado', 'nobody rejected', 'nadie rechazado'],
    'rh.avgDaysToHire': ['{days} dias até admitir', '{days} days to hire', '{days} días para contratar'],
    'rh.noHireYet': ['sem admissão ainda', 'no hire yet', 'sin contratación aún'],
    'rh.noApplicationsPeriod': [
      'Nenhuma candidatura neste período',
      'No applications in this period',
      'Ninguna candidatura en este periodo',
    ],
    'rh.noCandidatesYet': ['Nenhum candidato ainda', 'No candidates yet', 'Aún no hay candidatos'],
    'rh.emptyTitle': ['Nenhum candidato ainda', 'No candidates yet', 'Aún no hay candidatos'],
    'rh.emptyDesc': [
      'Cada candidato é uma ficha com o modelo "Processo seletivo". Crie a primeira, ou receba candidaturas por um formulário público.',
      'Each candidate is a record using the "Hiring process" template. Create the first one, or collect applications through a public form.',
      'Cada candidato es una ficha con el modelo "Proceso de selección". Crea la primera, o recibe candidaturas por un formulario público.',
    ],
    'rh.dropHere': ['Arraste um candidato para cá', 'Drag a candidate here', 'Arrastra un candidato aquí'],
    'rh.openCard': ['Abrir a ficha do candidato', 'Open the candidate record', 'Abrir la ficha del candidato'],
    'rh.stepBack': ['Voltar uma etapa', 'Move back one stage', 'Retroceder una etapa'],
    'rh.stepForward': ['Avançar uma etapa', 'Move forward one stage', 'Avanzar una etapa'],
    'rh.rejected': ['Reprovado', 'Rejected', 'Rechazado'],
    'rh.hired': ['Admitido', 'Hired', 'Contratado'],
    'rh.hiredLabel': ['Admitidos', 'Hired', 'Contratados'],
    'rh.rejectedLabel': ['Reprovados', 'Rejected', 'Rechazados'],
    'rh.avgTimeLabel': ['Tempo médio', 'Average time', 'Tiempo medio'],
    'rh.daysUnit': ['dias', 'days', 'días'],
    'rh.inProcessNow': ['Em processo agora', 'In process right now', 'En proceso ahora'],
    'rh.reportTitle': ['Relatório de recrutamento', 'Recruiting report', 'Informe de reclutamiento'],
    'rh.reportFooter': [
      'Documento gerado automaticamente pelo MyDesk',
      'Document generated automatically by MyDesk',
      'Documento generado automáticamente por MyDesk',
    ],
    'rh.stageCol': ['Etapa', 'Stage', 'Etapa'],
    'rh.volumeCol': ['Volume', 'Volume', 'Volumen'],
    'rh.peopleCol': ['Pessoas', 'People', 'Personas'],
    'rh.byRoleTitle': ['Por vaga', 'By role', 'Por vacante'],
    'rh.roleCol': ['Vaga', 'Role', 'Vacante'],
    'rh.applicantsCol': ['Candidatos', 'Candidates', 'Candidatos'],
    'rh.noRole': ['sem vaga informada', 'no role given', 'sin vacante indicada'],
    'rh.candidatesTitle': ['Candidatos', 'Candidates', 'Candidatos'],
    'rh.nameCol': ['Nome', 'Name', 'Nombre'],
    'rh.interviewCol': ['Entrevista', 'Interview', 'Entrevista'],
    'rh.interviewWith': ['Entrevista · {name}', 'Interview · {name}', 'Entrevista · {name}'],
    'rh.print': ['Imprimir', 'Print', 'Imprimir'],
    'rh.closeEsc': ['Fechar (Esc)', 'Close (Esc)', 'Cerrar (Esc)'],
    'rh.closeReport': ['Fechar relatório', 'Close report', 'Cerrar informe'],
    'rh.addCandidatesFirst': [
      'Cadastre candidatos antes de gerar o relatório.',
      'Add candidates before generating the report.',
      'Registra candidatos antes de generar el informe.',
    ],
    'rh.unavailable': [
      'O modelo de recrutamento não está disponível agora. Recarregue a página.',
      'The recruiting model is not available right now. Reload the page.',
      'El modelo de reclutamiento no está disponible ahora. Recarga la página.',
    ],

    /* Formulário da vaga e triagem de currículos por IA (docs/js/rh.js) */
    'rh.reject': ['Reprovar candidato', 'Reject candidate', 'Rechazar candidato'],
    'rh.rejectOk': ['Reprovar', 'Reject', 'Rechazar'],
    'rh.rejectTitle': ['Reprovar candidato', 'Reject candidate', 'Rechazar candidato'],
    'rh.rejectSub': [
      '{name} sai do funil e passa a contar como reprovado. A ficha, a etapa em que parou e o currículo continuam guardados.',
      '{name} leaves the funnel and is counted as rejected. The record, the stage they reached and the résumé are kept.',
      '{name} sale del embudo y pasa a contar como rechazado. La ficha, la etapa en la que paró y el currículum se conservan.',
    ],
    'rh.rejectReason': [
      'Motivo (opcional, só você vê)',
      'Reason (optional, only you see it)',
      'Motivo (opcional, solo tú lo ves)',
    ],
    'rh.rejectReasonPh': [
      'Ex.: sem experiência com a ferramenta principal da vaga.',
      'Example: no experience with the main tool required for the role.',
      'Ej.: sin experiencia con la herramienta principal de la vacante.',
    ],
    'rh.rejectedOn': [
      'Reprovado em {date}: {reason}',
      'Rejected on {date}: {reason}',
      'Rechazado el {date}: {reason}',
    ],
    'rh.rejectedToast': [
      '{name} foi reprovado. Está no filtro "Reprovados".',
      '{name} was rejected. They are under the "Rejected" filter.',
      '{name} fue rechazado. Está en el filtro "Rechazados".',
    ],
    'rh.undoReject': ['Desfazer reprovação', 'Undo rejection', 'Deshacer rechazo'],
    'rh.undoRejectToast': [
      '{name} voltou ao funil.',
      '{name} is back in the funnel.',
      '{name} volvió al embudo.',
    ],
    'rh.rejectedFilter': ['Reprovados', 'Rejected', 'Rechazados'],
    'rh.hiddenOne': [
      '{count} candidato reprovado está fora do funil',
      '{count} rejected candidate is outside the funnel',
      '{count} candidato rechazado está fuera del embudo',
    ],
    'rh.hiddenMany': [
      '{count} candidatos reprovados estão fora do funil',
      '{count} rejected candidates are outside the funnel',
      '{count} candidatos rechazados están fuera del embudo',
    ],
    'rh.seeRejected': ['ver', 'show', 'ver'],
    'rh.showingRejected': [
      'Mostrando apenas os candidatos reprovados.',
      'Showing only rejected candidates.',
      'Mostrando solo los candidatos rechazados.',
    ],
    'rh.backToFunnel': ['voltar ao funil', 'back to the funnel', 'volver al embudo'],
    'rh.formsListError': [
      'Não consegui carregar os seus formulários agora.',
      'Could not load your forms right now.',
      'No pude cargar tus formularios ahora.',
    ],
    'rh.closedTag': ['encerrado', 'closed', 'cerrado'],
    'rh.deleteForm': ['Excluir formulário', 'Delete form', 'Eliminar formulario'],
    'rh.deleteFormTitle': [
      'Excluir o formulário?',
      'Delete the form?',
      '¿Eliminar el formulario?',
    ],
    'rh.deleteFormBody': [
      'O link para de existir e as {count} respostas guardadas nele são apagadas. Os candidatos que já entraram no funil continuam lá.',
      'The link stops existing and the {count} responses stored in it are deleted. Candidates already in the funnel stay there.',
      'El enlace deja de existir y las {count} respuestas guardadas en él se borran. Los candidatos que ya entraron en el embudo se quedan.',
    ],
    'rh.formDeleted': ['Formulário excluído.', 'Form deleted.', 'Formulario eliminado.'],
    'rh.formDeleteError': [
      'Não foi possível excluir o formulário agora.',
      'Could not delete the form right now.',
      'No se pudo eliminar el formulario ahora.',
    ],
    'rh.unnamedRole': ['Vaga sem nome', 'Unnamed role', 'Vacante sin nombre'],
    /* O mesmo texto que `clientFromResponse` grava quando o formulário não
       perguntou o nome — mudar aqui sem mudar lá faz a ficha e o relatório
       chamarem a mesma pessoa de coisas diferentes. */
    'rh.noName': ['Sem nome', 'No name', 'Sin nombre'],
    'rh.cardActions': ['Ações do candidato', 'Candidate actions', 'Acciones del candidato'],

    /* Aviso de etapa ao candidato (docs/js/app.js → crmAvisarCandidato) */
    'rh.notice': ['Avisar por e-mail', 'Notify by email', 'Avisar por correo'],
    'rh.noticeTitle': ['Avisar o candidato', 'Notify the candidate', 'Avisar al candidato'],
    'rh.noticeSub': [
      'Um e-mail para {name} dizendo {line}',
      'An email to {name} saying {line}',
      'Un correo a {name} diciendo {line}',
    ],
    'rh.noticeLineFwd': [
      'que avançou para a etapa "{stage}".',
      'they have moved forward to the "{stage}" stage.',
      'que avanzó a la etapa "{stage}".',
    ],
    'rh.noticeLineBack': [
      'que agora está na etapa "{stage}".',
      'they are now at the "{stage}" stage.',
      'que ahora está en la etapa "{stage}".',
    ],
    'rh.noticeLineDone': [
      'que concluiu todas as etapas do processo.',
      'they have completed every stage of the process.',
      'que completó todas las etapas del proceso.',
    ],
    'rh.noticeEmailLabel': [
      'E-mail do candidato', "Candidate's email", 'Correo del candidato',
    ],
    'rh.noticeEmailHint': [
      'Veio da ficha. Se você mudar aqui, a ficha muda junto.',
      'It came from the record. Changing it here changes the record too.',
      'Vino de la ficha. Si lo cambias aquí, la ficha cambia también.',
    ],
    'rh.noticeEmailAsk': [
      'A ficha está sem e-mail — o formulário não perguntou. Escreva um e ele fica salvo na ficha.',
      'The record has no email — the form never asked. Type one and it is saved to the record.',
      'La ficha no tiene correo: el formulario no lo pidió. Escribe uno y queda guardado en la ficha.',
    ],
    'rh.noticeEmailInvalid': [
      'Escreva um e-mail válido.', 'Type a valid email.', 'Escribe un correo válido.',
    ],
    'rh.noticeEmailSaveError': [
      'Não consegui salvar o e-mail na ficha. Tente de novo.',
      'Could not save the email to the record. Try again.',
      'No pude guardar el correo en la ficha. Inténtalo de nuevo.',
    ],
    'rh.noticeNoEmailHint': [
      '{name} não tem e-mail na ficha. Use ⋮ › Avisar por e-mail para informar um.',
      '{name} has no email on the record. Use ⋮ › Notify by email to add one.',
      '{name} no tiene correo en la ficha. Usa ⋮ › Avisar por correo para agregar uno.',
    ],
    'rh.noticeMessage': ['Recado (opcional)', 'Message (optional)', 'Mensaje (opcional)'],
    'rh.noticeMessagePh': [
      'Ex.: a entrevista técnica é na quinta, às 10h. Confirma para mim?',
      'E.g.: the technical interview is Thursday at 10am. Can you confirm?',
      'Ej.: la entrevista técnica es el jueves a las 10h. ¿Me confirmas?',
    ],
    'rh.noticeAskAlways': [
      'Perguntar isto a cada mudança de etapa',
      'Ask me on every stage change',
      'Preguntar esto en cada cambio de etapa',
    ],
    'rh.noticeSkip': ['Agora não', 'Not now', 'Ahora no'],
    'rh.noticeSend': ['Enviar e-mail', 'Send email', 'Enviar correo'],
    'rh.noticeSending': ['Enviando…', 'Sending…', 'Enviando…'],
    'rh.noticeSent': [
      'Aviso enviado para {name}.',
      'Notice sent to {name}.',
      'Aviso enviado a {name}.',
    ],
    'rh.noticeNoEmail': [
      'Este candidato não deixou e-mail no formulário.',
      'This candidate left no email on the form.',
      'Este candidato no dejó correo en el formulario.',
    ],
    'rh.noticeSignIn': [
      'Entre na sua conta para enviar o aviso.',
      'Sign in to send the notice.',
      'Inicia sesión para enviar el aviso.',
    ],
    'rh.noticeError': [
      'Não consegui enviar o aviso agora.',
      'Could not send the notice right now.',
      'No pude enviar el aviso ahora.',
    ],
    'rh.removeCv': ['Remover currículo', 'Remove résumé', 'Quitar currículum'],
    'rh.removeCvOk': ['Remover currículo', 'Remove résumé', 'Quitar currículum'],
    'rh.removeCvTitle': ['Remover o currículo?', 'Remove the résumé?', '¿Quitar el currículum?'],
    'rh.removeCvBody': [
      'O arquivo anexado a {name} será apagado. A ficha e a etapa no funil continuam como estão.',
      'The file attached to {name} will be deleted. The record and the funnel stage stay as they are.',
      'El archivo adjunto a {name} será borrado. La ficha y la etapa del embudo se mantienen.',
    ],
    'rh.cvRemoved': ['Currículo removido.', 'Résumé removed.', 'Currículum eliminado.'],
    'rh.noCvToRemove': [
      'Este candidato não tem currículo anexado.',
      'This candidate has no résumé attached.',
      'Este candidato no tiene currículum adjunto.',
    ],
    'rh.removeAllCvs': [
      'Remover todos os currículos',
      'Remove every résumé',
      'Quitar todos los currículums',
    ],
    'rh.removeAllCvsTitle': [
      'Remover todos os currículos?',
      'Remove every résumé?',
      '¿Quitar todos los currículums?',
    ],
    'rh.removeAllCvsBody': [
      'Os arquivos de {count} candidatos serão apagados. As fichas e as etapas do funil continuam como estão, e a análise por IA deixa de ter o que ler.',
      'The files of {count} candidates will be deleted. The records and funnel stages stay as they are, and the AI analysis will have nothing left to read.',
      'Se borrarán los archivos de {count} candidatos. Las fichas y las etapas del embudo se mantienen, y el análisis por IA se queda sin nada que leer.',
    ],
    'rh.cvsRemoved': ['{count} currículos removidos.', '{count} résumés removed.', '{count} currículums eliminados.'],
    'rh.noCvsToRemove': [
      'Nenhum candidato tem currículo anexado.',
      'No candidate has a résumé attached.',
      'Ningún candidato tiene currículum adjunto.',
    ],
    'rh.deleteCandidate': ['Excluir candidato', 'Delete candidate', 'Eliminar candidato'],
    'rh.deleteAllCandidates': [
      'Excluir todos os candidatos',
      'Delete every candidate',
      'Eliminar todos los candidatos',
    ],
    'rh.deleteAllTitle': [
      'Excluir todos os candidatos?',
      'Delete every candidate?',
      '¿Eliminar todos los candidatos?',
    ],
    'rh.deleteAllBody': [
      '{count} candidatos serão removidos, com currículos e histórico. Outros registros desta aba não são tocados.',
      '{count} candidates will be removed, along with résumés and history. Other records in this tab are untouched.',
      'Se eliminarán {count} candidatos, con currículums e historial. Otros registros de esta pestaña no se tocan.',
    ],
    'rh.candidatesDeleted': [
      '{count} candidatos removidos.',
      '{count} candidates removed.',
      '{count} candidatos eliminados.',
    ],
    'rh.noCandidatesToDelete': [
      'Nenhum candidato para apagar.',
      'No candidates to delete.',
      'Ningún candidato para eliminar.',
    ],
    'rh.jobFormPublished': [
      'Formulário da vaga publicado! Ele fica no botão "Formulário da vaga".',
      'Job form published! You will find it under the "Job form" button.',
      '¡Formulario de la vacante publicado! Está en el botón "Formulario de la vacante".',
    ],
    'rh.newJobForm': ['＋ Novo formulário da vaga', '＋ New job form', '＋ Nuevo formulario de vacante'],
    'rh.responseOne': ['{count} resposta', '{count} response', '{count} respuesta'],
    'rh.responseMany': ['{count} respostas', '{count} responses', '{count} respuestas'],
    'rh.closeJobForm': ['Encerrar inscrições', 'Close applications', 'Cerrar inscripciones'],
    'rh.reopenJobForm': ['Reabrir inscrições', 'Reopen applications', 'Reabrir inscripciones'],
    'rh.jobFormClosed': [
      'A vaga parou de receber candidaturas. Quem já se candidatou continua no funil.',
      'The role stopped accepting applications. Everyone who already applied stays in the funnel.',
      'La vacante dejó de recibir candidaturas. Quien ya se postuló sigue en el embudo.',
    ],
    'rh.jobFormReopened': [
      'A vaga voltou a receber candidaturas.',
      'The role is accepting applications again.',
      'La vacante volvió a recibir candidaturas.',
    ],
    'rh.jobFormToggleError': [
      'Não foi possível mudar o estado da vaga agora.',
      'Could not change the role status right now.',
      'No se pudo cambiar el estado de la vacante ahora.',
    ],
    'rh.jobForm': ['Formulário da vaga', 'Job form', 'Formulario de la vacante'],
    'rh.jobFormHint': [
      'Montar o formulário da vaga e enviar o link ao candidato',
      'Build the job form and send the link to the candidate',
      'Crear el formulario de la vacante y enviar el enlace al candidato',
    ],
    'rh.iaPremiumOnly': [
      'A análise de currículos é exclusiva do plano Premium.',
      'Résumé analysis is exclusive to the Premium plan.',
      'El análisis de currículums es exclusivo del plan Premium.',
    ],
    'rh.iaButton': ['Analisar currículos', 'Analyze résumés', 'Analizar currículums'],
    'rh.iaButtonHint': [
      'Ordenar os candidatos por aderência à vaga, lendo os currículos anexados',
      'Rank candidates by fit to the role, reading the attached résumés',
      'Ordenar a los candidatos por ajuste a la vacante, leyendo los currículums adjuntos',
    ],
    'rh.iaTitle': ['Analisar currículos', 'Analyze résumés', 'Analizar currículums'],
    'rh.iaSubtitle': [
      'A IA lê os currículos anexados e ordena os candidatos por aderência à vaga.',
      'The AI reads the attached résumés and ranks candidates by fit to the role.',
      'La IA lee los currículums adjuntos y ordena a los candidatos por ajuste a la vacante.',
    ],
    'rh.iaRoleLabel': ['Vaga', 'Role', 'Vacante'],
    'rh.iaRolePh': [
      'Ex.: Analista de dados júnior',
      'Example: Junior data analyst',
      'Ej.: Analista de datos júnior',
    ],
    'rh.iaReqLabel': [
      'O que a vaga exige (opcional)',
      'What the role requires (optional)',
      'Lo que exige la vacante (opcional)',
    ],
    'rh.iaReqPh': [
      'Requisitos, ferramentas, senioridade, o que é desejável. Quanto mais claro, melhor a leitura.',
      'Requirements, tools, seniority, nice-to-haves. The clearer it is, the better the reading.',
      'Requisitos, herramientas, seniority, deseables. Cuanto más claro, mejor la lectura.',
    ],
    'rh.iaNotice': [
      'A nota de 0 a 100 mede aderência aos requisitos da vaga — não a pessoa — e só aparece quando o currículo pôde ser lido. A IA foi instruída a ignorar idade, gênero, raça, estado civil e origem, e a apontar o que não consta em vez de deduzir. É apoio de triagem, não decisão: confira sempre no currículo original.',
      'The 0-to-100 score measures fit to the role requirements — not the person — and only appears when the résumé could be read. The AI is instructed to ignore age, gender, race, marital status and origin, and to flag what is missing instead of inferring it. It supports screening, it does not decide: always check the original résumé.',
      'La nota de 0 a 100 mide el ajuste a los requisitos de la vacante —no a la persona— y solo aparece cuando el currículum pudo leerse. La IA tiene instrucción de ignorar edad, género, raza, estado civil y origen, y de señalar lo que no consta en vez de deducirlo. Es apoyo de filtrado, no decisión: verifica siempre el currículum original.',
    ],
    'rh.iaFormats': [
      'Lê PDF com texto, .docx e texto puro. PDF digitalizado (foto de página) não tem texto para ler.',
      'Reads text PDFs, .docx and plain text. A scanned PDF (a photo of the page) has no text to read.',
      'Lee PDF con texto, .docx y texto plano. Un PDF escaneado (foto de la página) no tiene texto que leer.',
    ],
    'rh.iaCount': [
      '{n} candidatos entram na análise (de {total} em processo).',
      '{n} candidates go into the analysis (out of {total} in process).',
      '{n} candidatos entran en el análisis (de {total} en proceso).',
    ],
    'rh.iaCap': [
      'O limite por análise é {cap}.',
      'The limit per analysis is {cap}.',
      'El límite por análisis es {cap}.',
    ],
    'rh.iaCancel': ['Cancelar', 'Cancel', 'Cancelar'],
    'rh.iaRun': ['Analisar', 'Analyze', 'Analizar'],
    'rh.iaReading': ['Lendo currículos…', 'Reading résumés…', 'Leyendo currículums…'],
    'rh.iaAnalyzing': ['Analisando…', 'Analyzing…', 'Analizando…'],
    'rh.iaResultTitle': ['Triagem · {role}', 'Screening · {role}', 'Filtrado · {role}'],
    'rh.iaNoCandidates': [
      'Cadastre candidatos com currículo antes de pedir a triagem.',
      'Add candidates with résumés before asking for screening.',
      'Registra candidatos con currículum antes de pedir el filtrado.',
    ],
    'rh.iaNoCvRead': [
      'Nenhum currículo pôde ser lido; a análise usou apenas o que está nas fichas.',
      'No résumé could be read; the analysis used only what is in the records.',
      'No se pudo leer ningún currículum; el análisis usó solo lo que está en las fichas.',
    ],
    'rh.iaRoleLine': ['VAGA: {role}', 'ROLE: {role}', 'VACANTE: {role}'],
    'rh.iaRequirementsLine': [
      'REQUISITOS E DESCRIÇÃO DA VAGA:',
      'ROLE REQUIREMENTS AND DESCRIPTION:',
      'REQUISITOS Y DESCRIPCIÓN DE LA VACANTE:',
    ],
    'rh.iaCandidateHeader': [
      'CANDIDATO {n} DE {total}: {name}',
      'CANDIDATE {n} OF {total}: {name}',
      'CANDIDATO {n} DE {total}: {name}',
    ],
    'rh.iaFormBlock': ['Ficha de inscrição:', 'Application record:', 'Ficha de inscripción:'],
    'rh.iaCvBlock': ['Currículo anexado:', 'Attached résumé:', 'Currículum adjunto:'],
    'rh.iaCvUnreadPrefix': ['NÃO LIDO — ', 'NOT READ — ', 'NO LEÍDO — '],
    'rh.cvNone': ['Nenhum currículo anexado.', 'No résumé attached.', 'Ningún currículum adjunto.'],
    'rh.cvScanned': [
      'O currículo é imagem (digitalizado ou foto) e não tem texto que se possa ler. Peça o arquivo em .docx ou um PDF exportado do editor.',
      'The résumé is an image (scanned or photographed) and has no readable text. Ask for a .docx file or a PDF exported from the editor.',
      'El currículum es una imagen (escaneada o foto) y no tiene texto legible. Pide el archivo en .docx o un PDF exportado desde el editor.',
    ],
    'rh.cvFormat': [
      'O formato do anexo não pode ser lido aqui. Formatos aceitos: PDF com texto, .docx e texto puro.',
      'This attachment format cannot be read here. Accepted: PDF with text, .docx and plain text.',
      'El formato del adjunto no se puede leer aquí. Aceptados: PDF con texto, .docx y texto plano.',
    ],
    'rh.cvEmpty': [
      'O arquivo abriu, mas não tem texto dentro.',
      'The file opened, but there is no text inside.',
      'El archivo abrió, pero no tiene texto dentro.',
    ],
    'rh.cvGarbled': [
      'O arquivo abriu, mas o que saiu dele não é texto legível — costuma ser PDF digitalizado ou exportado como imagem. Peça o currículo em .docx.',
      'The file opened, but what came out is not readable text — usually a scanned PDF or one exported as an image. Ask for the résumé in .docx.',
      'El archivo abrió, pero lo que salió no es texto legible: suele ser un PDF escaneado o exportado como imagen. Pide el currículum en .docx.',
    ],
    'rh.cvError': [
      'O arquivo não pôde ser aberto.',
      'The file could not be opened.',
      'No se pudo abrir el archivo.',
    ],
    'rh.iaTruncated': [
      'O material passou do que cabe numa leitura só: parte do texto ficou de fora. Analise menos candidatos por vez para a ordem ficar confiável.',
      'The material exceeded what fits in a single reading: part of the text was left out. Analyze fewer candidates at a time so the ranking is reliable.',
      'El material superó lo que cabe en una sola lectura: parte del texto quedó fuera. Analiza menos candidatos por vez para que el orden sea fiable.',
    ],
    'rh.noScore': ['sem nota', 'no score', 'sin nota'],
    'rh.bandHigh': ['Atende com folga', 'Exceeds requirements', 'Cumple con holgura'],
    'rh.bandGood': ['Atende ao essencial', 'Meets the essentials', 'Cumple lo esencial'],
    'rh.bandMid': ['Atende em parte', 'Partially meets', 'Cumple en parte'],
    'rh.bandLow': ['Pouca aderência', 'Low fit', 'Poco ajuste'],
    'rh.bandOut': ['Outra área', 'Different field', 'Otra área'],
    'rh.gapLabel': ['Falta saber', 'Still unknown', 'Falta saber'],
    'rh.unreadTitle': [
      'Currículos que não puderam ser lidos',
      'Résumés that could not be read',
      'Currículums que no se pudieron leer',
    ],
    'rh.iaFooter': [
      'Apoio de triagem gerado por IA — a decisão, a entrevista e a verificação são suas.',
      'AI-generated screening support — the decision, the interview and the verification are yours.',
      'Apoyo de filtrado generado por IA: la decisión, la entrevista y la verificación son tuyas.',
    ],
    'rh.copy': ['Copiar', 'Copy', 'Copiar'],
    'rh.copied': ['Copiado', 'Copied', 'Copiado'],
    'rh.copyFail': ['Não deu', 'Failed', 'No se pudo'],

    /* Rótulos da moldura financeira que o modelo de recrutamento troca. */
    'app.clientsPanel': ['Painel de Clientes', 'Client panel', 'Panel de clientes'],
    'app.searchClient': ['Buscar cliente...', 'Search client...', 'Buscar cliente...'],
    'app.revenueTitle': ['Faturamento', 'Revenue', 'Facturación'],
    'app.receiptsTitle': ['Recebimentos', 'Receipts', 'Cobros'],

    'admin.textMismatchHandle': [
      'O texto não confere com o @ nem com o e-mail.',
      'The text matches neither the @handle nor the email.',
      'El texto no coincide ni con el @ ni con el correo.',
    ],
  });

  const KEYS = Object.keys(CATALOG);
  const MESSAGES = { pt: {}, en: {}, es: {} };
  KEYS.forEach(key => {
    const values = CATALOG[key];
    MESSAGES.pt[key] = values[0];
    MESSAGES.en[key] = values[1];
    MESSAGES.es[key] = values[2];
  });

  const SOURCE_KEYS = new Map();
  KEYS.forEach(key => {
    const source = MESSAGES.pt[key];
    if (source && !SOURCE_KEYS.has(source)) SOURCE_KEYS.set(source, key);
  });

  function normalizeLanguage(value) {
    const lang = String(value || '').trim().toLowerCase().replace('_', '-').split('-')[0];
    return Object.prototype.hasOwnProperty.call(LOCALES, lang) ? lang : null;
  }

  function readStoredLanguage() {
    try { return normalizeLanguage(localStorage.getItem(STORAGE_KEY)); }
    catch (_) { return null; }
  }

  /* PALPITE SINCRONO, para a pagina nascer ja em alguma lingua. Navegador
     numa das tres: e ela. Fora disso, INGLES — e nao portugues, como era:
     quem chega com o navegador em alemao tem mais chance de ler ingles do
     que portugues, e a regiao corrige logo em seguida se for o caso. */
  function browserLanguage() {
    return normalizeLanguage(navigator.language || navigator.userLanguage) || 'en';
  }

  let currentLanguage = readStoredLanguage() || browserLanguage();
  const capturedTextNodes = [];
  const capturedAttributes = [];
  let observer = null;

  function interpolate(value, vars) {
    return String(value).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => (
      vars && Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : '{' + name + '}'
    ));
  }

  function t(key, vars, fallback) {
    const table = MESSAGES[currentLanguage] || MESSAGES.pt;
    const value = table[key] ?? MESSAGES.pt[key] ?? fallback ?? key;
    return interpolate(value, vars);
  }

  function rememberStaticDocument() {
    const scope = document.querySelector('[data-i18n-static]') || document.body;
    if (!scope || scope.dataset.i18nCaptured === '1') return;
    scope.dataset.i18nCaptured = '1';

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || parent.closest('script,style,noscript,template,[data-i18n-ignore],[contenteditable="true"]')) continue;
      const source = node.nodeValue;
      const clean = source.trim();
      if (!clean || !SOURCE_KEYS.has(clean)) continue;
      capturedTextNodes.push({ node, source, key: SOURCE_KEYS.get(clean) });
    }

    const attrs = ['placeholder', 'title', 'aria-label'];
    scope.querySelectorAll('[placeholder],[title],[aria-label]').forEach(element => {
      attrs.forEach(attr => {
        if (!element.hasAttribute(attr)) return;
        const source = element.getAttribute(attr);
        const clean = String(source || '').trim();
        if (!SOURCE_KEYS.has(clean)) return;
        capturedAttributes.push({ element, attr, source, key: SOURCE_KEYS.get(clean) });
      });
    });
  }

  function translateCapturedStatic() {
    capturedTextNodes.forEach(item => {
      if (!item.node.isConnected) return;
      const leading = item.source.match(/^\s*/)?.[0] || '';
      const trailing = item.source.match(/\s*$/)?.[0] || '';
      item.node.nodeValue = leading + t(item.key) + trailing;
    });
    capturedAttributes.forEach(item => {
      if (item.element.isConnected) item.element.setAttribute(item.attr, t(item.key));
    });
  }

  const EXPLICIT_ATTRIBUTES = [
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-title', 'title'],
    ['data-i18n-aria-label', 'aria-label'],
    ['data-i18n-content', 'content'],
    ['data-i18n-alt', 'alt'],
  ];

  function translateExplicit(root) {
    const roots = [];
    if (root?.nodeType === Node.ELEMENT_NODE) roots.push(root);
    const queryRoot = root?.querySelectorAll ? root : document;
    queryRoot.querySelectorAll?.('[data-i18n]').forEach(el => roots.push(el));

    roots.forEach(element => {
      const key = element.getAttribute?.('data-i18n');
      if (key) {
        const vars = {};
        if (element.hasAttribute('data-i18n-count')) {
          vars.count = element.getAttribute('data-i18n-count');
        }
        element.textContent = t(key, vars);
      }
    });

    EXPLICIT_ATTRIBUTES.forEach(([marker, attr]) => {
      const elements = [];
      if (root?.nodeType === Node.ELEMENT_NODE && root.hasAttribute(marker)) elements.push(root);
      queryRoot.querySelectorAll?.('[' + marker + ']').forEach(el => elements.push(el));
      elements.forEach(element => element.setAttribute(attr, t(element.getAttribute(marker))));
    });
  }

  function updateDocumentLanguage() {
    document.documentElement.lang = LOCALES[currentLanguage];
    document.documentElement.dataset.lang = currentLanguage;
  }

  function closeAllMenus(except) {
    document.querySelectorAll('.i18n-selector.is-open').forEach(selector => {
      if (selector === except) return;
      selector.classList.remove('is-open');
      selector.querySelector('.i18n-trigger')?.setAttribute('aria-expanded', 'false');
    });
  }

  function updateSelectors() {
    document.querySelectorAll('[data-language-selector]').forEach(host => {
      const selector = host.querySelector('.i18n-selector');
      if (!selector) return;
      const trigger = selector.querySelector('.i18n-trigger');
      if (trigger) {
        const flag = trigger.querySelector('.i18n-current-flag');
        const code = trigger.querySelector('.i18n-current-code');
        const nextFlag = FLAGS[currentLanguage];
        const nextCode = currentLanguage.toUpperCase();
        // O MutationObserver abaixo observa childList. Reatribuir textContent
        // mesmo sem mudança cria outra mutação e prendia a página num ciclo
        // infinito. Só alteramos o DOM quando o valor realmente mudou.
        if (flag && flag.textContent !== nextFlag) flag.textContent = nextFlag;
        if (code && code.textContent !== nextCode) code.textContent = nextCode;
        trigger.setAttribute('aria-label', t('common.chooseLanguage') + ': ' + LANGUAGE_NAMES[currentLanguage]);
        trigger.title = t('common.chooseLanguage');
      }
      selector.querySelector('.i18n-menu')?.setAttribute('aria-label', t('common.chooseLanguage'));
      selector.querySelectorAll('[data-lang]').forEach(button => {
        const active = button.dataset.lang === currentLanguage;
        button.setAttribute('aria-checked', String(active));
        button.classList.toggle('is-active', active);
      });
    });
  }

  function renderSelector(host) {
    if (!host || host.querySelector('.i18n-selector')) return;
    const selector = document.createElement('div');
    selector.className = 'i18n-selector';
    selector.innerHTML =
      '<button class="i18n-trigger" type="button" aria-haspopup="menu" aria-expanded="false">' +
        '<span class="i18n-current-flag" aria-hidden="true"></span>' +
        '<span class="i18n-current-code"></span>' +
        '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7 5 5 5-5"/></svg>' +
      '</button>' +
      '<div class="i18n-menu" role="menu">' +
        Object.keys(LOCALES).map(lang =>
          '<button type="button" role="menuitemradio" aria-checked="false" data-lang="' + lang + '">' +
            '<span class="i18n-option-flag" aria-hidden="true">' + FLAGS[lang] + '</span>' +
            '<span class="i18n-option-name">' + LANGUAGE_NAMES[lang] + '</span>' +
            '<span class="i18n-option-check" aria-hidden="true">✓</span>' +
          '</button>'
        ).join('') +
      '</div>';
    host.appendChild(selector);

    const trigger = selector.querySelector('.i18n-trigger');
    const openMenu = preferred => {
      closeAllMenus(selector);
      selector.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      const buttons = Array.from(selector.querySelectorAll('[data-lang]'));
      const target = preferred === 'last'
        ? buttons.at(-1)
        : preferred === 'first'
          ? buttons[0]
          : selector.querySelector('[data-lang="' + currentLanguage + '"]');
      target?.focus();
    };
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const willOpen = !selector.classList.contains('is-open');
      closeAllMenus(selector);
      if (willOpen) openMenu('current');
      else {
        selector.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
    trigger.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      event.stopPropagation();
      openMenu(event.key === 'ArrowDown' ? 'first' : 'last');
    });
    selector.querySelectorAll('[data-lang]').forEach(button => {
      button.addEventListener('click', event => {
        event.stopPropagation();
        setLanguage(button.dataset.lang);
        selector.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      });
    });
    selector.addEventListener('keydown', event => {
      const buttons = Array.from(selector.querySelectorAll('[data-lang]'));
      const index = buttons.indexOf(document.activeElement);
      if (event.key === 'Escape') {
        event.preventDefault();
        selector.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        trigger.focus();
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const delta = event.key === 'ArrowDown' ? 1 : -1;
        const next = index < 0
          ? (delta > 0 ? 0 : buttons.length - 1)
          : (index + delta + buttons.length) % buttons.length;
        buttons[next]?.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
      }
    });
  }

  function renderSelectors() {
    document.querySelectorAll('[data-language-selector]').forEach(renderSelector);
    updateSelectors();
  }

  function applyLanguage() {
    updateDocumentLanguage();
    translateCapturedStatic();
    translateExplicit(document);
    updateSelectors();
  }

  function setLanguage(language, options) {
    const next = normalizeLanguage(language);
    if (!next) return false;
    const previous = currentLanguage;
    currentLanguage = next;
    if (!options || options.persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    }
    applyLanguage();
    window.dispatchEvent(new CustomEvent('mydesk:languagechange', {
      detail: { language: next, locale: LOCALES[next], previous },
    }));
    return true;
  }

  /* ═════════════════════════════════════════════════════════════════════
     O IDIOMA DA PRIMEIRA VISITA
     ═════════════════════════════════════════════════════════════════════
     Três fontes, nesta ordem:

     1. O QUE A PESSOA ESCOLHEU. Se ela trocou o idioma alguma vez, nada mais
        opina. É escolha, e escolha não se adivinha de novo.

     2. A REGIÃO. Estados Unidos e Europa em inglês; Espanha e América
        hispânica em espanhol; Brasil e Portugal em português.

     3. O IDIOMA DO NAVEGADOR, enquanto a região não responde — e se ela nunca
        responder. É o palpite que faz a página nascer já em alguma língua, em
        vez de esperar a rede.

     A região vem ANTES do navegador porque foi assim que se pediu, e a
     consequência precisa estar escrita: quem está fora do país de origem vê a
     língua do lugar onde está, e não a que fala. Uma brasileira em viagem
     pelos Estados Unidos abre a página em inglês até trocar no seletor — e,
     trocando uma vez, nunca mais é perguntada.

     A resposta fica guardada por um dia. Sem cache seria um pedido por
     carregamento de página; com validade longa, quem viaja ou desliga a VPN
     ficaria preso na língua da consulta anterior. */

  const CHAVE_PAIS = 'md_pais';
  const VALIDADE_PAIS = 24 * 60 * 60 * 1000;   // um dia

  /* Espanhol: Espanha e a América hispânica. O Brasil fica de fora (é o
     português), e Guiana, Suriname e Guiana Francesa também — são América do
     Sul e não falam espanhol. */
  const PAISES_ES = ['ES', 'MX', 'AR', 'CL', 'CO', 'PE', 'VE', 'UY', 'PY',
    'BO', 'EC', 'CR', 'CU', 'DO', 'GT', 'HN', 'NI', 'PA', 'SV', 'GQ'];
  const PAISES_PT = ['BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL'];

  function idiomaDoPais(pais) {
    const p = String(pais || '').trim().toUpperCase();
    if (!p) return null;
    if (PAISES_PT.indexOf(p) !== -1) return 'pt';
    if (PAISES_ES.indexOf(p) !== -1) return 'es';
    return 'en';
  }

  function paisGuardado() {
    try {
      const bruto = localStorage.getItem(CHAVE_PAIS);
      if (!bruto) return null;
      const dado = JSON.parse(bruto);
      if (!dado || !dado.pais) return null;
      if (Date.now() - (Number(dado.em) || 0) > VALIDADE_PAIS) return null;
      return dado.pais;
    } catch (_) { return null; }
  }

  function guardarPais(pais) {
    try { localStorage.setItem(CHAVE_PAIS, JSON.stringify({ pais, em: Date.now() })); }
    catch (_) {}
  }

  /* A consulta não bloqueia nada: a página já está em pé, no palpite síncrono,
     e só troca se a região disser outra coisa. Falha em silêncio — sem região,
     o palpite continua valendo, e uma tela em inglês é melhor que uma tela que
     não carrega. */
  function descobrirRegiao() {
    /* `window`, e nao `global`: este modulo recebe a janela por esse nome, e
       `global` nao existe aqui. Em modo estrito, ler um nome que nao existe
       nao devolve undefined — ele ESTOURA, e o estouro acontece dentro do
       init, depois de a pagina ja estar traduzida. Resultado: tudo parecia
       certo na tela e a regiao nunca era consultada. */
    if (!window.fetch) return Promise.resolve(null);
    const controle = typeof AbortController === 'function' ? new AbortController() : null;
    /* Três segundos: passou disso, a pessoa já está lendo a página, e trocar
       o idioma debaixo dos olhos dela é pior do que manter o palpite. */
    const relogio = setTimeout(() => { try { controle && controle.abort(); } catch (_) {} }, 3000);
    return window.fetch('https://ipapi.co/json/', {
      signal: controle ? controle.signal : undefined,
      /* Sem credenciais e sem cabeçalho nenhum: é uma pergunta anônima, e o
         que volta interessa por um campo só. */
      credentials: 'omit', cache: 'default',
    })
      .then(r => (r.ok ? r.json() : null))
      .then(d => (d && d.country_code ? String(d.country_code) : null))
      .catch(() => null)
      .then(pais => { clearTimeout(relogio); return pais; });
  }

  function ajustarPelaRegiao() {
    /* Escolha da pessoa: não há o que perguntar. É a única saída antes da
       consulta — o idioma do navegador NÃO barra mais a região, que é o que
       faz o país decidir de verdade. */
    if (readStoredLanguage()) return;

    const guardado = paisGuardado();
    if (guardado) {
      aplicarIdiomaDaRegiao(idiomaDoPais(guardado));
      return;
    }
    descobrirRegiao().then(pais => {
      if (!pais) return;
      guardarPais(pais);
      aplicarIdiomaDaRegiao(idiomaDoPais(pais));
    });
  }

  function aplicarIdiomaDaRegiao(idioma) {
    if (!idioma || idioma === currentLanguage) return;
    /* `persist:false`: isto é um palpite, e não uma escolha. Guardar faria a
       pessoa que nunca abriu o seletor ficar presa nele — e, pior, faria o
       palpite vencer o navegador na visita seguinte. */
    setLanguage(idioma, { persist: false });
  }

  function init() {
    rememberStaticDocument();
    renderSelectors();
    applyLanguage();
    /* A deteccao de regiao e conveniencia: se ela estourar por qualquer
       motivo, o resto do init — o observador que traduz o que nasce depois —
       nao pode ir junto. */
    try { ajustarPelaRegiao(); } catch (e) { console.warn('[i18n] regiao:', e); }
    if (!observer) {
      observer = new MutationObserver(records => {
        let selectorAdded = false;
        records.forEach(record => record.addedNodes.forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches('[data-language-selector]')) {
            renderSelector(node);
            selectorAdded = true;
          }
          const nestedSelectors = node.querySelectorAll?.('[data-language-selector]') || [];
          nestedSelectors.forEach(renderSelector);
          if (nestedSelectors.length) selectorAdded = true;
          translateExplicit(node);
        }));
        if (selectorAdded) updateSelectors();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  document.addEventListener('click', () => closeAllMenus());
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeAllMenus();
  });

  const api = Object.freeze({
    languages: Object.freeze(Object.keys(LOCALES)),
    locales: LOCALES,
    flags: FLAGS,
    names: LANGUAGE_NAMES,
    catalog: CATALOG,
    messages: Object.freeze(MESSAGES),
    normalizeLanguage,
    getLanguage: () => currentLanguage,
    getLocale: () => LOCALES[currentLanguage],
    t,
    setLanguage,
    apply: applyLanguage,
    idiomaDoPais,
    translate: translateExplicit,
    init,
  });
  window.MyDeskI18n = api;

  /*
   * Os HTMLs carregam este núcleo imediatamente antes do JS da página. Quando
   * o body já existe, a captura ocorre agora, antes de qualquer conteúdo de API.
   */
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init, { once: true });
})(window, document);
