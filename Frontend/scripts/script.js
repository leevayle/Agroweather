// Redirect to auth if not logged in
const userData = localStorage.getItem('agroweather_user') || sessionStorage.getItem('agroweather_user');
let currentUser = null;

if (!userData) {
    window.location.href = 'auth.html';
} else {
    try {
        currentUser = JSON.parse(userData);
        const userEl = document.querySelector('.user');
        if (userEl) {
            userEl.textContent = currentUser.username || "User";
        }
    } catch (e) {
        console.error("Session corrupted");
        window.location.href = 'auth.html';
    }
}

// Global history array for trend estimation and historical data tracking
window.weatherHistory = [];
window.cropKnowledgeBase = {};

window.logout = () => {
    localStorage.removeItem('agroweather_user');
    sessionStorage.removeItem('agroweather_user');
    window.location.href = 'auth.html';
};

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

// Function to fetch data from REST API (fallback)
async function fetchData() {
    try {
        const response = await fetch('http://localhost:3000/api/weather');
        if (response.ok) {
            const data = await response.json();
            updateUI(data);
        }
    } catch (error) {
        console.warn('REST fetch failed; falling back to Firebase realtime:', error);
    }
}

async function fetchKnowledgeBase() {
    try {
        const response = await fetch('http://localhost:3000/api/knowledgebase');
        if (response.ok) {
            window.cropKnowledgeBase = await response.json();
            console.log("Knowledge base loaded successfully.");
        }
    } catch (e) {
        console.warn("Could not load knowledge base", e);
    }
}

// Use Firebase Realtime Database to continuously receive live sensor data
function enableFirebaseListener() {
    if (!window.firebaseDatabase) {
        console.error('Firebase database not available');
        return;
    }

    const rootRef = window.firebaseDatabase.ref('/');
    rootRef.on('value', (snapshot) => {
        const value = snapshot.val();
        if (!value) return;

        // Process sensorData sub-node where hardware usually pushes data
        const dataToProcess = value.sensorData || value;
        const latest = getLatestWeatherEntry(dataToProcess);
        if (!latest) return;

        // Maintain a local history buffer for linear trend forecasting
        if (!Array.isArray(window.weatherHistory)) {
            window.weatherHistory = [];
        }
        window.weatherHistory.push(latest);
        if (window.weatherHistory.length > 200) window.weatherHistory.shift();

        // Attempt to fetch 1-hour-old data from Firebase if not in local history
        checkAndFetchPreviousData(latest);

        updateUI(latest);
    }, (err) => {
        console.error('Firebase listener error:', err);
    });
}

function getLatestWeatherEntry(payload) {
    if (Array.isArray(payload)) {
        payload = payload.reduce((best, item) => {
            if (!item || !item.timestamp) return best;
            if (!best || item.timestamp > best.timestamp) return item;
            return best;
        }, null);
        return payload;
    }

    const entries = Object.entries(payload)
        .map(([key, value]) => ({ key, ...value }))
        .filter(item => item && item.timestamp && (item.temperature !== undefined || item.temperature !== null));

    if (!entries.length) return null;

    entries.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
    return entries[entries.length - 1];
}

function findClosestHistoryEntry(targetTimestampMs) {
    if (!Array.isArray(window.weatherHistory) || !window.weatherHistory.length) return null;

    let closest = null;
    let bestDelta = Number.POSITIVE_INFINITY;

    for (const item of window.weatherHistory) {
        if (!item || item.timestamp == null) continue;
        let ts = Number(item.timestamp);
        if (Number.isNaN(ts)) continue;
        if (ts < 1e12) ts *= 1000;

        const delta = Math.abs(ts - targetTimestampMs);
        if (delta < bestDelta) {
            bestDelta = delta;
            closest = item;
        }
    }

    return closest;
}

/**
 * Fetches a single record from the database closest to 1 hour prior to the latest timestamp.
 */
