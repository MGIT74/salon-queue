// Production (Docker Compose) : le conteneur doit recevoir les variables de l'assistant IA (le .env ne sert qu'a Compose).
const fs = require('fs'), path = require('path');
const dc = fs.readFileSync(path.join(__dirname, '../../docker-compose.yml'), 'utf8');
const ai = fs.readFileSync(path.join(__dirname, '../../src/routes/aiChat.js'), 'utf8');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const appBlock = dc.slice(dc.indexOf('\n  app:'), dc.indexOf('\n  db:'));
check('compose transmet N8N_CHAT_WEBHOOK_URL au conteneur app', /N8N_CHAT_WEBHOOK_URL: \$\{N8N_CHAT_WEBHOOK_URL:-\}/.test(appBlock));
check('compose transmet AUTOMATION_API_KEY au conteneur app', /AUTOMATION_API_KEY: \$\{AUTOMATION_API_KEY:-\}/.test(appBlock));
check('variables facultatives (valeur par defaut vide : le deploiement ne casse pas sans elles)', !/N8N_CHAT_WEBHOOK_URL: \$\{N8N_CHAT_WEBHOOK_URL:\?/.test(appBlock) && !/AUTOMATION_API_KEY: \$\{AUTOMATION_API_KEY:\?/.test(appBlock));
check('le code lit bien ces deux variables', /process\.env\.N8N_CHAT_WEBHOOK_URL/.test(ai) && /process\.env\.AUTOMATION_API_KEY/.test(ai));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC'); process.exit(fail ? 1 : 0);
