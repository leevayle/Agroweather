const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const CROPS_FILE = path.join(__dirname, 'crops.json');
const AUTH_FILE = path.join(__dirname, 'auth.json');
const KB_FILE = path.join(__dirname, 'knowledgebase.json');

function readKB() {
  try {
    return JSON.parse(fs.readFileSync(KB_FILE));
  } catch (e) { return {}; }
}

function writeKB(data) {
  try {
    fs.writeFileSync(KB_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error("KB write error:", e); }
}

// Initialize auth.json if it doesn't exist
if (!fs.existsSync(AUTH_FILE)) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify([], null, 2));
}

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE));
  } catch (e) { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(users, null, 2));
}

// Initialize crops.json with default data if it doesn't exist
if (!fs.existsSync(CROPS_FILE)) {
  fs.writeFileSync(CROPS_FILE, JSON.stringify({}, null, 2));
}

function readCrops() {
  try {
    const data = JSON.parse(fs.readFileSync(CROPS_FILE));
    // If data is the old array format, convert it to an object to support per-user storage
    return Array.isArray(data) ? {} : data;
  } catch (e) { return {}; }
}

function writeCrops(crops) {
  fs.writeFileSync(CROPS_FILE, JSON.stringify(crops, null, 2));
}

// Initialize Express and Middleware
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --- Auth Routes ---

// Initialize Firebase Admin (Required for Weather routes)
const serviceAccount = require('./firebase_account_keys.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://agroweather-a1637-default-rtdb.firebaseio.com/'
});

const db = admin.database();

/**
 * Registers a new user and saves to auth.json
 */
app.post('/api/auth/signup', (req, res) => {
  try {
    const { username, email, phone, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const users = readUsers();

    // Check for existing user
  if (users.find(u => u.username === username || u.email === email)) {
    return res.status(400).json({ error: 'User already exists' });
  }

  const newUser = {
    _id: Date.now().toString(), // MongoDB-like string ID
    username,
    email,
    phone,
    password, // In a real app, hash this!
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeUsers(users);
  res.status(201).json({ message: 'User created successfully', user: { username, _id: newUser._id } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

/**
 * Validates user credentials
 */
app.post('/api/auth/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Identifier and password are required' });
    }
    const users = readUsers();

    // Identifier can be username, email, or phone
    const user = users.find(u => 
      (u.username === identifier || u.email === identifier || u.phone === identifier) && 
      u.password === password
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    res.json({ message: 'Login successful', user: { username: user.username, _id: user._id } });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// --- API Routes ---

// GET knowledgebase
app.get('/api/knowledgebase', (req, res) => {
  res.json(readKB());
});

// GET crops for a specific user
app.get('/api/crops/:userId', (req, res) => {
  const allCrops = readCrops();
  const userCrops = allCrops[req.params.userId] || [];
  res.json(userCrops);
});

// ADD a crop for a specific user
app.post('/api/crops/:userId', (req, res) => {
  const allCrops = readCrops();
  const userId = req.params.userId;
  
  if (!allCrops[userId]) allCrops[userId] = [];
  
  const newCrop = { ...req.body, id: Date.now().toString() };
  allCrops[userId].push(newCrop);

  // Feature in knowledgebase: if it's a new crop name, add a default template
  const kb = readKB();
  const cropKey = newCrop.name.toLowerCase();
  if (!kb[cropKey]) {
    kb[cropKey] = {
      totalDays: 90,
      idealTemp: [20, 30],
      idealHum: [50, 80],
      stages: [{ d: 90, n: "Growth", msg: "Standard care instructions." }]
    };
    writeKB(kb);
  }
  
  writeCrops(allCrops);
  res.status(201).json(req.body);
});

// DELETE a specific crop for a user
app.delete('/api/crops/:userId/:name', (req, res) => {
  const allCrops = readCrops();
  const userId = req.params.userId;
  
  if (allCrops[userId]) {
    allCrops[userId] = allCrops[userId].filter(c => c.name !== req.params.name);
    writeCrops(allCrops);
  }
  res.status(200).send();
});

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

// --- Static File Serving ---
// This must come AFTER API routes to prevent shadowing
app.use(express.static(path.join(__dirname, '../Frontend')));

// Diagnostic: Log any 404s that hit the server
app.use((req, res) => {
  console.warn(`404 Not Found: ${req.method} ${req.url}`);
  res.status(404).send("Route not found on server.");
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});