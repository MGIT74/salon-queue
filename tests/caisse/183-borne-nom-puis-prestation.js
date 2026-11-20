// Borne : nouveau parcours « super kiosk ». Seul : coiffeur > « À quel nom ? » (prénom + email, clavier intégré)
// > prestation (« Bonjour X, on vous fait quoi ? ») > un petit plus > ticket (retour accueil auto 15 s).
// À plusieurs : le prénom est déjà connu -> directement la prestation. Étapes affichées en haut.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0;
const check = (n, ok) => { (ok ? pass++ : fail++); console.log((ok ? '  OK   ' : '  ECHEC') + ' ' + n); };
const k = fs.readFileSync(path.join(__dirname, '../../public/kiosk.html'), 'utf8');
const form = k.slice(k.indexOf('id="p-form"'), k.indexOf('id="p-form-extras"'));
const infos = k.slice(k.indexOf('id="p-infos"'), k.indexOf('id="p-form"'));
check('écran « À quel nom ? » avant la prestation', k.indexOf('id="p-infos"') > 0 && k.indexOf('id="p-infos"') < k.indexOf('id="p-form"'));
check('prénom et email sur cet écran (plus dans la prestation)', /id="f-name"/.test(infos) && /id="f-mail"/.test(infos) && !/id="f-name"|id="f-mail"/.test(form));
check('clavier intégré (AZERTY) + raccourcis @gmail.com…', /id="k-kbd"/.test(infos) && /\['a','z','e','r','t','y','u','i','o','p'\]/.test(k) && /@gmail\.com/.test(k) && /inputmode="none"/.test(infos));
check('Continuer : prénom obligatoire, email vérifié', /function infosNext\(\) \{[\s\S]{0,400}contactProblem\([\s\S]{0,300}show\('p-form'\)/.test(k));
check('seul : coiffeur -> « À quel nom ? » ; à plusieurs : directement la prestation', /if \(grp\) \{ setFormTitle\(\); show\('p-form'\); return; \}[\s\S]{0,300}show\('p-infos'\);/.test(k));
check('titre « Bonjour X, on vous fait quoi ? »', /'Bonjour ' \+ n \+ ', on vous fait quoi \?'/.test(k));
check('Retour de la prestation -> « À quel nom ? » (seul)', /function formBack\(\) \{ show\(grp \? 'p-home' : 'p-infos'\); \}/.test(k));
check('étapes en haut (Coiffeur · Vous · Prestation · Un petit plus · C\'est noté)', /id="kstep"/.test(k) && /KSTEP_LABELS = \['Coiffeur', 'Vous', 'Prestation', 'Un petit plus'/.test(k));
check('plus de :has (vieilles WebView) : classe flow-on posée en JS', !/:has\(/.test(k) && /classList\.toggle\('flow-on'/.test(k) && /\.stage\.flow-on \{/.test(k));
check('ticket : retour à l\'accueil automatique après 15 s', /id="t-auto"/.test(k) && /var left = 15/.test(k) && /on\.id === 'p-ticket'\) resetForm\(\)/.test(k));
check('« J\'ai un code cadeau » sur le 1er écran (tuile cadeau gardée)', /J'ai un code cadeau<\/button>/.test(k) && /Utiliser un cadeau<\/div>/.test(k));
console.log('\n' + pass + ' OK, ' + fail + ' ECHEC');
process.exit(fail ? 1 : 0);