async function checkAndFetchPreviousData(latest) {
    if (!latest || !latest.timestamp) return;
    
    // If we already have a previous entry in history, no need to fetch
    if (getPreviousHourEntry(latest)) return;

    // Fallback to Firestore (Firebase RTDB) to find data from approx 1 hour ago
    const latestTs = toFirebaseTimestampMs(latest.timestamp);
    const targetTs = latestTs - (60 * 60 * 1000);
    try {
        const snapshot = await window.firebaseDatabase.ref('sensorData')
            .orderByChild('timestamp')
            .endAt(targetTs)
            .limitToLast(1)
            .once('value');

        const val = snapshot.val();
        if (val) {
            const entry = Object.values(val)[0];
            // Add to local history so getPreviousHourEntry finds it
            window.weatherHistory.unshift(entry);
            updateUI(latest); // Refresh UI with the newly found historical data
        }
    } catch (e) {
        console.warn("Could not fetch historical data from Firebase:", e);
    }
}

function getPreviousHourEntry(latest) {
    if (!latest || latest.timestamp == null) return null;

    const latestTs = toFirebaseTimestampMs(latest.timestamp);
    const targetTs = latestTs - (60 * 60 * 1000);

    const candidate = findClosestHistoryEntry(targetTs);
    if (!candidate || candidate.timestamp == null) return null;

    let candidateTs = Number(candidate.timestamp);
    if (candidateTs < 1e12) candidateTs *= 1000;

    // require reasonably close match (<= 45 minutes) to avoid stale mismatch
    if (Math.abs(candidateTs - targetTs) > 45 * 60 * 1000) {
        return null;
    }

    return candidate;
}

function toFirebaseTimestampMs(ts) {
    if (ts == null) return null;
    let ms = Number(ts);
    if (Number.isNaN(ms)) return null;
    if (ms < 1e12) ms *= 1000;
    return ms;
}

function generateNextHourForecast(latest, previous) {
    if (!latest || latest.temperature == null) return null;

    const currentTemp = Number(latest.temperature);
    const currentHumidity = latest.humidity != null ? Number(latest.humidity) : null;
    const currentRain = latest.rainfall != null ? Number(latest.rainfall) : null;

    let forecastTemp = currentTemp;
    let forecastHumidity = currentHumidity;
    let forecastRain = currentRain;

    // If previous data is available, calculate a simple linear trend.
    // Otherwise, assume current conditions persist for the next hour.
    if (previous && previous.temperature != null) {
        const deltaTemp = currentTemp - Number(previous.temperature);
        forecastTemp = Number((currentTemp + deltaTemp).toFixed(1));

        if (currentHumidity != null && previous.humidity != null) {
            const deltaHumidity = currentHumidity - Number(previous.humidity);
            // Ensure humidity stays within 0-100 range
            forecastHumidity = Number(Math.max(0, Math.min(100, currentHumidity + deltaHumidity)).toFixed(0));
        } else if (currentHumidity != null) {
            // If previous humidity is not available, assume current humidity persists
            forecastHumidity = currentHumidity;

        }

        if (currentRain != null && previous.rainfall != null) {
            const deltaRain = currentRain - Number(previous.rainfall);
            forecastRain = Number(Math.max(0, currentRain + deltaRain).toFixed(1));
        }
    }
    // Handle cases where latest.timestamp might be invalid
    let predictionTs = Number(latest.timestamp);
    if (!predictionTs || isNaN(predictionTs)) {
        // Fallback to current time + 1 hour if timestamp is invalid
        predictionTs = Date.now();
    } else if (predictionTs < 1e12) { // Convert seconds to milliseconds if needed
        predictionTs *= 1000;
    }
    
    const finalPredictionTs = predictionTs + (60 * 60 * 1000);

    return {
        timestamp: finalPredictionTs,
        temperature: forecastTemp,
        humidity: forecastHumidity,
        rainfall: forecastRain
    };
}

function setTileText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function setTileIcon(id, src) {
    const img = document.getElementById(id);
    if (img) img.src = src;
}

function getDayPhase(timestamp) {
    if (!timestamp) return 'day';
    let ms = Number(timestamp);
    if (Number.isNaN(ms)) return 'day';
    if (ms < 1e12) ms *= 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return 'day';
    const h = d.getHours();
    if (h >= 6 && h < 18) return 'day';
    return 'night';
}

function getIconPathForPhase(phase) {
    if (phase !== 'day' && phase !== 'night') phase = 'day';
    return `images/icons/${phase}/01.png`;
}

