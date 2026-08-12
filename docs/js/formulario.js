'use strict';
/* Página pública do formulário.
   Quem abre isto é o cliente do outro lado, sem conta no MyDesk. Este arquivo
   não conhece Firebase: pede a definição a /api/form?id=… e devolve a resposta
   pelo mesmo endpoint. Todo o conteúdo que vem da API entra por textContent —
   o título e os rótulos foram escritos por um usuário do MyDesk, e num
   formulário que circula por e-mail isso é conteúdo de terceiro. */

const API = window.MYDESK_API_BASE_URL || window.location.origin;
const MAX_ARQUIVO = 7_000_000;   // ~5 MB de arquivo em base64, o mesmo teto do servidor
/* A foto sai daqui já recortada em 128×128 e gravada como JPEG — os mesmos
   128 pixels que o app usa, porque o destino dela é um círculo de 34 px no
   cartão do funil. Mandar o arquivo do celular como veio seria vários MB para
   desenhar isso, e a imagem viaja DENTRO da resposta. */
const FOTO_LADO = 128;
const FOTO_QUALIDADE = 0.82;
const mdFormT = (key, fallback, vars) => (
  window.MyDeskI18n ? window.MyDeskI18n.t(key, vars, fallback) : fallback
);
const ESCOLARIDADES = [
  ['form.eduFundamentalIncomplete', 'Ensino fundamental incompleto'],
  ['form.eduFundamentalComplete', 'Ensino fundamental completo'],
  ['form.eduHighIncomplete', 'Ensino médio incompleto'],
  ['form.eduHighComplete', 'Ensino médio completo'],
  ['form.eduCollegeIncomplete', 'Ensino superior incompleto'],
  ['form.eduCollegeComplete', 'Ensino superior completo'],
  ['form.eduPostgraduate', 'Pós-graduação'],
  ['form.eduMasters', 'Mestrado'],
  ['form.eduDoctorate', 'Doutorado'],
  ['form.preferNotSay', 'Prefiro não informar'],
];
const ESTADOS_CIVIS = [
  ['form.single', 'Solteiro(a)'],
  ['form.married', 'Casado(a)'],
  ['form.domesticPartnership', 'União estável'],
  ['form.separated', 'Separado(a)'],
  ['form.divorced', 'Divorciado(a)'],
  ['form.widowed', 'Viúvo(a)'],
  ['form.preferNotSay', 'Prefiro não informar'],
];

const card = document.getElementById('pf-card');
let formularioAtual = null;
const cpfServicoIndisponivel = () => mdFormT(
  'form.cpfUnavailable',
  'A validação de CPF está indisponível. Recarregue a página antes de continuar.'
);

function hojeLocalIso() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 10);
}

function textoSobreCor(hex) {
  const rgb = String(hex).replace('#', '').match(/.{2}/g)
    .map(par => parseInt(par, 16) / 255)
    .map(canal => canal <= .04045 ? canal / 12.92 : ((canal + .055) / 1.055) ** 2.4);
  const luminancia = .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
  const contrasteBranco = 1.05 / (luminancia + .05);
  return contrasteBranco >= 4.5 ? '#fff' : '#020617';
}

function validadorCpfDisponivel() {
  return !!window.MyDeskBrasil
    && typeof window.MyDeskBrasil.formatarCpf === 'function'
    && typeof window.MyDeskBrasil.validarCpf === 'function';
}

function limpar() { card.innerHTML = ''; }

function aviso(titulo, texto, tom) {
  limpar();
  const box = document.createElement('div');
  box.className = 'pf-aviso' + (tom ? ' ' + tom : '');
  const h = document.createElement('div');
  h.className = 'pf-aviso-tit';
  h.textContent = titulo;
  const p = document.createElement('p');
  p.textContent = texto;
  box.appendChild(h); box.appendChild(p);
  card.appendChild(box);
}

function idDaUrl() {
  const p = new URLSearchParams(location.search);
  return (p.get('f') || p.get('id') || '').trim();
}

