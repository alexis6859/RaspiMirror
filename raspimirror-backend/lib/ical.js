// Parser de iCalendar (.ics) leve, sem dependências.
// Suporta eventos simples, dia inteiro, fusos (TZID), RRULE (DAILY/WEEKLY/MONTHLY/YEARLY
// com INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY), EXDATE e exceções (RECURRENCE-ID).
// Serve para o link "endereço secreto em formato iCal" do Google Calendar, Outlook, iCloud, etc.

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function unescapeText(value) {
    return value.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

// Diferença (ms) entre a hora de parede num fuso e UTC, para um dado instante.
function tzOffset(utcMs, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date(utcMs));
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return asUtc - utcMs;
}

function parseDateValue(value, params) {
    const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    if (h === undefined) {
        return { date: new Date(+y, +mo - 1, +d), allDay: true };
    }
    if (z) {
        return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
    }
    if (params.TZID) {
        try {
            const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
            let utc = wall - tzOffset(wall, params.TZID);
            utc = wall - tzOffset(utc, params.TZID); // corrige perto de mudanças de hora
            return { date: new Date(utc), allDay: false };
        } catch {
            // fuso desconhecido (ex.: nomes Windows) → hora local
        }
    }
    return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

function parseLine(line) {
    const idx = line.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    if (idx < 0) return null;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...rawParams] = left.split(';');
    const params = {};
    for (const p of rawParams) {
        const [k, v = ''] = p.split('=');
        params[k.toUpperCase()] = v.replace(/^"|"$/g, '');
    }
    return { name: name.toUpperCase(), params, value };
}

function parseRRule(value) {
    const rule = {};
    for (const part of value.split(';')) {
        const [k, v] = part.split('=');
        rule[k.toUpperCase()] = v;
    }
    return {
        freq: rule.FREQ,
        interval: Math.max(1, Number(rule.INTERVAL || 1)),
        count: rule.COUNT ? Number(rule.COUNT) : null,
        until: rule.UNTIL ? parseDateValue(rule.UNTIL, {})?.date : null,
        byDay: rule.BYDAY ? rule.BYDAY.split(',').map((d) => {
            const mm = d.match(/^([+-]?\d+)?([A-Z]{2})$/);
            return mm ? { nth: mm[1] ? Number(mm[1]) : null, day: DAY_CODES.indexOf(mm[2]) } : null;
        }).filter(Boolean) : null,
        byMonthDay: rule.BYMONTHDAY ? rule.BYMONTHDAY.split(',').map(Number) : null
    };
}

function parseICS(text) {
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
    const events = [];
    let cur = null;
    let nested = 0;

    for (const line of lines) {
        if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; nested = 0; continue; }
        if (!cur) continue;
        if (line === 'END:VEVENT') { events.push(cur); cur = null; continue; }
        if (line.startsWith('BEGIN:')) { nested++; continue; }
        if (line.startsWith('END:')) { nested--; continue; }
        if (nested > 0) continue; // ignora VALARM e afins

        const prop = parseLine(line);
        if (!prop) continue;
        switch (prop.name) {
            case 'UID': cur.uid = prop.value; break;
            case 'SUMMARY': cur.title = unescapeText(prop.value); break;
            case 'LOCATION': cur.location = unescapeText(prop.value); break;
            case 'STATUS': cur.status = prop.value.toUpperCase(); break;
            case 'DTSTART': {
                const parsed = parseDateValue(prop.value, prop.params);
                if (parsed) { cur.start = parsed.date; cur.allDay = parsed.allDay || prop.params.VALUE === 'DATE'; }
                break;
            }
            case 'DTEND': cur.end = parseDateValue(prop.value, prop.params)?.date; break;
            case 'DURATION': cur.duration = parseDuration(prop.value); break;
            case 'RRULE': cur.rrule = parseRRule(prop.value); break;
            case 'EXDATE':
                for (const v of prop.value.split(',')) {
                    const d = parseDateValue(v, prop.params);
                    if (d) cur.exdates.push(d.date.getTime());
                }
                break;
            case 'RECURRENCE-ID': cur.recurrenceId = parseDateValue(prop.value, prop.params)?.date; break;
            default: break;
        }
    }
    return events.filter((e) => e.start && e.status !== 'CANCELLED');
}

