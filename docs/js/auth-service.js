'use strict';

// Estado global de autenticação — lido por app.js, admin panel e qualquer outro módulo
window.authState = { user: null, isAuthenticated: false, isAdmin: false, loading: true };

(function initAuthService() {
  function trySetup() {
    if (window._fbInitError) {
      window.authState = { user: null, isAuthenticated: false, isAdmin: false, loading: false };
      window.dispatchEvent(new CustomEvent('authStateChanged', { detail: window.authState }));
      return;
    }
    if (!window._fbInitDone || !window._fbAuth) { setTimeout(trySetup, 100); return; }

    window._fbAuth.onAuthStateChanged(async function(fbUser) {
      if (fbUser) {
        try {
          const token = await fbUser.getIdTokenResult();
          window.authState = {
            user:            fbUser,
            isAuthenticated: true,
            isAdmin:         token.claims.admin === true,
            loading:         false,
          };
        } catch(_) {
          window.authState = { user: fbUser, isAuthenticated: true, isAdmin: false, loading: false };
        }
      } else {
        window.authState = { user: null, isAuthenticated: false, isAdmin: false, loading: false };
      }
      window.dispatchEvent(new CustomEvent('authStateChanged', { detail: window.authState }));
    });
  }
  trySetup();
})();

// Força renovação do token e atualiza isAdmin — chamar após conceder claim via Admin SDK
async function refreshAdminClaim() {
  const user = window._fbAuth?.currentUser;
  if (!user) return false;
  try {
    await user.getIdToken(true);                  // invalida cache, busca novo token
    const token  = await user.getIdTokenResult(); // lê o novo token
    const isAdmin = token.claims.admin === true;
    window.authState = { ...window.authState, isAdmin, user };
    window.dispatchEvent(new CustomEvent('authStateChanged', { detail: window.authState }));
    return isAdmin;
  } catch(e) {
    console.warn('[authService] refreshAdminClaim error:', e);
    return false;
  }
}