function rotuloCampo(c) {
  const rotulo = String(c.rotulo || '').trim();
  // Corrige a grafia vista em formulários já publicados como "Estadp",
  // sem impedir rótulos personalizados como "UF de nascimento".
  if (c.tipo === 'estado' && (!rotulo || /^estad.$/i.test(rotulo))) {
    return mdFormT('form.state', 'Estado');
  }
  const padroes = {
    cpf: ['CPF', 'CPF'],
    nascimento: ['form.birthDate', 'Data de nascimento'],
    escolaridade: ['form.education', 'Escolaridade'],
    estado_civil: ['form.maritalStatus', 'Estado civil'],
    foto: ['form.photo', 'Foto'],
  };
  if (!rotulo && padroes[c.tipo]) return mdFormT(padroes[c.tipo][0], padroes[c.tipo][1]);
  return rotulo;
}

function montarSelect(opcoes, placeholderKey, placeholder) {
  const select = document.createElement('select');
  const vazio = document.createElement('option');
  vazio.value = '';
  vazio.dataset.i18n = placeholderKey;
  vazio.textContent = mdFormT(placeholderKey, placeholder);
  select.appendChild(vazio);
  opcoes.forEach(item => {
    const opcao = document.createElement('option');
    if (Array.isArray(item)) {
      opcao.value = item[1];
      opcao.dataset.i18n = item[0];
      opcao.textContent = mdFormT(item[0], item[1]);
    } else {
      /* Opções livres foram escritas por quem criou o formulário. */
      opcao.value = item;
      opcao.textContent = item;
    }
    select.appendChild(opcao);
  });
  return select;
}

function definirOpcaoInicial(select, key, fallback) {
  const opcao = document.createElement('option');
  opcao.value = '';
  opcao.dataset.i18n = key;
  opcao.textContent = mdFormT(key, fallback);
  select.replaceChildren(opcao);
}

function chaveRotuloCampo(c) {
  const rotulo = String(c.rotulo || '').trim();
  if (c.tipo === 'estado' && (!rotulo || /^estad.$/i.test(rotulo))) return 'form.state';
  if (rotulo) return '';
  return {
    nascimento: 'form.birthDate',
    escolaridade: 'form.education',
    estado_civil: 'form.maritalStatus',
    foto: 'form.photo',
  }[c.tipo] || '';
}

/* ── A foto ───────────────────────────────────────────────────────────────
   Recorte quadrado a partir do centro e redução para 128 px, aqui no celular
   de quem responde. Esticar um retrato para caber deformaria o rosto, e o
   destino é um círculo.

   Falhar aqui NUNCA impede o envio: quem não conseguiu mandar a foto ainda
   tem uma candidatura inteira para entregar. */
function reduzirFoto(arquivo) {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(arquivo.type || '')) {
      reject(new Error(mdFormT('form.photoNeedsImage', 'Escolha um arquivo de imagem.')));
      return;
    }
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error(
      mdFormT('form.photoUnreadable', 'Não consegui ler essa imagem.')));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(
        mdFormT('form.photoUnreadable', 'Não consegui ler essa imagem.')));
      img.onload = () => {
        try {
          const lado = Math.min(img.width, img.height);
          const cv = document.createElement('canvas');
          cv.width = cv.height = FOTO_LADO;
          const ctx = cv.getContext('2d');
          ctx.drawImage(img, (img.width - lado) / 2, (img.height - lado) / 2,
                        lado, lado, 0, 0, FOTO_LADO, FOTO_LADO);
          resolve(cv.toDataURL('image/jpeg', FOTO_QUALIDADE));
        } catch (e) {
          reject(new Error(mdFormT('form.photoUnreadable', 'Não consegui ler essa imagem.')));
        }
      };
      img.src = String(leitor.result || '');
    };
    leitor.readAsDataURL(arquivo);
  });
}

/* O bloco visual da foto: o círculo com a prévia, a explicação e o "remover".
   O dataURL fica no PRÓPRIO input (`_foto`), e não numa variável de módulo:
   assim dois campos de foto no mesmo formulário não se pisariam. */
