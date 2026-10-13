// Feriados nacionais portugueses (fixos + móveis calculados a partir da Páscoa).
function easterSunday(year) {
    // Algoritmo de Meeus/Jones/Butcher
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function holidaysFor(year) {
    const easter = easterSunday(year);
    const fixed = [
        [1, 1, 'Ano Novo'],
        [4, 25, 'Dia da Liberdade'],
        [5, 1, 'Dia do Trabalhador'],
        [6, 10, 'Dia de Portugal'],
        [8, 15, 'Assunção de Nossa Senhora'],
        [10, 5, 'Implantação da República'],
        [11, 1, 'Dia de Todos os Santos'],
        [12, 1, 'Restauração da Independência'],
        [12, 8, 'Imaculada Conceição'],
        [12, 25, 'Natal']
    ].map(([m, d, title]) => ({ date: new Date(year, m - 1, d), title }));

    const movable = [
        { date: addDays(easter, -47), title: 'Carnaval', optional: true },
        { date: addDays(easter, -2), title: 'Sexta-feira Santa' },
        { date: easter, title: 'Páscoa' },
        { date: addDays(easter, 60), title: 'Corpo de Deus' }
    ];

    return [...fixed, ...movable].sort((a, b) => a.date - b.date);
}

module.exports = { holidaysFor, easterSunday };
