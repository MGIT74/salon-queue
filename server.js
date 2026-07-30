const path = require('path');
const fs = require('fs');
const os = require('os');
const dotenv = require('dotenv');

// xCloud réécrit le .env du dépôt à chaque déploiement ET injecte ses
// propres variables via PM2/ecosystem.config.cjs directement dans
// process.env avant même le démarrage de l'app. dotenv.config() classique
// ne remplace jamais une variable déjà définie — donc ces valeurs
// (fausses) gagnaient toujours. On force ici explicitement les valeurs
// d'un fichier externe (hors du dossier du site, jamais touché par les
// déploiements), qui doit donc toujours avoir le dernier mot.
const externalEnvPath = path.join(os.homedir(), '.env.salon-queue');
if (fs.existsSync(externalEnvPath)) {
  const forced = dotenv.parse(fs.readFileSync(externalEnvPath));
  Object.keys(forced).forEach((k) => { process.env[k] = forced[k]; });
}
dotenv.config(); // .env du dépôt, ne comble que ce qui manque encore
const express = require('express');

const queueRoutes = require('./src/routes/queue');
const catalogRoutes = require('./src/routes/catalog');
const barberRoutes = require('./src/routes/barbers');
const settingsRoutes = require('./src/routes/settings');
const requireAdmin = require('./src/middleware/auth');
const { startNotifyJob } = require('./src/cron/notify');

const app = express();
const PORT = Number((process.env.PORT || '3000').toString().replace(/[\r\n]+$/, '').trim());

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
