/*
 * Compte de démonstration UI/UX.
 *
 * Cette commande est volontairement limitée à l'authentification : elle ne
 * supprime aucune donnée et ne touche pas aux autres salons de la base.
 */
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../src/db');
const { hashPassword } = require('../src/lib/password');

const DEMO_OWNER = {
  name: 'Camille Martin',
  email: 'demo@atelier-nova.test',
  password: 'UIUX2026!',
  salonName: 'Atelier Nova',
  salonSlug: 'atelier-nova'
};

async function seed() {
  const passwordHash = await hashPassword(DEMO_OWNER.password);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [owners] = await connection.query(
      'SELECT id FROM owners WHERE email = ? FOR UPDATE',
      [DEMO_OWNER.email]
    );

    let ownerId;
    if (owners.length) {
      ownerId = owners[0].id;
      await connection.query(
        `UPDATE owners
         SET name = ?, password_hash = ?, active = 1, email_verified = 1,
             verify_token = NULL, verify_token_expires = NULL
         WHERE id = ?`,
        [DEMO_OWNER.name, passwordHash, ownerId]
      );
    } else {
      ownerId = require('crypto').randomUUID();
      await connection.query(
        `INSERT INTO owners
         (id, name, email, password_hash, admin_password, active, email_verified)
         VALUES (?, ?, ?, ?, NULL, 1, 1)`,
        [ownerId, DEMO_OWNER.name, DEMO_OWNER.email, passwordHash]
      );
    }

    const [salons] = await connection.query(
      'SELECT id, owner_id FROM salons WHERE slug = ? FOR UPDATE',
      [DEMO_OWNER.salonSlug]
    );

    if (salons.length && salons[0].owner_id !== ownerId) {
      throw new Error(
        'Le slug "' + DEMO_OWNER.salonSlug + '" appartient déjà à un autre compte. ' +
        'Choisissez un autre slug avant de relancer le seed.'
      );
    }

    if (salons.length) {
      await connection.query(
        'UPDATE salons SET name = ?, active = 1 WHERE id = ?',
        [DEMO_OWNER.salonName, salons[0].id]
      );
    } else {
      await connection.query(
        'INSERT INTO salons (id, owner_id, name, slug, admin_password, is_default, active) VALUES (?, ?, ?, ?, NULL, 0, 1)',
        [require('crypto').randomUUID(), ownerId, DEMO_OWNER.salonName, DEMO_OWNER.salonSlug]
      );
    }

    await connection.commit();
    console.log('Compte UI/UX prêt :');
    console.log('  Email        : ' + DEMO_OWNER.email);
    console.log('  Mot de passe : ' + DEMO_OWNER.password);
    console.log('  Salon        : ' + DEMO_OWNER.salonName + ' (?' + 'salon=' + DEMO_OWNER.salonSlug + ')');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

if (require.main === module) {
  seed()
    .catch((error) => {
      console.error('Impossible de préparer le compte UI/UX : ' + error.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

module.exports = { seed, DEMO_OWNER };
