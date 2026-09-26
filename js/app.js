const DEFAULT_LOCATION = {
    name: 'Leça da Palmeira',
    lat: 41.1862,
    lon: -8.6965
};

const MARINE_LOCATION = {
    ...DEFAULT_LOCATION
};

const weatherCodeMap = {
    0: { label: 'céu limpo', icon: '☀️' },
    1: { label: 'principalmente limpo', icon: '🌤️' },
    2: { label: 'nuvens dispersas', icon: '⛅' },
    3: { label: 'céu encoberto', icon: '☁️' },
    45: { label: 'névoa', icon: '🌫️' },
    48: { label: 'neblina', icon: '🌫️' },
    51: { label: 'chuvisco leve', icon: '🌦️' },
    53: { label: 'chuvisco moderado', icon: '🌦️' },
    55: { label: 'chuvisco forte', icon: '🌧️' },
    56: { label: 'geada leve', icon: '🌧️' },
    57: { label: 'geada forte', icon: '🌧️' },
    61: { label: 'chuva leve', icon: '🌦️' },
    63: { label: 'chuva moderada', icon: '🌧️' },
    65: { label: 'chuva forte', icon: '🌧️' },
    66: { label: 'chuva gelada', icon: '🌧️' },
    67: { label: 'chuva gelada forte', icon: '🌧️' },
    71: { label: 'neve leve', icon: '❄️' },
    73: { label: 'neve moderada', icon: '❄️' },
    75: { label: 'neve forte', icon: '❄️' },
    77: { label: 'granizo', icon: '🌨️' },
    80: { label: 'chuva fraca', icon: '🌦️' },
    81: { label: 'chuva forte', icon: '🌧️' },
    82: { label: 'chuva muito forte', icon: '⛈️' },
    85: { label: 'neve leve', icon: '🌨️' },
    86: { label: 'neve forte', icon: '🌨️' },
    95: { label: 'trovoada', icon: '⛈️' },
    96: { label: 'trovoada com granizo', icon: '⛈️' },
    99: { label: 'trovoada intensa', icon: '⛈️' }
};

function resolveLocation() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(DEFAULT_LOCATION);
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => resolve({
                name: DEFAULT_LOCATION.name,
                lat: position.coords.latitude,
                lon: position.coords.longitude
            }),
            () => resolve(DEFAULT_LOCATION)
        );
    });
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString('pt-PT', {
        hour: '2-digit',
        minute: '2-digit'
    });
    const date = now.toLocaleDateString('pt-PT', {
        weekday: 'long',
        day: '2-digit',
        month: 'long'
    });

    document.getElementById('clock').textContent = time;
    document.getElementById('date').textContent = date;
}

function renderForecast(items) {
    const cards = document.querySelectorAll('.forecast-item');

    cards.forEach((card, index) => {
        const dayInfo = items[index];

        if (!dayInfo) {
            card.style.display = 'none';
            return;
        }

        const day = card.querySelector('.forecast-day');
        const icon = card.querySelector('.forecast-icon');
        const temp = card.querySelector('.forecast-temp');

        const code = Number(dayInfo.weather_code ?? 0);
        const detail = weatherCodeMap[code] || { label: 'tempo variável', icon: '🌤️' };

        day.textContent = dayInfo.day || 'Próximo';
        icon.textContent = detail.icon;
        temp.textContent = `${Math.round(dayInfo.temp_max)}° / ${Math.round(dayInfo.temp_min)}°`;
    });
}

function renderMarine(data) {
    const sea = data?.hourly;
    if (!sea) return;

    const wave = Number(sea.wave_height?.[0] ?? 0);
    const avgWind = Number(sea.wind_speed_10m?.[0] ?? 0);
    const state = wave < 0.5 ? 'Calmo' : wave < 1.5 ? 'Aconchegante' : wave < 2.5 ? 'Agitado' : 'Muito agitado';

    document.getElementById('sea-wave').textContent = `${wave.toFixed(1)} m`;
    document.getElementById('sea-wind').textContent = `${Math.round(avgWind)} km/h`;
    document.getElementById('sea-state').textContent = state;
}

async function readJsonResponse(response) {
    const text = await response.text();
    if (!text || !text.trim()) {
        return {};
    }

    const trimmed = text.trim();
    if (trimmed.startsWith('<')) {
        throw new Error('A API respondeu com HTML em vez de JSON. Confirma se o backend está a correr em localhost:3000.');
    }

    return JSON.parse(trimmed);
}

function getLocalMemory() {
    try {
        return JSON.parse(localStorage.getItem('weatherAssistantMemory') || '[]');
    } catch {
        return [];
    }
}

function saveLocalMemory(memory) {
    localStorage.setItem('weatherAssistantMemory', JSON.stringify(memory.slice(-6)));
}

function generateAssistantReply(weatherLabel, temperature, city, seaState) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

    const outfit = temperature >= 28 ? 'leva roupa leve e hidrata-te.' : temperature >= 18 ? 'fica confortável e podes sair sem stress.' : 'aproveita uma camada extra.';
    const seaTip = seaState === 'Calmo' ? 'o mar está tranquilo para desfrutares da costa.' : seaState === 'Aconchegante' ? 'o mar está agradável para um passeio.' : 'o mar está mais agitado, vale a pena moderar a saída.';

    return `${greeting}! Em ${city}, o tempo está ${weatherLabel} com ${Math.round(temperature)}°C. ${outfit} O mar está ${seaState.toLowerCase()} — ${seaTip}`;
}