// Function to update the UI
function updateUI(data) {
    // Numeric card placeholders (existing dashboard values)
    const tempEl = document.getElementById('temp');
    if (tempEl) {
        tempEl.textContent = data.temperature != null ? `${data.temperature}` : 'N/A';
    }

    const humidityEl = document.getElementById('humidity');
    if (humidityEl) {
        humidityEl.textContent = data.humidity != null ? `${data.humidity}` : 'N/A';
    }

    const locationEl = document.getElementById('location-text');
    if (locationEl && data.location) {
        locationEl.textContent = data.location;
    }

    // Rain data now handled by rain.js from API
    // const rainEl = document.getElementById('rain');
    // if (rainEl) rainEl.textContent = data.rainfall ? `${data.rainfall}` : 'N/A';

    // Additional generic card structure (if present in UI)
    updateCard('temperature', data.temperature != null ? `${data.temperature}°C` : 'N/A');
    updateCard('humidity', data.humidity != null ? `${data.humidity}%` : 'N/A');
    updateCard('soil-moisture', data.soilMoisture != null ? `${data.soilMoisture}%` : 'N/A');
    // updateCard('rainfall', data.rainfall ? `${data.rainfall} mm` : 'N/A'); // Now handled by rain.js
    updateCard('wind-speed', data.windSpeed != null ? `${data.windSpeed} km/h` : 'N/A');
    updateCard('light-intensity', data.lightIntensity != null ? `${data.lightIntensity} lux` : 'N/A');

    // Current (blue) tile
    const currentTemp = data.temperature != null ? `${data.temperature}°` : 'N/A';
    const currentTime = data.timestamp ? formatTime(data.timestamp) : 'N/A';
    setTileText('temp-now', currentTemp);
    setTileText('current-time', currentTime);

    // Resolve icon phase for each reference
    const currentPhase = getDayPhase(data.timestamp);
    const currentIcon = getIconPathForPhase(currentPhase);
    setTileIcon('current-icon', currentIcon);
    setTileIcon('main-icon', currentIcon);

    // Previous hour data from local history
    const previousEntryLocal = getPreviousHourEntry(data);
    if (previousEntryLocal) {
        setTileText('prev-temp', `${previousEntryLocal.temperature}°`);
        setTileText('prev-time', formatTime(previousEntryLocal.timestamp));
        setTileIcon('prev-icon', getIconPathForPhase(getDayPhase(previousEntryLocal.timestamp)));
    } else {
        setTileText('prev-temp', 'N/A');
        setTileText('prev-time', 'No previous data');
        setTileIcon('prev-icon', getIconPathForPhase('neither'));
    }

    // Next hour forecast (simple trend-based if historical data available)
    const nextForecast = generateNextHourForecast(data, previousEntryLocal);
    const nextTemp = (nextForecast && nextForecast.temperature != null) ? `${nextForecast.temperature}°` : 'N/A';
    const nextTime = (nextForecast && nextForecast.timestamp) ? formatTime(nextForecast.timestamp) : 'Estimated';
    setTileText('next-temp', nextTemp);
    setTileText('next-time', nextTime);
    const nextPhase = getDayPhase(nextForecast ? nextForecast.timestamp : null);
    setTileIcon('next-icon', getIconPathForPhase(nextPhase));

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
    const insightList = document.getElementById('insights-list');
    if (!insightList) return;

    // Merge rainfall data from rain.js into the data object if available
    const rainVal = document.getElementById('rain')?.textContent;
    const currentRain = rainVal && rainVal !== 'N/A' ? Number(rainVal) : (Number(data.rainfall) || 0);

    const selectedCrop = window.selectedCrop || 'Maize';
    const cropKey = selectedCrop.toLowerCase();
    
    const meta = window.cropKnowledgeBase[cropKey] || { totalDays: 90, idealTemp: [20,30], idealHum:[50,80], stages: [{d:90, n:"Growth", msg:"Standard care."}] };
    const temp = Number(data.temperature) || 20;
    const hum = Number(data.humidity) || 50;

    const advice = [];
    const climaticWarnings = [];

    // 1. Lifecycle Tracking
    const selectedCardEl = document.querySelector('.crop-card.selected');
    const plantedDateStr = selectedCardEl ? selectedCardEl.dataset.planted : null;
    
    let currentDay = 0;
    let daysLeft = meta.totalDays;

    if (plantedDateStr) {
        const plantedTs = new Date(plantedDateStr).getTime();
        const nowTs = Date.now();
        currentDay = Math.floor((nowTs - plantedTs) / (1000 * 60 * 60 * 24));
        currentDay = Math.max(0, Math.min(meta.totalDays, currentDay));
        daysLeft = Math.max(0, meta.totalDays - currentDay);
    }

    const currentStage = meta.stages.find(s => s.d >= currentDay) || meta.stages[meta.stages.length - 1];

    // 2. Climatic Rule Engine (AI Logic)
    if (temp > meta.idealTemp[1]) {
        climaticWarnings.push(`<span style="color:#EB8120">⚠️ Heat Stress:</span> Current temp (${temp}°C) is above the ${selectedCrop} limit. Increase mulching.`);
    } else if (temp < meta.idealTemp[0]) {
        climaticWarnings.push(`<span style="color:#3583F1">⚠️ Low Temp:</span> Growth may slow down. Avoid pruning or liquid feeding now.`);
    }

    if (hum > meta.idealHum[1] && temp > 22) {
        climaticWarnings.push(`<span style="color:#EB8120">⚠️ Disease Risk:</span> High humidity/warmth intersection. Risk of fungal blight is elevated.`);
    }

    if (currentRain < 1 && currentDay < meta.totalDays) {
        advice.push(`<strong>Irrigation:</strong> Day ${currentDay} requires soil moisture. Supplement water today.`);
    } else if (currentRain > 40) {
        advice.push(`<strong>Drainage:</strong> High precipitation. Check furrows for stagnant water.`);
    }

    // 3. Stage-Specific Expert Advice
    advice.push(`<strong>Stage (${currentStage.n}):</strong> ${currentStage.msg}`);

    // 4. One Month AI Forecast
    const futureDay = currentDay + 30;
    let futureInsight = "";
    if (futureDay >= meta.totalDays) {
        futureInsight = `<strong>1-Month Outlook:</strong> Harvest window opens! Prepare storage and labor.`;
    } else {
        const futureStage = meta.stages.find(s => s.d >= futureDay) || meta.stages[meta.stages.length - 1];
        futureInsight = `<strong>1-Month Outlook:</strong> Will enter <em>${futureStage.n}</em>. Prepare for: ${futureStage.msg}`;
    }

    insightList.innerHTML = '';
    
    // Header info
    const statusLi = document.createElement('li');
    statusLi.style.listStyle = 'none';
    statusLi.style.marginBottom = '10px';
    statusLi.innerHTML = `
        <div style="background: rgba(98, 178, 68, 0.1); padding: 10px; border-radius: 8px; border-left: 4px solid var(--accent1);">
            <div style="color:var(--accent1); font-family:poppins-b;">${selectedCrop} - Day ${currentDay}</div>
            <div style="font-size: 0.85rem;">Estimated ${daysLeft} days until harvest projection.</div>
        </div>
    `;
    insightList.appendChild(statusLi);

    // Display Warnings
    climaticWarnings.forEach(text => {
        const li = document.createElement('li');
        li.style.listStyle = 'none';
        li.style.fontSize = '0.9rem';
        li.style.marginBottom = '5px';
        li.innerHTML = text;
        insightList.appendChild(li);
    });

    // Actionable Advice
    [...advice, futureInsight].forEach(text => {
        const li = document.createElement('li');
        li.innerHTML = text;
        insightList.appendChild(li);
    });
}

