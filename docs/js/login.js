'use strict';

/* ═════════════════════════════════════════════════════════════
   MyDesk — página de login/registro (design "aurora", 1:1 com o
   arquivo enviado — telefone removido, senha também no cadastro
   porque o Firebase exige senha pra criar conta).
   ═════════════════════════════════════════════════════════════ */

const $  = id => document.getElementById(id);
const $v = id => $(id).value;
const mdLoginT = (key, fallback, vars) => (
  window.MyDeskI18n ? window.MyDeskI18n.t(key, vars, fallback) : fallback
);

const form   = $('form');
const submit = $('submit');
const msg    = $('msg');
const thumb  = $('thumb');
let mode = 'signup';

/* O giro da aurora saiu daqui. Ele era feito animando a propriedade custom
   --ang dentro do conic-gradient, o que forca REPINTAR o gradiente e refazer
   o blur (110px na .haze) a cada quadro, em elementos de ~2100x2100px. Agora
   e um transform:rotate no proprio elemento — mesmo desenho, porque a
   mascara e radial e simetrica, e composto na GPU. Ver o comentario de
   @keyframes spin em login.html. NAO voltar a animar propriedade custom que
   alimenta gradiente: e repaint garantido. */

/* ── segmentado (Criar conta / Entrar) ── */
function moveThumb() {
  const on = document.querySelector('.seg button[aria-selected="true"]');
  thumb.style.width = on.offsetWidth + 'px';
  thumb.style.transform = `translateX(${on.offsetLeft - 3}px)`;
}
function applyModeCopy() {
  const up = mode === 'signup';
  $('ttl').textContent = up
    ? mdLoginT('auth.create', 'Criar conta')
    : mdLoginT('auth.welcomeBack', 'Bem-vindo de volta');
  submit.textContent = up
    ? mdLoginT('auth.create', 'Criar conta')
    : mdLoginT('auth.signIn', 'Entrar');
}
function setMode(m) {
  mode = m;
  document.querySelectorAll('.seg button').forEach(b =>
    b.setAttribute('aria-selected', String(b.dataset.mode === m)));
  const up = m === 'signup';
  $('cNames').toggleAttribute('data-off', !up);
  $('cUser').toggleAttribute('data-off', !up);
  $('cForgot').toggleAttribute('data-off', up);
  applyModeCopy();
  clearErrors();
  moveThumb();
}
document.querySelectorAll('.seg button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
addEventListener('resize', moveThumb);
document.fonts ? document.fonts.ready.then(moveThumb) : moveThumb();
moveThumb();

/* ── senha visível ── */
$('eye').onclick = () => {
  const p = $('password');
  p.type = p.type === 'password' ? 'text' : 'password';
  $('eye').setAttribute('aria-label', p.type === 'password'
    ? mdLoginT('auth.showPassword', 'Mostrar senha')
    : mdLoginT('auth.hidePassword', 'Ocultar senha'));
  p.focus();
};
window.addEventListener('mydesk:languagechange', () => {
  applyModeCopy();
  const password = $('password');
  $('eye').setAttribute('aria-label', password.type === 'password'
    ? mdLoginT('auth.showPassword', 'Mostrar senha')
    : mdLoginT('auth.hidePassword', 'Ocultar senha'));
  moveThumb();
});

/* ── validação ── */
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
function clearErrors() {
  document.querySelectorAll('.ctrl').forEach(c => c.classList.remove('bad'));
  msg.classList.remove('on', 'ok');
}
function fail(text, ...fields) {
  fields.forEach(f => f && f.closest('.ctrl').classList.add('bad'));
  msg.textContent = text;
  msg.classList.remove('ok');
  msg.classList.add('on');
  return false;
}
function okMsg(text) {
  msg.textContent = text;
  msg.classList.add('on', 'ok');
}

/* ── Firebase helpers ── */
let _db = null, _auth = null, _fbReady = false;
function loadFirebase() {
  return new Promise(ok => {
    if (_fbReady) { ok(); return; }
    (function tryInit() {
      if (window._fbInitDone) { _db = window._fbDB; _auth = window._fbAuth; _fbReady = true; ok(); }
      else setTimeout(tryInit, 50);
    })();
  });
}
function getAuth() { return _auth || window._fbAuth || null; }
function fbGet(path) { return _db.ref(path).once('value').then(s => s.val()); }
function fbSet(path, val) { return _db.ref(path).set(val); }

/* Logo após criar a conta, o socket do RTDB pode ainda não estar
   autenticado — a primeira escrita chega ao servidor como anônima e é
   negada pelas regras. Retry com backoff dá tempo do token anexar. */
async function fbRetry(fn, tries = 6) {
  let wait = 300;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      if (i === tries - 1) throw e;
      await new Promise(r => setTimeout(r, wait));
      wait = Math.min(wait * 2, 2000);
    }
  }
}

