require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

const store = require('./lib/store');
const sources = require('./lib/sources');
const assistant = require('./lib/assistant');
const { invalidate } = require('./lib/cache');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const REMOTE_PIN = process.env.REMOTE_PIN || '';
const WEB_ROOT = path.join(__dirname, '..');

app.use(cors());
app.use(express.json({ limit: '200kb' }));

// ------------------------------------------------------------ Frontend
// Só servimos o que é público — nunca o .env, .git ou o backend.
const noCache = { etag: true, maxAge: 0, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
app.use('/css', express.static(path.join(WEB_ROOT, 'css'), noCache));
app.use('/js', express.static(path.join(WEB_ROOT, 'js'), noCache));
app.get('/', (_req, res) => res.sendFile(path.join(WEB_ROOT, 'index.html'), { headers: { 'Cache-Control': 'no-cache' } }));
app.get(['/remote', '/remote.html', '/r'], (_req, res) => res.sendFile(path.join(WEB_ROOT, 'remote.html'), { headers: { 'Cache-Control': 'no-cache' } }));

// Versão do frontend: o espelho recarrega sozinho quando os ficheiros mudam.
function frontendVersion() {
    const files = ['index.html', 'remote.html'];
    for (const dir of ['css', 'js', 'js/modules']) {
        try {
            for (const f of fs.readdirSync(path.join(WEB_ROOT, dir))) files.push(path.join(dir, f));
        } catch { /* pasta ausente */ }
    }
    const hash = crypto.createHash('sha1');
    for (const f of files) {
        try { hash.update(f + fs.statSync(path.join(WEB_ROOT, f)).mtimeMs); } catch { /* ignorar */ }
    }
    return hash.digest('hex').slice(0, 10);
}
let version = frontendVersion();

// ------------------------------------------------------- Tempo real (SSE)
const clients = new Set();
function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(payload);
}

function publicState() {
    const s = store.getState();
    return { notes: s.notes, message: s.message, timer: s.timer, screen: s.screen, version, serverTime: Date.now() };
}

function pushState() {
    broadcast('state', publicState());
}

app.get('/api/events', (req, res) => {
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`retry: 3000\nevent: state\ndata: ${JSON.stringify(publicState())}\n\n`);
    clients.add(res);
    req.on('close', () => clients.delete(res));
});

setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
    const v = frontendVersion();
    if (v !== version) {
        version = v;
        broadcast('reload', { version });
    }
}, 15000);

// ------------------------------------------------------------- Helpers
const wrap = (fn) => async (req, res) => {
    try {
        res.json(await fn(req, res));
    } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error.message);
        res.status(502).json({ error: error.message });
    }
};

function requirePin(req, res, next) {
    if (!REMOTE_PIN || req.get('x-pin') === REMOTE_PIN) return next();
    res.status(401).json({ error: 'PIN inválido' });
}

const id = () => crypto.randomBytes(6).toString('hex');
const clampText = (value, max = 280) => String(value ?? '').trim().slice(0, max);

async function gatherContext() {
    const config = store.getConfig();
    const [weather, marine, calendar, warnings] = await Promise.all([
        sources.getWeather(config.location).catch(() => null),
        config.marine?.enabled ? sources.getMarine(config.marine).catch(() => null) : null,
        sources.getCalendar(config).catch(() => null),
        sources.getWarnings(config.ipmaArea).catch(() => [])
    ]);
    return assistant.describeContext({ config, weather, marine, calendar, warnings, notes: store.getState().notes });
}

// ---------------------------------------------------------------- Dados
app.get('/api/health', (_req, res) => res.json({ ok: true, version, pinRequired: !!REMOTE_PIN }));

app.get('/api/config', (_req, res) => res.json({ config: store.getConfig(), pinRequired: !!REMOTE_PIN, remoteUrl: `http://${sources.localIp()}:${PORT}/remote` }));
app.get('/api/weather', wrap(() => sources.getWeather(store.getConfig().location)));
app.get('/api/air', wrap(() => sources.getAir(store.getConfig().location)));
app.get('/api/marine', wrap(() => sources.getMarine(store.getConfig().marine)));
app.get('/api/warnings', wrap(async () => ({ warnings: await sources.getWarnings(store.getConfig().ipmaArea) })));
app.get('/api/news', wrap(() => sources.getNews(store.getConfig().news.feeds || [])));
app.get('/api/onthisday', wrap(() => sources.getOnThisDay()));
app.get('/api/calendar', wrap(() => sources.getCalendar(store.getConfig())));
app.get('/api/system', wrap(async () => ({ ...sources.getSystem(), clients: clients.size, ollama: await assistant.status() })));
app.get('/api/state', (_req, res) => res.json(publicState()));

