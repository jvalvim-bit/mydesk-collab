'use strict';

const VIACEP_BASE = 'https://viacep.com.br/ws';
const BRASIL_API_BASE = 'https://brasilapi.com.br/api';
const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v1/localidades';

class BrazilServiceError extends Error {
  constructor(message, status = 502, code = 'UPSTREAM_ERROR') {
    super(message);
    this.name = 'BrazilServiceError';
    this.status = status;
    this.code = code;
  }
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCep(value) {
  const cep = onlyDigits(value);
  if (!/^\d{8}$/.test(cep)) {
    throw new BrazilServiceError('Informe um CEP válido com 8 dígitos.', 400, 'INVALID_CEP');
  }
  return cep;
}

function normalizeCnpj(value) {
  const cnpj = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) {
    throw new BrazilServiceError('Informe um CNPJ válido com 14 caracteres.', 400, 'INVALID_CNPJ');
  }
  return cnpj;
}

function cnpjCharValue(char) {
  return char.charCodeAt(0) - 48;
}

function cnpjDigit(base, weights) {
  const sum = base.split('').reduce((total, char, index) => (
    total + cnpjCharValue(char) * weights[index]
  ), 0);
  const remainder = sum % 11;
  return remainder < 2 ? '0' : String(11 - remainder);
}

function isValidCnpj(value) {
  let cnpj;
  try { cnpj = normalizeCnpj(value); } catch (_) { return false; }
  if (/^(\w)\1{11}\d{2}$/i.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const first = cnpjDigit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjDigit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return cnpj.slice(-2) === first + second;
}

function isValidCpf(value) {
  const cpf = String(value || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digit = length => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10]);
}

function normalizeUf(value) {
  const uf = String(value || '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(uf)) {
    throw new BrazilServiceError('Informe uma UF válida.', 400, 'INVALID_UF');
  }
  return uf;
}

function normalizeCepResult(data, provider) {
  if (!data || data.erro) return null;
  const cep = onlyDigits(data.cep);
  if (!/^\d{8}$/.test(cep)) return null;
  return {
    cep,
    logradouro: String(data.logradouro || data.street || '').trim(),
    complemento: String(data.complemento || '').trim(),
    bairro: String(data.bairro || data.neighborhood || '').trim(),
    cidade: String(data.localidade || data.city || '').trim(),
    uf: String(data.uf || data.state || '').trim().toUpperCase(),
    ibge: String(data.ibge || '').trim(),
    ddd: String(data.ddd || '').trim(),
    provider,
  };
}

function normalizeCnpjResult(data, cnpj) {
  if (!data || typeof data !== 'object') return null;
  const endereco = [
    data.descricao_tipo_de_logradouro,
    data.logradouro,
    data.numero,
    data.complemento,
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return {
    cnpj,
    razaoSocial: String(data.razao_social || '').trim(),
    nomeFantasia: String(data.nome_fantasia || '').trim(),
    situacao: String(data.descricao_situacao_cadastral || '').trim(),
    atividadePrincipal: String(data.cnae_fiscal_descricao || '').trim(),
    cep: onlyDigits(data.cep),
    endereco,
    bairro: String(data.bairro || '').trim(),
    cidade: String(data.municipio || '').trim(),
    uf: String(data.uf || '').trim().toUpperCase(),
    telefone: [data.ddd_telefone_1, data.ddd_telefone_2].filter(Boolean).join(' / '),
    email: String(data.email || '').trim().toLowerCase(),
    provider: 'brasilapi',
  };
}

async function fetchJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new BrazilServiceError('Serviço de consulta indisponível.', 503, 'FETCH_UNAVAILABLE');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 6500);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'MyDesk/1.0' },
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new BrazilServiceError('O provedor de consulta está temporariamente indisponível.');
    }
    return await response.json();
  } catch (error) {
    if (error instanceof BrazilServiceError) throw error;
    if (error && error.name === 'AbortError') {
      throw new BrazilServiceError('A consulta demorou demais. Tente novamente.', 504, 'TIMEOUT');
    }
    throw new BrazilServiceError('Não foi possível consultar o serviço agora.');
  } finally {
    clearTimeout(timer);
  }
}

