// Comando remoto do espelho (abre no telemóvel na mesma rede).
import { resolveApiBase, esc, pad } from './modules/util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let state = null;
let config = null;
let pinRequired = false;

const MODULE_LABELS = {
    weather: 'Meteorologia atual', hourly: 'Próximas horas', forecast: 'Próximos dias', air: 'Qualidade do ar e pólen',
    marine: 'Mar e marés', insights: 'O teu dia (conselhos)', calendar: 'Agenda', monthGrid: 'Mini-calendário do mês',
    news: 'Notícias', onthisday: 'Neste dia (Wikipédia)', notes: 'Notas', compliments: 'Frases no centro', system: 'Barra de estado'
};

// ----------------------------------------------------------------- API
function getPin() {
    try { return localStorage.getItem('mirrorPin') || ''; } catch { return ''; }
}

async function askPin() {
    const dialog = $('#pin-dialog');
    $('#pin-input').value = '';
    dialog.showModal();
    await new Promise((resolve) => dialog.addEventListener('close', resolve, { once: true }));
    try { localStorage.setItem('mirrorPin', $('#pin-input').value); } catch { /* sem storage */ }
}

async function call(path, { method = 'GET', body } = {}, retry = true) {
    const base = await resolveApiBase();
    const response = await fetch(`${base}/api/${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', 'x-pin': getPin() },
        body: body ? JSON.stringify(body) : undefined
    });
    if (response.status === 401 && retry) {
        await askPin();
        return call(path, { method, body }, false);
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
    return data;
}

function toast(text, isError = false) {
    const el = $('#toast');
    el.textContent = text;
    el.classList.toggle('error', isError);
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}

async function action(fn, ok) {
    try {
        const result = await fn();
        if (result && result.notes) applyState(result);
        if (ok) toast(ok);
        navigator.vibrate?.(15);
        return result;
    } catch (error) {
        toast(error.message, true);
        return null;
    }
}

// ---------------------------------------------------------------- Separadores
function showTab(name) {
    $$('.tab').forEach((t) => { t.hidden = t.dataset.tab !== name; });
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    try { sessionStorage.setItem('tab', name); } catch { /* ignorar */ }
    window.scrollTo(0, 0);
}

// ------------------------------------------------------------------ Estado
function applyState(s) {
    state = s;
    $$('#screen-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === s.screen));

    const msg = s.message;
    $('#msg-current').textContent = msg ? `A mostrar: “${msg.text}” até às ${new Date(msg.until).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}` : '';

    $('#timer-cancel').hidden = !s.timer;
    renderTimer();
    renderNotes();
}

function renderTimer() {
    const el = $('#timer-live');
    const t = state?.timer;
    if (!t) { el.hidden = true; return; }
    const left = Math.max(0, Math.round((t.endsAt - Date.now()) / 1000));
    el.hidden = false;
    el.innerHTML = `<strong>${left ? `${pad(Math.floor(left / 60))}:${pad(left % 60)}` : 'Terminou!'}</strong><span>${esc(t.label)}</span>`;
}

function renderNotes() {
    const list = state?.notes || [];
    $('#note-list').innerHTML = list.length ? list.map((n) => `
        <li class="${n.done ? 'done' : ''}" data-id="${n.id}">
            ${n.kind === 'note' ? '<span class="bullet">•</span>' : `<input type="checkbox" ${n.done ? 'checked' : ''} aria-label="Concluída">`}
            <span class="txt">${esc(n.text)}</span>
            <button class="del" aria-label="Apagar">✕</button>
        </li>`).join('') : '<li class="empty">Sem notas. Adiciona a primeira acima.</li>';
}

// --------------------------------------------------------------- Definições
const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
function set(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach((k) => { o = o[k] ||= {}; });
    o[keys[keys.length - 1]] = value;
}

function listEditor(container, items, fields) {
    container.innerHTML = '';
    const add = (item = {}) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = fields.map((f) => {
            if (f.type === 'select') return `<select data-k="${f.key}">${f.options.map(([v, l]) => `<option value="${v}" ${item[f.key] === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
            return `<input data-k="${f.key}" type="${f.type || 'text'}" placeholder="${f.placeholder}" value="${esc(item[f.key] ?? (f.type === 'color' ? '#ffffff' : ''))}" class="${f.wide ? 'wide' : ''}">`;
        }).join('') + '<button type="button" class="del" aria-label="Remover">✕</button>';
        row.querySelector('.del').onclick = () => row.remove();
        container.appendChild(row);
    };
    items.forEach(add);
    return add;
}

const readList = (container) => $$('.list-row', container).map((row) => Object.fromEntries($$('[data-k]', row).map((i) => [i.dataset.k, i.value.trim()])));

const CAL_FIELDS = [{ key: 'name', placeholder: 'Nome' }, { key: 'color', type: 'color' }, { key: 'url', placeholder: 'https://…/basic.ics', wide: true }];
const DATE_FIELDS = [{ key: 'title', placeholder: 'Título' }, { key: 'date', placeholder: 'MM-DD' }, { key: 'kind', type: 'select', options: [['countdown', 'Contagem'], ['birthday', 'Aniversário']] }];
const FEED_FIELDS = [{ key: 'name', placeholder: 'Fonte' }, { key: 'url', placeholder: 'https://…/rss', wide: true }];
let addCalendar; let addDate; let addFeed;

function fillSettings(cfg) {
    const form = $('#settings');
    for (const input of $$('[name]', form)) {
        const name = input.name;
        if (name === 'night.auto') { input.checked = cfg.night?.mode !== 'off'; continue; }
        if (name === 'compliments') { input.value = (cfg.compliments || []).join('\n'); continue; }
        if (name === 'assistant.model') continue;
        const value = get(cfg, name);
        if (input.type === 'checkbox') input.checked = value !== false;
        else input.value = value ?? '';
    }
    $('#dim-out').textContent = `${Math.round((cfg.night?.dim ?? 0.35) * 100)}%`;

    $('#module-toggles').innerHTML = Object.entries(MODULE_LABELS).map(([k, label]) =>
        `<label class="check"><input type="checkbox" data-module="${k}" ${cfg.modules?.[k] !== false ? 'checked' : ''}> ${label}</label>`).join('');

    addCalendar = listEditor($('#calendars'), cfg.calendars || [], CAL_FIELDS);
    addDate = listEditor($('#dates'), cfg.dates || [], DATE_FIELDS);
    addFeed = listEditor($('#feeds'), cfg.news?.feeds || [], FEED_FIELDS);
}

function readSettings() {
    const form = $('#settings');
    const patch = {};
    for (const input of $$('[name]', form)) {
        const name = input.name;
        if (name === 'night.auto') { set(patch, 'night.mode', input.checked ? 'auto' : 'off'); continue; }
        if (name === 'compliments') { patch.compliments = input.value.split('\n').map((s) => s.trim()).filter(Boolean); continue; }
        if (input.type === 'checkbox') set(patch, name, input.checked);
        else if (input.type === 'number' || input.type === 'range') { if (input.value !== '') set(patch, name, Number(input.value)); }
        else set(patch, name, input.value.trim());
    }
    patch.modules = Object.fromEntries($$('[data-module]').map((i) => [i.dataset.module, i.checked]));
    patch.calendars = readList($('#calendars')).filter((c) => c.url);
    patch.dates = readList($('#dates')).filter((d) => d.title && /^(\d{4}-)?\d{2}-\d{2}$/.test(d.date));
    set(patch, 'news.feeds', readList($('#feeds')).filter((f) => f.url).map((f) => ({ name: f.name || new URL(f.url).hostname, url: f.url })));
    return patch;
}

async function geoSearch() {
    const q = $('#geo-search').value.trim();
    if (!q) return;
    try {
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pt`);
        const data = await r.json();
        const results = data.results || [];
        $('#geo-results').innerHTML = results.length ? results.map((p, i) =>
            `<li><button type="button" data-i="${i}">${esc(p.name)}<small>${esc([p.admin2, p.admin1, p.country].filter(Boolean).join(', '))}</small></button></li>`).join('') : '<li class="empty">Sem resultados.</li>';
        $$('#geo-results button').forEach((b) => {
            b.onclick = () => {
                const p = results[Number(b.dataset.i)];
                $('[name="location.name"]').value = p.name;
                $('[name="location.lat"]').value = p.latitude.toFixed(4);
                $('[name="location.lon"]').value = p.longitude.toFixed(4);
                $('#geo-results').innerHTML = '';
                toast('Localização escolhida — não te esqueças de guardar');
            };
        });
    } catch {
        toast('Não foi possível procurar', true);
    }
}

// --------------------------------------------------------------- Ligações
async function connectLive() {
    const base = await resolveApiBase();
    const es = new EventSource(`${base}/api/events`);
    es.addEventListener('open', () => { $('#conn').textContent = 'Ligado ao espelho'; $('#conn').classList.remove('off'); });
    es.addEventListener('error', () => { $('#conn').textContent = 'Sem ligação — a tentar…'; $('#conn').classList.add('off'); });
    es.addEventListener('state', (e) => applyState(JSON.parse(e.data)));
    es.addEventListener('config', (e) => { config = JSON.parse(e.data); });
    es.addEventListener('assistant', (e) => {
        const a = JSON.parse(e.data);
        if (!a.thinking && a.answer) showAnswer(a.answer);
    });
}

function showAnswer(text, thinking = false) {
    const el = $('#ask-answer');
    el.hidden = false;
    el.classList.toggle('thinking', thinking);
    el.textContent = text;
}

async function checkAi() {
    try {
        const sys = await call('system');
        const ai = sys.ollama;
        $('#ai-status').textContent = ai.online ? `Ollama ativo · ${ai.models.length} modelo(s) instalado(s). Tudo corre localmente, sem custos.` : 'Ollama não está a correr. Instala-o (gratuito) para ativar o assistente.';
        const select = $('#model-select');
        const models = ai.models.length ? ai.models : [config?.assistant?.model || 'llama3.2'];
        select.innerHTML = models.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
        const current = config?.assistant?.model || 'llama3.2';
        select.value = models.find((m) => m === current || m === `${current}:latest`) || models[0];
    } catch {
        $('#ai-status').textContent = 'Não foi possível verificar o assistente.';
    }
}

// ------------------------------------------------------------------ Arranque
async function boot() {
    try {
        const data = await call('config');
        config = data.config;
        pinRequired = data.pinRequired;
        fillSettings(config);
        applyState(await call('state'));
    } catch (error) {
        toast(`Erro: ${error.message}`, true);
    }
    connectLive();
    checkAi();

    if (pinRequired && !getPin()) await askPin();

    setInterval(() => {
        $('#clock').textContent = new Date().toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
        renderTimer();
    }, 1000);

    $$('.tabs button').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
    try { showTab(sessionStorage.getItem('tab') || 'home'); } catch { showTab('home'); }

    // Ecrã
    $$('#screen-mode button').forEach((b) => {
        b.onclick = () => action(() => call('screen', { method: 'POST', body: { mode: b.dataset.mode } }), `Ecrã: ${b.textContent}`);
    });

    // Mensagem
    $('#msg-send').onclick = () => {
        const text = $('#msg-text').value.trim();
        if (!text) return toast('Escreve uma mensagem', true);
        action(() => call('message', { method: 'POST', body: { text, from: $('#msg-from').value, minutes: Number($('#msg-minutes').value) } }), 'Mensagem enviada').then(() => { $('#msg-text').value = ''; });
    };
    $('#msg-clear').onclick = () => action(() => call('message', { method: 'POST', body: { text: '' } }), 'Mensagem removida');

    // Temporizador
    $$('#timer-presets button').forEach((b) => {
        b.onclick = () => action(() => call('timer', { method: 'POST', body: { seconds: Number(b.dataset.s), label: b.dataset.l || `${b.textContent}` } }), 'Temporizador iniciado');
    });
    $('#timer-start').onclick = () => {
        const minutes = Number($('#timer-min').value);
        if (!minutes) return toast('Indica os minutos', true);
        action(() => call('timer', { method: 'POST', body: { seconds: minutes * 60, label: $('#timer-label').value || `${minutes} min` } }), 'Temporizador iniciado');
    };
    $('#timer-cancel').onclick = () => action(() => call('timer', { method: 'POST', body: { seconds: 0 } }), 'Temporizador cancelado');

    // Ações
    $$('[data-cmd]').forEach((b) => { b.onclick = () => action(() => call('command', { method: 'POST', body: { command: b.dataset.cmd } }), 'Feito'); });

    // Notas
    $('#note-form').onsubmit = (e) => {
        e.preventDefault();
        const text = $('#note-text').value.trim();
        if (!text) return;
        action(() => call('notes', { method: 'POST', body: { text, kind: $('#note-kind').checked ? 'note' : 'todo' } })).then(() => { $('#note-text').value = ''; $('#note-text').focus(); });
    };
    $('#note-list').addEventListener('click', (e) => {
        const li = e.target.closest('li[data-id]');
        if (!li) return;
        const noteId = li.dataset.id;
        if (e.target.matches('.del')) action(() => call(`notes/${noteId}`, { method: 'DELETE' }));
        else if (e.target.matches('input[type=checkbox]')) action(() => call(`notes/${noteId}`, { method: 'PATCH', body: { done: e.target.checked } }));
    });
    $('#note-clear').onclick = () => action(() => call('notes/clear-done', { method: 'POST' }), 'Concluídas apagadas');

    // Assistente
    $('#ask-form').onsubmit = async (e) => {
        e.preventDefault();
        const question = $('#ask-text').value.trim();
        if (!question) return;
        $('#ask-btn').disabled = true;
        showAnswer('A pensar… (no Raspberry Pi pode demorar um bocadinho)', true);
        const result = await action(() => call('ask', { method: 'POST', body: { question, show: $('#ask-show').checked } }));
        if (result?.answer) showAnswer(result.answer);
        else showAnswer('Sem resposta do assistente.');
        $('#ask-btn').disabled = false;
    };
    $$('#ask-suggestions button').forEach((b) => { b.onclick = () => { $('#ask-text').value = b.textContent; $('#ask-form').requestSubmit(); }; });

    // Definições
    $('#geo-btn').onclick = geoSearch;
    $('#geo-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); geoSearch(); } });
    $('#marine-same').onclick = () => {
        $('[name="marine.lat"]').value = $('[name="location.lat"]').value;
        $('[name="marine.lon"]').value = $('[name="location.lon"]').value;
    };
    $('#add-calendar').onclick = () => addCalendar();
    $('#add-date').onclick = () => addDate();
    $('#add-feed').onclick = () => addFeed();
    $('[name="night.dim"]').oninput = (e) => { $('#dim-out').textContent = `${Math.round(e.target.value * 100)}%`; };
    $('#settings').onsubmit = async (e) => {
        e.preventDefault();
        let patch;
        try { patch = readSettings(); } catch { return toast('Há um URL inválido', true); }
        const result = await action(() => call('config', { method: 'PUT', body: patch }), 'Definições guardadas');
        if (result?.config) { config = result.config; fillSettings(config); }
    };
    $('#reset-config').onclick = async () => {
        if (!confirm('Repor todas as definições de origem?')) return;
        const result = await action(() => call('config?reset=1', { method: 'PUT', body: {} }), 'Definições repostas');
        if (result?.config) { config = result.config; fillSettings(config); }
    };
}

boot();