function montarFoto(campo) {
  const linha = document.createElement('div');
  linha.className = 'pf-foto-linha';

  const alvo = document.createElement('button');
  alvo.type = 'button';
  alvo.className = 'pf-foto-alvo';
  alvo.title = mdFormT('form.photoPick', 'Escolher uma foto');

  const texto = document.createElement('div');
  texto.className = 'pf-foto-txt';
  const dica = document.createElement('span');
  dica.dataset.i18n = 'form.photoHint';
  dica.textContent = mdFormT('form.photoHint', 'Opcional. Ajuda quem vai avaliar a reconhecer você.');
  const tirar = document.createElement('button');
  tirar.type = 'button';
  tirar.className = 'pf-foto-tirar';
  tirar.hidden = true;
  tirar.dataset.i18n = 'form.photoRemove';
  tirar.textContent = mdFormT('form.photoRemove', 'Remover');
  texto.append(dica, tirar);

  const erro = document.createElement('span');
  erro.className = 'pf-smart-feedback';
  erro.setAttribute('aria-live', 'polite');

  const pintar = () => {
    alvo.textContent = '';
    if (campo._foto) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = campo._foto;    // propriedade, e não atributo: nada a escapar
      alvo.appendChild(img);
    } else {
      const vazio = document.createElement('span');
      vazio.className = 'pf-foto-vazia';
      vazio.dataset.i18n = 'form.photo';
      vazio.textContent = mdFormT('form.photo', 'Foto');
      alvo.appendChild(vazio);
    }
    tirar.hidden = !campo._foto;
  };
  pintar();

  alvo.addEventListener('click', () => campo.click());
  tirar.addEventListener('click', () => {
    campo._foto = '';
    campo.value = '';
    erro.textContent = '';
    erro.className = 'pf-smart-feedback';
    pintar();
  });
  campo.addEventListener('change', async () => {
    const arq = campo.files && campo.files[0];
    if (!arq) return;
    erro.textContent = '';
    erro.className = 'pf-smart-feedback';
    try {
      campo._foto = await reduzirFoto(arq);
    } catch (e) {
      campo._foto = '';
      campo.value = '';
      erro.textContent = e.message;
      erro.className = 'pf-smart-feedback error';
    }
    pintar();
  });

  linha.append(alvo, texto);
  const bloco = document.createElement('div');
  bloco.append(linha, erro);
  return bloco;
}

function ligarCamposLocalidade(corpo) {
  const estados = Array.from(corpo.querySelectorAll('[data-localidade-estado]'));
  const municipios = Array.from(corpo.querySelectorAll('[data-localidade-municipio]'));

  municipios.forEach(municipio => {
    const linhaMunicipio = municipio.closest('.pf-campo');
    const indiceMunicipio = Array.from(corpo.children).indexOf(linhaMunicipio);
    let estado = [...estados].reverse().find(select => (
      Array.from(corpo.children).indexOf(select.closest('.pf-campo')) < indiceMunicipio
    )) || estados[0];

    // Município também funciona sozinho. Nesse caso o seletor auxiliar deixa
    // claro por que existe; quando há um campo Estado, nenhum duplicado aparece.
    if (!estado) {
      const ajuda = document.createElement('span');
      ajuda.className = 'pf-smart-hint';
      ajuda.dataset.i18n = 'form.stateFilter';
      ajuda.textContent = mdFormT('form.stateFilter', 'Estado para filtrar os municípios');
      estado = document.createElement('select');
      estado.className = 'pf-inp pf-inp-aux';
      definirOpcaoInicial(estado, 'form.loadingStates', 'Carregando estados…');
      estado.disabled = true;
      linhaMunicipio.insertBefore(ajuda, municipio);
      linhaMunicipio.insertBefore(estado, municipio);
      if (window.MyDeskBrasil) {
        MyDeskBrasil.listarEstados().then(lista => {
          definirOpcaoInicial(estado, 'form.selectState', 'Selecione o estado');
          lista.forEach(item => {
            const op = document.createElement('option');
            op.value = item.sigla;
            op.textContent = item.sigla + ' — ' + item.nome;
            estado.appendChild(op);
          });
          estado.disabled = false;
        }).catch(() => {
          definirOpcaoInicial(estado, 'form.statesUnavailable', 'Estados indisponíveis');
        });
      }
    }

    let consulta = 0;
    const carregar = async () => {
      const atual = ++consulta;
      municipio.disabled = true;
      definirOpcaoInicial(
        municipio,
        estado.value ? 'form.loadingCities' : 'form.selectStateFirst',
        estado.value ? 'Carregando municípios…' : 'Selecione primeiro o estado'
      );
      if (!estado.value || !window.MyDeskBrasil) return;
      try {
        const lista = await MyDeskBrasil.listarMunicipios(estado.value);
        if (atual !== consulta) return;
        definirOpcaoInicial(municipio, 'form.selectCity', 'Selecione o município');
        lista.forEach(item => {
          const op = document.createElement('option');
          op.value = item.nome + '/' + estado.value;
          op.textContent = item.nome;
          municipio.appendChild(op);
        });
        municipio.disabled = false;
      } catch (_) {
        if (atual === consulta) {
          definirOpcaoInicial(municipio, 'form.citiesUnavailable', 'Municípios indisponíveis');
        }
      }
    };
    estado.addEventListener('change', carregar);
    if (estado.value) carregar();
  });
}

