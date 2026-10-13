// Ícones SVG em linha, monocromáticos (num espelho só o branco atravessa bem o vidro).
const svg = (body, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const CLOUD = 'M17.5 19H8a5 5 0 1 1 .9-9.92A6 6 0 0 1 20.4 11a4.3 4.3 0 0 1-2.9 8z';
const cloud = (t = '') => `<path d="${CLOUD}" fill="var(--bg)" ${t ? `transform="${t}"` : ''}/>`;
const sunRays = (cx, cy, r1, r2, n = 8) => Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    return `<line x1="${(cx + Math.cos(a) * r1).toFixed(2)}" y1="${(cy + Math.sin(a) * r1).toFixed(2)}" x2="${(cx + Math.cos(a) * r2).toFixed(2)}" y2="${(cy + Math.sin(a) * r2).toFixed(2)}"/>`;
}).join('');
const sun = (cx = 12, cy = 12, r = 4.2) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>${sunRays(cx, cy, r + 2.6, r + 5)}`;
const MOON = 'M20 14.2A8.5 8.5 0 1 1 9.8 4a6.8 6.8 0 0 0 10.2 10.2z';
const UP = 'translate(0 -3.5)';
const drops = (n, slant = true) => {
    const xs = n === 2 ? [10, 15] : n === 3 ? [8.5, 12.5, 16.5] : [7.5, 10.5, 13.5, 16.5];
    return xs.map((x) => `<line x1="${x}" y1="18.5" x2="${slant ? x - 1.5 : x}" y2="22"/>`).join('');
};
const dots = (xs) => xs.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".7" fill="currentColor"/>`).join('');
const flakes = (xs) => xs.map(([x, y]) => `<path d="M${x} ${y - 1.6}v3.2M${x - 1.4} ${y - .8}l2.8 1.6M${x - 1.4} ${y + .8}l2.8-1.6"/>`).join('');

export const weatherIcons = {
    'clear-day': () => svg(sun()),
    'clear-night': () => svg(`<path d="${MOON}"/>`),
    'partly-day': () => svg(`<g transform="translate(-2.5 -2.5)">${sun(9, 9, 3.2)}</g>${cloud('translate(2 2.5) scale(.85)')}`),
    'partly-night': () => svg(`<path d="${MOON}" transform="translate(-3 -3) scale(.75)"/>${cloud('translate(2 2.5) scale(.85)')}`),
    cloudy: () => svg(`${cloud('translate(4.5 -3) scale(.75)')}${cloud('translate(-1 2)')}`, 'dim-back'),
    fog: () => svg(`${cloud(UP)}<line x1="5" y1="18.5" x2="19" y2="18.5"/><line x1="7" y1="21.5" x2="17" y2="21.5"/>`),
    drizzle: () => svg(`${cloud(UP)}${dots([[8.5, 19.5], [12.5, 20.5], [16.5, 19.5], [10.5, 22.5], [14.5, 22.5]])}`),
    rain: () => svg(`${cloud(UP)}${drops(3)}`),
    'heavy-rain': () => svg(`${cloud(UP)}${drops(4)}`),
    showers: () => svg(`<g transform="translate(-2.5 -4.5)">${sun(9, 9, 3)}</g>${cloud('translate(1.5 -1) scale(.85)')}${drops(3)}`),
    snow: () => svg(`${cloud(UP)}${flakes([[8.5, 19.5], [15.5, 19.5], [12, 22]])}`),
    sleet: () => svg(`${cloud(UP)}<line x1="8.5" y1="18.5" x2="7" y2="22"/><line x1="16.5" y1="18.5" x2="15" y2="22"/>${flakes([[12, 20.5]])}`),
    thunder: () => svg(`${cloud(UP)}<path d="M12.5 15.5 10 19.5h3.5L11 23.5" />`)
};

