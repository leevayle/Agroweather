// Theme toggle functionality
const themeToggle = document.getElementById('theme-toggle');
const body = document.body;

themeToggle.addEventListener('click', () => {
    const currentTheme = body.getAttribute('data-theme');
    if (currentTheme === 'dark') {
        body.removeAttribute('data-theme');
    } else {
        body.setAttribute('data-theme', 'dark');
    }
});

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
    updateCard('temperature', data.temperature ? `${data.temperature}°C` : 'N/A');
    updateCard('humidity', data.humidity ? `${data.humidity}%` : 'N/A');
    updateCard('soil-moisture', data.soilMoisture ? `${data.soilMoisture}%` : 'N/A');
    updateCard('rainfall', data.rainfall ? `${data.rainfall} mm` : 'N/A');
    updateCard('wind-speed', data.windSpeed ? `${data.windSpeed} km/h` : 'N/A');
    updateCard('light-intensity', data.lightIntensity ? `${data.lightIntensity} lux` : 'N/A');
    // Format and show timestamp (expects milliseconds since epoch)
    const timeValue = data.timestamp ? formatTime(data.timestamp) : 'N/A';
    updateCard('time', timeValue);
}

function updateCard(id, value) {
    const card = document.getElementById(id);
    if (card) {
        card.querySelector('p').textContent = value;
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

// Fetch data every 5 seconds
setInterval(fetchData, 5000);

// Initial fetch
fetchData();