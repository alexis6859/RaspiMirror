// Cache em memória com TTL. Se a fonte falhar, devolve o último valor bom
// (marcado como "stale") para o espelho nunca ficar vazio por causa da rede.
const entries = new Map();
const inflight = new Map();

async function cached(key, ttlMs, loader) {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    if (inflight.has(key)) return inflight.get(key);

    const promise = (async () => {
        try {
            const value = await loader();
            entries.set(key, { value, at: Date.now() });
            return value;
        } catch (error) {
            if (hit) {
                console.warn(`[cache] ${key}: ${error.message} — a usar dados antigos`);
                return { ...hit.value, stale: true };
            }
            throw error;
        } finally {
            inflight.delete(key);
        }
    })();

    inflight.set(key, promise);
    return promise;
}

function invalidate(prefix = '') {
    for (const key of entries.keys()) {
        if (key.startsWith(prefix)) entries.delete(key);
    }
}

async function fetchWithTimeout(url, { timeout = 10000, as = 'json', headers = {} } = {}) {
    const response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        headers: { 'User-Agent': 'RaspiMirror/2.0 (smart mirror pessoal)', ...headers }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} em ${new URL(url).host}`);
    return as === 'text' ? response.text() : response.json();
}

module.exports = { cached, invalidate, fetchWithTimeout };