async function askLocalOllama(prompt) {
    try {
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama3.2',
                prompt,
                stream: false
            })
        });

        if (!response.ok) {
            throw new Error('Ollama não está disponível');
        }

        const data = await readJsonResponse(response);
        return data.response || 'Não consegui responder agora.';
    } catch {
        return null;
    }
}

function handleAssistantInput() {
    const input = document.getElementById('assistant-input');
    const output = document.getElementById('assistant-output');
    const question = input.value.trim();

    if (!question) {
        output.textContent = 'Podes perguntar: “Vai chover?”, “Que roupa devo levar?” ou “Como está o mar?”';
        return;
    }

    const current = document.getElementById('desc').textContent.toLowerCase();
    const temp = Number(document.getElementById('temp').textContent.replace(/[^0-9.-]/g, '')) || 20;
    const city = document.getElementById('city-name').textContent;
    const seaState = document.getElementById('sea-state').textContent;
    const memory = getLocalMemory();

    const baseContext = `${city} tem ${current.replace('clima:', '').trim()} com ${temp}°C. O mar está ${seaState.toLowerCase()}.`;
    const prompt = `Responde como assistente meteorológico. Mantém respostas curtas, úteis e em português. Contexto: ${baseContext}. Pergunta do utilizador: ${question}`;

    askLocalOllama(prompt).then((reply) => {
        if (reply) {
            memory.push({ question, answer: reply });
            saveLocalMemory(memory);
            output.textContent = reply;
            input.value = '';
            return;
        }

        const lowered = question.toLowerCase();
        let answer = generateAssistantReply(current.replace('clima:', '').trim(), temp, city, seaState);

        if (lowered.includes('chuva') || lowered.includes('rain')) {
            answer = `Pelo que vejo em ${city}, ${current}. Se fores sair, leva guarda-chuva e calçado confortável.`;
        }

        if (lowered.includes('roupa') || lowered.includes('vestir')) {
            answer = temp >= 28 ? 'Hoje está quente, então usa roupa leve e fresca.' : temp >= 18 ? 'Hoje está agradável, com uma camada leve já chega.' : 'Hoje está mais fresco, ideal para uma peça mais quente.';
        }

        if (lowered.includes('mar') || lowered.includes('praia')) {
            answer = `O mar está ${seaState.toLowerCase()} e o estado geral é ${seaState.toLowerCase()}.`;
        }

        memory.push({ question, answer });
        saveLocalMemory(memory);
        output.textContent = answer;
        input.value = '';
    });
}

async function getWeather() {
    try {
        const location = await resolveLocation();
        const hostLat = location.lat;
        const hostLon = location.lon;

        const [weatherResponse, forecastResponse, marineResponse] = await Promise.all([
            fetch(`http://localhost:3000/api/weather?lat=${hostLat}&lon=${hostLon}`),
            fetch(`http://localhost:3000/api/forecast?lat=${hostLat}&lon=${hostLon}`),
            fetch(`http://localhost:3000/api/marine?lat=${MARINE_LOCATION.lat}&lon=${MARINE_LOCATION.lon}`)
        ]);

        const weatherData = await readJsonResponse(weatherResponse);
        const forecastData = await readJsonResponse(forecastResponse);
        const marineData = await readJsonResponse(marineResponse);

        const current = weatherData.current ?? {};
        const code = Number(current.weather_code ?? 0);
        const detail = weatherCodeMap[code] || { label: 'tempo variável', icon: '🌤️' };

        document.getElementById('weather-icon').textContent = detail.icon;
        document.getElementById('temp').textContent = `${Math.round(current.temperature_2m ?? 0)}°C`;
        document.getElementById('desc').textContent = `Clima: ${detail.label}`;
        document.getElementById('humidity').textContent = `${Math.round(current.relative_humidity_2m ?? 0)}%`;
        document.getElementById('feels-like').textContent = `${Math.round(current.apparent_temperature ?? 0)}°C`;
        document.getElementById('wind').textContent = `${Math.round(current.wind_speed_10m ?? 0)} km/h`;
        document.getElementById('city-name').textContent = location.name || 'Localização atual';

        renderForecast(forecastData);
        renderMarine(marineData);

        const assistantOutput = document.getElementById('assistant-output');
        assistantOutput.textContent = generateAssistantReply(detail.label, Number(current.temperature_2m ?? 0), location.name || 'a tua zona', document.getElementById('sea-state').textContent);
    } catch (error) {
        console.error('Erro ao obter a meteorologia:', error);
        document.getElementById('city-name').textContent = DEFAULT_LOCATION.name;
        document.getElementById('assistant-output').textContent = error.message || 'Não foi possível carregar a meteorologia. Tenta novamente em alguns segundos.';
    }
}

updateClock();
setInterval(updateClock, 1000 * 30);
getWeather();

document.getElementById('assistant-btn').addEventListener('click', handleAssistantInput);
document.getElementById('assistant-input').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        handleAssistantInput();
    }
});