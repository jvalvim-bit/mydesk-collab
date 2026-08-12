(function (global) {
  'use strict';

  const API = (global.MYDESK_API_BASE_URL || global.location.origin) + '/api/form';
  const CACHE_KEY = 'mydesk:brasil:v1:';
  const inflight = new Map();
  const TTL = {
    cep: 30 * 864e5,
    cnpj: 864e5,
    estados: 30 * 864e5,
    municipios: 30 * 864e5,
    bancos: 7 * 864e5,
    ddd: 30 * 864e5,
    feriados: 365 * 864e5,
  };

  function digits(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function cleanCnpj(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
  }

  function cnpjDigit(base, weights) {
    const sum = base.split('').reduce((total, char, index) => (
      total + (char.charCodeAt(0) - 48) * weights[index]
    ), 0);
    const remainder = sum % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  }

  function validarCnpj(value) {
    const cnpj = cleanCnpj(value);
    if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
    if (/^(\w)\1{11}\d{2}$/i.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
    const first = cnpjDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const second = cnpjDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return cnpj.slice(-2) === first + second;
  }

  function validarCpf(value) {
    const cpf = digits(value).slice(0, 11);
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    const digit = length => {
      let sum = 0;
      for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };
    return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
  }

  function formatarCep(value) {
    const cep = digits(value).slice(0, 8);
    return cep.replace(/^(\d{5})(\d)/, '$1-$2');
  }

  function formatarCnpj(value) {
    const raw = cleanCnpj(value);
    if (/^\d+$/.test(raw)) {
      return raw.replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
    }
    return raw.length > 12 ? raw.slice(0, 12) + '-' + raw.slice(12) : raw;
  }

  function formatarCpf(value) {
    return digits(value).slice(0, 11)
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1-$2');
  }

  function cacheGet(key) {
    try {
      const item = JSON.parse(localStorage.getItem(CACHE_KEY + key) || 'null');
      if (!item || item.expiresAt < Date.now()) {
        localStorage.removeItem(CACHE_KEY + key);
        return null;
      }
      return item.data;
    } catch (_) { return null; }
  }

  function cacheSet(key, data, ttl) {
    try {
      localStorage.setItem(CACHE_KEY + key, JSON.stringify({
        data,
        expiresAt: Date.now() + ttl,
      }));
    } catch (_) {}
  }

  async function request(resource, params) {
    const query = new URLSearchParams(Object.assign({
      acao: 'brasil',
      recurso: resource,
    }, params || {}));
    const key = resource + ':' + query.toString();
    const cached = cacheGet(key);
    if (cached !== null) return cached;
    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8500);
      try {
        const response = await fetch(API + '?' + query.toString(), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Consulta indisponível.');
        cacheSet(key, payload.data, TTL[resource] || 3600e3);
        return payload.data;
      } catch (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('A consulta demorou demais. Tente novamente.');
        }
        throw error;
      } finally {
        clearTimeout(timer);
        inflight.delete(key);
      }
    })();
    inflight.set(key, promise);
    return promise;
  }

  function buscarCep(value) {
    const cep = digits(value);
    if (!/^\d{8}$/.test(cep)) return Promise.reject(new Error('Informe um CEP válido.'));
    return request('cep', { cep });
  }

  function buscarCnpj(value) {
    const cnpj = cleanCnpj(value);
    if (!validarCnpj(cnpj)) return Promise.reject(new Error('Informe um CNPJ válido.'));
    return request('cnpj', { cnpj });
  }

  global.MyDeskBrasil = Object.freeze({
    buscarCep,
    buscarCnpj,
    listarEstados: () => request('estados'),
    listarMunicipios: uf => request('municipios', { uf: String(uf || '').toUpperCase() }),
    listarBancos: () => request('bancos'),
    buscarDdd: ddd => request('ddd', { ddd: digits(ddd) }),
    listarFeriados: ano => request('feriados', { ano: String(ano) }),
    formatarCep,
    formatarCpf,
    formatarCnpj,
    validarCpf,
    validarCnpj,
  });
})(window);