async function lookupCep(value, options = {}) {
  const cep = normalizeCep(value);
  let viaCepError = null;
  try {
    const data = await fetchJson(`${VIACEP_BASE}/${cep}/json/`, options);
    const normalized = normalizeCepResult(data, 'viacep');
    if (normalized) return normalized;
  } catch (error) {
    viaCepError = error;
  }

  try {
    const data = await fetchJson(`${BRASIL_API_BASE}/cep/v2/${cep}`, options);
    const normalized = normalizeCepResult(data, 'brasilapi');
    if (normalized) return normalized;
  } catch (error) {
    if (viaCepError) throw error;
  }
  throw new BrazilServiceError('CEP não encontrado.', 404, 'CEP_NOT_FOUND');
}

async function lookupCnpj(value, options = {}) {
  const cnpj = normalizeCnpj(value);
  if (!isValidCnpj(cnpj)) {
    throw new BrazilServiceError('O CNPJ informado não é válido.', 400, 'INVALID_CNPJ');
  }
  const data = await fetchJson(`${BRASIL_API_BASE}/cnpj/v1/${encodeURIComponent(cnpj)}`, options);
  if (!data) throw new BrazilServiceError('CNPJ não encontrado.', 404, 'CNPJ_NOT_FOUND');
  return normalizeCnpjResult(data, cnpj);
}

async function listStates(options = {}) {
  const data = await fetchJson(`${IBGE_BASE}/estados?orderBy=nome`, options);
  return (Array.isArray(data) ? data : []).map(state => ({
    id: Number(state.id),
    sigla: String(state.sigla || '').toUpperCase(),
    nome: String(state.nome || ''),
    regiao: String(state.regiao?.nome || ''),
  })).filter(state => state.id && state.sigla && state.nome);
}

async function listCities(value, options = {}) {
  const uf = normalizeUf(value);
  const data = await fetchJson(`${IBGE_BASE}/estados/${uf}/municipios?orderBy=nome`, options);
  return (Array.isArray(data) ? data : []).map(city => ({
    id: Number(city.id),
    nome: String(city.nome || ''),
    uf,
  })).filter(city => city.id && city.nome);
}

async function listBanks(options = {}) {
  const data = await fetchJson(`${BRASIL_API_BASE}/banks/v1`, options);
  return (Array.isArray(data) ? data : []).map(bank => ({
    codigo: bank.code == null ? '' : String(bank.code),
    ispb: String(bank.ispb || ''),
    nome: String(bank.fullName || bank.name || ''),
  })).filter(bank => bank.nome);
}

async function lookupDdd(value, options = {}) {
  const ddd = onlyDigits(value);
  if (!/^\d{2}$/.test(ddd)) {
    throw new BrazilServiceError('Informe um DDD válido com 2 dígitos.', 400, 'INVALID_DDD');
  }
  const data = await fetchJson(`${BRASIL_API_BASE}/ddd/v1/${ddd}`, options);
  if (!data) throw new BrazilServiceError('DDD não encontrado.', 404, 'DDD_NOT_FOUND');
  return {
    ddd,
    uf: String(data.state || '').toUpperCase(),
    cidades: Array.isArray(data.cities) ? data.cities.map(String) : [],
  };
}

async function listHolidays(value, options = {}) {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 2199) {
    throw new BrazilServiceError('Informe um ano válido.', 400, 'INVALID_YEAR');
  }
  const data = await fetchJson(`${BRASIL_API_BASE}/feriados/v1/${year}`, options);
  return (Array.isArray(data) ? data : []).map(item => ({
    data: String(item.date || ''),
    nome: String(item.name || ''),
    tipo: String(item.type || ''),
  })).filter(item => item.data && item.nome);
}

module.exports = {
  BrazilServiceError,
  normalizeCep,
  normalizeCnpj,
  normalizeUf,
  isValidCpf,
  isValidCnpj,
  normalizeCepResult,
  lookupCep,
  lookupCnpj,
  listStates,
  listCities,
  listBanks,
  lookupDdd,
  listHolidays,
};
