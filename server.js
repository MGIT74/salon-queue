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
const { router: appointmentRoutes } = require('./src/routes/appointments');
const catalogRoutes = require('./src/routes/catalog');
const salesRoutes = require('./src/routes/sales');
const barberRoutes = require('./src/routes/barbers');
const settingsRoutes = require('./src/routes/settings');
const salonRoutes = require('./src/routes/salons');
const ownerRoutes = require('./src/routes/owner');
const signupRoutes = require('./src/routes/signup');
const requireAdmin = require('./src/middleware/auth');
const resolveSalon = require('./src/middleware/resolveSalon');
const { startNotifyJob } = require('./src/cron/notify');

const app = express();
const PORT = Number((process.env.PORT || '3000').toString().replace(/[\r\n]+$/, '').trim());

app.use(express.json({ limit: '5mb' })); // limite relevée pour les photos de coiffeurs (base64)
// Les pages HTML ne doivent jamais rester en cache trop longtemps (le mode
// "ajouté à l'écran d'accueil" sur iOS est particulièrement collant) - le
// navigateur doit toujours revalider auprès du serveur avant d'afficher une
// version potentiellement obsolète. app.css/app.js gardent un cache normal,
// mais portent un paramètre ?v= mis à jour à chaque changement notable pour
// forcer un rechargement même sans purge manuelle.
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// Gestion des salons (super admin) — jamais scopée à un salon particulier,
// donc montée AVANT resolveSalon.
app.use('/api/super', salonRoutes);

// Inscription d'un nouveau propriétaire de salon : crée son propre salon,
// donc ne peut pas dépendre d'un salon déjà résolu.
app.use('/api/signup', signupRoutes);

// Toutes les routes ci-dessous sont scopées au salon résolu depuis
// l'en-tête X-Salon-Slug (ou le salon par défaut si absent).
app.use('/api', resolveSalon);
app.use('/api/queue', queueRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/barbers', barberRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/owner', ownerRoutes);

// Vérification du mot de passe depuis l'écran de connexion du dashboard
app.post('/api/login', requireAdmin, (req, res) => res.json({ ok: true }));

app.get('/healthz', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// Raccourcis de navigation
app.get('/', (req, res) => res.redirect('/dashboard.html'));

app.listen(PORT, () => {
  console.log('Serveur démarré sur le port ' + PORT);
  startNotifyJob();
});