function parseDuration(value) {
    const m = value.match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
    if (!m) return 0;
    const [, sign, w, d, h, mi, s] = m;
    const ms = ((+w || 0) * 7 * 86400 + (+d || 0) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0)) * 1000;
    return sign === '-' ? -ms : ms;
}

function withTimeOf(day, source) {
    const d = new Date(day);
    d.setHours(source.getHours(), source.getMinutes(), source.getSeconds(), 0);
    return d;
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
    if (nth > 0) {
        const first = new Date(year, month, 1);
        const offset = (weekday - first.getDay() + 7) % 7;
        const day = 1 + offset + (nth - 1) * 7;
        const d = new Date(year, month, day);
        return d.getMonth() === month ? d : null;
    }
    const last = new Date(year, month + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    const d = new Date(year, month, last.getDate() - offset + (nth + 1) * 7);
    return d.getMonth() === month ? d : null;
}

// Gera as datas de início de cada ocorrência (em ordem) até `to`.
function* occurrences(ev, to) {
    const { rrule, start } = ev;
    if (!rrule) { yield start; return; }

    const until = rrule.until ? rrule.until.getTime() : Infinity;
    let emitted = 0;
    const limit = 5000;

    const emit = function* (candidates) {
        for (const c of candidates.sort((a, b) => a - b)) {
            if (c < start) continue;
            if (c.getTime() > until || c > to) return false;
            if (rrule.count && emitted >= rrule.count) return false;
            emitted++;
            yield c;
        }
        return true;
    };

    for (let step = 0; step < limit; step++) {
        let candidates = [];
        if (rrule.freq === 'DAILY') {
            const d = new Date(start); d.setDate(d.getDate() + step * rrule.interval);
            candidates = [d];
        } else if (rrule.freq === 'WEEKLY') {
            const weekStart = new Date(start);
            weekStart.setDate(weekStart.getDate() - weekStart.getDay() + step * 7 * rrule.interval);
            const days = rrule.byDay ? rrule.byDay.map((b) => b.day) : [start.getDay()];
            candidates = days.map((wd) => { const d = new Date(weekStart); d.setDate(d.getDate() + wd); return withTimeOf(d, start); });
        } else if (rrule.freq === 'MONTHLY') {
            const y = start.getFullYear();
            const m = start.getMonth() + step * rrule.interval;
            const base = new Date(y, m, 1);
            if (rrule.byDay && rrule.byDay.some((b) => b.nth !== null)) {
                candidates = rrule.byDay.map((b) => nthWeekdayOfMonth(base.getFullYear(), base.getMonth(), b.day, b.nth)).filter(Boolean).map((d) => withTimeOf(d, start));
            } else {
                const days = rrule.byMonthDay || [start.getDate()];
                candidates = days.map((md) => new Date(base.getFullYear(), base.getMonth(), md)).filter((d) => d.getMonth() === base.getMonth()).map((d) => withTimeOf(d, start));
            }
        } else if (rrule.freq === 'YEARLY') {
            const d = new Date(start); d.setFullYear(start.getFullYear() + step * rrule.interval);
            if (d.getMonth() === start.getMonth()) candidates = [d];
        } else {
            yield start; return;
        }
        const keepGoing = yield* emit(candidates);
        if (keepGoing === false) return;
        if (candidates.length && candidates.every((c) => c > to)) return;
    }
}

// Expande eventos para a janela [from, to] e devolve uma lista plana ordenada.
function expandEvents(events, from, to) {
    const overrides = new Set(
        events.filter((e) => e.recurrenceId).map((e) => `${e.uid}|${e.recurrenceId.getTime()}`)
    );
    const out = [];
    for (const ev of events) {
        const duration = ev.end ? ev.end - ev.start : (ev.duration || (ev.allDay ? 86400000 : 0));
        for (const occ of occurrences(ev, to)) {
            const t = occ.getTime();
            if (ev.exdates.includes(t)) continue;
            if (!ev.recurrenceId && ev.rrule && overrides.has(`${ev.uid}|${t}`)) continue;
            const end = new Date(t + duration);
            if (end < from || (duration > 0 && end.getTime() === from.getTime())) continue;
            out.push({ title: ev.title || '(sem título)', location: ev.location || '', start: occ, end, allDay: !!ev.allDay });
        }
    }
    return out.sort((a, b) => a.start - b.start);
}

module.exports = { parseICS, expandEvents };
