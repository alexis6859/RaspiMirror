// Todas as fontes de dados — 100% gratuitas e sem chave de API:
//   Open-Meteo (tempo, qualidade do ar, pólen, mar, marés), IPMA (avisos),
//   Wikipédia (efemérides), RSS dos jornais e calendários iCal.
const fs = require('fs');
const os = require('os');
const { cached, fetchWithTimeout } = require('./cache');
const { parseICS, expandEvents } = require('./ical');
const { parseFeed } = require('./rss');
const { holidaysFor } = require('./holidays');

const MIN = 60 * 1000;
const coordKey = (lat, lon) => `${Number(lat).toFixed(3)},${Number(lon).toFixed(3)}`;

// ---------------------------------------------------------------- Meteorologia
async function getWeather({ lat, lon }) {
    return cached(`weather:${coordKey(lat, lon)}`, 10 * MIN, async () => {
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            timezone: 'auto',
            forecast_days: '8',
            past_days: '1',
            wind_speed_unit: 'kmh',
            current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,visibility,dew_point_2m',
            hourly: 'temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,is_day,wind_speed_10m,wind_gusts_10m,uv_index',
            daily: 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,daylight_duration,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant',
            minutely_15: 'precipitation',
            forecast_minutely_15: '8'
        });
        const data = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`);

        const nowHour = data.current.time.slice(0, 13) + ':00';
        const hIdx = Math.max(0, data.hourly.time.findIndex((t) => t >= nowHour));
        const hourly = data.hourly.time.slice(hIdx, hIdx + 25).map((time, i) => {
            const j = hIdx + i;
            return {
                time,
                temp: data.hourly.temperature_2m[j],
                feels: data.hourly.apparent_temperature[j],
                pop: data.hourly.precipitation_probability[j] ?? 0,
                precip: data.hourly.precipitation[j] ?? 0,
                code: data.hourly.weather_code[j],
                isDay: data.hourly.is_day[j] === 1,
                wind: data.hourly.wind_speed_10m[j],
                gusts: data.hourly.wind_gusts_10m[j],
                uv: data.hourly.uv_index[j]
            };
        });

        const today = data.current.time.slice(0, 10);
        const dIdx = Math.max(0, data.daily.time.indexOf(today));
        const d = data.daily;
        const daily = d.time.slice(dIdx).map((date, i) => {
            const j = dIdx + i;
            return {
                date,
                code: d.weather_code[j],
                max: d.temperature_2m_max[j],
                min: d.temperature_2m_min[j],
                sunrise: d.sunrise[j],
                sunset: d.sunset[j],
                daylight: d.daylight_duration[j],
                uvMax: d.uv_index_max[j],
                precipSum: d.precipitation_sum[j],
                pop: d.precipitation_probability_max[j] ?? 0,
                windMax: d.wind_speed_10m_max[j],
                gustsMax: d.wind_gusts_10m_max[j],
                windDir: d.wind_direction_10m_dominant[j]
            };
        });

        return {
            timezone: data.timezone,
            utcOffset: data.utc_offset_seconds,
            current: {
                time: data.current.time,
                temp: data.current.temperature_2m,
                feels: data.current.apparent_temperature,
                humidity: data.current.relative_humidity_2m,
                isDay: data.current.is_day === 1,
                precip: data.current.precipitation,
                code: data.current.weather_code,
                cloud: data.current.cloud_cover,
                pressure: data.current.pressure_msl,
                wind: data.current.wind_speed_10m,
                windDir: data.current.wind_direction_10m,
                gusts: data.current.wind_gusts_10m,
                uv: data.current.uv_index,
                visibility: data.current.visibility,
                dewPoint: data.current.dew_point_2m
            },
            hourly,
            daily,
            yesterdayDaylight: dIdx > 0 ? d.daylight_duration[dIdx - 1] : null,
            nowcast: data.minutely_15 ? data.minutely_15.time.map((time, i) => ({ time, precip: data.minutely_15.precipitation[i] ?? 0 })) : [],
            fetchedAt: new Date().toISOString()
        };
    });
}

// ---------------------------------------------------------- Qualidade do ar
async function getAir({ lat, lon }) {
    return cached(`air:${coordKey(lat, lon)}`, 30 * MIN, async () => {
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            timezone: 'auto',
            current: 'european_aqi,pm10,pm2_5,nitrogen_dioxide,ozone,uv_index,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen'
        });
        const data = await fetchWithTimeout(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
        const c = data.current || {};
        return {
            aqi: c.european_aqi,
            pm10: c.pm10,
            pm25: c.pm2_5,
            no2: c.nitrogen_dioxide,
            o3: c.ozone,
            uv: c.uv_index,
            pollen: {
                Gramíneas: c.grass_pollen,
                Oliveira: c.olive_pollen,
                Bétula: c.birch_pollen,
                Amieiro: c.alder_pollen,
                Artemísia: c.mugwort_pollen,
                Ambrósia: c.ragweed_pollen
            },
            fetchedAt: new Date().toISOString()
        };
    });
}

// ------------------------------------------------------------ Mar e marés
function findTideExtremes(times, levels) {
    const out = [];
    for (let i = 1; i < levels.length - 1; i++) {
        const [a, b, c] = [levels[i - 1], levels[i], levels[i + 1]];
        if (a == null || b == null || c == null) continue;
        const isHigh = b > a && b >= c;
        const isLow = b < a && b <= c;
        if (!isHigh && !isLow) continue;
        // interpolação parabólica para estimar o minuto exato
        const denom = a - 2 * b + c;
        const shift = denom === 0 ? 0 : 0.5 * (a - c) / denom;
        const t = new Date(times[i]).getTime() + shift * 3600 * 1000;
        const level = b - 0.25 * (a - c) * shift;
        out.push({ type: isHigh ? 'high' : 'low', time: new Date(t).toISOString(), level: Math.round(level * 100) / 100 });
    }
    return out;
}

async function getMarine({ lat, lon }) {
    return cached(`marine:${coordKey(lat, lon)}`, 30 * MIN, async () => {
        const params = new URLSearchParams({
            latitude: lat,
            longitude: lon,
            timezone: 'GMT',
            forecast_days: '3',
            current: 'wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction,sea_surface_temperature',
            hourly: 'wave_height,sea_level_height_msl',
            daily: 'wave_height_max'
        });
        const data = await fetchWithTimeout(`https://marine-api.open-meteo.com/v1/marine?${params}`);
        const times = (data.hourly?.time || []).map((t) => `${t}:00Z`);
        const now = Date.now();
        const tides = findTideExtremes(times, data.hourly?.sea_level_height_msl || [])
            .filter((t) => new Date(t.time).getTime() > now - 3 * 3600 * 1000)
            .slice(0, 6);
        const startIdx = Math.max(0, times.findIndex((t) => new Date(t).getTime() >= now - 3600 * 1000));
        const c = data.current || {};
        return {
            waveHeight: c.wave_height,
            waveDir: c.wave_direction,
            wavePeriod: c.wave_period,
            swellHeight: c.swell_wave_height,
            swellPeriod: c.swell_wave_period,
            seaTemp: c.sea_surface_temperature,
            waveMaxToday: data.daily?.wave_height_max?.[0],
            waves: times.slice(startIdx, startIdx + 24).map((time, i) => ({ time, height: data.hourly.wave_height[startIdx + i] })),
            tideCurve: times.slice(startIdx, startIdx + 25).map((time, i) => ({ time, level: data.hourly.sea_level_height_msl[startIdx + i] })),
            tides,
            fetchedAt: new Date().toISOString()
        };
    });
}

