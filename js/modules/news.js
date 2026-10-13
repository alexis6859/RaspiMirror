// Notícias rotativas (RSS) e efemérides da Wikipédia.
import { $, bus, esc, swap, timeAgo } from './util.js';

let newsIndex = -1;
let newsTimer = null;

function nextHeadline(config) {
    const items = bus.get('news')?.items || [];
    const module = $('[data-module="news"]');
    if (!items.length || config.modules?.news === false) { module.hidden = true; return; }
    module.hidden = false;

    newsIndex = (newsIndex + 1) % items.length;
    const item = items[newsIndex];
    swap('#news-source', esc(item.source), 400);
    swap('#news-time', item.date ? timeAgo(item.date) : '', 400);
    swap('#news-title', esc(item.title), 400);

    const seconds = Math.max(Number(config.news?.rotateSeconds) || 12, 4);
    const bar = $('#news-bar');
    bar.style.transition = 'none';
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.transition = `width ${seconds}s linear`;
        bar.style.width = '100%';
    }));
    clearTimeout(newsTimer);
    newsTimer = setTimeout(() => nextHeadline(config), seconds * 1000);
}

let otdIndex = -1;
function nextOnThisDay(config) {
    const items = bus.get('onthisday')?.items || [];
    const module = $('[data-module="onthisday"]');
    if (!items.length || config.modules?.onthisday === false) { module.hidden = true; return; }
    module.hidden = false;
    otdIndex = (otdIndex + 1) % items.length;
    const item = items[otdIndex];
    const yearsAgo = new Date().getFullYear() - item.year;
    swap('#otd-year', `· ${item.year} <small>(há ${yearsAgo} anos)</small>`, 500);
    swap('#otd-text', esc(item.text), 500);
}

export function initNews(config) {
    let started = false;
    bus.on('news', () => {
        if (!started) { started = true; nextHeadline(config()); }
    });
    bus.on('onthisday', () => { otdIndex = -1; nextOnThisDay(config()); });
    setInterval(() => nextOnThisDay(config()), 30000);
    return { next: () => nextHeadline(config()) };
}
