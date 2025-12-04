//config.js is  a pointer to the backend for your frontend fetch requests.
// If running in Electron, window.API_BASE can be set dynamically
// Lives in the frontend (Electron renderer / browser).
// Its purpose: tell the frontend where the backend API is.

const API_BASE = window.API_BASE || 'http://localhost:3001';


// Export it if using modules
export { API_BASE };