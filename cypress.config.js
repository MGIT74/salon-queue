const { defineConfig } = require('cypress');
const { seed: seedAuth } = require('./scripts/seed-uiux-auth');
const { seed: seedDemo } = require('./scripts/seed-uiux-demo');
const { pool } = require('./src/db');

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    // Une vidéo est produite pour chaque fichier de test (.cy.js) exécuté.
    // Elles sont enregistrées dans cypress/videos/, exclu de Git.
    video: true,
    // Sur certains pilotes Electron/Linux, la capture automatique reste
    // bloquée et masque l'erreur qui a réellement fait échouer le test.
    // Les captures peuvent être réactivées une fois l'environnement stabilisé.
    screenshotOnRunFailure: false,
    defaultCommandTimeout: 10000,
    setupNodeEvents(on) {
      on('task', {
        async seedUiux() {
          await seedAuth();
          await seedDemo();
          return null;
        },
        async makeDemoKioskAvailable() {
          const [[salon]] = await pool.query(
            `SELECT s.id FROM salons s
             JOIN owners o ON o.id = s.owner_id
             WHERE s.slug = 'atelier-nova' AND o.email = 'demo@atelier-nova.test'`
          );
          if (!salon) throw new Error('Salon de démonstration introuvable');
          // La borne ne montre logiquement pas les coiffeurs hors de leurs
          // horaires 09:00–18:00. Le test rend leur plage disponible pour
          // isoler le parcours de check-in de l'heure à laquelle il tourne.
          await pool.query(
            `INSERT INTO barber_schedules (id, barber_id, weekday, start_time, end_time, active)
             SELECT UUID(), b.id, 0, '00:00:00', '23:59:59', 1
             FROM barbers b WHERE b.salon_id = ? AND b.kiosk_hidden = 0
             ON DUPLICATE KEY UPDATE start_time = VALUES(start_time), end_time = VALUES(end_time), active = 1`,
            [salon.id]
          );
          await pool.query(
            `UPDATE barber_schedules bs
             JOIN barbers b ON b.id = bs.barber_id
             SET bs.start_time = '00:00:00', bs.end_time = '23:59:59', bs.active = 1
             WHERE b.salon_id = ? AND b.kiosk_hidden = 0`,
            [salon.id]
          );
          return null;
        },
        log(message) {
          console.log(message);
          return null;
        }
      });
    }
  }
});
