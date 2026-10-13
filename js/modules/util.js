// Utilitários partilhados: API, barramento de dados, formatação e códigos meteorológicos.
export const LOCALE = 'pt-PT';

// ------------------------------------------------------------------ API
let apiBase = null;

// Funciona servido pelo backend (porta 3000) ou pelo Apache (/raspimirror/ → :3000).
export async function resolveApiBase() {
    if (apiBase !== null) return apiBase;
    const candidates = [];
    if (location.protocol.startsWith('http')) candidates.push(new URL('.', location.href).href.replace(/\/$/, ''));
    candidates.push(`${location.protocol.startsWith('http') ? location.protocol : 'http:'}//${location.hostname || 'localhost'}:3000`);
    for (const base of candidates) {
        try {
            const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(3000) });
            if (response.ok && (response.headers.get('content-type') || '').includes('json')) {
                apiBase = base;
                return base;
            }
        } catch {
            // tenta o próximo
        }
    }
    apiBase = candidates[candidates.length - 1];
    return apiBase;
}

export async function api(path, options = {}) {
    const base = await resolveApiBase();
    const response = await fetch(`${base}/api/${path}`, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
    return data;
}

// ------------------------------------------------------- Barramento de dados
const data = {};
const listeners = {};
export const bus = {
    get: (key) => data[key],
    set(key, value) {
        data[key] = value;
        (listeners[key] || []).forEach((fn) => fn(value));
        (listeners['*'] || []).forEach((fn) => fn(key, value));
    },
    on(key, fn) {
        (listeners[key] ||= []).push(fn);
        if (key !== '*' && data[key] !== undefined) fn(data[key]);
    }
};

// Carrega um endpoint periodicamente e publica no barramento.
export function poll(key, path, everyMs, { onError } = {}) {
    let timer;
    let failures = 0;
    const run = async () => {
        clearTimeout(timer);
        let next = everyMs;
        try {
            bus.set(key, await api(path));
            bus.set('lastUpdate', new Date());
            bus.set('online', true);
            failures = 0;
        } catch (error) {
            failures++;
            next = Math.min(everyMs, 15000 * 2 ** Math.min(failures - 1, 4)); // 15 s, 30 s, 1 min… até ao normal
            console.warn(`[${key}]`, error.message);
            onError?.(error);
            if (error instanceof TypeError) bus.set('online', false);
        }
        timer = setTimeout(run, next);
    };
    run();
    return { refresh: run };
}

// ---------------------------------------------------------------- DOM
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function setHTML(el, html) {
    if (typeof el === 'string') el = $(el);
    if (el && el.innerHTML !== html) el.innerHTML = html;
}

// Troca de texto com transição suave.
export function swap(el, html, ms = 600) {
    if (typeof el === 'string') el = $(el);
    if (!el) return;
    if (el.dataset.html === html) return;
    el.dataset.html = html;
    el.classList.add('fading');
    setTimeout(() => {
        el.innerHTML = html;
        el.classList.remove('fading');
    }, ms);
}

export function show(el, visible) {
    if (typeof el === 'string') el = $(el);
    if (el) el.hidden = !visible;
}

// ------------------------------------------------------------- Formatação
export const pad = (n) => String(n).padStart(2, '0');
export const round = (n) => (n == null || Number.isNaN(n) ? '–' : Math.round(n));
export const fmtTime = (d) => new Date(d).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });
export const hourLabel = (iso) => `${iso.slice(11, 13)}h`;
export const localTime = (iso) => iso.slice(11, 16); // horas locais devolvidas pelo Open-Meteo
export const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function startOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

export function dayDiff(a, b = new Date()) {
    return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
}

