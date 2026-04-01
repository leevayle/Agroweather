/**
 * WeatherLog Utility - Isolated logging and error management
 */
const WeatherLog = {
    info: (msg, data = '') => {
        console.log(`%c[AgroWeather INFO] ${new Date().toLocaleTimeString()}: ${msg}`, 'color: #62B244; font-weight: bold;', data);
    },
    warn: (msg, data = '') => {
        console.warn(`[AgroWeather WARN] ${new Date().toLocaleTimeString()}: ${msg}`, data);
    },
    error: (msg, err = '') => {
        console.error(`%c[AgroWeather ERROR] ${new Date().toLocaleTimeString()}: ${msg}`, 'color: #ff4d4d; font-weight: bold;', err);
        // Global error state could be hooked here to show a "Sensor Offline" badge in UI
    },
    safe: (fn, context = 'Unknown Context') => {
        try {
            return fn();
        } catch (e) {
            WeatherLog.error(`Execution failed in ${context}`, e);
        }
    }
};
window.WeatherLog = WeatherLog;