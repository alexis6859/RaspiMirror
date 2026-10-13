// Zona central: temporizador, respostas do assistente, mensagens do telemóvel e frases do dia.
import { $, bus, esc, swap, setHTML, pad, weatherInfo } from './util.js';

const BY_TIME = {
    early: ['Bom dia, madrugador!', 'O café já está a chamar por ti.', 'Começa devagar, o dia é longo.'],
    morning: ['Bom dia! Hoje vai correr bem.', 'Estás com ótimo aspeto hoje.', 'Pronto para conquistar o dia?', 'Um sorriso e está feito.', 'Bom dia, raio de sol.'],
    afternoon: ['Boa tarde! Já fizeste uma pausa?', 'Estás a arrasar hoje.', 'Bebe um copo de água — o teu corpo agradece.', 'Metade do dia feita. Continua!'],
    evening: ['Boa noite! Mereces descansar.', 'Que tal desligar um bocadinho?', 'Dia cumprido. Bom trabalho.', 'Hora de abrandar.'],
    night: ['Já é tarde… o sono também é produtivo.', 'Amanhã há mais. Vai descansar.', 'Bons sonhos!']
};

const BY_WEATHER = {
    rain: ['Dia de chuva, dia de manta e série.', 'Não te esqueças do guarda-chuva!', 'A chuva também rega boas ideias.'],
    clear: ['Está um dia lindo lá fora.', 'Aproveita o sol!', 'Dia perfeito para uma caminhada à beira-mar.'],
    hot: ['Está calor! Hidrata-te bem.', 'Dia de gelado. Está decidido.'],
    cold: ['Está frio — agasalha-te bem.', 'Dia de sopa quentinha.'],
    windy: ['Está ventoso — segura o chapéu!']
};

const BY_WEEKDAY = {
    1: ['Segunda-feira: nova semana, novas oportunidades.'],
    5: ['Sexta-feira! O fim de semana está aí.', 'Última reta da semana!'],
    6: ['Sábado! Faz algo que gostes.', 'Bom fim de semana!'],
    0: ['Domingo: dia de recarregar baterias.', 'Bom domingo!']
};

function pickPool(config) {
    const now = new Date();
    const h = now.getHours();
    const slot = h < 7 ? 'early' : h < 12 ? 'morning' : h < 19 ? 'afternoon' : h < 23 ? 'evening' : 'night';
    const pool = [...BY_TIME[slot]];
    if (h >= 2 && h < 5) return ['Shh… está toda a gente a dormir.'];

    const w = bus.get('weather');
    if (w) {
        const c = w.current;
        const info = weatherInfo(c.code, c.isDay);
        if (info.rainy) pool.push(...BY_WEATHER.rain);
        else if (c.code <= 1 && c.isDay) pool.push(...BY_WEATHER.clear);
        if (c.temp >= 28) pool.push(...BY_WEATHER.hot);
        if (c.temp <= 8) pool.push(...BY_WEATHER.cold);
        if (c.gusts >= 45) pool.push(...BY_WEATHER.windy);
    }
    if (h >= 6 && h < 20) pool.push(...(BY_WEEKDAY[now.getDay()] || []));

    const cal = bus.get('calendar');
    const holidayToday = cal?.events?.find((e) => e.type === 'holiday' && new Date(e.start).toDateString() === now.toDateString());
    if (holidayToday) return [`Feliz ${holidayToday.title}!`, `Hoje é feriado: ${holidayToday.title}.`];
    const bday = cal?.countdowns?.find((c) => c.kind === 'birthday' && c.daysLeft === 0);
    if (bday) return [`Parabéns, ${bday.title}!`, `Hoje é dia de festa: ${bday.title} faz anos!`];

    const custom = (config.compliments || []).filter((s) => typeof s === 'string' && s.trim());
    pool.push(...custom, ...custom); // as frases personalizadas aparecem mais vezes
    return pool;
}

let assistantView = null; // { question, answer, thinking, until }
let lastCompliment = '';
let complimentAt = 0;

function renderContent(config) {
    const state = bus.get('state');
    const el = $('#stage-content');
    const now = Date.now();

    if (assistantView && (assistantView.thinking || assistantView.until > now)) {
        const html = assistantView.thinking
            ? `<div class="stage-q">“${esc(assistantView.question)}”</div><div class="stage-a thinking">A pensar<span class="dots"><i>.</i><i>.</i><i>.</i></span></div>`
            : `<div class="stage-q">“${esc(assistantView.question)}”</div><div class="stage-a ${assistantView.answer.length > 160 ? 'long' : ''}">${esc(assistantView.answer)}</div>`;
        el.className = 'stage-content assistant';
        swap(el, html, 300);
        return;
    }

    if (state?.message && (!state.message.until || state.message.until > now)) {
        el.className = 'stage-content message';
        swap(el, `<div class="stage-text">${esc(state.message.text)}</div>${state.message.from ? `<div class="stage-from">— ${esc(state.message.from)}</div>` : ''}`);
        return;
    }

    if (config.modules?.compliments === false) {
        swap(el, '');
        return;
    }
    if (!lastCompliment || now - complimentAt > 45000) {
        const pool = pickPool(config).filter((s) => s !== lastCompliment);
        lastCompliment = pool[Math.floor(Math.random() * pool.length)] || lastCompliment;
        complimentAt = now;
    }
    el.className = 'stage-content compliment';
    swap(el, `<div class="stage-text">${esc(lastCompliment)}</div>`, 900);
}

function renderTimer() {
    const timer = bus.get('state')?.timer;
    const el = $('#stage-timer');
    if (!timer) { el.hidden = true; document.body.classList.remove('timer-done'); return; }
    const left = Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000));
    const doneFor = (Date.now() - timer.endsAt) / 1000;
    if (left === 0 && doneFor > 90) { el.hidden = true; document.body.classList.remove('timer-done'); return; }
    el.hidden = false;
    const frac = timer.total ? left / timer.total : 0;
    const r = 46;
    const circ = 2 * Math.PI * r;
    const h = Math.floor(left / 3600);
    const text = left === 0 ? 'Terminou!' : h ? `${h}:${pad(Math.floor((left % 3600) / 60))}:${pad(left % 60)}` : `${pad(Math.floor(left / 60))}:${pad(left % 60)}`;
    document.body.classList.toggle('timer-done', left === 0);
    setHTML(el, `
        <svg viewBox="0 0 100 100" class="timer-ring">
            <circle cx="50" cy="50" r="${r}" opacity=".15"/>
            <circle cx="50" cy="50" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${(circ * (1 - frac)).toFixed(2)}" transform="rotate(-90 50 50)"/>
        </svg>
        <div class="timer-text"><strong>${text}</strong><span>${esc(timer.label)}</span></div>`);
}

export function initCenter(config) {
    bus.on('state', () => { renderContent(config()); renderTimer(); });
    bus.on('assistant', (a) => {
        const readMs = Math.min(Math.max((a.answer || '').length * 70, 25000), 120000);
        assistantView = { ...a, until: Date.now() + readMs };
        renderContent(config());
    });
    setInterval(renderTimer, 1000);
    setInterval(() => renderContent(config()), 5000);
    renderContent(config());
}
