// rain.js - Fetches rain data from Open-Meteo API (free, no API key required)

const LAT = -0.6773; // Kisii, Kenya latitude
const LON = 34.7796; // Kisii, Kenya longitude

async function fetchRainData() {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=precipitation&hourly=precipitation&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) {
            console.warn('Rain API fetch failed:', response.status);
            return null;
        }
        const data = await response.json();
        // Open-Meteo precipitation is in mm
        const rainAmount = data.current ? data.current.precipitation : 0;
        return rainAmount; // in mm
    } catch (error) {
        console.warn('Error fetching rain data:', error);
        return null;
    }
}

function updateRainUI(rainAmount) {
    const rainEl = document.getElementById('rain');
    if (rainEl) {
        rainEl.textContent = rainAmount != null ? `${rainAmount}` : 'N/A';
    }
    // Also update the card if present
    if (typeof updateCard === 'function') {
        updateCard('rainfall', rainAmount != null ? `${rainAmount} mm` : 'N/A');
    }
}

// Function to be called periodically or on demand
async function refreshRainData() {
    const rain = await fetchRainData();
    updateRainUI(rain);
}

// Auto-refresh every 10 minutes (600000 ms)
setInterval(refreshRainData, 600000);

// Initial fetch
refreshRainData();