// ------------------------------------------------------------ Avisos IPMA
const IPMA_LEVELS = { yellow: 1, orange: 2, red: 3 };
async function getWarnings(area) {
    const all = await cached('ipma:warnings', 15 * MIN, () =>
        fetchWithTimeout('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json'));
    const list = Array.isArray(all) ? all : [];
    const now = Date.now();
    return list
        .filter((w) => w.idAreaAviso === area && IPMA_LEVELS[w.awarenessLevelID] && new Date(w.endTime).getTime() > now)
        .map((w) => ({
            type: w.awarenessTypeName,
            level: w.awarenessLevelID,
            severity: IPMA_LEVELS[w.awarenessLevelID],
            start: w.startTime,
            end: w.endTime,
            text: w.text || ''
        }))
        .sort((a, b) => b.severity - a.severity || new Date(a.start) - new Date(b.start));
}

// ----------------------------------------------------------------- Notícias
async function getNews(feeds) {
    const key = `news:${feeds.map((f) => f.url).join('|')}`;
    return cached(key, 15 * MIN, async () => {
        const results = await Promise.allSettled(feeds.map(async (feed) => {
            const xml = await fetchWithTimeout(feed.url, { as: 'text', timeout: 12000 });
            return parseFeed(xml, feed.name).slice(0, 15);
        }));
        const seen = new Set();
        const items = results
            .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
            .filter((item) => {
                const k = item.title.toLowerCase();
                if (seen.has(k)) return false;
                seen.add(k);
                return true;
            })
            .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
            .slice(0, 40);
        if (!items.length) throw new Error('nenhum feed respondeu');
        return { items, fetchedAt: new Date().toISOString() };
    });
}

