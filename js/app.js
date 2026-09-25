function Location() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Your browser does not support geolocation."));
        } else {
            navigator.geolocation.getCurrentPosition(resolve, reject);
        }
    });
}

async function getWeather() {
    try {
        const position = await Location();
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        const response = await fetch(`http://localhost:3000/api/weather?lat=${lat}&lon=${lon}`);
        const data = await response.json();

        console.log(data);
        document.getElementById('city-name').innerText = data.name;
        document.getElementById('temp').innerText = `Temperatura: ${Math.round(data.main.temp)}°C`;
        document.getElementById('desc').innerText = `Clima: ${data.weather[0].description}`;
        document.getElementById('humidity').innerText = `Humidade: ${data.main.humidity}%`;
        document.getElementById('feels-like').innerText = `Sensação térmica: ${Math.round(data.main.feels_like)}°C`;
        
    } catch (error) {
        console.error("Error obtaining weather data:", error);
    }
}

getWeather();