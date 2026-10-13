// "O teu dia": conselhos práticos calculados a partir dos dados (sem IA)
// + resumo opcional gerado pelo Ollama local.
import { $, bus, esc, setHTML, localTime, weatherInfo, aqiInfo, pollenLevel, LOCALE } from './util.js';
import { icons } from './icons.js';

const MAX = 4;

function outfit(w) {
    const now = w.current.time;
    const rest = w.hourly.filter((h) => h.time.slice(0, 10) === now.slice(0, 10)).slice(0, 14);
    const feelsMax = Math.max(w.current.feels, ...rest.map((h) => h.feels));
    const feelsMin = Math.min(w.current.feels, ...rest.map((h) => h.feels));
    const ref = (feelsMax + w.current.feels) / 2;
    let text;
    if (ref < 6) text = 'Casaco quente, cachecol e gorro';
    else if (ref < 12) text = 'Casaco e camisola';
    else if (ref < 17) text = 'Casaco leve ou camisola';
    else if (ref < 23) text = 'T-shirt e uma camada leve';
    else text = 'Roupa fresca e leve';
    if (feelsMax - feelsMin >= 8 && ref >= 12) text += ' — à noite arrefece bastante';
    return text;
}

function build(config) {
    const w = bus.get('weather');
    const air = bus.get('air');
    const marine = bus.get('marine');
    const cal = bus.get('calendar');
    const tips = [];
    if (!w) return tips;

    const [today, tomorrow] = w.daily;
    const nowIso = w.current.time;
    const hour = new Date().getHours();

    // Chuva nas próximas 12 h
    const next12 = w.hourly.slice(0, 12);
    const rainHour = next12.find((h) => h.pop >= 50 || h.precip >= 0.5);
    const rainyNow = weatherInfo(w.current.code).rainy;
    let umbrella = false;
    if (rainHour && !rainyNow) {
        umbrella = true;
        tips.push({ p: 90, icon: icons.umbrella(), text: `Chuva a partir das ${localTime(rainHour.time)} (${rainHour.pop}%) — leva guarda-chuva`, cls: 'accent-rain' });
    } else if (rainyNow) {
        umbrella = true;
        const dry = next12.find((h) => h.pop < 30 && h.precip < 0.1);
        tips.push({ p: 90, icon: icons.umbrella(), text: dry ? `Deve abrandar por volta das ${localTime(dry.time)}` : 'Chuva para o resto do dia', cls: 'accent-rain' });
    }

    // Roupa
    tips.push({ p: 70, icon: icons.shirt(), text: outfit(w) + (umbrella ? ' + guarda-chuva' : '') });

    // UV
    if (today && today.uvMax >= 6 && hour < 17) {
        tips.push({ p: 75, icon: icons.sunglasses(), text: `UV ${Math.round(today.uvMax)} ao início da tarde — protetor solar` });
    }

    // Vento
    if (today && today.gustsMax >= 50) {
        tips.push({ p: 80, icon: icons.wind(), text: `Rajadas até ${Math.round(today.gustsMax)} km/h hoje` });
    }

    // Geada
    if (hour >= 16 && tomorrow && tomorrow.min <= 2) {
        tips.push({ p: 72, icon: icons.thermo(), text: `Mínima de ${Math.round(tomorrow.min)}° — possibilidade de geada` });
    }

    // Amanhã
    if (tomorrow && today) {
        const diff = Math.round(tomorrow.max - today.max);
        if (Math.abs(diff) >= 4) {
            tips.push({ p: hour >= 15 ? 65 : 40, icon: icons.thermo(), text: `Amanhã ${diff > 0 ? 'mais quente' : 'mais fresco'}: ${Math.round(tomorrow.max)}° (${diff > 0 ? '+' : '−'}${Math.abs(diff)}°)` });
        }
        if (hour >= 17 && tomorrow.pop >= 60 && !umbrella) {
            tips.push({ p: 68, icon: icons.umbrella(), text: `Amanhã vai chover (${tomorrow.pop}%) — deixa o guarda-chuva à porta`, cls: 'accent-rain' });
        }
    }

    // Pôr do sol próximo
    if (today) {
        const toSunset = (new Date(`${today.sunset}:00`) - new Date(`${nowIso}:00`)) / 60000;
        if (toSunset > 0 && toSunset <= 60) {
            tips.push({ p: 60, icon: icons.sunset(), text: `Pôr do sol daqui a ${Math.round(toSunset)} min (${localTime(today.sunset)})` });
        }
    }

    // Praia
    if (marine && marine.waveHeight != null && today && config.marine?.enabled !== false) {
        if (marine.waveHeight < 1 && today.max >= 24 && today.pop < 20 && hour < 18) {
            tips.push({ p: 66, icon: icons.beach(), text: `Bom dia de praia — mar calmo${marine.seaTemp ? `, água a ${Math.round(marine.seaTemp)}°` : ''}` });
        } else if (marine.waveHeight >= 3) {
            tips.push({ p: 74, icon: icons.wave(), text: `Mar muito agitado (${marine.waveHeight.toFixed(1)} m) — cuidado junto à costa` });
        }
    }

    // Ar e pólen
    if (air) {
        const a = aqiInfo(air.aqi);
        if (a.level >= 2) tips.push({ p: 78, icon: icons.leaf(), text: `Qualidade do ar ${a.label.toLowerCase()} — evita exercício intenso na rua` });
        const high = Object.entries(air.pollen || {}).filter(([, v]) => pollenLevel(v) >= 3).map(([k]) => k);
        if (high.length) tips.push({ p: 76, icon: icons.flower(), text: `Pólen alto: ${high.join(', ').toLowerCase()}` });
    }

    // Feriado amanhã
    const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const holiday = cal?.events?.find((e) => e.type === 'holiday' && new Date(e.start).toDateString() === tomorrowDate.toDateString());
    if (holiday) tips.push({ p: 62, icon: icons.flag(), text: `Amanhã é feriado: ${holiday.title}` });

    // Primeiro compromisso de amanhã (à noite)
    if (hour >= 19) {
        const first = cal?.events?.find((e) => e.type === 'event' && !e.allDay && new Date(e.start).toDateString() === tomorrowDate.toDateString());
        if (first) tips.push({ p: 64, icon: icons.calendar(), text: `Amanhã às ${new Date(first.start).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}: ${first.title}` });
    }

    return tips.sort((a, b) => b.p - a.p).slice(0, MAX);
}

function render(config) {
    const module = $('[data-module="insights"]');
    if (config.modules?.insights === false) { module.hidden = true; return; }
    const tips = build(config);
    module.hidden = !tips.length;
    setHTML('#insights', tips.map((t) => `<li class="${t.cls || ''}">${t.icon}<span>${esc(t.text)}</span></li>`).join(''));
}

export function initInsights(config) {
    for (const key of ['weather', 'air', 'marine', 'calendar', 'minute']) bus.on(key, () => render(config()));
    bus.on('briefing', (b) => {
        const el = $('#briefing');
        el.hidden = !b?.text || config().assistant?.briefing === false;
        if (b?.text) setHTML(el, `${icons.sparkle()}<span>${esc(b.text)}</span>`);
    });
}
