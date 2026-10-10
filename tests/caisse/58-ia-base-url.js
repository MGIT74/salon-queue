// L'assistant IA transmet l'adresse de CETTE instance a n8n (liste blanche), pour que prod et test appellent chacun leur serveur.
const fs = require('fs'), path = require('path');
const ai = fs.readFileSync(path.join(__dirname, '../../src/routes/aiChat.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
check('liste blanche des hotes (prod + test)', /app\.thebarberone\.com,rdv\.handsgraphic\.com/.test(ai) && /ALLOWED_API_HOSTS\.includes\(host\)/.test(ai));
check('hote inconnu => null (la cle n\'est jamais envoyee ailleurs)', /\? 'https:\/\/' \+ host : null/.test(ai));
check('api_base_url envoye a n8n', /api_base_url: apiBaseUrl\(req\)/.test(ai));
check('cle et URL nettoyees (CR, guillemets, espaces)', /AUTOMATION_API_KEY \|\| ''\)\.replace\(\/\[\\r\\n"'\]\/g, ''\)\.trim\(\)/.test(ai) && /N8N_CHAT_WEBHOOK_URL \|\| ''\)\.replace/.test(ai));
// Execution reelle de la fonction extraite
const m = ai.match(/const ALLOWED_API_HOSTS[\s\S]*?\n}\n/);
const apiBaseUrl = new Function(m[0] + '; return apiBaseUrl;')();
const req = h => ({ get: k => h[k.toLowerCase()] });
check('app.thebarberone.com => https://app.thebarberone.com', apiBaseUrl(req({ host: 'app.thebarberone.com' })) === 'https://app.thebarberone.com');
check('rdv.handsgraphic.com:443 => https://rdv.handsgraphic.com', apiBaseUrl(req({ host: 'rdv.handsgraphic.com:443' })) === 'https://rdv.handsgraphic.com');
check('x-forwarded-host prioritaire', apiBaseUrl(req({ 'x-forwarded-host': 'app.thebarberone.com', host: 'localhost:3000' })) === 'https://app.thebarberone.com');
check('hote falsifie refuse', apiBaseUrl(req({ host: 'evil.example.com' })) === null);
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
