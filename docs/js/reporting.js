'use strict';

/*
 * Reportes do usuário.
 *
 * O atalho ocupa o mesmo lugar do Admin: administradores continuam entrando
 * no painel; contas comuns abrem este formulário. A identidade do remetente
 * não é enviada como fonte de verdade — /api/reports deriva UID, e-mail e @ do
 * token Firebase verificado no servidor.
 */
(function initReporting() {
  const COPY = {
    pt: {
      button: 'Reportar',
      title: 'Reportar um problema',
      subtitle: 'Conte o que aconteceu. Seu reporte será enviado diretamente para a equipe administrativa.',
      category: 'Tipo de ocorrência',
      bug: 'Bug',
      bugHint: 'Algo não funciona como deveria',
      problem: 'Problema',
      problemHint: 'Dificuldade de uso ou acesso',
      subject: 'Resumo',
      subjectPh: 'Ex.: Não consigo abrir um workspace',
      description: 'O que aconteceu?',
      descriptionPh: 'Descreva os passos, o resultado esperado e o que apareceu na tela…',
      cancel: 'Cancelar',
      send: 'Enviar reporte',
      sending: 'Enviando…',
      success: 'Reporte enviado. A administração já recebeu a solicitação.',
      auth: 'Sua sessão expirou. Entre novamente para enviar o reporte.',
      generic: 'Não foi possível enviar agora. Tente novamente.',
      close: 'Fechar formulário de reporte',
      adminTitle: 'Painel Administrativo',
    },
    en: {
      button: 'Report',
      title: 'Report an issue',
      subtitle: 'Tell us what happened. Your report will go directly to the administration team.',
      category: 'Issue type',
      bug: 'Bug',
      bugHint: 'Something is not working as expected',
      problem: 'Problem',
      problemHint: 'A usage or access difficulty',
      subject: 'Summary',
      subjectPh: 'Example: I cannot open a workspace',
      description: 'What happened?',
      descriptionPh: 'Describe the steps, the expected result, and what appeared on screen…',
      cancel: 'Cancel',
      send: 'Send report',
      sending: 'Sending…',
      success: 'Report sent. The administration team has received it.',
      auth: 'Your session has expired. Sign in again to send the report.',
      generic: 'Could not send it right now. Please try again.',
      close: 'Close report form',
      adminTitle: 'Administration panel',
    },
    es: {
      button: 'Reportar',
      title: 'Reportar un problema',
      subtitle: 'Cuéntanos qué pasó. Tu reporte llegará directamente al equipo de administración.',
      category: 'Tipo de incidencia',
      bug: 'Bug',
      bugHint: 'Algo no funciona como debería',
      problem: 'Problema',
      problemHint: 'Una dificultad de uso o acceso',
      subject: 'Resumen',
      subjectPh: 'Ej.: No puedo abrir un workspace',
      description: '¿Qué pasó?',
      descriptionPh: 'Describe los pasos, el resultado esperado y lo que apareció en pantalla…',
      cancel: 'Cancelar',
      send: 'Enviar reporte',
      sending: 'Enviando…',
      success: 'Reporte enviado. El equipo de administración ya lo recibió.',
      auth: 'Tu sesión expiró. Inicia sesión de nuevo para enviar el reporte.',
      generic: 'No se pudo enviar ahora. Inténtalo de nuevo.',
      close: 'Cerrar formulario de reporte',
      adminTitle: 'Panel de administración',
    },
  };

  function language() {
    const fromShared = window.MyDeskI18n?.getLanguage?.();
    const saved = String(fromShared || localStorage.getItem('md_lang') || 'pt').toLowerCase();
    if (saved.startsWith('en')) return 'en';
    if (saved.startsWith('es')) return 'es';
    return 'pt';
  }

  function text(key) {
    return COPY[language()]?.[key] || COPY.pt[key] || key;
  }

  function buttonIcon(admin) {
    return admin
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 21V4"/><path d="M5 5h11l-2 4 2 4H5"/><path d="M9 17h10"/><circle cx="18" cy="17" r="2"/></svg>';
  }

  function configureShortcut() {
    const button = document.getElementById('btn-admin');
    if (!button) return;
    const authenticated = window.authState?.isAuthenticated || !!window._fbAuth?.currentUser;
    if (!authenticated && !window._appLaunched) return;

    const admin = window.authState?.isAdmin === true;
    const label = admin ? 'Admin' : text('button');
    button.style.display = 'flex';
    button.dataset.mode = admin ? 'admin' : 'report';
    button.dataset.mobileLabel = label;
    button.classList.toggle('t-btn-report', !admin);
    button.title = admin ? text('adminTitle') : text('title');
    button.setAttribute('aria-label', button.title);
    button.innerHTML = `${buttonIcon(admin)}<span>${label}</span>`;
  }

  function closeModal() {
    const overlay = document.getElementById('report-modal');
    if (!overlay) return;
    overlay.classList.remove('visible');
    document.body.classList.remove('report-modal-open');
    setTimeout(() => overlay.remove(), 220);
  }

  function selectCategory(overlay, value) {
    overlay.querySelectorAll('[data-report-category]').forEach(button => {
      const active = button.dataset.reportCategory === value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    overlay.querySelector('#report-category').value = value;
  }

  function showStatus(overlay, message, kind) {
    const status = overlay.querySelector('#report-status');
    status.textContent = message || '';
    status.className = `report-status ${kind || ''}`;
  }

  async function submitReport(overlay) {
    const form = overlay.querySelector('form');
    if (!form.reportValidity()) return;
    const currentUser = window._fbAuth?.currentUser;
    if (!currentUser) {
      showStatus(overlay, text('auth'), 'error');
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = text('sending');
    showStatus(overlay, '', '');

    try {
      const token = await currentUser.getIdToken();
      // O frontend oficial também é publicado como site estático. As funções
      // vivem na Vercel, portanto uma URL relativa cairia no GitHub Pages e
      // responderia 404 mesmo com o formulário correto.
      const apiBase = typeof VERCEL_API !== 'undefined'
        ? VERCEL_API
        : (window.MYDESK_API_BASE_URL || window.location.origin);
      const response = await fetch(apiBase + '/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'create',
          category: form.elements.category.value,
          title: form.elements.title.value,
          description: form.elements.description.value,
          page: `${location.pathname}${location.search}${location.hash}`,
          locale: document.documentElement.lang || 'pt-BR',
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || text('generic'));

      showStatus(overlay, text('success'), 'success');
      form.reset();
      selectCategory(overlay, 'bug');
      overlay.querySelector('#report-char-count').textContent = '0 / 3000';
      if (typeof window.toast === 'function') window.toast('✓', text('success'));
      setTimeout(closeModal, 1350);
    } catch (error) {
      showStatus(overlay, error?.message || text('generic'), 'error');
    } finally {
      submit.disabled = false;
      submit.textContent = text('send');
    }
  }

  function openReportModal() {
    document.getElementById('report-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'report-modal';
    overlay.className = 'report-modal-bg';
    overlay.innerHTML = `
      <section class="report-modal-card" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
        <header class="report-modal-head">
          <span class="report-modal-symbol" aria-hidden="true">${buttonIcon(false)}</span>
          <span>
            <strong id="report-modal-title">${text('title')}</strong>
            <small>${text('subtitle')}</small>
          </span>
          <button type="button" class="report-modal-close" aria-label="${text('close')}">×</button>
        </header>
        <form class="report-form">
          <input id="report-category" name="category" type="hidden" value="bug">
          <fieldset>
            <legend>${text('category')}</legend>
            <div class="report-category-grid">
              <button type="button" class="report-category active" data-report-category="bug" aria-pressed="true">
                <span aria-hidden="true">⌁</span><b>${text('bug')}</b><small>${text('bugHint')}</small>
              </button>
              <button type="button" class="report-category" data-report-category="problem" aria-pressed="false">
                <span aria-hidden="true">!</span><b>${text('problem')}</b><small>${text('problemHint')}</small>
              </button>
            </div>
          </fieldset>
          <label for="report-title">${text('subject')}</label>
          <input id="report-title" name="title" type="text" minlength="5" maxlength="120"
                 placeholder="${text('subjectPh')}" required autocomplete="off">
          <label for="report-description">${text('description')}</label>
          <textarea id="report-description" name="description" minlength="10" maxlength="3000"
                    placeholder="${text('descriptionPh')}" required></textarea>
          <div class="report-form-meta">
            <span id="report-char-count">0 / 3000</span>
            <span id="report-status" class="report-status" role="status" aria-live="polite"></span>
          </div>
          <footer>
            <button type="button" class="report-cancel">${text('cancel')}</button>
            <button type="submit" class="report-submit">${text('send')}</button>
          </footer>
        </form>
      </section>`;

    document.body.appendChild(overlay);
    document.body.classList.add('report-modal-open');
    requestAnimationFrame(() => overlay.classList.add('visible'));

    overlay.querySelector('.report-modal-close').addEventListener('click', closeModal);
    overlay.querySelector('.report-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeModal();
    });
    overlay.querySelectorAll('[data-report-category]').forEach(button => {
      button.addEventListener('click', () => selectCategory(overlay, button.dataset.reportCategory));
    });
    const description = overlay.querySelector('#report-description');
    description.addEventListener('input', () => {
      overlay.querySelector('#report-char-count').textContent = `${description.value.length} / 3000`;
    });
    overlay.querySelector('form').addEventListener('submit', event => {
      event.preventDefault();
      submitReport(overlay);
    });
    overlay.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeModal();
    });
    setTimeout(() => overlay.querySelector('#report-title')?.focus(), 120);
  }

  // O handler já existente chama este nome. Substituí-lo mantém um único
  // atalho e não duplica listeners, inclusive na navegação compacta.
  window.openAdminPanel = function openAdminOrReport() {
    if (window.authState?.isAdmin === true) {
      window.location.href = 'admin/';
      return;
    }
    openReportModal();
  };
  window.openReportModal = openReportModal;
  window.refreshReportShortcut = configureShortcut;

  document.addEventListener('DOMContentLoaded', configureShortcut);
  window.addEventListener('authStateChanged', configureShortcut);
  window.addEventListener('mydesk:languagechange', configureShortcut);
})();
