// Gestion d'erreur commune aux routeurs : journalise le détail côté
// serveur mais ne renvoie au client qu'un message générique. Les
// messages d'erreur bruts (détails SQL, chemins, structure de la base)
// n'ont rien à faire dans une réponse HTTP - ils aident un attaquant
// bien plus qu'un utilisateur.
function wrap(fn) {
  return function (req, res) {
    fn(req, res).catch((err) => {
      console.error('[api]', req.method, req.originalUrl, '-', err);
      res.status(500).json({ error: 'Erreur interne du serveur' });
    });
  };
}

module.exports = { wrap };