/* ── Monta um campo ─────────────────────────────────────────────────────── */
function montarCampo(c) {
  const linha = document.createElement('label');
  linha.className = 'pf-campo';

  const rot = document.createElement('span');
  rot.className = 'pf-rotulo';
  const textoRotulo = document.createElement('span');
  const chaveRotulo = chaveRotuloCampo(c);
  if (chaveRotulo) textoRotulo.dataset.i18n = chaveRotulo;
  textoRotulo.textContent = rotuloCampo(c);
  rot.appendChild(textoRotulo);
  if (c.obrigatorio) {
    const ast = document.createElement('i');
    ast.className = 'pf-req';
    ast.textContent = '*';
    rot.appendChild(ast);
  }
  linha.appendChild(rot);

  let campo;
  let auxiliar = null;
  let feedback = null;
  if (c.tipo === 'longo') {
    campo = document.createElement('textarea');
    campo.rows = 4;
    campo.maxLength = 4000;
    campo.dataset.i18nPlaceholder = 'form.writeHere';
    campo.placeholder = mdFormT('form.writeHere', 'Escreva aqui…');
  } else if (c.tipo === 'selecao') {
    campo = montarSelect(c.opcoes || [], 'form.selectOption', 'Selecione uma opção');
  } else if (c.tipo === 'escolaridade') {
    campo = montarSelect(ESCOLARIDADES, 'form.selectEducation', 'Selecione a escolaridade');
  } else if (c.tipo === 'estado_civil') {
    campo = montarSelect(ESTADOS_CIVIS, 'form.selectMarital', 'Selecione o estado civil');
  } else if (c.tipo === 'cpf') {
    campo = document.createElement('input');
    campo.type = 'text';
    campo.inputMode = 'numeric';
    campo.autocomplete = 'off';
    campo.maxLength = 14;
    campo.placeholder = '000.000.000-00';
    feedback = document.createElement('span');
    feedback.className = 'pf-smart-feedback';
    campo.addEventListener('input', () => {
      campo.value = validadorCpfDisponivel()
        ? window.MyDeskBrasil.formatarCpf(campo.value)
        : campo.value.replace(/\D/g, '').slice(0, 11);
      if (!validadorCpfDisponivel()) {
        campo.setCustomValidity(cpfServicoIndisponivel());
        feedback.textContent = cpfServicoIndisponivel();
        feedback.className = 'pf-smart-feedback error';
        return;
      }
      campo.setCustomValidity('');
      feedback.textContent = '';
      feedback.className = 'pf-smart-feedback';
    });
    campo.addEventListener('blur', () => {
      if (!campo.value) return;
      if (!validadorCpfDisponivel()) {
        campo.setCustomValidity(cpfServicoIndisponivel());
        feedback.textContent = cpfServicoIndisponivel();
        feedback.className = 'pf-smart-feedback error';
        return;
      }
      const valido = window.MyDeskBrasil.validarCpf(campo.value);
      campo.setCustomValidity(valido ? '' : mdFormT('form.invalidCpf', 'Informe um CPF válido.'));
      feedback.textContent = valido
        ? mdFormT('form.cpfValid', 'CPF conferido.')
        : mdFormT('form.cpfCheck', 'Confira os números do CPF.');
      feedback.className = 'pf-smart-feedback ' + (valido ? 'success' : 'error');
    });
    if (!validadorCpfDisponivel()) {
      campo.setCustomValidity(cpfServicoIndisponivel());
      feedback.textContent = cpfServicoIndisponivel();
      feedback.className = 'pf-smart-feedback error';
    }
  } else if (c.tipo === 'nascimento') {
    campo = document.createElement('input');
    campo.type = 'date';
    campo.min = '1900-01-01';
    campo.max = hojeLocalIso();
  } else if (c.tipo === 'estado') {
    campo = document.createElement('select');
    campo.dataset.localidadeEstado = '1';
    definirOpcaoInicial(campo, 'form.loadingStates', 'Carregando estados…');
    campo.disabled = true;
    if (window.MyDeskBrasil) {
      MyDeskBrasil.listarEstados().then(estados => {
        definirOpcaoInicial(campo, 'form.selectState', 'Selecione o estado');
        estados.forEach(estado => {
          const op = document.createElement('option');
          op.value = estado.sigla;
          op.textContent = estado.sigla + ' — ' + estado.nome;
          campo.appendChild(op);
        });
        campo.disabled = false;
      }).catch(() => {
        definirOpcaoInicial(campo, 'form.statesUnavailable', 'Estados indisponíveis');
      });
    }
  } else if (c.tipo === 'municipio') {
    campo = document.createElement('select');
    campo.dataset.localidadeMunicipio = '1';
    definirOpcaoInicial(campo, 'form.selectStateFirst', 'Selecione primeiro o estado');
    campo.disabled = true;
  } else if (c.tipo === 'cep') {
    campo = document.createElement('input');
    campo.type = 'text';
    campo.inputMode = 'numeric';
    campo.maxLength = 9;
    campo.placeholder = '00000-000';
    feedback = document.createElement('span');
    feedback.className = 'pf-smart-feedback';
    campo.addEventListener('input', () => {
      campo.value = window.MyDeskBrasil
        ? MyDeskBrasil.formatarCep(campo.value)
        : campo.value.replace(/\D/g, '').slice(0, 8);
      feedback.textContent = '';
      feedback.className = 'pf-smart-feedback';
    });
    campo.addEventListener('blur', async () => {
      if (campo.value.replace(/\D/g, '').length !== 8 || !window.MyDeskBrasil) return;
      feedback.textContent = mdFormT('form.searchAddress', 'Buscando endereço…');
      feedback.className = 'pf-smart-feedback loading';
      try {
        const endereco = await MyDeskBrasil.buscarCep(campo.value);
        feedback.textContent = [
          endereco.logradouro, endereco.bairro,
          [endereco.cidade, endereco.uf].filter(Boolean).join('/'),
        ].filter(Boolean).join(' · ');
        feedback.className = 'pf-smart-feedback success';
      } catch (error) {
        console.warn('[formulário] consulta de CEP falhou:', error);
        feedback.textContent = mdFormT('form.cepNotFound', 'CEP não encontrado.');
        feedback.className = 'pf-smart-feedback error';
      }
    });
  } else if (c.tipo === 'cnpj') {
    campo = document.createElement('input');
    campo.type = 'text';
    campo.maxLength = 18;
    campo.placeholder = '00.000.000/0000-00';
    feedback = document.createElement('span');
    feedback.className = 'pf-smart-feedback';
    campo.addEventListener('input', () => {
      if (window.MyDeskBrasil) campo.value = MyDeskBrasil.formatarCnpj(campo.value);
      feedback.textContent = '';
      feedback.className = 'pf-smart-feedback';
    });
    campo.addEventListener('blur', async () => {
      if (!campo.value || !window.MyDeskBrasil) return;
      if (!MyDeskBrasil.validarCnpj(campo.value)) {
        feedback.textContent = mdFormT('form.checkCnpj', 'Confira o CNPJ informado.');
        feedback.className = 'pf-smart-feedback error';
        return;
      }
      feedback.textContent = mdFormT('form.searchCompany', 'Consultando empresa…');
      feedback.className = 'pf-smart-feedback loading';
      try {
        const empresa = await MyDeskBrasil.buscarCnpj(campo.value);
        feedback.textContent = [empresa.nomeFantasia || empresa.razaoSocial, empresa.situacao]
          .filter(Boolean).join(' · ');
        feedback.className = 'pf-smart-feedback success';
      } catch (error) {
        console.warn('[formulário] consulta de CNPJ falhou:', error);
        feedback.textContent = mdFormT('form.cnpjNotFound', 'CNPJ não encontrado.');
        feedback.className = 'pf-smart-feedback error';
      }
    });
  } else if (c.tipo === 'arquivo') {
    campo = document.createElement('input');
    campo.type = 'file';
    campo.className = 'pf-arquivo';
  } else if (c.tipo === 'foto') {
    campo = document.createElement('input');
    campo.type = 'file';
    campo.accept = 'image/*';
    campo.className = 'pf-foto-inp';
    campo.hidden = true;
    campo._foto = '';
    auxiliar = montarFoto(campo);
  } else {
    campo = document.createElement('input');
    campo.maxLength = 300;
    campo.type = c.tipo === 'email' ? 'email'
               : c.tipo === 'telefone' ? 'tel'
               : c.tipo === 'data' ? 'date' : 'text';
    if (c.tipo === 'email')    campo.placeholder = mdFormT('form.emailPlaceholder', 'seu@email.com');
    if (c.tipo === 'telefone') campo.placeholder = '(11) 99999-9999';
  }

  campo.className = (campo.className ? campo.className + ' ' : '') + 'pf-inp';
  campo.dataset.campo = c.id;
  campo.dataset.tipo  = c.tipo;
  /* Foto nunca é obrigatória de verdade — como o anexo, ela não pode barrar
     uma candidatura inteira. O campo fica escondido atrás do círculo, e um
     `required` invisível travaria o envio sem nada na tela para consertar. */
  if (c.obrigatorio && c.tipo !== 'foto') campo.required = true;
  campo.addEventListener('blur', () => campo.classList.add('pf-touched'));
  if (feedback) {
    feedback.id = 'pf-feedback-' + String(c.id || 'campo').replace(/[^A-Za-z0-9_-]/g, '');
    feedback.setAttribute('aria-live', 'polite');
    campo.setAttribute('aria-describedby', feedback.id);
  }
  if (auxiliar) linha.appendChild(auxiliar);
  linha.appendChild(campo);
  if (feedback) linha.appendChild(feedback);
  return linha;
}

