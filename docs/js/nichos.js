'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MODELOS DE FICHA POR NICHO
   ═══════════════════════════════════════════════════════════════════════
   A ficha de cliente do MyDesk tinha nome, valor, vencimento e status — o
   suficiente para cobrar, e nada do que cada ofício precisa lembrar. O
   advogado guarda número de processo e prazo; o dentista, procedimento e
   retorno; a imobiliária, o imóvel e a data da visita. Sem lugar para isso,
   tudo virava texto solto na descrição, que nenhuma busca acha e nenhum
   relatório soma.

   Cada modelo diz quatro coisas:

     papel      — como esse ofício chama a pessoa (Cliente, Paciente, Aluno,
                  Hóspede…). Chamar paciente de "cliente" numa clínica é o
                  tipo de detalhe que faz o software parecer estrangeiro.
     documento  — o identificador que aquele meio usa (OAB, CRM, matrícula…).
     campos     — o que se anota, com ícone e tipo. `selo` transforma o campo
                  numa etiqueta de estado clicável; `interno: true` marca o que
                  NÃO se pergunta ao cliente. Honorários, parecer, avaliação de
                  risco e evolução clínica são registro de quem atende — cabem
                  na ficha, mas seriam constrangedores ou simplesmente sem
                  sentido num formulário público, e por isso o construtor de
                  formulário os ignora.
     anexo      — rótulo do arquivo pedido no formulário. Só um por modelo,
                  porque a resposta guarda UM arquivo.
     checklist  — as etapas do trabalho, na ordem em que acontecem.

   COMO ACRESCENTAR UM NICHO: adicione uma entrada aqui. Nada mais precisa
   mudar — a nota, o cadastro e o relatório leem desta lista. Chaves de campo
   (`k`) são gravadas no banco: não renomeie uma chave existente, senão os
   dados já preenchidos perdem o rótulo.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {

  /* Selos reaproveitados. Cor é sempre acompanhada de texto — em nota
     colorida, cor sozinha não distingue quem não enxerga a diferença. */
  const S = {
    andamento: ['Em andamento', 'Aguardando', 'Concluído', 'Parado'],
    agenda:    ['Agendado', 'Confirmado', 'Remarcado', 'Faltou', 'Atendido'],
    proposta:  ['Rascunho', 'Enviada', 'Em negociação', 'Aceita', 'Recusada'],
    obra:      ['Levantamento', 'Projeto', 'Execução', 'Entregue'],
    entrega:   ['Preparando', 'A caminho', 'Entregue', 'Devolvido'],
    processo:  ['Triagem', 'Em análise', 'Aprovado', 'Reprovado'],
    urgencia:  ['Normal', 'Urgente', 'Crítica'],
    simNao:    ['Sim', 'Não', 'Não sei'],
    origem:    ['Indicação', 'Instagram', 'Google', 'WhatsApp', 'Já era cliente', 'Outro'],
    canal:     ['WhatsApp', 'Telefone', 'E-mail', 'Presencial'],
    pagamento: ['À vista', 'Parcelado', 'Financiamento', 'Pix', 'Cartão', 'Boleto'],
    modalidade:['Presencial', 'Online', 'Híbrido'],
    frequencia:['Semanal', 'Quinzenal', 'Mensal', 'Sob demanda'],
    /* Avaliação de risco: escala do próprio profissional, e por isso interna.
       Nunca vira pergunta de formulário — ver o campo `interno`. */
    risco:     ['Sem risco identificado', 'Atenção', 'Risco moderado', 'Risco alto'],
    regime:    ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'],
    operacao:  ['Compra', 'Venda', 'Aluguel', 'Locação para temporada'],
    ramo:      ['Automóvel', 'Residencial', 'Vida', 'Saúde', 'Empresarial', 'Viagem'],
    trabalho:  ['Presencial', 'Híbrido', 'Remoto'],
  };

  const NICHOS = [
    {
      key: 'advocacia', nome: 'Acompanhamento jurídico', tag: 'Advocacia', ico: '⚖️',
      papel: 'Cliente', documento: 'OAB / Inscrição',
      campos: [
        { k: 'area',      rot: 'Área do direito', ico: '📚', tipo: 'texto' },
        { k: 'relato',    rot: 'Relato do caso',  ico: '📝', tipo: 'longo' },
        { k: 'processo',  rot: 'Processo',        ico: '📄', tipo: 'texto' },
        { k: 'vara',      rot: 'Vara / Foro',     ico: '🏛️', tipo: 'texto' },
        { k: 'parte',     rot: 'Parte contrária', ico: '👥', tipo: 'texto' },
        { k: 'prazo',     rot: 'Prazo',           ico: '📅', tipo: 'data', selo: S.andamento },
        { k: 'urgencia',  rot: 'Urgência',        ico: '⏱️', tipo: 'texto', selo: S.urgencia },
        { k: 'audiencia', rot: 'Próxima audiência', ico: '⚖️', tipo: 'data' },
        { k: 'honorarios', rot: 'Honorários combinados', ico: '💰', tipo: 'valor', interno: true },
        { k: 'responsavel', rot: 'Advogado responsável', ico: '🧑‍⚖️', tipo: 'texto', interno: true },
        { k: 'estrategia', rot: 'Estratégia e andamento', ico: '🗒️', tipo: 'longo', interno: true },
      ],
      anexo: 'Documentos do caso (RG, contrato, comprovantes)',
      checklist: ['Consulta inicial', 'Procuração assinada', 'Documentos recebidos',
                  'Petição inicial', 'Protocolo', 'Audiência', 'Sentença'],
    },
    {
      key: 'psicologia', nome: 'Acompanhamento psicológico', tag: 'Psicologia', ico: '🧠',
      papel: 'Paciente', documento: 'CRP do profissional',
      campos: [
        { k: 'motivo',     rot: 'Motivo da procura',   ico: '💬', tipo: 'longo' },
        { k: 'queixa',     rot: 'Queixa principal',    ico: '📋', tipo: 'texto' },
        { k: 'inicio',     rot: 'Desde quando sente',  ico: '🕰️', tipo: 'texto' },
        { k: 'modalidade', rot: 'Modalidade',          ico: '🪑', tipo: 'texto', selo: S.modalidade },
        { k: 'frequencia', rot: 'Frequência combinada', ico: '🔁', tipo: 'texto', selo: S.frequencia },
        { k: 'sessao',     rot: 'Próxima sessão',      ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'acompanhamento', rot: 'Já fez terapia antes', ico: '🧭', tipo: 'texto' },
        { k: 'medicacao',  rot: 'Medicação em uso',    ico: '💊', tipo: 'texto' },
        { k: 'psiquiatra', rot: 'Acompanhamento psiquiátrico', ico: '🩺', tipo: 'texto' },
        { k: 'emergencia', rot: 'Contato de emergência', ico: '🆘', tipo: 'texto' },
        { k: 'disponibilidade', rot: 'Melhores horários', ico: '⏰', tipo: 'texto' },
        // Daqui para baixo é registro do profissional: risco, plano e evolução
        // não se perguntam a quem procura ajuda — se escrevem depois, com
        // método, e por isso não entram no formulário público.
        { k: 'risco',      rot: 'Avaliação de risco',  ico: '⚠️', tipo: 'texto', selo: S.risco, interno: true },
        { k: 'plano',      rot: 'Plano terapêutico',   ico: '🎯', tipo: 'longo', interno: true },
        { k: 'evolucao',   rot: 'Evolução das sessões', ico: '🗒️', tipo: 'longo', interno: true },
        { k: 'encaminhamento', rot: 'Encaminhamentos', ico: '📤', tipo: 'texto', interno: true },
      ],
      anexo: 'Encaminhamento, laudo ou documento (opcional)',
      checklist: ['Contato inicial', 'Contrato terapêutico assinado', 'Anamnese',
                  'Plano terapêutico definido', 'Reavaliação', 'Alta ou encaminhamento'],
    },
    {
      key: 'odontologia', nome: 'Tratamento odontológico', tag: 'Odontologia', ico: '🦷',
      papel: 'Paciente', documento: 'Prontuário',
      campos: [
        { k: 'queixa',       rot: 'Queixa principal',  ico: '📋', tipo: 'texto' },
        { k: 'procedimento', rot: 'Procedimento',      ico: '🩺', tipo: 'texto' },
        { k: 'dente',        rot: 'Dente / região',    ico: '🔎', tipo: 'texto' },
        { k: 'dor',          rot: 'Sente dor',         ico: '😖', tipo: 'texto', selo: S.simNao },
        { k: 'alergias',     rot: 'Alergias a medicamentos', ico: '⚠️', tipo: 'texto' },
        { k: 'saude',        rot: 'Condições de saúde', ico: '❤️', tipo: 'longo' },
        { k: 'convenio',     rot: 'Convênio',          ico: '🏥', tipo: 'texto' },
        { k: 'retorno',      rot: 'Retorno',           ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'orcamento',    rot: 'Orçamento aprovado', ico: '💰', tipo: 'valor', interno: true },
        { k: 'anotacoes',    rot: 'Evolução clínica',  ico: '📝', tipo: 'longo', interno: true },
      ],
      anexo: 'Radiografia, exame ou documento',
      checklist: ['Avaliação inicial', 'Orçamento aprovado', 'Profilaxia',
                  'Procedimento realizado', 'Retorno', 'Alta'],
    },
    {
      key: 'atendimento', nome: 'Atendimento ao cliente', tag: 'Atendimento', ico: '💬',
      papel: 'Cliente', documento: 'ID do atendimento',
      campos: [
        { k: 'necessidade', rot: 'O que você precisa', ico: '🎯', tipo: 'longo' },
        { k: 'empresa',   rot: 'Empresa',            ico: '🏢', tipo: 'texto' },
        { k: 'segmento',  rot: 'Segmento',           ico: '🏷️', tipo: 'texto' },
        { k: 'origem',    rot: 'Como nos conheceu',  ico: '🔗', tipo: 'texto', selo: S.origem },
        { k: 'orcamento', rot: 'Orçamento previsto', ico: '💰', tipo: 'valor' },
        { k: 'prazoDesejado', rot: 'Prazo desejado', ico: '📅', tipo: 'data' },
        { k: 'canal',     rot: 'Melhor canal de contato', ico: '📞', tipo: 'texto', selo: S.canal },
        { k: 'proposta',  rot: 'Proposta',           ico: '📨', tipo: 'texto', selo: S.proposta, interno: true },
        { k: 'ultimoContato', rot: 'Último contato', ico: '🕐', tipo: 'data', interno: true },
        { k: 'responsavel', rot: 'Responsável',      ico: '🧑‍💼', tipo: 'texto', interno: true },
      ],
      checklist: ['Primeiro contato', 'Briefing realizado', 'Proposta enviada',
                  'Negociação', 'Contrato assinado', 'Pagamento confirmado'],
    },
    {
      key: 'saude', nome: 'Consulta clínica', tag: 'Saúde', ico: '🩺',
      papel: 'Paciente', documento: 'Cartão / Convênio',
      campos: [
        { k: 'queixa',      rot: 'Queixa principal',   ico: '📋', tipo: 'texto' },
        { k: 'sintomas',    rot: 'Sintomas e há quanto tempo', ico: '🌡️', tipo: 'longo' },
        { k: 'medicamentos', rot: 'Medicamentos em uso', ico: '💊', tipo: 'texto' },
        { k: 'alergias',    rot: 'Alergias',           ico: '⚠️', tipo: 'texto' },
        { k: 'historico',   rot: 'Doenças ou cirurgias anteriores', ico: '📜', tipo: 'longo' },
        { k: 'convenio',    rot: 'Convênio',           ico: '🏥', tipo: 'texto' },
        { k: 'consulta',    rot: 'Consulta',           ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'conduta',     rot: 'Conduta e prescrição', ico: '📝', tipo: 'longo', interno: true },
        { k: 'retornoObs',  rot: 'Orientação de retorno', ico: '🔁', tipo: 'texto', interno: true },
      ],
      anexo: 'Exames e documentos',
      checklist: ['Anamnese', 'Exame físico', 'Exames solicitados',
                  'Resultado avaliado', 'Prescrição', 'Retorno'],
    },
    {
      key: 'nutricao', nome: 'Plano nutricional', tag: 'Nutrição', ico: '🥗',
      papel: 'Paciente', documento: 'Ficha',
      campos: [
        { k: 'objetivo',    rot: 'Objetivo',            ico: '🎯', tipo: 'texto' },
        { k: 'rotina',      rot: 'Rotina alimentar de hoje', ico: '🍽️', tipo: 'longo' },
        { k: 'restricoes',  rot: 'Restrições e alergias', ico: '⚠️', tipo: 'texto' },
        { k: 'atividade',   rot: 'Atividade física',    ico: '🏃', tipo: 'texto' },
        { k: 'medidas',     rot: 'Peso e altura',       ico: '📏', tipo: 'texto' },
        { k: 'suplementos', rot: 'Suplementos ou medicação', ico: '💊', tipo: 'texto' },
        { k: 'reavaliacao', rot: 'Reavaliação',         ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'plano',       rot: 'Plano prescrito',     ico: '📝', tipo: 'longo', interno: true },
      ],
      anexo: 'Exames recentes (opcional)',
      checklist: ['Avaliação antropométrica', 'Recordatório alimentar',
                  'Plano entregue', 'Primeira reavaliação', 'Ajuste do plano'],
    },
    {
      key: 'veterinaria', nome: 'Atendimento veterinário', tag: 'Veterinária', ico: '🐾',
      papel: 'Tutor', documento: 'Ficha do animal',
      campos: [
        { k: 'animal',     rot: 'Nome do animal',   ico: '🐕', tipo: 'texto' },
        { k: 'especie',    rot: 'Espécie / raça',   ico: '🔖', tipo: 'texto' },
        { k: 'idade',      rot: 'Idade',            ico: '🎂', tipo: 'texto' },
        { k: 'peso',       rot: 'Peso',             ico: '⚖️', tipo: 'texto' },
        { k: 'queixa',     rot: 'Motivo da consulta', ico: '📋', tipo: 'longo' },
        { k: 'vacinas',    rot: 'Vacinas em dia',   ico: '💉', tipo: 'texto', selo: S.simNao },
        { k: 'castrado',   rot: 'Castrado',         ico: '✂️', tipo: 'texto', selo: S.simNao },
        { k: 'retorno',    rot: 'Retorno',          ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'observacoes', rot: 'Evolução clínica', ico: '📝', tipo: 'longo', interno: true },
      ],
      anexo: 'Carteira de vacinação ou exames',
      checklist: ['Consulta', 'Vacinas conferidas', 'Exames',
                  'Medicação prescrita', 'Retorno'],
    },
    {
      key: 'contabilidade', nome: 'Rotina contábil', tag: 'Contabilidade', ico: '📊',
      papel: 'Cliente', documento: 'CNPJ / Regime',
      campos: [
        { k: 'razaoSocial', rot: 'Razão social',       ico: '🏢', tipo: 'texto' },
        { k: 'regime',      rot: 'Regime tributário',  ico: '🏛️', tipo: 'texto', selo: S.regime },
        { k: 'atividade',   rot: 'Atividade principal', ico: '🏭', tipo: 'texto' },
        { k: 'socios',      rot: 'Sócios',             ico: '👥', tipo: 'texto' },
        { k: 'funcionarios', rot: 'Nº de funcionários', ico: '🧑‍🤝‍🧑', tipo: 'texto' },
        { k: 'competencia', rot: 'Competência',        ico: '🗓️', tipo: 'texto' },
        { k: 'entrega',     rot: 'Entrega',            ico: '📅', tipo: 'data', selo: S.andamento },
        { k: 'certificado', rot: 'Certificado digital vence em', ico: '🔐', tipo: 'data', interno: true },
        { k: 'faturamento', rot: 'Faturamento médio',  ico: '💰', tipo: 'valor', interno: true },
        { k: 'pendencias',  rot: 'Pendências',         ico: '📝', tipo: 'longo', interno: true },
      ],
      anexo: 'Documentos do mês (notas, extratos)',
      checklist: ['Documentos recebidos', 'Lançamentos', 'Apuração',
                  'Guias emitidas', 'Obrigações enviadas', 'Balancete entregue'],
    },
    {
      key: 'imobiliaria', nome: 'Negociação de imóvel', tag: 'Imobiliária', ico: '🏠',
      papel: 'Cliente', documento: 'Código do imóvel',
      campos: [
        { k: 'operacao',   rot: 'Operação',           ico: '🔁', tipo: 'texto', selo: S.operacao },
        { k: 'imovel',     rot: 'Imóvel de interesse', ico: '🏢', tipo: 'texto' },
        { k: 'perfil',     rot: 'O que procura',      ico: '🔎', tipo: 'longo' },
        { k: 'faixa',      rot: 'Faixa de valor',     ico: '💰', tipo: 'valor' },
        { k: 'financiamento', rot: 'Forma de pagamento', ico: '🏦', tipo: 'texto', selo: S.pagamento },
        { k: 'prazoMudanca', rot: 'Previsão de mudança', ico: '📦', tipo: 'data' },
        { k: 'visita',     rot: 'Visita',             ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'proposta',   rot: 'Proposta',           ico: '📨', tipo: 'valor', selo: S.proposta, interno: true },
        { k: 'corretor',   rot: 'Corretor responsável', ico: '🧑‍💼', tipo: 'texto', interno: true },
      ],
      anexo: 'Documentos do imóvel ou do comprador',
      checklist: ['Visita realizada', 'Proposta apresentada', 'Documentação',
                  'Análise de crédito', 'Vistoria', 'Contrato assinado', 'Chaves entregues'],
    },
    {
      key: 'seguros', nome: 'Apólice de seguro', tag: 'Seguros', ico: '🛡️',
      papel: 'Segurado', documento: 'Apólice',
      campos: [
        { k: 'ramo',       rot: 'Ramo',             ico: '📁', tipo: 'texto', selo: S.ramo },
        { k: 'bem',        rot: 'Bem a segurar',    ico: '📦', tipo: 'texto' },
        { k: 'seguradora', rot: 'Seguradora',       ico: '🏢', tipo: 'texto' },
        { k: 'apolice',    rot: 'Nº da apólice',    ico: '🔖', tipo: 'texto' },
        { k: 'vigencia',   rot: 'Vigência até',     ico: '📅', tipo: 'data', selo: S.andamento },
        { k: 'coberturas', rot: 'Coberturas desejadas', ico: '🛡️', tipo: 'longo' },
        { k: 'sinistro',   rot: 'Sinistro',         ico: '⚠️', tipo: 'texto', selo: S.processo },
        { k: 'premio',     rot: 'Prêmio',           ico: '💰', tipo: 'valor', interno: true },
        { k: 'comissao',   rot: 'Comissão',         ico: '📈', tipo: 'valor', interno: true },
      ],
      anexo: 'Apólice, laudo ou documentos do sinistro',
      checklist: ['Cotação', 'Proposta aceita', 'Apólice emitida',
                  'Boleto enviado', 'Vistoria', 'Renovação avisada'],
    },
    {
      key: 'educacao', nome: 'Matrícula e curso', tag: 'Educação', ico: '🎓',
      papel: 'Aluno', documento: 'Matrícula',
      campos: [
        { k: 'curso',      rot: 'Curso / turma',    ico: '📚', tipo: 'texto' },
        { k: 'objetivo',   rot: 'Objetivo com o curso', ico: '🎯', tipo: 'longo' },
        { k: 'nivel',      rot: 'Nível atual',      ico: '📈', tipo: 'texto' },
        { k: 'disponibilidade', rot: 'Dias e horários', ico: '⏰', tipo: 'texto' },
        { k: 'responsavelAluno', rot: 'Responsável (se menor)', ico: '👤', tipo: 'texto' },
        { k: 'inicio',     rot: 'Início',           ico: '📅', tipo: 'data', selo: S.andamento },
        { k: 'modulo',     rot: 'Módulo atual',     ico: '📖', tipo: 'texto', interno: true },
        { k: 'mensalidade', rot: 'Mensalidade',     ico: '💰', tipo: 'valor', interno: true },
        { k: 'frequencia', rot: 'Frequência e notas', ico: '🗒️', tipo: 'longo', interno: true },
      ],
      checklist: ['Matrícula', 'Material entregue', 'Primeira aula',
                  'Avaliação', 'Conclusão', 'Certificado'],
    },
    {
      key: 'estetica', nome: 'Procedimento estético', tag: 'Estética', ico: '💅',
      papel: 'Cliente', documento: 'Ficha',
      campos: [
        { k: 'procedimento', rot: 'Procedimento desejado', ico: '✨', tipo: 'texto' },
        { k: 'expectativa',  rot: 'O que espera do resultado', ico: '🎯', tipo: 'longo' },
        { k: 'alergias',     rot: 'Alergias',        ico: '⚠️', tipo: 'texto' },
        { k: 'saude',        rot: 'Gestante, amamentando ou em tratamento', ico: '❤️', tipo: 'texto' },
        { k: 'anteriores',   rot: 'Procedimentos anteriores', ico: '📜', tipo: 'texto' },
        { k: 'sessao',       rot: 'Sessão',          ico: '🔢', tipo: 'texto' },
        { k: 'proxima',      rot: 'Próxima',         ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'contraindicacao', rot: 'Contraindicações observadas', ico: '🚫', tipo: 'longo', interno: true },
      ],
      checklist: ['Avaliação', 'Termo de consentimento', 'Foto antes',
                  'Sessão realizada', 'Foto depois', 'Orientações pós'],
    },
    {
      key: 'fitness', nome: 'Treino e acompanhamento', tag: 'Academia', ico: '🏋️',
      papel: 'Aluno', documento: 'Plano',
      campos: [
        { k: 'objetivo',   rot: 'Objetivo',          ico: '🎯', tipo: 'texto' },
        { k: 'experiencia', rot: 'Já treina há quanto tempo', ico: '📈', tipo: 'texto' },
        { k: 'restricoes', rot: 'Lesões ou restrições', ico: '⚠️', tipo: 'longo' },
        { k: 'disponibilidade', rot: 'Dias e horários', ico: '⏰', tipo: 'texto' },
        { k: 'plano',      rot: 'Plano contratado',  ico: '📆', tipo: 'texto' },
        { k: 'medidas',    rot: 'Peso e altura',     ico: '📏', tipo: 'texto' },
        { k: 'avaliacao',  rot: 'Avaliação física',  ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'ficha',      rot: 'Ficha de treino',   ico: '🗒️', tipo: 'longo', interno: true },
      ],
      checklist: ['Anamnese', 'Avaliação física', 'Treino montado',
                  'Primeira semana', 'Reavaliação'],
    },
    {
      key: 'automotivo', nome: 'Ordem de serviço', tag: 'Automotivo', ico: '🔧',
      papel: 'Cliente', documento: 'Placa / OS',
      campos: [
        { k: 'veiculo',   rot: 'Veículo (modelo e ano)', ico: '🚗', tipo: 'texto' },
        { k: 'placa',     rot: 'Placa',            ico: '🔖', tipo: 'texto' },
        { k: 'km',        rot: 'Quilometragem',    ico: '📈', tipo: 'texto' },
        { k: 'problema',  rot: 'Problema relatado', ico: '📝', tipo: 'longo' },
        { k: 'servico',   rot: 'Serviço',          ico: '🛠️', tipo: 'texto', selo: S.andamento },
        { k: 'entrega',   rot: 'Previsão de entrega', ico: '📅', tipo: 'data' },
        { k: 'orcamento', rot: 'Orçamento',        ico: '💰', tipo: 'valor', interno: true },
        { k: 'pecas',     rot: 'Peças e mão de obra', ico: '🔩', tipo: 'longo', interno: true },
      ],
      anexo: 'Fotos e orçamento',
      checklist: ['Diagnóstico', 'Orçamento aprovado', 'Peças recebidas',
                  'Serviço executado', 'Teste', 'Entregue'],
    },
    {
      key: 'obra', nome: 'Projeto e obra', tag: 'Arquitetura', ico: '📐',
      papel: 'Cliente', documento: 'Contrato',
      campos: [
        { k: 'endereco',  rot: 'Endereço da obra', ico: '📍', tipo: 'texto' },
        { k: 'escopo',    rot: 'O que deseja fazer', ico: '📝', tipo: 'longo' },
        { k: 'area',      rot: 'Área (m²)',        ico: '📏', tipo: 'texto' },
        { k: 'estilo',    rot: 'Estilo e referências', ico: '🎨', tipo: 'texto' },
        { k: 'verba',     rot: 'Verba prevista',   ico: '💰', tipo: 'valor' },
        { k: 'prazoDesejado', rot: 'Prazo desejado', ico: '📅', tipo: 'data' },
        { k: 'etapa',     rot: 'Etapa',            ico: '🚧', tipo: 'texto', selo: S.obra },
        { k: 'medicao',   rot: 'Próxima medição',  ico: '📊', tipo: 'data', interno: true },
        { k: 'equipe',    rot: 'Equipe e fornecedores', ico: '👷', tipo: 'longo', interno: true },
      ],
      anexo: 'Plantas, fotos e medidas',
      checklist: ['Levantamento', 'Anteprojeto', 'Aprovação do cliente',
                  'Projeto executivo', 'Execução', 'Entrega'],
    },
    {
      key: 'tecnologia', nome: 'Projeto digital', tag: 'Tecnologia', ico: '💻',
      papel: 'Cliente', documento: 'Contrato / SOW',
      campos: [
        { k: 'objetivo',   rot: 'Objetivo do projeto', ico: '🎯', tipo: 'longo' },
        { k: 'escopo',     rot: 'Escopo',           ico: '🧩', tipo: 'texto', selo: S.andamento },
        { k: 'integracoes', rot: 'Integrações necessárias', ico: '🔌', tipo: 'texto' },
        { k: 'referencias', rot: 'Referências',     ico: '🔗', tipo: 'texto' },
        { k: 'entrega',    rot: 'Entrega',          ico: '📅', tipo: 'data' },
        { k: 'verba',      rot: 'Orçamento previsto', ico: '💰', tipo: 'valor' },
        { k: 'stack',      rot: 'Tecnologias',      ico: '⚙️', tipo: 'texto', interno: true },
        { k: 'ambiente',   rot: 'Ambiente e acessos', ico: '🔐', tipo: 'texto', interno: true },
        { k: 'suporte',    rot: 'Suporte combinado', ico: '🛟', tipo: 'texto', interno: true },
      ],
      checklist: ['Briefing', 'Proposta aprovada', 'Protótipo',
                  'Desenvolvimento', 'Homologação', 'Publicação', 'Suporte'],
    },
    {
      key: 'consultoria', nome: 'Consultoria', tag: 'Consultoria', ico: '📈',
      papel: 'Cliente', documento: 'Contrato',
      campos: [
        { k: 'desafio',    rot: 'Principal desafio hoje', ico: '🎯', tipo: 'longo' },
        { k: 'empresa',    rot: 'Empresa e porte',  ico: '🏢', tipo: 'texto' },
        { k: 'setor',      rot: 'Setor',            ico: '🏷️', tipo: 'texto' },
        { k: 'indicador',  rot: 'Indicador a melhorar', ico: '📊', tipo: 'texto' },
        { k: 'tentativas', rot: 'O que já tentaram', ico: '📜', tipo: 'longo' },
        { k: 'frente',     rot: 'Frente de trabalho', ico: '🗂️', tipo: 'texto', selo: S.andamento },
        { k: 'reuniao',    rot: 'Próxima reunião',  ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'diagnostico', rot: 'Diagnóstico',     ico: '🔎', tipo: 'longo', interno: true },
      ],
      checklist: ['Diagnóstico', 'Plano de ação', 'Implantação',
                  'Medição de resultado', 'Relatório final'],
    },
    {
      key: 'eventos', nome: 'Evento contratado', tag: 'Eventos', ico: '🎉',
      papel: 'Contratante', documento: 'Contrato',
      campos: [
        { k: 'evento',     rot: 'Tipo de evento',   ico: '🎪', tipo: 'texto' },
        { k: 'data',       rot: 'Data do evento',   ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'local',      rot: 'Local',            ico: '📍', tipo: 'texto' },
        { k: 'convidados', rot: 'Nº de convidados', ico: '👥', tipo: 'texto' },
        { k: 'horario',    rot: 'Horário',          ico: '⏰', tipo: 'texto' },
        { k: 'servicos',   rot: 'Serviços desejados', ico: '🍽️', tipo: 'longo' },
        { k: 'verba',      rot: 'Orçamento previsto', ico: '💰', tipo: 'valor' },
        { k: 'fornecedores', rot: 'Fornecedores',   ico: '🚚', tipo: 'longo', interno: true },
      ],
      checklist: ['Proposta', 'Contrato', 'Sinal pago', 'Fornecedores confirmados',
                  'Reunião de alinhamento', 'Evento realizado', 'Saldo quitado'],
    },
    {
      key: 'logistica', nome: 'Entrega e frete', tag: 'Logística', ico: '🚚',
      papel: 'Cliente', documento: 'Nota / Pedido',
      campos: [
        { k: 'pedido',    rot: 'Pedido / nota',    ico: '📦', tipo: 'texto', selo: S.entrega },
        { k: 'origem',    rot: 'Endereço de coleta', ico: '📍', tipo: 'texto' },
        { k: 'destino',   rot: 'Endereço de entrega', ico: '🏁', tipo: 'texto' },
        { k: 'carga',     rot: 'O que será transportado', ico: '📦', tipo: 'longo' },
        { k: 'peso',      rot: 'Peso e volume',    ico: '⚖️', tipo: 'texto' },
        { k: 'coleta',    rot: 'Coleta',           ico: '📅', tipo: 'data' },
        { k: 'janela',    rot: 'Janela de entrega', ico: '⏰', tipo: 'texto' },
        { k: 'rastreio',  rot: 'Rastreio',         ico: '🔎', tipo: 'texto', interno: true },
        { k: 'motorista', rot: 'Motorista / veículo', ico: '🧑‍✈️', tipo: 'texto', interno: true },
      ],
      checklist: ['Coleta agendada', 'Coletado', 'Em trânsito',
                  'Entregue', 'Comprovante recebido'],
    },
    {
      key: 'rh', nome: 'Processo seletivo', tag: 'Recrutamento', ico: '🧑‍💼',
      papel: 'Candidato', documento: 'Vaga',
      campos: [
        { k: 'vaga',       rot: 'Vaga',             ico: '💼', tipo: 'texto', selo: S.processo },
        { k: 'experiencia', rot: 'Experiência',     ico: '📜', tipo: 'longo' },
        { k: 'formacao',   rot: 'Formação',         ico: '🎓', tipo: 'texto' },
        { k: 'pretensao',  rot: 'Pretensão salarial', ico: '💰', tipo: 'valor' },
        { k: 'disponibilidade', rot: 'Disponibilidade para início', ico: '📅', tipo: 'data' },
        { k: 'modelo',     rot: 'Modelo de trabalho', ico: '🏠', tipo: 'texto', selo: S.trabalho },
        { k: 'linkedin',   rot: 'LinkedIn ou portfólio', ico: '🔗', tipo: 'texto' },
        { k: 'origem',     rot: 'Como soube da vaga', ico: '📣', tipo: 'texto', selo: S.origem },
        { k: 'entrevista', rot: 'Entrevista',       ico: '🗓️', tipo: 'data', selo: S.agenda, interno: true },
        { k: 'parecer',    rot: 'Parecer do avaliador', ico: '🗒️', tipo: 'longo', interno: true },
      ],
      anexo: 'Currículo e documentos',
      checklist: ['Triagem', 'Entrevista RH', 'Entrevista técnica',
                  'Teste prático', 'Proposta', 'Admissão'],
    },
    {
      key: 'comercio', nome: 'Venda e pedido', tag: 'Comércio', ico: '🛒',
      papel: 'Cliente', documento: 'Pedido',
      campos: [
        { k: 'pedido',    rot: 'Pedido',           ico: '🧾', tipo: 'texto', selo: S.entrega },
        { k: 'itens',     rot: 'Itens',            ico: '📦', tipo: 'longo' },
        { k: 'pagamento', rot: 'Forma de pagamento', ico: '💳', tipo: 'texto', selo: S.pagamento },
        { k: 'entregaEnd', rot: 'Endereço de entrega', ico: '📍', tipo: 'texto' },
        { k: 'entregaData', rot: 'Previsão de entrega', ico: '📅', tipo: 'data' },
        { k: 'observacoes', rot: 'Observações do pedido', ico: '📝', tipo: 'longo' },
        { k: 'nota',      rot: 'Nota fiscal',      ico: '🧾', tipo: 'texto', interno: true },
        { k: 'margem',    rot: 'Margem',           ico: '📈', tipo: 'valor', interno: true },
      ],
      checklist: ['Pedido confirmado', 'Pagamento recebido', 'Separado',
                  'Nota emitida', 'Enviado', 'Entregue'],
    },
    {
      key: 'manutencao', nome: 'Chamado de manutenção', tag: 'Serviços', ico: '🧰',
      papel: 'Cliente', documento: 'Chamado',
      campos: [
        { k: 'equipamento', rot: 'Equipamento ou local', ico: '🔌', tipo: 'texto' },
        { k: 'problema',   rot: 'Problema relatado', ico: '📝', tipo: 'longo' },
        { k: 'endereco',   rot: 'Endereço',         ico: '📍', tipo: 'texto' },
        { k: 'urgencia',   rot: 'Urgência',         ico: '⏱️', tipo: 'texto', selo: S.urgencia },
        { k: 'disponibilidade', rot: 'Melhores horários', ico: '⏰', tipo: 'texto' },
        { k: 'chamado',    rot: 'Chamado',          ico: '🎫', tipo: 'texto', selo: S.andamento },
        { k: 'visita',     rot: 'Visita técnica',   ico: '📅', tipo: 'data', selo: S.agenda },
        { k: 'garantia',   rot: 'Garantia até',     ico: '🛡️', tipo: 'data', interno: true },
        { k: 'laudo',      rot: 'Laudo técnico',    ico: '🗒️', tipo: 'longo', interno: true },
      ],
      anexo: 'Fotos do problema',
      checklist: ['Chamado aberto', 'Visita realizada', 'Orçamento aprovado',
                  'Peças recebidas', 'Serviço concluído', 'Garantia registrada'],
    },
    {
      key: 'financeiro', nome: 'Crédito e cobrança', tag: 'Financeiro', ico: '🏦',
      papel: 'Cliente', documento: 'Contrato',
      campos: [
        { k: 'operacao',   rot: 'Operação',         ico: '📄', tipo: 'texto', selo: S.processo },
        { k: 'finalidade', rot: 'Finalidade',       ico: '🎯', tipo: 'texto' },
        { k: 'valorPedido', rot: 'Valor solicitado', ico: '💰', tipo: 'valor' },
        { k: 'renda',      rot: 'Renda / faturamento', ico: '📈', tipo: 'valor' },
        { k: 'parcelas',   rot: 'Parcelas desejadas', ico: '🔢', tipo: 'texto' },
        { k: 'garantia',   rot: 'Garantia oferecida', ico: '🛡️', tipo: 'texto' },
        { k: 'vencimento', rot: 'Próximo vencimento', ico: '📅', tipo: 'data' },
        { k: 'score',      rot: 'Análise e score',  ico: '📊', tipo: 'texto', interno: true },
        { k: 'parecer',    rot: 'Parecer da análise', ico: '🗒️', tipo: 'longo', interno: true },
      ],
      anexo: 'Documentos para análise',
      checklist: ['Documentos recebidos', 'Análise de crédito', 'Aprovado',
                  'Contrato assinado', 'Liberado', 'Primeira parcela'],
    },
    {
      key: 'marketing', nome: 'Campanha', tag: 'Marketing', ico: '📣',
      papel: 'Cliente', documento: 'Conta / Campanha',
      campos: [
        { k: 'objetivo',   rot: 'Objetivo da campanha', ico: '🎯', tipo: 'texto' },
        { k: 'publico',    rot: 'Público-alvo',     ico: '👥', tipo: 'longo' },
        { k: 'produto',    rot: 'Produto ou serviço', ico: '📦', tipo: 'texto' },
        { k: 'diferencial', rot: 'Diferencial',     ico: '✨', tipo: 'longo' },
        { k: 'concorrentes', rot: 'Concorrentes',   ico: '🥊', tipo: 'texto' },
        { k: 'canais',     rot: 'Canais',           ico: '📡', tipo: 'texto' },
        { k: 'verba',      rot: 'Verba',            ico: '💰', tipo: 'valor' },
        { k: 'periodo',    rot: 'Período',          ico: '📅', tipo: 'data' },
        { k: 'campanha',   rot: 'Campanha',         ico: '🚀', tipo: 'texto', selo: S.andamento, interno: true },
        { k: 'metricas',   rot: 'Métricas acompanhadas', ico: '📊', tipo: 'longo', interno: true },
      ],
      anexo: 'Logo e materiais da marca',
      checklist: ['Briefing', 'Estratégia aprovada', 'Criativos aprovados',
                  'Campanha no ar', 'Otimização', 'Relatório entregue'],
    },
    {
      key: 'generico', nome: 'Ficha simples', tag: 'Geral', ico: '💼',
      papel: 'Cliente', documento: 'Identificação',
      campos: [
        { k: 'assunto',    rot: 'Assunto',          ico: '🗂️', tipo: 'texto', selo: S.andamento },
        { k: 'necessidade', rot: 'O que você precisa', ico: '🎯', tipo: 'longo' },
        { k: 'origem',     rot: 'Como nos conheceu', ico: '🔗', tipo: 'texto', selo: S.origem },
        { k: 'compromisso', rot: 'Compromisso',     ico: '📅', tipo: 'data' },
        { k: 'anotacoes',  rot: 'Anotações',        ico: '📝', tipo: 'longo', interno: true },
      ],
      checklist: ['Primeiro contato', 'Proposta', 'Fechado'],
    },
  ];

  const porChave = {};
  NICHOS.forEach(n => { porChave[n.key] = n; });

  /* Modelo de uma ficha. Ficha sem modelo (todas as que já existiam) cai no
     genérico, que só acrescenta e não remove nada do que já era mostrado. */
  function modeloDe(rec) {
    return porChave[(rec && rec.template) || ''] || porChave.generico;
  }

  /* Sugestão pelo texto: quem escreve "audiência" na descrição provavelmente
     quer o modelo de advocacia. É palpite, e por isso só pré-seleciona no
     cadastro — nunca troca sozinho um modelo já escolhido. */
  const PISTAS = [
    [/audi[êe]ncia|processo|petiç|jur[íi]dic|advog|oab\b/i, 'advocacia'],
    [/dent|odonto|clarea|profilaxia|canal\b/i,              'odontologia'],
    [/consulta|paciente|exame|receita|cl[íi]nic/i,          'saude'],
    [/terapia|psicó|psico|sess[ãa]o/i,                      'psicologia'],
    [/nutri|dieta|card[áa]pio/i,                            'nutricao'],
    [/pet|veterin|vacina|animal/i,                          'veterinaria'],
    [/cont[áa]bil|imposto|simples nacional|dctf|folha/i,    'contabilidade'],
    [/im[óo]vel|alugu|loca[çc][ãa]o|apartamento|casa\b/i,   'imobiliaria'],
    [/seguro|ap[óo]lice|sinistro/i,                         'seguros'],
    [/curso|aula|matr[íi]cula|turma|aluno/i,                'educacao'],
    [/est[ée]tic|botox|limpeza de pele|design de sobrance/i, 'estetica'],
    [/treino|academia|personal|muscula/i,                   'fitness'],
    [/ve[íi]culo|carro|moto\b|oficina|revis[ãa]o|placa/i,   'automotivo'],
    [/obra|reforma|projeto arquitet|planta baixa/i,         'obra'],
    [/site|sistema|app\b|software|landing|integraç/i,       'tecnologia'],
    [/consultoria|mentoria|diagn[óo]stico empres/i,         'consultoria'],
    [/casamento|festa|evento|bufê|bufe/i,                   'eventos'],
    [/frete|entrega|transporte|coleta|romaneio/i,           'logistica'],
    [/vaga|candidat|entrevista|recrutament/i,               'rh'],
    [/pedido|venda|produto|estoque/i,                       'comercio'],
    [/chamado|manuten|conserto|instala/i,                   'manutencao'],
    [/empr[ée]stimo|cr[ée]dito|financiament|cobran/i,       'financeiro'],
    [/campanha|an[úu]ncio|tr[áa]fego|social media/i,        'marketing'],
  ];

  function sugerir(texto) {
    const t = String(texto || '');
    if (!t.trim()) return null;
    for (const [re, key] of PISTAS) if (re.test(t)) return key;
    return null;
  }

  /* Checklist inicial do modelo, no formato gravado na ficha. */
  function checklistInicial(key) {
    const m = porChave[key];
    return m ? m.checklist.map(t => ({ t, ok: false })) : [];
  }

  function progresso(checklist) {
    const lista = Array.isArray(checklist) ? checklist : [];
    const feitas = lista.filter(i => i && i.ok).length;
    return { feitas, total: lista.length, pct: lista.length ? feitas / lista.length * 100 : 0 };
  }

  /* ── Idioma dos rótulos ───────────────────────────────────────────────
     O que identifica um modelo e um campo é a `key` e o `k`, que vão para o
     banco e nunca mudam. Rótulo é só o que se lê — então traduzir é reescrever
     os rótulos no lugar, e nenhum dos quinze pontos que leem `m.nome`, `c.rot`
     ou `m.checklist` precisa saber que existe tradução.

     O original em português fica guardado em `_pt` na primeira passada: sem
     isso, trocar de idioma duas vezes traduziria a tradução. E os arrays de
     selo são COMPARTILHADOS entre modelos (o mesmo S.agenda em vários), por
     isso cada campo recebe um array novo em vez de ter o dele mutado. */
  function _idiomaAtivo() {
    const api = global.MyDeskI18n;
    const lang = api && api.getLanguage ? api.getLanguage() : 'pt';
    return lang === 'en' ? 0 : lang === 'es' ? 1 : -1;
  }

  function aplicarIdioma() {
    const idx = _idiomaAtivo();
    const dic = global.MD_NICHOS_TRAD || null;
    // Texto sem tradução cai no português — degrada para o original.
    const t = s => {
      if (idx < 0 || !dic) return s;
      const par = dic[s];
      return (par && par[idx]) || s;
    };
    NICHOS.forEach(m => {
      if (!m._pt) {
        m._pt = {
          nome: m.nome, tag: m.tag, papel: m.papel, documento: m.documento,
          anexo: m.anexo, checklist: (m.checklist || []).slice(),
          campos: (m.campos || []).map(c => ({
            rot: c.rot, selo: c.selo ? c.selo.slice() : null,
          })),
        };
      }
      const o = m._pt;
      m.nome = t(o.nome);
      m.tag = t(o.tag);
      m.papel = t(o.papel);
      m.documento = t(o.documento);
      if (o.anexo) m.anexo = t(o.anexo);
      m.checklist = o.checklist.map(t);
      (m.campos || []).forEach((c, i) => {
        const orig = o.campos[i];
        if (!orig) return;
        c.rot = t(orig.rot);
        if (orig.selo) c.selo = orig.selo.map(t);
      });
    });
  }

  /* Este arquivo carrega antes do i18n.js, então a primeira aplicação espera o
     DOM ficar pronto — quando o catálogo já existe e nada foi desenhado.

     Os guardas não são decoração: este módulo também é carregado fora do
     navegador (pelos testes, num contexto de vm sem document nem window
     completos), e ali só o que importa é a lista, em português. */
  const doc = global.document;
  if (doc && typeof doc.addEventListener === 'function' && doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', aplicarIdioma);
  } else {
    aplicarIdioma();
  }
  /* Registrado antes do app.js, logo roda antes dos repaints dele: quando o
     app for redesenhar os painéis, os rótulos já estão no idioma novo. */
  if (typeof global.addEventListener === 'function') {
    global.addEventListener('mydesk:languagechange', aplicarIdioma);
  }

  global.MD_NICHOS = {
    lista: NICHOS, porChave, modeloDe, sugerir, checklistInicial, progresso,
    selos: S, aplicarIdioma,
  };
})(window);