/* ── Mensagens de erro Firebase, traduzidas ── */
const AUTH_ERR_KEYS = {
  'auth/email-already-in-use':      'auth.errEmailInUse',
  'auth/invalid-email':             'auth.errInvalidEmail',
  'auth/weak-password':             'auth.errWeakPassword',
  'auth/user-not-found':            'auth.errUserNotFound',
  'auth/wrong-password':            'auth.errWrongPassword',
  'auth/invalid-credential':        'auth.errCredentials',
  'auth/invalid-login-credentials': 'auth.errCredentials',
  'auth/missing-password':          'auth.errMissingPassword',
  'auth/too-many-requests':         'auth.errTooMany',
  'auth/network-request-failed':    'auth.errNetwork',
  'auth/user-disabled':             'auth.errDisabled',
  'auth/operation-not-allowed':     'auth.errOperation',
  'auth/configuration-not-found':   'auth.errConfig',
  default:                          'auth.errDefault',
};
function authErrMsg(code) {
  const key = AUTH_ERR_KEYS[code] || AUTH_ERR_KEYS.default;
  return mdLoginT(key, mdLoginT('auth.errDefault', 'Erro ao autenticar. Tente novamente.'));
}

/* ── Hash de senha para modo demo (offline, sem Firebase) ── */
function _demoGenSalt() {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function _demoHashPass(pass, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ── nome de usuário derivado do e-mail (sem campo visível no formulário —
   o design enviado não tem esse campo; a mesma estratégia já é usada no
   fluxo de login com Google, que também não coleta usuário) ── */
async function deriveUsername(email) {
  const prefix = (email || '').split('@')[0].toLowerCase()
    .replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').slice(0, 20) || 'user';
  let candidate = prefix, attempts = 0;
  while (attempts < 5) {
    const taken = await fbGet('usernames/' + candidate).catch(() => null);
    if (!taken) break;
    candidate = prefix + Math.floor(Math.random() * 9000 + 1000);
    attempts++;
  }
  return candidate;
}

/* ── @usuário: escolhido pelo usuário no cadastro (é como ele é buscado).
   Evita o "drift" de nomes: cada conta reserva seu @ de forma explícita. ── */
// Dois sublinhados consecutivos eram ambíguos com a chave histórica dos
// workspaces 1:1 (`usuarioA__usuarioB`). Novas contas nunca podem criá-los.
const USERNAME_RE = /^(?!.*__)[a-z0-9_]{3,20}$/;
function sanitizeUsername(v) {
  return (v || '').toLowerCase().replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_').slice(0, 20);
}
/* TRÊS respostas, não duas. "não consegui checar" não é "está em uso".

   Esta função tinha `catch { return false }`, e o campo do @ era ligado no
   carregamento da página — quando `_db` ainda é null, porque loadFirebase()
   só era chamado dentro de doRegister/doLogin. Toda tecla digitada batia em
   `null.ref(...)`, caía no catch e a tela dizia "já em uso" para QUALQUER @,
   inclusive os livres. O cadastro até funcionava (o submit recarrega a
   checagem depois do loadFirebase), mas ninguém insiste num @ que o site
   jura estar tomado.

   Falha de checagem agora tem nome próprio e não bloqueia o cadastro: quem
   decide de verdade é a transação em usernames/{@}, que é atômica. */
async function usernameState(name) {
  if (!USERNAME_RE.test(name)) return 'invalid';
  try {
    const pronto = await Promise.race([
      loadFirebase().then(() => true),
      /* loadFirebase() espera _fbInitDone para sempre; sem teto, o campo
         ficaria em "checando…" eterno quando o Firebase não sobe. */
      new Promise(r => setTimeout(() => r(false), 4000)),
    ]);
    if (!pronto) return 'unknown';
    const dono = await fbGet('usernames/' + name);
    return dono ? 'taken' : 'free';
  } catch (_) {
    return 'unknown';
  }
}
// Fábrica de checagem ao vivo reutilizável (campo do form e overlay do Google)
function wireUsernameField(inputEl, ctrlEl, statEl, onState) {
  if (!inputEl) return { get ok() { return ''; } };
  let okName = '', tmr = null;
  const setStat = (s, t) => {
    if (statEl) { statEl.textContent = t || ''; s ? statEl.setAttribute('data-s', s) : statEl.removeAttribute('data-s'); }
  };
  const state = { get ok() { return okName; } };
  inputEl.addEventListener('input', () => {
    const clean = sanitizeUsername(inputEl.value);
    if (clean !== inputEl.value) inputEl.value = clean;
    okName = ''; ctrlEl && ctrlEl.classList.remove('ok', 'bad'); clearTimeout(tmr);
    onState && onState('');
    if (!clean) { setStat('', ''); return; }
    if (!USERNAME_RE.test(clean)) {
      setStat('bad', mdLoginT('auth.minUsername', 'mín. 3 caracteres'));
      return;
    }
    setStat('checking', mdLoginT('auth.checking', 'checando…'));
    tmr = setTimeout(async () => {
      const estado = await usernameState(clean);
      if (sanitizeUsername(inputEl.value) !== clean) return; // mudou no meio

      if (estado === 'taken') {
        ctrlEl && ctrlEl.classList.add('bad');
        ctrlEl && ctrlEl.classList.remove('ok');
        setStat('bad', mdLoginT('auth.taken', 'já em uso'));
        onState && onState('bad');
        return;
      }

      /* Livre, ou não deu para checar. Nos dois casos o @ segue utilizável:
         quem recusa de verdade é a transação, que é atômica. Marcar como
         impedido o que não foi possível verificar seria repetir o bug. */
      okName = clean;
      ctrlEl && ctrlEl.classList.remove('bad');

      if (estado === 'free') {
        ctrlEl && ctrlEl.classList.add('ok');
        setStat('ok', mdLoginT('auth.available', 'disponível'));
        onState && onState('ok');
      } else {
        ctrlEl && ctrlEl.classList.remove('ok');
        setStat('', mdLoginT('auth.checkFailed', 'não deu para checar agora'));
        onState && onState('');
      }
    }, 400);
  });
  return state;
}
const _formUser = wireUsernameField($('username'), $('userCtrl'), $('userStat'));

/* Overlay de escolha de @ — usado quando entra com Google pela 1ª vez.
   Já reserva o nome (transação) e resolve com o @ confirmado. */
function askUsernameOverlay(uid, prefill) {
  return new Promise(resolve => {
    const ov = $('unameOv'), inp = $('ovUsername'), ctrl = $('ovCtrl'), stat = $('ovStat'), btn = $('ovConfirm');
    ov.classList.add('on');
    wireUsernameField(inp, ctrl, stat);
    inp.value = sanitizeUsername(prefill || '');
    setTimeout(() => inp.focus(), 60);
    const confirm = async () => {
      const clean = sanitizeUsername(inp.value);
      if (!USERNAME_RE.test(clean)) {
        stat.textContent = mdLoginT('auth.minUsername', 'mín. 3 caracteres');
        stat.setAttribute('data-s', 'bad');
        ctrl.classList.add('bad');
        return;
      }
      btn.disabled = true;
      btn.textContent = mdLoginT('auth.confirming', 'Confirmando…');
      let claimed = false;
      try {
        const tx = await fbRetry(() => _db.ref('usernames/' + clean).transaction(v => (v === null || v === uid) ? uid : undefined));
        claimed = tx.committed;
      } catch (_) { claimed = false; }
      if (!claimed) {
        stat.textContent = mdLoginT('auth.taken', 'já em uso');
        stat.setAttribute('data-s', 'bad');
        ctrl.classList.add('bad');
        btn.disabled = false;
        btn.textContent = mdLoginT('common.confirm', 'Confirmar');
        return;
      }
      ov.classList.remove('on');
      resolve(clean);
    };
    btn.onclick = confirm;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); confirm(); } });
  });
}