/* ── Desenha o formulário ───────────────────────────────────────────────── */
function desenhar(form) {
  formularioAtual = form;
  limpar();
  const tituloFallback = mdFormT('form.formFallback', 'Formulário');
  document.title = (form.titulo || tituloFallback) + ' · MyDesk';

  // Cor escolhida no passo Design do construtor. Só uma cor da lista fechada
  // entra — valor vindo da API não vira CSS sem passar por esta checagem.
  const CORES = {
    indigo: '#6366f1', violeta: '#8b5cf6', esmeralda: '#10b981',
    ambar: '#f59e0b', rosa: '#ec4899', azul: '#3b82f6',
    oceano: '#0ea5e9', ciano: '#06b6d4', lima: '#84cc16',
    laranja: '#f97316', rubi: '#ef4444', grafite: '#64748b',
  };
  const cor = CORES[(form.tema && form.tema.cor) || 'indigo'] || CORES.indigo;
  document.documentElement.style.setProperty('--pf-cor', cor);
  document.documentElement.style.setProperty('--pf-on-cor', textoSobreCor(cor));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', cor);

  const topo = document.createElement('div');
  topo.className = 'pf-card-topo';
  const eyebrow = document.createElement('span');
  eyebrow.className = 'pf-eyebrow';
  eyebrow.dataset.i18n = 'form.collection';
  eyebrow.textContent = mdFormT('form.collection', 'COLETA DE INFORMAÇÕES');
  const etapas = document.createElement('span');
  etapas.className = 'pf-etapas';
  const totalCampos = (form.campos || []).length;
  const chaveCampos = totalCampos === 1 ? 'form.fieldOne' : 'form.fieldMany';
  etapas.dataset.i18n = chaveCampos;
  etapas.dataset.i18nCount = String(totalCampos);
  etapas.textContent = mdFormT(
    chaveCampos,
    totalCampos === 1 ? '{count} campo' : '{count} campos',
    { count: totalCampos }
  );
  topo.appendChild(eyebrow);
  topo.appendChild(etapas);
  card.appendChild(topo);

  const tit = document.createElement('h1');
  tit.className = 'pf-titulo';
  if (!form.titulo) tit.dataset.i18n = 'form.formFallback';
  tit.textContent = form.titulo || tituloFallback;
  card.appendChild(tit);

  if (form.descricao) {
    const d = document.createElement('p');
    d.className = 'pf-desc';
    d.textContent = form.descricao;
    card.appendChild(d);
  }

  const divisoria = document.createElement('div');
  divisoria.className = 'pf-divisoria';
  card.appendChild(divisoria);

  const corpo = document.createElement('div');
  corpo.className = 'pf-corpo';
  (form.campos || []).forEach(c => corpo.appendChild(montarCampo(c)));
  ligarCamposLocalidade(corpo);
  card.appendChild(corpo);

  const erro = document.createElement('div');
  erro.className = 'pf-erro';
  erro.setAttribute('role', 'alert');
  erro.setAttribute('aria-live', 'polite');
  erro.id = 'pf-erro';
  card.appendChild(erro);

  const enviar = document.createElement('button');
  enviar.className = 'pf-enviar';
  enviar.type = 'button';
  enviar.dataset.i18n = 'form.submit';
  enviar.textContent = mdFormT('form.submit', 'Enviar');
  enviar.addEventListener('click', () => submeter(form, enviar, erro));
  card.appendChild(enviar);

  const privacidade = document.createElement('div');
  privacidade.className = 'pf-privacidade';
  const cadeado = document.createElement('span');
  cadeado.setAttribute('aria-hidden', 'true');
  cadeado.textContent = '🔒';
  const textoPrivacidade = document.createElement('span');
  const leadPrivacidade = document.createElement('span');
  leadPrivacidade.dataset.i18n = 'form.privacyLead';
  leadPrivacidade.textContent = mdFormT(
    'form.privacyLead',
    'Seus dados são processados pelo MyDesk e armazenados para acesso do responsável por este formulário.'
  );
  textoPrivacidade.append(leadPrivacidade, ' ');
  const linkPrivacidade = document.createElement('a');
  linkPrivacidade.href = 'privacidade.html';
  linkPrivacidade.target = '_blank';
  linkPrivacidade.rel = 'noopener';
  linkPrivacidade.dataset.i18n = 'common.privacy';
  linkPrivacidade.textContent = mdFormT('common.privacy', 'Política de Privacidade');
  textoPrivacidade.appendChild(linkPrivacidade);
  privacidade.append(cadeado, textoPrivacidade);
  card.appendChild(privacidade);
}