export const icons = {
    sunrise: () => svg('<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.2" y1="10.2" x2="5.6" y2="11.6"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.4" y1="11.6" x2="19.8" y2="10.2"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="8 6 12 2 16 6"/>'),
    sunset: () => svg('<path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="9" x2="12" y2="2"/><line x1="4.2" y1="10.2" x2="5.6" y2="11.6"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.4" y1="11.6" x2="19.8" y2="10.2"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="16 5 12 9 8 5"/>'),
    drop: () => svg('<path d="M12 2.7 6.3 8.4a8 8 0 1 0 11.4 0z"/>'),
    wind: () => svg('<path d="M9.6 4.6A2 2 0 1 1 11 8H2m10.6 11.4A2 2 0 1 0 14 16H2m15.7-8.3A2.5 2.5 0 1 1 19.5 12H2"/>'),
    uv: () => svg(sun(12, 12, 3.5)),
    gauge: () => svg('<path d="M12 14l4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>'),
    leaf: () => svg('<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6C9.5 14.5 12 13 13 12"/>'),
    flower: () => svg('<circle cx="12" cy="9" r="2.5"/><path d="M12 6.5V3m0 0a3 3 0 0 1 3 3M12 3a3 3 0 0 0-3 3m5.5 3H18m0 0a3 3 0 0 1-3 3m3-3a3 3 0 0 0-3-3M9.5 9H6m0 0a3 3 0 0 0 3 3M6 9a3 3 0 0 1 3-3M12 11.5V21m0-3c-2 0-4-1-5-3m5 3c2 0 4-1 5-3"/>'),
    wave: () => svg('<path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 7c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>'),
    thermo: () => svg('<path d="M14 14.8V4.5a2 2 0 0 0-4 0v10.3a4 4 0 1 0 4 0z"/>'),
    umbrella: () => svg('<path d="M23 12a11 11 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7"/>'),
    alert: () => svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    sparkle: () => svg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>'),
    shirt: () => svg('<path d="M20.4 6.6 16 4a4 4 0 0 1-8 0L3.6 6.6a1 1 0 0 0-.5 1.2l1.2 3.3a1 1 0 0 0 1.3.6L8 11v9a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-9l2.4.7a1 1 0 0 0 1.3-.6l1.2-3.3a1 1 0 0 0-.5-1.2z"/>'),
    calendar: () => svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    gift: () => svg('<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zm0 0h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>'),
    flag: () => svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    clock: () => svg('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
    check: () => svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.8"/>'),
    circle: () => svg('<circle cx="12" cy="12" r="9"/>'),
    note: () => svg('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="14 3 14 9 20 9"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>'),
    sunglasses: () => svg('<circle cx="6.5" cy="14" r="3.5"/><circle cx="17.5" cy="14" r="3.5"/><path d="M10 14c1.3-1 2.7-1 4 0M3 14l1-6h2M21 14l-1-6h-2"/>'),
    beach: () => svg('<path d="M2 21h20M5 21c3-3 7-4 11-2"/><path d="M13 3a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8z"/><line x1="13" y1="11" x2="13" y2="19"/>'),
    moonSmall: () => svg(`<path d="${MOON}"/>`),
    phone: () => svg('<rect x="6" y="2" width="12" height="20" rx="2"/><line x1="11" y1="18" x2="13" y2="18"/>'),
    cpu: () => svg('<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>'),
    arrow: (deg = 0) => `<svg class="ico arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="transform:rotate(${deg}deg)" aria-hidden="true"><line x1="12" y1="20" x2="12" y2="4"/><polyline points="6 10 12 4 18 10"/></svg>`
};

// Fase da lua desenhada com a fração iluminada correta (hemisfério norte).
export function moonIcon(phase) {
    const r = 9;
    const cx = 12;
    const cy = 12;
    const k = Math.cos(2 * Math.PI * phase);
    const rx = Math.abs(k) * r;
    const waxing = phase < 0.5;
    const outer = waxing ? 1 : 0;
    const term = (k > 0) === waxing ? 0 : 1;
    const lit = phase < 0.02 || phase > 0.98
        ? ''
        : `<path d="M${cx} ${cy - r} A${r} ${r} 0 0 ${outer} ${cx} ${cy + r} A${rx.toFixed(2)} ${r} 0 0 ${term} ${cx} ${cy - r}Z" fill="currentColor" stroke="none"/>`;
    return `<svg class="ico moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><circle cx="${cx}" cy="${cy}" r="${r}" opacity=".45"/>${lit}</svg>`;
}