/* ── Navegação com fade — some a página antes de trocar de URL ── */
function goTo(url) {
  document.body.classList.remove('page-ready');
  setTimeout(() => { window.location.href = url; }, 380);
}

/* Ver comentário igual em landing.js: sem isto, voltar pelo navegador traz a
   página de volta do bfcache com opacity:0 e a tela fica preta. */
window.addEventListener('pageshow', () => {
  document.body.classList.add('page-ready');
});

/* ── Indicação: registra que este cadastro veio pelo link de alguém ──
   O código é o @ do indicador (analytics.js guarda o ?ref= por 30 dias).
   As regras só deixam o próprio novo usuário criar a aresta, uma única vez. */
async function registrarIndicacao(uid, username) {
  const code = String((window.mdRef && mdRef()) || '').replace(/^@/, '').toLowerCase();
  if (!code || code === String(username).toLowerCase()) return;
  try {
    const dono = await fbGet('usernames/' + code).catch(() => null);
    if (!dono || dono === uid) return;               // @ inexistente ou o próprio usuário
    await fbSet('referrals/' + code + '/' + uid, { at: Date.now(), username });
    if (window.mdTrack) mdTrack('indicacao_registrada', { por: code });
    try { localStorage.removeItem('md_ref'); } catch (_) {}
  } catch (e) {
    console.warn('[indicação] não registrada:', e && e.message ? e.message : e);
  }
}

