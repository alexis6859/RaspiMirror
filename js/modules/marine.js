// Mar: ondulação, temperatura da água e marés (Open-Meteo Marine).
import { $, bus, setHTML, compass, fmtTime } from './util.js';
import { icons } from './icons.js';

export function seaState(h) {
    if (h == null) return '—';
    if (h < 0.5) return 'Calmo';
    if (h < 1.25) return 'Pouco agitado';
    if (h < 2.5) return 'Agitado';
    if (h < 4) return 'Muito agitado';
    if (h < 6) return 'Alteroso';
    return 'Tempestuoso';
}

function tideCurve(m) {
    const pts = (m.tideCurve || []).filter((p) => p.level != null);
    if (pts.length < 3) return '';
    const t0 = new Date(pts[0].time).getTime();
    const t1 = new Date(pts[pts.length - 1].time).getTime();
    const levels = pts.map((p) => p.level);
    const lo = Math.min(...levels);
    const hi = Math.max(...levels);
    const span = Math.max(hi - lo, 0.1);
    const x = (t) => ((t - t0) / (t1 - t0)) * 100;
    const y = (l) => 4 + (1 - (l - lo) / span) * 28;
    const line = pts.map((p) => `${x(new Date(p.time).getTime()).toFixed(2)},${y(p.level).toFixed(2)}`).join(' ');
    const nowX = x(Date.now());
    return `
        <svg class="tide-curve" viewBox="0 0 100 36" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="0,36 ${line} 100,36" fill="currentColor" fill-opacity=".08" stroke="none"/>
            <polyline points="${line}" fill="none" stroke="currentColor" stroke-width="1.2" vector-effect="non-scaling-stroke"/>
            ${nowX >= 0 && nowX <= 100 ? `<line x1="${nowX}" x2="${nowX}" y1="0" y2="36" stroke="currentColor" stroke-dasharray="2 2" vector-effect="non-scaling-stroke" opacity=".7"/>` : ''}
        </svg>`;
}

function render(m, config) {
    const module = $('[data-module="marine"]');
    if (!m || m.waveHeight == null || config.marine?.enabled === false || config.modules?.marine === false) {
        module.hidden = true;
        return;
    }
    module.hidden = false;
    $('#marine-title').textContent = config.marine?.name ? `Mar · ${config.marine.name}` : 'Mar';

    const now = Date.now();
    const upcoming = (m.tides || []).filter((t) => new Date(t.time).getTime() > now).slice(0, 2);
    const filling = upcoming[0]?.type === 'high';
    const tides = upcoming.map((t) => `<span><strong>${t.type === 'high' ? 'Preia-mar' : 'Baixa-mar'}</strong> ${fmtTime(t.time)}</span>`).join('');

    setHTML('#marine', `
        <div class="marine-stats">
            <div class="detail">${icons.wave()}<div><strong>${m.waveHeight.toFixed(1)} m</strong><span>${seaState(m.waveHeight)}</span></div></div>
            <div class="detail">${icons.arrow(((m.waveDir ?? 0) + 180) % 360)}<div><strong>${Math.round(m.wavePeriod ?? 0)} s</strong><span>período · ${compass(m.waveDir)}</span></div></div>
            <div class="detail">${icons.thermo()}<div><strong>${m.seaTemp != null ? `${m.seaTemp.toFixed(1)}°` : '–'}</strong><span>água</span></div></div>
        </div>
        ${upcoming.length ? `<div class="tides"><span class="tide-state">Maré a ${filling ? 'encher' : 'vazar'}</span>${tides}</div>` : ''}
        ${tideCurve(m)}`);
}

export function initMarine(config) {
    bus.on('marine', (m) => render(m, config()));
    bus.on('config', () => render(bus.get('marine'), config()));
    // atualiza o marcador "agora" na curva de marés
    bus.on('minute', () => { const m = bus.get('marine'); if (m) render(m, config()); });
}