export function relativeDay(date) {
    const diff = dayDiff(date);
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Amanhã';
    if (diff === -1) return 'Ontem';
    const d = new Date(date);
    if (diff > 1 && diff < 7) return capitalize(d.toLocaleDateString(LOCALE, { weekday: 'long' }));
    return capitalize(d.toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', ''));
}

export function timeAgo(date) {
    const mins = Math.round((Date.now() - new Date(date)) / 60000);
    if (mins < 1) return 'agora';
    if (mins < 60) return `há ${mins} min`;
    const h = Math.round(mins / 60);
    if (h < 24) return `há ${h} h`;
    return `há ${Math.round(h / 24)} d`;
}

export function duration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return h ? `${h}h${pad(m)}` : `${m} min`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
export const compass = (deg) => (deg == null ? '' : COMPASS[Math.round(deg / 22.5) % 16]);

// Escala de Beaufort simplificada (km/h)
export function windLabel(kmh) {
    if (kmh < 2) return 'calmo';
    if (kmh < 12) return 'fraco';
    if (kmh < 29) return 'moderado';
    if (kmh < 50) return 'forte';
    if (kmh < 75) return 'muito forte';
    return 'tempestuoso';
}

// ------------------------------------------------------ Códigos WMO → texto/ícone
const W = {
    0: ['Céu limpo', 'clear'],
    1: ['Pouco nublado', 'partly'],
    2: ['Parcialmente nublado', 'partly'],
    3: ['Encoberto', 'cloudy'],
    45: ['Nevoeiro', 'fog'],
    48: ['Nevoeiro com geada', 'fog'],
    51: ['Chuvisco fraco', 'drizzle'],
    53: ['Chuvisco', 'drizzle'],
    55: ['Chuvisco intenso', 'drizzle'],
    56: ['Chuvisco gelado', 'sleet'],
    57: ['Chuvisco gelado intenso', 'sleet'],
    61: ['Chuva fraca', 'rain'],
    63: ['Chuva', 'rain'],
    65: ['Chuva forte', 'heavy-rain'],
    66: ['Chuva gelada', 'sleet'],
    67: ['Chuva gelada forte', 'sleet'],
    71: ['Neve fraca', 'snow'],
    73: ['Neve', 'snow'],
    75: ['Neve forte', 'snow'],
    77: ['Grãos de neve', 'snow'],
    80: ['Aguaceiros fracos', 'showers'],
    81: ['Aguaceiros', 'showers'],
    82: ['Aguaceiros fortes', 'heavy-rain'],
    85: ['Aguaceiros de neve', 'snow'],
    86: ['Aguaceiros de neve fortes', 'snow'],
    95: ['Trovoada', 'thunder'],
    96: ['Trovoada com granizo', 'thunder'],
    99: ['Trovoada forte com granizo', 'thunder']
};

export function weatherInfo(code, isDay = true) {
    const [label, kind] = W[code] || ['Tempo variável', 'partly'];
    let icon = kind;
    if (kind === 'clear' || kind === 'partly') icon = `${kind}-${isDay ? 'day' : 'night'}`;
    if (kind === 'showers' && !isDay) icon = 'rain';
    return { label, icon, rainy: code >= 51 && code <= 99 && kind !== 'snow' && kind !== 'fog' };
}

export function aqiInfo(aqi) {
    if (aqi == null) return { label: '—', level: 0 };
    if (aqi <= 20) return { label: 'Muito bom', level: 0 };
    if (aqi <= 40) return { label: 'Bom', level: 0 };
    if (aqi <= 60) return { label: 'Moderado', level: 1 };
    if (aqi <= 80) return { label: 'Fraco', level: 2 };
    if (aqi <= 100) return { label: 'Muito fraco', level: 3 };
    return { label: 'Péssimo', level: 3 };
}

export function uvInfo(uv) {
    if (uv == null) return { label: '—', level: 0 };
    if (uv < 3) return { label: 'Baixo', level: 0 };
    if (uv < 6) return { label: 'Moderado', level: 1 };
    if (uv < 8) return { label: 'Elevado', level: 2 };
    if (uv < 11) return { label: 'Muito elevado', level: 3 };
    return { label: 'Extremo', level: 3 };
}

// Limiares aproximados de pólen (grãos/m³)
export function pollenLevel(value) {
    if (!value || value < 10) return 0;
    if (value < 50) return 1;
    if (value < 200) return 2;
    return 3;
}
