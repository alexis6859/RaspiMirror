// Estado persistente do espelho: configuração (por cima do config.default.json),
// notas/tarefas, mensagem atual, temporizador e modo de ecrã.
const fs = require('fs');
const path = require('path');

const DEFAULTS_FILE = path.join(__dirname, '..', 'config.default.json');
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

const defaults = JSON.parse(fs.readFileSync(DEFAULTS_FILE, 'utf8'));

function isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
}

function deepMerge(base, override) {
    if (!isPlainObject(base) || !isPlainObject(override)) {
        return override === undefined ? base : override;
    }
    const out = { ...base };
    for (const [key, value] of Object.entries(override)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
        out[key] = isPlainObject(value) && isPlainObject(base[key]) ? deepMerge(base[key], value) : value;
    }
    return out;
}

function emptyState() {
    return {
        config: {},
        notes: [],
        message: null,
        timer: null,
        screen: 'auto', // auto | day | night | off
        updatedAt: Date.now()
    };
}

let state = emptyState();
try {
    state = { ...emptyState(), ...JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) };
} catch {
    // primeira execução ou ficheiro inválido
}

let saveTimer = null;
function persist() {
    state.updatedAt = Date.now();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = `${STATE_FILE}.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
        fs.renameSync(tmp, STATE_FILE);
    }, 200);
}

function getConfig() {
    return deepMerge(defaults, state.config || {});
}

function setConfig(patch) {
    state.config = deepMerge(state.config || {}, patch);
    persist();
    return getConfig();
}

function resetConfig() {
    state.config = {};
    persist();
    return getConfig();
}

function getState() {
    const now = Date.now();
    if (state.message && state.message.until && state.message.until < now) state.message = null;
    if (state.timer && state.timer.endsAt + 5 * 60 * 1000 < now) state.timer = null;
    return state;
}

function update(mutator) {
    mutator(state);
    persist();
    return getState();
}

module.exports = { getConfig, setConfig, resetConfig, getState, update, defaults };
