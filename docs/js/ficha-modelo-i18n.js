'use strict';
/* ═══════════════════════════════════════════════════════════════════════
   MODELO OFICIAL DE FICHA — RÓTULOS EM OUTROS IDIOMAS
   ═══════════════════════════════════════════════════════════════════════
   O modelo (docs/modelos/ficha-mydesk.docx) foi desenhado em português, e o
   português é a chave: o dicionário é texto→texto, casando com o que está
   escrito dentro do .docx. Assim o arquivo do modelo continua sendo o único
   dono do layout — para mudar o desenho troca-se o .docx, e só se mexe aqui
   quando um RÓTULO muda de nome.

   Rótulo sem entrada aqui sai em português. Degrada para o original em vez de
   sair vazio, que num documento que a pessoa manda para o cliente dela é a
   diferença entre "estranho" e "quebrado".

   Cada valor é [inglês, espanhol].
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
  global.MD_FICHA_TRAD = {
    // ── Cabeçalho e rodapé ──────────────────────────────────────────
    'MODELO OFICIAL DO MYDESK': ['OFFICIAL MYDESK TEMPLATE', 'PLANTILLA OFICIAL DE MYDESK'],
    'Modelo de Ficha Editável  •  Template Universal': [
      'Editable Record Template  •  Universal Layout',
      'Plantilla de Ficha Editable  •  Formato Universal',
    ],
    'Documento totalmente editável • Preenchimento manual ou automático': [
      'Fully editable document • Fill in manually or automatically',
      'Documento totalmente editable • Rellenado manual o automático',
    ],
    'Data de criação:': ['Created on:', 'Fecha de creación:'],
    'ID / Registro:': ['ID / Record:', 'ID / Registro:'],

    // ── 1. Informações gerais ───────────────────────────────────────
    '1. INFORMAÇÕES GERAIS': ['1. GENERAL INFORMATION', '1. INFORMACIÓN GENERAL'],
    'Título / Assunto': ['Title / Subject', 'Título / Asunto'],
    'Status': ['Status', 'Estado'],
    'Descrição curta': ['Short description', 'Descripción breve'],
    'Prioridade': ['Priority', 'Prioridad'],
    'Origem / Canal': ['Source / Channel', 'Origen / Canal'],
    'Categoria / Tipo': ['Category / Type', 'Categoría / Tipo'],
    'Tags / Palavras-chave': ['Tags / Keywords', 'Etiquetas / Palabras clave'],

    // ── 2. Dados do cliente ─────────────────────────────────────────
    '2. DADOS DO CLIENTE / EMPRESA / PROJETO': [
      '2. CLIENT / COMPANY / PROJECT DETAILS',
      '2. DATOS DEL CLIENTE / EMPRESA / PROYECTO',
    ],
    'Tipo de cadastro': ['Record type', 'Tipo de registro'],
    'Nome / Razão Social': ['Name / Legal name', 'Nombre / Razón social'],
    'Nome Fantasia': ['Trade name', 'Nombre comercial'],
    'CPF / CNPJ': ['Tax ID', 'Identificación fiscal'],
    'RG / Inscrição Estadual': ['ID / State registration', 'DNI / Registro estatal'],
    'Segmento / Área': ['Industry / Field', 'Sector / Área'],
    'Profissão / Cargo': ['Profession / Role', 'Profesión / Cargo'],
    'Projeto / Referência': ['Project / Reference', 'Proyecto / Referencia'],

    // ── 3. Contato ──────────────────────────────────────────────────
    '3. CONTATO': ['3. CONTACT', '3. CONTACTO'],
    'Responsável / Contato': ['Contact person', 'Responsable / Contacto'],
    'CEP': ['Postal code', 'Código postal'],
    'Cargo / Função': ['Job title / Role', 'Cargo / Función'],
    'Endereço': ['Address', 'Dirección'],
    'E-mail': ['Email', 'Correo'],
    'Número / Complemento': ['Number / Unit', 'Número / Complemento'],
    'E-mail secundário': ['Secondary email', 'Correo secundario'],
    'Bairro': ['Neighborhood', 'Barrio'],
    'Telefone': ['Phone', 'Teléfono'],
    'Cidade / UF': ['City / State', 'Ciudad / Provincia'],
    'Celular / WhatsApp': ['Mobile / WhatsApp', 'Móvil / WhatsApp'],
    'Site / Redes': ['Website / Social', 'Sitio / Redes'],

    // ── 4. Responsável interno ──────────────────────────────────────
    '4. RESPONSÁVEL INTERNO E ATENDIMENTO': [
      '4. INTERNAL OWNER AND SERVICE',
      '4. RESPONSABLE INTERNO Y ATENCIÓN',
    ],
    'Responsável interno': ['Internal owner', 'Responsable interno'],
    'Valor total': ['Total amount', 'Importe total'],
    'Equipe / Departamento': ['Team / Department', 'Equipo / Departamento'],
    'Valor recebido': ['Amount received', 'Importe recibido'],
    'Função': ['Role', 'Función'],
    'Valor pendente': ['Amount outstanding', 'Importe pendiente'],
    'Serviço / Descrição': ['Service / Description', 'Servicio / Descripción'],
    'Status financeiro': ['Payment status', 'Estado financiero'],

    // ── 5. Datas ────────────────────────────────────────────────────
    '5. DATAS IMPORTANTES': ['5. KEY DATES', '5. FECHAS IMPORTANTES'],
    'Data de abertura': ['Opened on', 'Fecha de apertura'],
    'Vencimento': ['Due date', 'Vencimiento'],
    'Data prevista / Prazo': ['Target date / Deadline', 'Fecha prevista / Plazo'],
    'Último contato': ['Last contact', 'Último contacto'],
    'Data de conclusão': ['Completed on', 'Fecha de conclusión'],
    'Próximo contato': ['Next contact', 'Próximo contacto'],

    // ── 6 a 11 ──────────────────────────────────────────────────────
    '6. DESCRIÇÃO DETALHADA / OBSERVAÇÕES': [
      '6. DETAILED DESCRIPTION / NOTES',
      '6. DESCRIPCIÓN DETALLADA / OBSERVACIONES',
    ],
    '7. CHECKLIST': ['7. CHECKLIST', '7. LISTA DE TAREAS'],
    'Item': ['Item', 'Tarea'],
    'Responsável': ['Owner', 'Responsable'],
    'Prazo': ['Due', 'Plazo'],
    'Situação': ['State', 'Situación'],
    '8. ANEXOS / LINKS': ['8. ATTACHMENTS / LINKS', '8. ADJUNTOS / ENLACES'],
    'Arquivo / Link': ['File / Link', 'Archivo / Enlace'],
    'Tipo': ['Type', 'Tipo'],
    'Data': ['Date', 'Fecha'],
    '9. HISTÓRICO / ATUALIZAÇÕES': ['9. HISTORY / UPDATES', '9. HISTORIAL / ACTUALIZACIONES'],
    'Data / Hora': ['Date / Time', 'Fecha / Hora'],
    'Ação': ['Action', 'Acción'],
    'Atualização': ['Update', 'Actualización'],
    'Observações': ['Notes', 'Observaciones'],
    '10. DOCUMENTOS SOLICITADOS': ['10. REQUESTED DOCUMENTS', '10. DOCUMENTOS SOLICITADOS'],
    'Documento': ['Document', 'Documento'],
    'Solicitado em': ['Requested on', 'Solicitado el'],
    'Recebido em': ['Received on', 'Recibido el'],
    '11. CAMPOS PERSONALIZADOS': ['11. CUSTOM FIELDS', '11. CAMPOS PERSONALIZADOS'],
  };
})(window);