// ------------------------------------------------------- Efemérides (Wikipédia)
async function getOnThisDay() {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return cached(`onthisday:${mm}${dd}`, 12 * 60 * MIN, async () => {
        const data = await fetchWithTimeout(`https://api.wikimedia.org/feed/v1/wikipedia/pt/onthisday/selected/${mm}/${dd}`);
        const items = (data.selected || [])
            .filter((e) => e.text && e.text.length < 220)
            .map((e) => ({ year: e.year, text: e.text }));
        return { items, fetchedAt: new Date().toISOString() };
    });
}

// ---------------------------------------------------------------- Calendário
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function nextYearlyDate(mmdd, from) {
    const [m, d] = mmdd.split('-').map(Number);
    let date = new Date(from.getFullYear(), m - 1, d);
    if (date < startOfDay(from)) date = new Date(from.getFullYear() + 1, m - 1, d);
    return date;
}

async function getCalendar(config) {
    const from = startOfDay(new Date());
    const days = Math.min(Math.max(Number(config.calendarDays) || 30, 1), 120);
    const to = new Date(from.getTime() + days * 86400000);
    const calendars = (config.calendars || []).filter((c) => c && c.url);

    const fetched = await Promise.allSettled(calendars.map((cal) =>
        cached(`ics:${cal.url}`, 10 * MIN, async () => {
            const url = cal.url.replace(/^webcal:\/\//i, 'https://');
            const text = await fetchWithTimeout(url, { as: 'text', timeout: 15000 });
            return { events: parseICS(text) };
        }).then(({ events }) => expandEvents(events, from, to).map((e) => ({
            ...e,
            calendar: cal.name || 'Calendário',
            color: cal.color || null,
            type: 'event'
        })))
    ));

    const errors = fetched
        .map((r, i) => (r.status === 'rejected' ? `${calendars[i].name || 'Calendário'}: ${r.reason.message}` : null))
        .filter(Boolean);

    const events = fetched.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

    // Feriados nacionais
    for (const year of new Set([from.getFullYear(), to.getFullYear()])) {
        for (const h of holidaysFor(year)) {
            if (h.date >= from && h.date < to) {
                const end = new Date(h.date); end.setDate(end.getDate() + 1);
                events.push({ title: h.title, start: h.date, end, allDay: true, calendar: 'Feriado', type: 'holiday', optional: !!h.optional });
            }
        }
    }

    // Datas pessoais (aniversários, contagens decrescentes)
    const countdowns = [];
    for (const entry of config.dates || []) {
        if (!entry || !entry.date || !entry.title) continue;
        let date;
        if (/^\d{2}-\d{2}$/.test(entry.date)) date = nextYearlyDate(entry.date, from);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) { const [y, m, d] = entry.date.split('-').map(Number); date = new Date(y, m - 1, d); }
        else continue;
        if (date < from) continue;
        const daysLeft = Math.round((date - from) / 86400000);
        countdowns.push({ title: entry.title, kind: entry.kind || 'countdown', date: date.toISOString(), daysLeft });
        if (entry.kind === 'birthday' && date < to) {
            const end = new Date(date); end.setDate(end.getDate() + 1);
            events.push({ title: `Aniversário: ${entry.title}`, start: date, end, allDay: true, calendar: 'Datas', type: 'birthday' });
        }
    }

    events.sort((a, b) => a.start - b.start || (b.allDay - a.allDay));
    return {
        events: events.slice(0, 80).map((e) => ({ ...e, start: e.start.toISOString(), end: e.end.toISOString() })),
        countdowns: countdowns.sort((a, b) => a.daysLeft - b.daysLeft),
        errors,
        fetchedAt: new Date().toISOString()
    };
}

// ------------------------------------------------------------------ Sistema
function readCpuTemp() {
    try {
        const zones = fs.readdirSync('/sys/class/thermal').filter((z) => z.startsWith('thermal_zone'));
        for (const zone of zones) {
            const raw = fs.readFileSync(`/sys/class/thermal/${zone}/temp`, 'utf8');
            const value = Number(raw) / 1000;
            if (value > 0 && value < 150) return Math.round(value * 10) / 10;
        }
    } catch {
        // sem sensor
    }
    return null;
}

function localIp() {
    for (const list of Object.values(os.networkInterfaces())) {
        for (const iface of list || []) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
}

function getSystem() {
    let disk = null;
    try {
        const s = fs.statfsSync('/');
        disk = Math.round((1 - s.bavail / s.blocks) * 100);
    } catch {
        // indisponível
    }
    const total = os.totalmem();
    return {
        hostname: os.hostname(),
        ip: localIp(),
        cpuTemp: readCpuTemp(),
        load: os.loadavg()[0],
        cores: os.cpus().length,
        memUsed: Math.round((1 - os.freemem() / total) * 100),
        disk,
        uptime: os.uptime()
    };
}

module.exports = { getWeather, getAir, getMarine, getWarnings, getNews, getOnThisDay, getCalendar, getSystem, localIp };