/* ── Redirecionar para o app após login ── */
function goToApp(userData) {
  if (userData && userData.uid && userData.uid.startsWith('demo_')) {
    localStorage.setItem('md_sess_demo', JSON.stringify(userData));
  }

  /* O @ viaja junto para o app.

     Sem isto, index.html redescobria a identidade do zero e, quando a
     leitura de uids/{uid} falhava ou ainda não tinha replicado, ele
     CHUTAVA: usava o displayName do Google ("Victor Azevedo", com espaço e
     maiúscula) ou o prefixo do e-mail sem normalizar. Nenhum dos dois passa
     na validate das regras (^[a-z0-9_]{3,20}$), então users/{@}/profile
     nunca era gravado sob a chave que a busca procura — a pessoa entrava
     com um @ que não existia no banco, invisível para todo mundo.

     Aqui não há o que adivinhar: este é o @ que ela acabou de escolher. */
  try {
    if (userData && userData.uid && userData.username) {
      sessionStorage.setItem('md_ident', JSON.stringify({
        uid:      userData.uid,
        username: userData.username,
      }));
    }
  } catch (_) { /* aba com storage bloqueado: o app cai no uids/ do banco */ }

  sessionStorage.setItem('_md_just_logged_in', '1');
  goTo('index.html');
}