function computeReadinessMessage(selectedCrop, history = []) {
    const daysForCrop = {
        maize: 90,
        wheat: 110,
        'kidney beans': 80,
        sunflower: 85,
        'irish potatoes': 100
    };

    const cropKey = (selectedCrop || '').toLowerCase();
    const cropDays = daysForCrop[cropKey] || 90;

    if (!history.length) {
        return 'No weather history available yet to estimate crop readiness.';
    }

    const degDayBase = history.reduce((acc, item, i) => {
        if (!item || item.temperature == null) return acc;
        const currentTemp = Number(item.temperature);
        const degree = Math.max(0, currentTemp - 10);
        return acc + degree;
    }, 0);

    const averageDegree = degDayBase / history.length;
    const percentComplete = Math.min(100, Math.round((averageDegree / 20) * 100));
    const daysLeft = Math.max(0, Math.round(cropDays - (cropDays * (percentComplete / 100))));

    return `Estimated readiness: ${percentComplete}% complete for ${selectedCrop} (approx. ${daysLeft} days to harvest).`;
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

async function fetchCrops() {
    if (!currentUser?._id) return;
    try {
        const response = await fetch(`http://localhost:3000/api/crops/${currentUser._id}`);
        if (response.ok) {
            const crops = await response.json();
            renderCrops(crops);
        }
    } catch (e) {
        console.warn("Failed to fetch crops", e);
    }
}

function renderCrops(crops) {
    const container = document.getElementById('predictions-cards');
    const addCard = document.getElementById('add-crop-card');
    if (!container || !addCard) return;

    // Remove old crop cards (everything except addCard)
    const oldCards = container.querySelectorAll('.crop-card:not(.add-crop)');
    oldCards.forEach(c => c.remove());

    crops.forEach(crop => {
        const card = document.createElement('div');
        card.className = `crop-card ${window.selectedCrop === crop.name ? 'selected' : ''}`;
        card.dataset.crop = crop.name;
        card.dataset.planted = crop.plantedDate || '';
        
        // Show image if available, otherwise show first letter
        const imageHtml = crop.image 
            ? `<img src="${crop.image}" alt="${crop.name}" class="crop-icon">`
            : `<div class="crop-initial">${crop.name.charAt(0)}</div>`;

        card.innerHTML = `
            <button class="delete-crop" data-crop="${crop.name}">&times;</button>
            ${imageHtml}
            <div class="crop-name">${crop.name}</div>
        `;
        
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('delete-crop')) {
                deleteCrop(crop.name);
                return;
            }
            document.querySelectorAll('.crop-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            window.selectedCrop = crop.name;
            if (window.latestWeatherData) updatePredictions(window.latestWeatherData);
        });

        addCard.before(card);
    });
}

