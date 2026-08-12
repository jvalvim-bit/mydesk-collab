// Firebase initialization for the isolated collaboration copy.
//
// The production Firebase project is intentionally not embedded here. Create
// firebase-config.local.js from firebase-config.local.example.js and use a
// Firebase development project or the Emulator.
(function () {
  'use strict';

  const placeholder = {
    apiKey: 'DEMO_REPLACE_WITH_DEVELOPMENT_CONFIG',
    authDomain: 'mydesk-collab-dev.firebaseapp.com',
    databaseURL: 'https://mydesk-collab-dev-default-rtdb.firebaseio.com',
    projectId: 'mydesk-collab-dev',
    storageBucket: 'mydesk-collab-dev.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:demo',
  };

  function unavailable(reason) {
    window._fbConfig = window.MYDESK_FIREBASE_CONFIG || placeholder;
    window._fbInitError = reason;
    window._fbInitDone = true;
    console.warn('[MyDesk-Colab] Firebase desativado:', reason);
  }

  const cfg = window.MYDESK_FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || !cfg.projectId || !cfg.databaseURL) {
    unavailable('Configure docs/js/firebase-config.local.js com um projeto de desenvolvimento.');
    return;
  }

  const project = String(cfg.projectId).toLowerCase();
  const database = String(cfg.databaseURL).toLowerCase();
  if (project === 'mydesk-ad0da' || database.includes('mydesk-ad0da')) {
    unavailable('A configuração Firebase de produção é bloqueada no MyDesk-Colab.');
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    window._fbConfig = cfg;
    window._fbApp = firebase.app();
    window._fbDB = firebase.database();
    window._fbAuth = firebase.auth();

    function firebaseLanguage(value) {
      const lang = String(value || '').toLowerCase();
      if (lang.indexOf('en') === 0) return 'en';
      if (lang.indexOf('es') === 0) return 'es';
      return 'pt-BR';
    }

    let savedLanguage = null;
    try { savedLanguage = localStorage.getItem('md_lang'); } catch (_) {}
    window._fbAuth.languageCode = firebaseLanguage(savedLanguage || navigator.language);
    window.addEventListener('mydesk:languagechange', function (event) {
      window._fbAuth.languageCode = firebaseLanguage(event.detail && event.detail.language);
    });
    window._fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function () {});
    window._fbInitDone = true;
  } catch (error) {
    unavailable('Não foi possível inicializar o Firebase de desenvolvimento.');
    console.warn('[MyDesk-Colab] erro Firebase:', error && error.message);
  }
})();
