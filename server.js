require('dotenv').config();
const path = require('path');
const express = require('express');

const queueRoutes = require('./src/routes/queue');
const catalogRoutes = require('./src/routes/catalog');
const barberRoutes = require('./src/routes/barbers');
const settingsRoutes = require('./src/routes/settings');
const requireAdmin = require('./src/middleware/auth');
const { startNotifyJob } = require('./src/cron/notify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/queue', queueRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/settings', settingsRoutes);

// Vérification du mot de passe depuis l'écran de connexion du dashboard
app.post('/api/login', requireAdmin, (req, res) => res.json({ ok: true }));

app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Raccourcis de navigation
app.get('/', (req, res) => res.redirect('/kiosk.html'));

app.listen(PORT, () => {
  console.log('Serveur démarré sur le port ' + PORT);
  startNotifyJob();
});
