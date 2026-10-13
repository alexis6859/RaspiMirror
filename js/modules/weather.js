// Meteorologia atual, avisos IPMA, ar/pólen, próximas horas e próximos dias.
import { $, bus, esc, setHTML, round, compass, windLabel, weatherInfo, aqiInfo, uvInfo, pollenLevel, localTime, relativeDay, capitalize, LOCALE } from './util.js';
import { icons, weatherIcons } from './icons.js';

const LEVEL_NAMES = { yellow: 'Amarelo', orange: 'Laranja', red: 'Vermelho' };

function renderNow(w, config) {
    const c = w.current;
    const today = w.daily[0];
    const info = weatherInfo(c.code, c.isDay);
    setHTML('#weather-icon', weatherIcons[info.icon]());
    $('#weather-temp').textContent = `${round(c.temp)}°`;
    const feels = Math.round(c.feels) !== Math.round(c.temp) ? `<span class="feels">sensação ${round(c.feels)}°</span>` : '';
    setHTML('#weather-range', `${feels}<span>${icons.arrow(0)}${round(today?.max)}°</span><span>${icons.arrow(180)}${round(today?.min)}°</span>`);
    $('#weather-desc').textContent = info.label;
    $('#weather-location').textContent = `${config.location.name}${w.stale ? ' · dados em cache' : ''}`;
    renderNowcast(w);
}

function renderNowcast(w) {
    const nc = w.nowcast || [];
    const wet = (p) => p >= 0.1;
    let text = '';
    let rainy = false;
    if (nc.length && wet(nc[0].precip)) {
        rainy = true;
        const stop = nc.find((p) => !wet(p.precip));
        text = stop ? `A chover — deve parar por volta das ${localTime(stop.time)}` : 'Chuva nas próximas 2 horas';
    } else {
        const start = nc.find((p) => wet(p.precip));
        if (start) {
            rainy = true;
            text = `Chuva a começar por volta das ${localTime(start.time)}`;
        } else {
            const soon = w.hourly.slice(1, 4).find((h) => h.pop >= 50);
            if (soon) {
                rainy = true;
                text = `Chuva provável às ${localTime(soon.time)} (${soon.pop}%)`;
            } else {
                text = 'Sem chuva prevista nas próximas horas';
            }
        }
    }
    setHTML('#nowcast', `<span class="${rainy ? 'accent-rain' : ''}">${rainy ? icons.umbrella() : icons.drop()}${text}</span>`);
}

function renderDetails(w, air) {
    const c = w.current;
    const items = [
        { icon: icons.arrow((c.windDir + 180) % 360), value: `${round(c.wind)} km/h ${compass(c.windDir)}`, label: c.gusts > c.wind + 10 ? `rajadas ${round(c.gusts)}` : `vento ${windLabel(c.wind)}` },
        { icon: icons.drop(), value: `${round(c.humidity)}%`, label: 'humidade' }
    ];
    const uv = uvInfo(c.uv);
    items.push({ icon: icons.uv(), value: `${c.uv != null ? c.uv.toFixed(c.uv < 10 ? 1 : 0) : '–'}`, label: `UV ${uv.label.toLowerCase()}`, level: uv.level });
    if (air) {
        const a = aqiInfo(air.aqi);
        items.push({ icon: icons.leaf(), value: a.label, label: `ar · ${round(air.aqi)}`, level: a.level });
    }
    items.push({ icon: icons.gauge(), value: `${round(c.pressure)}`, label: 'hPa' });
    if (air?.pollen) {
        const top = Object.entries(air.pollen).filter(([, v]) => pollenLevel(v) >= 2).sort((a, b) => b[1] - a[1])[0];
        if (top) items.push({ icon: icons.flower(), value: top[0], label: `pólen ${['', 'baixo', 'moderado', 'alto'][pollenLevel(top[1])]}`, level: pollenLevel(top[1]) });
    }
    setHTML('#weather-details', items.map((i) => `
        <div class="detail ${i.level >= 2 ? 'warn' : ''}">
            ${i.icon}
            <div><strong>${esc(i.value)}</strong><span>${esc(i.label)}</span></div>
        </div>`).join(''));
}

