// Firebase config (Realtime Database)
// Using compat library to support classic API style in plain script.
const firebaseConfig = {
  apiKey: "AIzaSyDHdWWlPCljHyxPhjn7v0m8kFbD-aIa7NE",
  authDomain: "agroweather-a1637.firebaseapp.com",
  databaseURL: "https://agroweather-a1637-default-rtdb.firebaseio.com",
  projectId: "agroweather-a1637",
  storageBucket: "agroweather-a1637.firebasestorage.app",
  messagingSenderId: "899277360166",
  appId: "1:899277360166:web:2dfac3e83b552a709feae7",
  measurementId: "G-MQ3VZTK1P8"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// Expose database reference for script.js use
window.firebaseDatabase = database;