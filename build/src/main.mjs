import { start } from './app.mjs';
start().catch((e) => { console.error(e); const l = document.getElementById('loading'); if (l) l.innerHTML = '<div style="color:#ff4d4f;max-width:520px">Startup failed: ' + String(e && e.message || e) + '</div>'; });
