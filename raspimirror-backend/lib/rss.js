// Parser RSS/Atom minimalista (só precisamos de título, link e data).
const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };

function decodeEntities(text) {
    return text
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
        .replace(/&([a-z]+);/gi, (m, name) => NAMED_ENTITIES[name.toLowerCase()] ?? m);
}

function clean(raw = '') {
    const noCdata = raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    return decodeEntities(decodeEntities(noCdata).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
}

function tag(block, name) {
    const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
    return m ? m[1] : '';
}

function parseFeed(xml, source) {
    const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
    return blocks.map((block) => {
        const atomLink = block.match(/<link[^>]*href="([^"]+)"/i);
        const date = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
        const parsed = date ? new Date(clean(date)) : null;
        return {
            title: clean(tag(block, 'title')),
            link: clean(tag(block, 'link')) || (atomLink ? atomLink[1] : ''),
            date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
            source
        };
    }).filter((item) => item.title);
}

module.exports = { parseFeed };