window.addEventListener('mydesk:languagechange', () => {
  if (formularioAtual && !formularioAtual.titulo) {
    document.title = mdFormT('form.formFallback', 'Formulário') + ' · MyDesk';
  }
});

function lerArquivo(input) {
  return new Promise((resolve, reject) => {
    const f = input.files && input.files[0];
    if (!f) { resolve(null); return; }
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, type: f.type, dataUrl: String(r.result || '') });
    r.onerror = () => reject(new Error(mdFormT('form.readFileError', 'Não foi possível ler o arquivo.')));
    r.readAsDataURL(f);
  });
}

async function submeter(form, botao, erro) {
  erro.textContent = '';
  const valores = {};
  let arquivo = null;
  let foto = '';

  for (const el of card.querySelectorAll('[data-campo]')) {
    const def = (form.campos || []).find(c => c.id === el.dataset.campo);
    if (!def) continue;

    if (el.dataset.tipo === 'foto') {
      // Já veio reduzida do canvas, no momento em que foi escolhida.
      if (el._foto) foto = el._foto;
      continue;
    }

    if (el.dataset.tipo === 'arquivo') {
      try { arquivo = await lerArquivo(el); }
      catch (e) { erro.textContent = e.message; return; }
      if (arquivo && arquivo.dataUrl.length > MAX_ARQUIVO) {
        erro.textContent = mdFormT('form.fileTooBig', 'O arquivo passa de 5 MB. Envie um menor.');
        el.focus();
        return;
      }
      if (!arquivo && def.obrigatorio) {
        erro.textContent = mdFormT(
          'form.requiredFile',
          'Anexe o arquivo pedido em "{field}".',
          { field: def.rotulo }
        );
        el.focus();
        return;
      }
      /* Anexo nunca barra o envio, mesmo marcado como obrigatório na
         definição. Quem responde pode não ter o documento à mão, e recusar a
         resposta inteira por causa disso perde também tudo o que já foi
         escrito — o pior desfecho possível para quem está do outro lado. O
         responsável vê o que chegou e pede o arquivo depois, se precisar. */
      continue;
    }

    const v = String(el.value || '').trim();
    // A checagem de obrigatório é repetida no servidor; aqui ela existe para a
    // pessoa não perder o que digitou numa ida e volta à rede.
    if (el.dataset.tipo === 'cpf' && (v || def.obrigatorio)
        && !validadorCpfDisponivel()) {
      el.classList.add('pf-touched');
      el.setCustomValidity(cpfServicoIndisponivel());
      erro.textContent = cpfServicoIndisponivel();
      el.focus();
      return;
    }
    if (!v && def.obrigatorio) {
      el.classList.add('pf-touched');
      erro.textContent = mdFormT('form.required', 'Preencha "{field}".', { field: def.rotulo });
      el.focus();
      return;
    }
    if (v && el.dataset.tipo === 'cpf' && !window.MyDeskBrasil.validarCpf(v)) {
      el.classList.add('pf-touched');
      erro.textContent = mdFormT(
        'form.invalidCpfField',
        'Informe um CPF válido em "{field}".',
        { field: def.rotulo }
      );
      el.focus();
      return;
    }
    if (v && !el.checkValidity()) {
      el.classList.add('pf-touched');
      erro.textContent = mdFormT('form.checkField', 'Confira "{field}".', { field: def.rotulo });
      el.focus();
      return;
    }
    if (v) valores[def.id] = v;
  }

  botao.disabled = true;
  const rotulo = botao.textContent;
  botao.textContent = mdFormT('common.sending', 'Enviando…');
  try {
    const r = await fetch(API + '/api/form', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: form.id, valores, arquivo, foto }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error('FORM_SUBMIT_FAILED');
      e.codigo = dados.codigo;
      e.motivo = dados.error;
      throw e;
    }
    aviso(
      mdFormT('form.sentTitle', 'Resposta enviada ✓'),
      mdFormT(
        'form.sentBody',
        'Obrigado! Suas informações chegaram a quem enviou este formulário.'
      ),
      'ok'
    );
  } catch (e) {
    console.error('[formulário] envio falhou:', e);
    erro.textContent = motivoDaFalha(e);
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

/* POR QUE ISTO EXISTE
   O servidor já dizia o motivo de cada recusa — "Preencha ao menos um campo",
   "O arquivo passa de 5 MB", "Este formulário atingiu o limite de respostas" —
   e esta página jogava tudo fora, trocando por "Não foi possível enviar." Quem
   respondia ficava diante de um botão que não funcionava e nenhuma pista do
   que fazer; e quem mantém o site também não via nada. Uma recusa por regra de
   negócio não é falha misteriosa: é instrução.

   Os motivos FIXOS viajam com um `codigo` e são traduzidos aqui, porque esta
   página é lida em três idiomas por gente que não tem conta. Os motivos que
   citam o campo da pessoa ("Confira o e-mail em Contato") são montados no
   servidor com o rótulo que o dono do formulário escreveu e não têm como ser
   traduzidos — esses passam adiante como vieram, que ainda assim é muito mais
   útil do que a frase genérica. */
function motivoDaFalha(e) {
  const fixos = {
    vazio: () => mdFormT('form.errEmpty',
      'Preencha ao menos um campo ou anexe o arquivo pedido.'),
    grande: () => mdFormT('form.fileTooBig', 'O arquivo passa de 5 MB. Envie um menor.'),
    arquivo: () => mdFormT('form.errFile',
      'O arquivo não pôde ser lido. Tente enviar em outro formato.'),
    fechado: () => mdFormT('form.errClosed',
      'Este formulário não está mais aberto para respostas.'),
    limite: () => mdFormT('form.errLimit',
      'Este formulário atingiu o limite de respostas.'),
    gravar: () => mdFormT('form.errSave',
      'Sua resposta não pôde ser registrada agora. Tente de novo em instantes.'),
    fotogrande: () => mdFormT('form.photoTooBig',
      'A foto ficou grande demais. Escolha outra imagem.'),
    foto: () => mdFormT('form.errPhoto',
      'A foto não pôde ser lida. Tente outra imagem.'),
  };
  if (e && e.codigo && fixos[e.codigo]) return fixos[e.codigo]();
  if (e && e.motivo) return String(e.motivo).slice(0, 300);
  return mdFormT('form.sendError', 'Não foi possível enviar.');
}

/* ── Início ─────────────────────────────────────────────────────────────── */
(async function () {
  const id = idDaUrl();
  if (!id) {
    aviso(
      mdFormT('form.incompleteLink', 'Link incompleto'),
      mdFormT(
        'form.incompleteLinkBody',
        'O endereço não traz o código do formulário. Peça o link de novo a quem o enviou.'
      )
    );
    return;
  }
  try {
    const r = await fetch(API + '/api/form?id=' + encodeURIComponent(id));
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('FORM_UNAVAILABLE');
    desenhar(dados.form);
  } catch (e) {
    console.error('[formulário] carregamento falhou:', e);
    aviso(
      mdFormT('form.unavailable', 'Formulário indisponível'),
      mdFormT('form.unavailableBody', 'Não foi possível carregar este formulário. Tente novamente.')
    );
  }
})();