/* ── Registro ── */
async function doRegister() {
  const first = $v('first').trim();
  const last  = $v('last').trim();
  const name  = (first + ' ' + last).trim();
  const email = $v('email').trim().toLowerCase();
  const pass  = $v('password');
  const chosen = sanitizeUsername($v('username'));

  if (!first) return fail(mdLoginT('auth.errName', 'Informe seu nome.'), $('first'));
  if (!emailOk(email)) return fail(mdLoginT('auth.errEmail', 'Informe um e-mail válido.'), $('email'));
  if (!USERNAME_RE.test(chosen)) {
    return fail(mdLoginT(
      'auth.errUsername',
      'Escolha um @ com 3–20 caracteres (letras, números e _).'
    ), $('username'));
  }
  if (pass.length < 8) {
    return fail(mdLoginT(
      'auth.errPasswordLength',
      'A senha precisa ter pelo menos 8 caracteres.'
    ), $('password'));
  }

  submit.disabled = true;
  submit.textContent = mdLoginT('auth.creating', 'Criando…');

  // Modo demo (Firebase indisponível)
  if (!window._fbInitDone) {
    const user = chosen;
    const accs = JSON.parse(localStorage.getItem('md_acc') || '{}');
    if (accs[user]) {
      fail(mdLoginT('auth.errAccountExists', 'Já existe uma conta com este e-mail.'), $('email'));
      submit.disabled = false;
      submit.textContent = mdLoginT('auth.create', 'Criar conta');
      return;
    }
    const salt     = _demoGenSalt();
    const passHash = await _demoHashPass(pass, salt);
    accs[user] = { username: user, name, role: '', email, passHash, salt };
    localStorage.setItem('md_acc', JSON.stringify(accs));
    goToApp({ uid: 'demo_' + user, username: user, name, role: '', email });
    return;
  }

  try {
    await loadFirebase();

    /* @ já em uso? (checa antes de criar a conta de auth). Só 'taken' barra:
       se a checagem falhou, seguir em frente é seguro — a transação abaixo
       é atômica e recusa o @ tomado de qualquer jeito. Barrar aqui por falha
       de leitura impediria cadastro por causa de uma piscada de rede. */
    if (await usernameState(chosen) === 'taken') {
      fail(mdLoginT('auth.errUsernameTaken', 'Esse @ já está em uso. Escolha outro.'), $('username'));
      submit.disabled = false;
      submit.textContent = mdLoginT('auth.create', 'Criar conta');
      return;
    }

    const auth = getAuth();

    let cred;
    try {
      cred = await auth.createUserWithEmailAndPassword(email, pass);
    } catch (e) {
      fail(authErrMsg(e.code), $('email'));
      submit.disabled = false;
      submit.textContent = mdLoginT('auth.create', 'Criar conta');
      return;
    }

    const uid = cred.user.uid;
    await cred.user.updateProfile({ displayName: chosen }).catch(() => {});

    // Reserva definitiva do @ (transação — guarda contra corrida)
    let claimed = false;
    try {
      const tx = await fbRetry(() => _db.ref('usernames/' + chosen).transaction(val => {
        if (val === null) return uid;
        if (val === uid)  return uid;
        return undefined;
      }));
      claimed = tx.committed;
    } catch (_) { claimed = false; }

    if (!claimed) {
      // Alguém tomou o @ nesse meio-tempo — desfaz a conta pra o e-mail poder
      // ser reutilizado com outro @, e pede pra escolher de novo.
      try { await cred.user.delete(); } catch (_) {}
      fail(mdLoginT(
        'auth.errUsernameRace',
        'Esse @ acabou de ser tomado. Escolha outro e tente de novo.'
      ), $('username'));
      submit.disabled = false;
      submit.textContent = mdLoginT('auth.create', 'Criar conta');
      return;
    }

    const username = chosen;
    // Sem e-mail no perfil: ele é legível por qualquer usuário logado. Vai para
    // users/{uid}/private, que só o dono e o admin leem.
    const profile  = { name, role: '', uid, username };

    // Ordem importa: uids/{uid} PRIMEIRO — as regras de chat, inbox,
    // chamadas e do perfil por username dependem desse mapeamento.
    // Escritas sequenciais (o update multi-path atômico era negado:
    // a regra de users/{username} exige o uids que ele mesmo criava).
    try {
      await fbRetry(() => fbSet('uids/' + uid, username));
    } catch (e) {
      console.error('Registro: falha ao gravar uids/', e);
    }
    await fbRetry(() => fbSet('users/' + uid + '/profile', profile)).catch(e => console.error('Registro: perfil(uid)', e));
    await fbRetry(() => fbSet('users/' + username + '/profile', profile)).catch(e => console.error('Registro: perfil(username)', e));
    await fbRetry(() => fbSet('users/' + uid + '/private/email', email)).catch(e => console.error('Registro: e-mail privado', e));

    // Link de confirmação do e-mail. Não bloqueia a entrada — o app mostra um
    // aviso com opção de reenviar para quem ainda não confirmou.
    cred.user.sendEmailVerification().catch(e => console.warn('[email] verificação:', e && e.code));

    await registrarIndicacao(uid, username);
    if (window.mdTrack) mdTrack('signup_done', { metodo: 'email', origem: mdSource() });
    goToApp({ uid, username, name, role: '', email });

  } catch (e) {
    console.error('Register error:', e);
    fail(authErrMsg(e.code));
    submit.disabled = false;
    submit.textContent = mdLoginT('auth.create', 'Criar conta');
  }
}