app.get('/api/briefing', wrap(async () => {
    const config = store.getConfig();
    if (!config.assistant?.briefing) return { text: null };
    try {
        return await assistant.briefing(await gatherContext(), config.assistant.model);
    } catch {
        return { text: null };
    }
}));

// ------------------------------------------------------ Comando remoto
app.put('/api/config', requirePin, (req, res) => {
    const patch = req.body || {};
    const config = req.query.reset === '1' ? store.resetConfig() : store.setConfig(patch);
    invalidate('briefing');
    broadcast('config', config);
    res.json({ config });
});

app.post('/api/notes', requirePin, (req, res) => {
    const text = clampText(req.body.text, 200);
    if (!text) return res.status(400).json({ error: 'Texto vazio' });
    store.update((s) => s.notes.push({ id: id(), text, done: false, kind: req.body.kind === 'note' ? 'note' : 'todo', createdAt: Date.now() }));
    pushState();
    res.json(publicState());
});

app.patch('/api/notes/:id', requirePin, (req, res) => {
    store.update((s) => {
        const note = s.notes.find((n) => n.id === req.params.id);
        if (!note) return;
        if (typeof req.body.done === 'boolean') note.done = req.body.done;
        if (req.body.text) note.text = clampText(req.body.text, 200);
    });
    pushState();
    res.json(publicState());
});

app.delete('/api/notes/:id', requirePin, (req, res) => {
    store.update((s) => { s.notes = s.notes.filter((n) => n.id !== req.params.id); });
    pushState();
    res.json(publicState());
});

app.post('/api/notes/clear-done', requirePin, (_req, res) => {
    store.update((s) => { s.notes = s.notes.filter((n) => !n.done); });
    pushState();
    res.json(publicState());
});

app.post('/api/message', requirePin, (req, res) => {
    const text = clampText(req.body.text, 280);
    const minutes = Math.min(Math.max(Number(req.body.minutes) || 30, 1), 24 * 60);
    store.update((s) => { s.message = text ? { text, from: clampText(req.body.from, 40), until: Date.now() + minutes * 60000, at: Date.now() } : null; });
    pushState();
    res.json(publicState());
});

app.post('/api/timer', requirePin, (req, res) => {
    const seconds = Math.min(Math.max(Number(req.body.seconds) || 0, 0), 24 * 3600);
    store.update((s) => { s.timer = seconds ? { label: clampText(req.body.label, 40) || 'Temporizador', endsAt: Date.now() + seconds * 1000, total: seconds } : null; });
    pushState();
    res.json(publicState());
});

app.post('/api/screen', requirePin, (req, res) => {
    const mode = ['auto', 'day', 'night', 'off'].includes(req.body.mode) ? req.body.mode : 'auto';
    store.update((s) => { s.screen = mode; });
    pushState();
    res.json(publicState());
});

app.post('/api/command', requirePin, (req, res) => {
    const allowed = ['reload', 'refresh', 'qr', 'nextNews'];
    if (!allowed.includes(req.body.command)) return res.status(400).json({ error: 'Comando desconhecido' });
    if (req.body.command === 'refresh') invalidate('');
    broadcast('command', { command: req.body.command });
    res.json({ ok: true });
});

app.post('/api/ask', requirePin, async (req, res) => {
    const question = clampText(req.body.question, 400);
    if (!question) return res.status(400).json({ error: 'Pergunta vazia' });
    const show = req.body.show !== false;
    if (show) broadcast('assistant', { question, thinking: true });
    try {
        const config = store.getConfig();
        const answer = await assistant.ask(question, await gatherContext(), config.assistant?.model || 'llama3.2');
        if (show) broadcast('assistant', { question, answer });
        res.json({ question, answer });
    } catch (error) {
        const message = 'O assistente (Ollama) não está disponível neste momento.';
        if (show) broadcast('assistant', { question, answer: message, error: true });
        console.error('[ask]', error.message);
        res.status(503).json({ error: message });
    }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota desconhecida' }));

app.listen(PORT, HOST, () => {
    const ip = sources.localIp();
    console.log(`🪞 RaspiMirror a correr`);
    console.log(`   Espelho:  http://localhost:${PORT}`);
    console.log(`   Comando:  http://${ip}:${PORT}/remote  (abre no telemóvel)`);
    console.log(`   Local:    ${store.getConfig().location.name}${REMOTE_PIN ? '  ·  PIN ativo' : ''}`);
});