function renderWarnings(data) {
    const list = data?.warnings || [];
    setHTML('#warnings', list.slice(0, 4).map((wn) => {
        const start = new Date(wn.start);
        const end = new Date(wn.end);
        const active = start <= new Date();
        const when = active
            ? `até ${relativeDay(end).toLowerCase()} ${end.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`
            : `${relativeDay(start).toLowerCase()} ${start.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })}`;
        return `<div class="warning level-${wn.level}">${icons.alert()}<span><strong>${esc(wn.type)}</strong> · ${LEVEL_NAMES[wn.level] || wn.level} · ${when}</span></div>`;
    }).join(''));
}

function renderHourly(w) {
    const hours = w.hourly.filter((_, i) => i % 2 === 0).slice(0, 12);
    if (!hours.length) return;
    const temps = hours.map((h) => h.temp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const span = Math.max(max - min, 1);
    const n = hours.length;
    const points = hours.map((h, i) => `${((i + 0.5) / n) * 100},${(4 + (1 - (h.temp - min) / span) * 32).toFixed(1)}`).join(' ');

    const col = (fn) => hours.map((h, i) => `<span>${fn(h, i)}</span>`).join('');
    setHTML('#hourly', `
        <div class="h-row h-time">${col((h, i) => (i === 0 ? 'Agora' : `${h.time.slice(11, 13)}h`))}</div>
        <div class="h-row h-icon">${col((h) => weatherIcons[weatherInfo(h.code, h.isDay).icon]())}</div>
        <div class="h-row h-temp">${col((h) => `${round(h.temp)}°`)}</div>
        <svg class="h-curve" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"/>
        </svg>
        <div class="h-row h-rain">${col((h) => `<i style="height:${Math.max(h.pop, 2)}%" class="${h.pop >= 50 ? 'wet' : ''}"></i>`)}</div>
        <div class="h-row h-pop">${col((h) => (h.pop >= 20 ? `${h.pop}%` : ''))}</div>`);
}

function renderForecast(w) {
    const days = w.daily.slice(0, 7);
    const lo = Math.min(...days.map((d) => d.min));
    const hi = Math.max(...days.map((d) => d.max));
    const span = Math.max(hi - lo, 1);
    const now = w.current.temp;
    setHTML('#forecast', days.map((d, i) => {
        const info = weatherInfo(d.code, true);
        const left = ((d.min - lo) / span) * 100;
        const width = ((d.max - d.min) / span) * 100;
        const dot = i === 0 && now != null ? `<b style="left:${Math.min(Math.max(((now - lo) / span) * 100, 0), 100)}%"></b>` : '';
        const name = i === 0 ? 'Hoje' : capitalize(new Date(`${d.date}T12:00`).toLocaleDateString(LOCALE, { weekday: 'short' }).slice(0, 3));
        return `
            <div class="f-row">
                <span class="f-day">${name}</span>
                <span class="f-icon" title="${esc(info.label)}">${weatherIcons[info.icon]()}</span>
                <span class="f-pop ${d.pop >= 50 ? 'accent-rain' : ''}">${d.pop >= 20 ? `${d.pop}%` : ''}</span>
                <span class="f-min">${round(d.min)}°</span>
                <span class="f-bar"><i style="left:${left}%;width:${Math.max(width, 3)}%"></i>${dot}</span>
                <span class="f-max">${round(d.max)}°</span>
            </div>`;
    }).join(''));
}

export function initWeather(config) {
    const draw = () => {
        const w = bus.get('weather');
        if (!w) return;
        renderNow(w, config());
        renderDetails(w, bus.get('air'));
        renderHourly(w);
        renderForecast(w);
    };
    bus.on('weather', draw);
    bus.on('air', draw);
    bus.on('warnings', renderWarnings);
}
