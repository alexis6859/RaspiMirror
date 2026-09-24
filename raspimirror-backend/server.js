require('dotenv').config({'path': '../.env'});
const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/api/weather', async (req, res) => {
    try {
        const lat = req.query.lat;
        const lon = req.query.lon;

        if (!lat || !lon) {
            return res.status(400).json({ erro: 'Latitude e Longitude são obrigatórias.' });
        }

        const API_KEY = process.env.WEATHER_API_KEY;

        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&lang=pt&appid=${API_KEY}`;
        const ans = await fetch(url);
        const data = await ans.json();

        res.json(data);
    } catch (error) {
        console.error('Erro ao chamar o OpenWeatherMap:', error);
        res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor do RaspiMirror a correr na porta ${PORT}`);
});