/* ── Login ── */
async function doLogin() {
  const email = $v('email').trim().toLowerCase();
  const pass  = $v('password');

  if (!emailOk(email)) return fail(mdLoginT('auth.errEmail', 'Informe um e-mail válido.'), $('email'));
  if (!pass) return fail(mdLoginT('auth.errPassword', 'Informe sua senha.'), $('password'));

  submit.disabled = true;
  submit.textContent = mdLoginT('auth.signingIn', 'Entrando…');

  // Modo demo
  if (!window._fbInitDone) {
    const accs = JSON.parse(localStorage.getItem('md_acc') || '{}');
    const acc = Object.values(accs).find(a => a.email === email);
    if (acc) {
      const match = acc.passHash === await _demoHashPass(pass, acc.salt);
      if (!match) {
        fail(mdLoginT('auth.errWrongPassword', 'Senha incorreta.'), $('password'));
        submit.disabled = false;
        submit.textContent = mdLoginT('auth.signIn', 'Entrar');
        return;
      }
      goToApp({ uid: 'demo_' + acc.username, username: acc.username, name: acc.name, role: acc.role || '', email });
    } else {
      const username = email.split('@')[0].replace(/[^a-z0-9_]/gi, '') || 'demo';
      const salt     = _demoGenSalt();
      const passHash = await _demoHashPass(pass, salt);
      accs[username] = { username, name: username, role: '', email, passHash, salt };
      localStorage.setItem('md_acc', JSON.stringify(accs));
      goToApp({ uid: 'demo_' + username, username, name: username, role: '', email });
    }
    return;
  }

  try {
    await loadFirebase();
    const auth = getAuth();
    const cred = await auth.signInWithEmailAndPassword(email, pass);
    if (window.mdTrack) mdTrack('login_done', { metodo: 'email' });
    goToApp({ uid: cred.user.uid, email });
  } catch (e) {
    console.error('Login error:', e.code, e.message);
    fail(authErrMsg(e.code));
    submit.disabled = false;
    submit.textContent = mdLoginT('auth.signIn', 'Entrar');
  }
}

/* ── Esqueci a senha ── */
async function doForgotPassword() {
  const email = $v('email').trim().toLowerCase();
  if (!emailOk(email)) {
    return fail(mdLoginT(
      'auth.errResetEmail',
      'Informe seu e-mail pra redefinir a senha.'
    ), $('email'));
  }

  if (!window._fbInitDone) {
    return fail(mdLoginT(
      'auth.demoReset',
      'Modo demo: não há e-mail real pra enviar a redefinição.'
    ));
  }

  try {
    await loadFirebase();
    await getAuth().sendPasswordResetEmail(email);
    okMsg(mdLoginT(
      'auth.resetSent',
      'E-mail de redefinição enviado! Verifique sua caixa de entrada.'
    ));
  } catch (e) {
    fail(authErrMsg(e.code));
  }
}

/* ── Login por provedor social (Google, Facebook) ──
   Depois do popup o caminho é o mesmo nos dois: descobrir se o uid já tem @,
   pedir um na primeira vez, gravar o perfil e registrar a indicação. Por isso
   um fluxo só — duplicar isso significaria corrigir cada bug duas vezes. */
