const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('./firebase_account_keys.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://agroweather-a1637-default-rtdb.firebaseio.com/'
});

const db = admin.database();
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// POST endpoint for ESP32 to send data 
app.post('/api/data', async (req, res) => {
  try {
    const data = req.body;
    // Add timestamp if not present
    data.timestamp = data.timestamp || Date.now();

    // Save to Realtime Database
    const ref = db.ref('sensorData').push();
    await ref.set(data);
    console.log('');
    console.log('Data received and saved successfully');
    console.log('Temp - ',data.temperature);
    console.log('Humidity - ',data.humidity);
    // Format timestamp to 12-hour h:mm:ssam/pm for logs
    function formatTime12WithSeconds(ts) {
      let t = Number(ts);
      if (Number.isNaN(t)) return 'N/A';
      // If timestamp looks like seconds (10 digits), convert to ms
      if (t < 1e12) t = t * 1000;
      const d = new Date(t);
      if (isNaN(d.getTime())) return 'N/A';
      const hh = d.getHours();
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      const period = hh >= 12 ? 'pm' : 'am';
      const hour12 = hh % 12 || 12;
      return `${hour12}:${mm}:${ss}${period}`;
    }
    console.log('Time - ', formatTime12WithSeconds(data.timestamp));
    console.log('_____');
    res.status(200).send('\n\nData received and saved >>>\n\n___________________________________');
  } catch (error) {
    console.error('Error saving data:', error);
    res.status(500).json({ error: 'Failed to save data_______xxxx' });
  }
});

// GET endpoint for frontend to fetch data
app.get('/api/weather', async (req, res) => {
  try {
    // Fetch the latest data (assuming ordered by key, latest first)
    const snapshot = await db.ref('sensorData').orderByKey().limitToLast(1).once('value');

    if (!snapshot.exists()) {
      return res.status(404).json({ message: 'No data found' });
    }

    const data = snapshot.val();
    const latestKey = Object.keys(data)[0];
    const latestData = data[latestKey];
    res.status(200).json(latestData);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});