// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDHdWWlPCljHyxPhjn7v0m8kFbD-aIa7NE",
  authDomain: "agroweather-a1637.firebaseapp.com",
  projectId: "agroweather-a1637",
  storageBucket: "agroweather-a1637.firebasestorage.app",
  messagingSenderId: "899277360166",
  appId: "1:899277360166:web:2dfac3e83b552a709feae7",
  measurementId: "G-MQ3VZTK1P8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);