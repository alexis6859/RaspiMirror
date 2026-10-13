// Relógio, data, semana do ano, sol e lua.
import { $, bus, pad, setHTML, capitalize, LOCALE, localTime, duration } from './util.js';
import { icons, moonIcon } from './icons.js';

function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

function dayOfYear(date) {
    return Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) - new Date(date.getFullYear(), 0, 0)) / 86400000);
}

// Idade da lua a partir de uma lua nova de referência (6 jan 2000, 18:14 UTC).
export function moonPhase(date = new Date()) {
    const synodic = 29.530588853;
    const ref = Date.UTC(2000, 0, 6, 18, 14);
    const age = (((date - ref) / 86400000) % synodic + synodic) % synodic;
    const phase = age / synodic;
    const illumination = Math.round(((1 - Math.cos(2 * Math.PI * phase)) / 2) * 100);
    const names = ['Lua nova', 'Lua crescente', 'Quarto crescente', 'Crescente gibosa', 'Lua cheia', 'Minguante gibosa', 'Quarto minguante', 'Lua minguante'];
    const name = names[Math.floor(((phase + 1 / 16) % 1) * 8)];
    const daysToFull = ((0.5 - phase + 1) % 1) * synodic;
    const daysToNew = ((1 - phase) % 1) * synodic;
    return { phase, age, illumination, name, daysToFull, daysToNew };
}

function renderMoon() {
    const m = moonPhase();
    const next = m.daysToFull < m.daysToNew
        ? `cheia ${m.daysToFull < 1 ? 'hoje' : `em ${Math.round(m.daysToFull)} d`}`
        : `nova ${m.daysToNew < 1 ? 'hoje' : `em ${Math.round(m.daysToNew)} d`}`;
    setHTML('#moon', `${moonIcon(m.phase)}<div><strong>${m.name}</strong><span>${m.illumination}% · ${next}</span></div>`);
}

function renderSun(weather) {
    const today = weather?.daily?.[0];
    if (!today) return;
    const now = weather.current.time;
    const diff = weather.yesterdayDaylight ? Math.round((today.daylight - weather.yesterdayDaylight) / 60) : null;
    const diffText = diff == null ? '' : ` · ${diff >= 0 ? '+' : '−'}${Math.abs(diff)} min`;
    const sunUp = now >= today.sunrise && now < today.sunset;
    // Depois do pôr do sol mostra o nascer de amanhã
    const tomorrow = weather.daily[1];
    const showRise = !sunUp && now >= today.sunset && tomorrow ? tomorrow.sunrise : today.sunrise;
    setHTML('#sun', `
        <div class="sun-times">
            <span>${icons.sunrise()}${localTime(showRise)}</span>
            <span>${icons.sunset()}${localTime(today.sunset)}</span>
        </div>
        <span class="sun-daylight">${duration(today.daylight)} de luz${diffText}</span>`);
}

export function initClock(config) {
    let lastMinute = -1;
    const tick = () => {
        const now = new Date();
        $('#clock-hm').textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
        const showSeconds = config().display?.seconds !== false;
        $('#clock-s').textContent = showSeconds ? pad(now.getSeconds()) : '';
        if (now.getMinutes() !== lastMinute) {
            lastMinute = now.getMinutes();
            $('#date').textContent = capitalize(now.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }));
            const endOfYear = new Date(now.getFullYear() + 1, 0, 1);
            const left = Math.ceil((endOfYear - now) / 86400000);
            $('#date-meta').textContent = `Semana ${isoWeek(now)} · dia ${dayOfYear(now)} · faltam ${left} dias para ${now.getFullYear() + 1}`;
            renderMoon();
            bus.set('minute', now);
        }
    };
    tick();
    // alinha ao segundo para o relógio não "saltar"
    setTimeout(() => { tick(); setInterval(tick, 1000); }, 1000 - (Date.now() % 1000));
    bus.on('weather', renderSun);
}