async function entrarComProvedor(provider, metodo, rotulo, btnId) {
  const auth = getAuth();
  if (!auth) return fail(mdLoginT('auth.unavailable', 'Autenticação não disponível.'));

  const btn = $(btnId);
  if (btn) { btn.disabled = true; btn.style.opacity = '.6'; }

  try {
    const cred = await auth.signInWithPopup(provider);
    const user = cred.user;

    await loadFirebase();
    let username = await fbGet('uids/' + user.uid).catch(() => null);

    if (!username) {
      // O Facebook pode não devolver e-mail (conta feita com telefone, ou
      // permissão negada). O cadastro segue sem ele — só não grava o privado.
      const email       = user.email || '';
      const displayName = user.displayName || (email
        ? email.split('@')[0]
        : mdLoginT('auth.newUser', 'Novo usuário'));
      const base        = email ? email.split('@')[0] : (user.displayName || '');
      const suggestion  = base.toLowerCase().replace(/[^a-z0-9_]/g, '') || 'usuario';
      // Pergunta o @ (o overlay já reserva usernames/{@} via transação)
      username = await askUsernameOverlay(user.uid, suggestion);
      const profile = { name: displayName, role: '', uid: user.uid, username, photo: user.photoURL || null };
      await fbRetry(() => fbSet('uids/' + user.uid, username));
      await fbRetry(() => fbSet('users/' + user.uid + '/profile', profile));
      if (email) await fbRetry(() => fbSet('users/' + user.uid + '/private/email', email)).catch(() => {});
      await fbRetry(() => fbSet('users/' + username + '/profile', profile));
      await registrarIndicacao(user.uid, username);
      if (window.mdTrack) mdTrack('signup_done', { metodo, origem: mdSource() });
      goToApp({ uid: user.uid, username, name: displayName, role: '', email });
    } else {
      let profile = await fbGet('users/' + user.uid + '/profile').catch(() => null)
               || await fbGet('users/' + username + '/profile').catch(() => null)
               || {};
      if (window.mdTrack) mdTrack('login_done', { metodo });
      goToApp({ uid: user.uid, username, name: profile.name || username, role: profile.role || '', email: user.email || '' });
    }
  } catch (e) {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return;
    // Mesmo e-mail já cadastrado por outro caminho: o Firebase recusa por
    // padrão, e "erro ao entrar" não diria à pessoa o que fazer a respeito.
    if (e.code === 'auth/account-exists-with-different-credential') {
      return fail(mdLoginT(
        'auth.providerExisting',
        'Esse e-mail já tem conta no MyDesk, criada por outro método. Entre da mesma forma que da primeira vez.'
      ));
    }
    console.error(rotulo + ' login error:', e);
    fail(mdLoginT(
      'auth.providerError',
      'Não foi possível entrar com {provider}. Tente novamente.',
      { provider: rotulo }
    ));
  }
}

async function doGoogleLogin() {
  if (!window._fbInitDone) return fail(mdLoginT('auth.firebaseMissing', 'Firebase não carregado.'));
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return entrarComProvedor(provider, 'google', 'Google', 'btn-google');
}

async function doFacebookLogin() {
  if (!window._fbInitDone) return fail(mdLoginT('auth.firebaseMissing', 'Firebase não carregado.'));
  const provider = new firebase.auth.FacebookAuthProvider();
  provider.addScope('email');
  return entrarComProvedor(provider, 'facebook', 'Facebook', 'btn-facebook');
}

/* ── submit do formulário ── */
form.addEventListener('submit', e => {
  e.preventDefault();
  clearErrors();
  if (mode === 'signup') doRegister(); else doLogin();
});

$('btn-google').addEventListener('click', doGoogleLogin);
$('btn-facebook')?.addEventListener('click', doFacebookLogin);
$('forgot-pass').addEventListener('click', doForgotPassword);
$('close').addEventListener('click', () => goTo('landing.html'));
addEventListener('keydown', e => { if (e.key === 'Escape') $('close').click(); });

/* ── Guard: se já autenticado, ir direto para o app ── */
window.addEventListener('DOMContentLoaded', () => {
  requestAnimationFrame(() => document.body.classList.add('page-ready'));

  const sess = localStorage.getItem('md_sess_demo');
  if (sess) {
    try { const u = JSON.parse(sess); if (u?.username) { window.location.href = 'index.html'; return; } }
    catch (_) {}
  }
  if (window._fbInitDone && window._fbAuth) {
    window._fbAuth.onAuthStateChanged(user => { if (user) window.location.href = 'index.html'; });
  }

  if (new URLSearchParams(location.search).get('mode') === 'signin') setMode('signin');
});
