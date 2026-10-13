// Assistente local via Ollama (corre no próprio PC/Pi, sem custos).
const { cached } = require('./cache');

const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://localhost:11434').replace(/\/$/, '');

const WEATHER_LABELS = {
    0: 'céu limpo', 1: 'pouco nublado', 2: 'parcialmente nublado', 3: 'encoberto',
    45: 'nevoeiro', 48: 'nevoeiro com geada', 51: 'chuvisco fraco', 53: 'chuvisco', 55: 'chuvisco forte',
    56: 'chuvisco gelado', 57: 'chuvisco gelado forte', 61: 'chuva fraca', 63: 'chuva', 65: 'chuva forte',
    66: 'chuva gelada', 67: 'chuva gelada forte', 71: 'neve fraca', 73: 'neve', 75: 'neve forte', 77: 'grãos de neve',
    80: 'aguaceiros fracos', 81: 'aguaceiros', 82: 'aguaceiros fortes', 85: 'aguaceiros de neve', 86: 'aguaceiros de neve fortes',
    95: 'trovoada', 96: 'trovoada com granizo', 99: 'trovoada forte com granizo'
};

function describeContext({ config, weather, marine, calendar, notes, warnings }) {
    const now = new Date();
    const lines = [
        `Data e hora: ${now.toLocaleString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`,
        `Local: ${config.location.name}.`
    ];
    if (weather) {
        const c = weather.current;
        const [today, tomorrow] = weather.daily;
        lines.push(`Agora: ${Math.round(c.temp)}°C (sensação ${Math.round(c.feels)}°C), ${WEATHER_LABELS[c.code] || 'tempo variável'}, humidade ${c.humidity}%, vento ${Math.round(c.wind)} km/h, UV ${c.uv ?? '?'}.`);
        if (today) lines.push(`Hoje: mín ${Math.round(today.min)}°C, máx ${Math.round(today.max)}°C, ${WEATHER_LABELS[today.code] || ''}, probabilidade de chuva ${today.pop}%, nascer do sol ${today.sunrise.slice(11)}, pôr do sol ${today.sunset.slice(11)}.`);
        if (tomorrow) lines.push(`Amanhã: mín ${Math.round(tomorrow.min)}°C, máx ${Math.round(tomorrow.max)}°C, ${WEATHER_LABELS[tomorrow.code] || ''}, chuva ${tomorrow.pop}%.`);
        const rainy = weather.hourly.slice(0, 12).filter((h) => h.pop >= 50).map((h) => h.time.slice(11, 13) + 'h');
        if (rainy.length) lines.push(`Horas com chuva provável nas próximas 12h: ${rainy.join(', ')}.`);
    }
    if (marine && marine.waveHeight != null) {
        const nextTide = (marine.tides || []).find((t) => new Date(t.time) > now);
        const h = marine.waveHeight;
        const state = h < 0.5 ? 'calmo' : h < 1.25 ? 'pouco agitado' : h < 2.5 ? 'agitado' : h < 4 ? 'muito agitado' : 'alteroso';
        lines.push(`Mar: ${state}, ondas ${h} m, período ${marine.wavePeriod} s, água a ${marine.seaTemp}°C.${nextTide ? ` Próxima maré ${nextTide.type === 'high' ? 'cheia' : 'vazia'} às ${new Date(nextTide.time).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}.` : ''}`);
    }
    if (warnings && warnings.length) {
        lines.push(`Avisos IPMA ativos: ${warnings.map((w) => `${w.type} (${w.level})`).join(', ')}.`);
    }
    if (calendar && calendar.events.length) {
        const upcoming = calendar.events.slice(0, 6).map((e) => {
            const d = new Date(e.start);
            const when = d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' });
            return `${when}${e.allDay ? '' : ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}: ${e.title}`;
        });
        lines.push(`Agenda: ${upcoming.join('; ')}.`);
    }
    const open = (notes || []).filter((n) => !n.done).map((n) => n.text);
    if (open.length) lines.push(`Notas/tarefas pendentes: ${open.join('; ')}.`);
    return lines.join('\n');
}

async function generate(prompt, { model, timeout = 120000, numPredict = 220 } = {}) {
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(timeout),
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.6, num_predict: numPredict } })
    });
    if (!response.ok) throw new Error(`Ollama respondeu ${response.status}`);
    const data = await response.json();
    return (data.response || '').trim();
}

async function ask(question, context, model) {
    const prompt = `És o assistente de um espelho inteligente em casa, em Portugal. Responde SEMPRE em português de Portugal (nunca do Brasil), de forma calorosa, direta e curta — no máximo 3 frases, porque a resposta aparece no espelho. Usa os dados abaixo quando forem relevantes; se não souberes algo, diz que não sabes.

DADOS ATUAIS:
${context}

PERGUNTA: ${question}
RESPOSTA:`;
    return generate(prompt, { model });
}

async function briefing(context, model) {
    const hourKey = Math.floor(new Date().getHours() / 3);
    return cached(`briefing:${new Date().toDateString()}:${hourKey}`, 3 * 60 * 60 * 1000, async () => {
        const prompt = `És o assistente de um espelho inteligente. Escreve UM conselho para o dia em português de Portugal (nunca do Brasil): no máximo 2 frases curtas e 35 palavras. Não repitas a data nem o local. Foca-te no que é útil: roupa, guarda-chuva, ou o compromisso mais importante. Sem emojis, sem listas.

DADOS:
${context}

RESUMO:`;
        const text = await generate(prompt, { model, timeout: 180000, numPredict: 120 });
        const clean = text.replace(/^["“]|["”]$/g, '').replace(/\s+/g, ' ').trim();
        const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
        return { text: sentences.slice(0, 2).join(' ').trim().slice(0, 240), at: new Date().toISOString() };
    });
}

async function status() {
    try {
        const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2500) });
        const data = await response.json();
        return { online: true, models: (data.models || []).map((m) => m.name) };
    } catch {
        return { online: false, models: [] };
    }
}

module.exports = { ask, briefing, status, describeContext };
