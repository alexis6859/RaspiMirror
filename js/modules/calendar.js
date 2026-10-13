// Agenda (iCal + feriados + datas pessoais), mini-calendário do mês e contagens decrescentes.
import { $, bus, esc, setHTML, startOfDay, relativeDay, fmtTime, capitalize, LOCALE } from './util.js';
import { icons } from './icons.js';

const MAX_ITEMS = 8;

function displayDay(event) {
    const today = startOfDay();
    const start = new Date(event.start);
    return start < today ? today : startOfDay(start);
}

function renderMonth(events, enabled) {
    const el = $('#month-grid');
    if (!enabled) { el.hidden = true; return; }
    el.hidden = false;
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const offset = (first.getDay() + 6) % 7; // segunda-feira primeiro

    const marks = new Map();
    for (const e of events) {
        const d = new Date(e.start);
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
        const key = d.getDate();
        const prev = marks.get(key);
        marks.set(key, prev === 'holiday' ? prev : e.type === 'holiday' ? 'holiday' : 'event');
    }

    const cells = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => `<span class="mg-head ${i > 4 ? 'weekend' : ''}">${d}</span>`);
    for (let i = 0; i < offset; i++) cells.push('<span></span>');
    for (let day = 1; day <= daysInMonth; day++) {
        const weekday = (offset + day - 1) % 7;
        const cls = [
            day === now.getDate() ? 'today' : '',
            day < now.getDate() ? 'past' : '',
            weekday > 4 ? 'weekend' : '',
            marks.get(day) ? `has-${marks.get(day)}` : ''
        ].join(' ');
        cells.push(`<span class="${cls}">${day}</span>`);
    }
    const monthName = capitalize(now.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' }));
    setHTML(el, `<div class="mg-title">${monthName}</div><div class="mg-cells">${cells.join('')}</div>`);
}

function eventIcon(e) {
    if (e.type === 'holiday') return icons.flag();
    if (e.type === 'birthday') return icons.gift();
    return `<i class="cal-dot" style="${e.color ? `background:${esc(e.color)}` : ''}"></i>`;
}

function renderAgenda(data) {
    const now = new Date();
    const events = (data?.events || []).filter((e) => new Date(e.end) > now || (e.allDay && new Date(e.end) >= startOfDay()));
    if (!events.length) {
        setHTML('#agenda', `<p class="empty">Sem compromissos nos próximos dias.${data && !(bus.get('config')?.calendars || []).length ? '<br><small>Adiciona o teu calendário no comando remoto.</small>' : ''}</p>`);
        return;
    }

    const groups = new Map();
    for (const e of events.slice(0, MAX_ITEMS)) {
        const day = displayDay(e).getTime();
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day).push(e);
    }

    let html = '';
    for (const [day, list] of groups) {
        html += `<div class="ag-day"><div class="ag-label">${relativeDay(new Date(day))}</div>`;
        for (const e of list) {
            const start = new Date(e.start);
            const end = new Date(e.end);
            const ongoing = !e.allDay && start <= now && end > now;
            const minsTo = Math.round((start - now) / 60000);
            let when = e.allDay ? 'Dia todo' : fmtTime(start);
            let badge = '';
            if (ongoing) badge = '<em class="badge live">agora</em>';
            else if (!e.allDay && minsTo > 0 && minsTo <= 120) badge = `<em class="badge">em ${minsTo < 60 ? `${minsTo} min` : `${Math.floor(minsTo / 60)}h${String(minsTo % 60).padStart(2, '0')}`}</em>`;
            if (!e.allDay && end - start > 0 && startOfDay(end).getTime() === startOfDay(start).getTime()) when += `<small>–${fmtTime(end)}</small>`;
            html += `
                <div class="ag-item ${e.type} ${ongoing ? 'ongoing' : ''}">
                    <span class="ag-time">${when}</span>
                    <span class="ag-mark">${eventIcon(e)}</span>
                    <span class="ag-title">${esc(e.title)}${e.location ? `<small>${esc(e.location)}</small>` : ''}</span>
                    ${badge}
                </div>`;
        }
        html += '</div>';
    }
    setHTML('#agenda', html);
}

function renderCountdowns(data) {
    const list = (data?.countdowns || []).slice(0, 3);
    setHTML('#countdowns', list.map((c) => {
        const icon = c.kind === 'birthday' ? icons.gift() : icons.calendar();
        const left = c.daysLeft === 0 ? 'é hoje!' : c.daysLeft === 1 ? 'amanhã' : `${c.daysLeft} dias`;
        const title = c.kind === 'birthday' ? `Aniversário: ${c.title}` : c.title;
        return `<div class="countdown">${icon}<span>${esc(title)}</span><strong>${left}</strong></div>`;
    }).join(''));
}

export function initCalendar(config) {
    const draw = () => {
        const data = bus.get('calendar');
        if (!data) return;
        renderMonth(data.events, config().modules?.monthGrid !== false);
        renderAgenda(data);
        renderCountdowns(data);
    };
    bus.on('calendar', draw);
    bus.on('minute', draw); // "agora" / "em X min" precisam de atualizar
}
