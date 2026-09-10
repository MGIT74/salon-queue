'use strict';

const path = require('path');
// Charge la configuration propre à ce service avant d'importer les routes,
// qui lisent les variables Nepting au chargement de leurs modules.
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const { apiReference } = require('@scalar/express-api-reference');
const paymentRoutes = require('./routes/payment.routes');

const app = express();
app.use(express.json());

// Endpoint léger pour vérifier que le service HTTP est démarré, sans lancer
// de transaction ni contacter le TPE.
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/', paymentRoutes);

// Sert le fichier OpenAPI utilisé par Scalar
app.get('/openapi.json', (req, res) => {
  res.sendFile(path.join(__dirname, 'openapi.json'));
});

// Interface interactive Scalar (permet de tester l'endpoint dans le navigateur)
app.use(
  '/reference',
  apiReference({
    // Avec @scalar/express-api-reference, l'URL de la spécification doit
    // être placée dans l'objet `spec`. Sans cela Scalar rend son squelette
    // de chargement mais ne télécharge jamais la documentation.
    spec: {
      url: '/openapi.json',
    },
  })
);

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Service Nepting démarré sur le port ${PORT}`);
  });
}

module.exports = app;
