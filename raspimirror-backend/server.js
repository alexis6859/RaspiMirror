require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_LOCATION = {
    name: 'Leça da Palmeira',
    lat: 41.1862,
    lon: -8.6965
};

const MARINE_LOCATION = {
    ...DEFAULT_LOCATION
};

app.use(cors());
app.use(express.json());

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return response.json();
}

function getCoordinates(req, fallback = DEFAULT_LOCATION) {
    const lat = req.query.lat ? Number(req.query.lat) : fallback.lat;
    const lon = req.query.lon ? Number(req.query.lon) : fallback.lon;

    return { lat, lon };
}

app.get('/api/health', (_req, res) => {
    res.json({ ok: true, location: DEFAULT_LOCATION.name });
});

app.get('/api/weather', async (req, res) => {
    try {
        const { lat, lon } = getCoordinates(req);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto&forecast_days=3`;
        const data = await fetchJson(url);
        res.json(data);
    } catch (error) {
        console.error('Erro ao chamar a meteorologia:', error);
        res.status(500).json({ erro: 'Erro interno ao obter a meteorologia.' });
    }
});

app.get('/api/forecast', async (req, res) => {
    try {
        const { lat, lon } = getCoordinates(req);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3`;
        const data = await fetchJson(url);

        const list = data.daily?.time?.map((day, index) => ({
            day: new Intl.DateTimeFormat('pt-PT', { weekday: 'short' }).format(new Date(day)),
            weather_code: data.daily.weather_code[index],
            temp_max: data.daily.temperature_2m_max[index],
            temp_min: data.daily.temperature_2m_min[index]
        })) ?? [];

        res.json(list);
    } catch (error) {
        console.error('Erro ao chamar a previsão:', error);
        res.status(500).json({ erro: 'Erro interno ao obter a previsão.' });
    }
});

app.get('/api/marine', async (req, res) => {
    try {
        const { lat, lon } = getCoordinates(req, MARINE_LOCATION);
        const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,wind_wave_height,wind_speed_10m&timezone=auto`;
        const data = await fetchJson(url);
        res.json(data);
    } catch (error) {
        console.error('Erro ao chamar a previsão do mar:', error);
        res.status(500).json({ erro: 'Erro interno ao buscar o mar.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor do RaspiMirror a correr na porta ${PORT}`);
    console.log(`📍 Local por defeito: ${DEFAULT_LOCATION.name} (${DEFAULT_LOCATION.lat}, ${DEFAULT_LOCATION.lon})`);
});