// Notas e tarefas (geridas a partir do telemóvel) + QR code para o comando remoto.
import { $, bus, esc, setHTML } from './util.js';
import { icons } from './icons.js';

export function qrSvg(text) {
    if (typeof window.qrcode !== 'function') return '';
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const m = 2; // margem silenciosa
    let path = '';
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            if (qr.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
        }
    }
    return `<svg class="qr" viewBox="0 0 ${n + m * 2} ${n + m * 2}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

function render(state, config, remoteUrl) {
    const notes = state?.notes || [];
    const pending = notes.filter((n) => !n.done);
    const done = notes.filter((n) => n.done).slice(-3);
    const list = [...pending, ...done].slice(0, 8);

    setHTML('#notes', list.map((n) => `
        <li class="${n.done ? 'done' : ''} ${n.kind}">
            ${n.kind === 'note' ? icons.note() : n.done ? icons.check() : icons.circle()}
            <span>${esc(n.text)}</span>
        </li>`).join(''));

    const hint = $('#remote-hint');
    const showHint = !list.length && config.display?.remoteHint !== false && remoteUrl;
    hint.hidden = !showHint;
    if (showHint) {
        setHTML(hint, `${qrSvg(remoteUrl)}<p>${icons.phone()}Aponta a câmara para controlar o espelho:<br><strong>${esc(remoteUrl.replace(/^https?:\/\//, ''))}</strong></p>`);
    }
    $('[data-module="notes"] .module-title').textContent = pending.length ? `Notas · ${pending.length} por fazer` : 'Notas';
}

export function showQrOverlay(url, seconds = 45) {
    const el = $('#qr-overlay');
    setHTML(el, `<div>${qrSvg(url)}<p>Comando remoto</p><strong>${esc(url.replace(/^https?:\/\//, ''))}</strong></div>`);
    el.hidden = false;
    clearTimeout(showQrOverlay.timer);
    showQrOverlay.timer = setTimeout(() => { el.hidden = true; }, seconds * 1000);
    el.onclick = () => { el.hidden = true; };
}

export function initNotes(config) {
    const draw = () => render(bus.get('state'), config(), bus.get('remoteUrl'));
    bus.on('state', draw);
    bus.on('remoteUrl', draw);
    // o script do QR é carregado com "defer" — redesenha quando estiver pronto
    window.addEventListener('load', draw);
}
