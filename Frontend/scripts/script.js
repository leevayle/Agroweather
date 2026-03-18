// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = body.getAttribute('data-theme');
        if (currentTheme === 'dark') {
            body.removeAttribute('data-theme');
        } else {
            body.setAttribute('data-theme', 'dark');
        }
    });
}

// Function to fetch data from the API
async function fetchData() {
    try {
        const response = await fetch('http://localhost:3000/api/weather');
        if (response.ok) {
            const data = await response.json();
            // Format timestamp to 12-hour before logging
            // const formattedTime = data.timestamp ? formatTime(data.timestamp) : 'N/A';
            const logData = Object.assign({}, data);
            // console.log('Fetch success Updating UI', logData.timestamp);
            // console.log('Temperature - ', data.temperature,' Humidity - ', data.humidity);
            // Update the UI with the data
            updateUI(data);
        } else {
            console.error('Failed to fetch data:', response.status);
        }
    } catch (error) {
        console.error('Error fetching data:', error);
    }
}

// Function to update the UI
function updateUI(data) {
    // Numeric card placeholders (existing dashboard values)
    const tempEl = document.getElementById('temp');
    if (tempEl) tempEl.textContent = data.temperature ? `${data.temperature}` : 'N/A';

    const humidityEl = document.getElementById('humidity');
    if (humidityEl) humidityEl.textContent = data.humidity ? `${data.humidity}` : 'N/A';

    const rainEl = document.getElementById('rain');
    if (rainEl) rainEl.textContent = data.rainfall ? `${data.rainfall}` : 'N/A';

    // Additional generic card structure (if present in UI)
    updateCard('temperature', data.temperature ? `${data.temperature}°C` : 'N/A');
    updateCard('humidity', data.humidity ? `${data.humidity}%` : 'N/A');
    updateCard('soil-moisture', data.soilMoisture ? `${data.soilMoisture}%` : 'N/A');
    updateCard('rainfall', data.rainfall ? `${data.rainfall} mm` : 'N/A');
    updateCard('wind-speed', data.windSpeed ? `${data.windSpeed} km/h` : 'N/A');
    updateCard('light-intensity', data.lightIntensity ? `${data.lightIntensity} lux` : 'N/A');

    const timeValue = data.timestamp ? formatTime(data.timestamp) : 'N/A';
    updateCard('time', timeValue);

    // Keep latest weather for insights and toggles
    window.latestWeatherData = data;

    // Update prediction panel with simple near-term forecast
    updatePredictions(data);
}

function updateCard(id, value) {
    const card = document.getElementById(id);
    if (card) {
        const p = card.querySelector('p');
        if (p) p.textContent = value;
    }
}

function updatePredictions(data) {
    // Simple prediction insight generation based on weather conditions
    const insights = [];
    const rain = Number(data.rainfall) || 0;
    const temp = Number(data.temperature) || 20;
    const humidity = Number(data.humidity) || 50;

    if (rain > 150) {
        insights.push('Heavy rainfall expected; delay top-dressing and protect seeds from waterlogging.');
    } else if (rain > 60) {
        insights.push('Moderate rain forecast; good time for germination and soil moisture recharge.');
    } else {
        insights.push('Low rainfall; prepare irrigation for the next 48 hours.');
    }

    if (temp > 30) {
        insights.push('High temperature trend; ensure shade management and check evapotranspiration.');
    } else if (temp < 18) {
        insights.push('Cool period; avoid nitrogen fertilizer application until temperatures rise.');
    } else {
        insights.push('Temperature optimal for growth; consider top dressing in 2-3 days.');
    }

    if (humidity > 70) {
        insights.push('High humidity; monitor for fungal disease and consider preventive spraying.');
    } else if (humidity < 40) {
        insights.push('Low humidity; irrigation and mulching recommended to conserve moisture.');
    }

    // Set insight text and optional harvest advice for selected crop.
    const selectedCrop = window.selectedCrop || 'Maize';
    const insightList = document.getElementById('insights-list');
    if (!insightList) return;

    insightList.innerHTML = '';

    const cropItem = document.createElement('li');
    cropItem.textContent = `Crop selected: ${selectedCrop}.`;
    insightList.appendChild(cropItem);

    insights.forEach(text => {
        const item = document.createElement('li');
        item.textContent = text;
        insightList.appendChild(item);
    });

    const cropAdvice = document.createElement('li');
    if (selectedCrop.toLowerCase().includes('maize')) {
        cropAdvice.textContent = 'Maize: check 45-60 day growth stage for top-dress nitrogen; harvest estimate is in 70-90 days.';
    } else if (selectedCrop.toLowerCase().includes('wheat')) {
        cropAdvice.textContent = 'Wheat: apply foliar feed if tillering is steady; harvest window around 100-120 days.';
    } else {
        cropAdvice.textContent = 'Use crop calendar data for your crop and adjust for predicted moisture/temperature.';
    }
    insightList.appendChild(cropAdvice);

    const insightsPanel = document.getElementById('prediction-insights');
    if (insightsPanel && insightsPanel.hidden) {
        insightsPanel.hidden = false;
    }
}


// Convert epoch (seconds or milliseconds) to HH:MM (local time)
function formatTime(ts) {
    if (ts === undefined || ts === null) return 'N/A';
    let t = Number(ts);
    if (Number.isNaN(t)) return 'N/A';
    // If timestamp looks like seconds (10 digits), convert to ms
    if (t < 1e12) t = t * 1000;
    const d = new Date(t);
    if (isNaN(d.getTime())) return 'N/A';
    let hour = d.getHours();
    const minute = String(d.getMinutes()).padStart(2, '0');
    const period = hour >= 12 ? 'pm' : 'am';
    hour = hour % 12 || 12; // convert to 12-hour, with 12 instead of 0
    return `${hour}:${minute}${period}`;
}

// User crop selection state
window.selectedCrop = 'Maize';

function initializeCropWidgets() {
    const cropCards = document.querySelectorAll('.crop-card');
    cropCards.forEach(card => {
        card.addEventListener('click', (e) => {
            if (card.classList.contains('add-crop')) {
                const name = prompt('Add crop name (e.g., Tomato)');
                if (!name) return;
                const newCard = document.createElement('div');
                newCard.className = 'crop-card';
                newCard.dataset.crop = name;
                newCard.innerHTML = `<div class="crop-icon" style="font-size: 14px;color:#A2D200;">🌱</div><div class="crop-name">${name}</div>`;
                card.before(newCard);
                initializeCropWidgets();
                return;
            }
            document.querySelectorAll('.crop-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            window.selectedCrop = card.dataset.crop || 'Maize';
        });
    });

    const seePredictions = document.getElementById('see-predictions');
    if (seePredictions) {
        seePredictions.addEventListener('click', (e) => {
            e.preventDefault();
            const insightsPanel = document.getElementById('prediction-insights');
            if (insightsPanel) {
                insightsPanel.hidden = !insightsPanel.hidden;
            }
            // re-run insight logic with latest data
            if (window.latestWeatherData) {
                updatePredictions(window.latestWeatherData);
            }
        });
    }
}

// Fetch data every 5 seconds
setInterval(fetchData, 5000);

// Initial fetch
fetchData();

initializeCropWidgets();