async function deleteCrop(name) {
    if (!currentUser?._id) return;
    if (!confirm(`Delete ${name}?`)) return;
    try {
        await fetch(`http://localhost:3000/api/crops/${currentUser._id}/${encodeURIComponent(name)}`, { method: 'DELETE' });
        fetchCrops();
    } catch (e) { console.error(e); }
}

function initializeCropWidgets() {
    const addCard = document.getElementById('add-crop-card');
    const modal = document.getElementById('crop-modal');
    const closeBtn = document.getElementById('close-modal');
    const form = document.getElementById('add-crop-form');

    if (addCard && modal) {
        addCard.onclick = () => modal.classList.add('active');
    }
    if (closeBtn && modal) {
        closeBtn.onclick = () => modal.classList.remove('active');
    }

    if (form && modal) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const name = document.getElementById('modal-crop-name').value;
            const plantedDate = document.getElementById('modal-crop-date').value;
            const imageFile = document.getElementById('modal-crop-image').files[0];
            
            let imageData = "";
            
            // If a file was selected, convert it to Base64 to store in our JSON DB
            if (imageFile) {
                imageData = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target.result);
                    reader.readAsDataURL(imageFile);
                });
            }

            if (!currentUser?._id) return;

            try {
                await fetch(`http://localhost:3000/api/crops/${currentUser._id}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, image: imageData, plantedDate })
                });
                modal.classList.remove('active');
                form.reset();
                fetchCrops();
            } catch (err) { console.error(err); }
        };
    }

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

// Fetch data every 5 seconds from local API (fallback)
setInterval(fetchData, 5000);

// Initial fetch
fetchData();

// Load knowledge base from backend
fetchKnowledgeBase();

// Start Firebase realtime listener immediately (preferred source)
enableFirebaseListener();

initializeCropWidgets();

// Load crops from backend
fetchCrops();