// RaspiMirror — arranque, sincronização em tempo real, modo noturno e proteção do ecrã.
import { $, api, bus, poll, resolveApiBase, fmtTime, LOCALE } from './modules/util.js';
import { initClock } from './modules/clock.js';
import { initWeather } from './modules/weather.js';
import { initMarine } from './modules/marine.js';
import { initCalendar } from './modules/calendar.js';
import { initNotes, showQrOverlay } from './modules/notes.js';
import { initCenter } from './modules/center.js';
import { initNews } from './modules/news.js';
import { initInsights } from './modules/insights.js';

const config = () => bus.get('config') || {};
const MIN = 60 * 1000;
const bootAt = Date.now();

// ------------------------------------------------------- Visibilidade dos módulos
function applyModules() {
    const modules = config().modules || {};
    for (const key of ['weather', 'hourly', 'forecast', 'calendar', 'notes', 'system']) {
        document.querySelectorAll(`[data-module="${key}"]`).forEach((el) => { el.hidden = modules[key] === false; });
    }
}

// ------------------------------------------------------------- Modo noturno
function minutesOf(hhmm) {
    const [h, m] = String(hhmm || '0:0').split(':').map(Number);
    return h * 60 + (m || 0);
}

function applyScreen() {
    const night = config().night || {};
    const screen = bus.get('state')?.screen || 'auto';
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const start = minutesOf(night.start || '23:30');
    const end = minutesOf(night.end || '07:00');
    const inWindow = start > end ? mins >= start || mins < end : mins >= start && mins < end;
    const isNight = screen === 'night' || (screen === 'auto' && night.mode !== 'off' && inWindow);

    document.body.classList.toggle('night', isNight);
    document.body.classList.toggle('screen-off', screen === 'off');
    document.documentElement.style.setProperty('--night-dim', String(night.dim ?? 0.35));
}

// ------------------------------------------------- Proteção contra burn-in
function shiftLayout() {
    if (config().display?.burnInShift === false) {
        $('#mirror').style.transform = '';
        return;
    }
    const dx = Math.round((Math.random() - 0.5) * 16);
    const dy = Math.round((Math.random() - 0.5) * 16);
    $('#mirror').style.transform = `translate(${dx}px, ${dy}px)`;
}

// --------------------------------------------------------------- Barra de estado
function formatUptime(s) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return d ? `${d} d ${h} h` : `${h} h ${Math.floor((s % 3600) / 60)} min`;
}

function renderStatus() {
    const sys = bus.get('system');
    const online = bus.get('online') !== false;
    const last = bus.get('lastUpdate');
    const parts = [online ? 'Ligado' : 'Sem ligação'];
    if (last) parts.push(`atualizado às ${fmtTime(last)}`);
    if (sys) {
        if (sys.cpuTemp != null) parts.push(`CPU ${Math.round(sys.cpuTemp)}°C`);
        parts.push(`RAM ${sys.memUsed}%`);
        parts.push(`carga ${sys.load.toFixed(2)}`);
        if (sys.disk != null) parts.push(`disco ${sys.disk}%`);
        parts.push(`ligado há ${formatUptime(sys.uptime)}`);
        if (sys.ollama) parts.push(sys.ollama.online ? 'IA local ativa' : 'IA local offline');
        parts.push(sys.ip);
    }
    $('#status-dot').classList.toggle('off', !online);
    $('#status-dot').classList.toggle('hot', (sys?.cpuTemp ?? 0) >= 75);
    $('#status-text').textContent = parts.join('  ·  ');
}

// -------------------------------------------------------- Tempo real (SSE)
let offlineTimer = null;
function setOnline(online) {
    bus.set('online', online);
    clearTimeout(offlineTimer);
    if (online) $('#offline').hidden = true;
    else offlineTimer = setTimeout(() => { $('#offline').hidden = false; }, 30000);
}

async function connectLive(news, polls) {
    const base = await resolveApiBase();
    const source = new EventSource(`${base}/api/events`);
    let version = null;

    source.addEventListener('open', () => setOnline(true));
    source.addEventListener('error', () => setOnline(false));
    source.addEventListener('state', (e) => {
        const state = JSON.parse(e.data);
        if (version && state.version !== version) location.reload();
        version = state.version;
        bus.set('state', state);
        applyScreen();
        setOnline(true);
    });
    source.addEventListener('reload', () => location.reload());
    source.addEventListener('config', (e) => {
        bus.set('config', JSON.parse(e.data));
        applyModules();
        applyScreen();
        Object.values(polls).forEach((p) => p.refresh());
    });
    source.addEventListener('assistant', (e) => bus.set('assistant', JSON.parse(e.data)));
    source.addEventListener('command', (e) => {
        const { command } = JSON.parse(e.data);
        if (command === 'reload') location.reload();
        if (command === 'refresh') Object.values(polls).forEach((p) => p.refresh());
        if (command === 'qr') showQrOverlay(bus.get('remoteUrl'));
        if (command === 'nextNews') news.next();
    });
}

// ------------------------------------------------------------------ Arranque
async function boot() {
    try {
        const { config: cfg, remoteUrl } = await api('config');
        bus.set('config', cfg);
        bus.set('remoteUrl', remoteUrl);
    } catch (error) {
        console.error('Sem backend:', error);
        bus.set('config', {});
        setOnline(false);
        setTimeout(boot, 10000);
        return;
    }

    applyModules();
    initClock(config);
    initWeather(config);
    initMarine(config);
    initCalendar(config);
    initNotes(config);
    initCenter(config);
    initInsights(config);
    const news = initNews(config);

    const polls = {
        weather: poll('weather', 'weather', 10 * MIN),
        air: poll('air', 'air', 30 * MIN),
        marine: poll('marine', 'marine', 30 * MIN),
        warnings: poll('warnings', 'warnings', 15 * MIN),
        calendar: poll('calendar', 'calendar', 5 * MIN),
        news: poll('news', 'news', 15 * MIN),
        onthisday: poll('onthisday', 'onthisday', 3 * 60 * MIN),
        system: poll('system', 'system', 30 * 1000),
        state: poll('state', 'state', 2 * MIN), // reserva caso o SSE falhe
        briefing: poll('briefing', 'briefing', 30 * MIN)
    };

    bus.on('system', renderStatus);
    bus.on('online', renderStatus);
    connectLive(news, polls);

    applyScreen();
    bus.on('minute', (now) => {
        applyScreen();
        // recarrega uma vez por dia (04:00) para manter o browser leve
        if (now.getHours() === 4 && now.getMinutes() === 0 && Date.now() - bootAt > 60 * MIN) location.reload();
        // dia novo → efemérides e agenda novas
        if (now.getHours() === 0 && now.getMinutes() === 0) { polls.onthisday.refresh(); polls.calendar.refresh(); }
    });
    setInterval(shiftLayout, 4 * MIN);

    // atalhos úteis quando há teclado ligado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'r') location.reload();
        if (e.key === 'q') showQrOverlay(bus.get('remoteUrl'));
        if (e.key === 'n') news.next();
    });

    document.documentElement.lang = LOCALE;
    document.body.classList.add('ready');
}

boot();
