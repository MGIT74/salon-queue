/* Écrans des maquettes — contenu repris du web (dashboard.html, caisse.html,
   poste.html, compte.html). Données fictives. Voir maquettes-app.html. */
var GROUPS = [];
function group(id, label, intro, shots){ GROUPS.push({id:id,label:label,intro:intro,shots:shots}); }

/* ============================ ADMIN : FILE + RENDEZ-VOUS ============================ */
group('file-rdv', "File & RDV",
  "Admin — File d'attente et Rendez-vous. Les actions (commencer, terminer, annuler, déplacer, modifier) appellent les mêmes routes que le web ; les règles (ordre d'arrivée, 1 coupe en cours par coiffeur, délais) restent côté serveur.",
[
phone({cap:"File d'attente", sub:"Chiffres du jour, « Je suis » (coiffeur qui agit), En attente / Au fauteuil.", top:ADMIN_TOP, bar:'admin', on:1, body:
  title("File d'attente","Mise à jour en direct")+
  '<div class="grid3">'+tile('','blue','3','en attente',1)+tile('','orange','25 min','d\'attente',1)+tile('','green','2','coiffeurs en poste',1)+'</div>'+
  '<div class="grid2" style="grid-template-columns:1fr 1fr">'+tile('','','14','de file aujourd\'hui',1)+tile('','','486,00 €','encaissé aujourd\'hui',1)+'</div>'+
  '<div class="fld"><label>Je suis</label><div class="input">'+av('KA')+'<span style="flex:1">Karim</span><span style="color:var(--grey)">⌄</span></div></div>'+
  seg(['En attente · 3','Au fauteuil · 2'],0)+
  card(
    row({l:'<span class="time">1</span>',t:'Lucas Martin',m:'Coupe + barbe · arrivé 14:02',r:'<span class="btn sm">Commencer</span>'})+
    row({l:'<span class="time">2</span>',t:'Sofiane B.',m:'Dégradé · RDV 14:30 · Mehdi L.',r:chip('RDV','blue')})+
    row({l:'<span class="time">3</span>',t:'Thomas R.',m:'Coupe enfant · arrivé 14:11',r:'<span class="chev">⋯</span>'}),
  {flush:1})+
  '<div class="note" style="margin:-10px 6px 0">Touchez un client pour : Commencer, Annuler, Annuler (client ayant prévenu), voir ses coordonnées.</div>'
}),
phone({cap:"Rendez-vous — Jour", sub:"Paramètres, Aujourd'hui, Jour/Semaine/Mois, filtres Statut et Coiffeur, agenda du jour.", top:ADMIN_TOP, bar:'admin', on:2, body:
  title('Rendez-vous','Jeudi 19 novembre',rbtn('gear'))+
  seg(['Jour','Semaine','Mois'],0)+
  '<div class="week"><div>Lun<b>16</b><i></i></div><div>Mar<b>17</b><i></i></div><div>Mer<b>18</b></div><div class="on">Jeu<b>19</b><i></i></div><div>Ven<b>20</b><i></i></div><div>Sam<b>21</b><i></i></div><div>Dim<b>22</b></div></div>'+
  chips(['Tous','Confirmés','Terminés','Absents','Annulés'],0)+
  chips(['Tous les coiffeurs','Karim','Mehdi L.','Yanis'],0)+
  '<div class="tl"><div class="h">09:00</div><div class="c"><div class="slot past"><div class="tx"><div class="n">Hugo P.</div><div class="m">Coupe · Karim · 30 min</div></div><span class="chip ">Terminé</span></div></div></div>'+
  '<div class="tl"><div class="h">10:30</div><div class="c"><div class="slot past"><div class="tx"><div class="n">Nathan V.</div><div class="m">Barbe · Mehdi L. · 20 min</div></div><span class="chip red">Absent</span></div></div></div>'+
  '<div class="now-line">14:20</div>'+
  '<div class="tl"><div class="h">14:30</div><div class="c"><div class="slot"><div class="tx"><div class="n">Lucas Martin</div><div class="m">Coupe + barbe · Karim · 45 min</div></div>'+av('KA')+'</div></div></div>'+
  '<div class="tl"><div class="h">15:15</div><div class="c"><div class="slot"><div class="tx"><div class="n">Sofiane B.</div><div class="m">Dégradé · Mehdi L. · 30 min</div></div>'+av('ML')+'</div></div></div>'+
  '<div class="tl"><div class="h">16:00</div><div class="c"><div class="free">Libre · 16:00 – 17:30</div></div></div>'
}),
phone({cap:"Rendez-vous — Semaine / à venir", sub:"Liste « À venir » avec sélection multiple, import et exports (CSV / PDF).", top:ADMIN_TOP, bar:'admin', on:2, body:
  title('Rendez-vous','16 – 22 nov.',rbtn('gear'))+
  seg(['Jour','Semaine','Mois'],1)+
  '<div class="search">'+ic('search',17)+'Rechercher un client</div>'+
  sec('À venir','Tout sélectionner')+
  card(
    row({l:'<span class="time">14:30<small>auj.</small></span>',t:'Lucas Martin',m:'Coupe + barbe · 06 12 34 56 78',r:chip('Karim')})+
    row({l:'<span class="time">15:15<small>auj.</small></span>',t:'Sofiane B.',m:'Dégradé · sofiane@mail.fr',r:chip('Mehdi L.')})+
    row({l:'<span class="time">10:00<small>ven. 20</small></span>',t:'Adam K.',m:'Coupe · 07 88 12 45 90',r:chip('Yanis')})+
    row({l:'<span class="time">11:30<small>sam. 21</small></span>',t:'Thomas R.',m:'Coupe enfant',r:chip('Karim')}),
  {flush:1,inset:78})+
  card(
    row({l:rowIc('ul','#0a84ff'),t:'Importer des RDV',reg:1,chev:1})+
    row({l:rowIc('dl','#34c759'),t:'Télécharger CSV',reg:1,chev:1})+
    row({l:rowIc('doc','#ff9f0a'),t:'Télécharger PDF',reg:1,chev:1}),
  {flush:1,inset:58})
}),
phone({cap:"Fiche d'un RDV (feuille)", sub:"Même fiche qu'au web (Caisse / Poste / RDV) : modifier, déplacer, annuler, note interne, historique, marketing.", top:ADMIN_TOP, bar:'admin', on:2,
  body:title('Rendez-vous','Jeudi 19 novembre'),
  over:'<div class="sheet-dim"></div><div class="sheet"><div class="grab"></div>'+navbar('','Rendez-vous','OK')+'<div class="scroll nobar">'+
    '<div style="display:flex;gap:14px;align-items:center;margin:6px 0 18px">'+av('LM',1).replace('#0a84ff','#34c759')+'<div><div class="title" style="font-size:24px">Lucas Martin</div><div class="subtitle">Aujourd\'hui · 14:30 – 15:15</div></div></div>'+
    card(row({l:rowIc('cut','#5e5ce6'),t:'Coupe + barbe',m:'Karim · 45 min',r:'<span class="a">35,00 €</span>'}),{flush:1,inset:58})+
    '<div class="btns" style="margin-bottom:12px">'+btn('Modifier','sec2','edit')+btn('Déplacer','sec2','move')+'</div>'+
    btn('Annuler le RDV','red','x')+
    card(row({t:'Nom',m:'Lucas Martin',reg:1})+row({t:'Email',m:'lucas.martin@mail.fr',reg:1})+row({t:'Téléphone',m:'06 12 34 56 78',reg:1}),{flush:1,h:'Coordonnées'})+
    card('<div class="input ph" style="box-shadow:none;background:var(--fill)">Note interne (visible par l\'équipe)</div>',{h:'Note interne'})+
    card(row({t:'Coupe',m:'12 oct. · Karim',r:'<span class="v">20,00 €</span>'})+row({t:'Coupe + barbe',m:'14 sept. · Karim',r:'<span class="v">35,00 €</span>'}),{flush:1,h:'Historique des passages'})+
    card(frow('Accepte les messages marketing','',{tog:true}),{flush:1,h:'Marketing'})+
  '</div></div>'
})
]);

/* ================================== ADMIN : CAISSE ================================== */
group('caisse', 'Caisse',
  "Admin — section Caisse (période, clôture, historique, réglages) et page d'encaissement (caisse.html) avec l'onglet « Crédit coiffeurs ». Le paiement par carte (TPE Nepting) et l'impression restent NON branchés : bouton visible mais désactivé avec la mention.",
[
phone({cap:'Caisse — Période en cours', sub:'Total, ventes, par coiffeur, détail des ventes, clôture et historique.', top:ADMIN_TOP, bar:'admin', on:3, body:
  title('Caisse','Période en cours · depuis ce matin 9:00')+
  card('<div class="card-h">Encaissé</div><div class="big">486,00 €</div><div class="note" style="margin-top:2px">14 ventes · CB 312,00 € · Espèces 174,00 €</div>')+
  sec('Par coiffeur')+
  card(row({l:av('KA'),t:'Karim',m:'6 ventes',r:'<span class="a">210,00 €</span>'})+row({l:av('ML'),t:'Mehdi L.',m:'5 ventes',r:'<span class="a">168,00 €</span>'})+row({l:av('YS'),t:'Yanis',m:'3 ventes',r:'<span class="a">108,00 €</span>'}),{flush:1,inset:62})+
  btn('Clôturer la caisse','', 'lock')+
  sec('Détail des ventes','Tout voir')+
  card(row({l:'<span class="time">14:05</span>',t:'Coupe + barbe',m:'Karim · CB',r:'<span class="a">35,00 €</span>'})+row({l:'<span class="time">13:40</span>',t:'Dégradé + cire',m:'Mehdi L. · Espèces',r:'<span class="a">32,00 €</span>'}),{flush:1,inset:78})+
  card(row({l:rowIc('clock','#8e8e93'),t:'Historique des clôtures',reg:1,chev:1})+row({l:rowIc('gear','#8e8e93'),t:'Réglages de la caisse',reg:1,chev:1}),{flush:1,inset:58})
}),
phone({cap:'Encaissement (caisse.html)', sub:'Choix du coiffeur, onglets Prestations / Suppléments / Produits / Crédit coiffeurs, file à encaisser, ticket en bas.', bar:'caisse', on:0,
  top:'<div class="topbar"><div class="salon-btn">'+av('KA')+'Karim <span style="color:var(--grey)">⌄</span></div><span class="chip green" style="font-size:13px;padding:6px 10px">Caisse ouverte</span></div>',
  body:
  chips(['Prestations','Suppléments','Produits','Crédit coiffeurs'],0)+
  '<div class="info" style="display:flex;justify-content:space-between;align-items:center">À encaisser · Lucas Martin (Karim) <b>›</b></div>'+
  '<div class="prod-grid">'+
  '<div class="prod on"><div class="n">Coupe + barbe</div><div><div class="m">45 min</div><div class="p">35,00 €</div></div></div>'+
  '<div class="prod"><div class="n">Coupe</div><div><div class="m">30 min</div><div class="p">20,00 €</div></div></div>'+
  '<div class="prod"><div class="n">Dégradé</div><div><div class="m">30 min</div><div class="p">22,00 €</div></div></div>'+
  '<div class="prod"><div class="n">Coupe enfant</div><div><div class="m">20 min</div><div class="p">15,00 €</div></div></div>'+
  '<div class="prod"><div class="n">Barbe</div><div><div class="m">20 min</div><div class="p">15,00 €</div></div></div>'+
  '<div class="prod"><div class="n">Soin visage</div><div><div class="m">25 min</div><div class="p">25,00 €</div></div></div>'+
  '</div>',
  over:'<div class="ticket"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b style="font-size:15px">Ticket en cours</b><span style="color:var(--red);font-size:14px">Vider</span></div>'+
    '<div class="tl2"><span>Coupe + barbe</span><span>35,00 €</span></div><div class="tl2" style="color:var(--green)"><span>⭐ Fidélité : −20 % prestation</span><span>−7,00 €</span></div>'+
    '<div class="tot"><span style="color:var(--grey);font-size:14px">Total</span><b>28,00 €</b></div>'+
    '<div class="btns" style="margin-top:10px"><div class="btn sm" style="flex:1;opacity:.45">Carte (bientôt)</div><div class="btn sm green" style="flex:1">Espèces</div></div>'+
    '<div style="text-align:center;font-size:13.5px;color:var(--blue);margin-top:8px;font-weight:600">Partager (espèces + carte) · + Payer pour un autre client</div></div>'
}),
phone({cap:'Crédit coiffeurs (recharge)', sub:'Recharge du coiffeur sélectionné : 10 / 20 / 30 € / autre — encaissée comme une vente normale.', bar:'caisse', on:0,
  top:'<div class="topbar"><div class="salon-btn">'+av('KA')+'Karim <span style="color:var(--grey)">⌄</span></div><span class="chip green" style="font-size:13px;padding:6px 10px">Caisse ouverte</span></div>',
  body:
  chips(['Prestations','Suppléments','Produits','Crédit coiffeurs'],3)+
  card('<div style="display:flex;align-items:center;gap:12px">'+av('ML')+'<div style="flex:1"><div style="font-weight:600">Mehdi L.</div><div class="note">Solde actuel</div></div><div class="big" style="font-size:26px">12,40 €</div></div>')+
  '<div class="fld"><label>Montant à recharger</label></div>'+
  '<div class="amounts"><span>10 €</span><span class="on">20 €</span><span>30 €</span><span style="font-size:14px">Autre</span></div>'+
  '<div class="note" style="margin:0 4px 16px">Le coiffeur pourra prendre ses produits depuis son poste (onglet Crédit).</div>',
  over:'<div class="ticket"><div class="tl2"><span>Crédit produits · Mehdi L.</span><span>20,00 €</span></div><div class="tot"><span style="color:var(--grey);font-size:14px">Total</span><b>20,00 €</b></div>'+
    '<div class="btns" style="margin-top:10px"><div class="btn sm" style="flex:1;opacity:.45">Carte (bientôt)</div><div class="btn sm green" style="flex:1">Espèces</div></div></div>'
}),
phone({cap:'Clôture (ticket Z) + recomptage', sub:'Code PIN du coiffeur qui clôture ; recomptage du fond de caisse à l\'ouverture.', bar:'caisse', on:0, top:navbar('Caisse','Clôture',''), body:
  title('Clôturer la caisse','Ticket Z de la journée')+
  card(row({t:'Ventes',reg:1,r:'<span class="v">14</span>'})+row({t:'Carte',reg:1,r:'<span class="v">312,00 €</span>'})+row({t:'Espèces',reg:1,r:'<span class="v">174,00 €</span>'})+row({t:'Total',r:'<span class="a">486,00 €</span>'}),{flush:1})+
  '<div class="fld"><label>Code PIN du coiffeur qui clôture</label><div class="input" style="justify-content:center;letter-spacing:14px;font-size:22px">● ● ● ○</div></div>'+
  btn('Clôturer la caisse','','lock')+btn('Annuler','grey')+
  sec('Recomptage du fond de caisse')+
  card('<div class="note" style="margin-bottom:10px">Fond de caisse d\'hier : <b style="color:var(--ink)">150,00 €</b> — à recompter avant de commencer.</div><div class="btns"><div class="btn sm green" style="flex:1">Le compte est bon</div><div class="btn sm grey" style="flex:1">Il y a un écart</div></div>')
}),
phone({cap:'Réglages de la caisse', sub:'Ouverture, fermeture automatique, terminal et impression (non branchés sur mobile).', top:navbar('Caisse','Réglages',''), body:
  card(frow('Ouverture de la caisse','09:00',{chev:1})+frow('Fermeture automatique','20:00',{chev:1}),{flush:1,h:'Horaires'})+
  '<div class="foot">Avant l\'heure d\'ouverture, impossible d\'encaisser.</div>'+
  '<div class="warn">'+ic('lock',18)+'<span>Terminal de paiement (TPE) et imprimante : réglés depuis l\'ordinateur du salon. Non disponibles dans l\'app pour l\'instant.</span></div>'+
  card(frow('Pont local','Configuré',{})+frow('Imprimante','ESC/POS')+frow('Terminal de paiement','Nepting'),{flush:1,h:'Matériel (lecture seule)'})+
  btn('Enregistrer')
})
]);

/* ============================ ADMIN : COIFFEURS + CLIENTS ============================ */
group('equipe', 'Coiffeurs & Clients',
  "Admin — Coiffeurs (équipe, fiche avec Statistiques / Horaires / Prestations / Calendrier, crédit produits) et Clients (répertoire, fiche, import / export).",
[
phone({cap:'Coiffeurs', sub:'Équipe et état du jour, + Ajouter, bloc « Crédit produits des coiffeurs ».', top:ADMIN_TOP, bar:'admin', on:4, body:
  title('Coiffeurs','6 actifs',rbtn('plus'))+
  card(
    row({l:av('KA'),t:'Karim',m:'En poste · 9:00 – 19:00',r:chip('RDV','blue'),chev:1})+
    row({l:av('ML'),t:'Mehdi L.',m:'En pause jusqu\'à 14:45',r:chip('Pause','orange'),chev:1})+
    row({l:av('YS'),t:'Yanis',m:'En poste · sans RDV aujourd\'hui',r:chip('Sans RDV'),chev:1})+
    row({l:av('SB'),t:'Samy B.',m:'En congé jusqu\'au 24 nov.',r:chip('Congé','red'),chev:1}),
  {flush:1,inset:62})+
  sec('Crédit produits des coiffeurs')+
  card(
    row({l:av('KA'),t:'Karim',m:'Dernier mouvement : hier',r:'<span class="a">8,50 €</span>',chev:1})+
    row({l:av('ML'),t:'Mehdi L.',m:'Gratuit (seul le stock baisse)',r:'<span class="a" style="color:var(--green)">Gratuit</span>',chev:1})+
    row({l:av('YS'),t:'Yanis',m:'Sous le seuil d\'alerte',r:'<span class="a" style="color:var(--orange)">2,00 €</span>',chev:1}),
  {flush:1,inset:62})+
  card(frow('Produits utilisables avec le crédit','12',{chev:1})+frow('Alerter le coiffeur sous','5,00 €',{chev:1}),{flush:1})
}),
phone({cap:'Fiche coiffeur', sub:'Statistiques (même période que le Dashboard), Horaires, Prestations, Calendrier (congés / sans RDV).', top:navbar('Coiffeurs','','Modifier'), bar:'admin', on:4, body:
  '<div style="display:flex;gap:14px;align-items:center;margin:4px 0 18px">'+av('KA',1)+'<div><div class="title" style="font-size:24px">Karim</div><div class="subtitle">PIN ••••  ·  Prend des RDV</div></div></div>'+
  seg(['Stats','Horaires','Prestations','Calendrier'],1)+
  card(
    frow('Lundi','9:00 – 19:00',{chev:1})+frow('Mardi','9:00 – 19:00',{chev:1})+frow('Mercredi','Repos',{chev:1})+frow('Jeudi','9:00 – 12:00 · 14:00 – 19:00',{chev:1})+frow('Vendredi','9:00 – 19:00',{chev:1})+frow('Samedi','8:30 – 17:00',{chev:1})+frow('Dimanche','Repos',{chev:1}),
  {flush:1,h:'Horaires de la semaine'})+
  card(frow('Accepte les rendez-vous','',{tog:true})+frow('Timer activé','',{tog:true}),{flush:1})
}),
phone({cap:'Crédit d\'un coiffeur (feuille)', sub:'Solde, interrupteur « Gratuit », historique ; « Annuler » un mouvement réservé à l\'admin.', top:ADMIN_TOP, bar:'admin', on:4, body:title('Coiffeurs','6 actifs'),
  over:'<div class="sheet-dim"></div><div class="sheet"><div class="grab"></div>'+navbar('','Crédit · Karim','OK')+'<div class="scroll nobar">'+
  card('<div class="card-h">Solde disponible</div><div class="big">8,50 €</div>')+
  card(frow('Gratuit','',{tog:false}),{flush:1,foot:'Activé : seul le stock baisse, le crédit n\'est pas débité.'})+
  sec('Historique')+
  card(
    row({t:'Cire mate 100 ml',m:'Pris hier 18:02 · stock −1',r:'<span class="a">−11,50 €</span>',x:'<div style="margin-top:6px"><span class="chip red">Annuler</span></div>'})+
    row({t:'Recharge à la caisse',m:'12 nov. · Espèces',r:'<span class="a" style="color:var(--green)">+20,00 €</span>'})+
    row({t:'Shampoing 250 ml',m:'5 nov. · stock −1',r:'<span class="a">−9,00 €</span>',x:'<div style="margin-top:6px"><span class="chip red">Annuler</span></div>'}),
  {flush:1})+'</div></div>'
}),
phone({cap:'Clients', sub:'Recherche, Ajouter, Importer CSV, exports, sélection et suppression.', top:ADMIN_TOP, bar:'admin', on:4, body:
  title('Clients','78 clients',rbtn('plus'))+
  '<div class="search">'+ic('search',17)+'Nom, email ou téléphone</div>'+
  chips(['Tous','Avec compte','Fidélité active','Sans compte'],0)+
  card(
    row({l:av('LM').replace('#0a84ff','#34c759'),t:'Lucas Martin',m:'Dernier passage 12 oct. · Coupe',r:chip('Compte','blue'),chev:1})+
    row({l:av('SB'),t:'Sofiane B.',m:'Dernier passage 2 nov. · Dégradé',chev:1})+
    row({l:av('TR'),t:'Thomas R.',m:'Dernier passage 8 nov. · Coupe enfant',r:chip('Fidélité','green'),chev:1})+
    row({l:av('AK').replace('#0a84ff','#af52de'),t:'Adam K.',m:'Jamais venu · RDV ven. 20',chev:1}),
  {flush:1,inset:62})+
  card(
    row({l:rowIc('ul','#0a84ff'),t:'Importer CSV',reg:1,chev:1})+row({l:rowIc('dl','#34c759'),t:'Télécharger CSV',reg:1,chev:1})+row({l:rowIc('doc','#ff9f0a'),t:'Télécharger PDF',reg:1,chev:1})+row({l:rowIc('x','#ff3b30'),t:'Tout supprimer',reg:1,nc:'var(--red)'}),
  {flush:1,inset:58})
}),
phone({cap:'Fiche client', sub:'Coordonnées, passages (prestation, date, prix, durée), compte et fidélité.', top:navbar('Clients','','Modifier'), body:
  '<div style="text-align:center;margin:6px 0 18px">'+av('LM',1).replace('#0a84ff','#34c759').replace('class="av lg"','class="av lg" style="margin:0 auto 10px;background:#34c759"')+'<div class="title" style="font-size:24px">Lucas Martin</div><div class="subtitle">Client depuis mars 2025</div></div>'+
  '<div class="btns" style="margin-bottom:22px">'+btn('Appeler','sec2','phone')+btn('Email','sec2','mail')+btn('RDV','sec2','cal')+'</div>'+
  card(row({t:'Email',m:'lucas.martin@mail.fr',reg:1})+row({t:'Téléphone',m:'06 12 34 56 78',reg:1})+row({t:'Compte client',m:'Oui · email confirmé',reg:1}),{flush:1})+
  sec('Passages')+
  card(row({t:'Coupe + barbe',m:'12 oct. · Karim · 45 min',r:'<span class="a">35,00 €</span>'})+row({t:'Coupe',m:'14 sept. · Karim · 30 min',r:'<span class="a">20,00 €</span>'}),{flush:1})+
  btn('Supprimer ce client','red')
})
]);

/* ================================ ADMIN : CATALOGUE ================================ */
group('catalogue', 'Catalogue',
  "Admin — Prestations, Suppléments, Produits (avec « Scanner » : caméra du téléphone ; produit inconnu = nouveau produit avec le code-barres pré-rempli).",
[
phone({cap:'Prestations', sub:'Liste par catégorie, prix, durée, actif / inactif, + Ajouter.', top:ADMIN_TOP, bar:'admin', on:4, body:
  title('Prestations','12 prestations',rbtn('plus'))+
  card(
    row({t:'Coupe',m:'30 min',r:'<span class="a">20,00 €</span>',chev:1})+row({t:'Coupe + barbe',m:'45 min',r:'<span class="a">35,00 €</span>',chev:1})+row({t:'Dégradé',m:'30 min',r:'<span class="a">22,00 €</span>',chev:1})+row({t:'Coupe enfant',m:'20 min · -12 ans',r:'<span class="a">15,00 €</span>',chev:1}),
  {flush:1,h:'Coupes'})+
  card(
    row({t:'Barbe',m:'20 min',r:'<span class="a">15,00 €</span>',chev:1})+row({t:'Soin visage',m:'25 min · inactive',nc:'var(--grey)',r:'<span class="a" style="color:var(--grey)">25,00 €</span>',chev:1}),
  {flush:1,h:'Barbe & soins'})
}),
phone({cap:'Modifier une prestation', sub:'Même formulaire que le web ; Suppléments identique (sans catégorie).', top:navbar('Annuler','Prestation','Enregistrer'), body:
  fld('Nom','Coupe + barbe')+
  '<div class="grid2" style="margin-bottom:14px">'+fld('Prix','35,00 €')+fld('Durée','45 min')+'</div>'+
  fld('Catégorie','Coupes <span style="color:var(--grey)">⌄</span>')+
  fld('Description (réservation en ligne)','Coupe aux ciseaux ou tondeuse + taille de barbe',0)+
  card(frow('Active','',{tog:true})+frow('Réservable en ligne','',{tog:true})+frow('Rapporte des points fidélité','',{tog:true}),{flush:1})+
  btn('Supprimer la prestation','red')
}),
phone({cap:'Produits', sub:'Stock, code-barres, bouton Scanner, + Ajouter.', top:ADMIN_TOP, bar:'admin', on:4, body:
  title('Produits','24 produits · 186 en stock')+
  '<div class="btns" style="margin-bottom:16px">'+btn('Scanner','','scan')+btn('Ajouter','sec2','plus')+'</div>'+
  '<div class="search">'+ic('search',17)+'Rechercher un produit</div>'+
  card(
    row({l:rowIc('box','#5e5ce6'),t:'Cire mate 100 ml',m:'Stock 14 · 3760123450012',r:'<span class="a">11,50 €</span>',chev:1})+
    row({l:rowIc('box','#30b0c7'),t:'Shampoing 250 ml',m:'Stock 3 · bientôt épuisé',r:'<span class="a">9,00 €</span>',chev:1})+
    row({l:rowIc('box','#ff9f0a'),t:'Huile à barbe 30 ml',m:'Stock 0 · épuisé',r:'<span class="a" style="color:var(--grey)">14,00 €</span>',chev:1})+
    row({l:rowIc('box','#34c759'),t:'Peigne bois',m:'Stock 22',r:'<span class="a">6,00 €</span>',chev:1}),
  {flush:1,inset:58})
}),
phone({cap:'Scanner un produit', sub:'Caméra du téléphone. Produit connu → sa fiche ; inconnu → nouveau produit, code-barres pré-rempli.', top:navbar('Produits','Scanner',''), body:
  '<div class="camera"><div class="frame"></div><div class="laser"></div><div class="hint">Placez le code-barres dans le cadre</div></div>'+
  '<div class="info">Code lu : <b>3760123450099</b> — produit inconnu.</div>'+
  sec('Nouveau produit')+
  fld('Code-barres','3760123450099')+fld('Nom','Nom du produit',1)+
  '<div class="grid2" style="margin-bottom:14px">'+fld('Prix','0,00 €',1)+fld('Stock','0',1)+'</div>'+
  btn('Créer le produit')
})
]);

/* ================================ ADMIN : MARKETING ================================ */
group('marketing', 'Marketing',
  "Admin — Marketing : UNE carte de fidélité modifiable (paliers, articles qui rapportent des points, visuel), clients fidèles, design de la carte cadeau, cadeaux vendus.",
[
phone({cap:'Marketing', sub:'Carte de fidélité, clients fidèles, cartes cadeaux.', top:ADMIN_TOP, bar:'admin', on:4, body:
  title('Marketing')+
  sec('Carte de fidélité','Modifier')+
  '<div class="loy"><span class="i">i</span><div><div style="font-size:13px;opacity:.85;font-weight:600;text-transform:uppercase;letter-spacing:.6px">TBO Oyonnax</div><div style="font-size:22px;font-weight:700;margin-top:2px">Carte fidélité</div></div><div class="stamps"><i class="f"></i><i class="f"></i><i class="f"></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>'+
  card(row({l:rowIc('pct','#0a84ff'),t:'10 points',m:'−20 % sur une prestation'})+row({l:rowIc('gift','#ff9f0a'),t:'20 points',m:'Article offert : Cire mate'}),{flush:1,inset:58})+
  sec('Clients fidèles','Tout voir')+
  card(row({l:av('TR'),t:'Thomas R.',m:'Dernière activité 8 nov.',r:'<span class="a">9 pts</span>'})+row({l:av('LM').replace('#0a84ff','#34c759'),t:'Lucas Martin',m:'1 récompense disponible',r:'<span class="a">12 pts</span>'}),{flush:1,inset:62})+
  sec('Cartes cadeaux')+
  card(row({l:rowIc('img','#ff375f'),t:'Design de la carte cadeau',m:'720 × 320 px',reg:1,chev:1})+row({l:rowIc('gift','#ff9f0a'),t:'Image « Utiliser un cadeau » (borne)',reg:1,chev:1})+row({l:rowIc('list','#8e8e93'),t:'Cadeaux vendus',m:'3 en cours',reg:1,chev:1}),{flush:1,inset:58})
}),
phone({cap:'Modifier la carte de fidélité', sub:'Nom, paliers au choix (remise % prestation, remise % produit, article offert), visuel.', top:navbar('Annuler','Carte fidélité','Enregistrer'), body:
  fld('Nom de la carte','Carte fidélité')+
  sec('Paliers')+
  card(
    row({l:'<span class="chip blue" style="font-size:14px;padding:6px 10px">10 pts</span>',t:'Remise % sur une prestation',m:'20 %',chev:1})+
    row({l:'<span class="chip blue" style="font-size:14px;padding:6px 10px">20 pts</span>',t:'Article offert',m:'Cire mate 100 ml',chev:1})+
    '<div class="row" style="color:var(--blue);font-weight:600">+ Ajouter un palier</div>',{flush:1,inset:16})+
  '<div class="note" style="margin:-12px 6px 22px">1 point par passage payé si un article qui rapporte des points est sur le ticket. Utiliser une récompense retire ses points.</div>'+
  sec('Visuel de la carte (compte client)')+
  card('<div style="height:120px;border-radius:14px;background:linear-gradient(135deg,#0062c4,#5e5ce6);display:grid;place-items:center;color:#fff;font-weight:600">Touchez pour choisir une image</div>')
}),
phone({cap:'Articles qui rapportent des points', sub:'Tous, ou seulement ceux cochés — « Tout cocher » par groupe.', top:navbar('Carte fidélité','Articles',''), body:
  seg(['Tous les articles','Seulement cochés'],1)+
  '<div class="sec"><h2 style="font-size:17px">Prestations</h2><a>Tout cocher</a></div>'+
  card(row({l:'<span class="check on"></span>',t:'Coupe',reg:1})+row({l:'<span class="check on"></span>',t:'Coupe + barbe',reg:1})+row({l:'<span class="check on"></span>',t:'Dégradé',reg:1})+row({l:'<span class="check"></span>',t:'Coupe enfant',reg:1}),{flush:1,inset:50})+
  '<div class="sec"><h2 style="font-size:17px">Suppléments</h2><a>Tout cocher</a></div>'+
  card(row({l:'<span class="check"></span>',t:'Cire',reg:1})+row({l:'<span class="check"></span>',t:'Shampoing',reg:1}),{flush:1,inset:50})+
  '<div class="sec"><h2 style="font-size:17px">Produits</h2><a>Tout cocher</a></div>'+
  card(row({l:'<span class="check on"></span>',t:'Cire mate 100 ml',reg:1})+row({l:'<span class="check"></span>',t:'Shampoing 250 ml',reg:1}),{flush:1,inset:50})
}),
phone({cap:'Cadeaux vendus', sub:'Historique : nom, téléphone, code, coiffeur, acheté le, utilisé le.', top:navbar('Marketing','Cadeaux vendus',''), body:
  chips(['Tous','En cours','Utilisés'],0)+
  card(
    row({l:rowIc('gift','#ff9f0a'),t:'Inès D. · 40,00 €',m:'Code K7P2-QX · acheté 3 nov. · Karim',r:chip('En cours','orange')})+
    row({l:rowIc('gift','#ff9f0a'),t:'Paul G. · Coupe + barbe',m:'Code 9HD4-LM · acheté 28 oct. · Yanis',r:chip('En cours','orange')})+
    row({l:rowIc('gift','#8e8e93'),t:'Sarah M. · 30,00 €',m:'Utilisé le 15 oct. · Mehdi L.',r:chip('Utilisé')}),
  {flush:1,inset:58})
})
]);

/* ====================== ADMIN : RÉGLAGES / COMPTE / SALONS / PLUS ====================== */
group('reglages', 'Réglages & Compte',
  "Admin — menu « Plus », Réglages (toutes les rubriques du web, dont SMS avec pagination 5 / 10 / 20 / 50 / 100), Compte, Mes salons.",
[
phone({cap:'Plus', sub:'Les 13 sections du web dans l\'ordre, puis Déconnexion.', top:ADMIN_TOP, bar:'admin', on:4, body:
  title('Plus','admin@tbo.fr')+
  card(
    row({l:rowIc('cut','#5e5ce6'),t:'Prestations',reg:1,chev:1})+row({l:rowIc('plus','#30b0c7'),t:'Suppléments',reg:1,chev:1})+row({l:rowIc('box','#ff9f0a'),t:'Produits',reg:1,chev:1})+row({l:rowIc('mail','#ff375f'),t:'Marketing',reg:1,chev:1})+
    row({l:rowIc('user','#0a84ff'),t:'Coiffeurs',reg:1,chev:1})+row({l:rowIc('users','#34c759'),t:'Clients',reg:1,chev:1}),
  {flush:1,inset:58})+
  card(row({l:rowIc('shop','#8e8e93'),t:'Mes salons',reg:1,chev:1})+row({l:rowIc('id','#8e8e93'),t:'Compte',reg:1,chev:1})+row({l:rowIc('gear','#8e8e93'),t:'Réglages',reg:1,chev:1}),{flush:1,inset:58})+
  card(row({l:rowIc('out','#ff3b30'),t:'Déconnexion',nc:'var(--red)'}),{flush:1,inset:58})
}),
phone({cap:'Réglages', sub:'Mêmes rubriques que le web, une page par rubrique.', top:navbar('Plus','',''), bar:'admin', on:4, body:
  title('Réglages')+
  card(row({l:rowIc('shop','#0a84ff'),t:'Général',m:'Nom, devise, site, fuseau horaire',reg:1,chev:1})+row({l:rowIc('doc','#8e8e93'),t:'Informations légales',m:'Adresse, SIRET, TVA intracom…',reg:1,chev:1})+row({l:rowIc('pct','#34c759'),t:'TVA',reg:1,chev:1}),{flush:1,inset:58})+
  card(row({l:rowIc('cal','#ff9f0a'),t:'Horaires généraux du salon',reg:1,chev:1})+row({l:rowIc('closed','#ff3b30'),t:'Fermetures exceptionnelles',m:'1 fermeture prévue',reg:1,chev:1})+row({l:rowIc('timer','#5e5ce6'),t:'Timer',reg:1,chev:1}),{flush:1,inset:58})+
  card(row({l:rowIc('mail','#30b0c7'),t:'Envoi des emails (SMTP)',reg:1,chev:1})+row({l:rowIc('sms','#34c759'),t:'SMS',m:'Rappel SMS · derniers SMS',reg:1,chev:1})+row({l:rowIc('bell','#ff375f'),t:'Notifications email',reg:1,chev:1}),{flush:1,inset:58})+
  card(row({l:rowIc('log','#8e8e93'),t:"Journal d'activité",reg:1,chev:1}),{flush:1,inset:58})
}),
phone({cap:'Réglages > SMS', sub:'Rappel, expéditeur, message avec variables, test, derniers SMS paginés 5 / 10 / 20 / 50 / 100.', top:navbar('Réglages','SMS','Enregistrer'), body:
  card(frow('Rappel SMS','',{tog:true})+frow('Envoyer les emails et SMS aux clients','',{tog:true}),{flush:1})+
  fld('Nom de l\'expéditeur','TBOOYONNAX')+
  '<div class="note" style="margin:-8px 6px 14px">3 à 11 lettres ou chiffres, sans espace ni accent.</div>'+
  fld('Message','Bonjour {prenom}, RDV demain à {heure} chez {salon}.')+
  '<div class="chips" style="margin-bottom:12px"><span class="chip">{prenom}</span><span class="chip">{heure}</span><span class="chip">{date}</span><span class="chip">{salon}</span></div>'+
  '<div class="btns" style="margin-bottom:22px"><div class="btn sm grey" style="flex:1">Message par défaut</div><div class="btn sm sec2" style="flex:1">SMS de test</div></div>'+
  '<div class="sec"><h2>Derniers SMS</h2></div>'+
  '<div class="seg"><span>5</span><span class="on">10</span><span>20</span><span>50</span><span>100</span></div>'+
  card(row({t:'06 12 34 56 78',m:'Rappel · hier 18:00',r:chip('Envoyé','green')})+row({t:'07 88 12 45 90',m:'Rappel · hier 18:00',r:chip('Échec','red')}),{flush:1})+
  '<div style="display:flex;justify-content:space-between;align-items:center;margin:-8px 4px 0;font-size:14px;color:var(--grey)"><span>‹ Précédent</span><span>Page 1 / 4</span><span style="color:var(--blue)">Suivant ›</span></div>'
}),
phone({cap:'Compte', sub:'Logo, couleur d\'accentuation, page de connexion, mot de passe, mon profil.', top:navbar('Plus','',''), bar:'admin', on:4, body:
  title('Compte')+
  card('<div style="display:flex;gap:14px;align-items:center"><div style="width:64px;height:64px;border-radius:16px;background:var(--fill);display:grid;place-items:center;color:var(--grey)">'+ic('img',26)+'</div><div style="flex:1"><div style="font-weight:600">Logo du salon</div><div class="note">Touchez pour choisir une image</div></div></div>')+
  card(frow('Couleur d\'accentuation','<span style="display:inline-flex;align-items:center;gap:8px">#0062c4<span style="width:22px;height:22px;border-radius:6px;background:#0062c4;display:inline-block"></span></span>',{chev:1})+frow('Image de la page de connexion','Aucune',{chev:1}),{flush:1,h:'Apparence'})+
  card(frow('Votre nom','Admin test',{chev:1})+frow('Email','admin@tbo.fr',{chev:1}),{flush:1,h:'Mon profil'})+
  card(row({l:rowIc('lock','#8e8e93'),t:'Changer le mot de passe',reg:1,chev:1}),{flush:1,inset:58})
}),
phone({cap:'Mes salons', sub:'Salons de l\'enseigne + ajouter un salon.', top:navbar('Plus','',''), bar:'admin', on:4, body:
  title('Mes salons','2 salons')+
  card(row({l:rowIc('shop','#0a84ff'),t:'TBO Oyonnax',m:'oyonnax · salon actuel',r:chip('Actuel','blue')})+row({l:rowIc('shop','#5e5ce6'),t:'TBO Valleiry',m:'tbo-valleiry',chev:1}),{flush:1,inset:58})+
  sec('Ajouter un salon à l\'enseigne')+
  fld('Nom du salon','Ex. TBO Annecy',1)+fld('Identifiant (dans l\'URL)','tbo-annecy',1)+
  btn('Créer ce salon')
})
]);

/* ============================ POSTE COIFFEUR + MODE AGENDA ============================ */
group('poste', 'Poste & Agenda',
  "Poste coiffeur (connexion par PIN) : Agenda, Timer, Crédit, Déconnexion. Lien « agenda » (tablette partagée) : Agenda + Timer + Déconnexion, sans caisse ni clôture, reste ouvert même caisse clôturée.",
[
phone({cap:'Connexion coiffeur (PIN)', sub:'Pavé numérique, comme poste.html.', body:
  '<div style="text-align:center;margin-top:40px">'+'<div class="salon-ic" style="width:56px;height:56px;border-radius:16px;margin:0 auto 14px">'+ic('pin',26)+'</div><div class="title" style="font-size:26px">Mon poste</div><div class="subtitle">TBO Oyonnax · entrez votre code PIN</div></div>'+
  '<div style="display:flex;justify-content:center;gap:18px;margin:34px 0 34px">'+'<span style="width:14px;height:14px;border-radius:50%;background:var(--ink)"></span><span style="width:14px;height:14px;border-radius:50%;background:var(--ink)"></span><span style="width:14px;height:14px;border-radius:50%;border:2px solid var(--sep)"></span><span style="width:14px;height:14px;border-radius:50%;border:2px solid var(--sep)"></span></div>'+
  '<div style="display:grid;grid-template-columns:repeat(3,78px);gap:16px 26px;justify-content:center">'+['1','2','3','4','5','6','7','8','9','','0','⌫'].map(function(k){return '<div style="height:78px;border-radius:50%;'+(k&&k!=='⌫'?'background:var(--card);box-shadow:var(--shadow);':'')+'display:grid;place-items:center;font-size:30px;font-weight:500">'+k+'</div>';}).join('')+'</div>'
}),
phone({cap:'Mon poste — Agenda', sub:'« À suivre », agenda Jour/Semaine/Mois ; touche un RDV → même fiche qu\'en admin.', bar:'poste', on:0,
  top:'<div class="topbar"><div class="salon-btn">'+av('KA')+'Karim</div><span class="chip green" style="font-size:13px;padding:6px 10px">En poste</span></div>', body:
  title('Mon poste','Jeudi 19 novembre')+
  sec('À suivre')+
  card('<div style="display:flex;gap:12px;align-items:center"><span class="time" style="font-size:20px;width:auto">14:30</span><div style="flex:1"><div style="font-weight:600">Lucas Martin</div><div class="note">Coupe + barbe · 45 min</div></div><span class="btn sm">Commencer</span></div>')+
  seg(['Jour','Semaine','Mois'],0)+
  '<div class="now-line">14:20</div>'+
  '<div class="tl"><div class="h">14:30</div><div class="c"><div class="slot"><div class="tx"><div class="n">Lucas Martin</div><div class="m">Coupe + barbe · 45 min</div></div>'+av('KA')+'</div></div></div>'+
  '<div class="tl"><div class="h">15:15</div><div class="c"><div class="free">Libre · 15:15 – 16:00</div></div></div>'+
  '<div class="tl"><div class="h">16:00</div><div class="c"><div class="slot"><div class="tx"><div class="n">Thomas R.</div><div class="m">Coupe enfant · 20 min</div></div>'+av('KA')+'</div></div></div>'
}),
phone({cap:'Mon poste — Crédit', sub:'Solde, recherche, produits sur 2 lignes qui défilent, scan caméra, « Je l\'ai pris » (bloqué à 0 €).', bar:'poste', on:2,
  top:'<div class="topbar"><div class="salon-btn">'+av('KA')+'Karim</div><span class="chip green" style="font-size:13px;padding:6px 10px">En poste</span></div>', body:
  title('Mon crédit produits')+
  card('<div class="card-h">Solde disponible</div><div class="big">8,50 €</div><div class="note">Rechargez votre crédit à la caisse.</div>')+
  btn('Scanner un produit','','scan')+
  '<div class="search">'+ic('search',17)+'Ou touchez le produit</div>'+
  '<div class="hscroll">'+
  ['Cire mate 100 ml|11,50 €|1','Peigne bois|6,00 €|0','Shampoing 250 ml|9,00 €|0','Huile à barbe|14,00 €|1','Gel fixation|7,50 €|0','Poudre volume|12,00 €|1','Baume barbe|10,00 €|1','Laque|8,00 €|0'].map(function(p){var a=p.split('|');return '<div class="prod" style="min-height:96px'+(a[2]==='1'?';opacity:.45':'')+'"><div class="n">'+a[0]+'</div><div><div class="p">'+a[1]+'</div>'+(a[2]==='1'?'<div class="m">Crédit insuffisant</div>':'<div class="m" style="color:var(--blue);font-weight:600">Je l\'ai pris</div>')+'</div></div>';}).join('')+
  '</div>'+
  sec('Derniers mouvements')+
  card(row({t:'Cire mate 100 ml',m:'Hier 18:02',r:'<span class="a">−11,50 €</span>'})+row({t:'Recharge à la caisse',m:'12 nov.',r:'<span class="a" style="color:var(--green)">+20,00 €</span>'}),{flush:1})
}),
phone({cap:'Timer', sub:'Démarrage avant l\'heure du RDV selon les réglages (salon ou par coiffeur).', bar:'poste', on:1,
  top:'<div class="topbar"><div class="salon-btn">'+av('KA')+'Karim</div><span class="chip green" style="font-size:13px;padding:6px 10px">En poste</span></div>', body:
  '<div style="text-align:center;margin-top:30px"><div class="subtitle">Coupe en cours · Lucas Martin</div>'+
  '<div style="width:250px;height:250px;margin:24px auto;border-radius:50%;background:conic-gradient(var(--blue) 0 62%,var(--fill) 62% 100%);display:grid;place-items:center"><div style="width:216px;height:216px;border-radius:50%;background:var(--bg);display:grid;place-items:center"><div><div class="big" style="font-size:52px">17:04</div><div class="note">sur 45 min</div></div></div></div></div>'+
  '<div class="btns">'+btn('Terminé','green','check')+'</div>'+
  card(row({t:'Suivant',m:'16:00 · Thomas R. · Coupe enfant',reg:1}),{flush:1})
}),
phone({cap:'Lien « agenda » (tablette partagée)', sub:'Agenda + Timer + Déconnexion. Pas de caisse ni de clôture. Reste ouvert même caisse clôturée.', bar:'agenda', on:0,
  top:'<div class="topbar"><div class="salon-btn"><span class="salon-ic">'+ic('cal',15)+'</span>Agenda · TBO Oyonnax</div></div>', body:
  title('Agenda','Jeudi 19 novembre')+
  seg(['Jour','Semaine','Mois'],0)+
  chips(['Tous','Karim','Mehdi L.','Yanis'],0)+
  '<div class="tl"><div class="h">14:30</div><div class="c"><div class="slot"><div class="tx"><div class="n">Lucas Martin</div><div class="m">Coupe + barbe · Karim</div></div>'+av('KA')+'</div><div class="slot"><div class="tx"><div class="n">Adam K.</div><div class="m">Coupe · Yanis</div></div>'+av('YS')+'</div></div></div>'+
  '<div class="tl"><div class="h">15:15</div><div class="c"><div class="slot"><div class="tx"><div class="n">Sofiane B.</div><div class="m">Dégradé · Mehdi L.</div></div>'+av('ML')+'</div></div></div>'+
  '<div class="tl"><div class="h">16:00</div><div class="c"><div class="slot"><div class="tx"><div class="n">Thomas R.</div><div class="m">Coupe enfant · Karim</div></div>'+av('KA')+'</div></div></div>'
})
]);

/* ================================== ESPACE CLIENT ================================== */
group('client', 'Espace client',
  "Espace client (compte.html) : accueil public, connexion, inscription avec consentement CGU, accueil connecté (fidélité avec image entière et bouton « i »), réservation en étapes, compte, changement de salon.",
[
phone({cap:'Accueil (sans session)', sub:'Point d\'entrée de l\'app : client, coiffeur (PIN), admin.', body:
  '<div style="text-align:center;margin:44px 0 30px"><div style="width:84px;height:84px;border-radius:22px;background:var(--ink);color:var(--bg);display:grid;place-items:center;margin:0 auto 16px;font-weight:800;font-size:26px;letter-spacing:-1px">TBO</div><div class="title">The Barber One</div><div class="subtitle">Votre salon, dans votre poche</div></div>'+
  btn('Prendre rendez-vous','','cal')+btn('Mon compte client','sec2','user')+
  '<div style="height:24px"></div>'+
  card(row({l:rowIc('pin','#8e8e93'),t:'Espace coiffeur',m:'Connexion par code PIN',reg:1,chev:1})+row({l:rowIc('grid','#8e8e93'),t:'Espace gérant',m:'Email et mot de passe',reg:1,chev:1}),{flush:1,inset:58})
}),
phone({cap:'Connexion client', sub:'Email + mot de passe, renvoyer le lien, mot de passe oublié, créer un compte.', top:navbar('Retour','',''), body:
  '<div class="title" style="margin:8px 0 2px">Bon retour</div><div class="subtitle" style="margin-bottom:22px">Connectez-vous pour gérer votre compte</div>'+
  fld('Salon','TBO Oyonnax <span style="color:var(--grey)">⌄</span>')+fld('Email','vous@exemple.fr',1)+fld('Mot de passe','••••••••')+
  btn('Se connecter')+
  '<div style="display:flex;justify-content:space-between;font-size:15px;font-weight:600;color:var(--blue);margin:6px 4px 0"><span>Créer un compte</span><span>Mot de passe oublié ?</span></div>'
}),
phone({cap:'Créer un compte', sub:'Nom, email, téléphone avec indicatif, mot de passe, case CGU + confidentialité obligatoire.', top:navbar('Retour','',''), body:
  '<div class="title" style="margin:8px 0 2px">Créer un compte</div><div class="subtitle" style="margin-bottom:22px">Pour gérer vos rendez-vous, votre fidélité et vos cadeaux</div>'+
  fld('Nom','Votre nom',1)+fld('Email','vous@exemple.fr',1)+
  '<div class="fld"><label>Téléphone</label><div style="display:flex;gap:8px"><div class="input" style="width:96px">🇫🇷 +33</div><div class="input ph" style="flex:1">6 12 34 56 78</div></div></div>'+
  fld('Mot de passe','6 caractères minimum',1)+
  '<div style="display:flex;gap:10px;align-items:flex-start;margin:4px 4px 18px;font-size:13.5px;color:var(--grey);line-height:1.45"><span class="check on" style="border-radius:6px"></span><span>J\'accepte les <span style="color:var(--blue)">conditions d\'utilisation</span> et j\'ai lu la <span style="color:var(--blue)">politique de confidentialité</span>.</span></div>'+
  btn('Créer mon compte')+'<div style="text-align:center;color:var(--blue);font-weight:600;font-size:15px">‹ J\'ai déjà un compte</div>'
}),
phone({cap:'Accueil client (connecté)', sub:'Salon (si plusieurs comptes), Prendre RDV, carte fidélité (image entière + « i »), cadeaux, prochains RDV, dernier passage.', bar:'client', on:0,
  top:'<div class="topbar"><div class="salon-btn"><span class="salon-ic">'+ic('shop',15)+'</span>TBO Oyonnax <span style="color:var(--grey)">⌄</span></div>'+av('LM').replace('#0a84ff','#34c759')+'</div>', body:
  title('Bonjour, <em>Lucas</em>')+
  btn('Prendre rendez-vous','','cal')+
  sec('Fidélité')+
  '<div class="loy"><span class="i">i</span><div><div style="font-size:13px;opacity:.85;font-weight:600;text-transform:uppercase;letter-spacing:.6px">TBO Oyonnax</div><div style="font-size:22px;font-weight:700;margin-top:2px">12 points</div></div><div class="stamps"><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i><i class="f"></i></div></div>'+
  '<div class="info" style="margin-top:-2px">🎉 Récompense disponible : −20 % sur une prestation. À utiliser au salon.</div>'+
  sec('Vos prochains rendez-vous')+
  card(row({l:'<span class="time">14:30<small>auj.</small></span>',t:'Coupe + barbe',m:'avec Karim · 35,00 €',r:'<span class="chip red">Annuler</span>'}),{flush:1})+
  sec('Mes cadeaux')+
  '<div class="gift"><div style="font-size:13px;opacity:.9;font-weight:600">🎁 Carte cadeau</div><div style="font-size:24px;font-weight:700;margin-top:4px">40,00 €</div><div style="font-size:13px;opacity:.9;margin-top:6px">Code K7P2-QX · offerte par Inès</div></div>'+
  sec('Dernier passage')+
  card(row({t:'Coupe + barbe',m:'12 oct. · Karim',reg:1}),{flush:1})
}),
phone({cap:'Détails de la carte (bouton « i »)', sub:'Paliers et règles, comme sur le web.', bar:'client', on:0, body:title('Bonjour, <em>Lucas</em>'),
  over:'<div class="sheet-dim"></div><div class="sheet" style="top:300px"><div class="grab"></div>'+navbar('','Carte fidélité','Fermer')+'<div class="scroll nobar">'+
  card(row({l:rowIc('pct','#0a84ff'),t:'10 points',m:'−20 % sur une prestation',r:chip('Disponible','green')})+row({l:rowIc('gift','#ff9f0a'),t:'20 points',m:'Article offert : Cire mate',r:'<span class="v">encore 8</span>'}),{flush:1,inset:58})+
  '<div class="note" style="margin:0 6px">1 point par passage payé. Utiliser une récompense au salon retire ses points.</div></div></div>'
}),
phone({cap:'Réserver — étapes', sub:'Prestation → suppléments → produit (optionnel) → coiffeur → date et créneau → confirmation. « Utiliser un cadeau » par code.', bar:'client', on:1, top:navbar('Retour','Étape 1 sur 4',''), body:
  '<div style="display:flex;gap:6px;margin-bottom:18px">'+'<span style="flex:1;height:4px;border-radius:2px;background:var(--blue)"></span><span style="flex:1;height:4px;border-radius:2px;background:var(--fill)"></span><span style="flex:1;height:4px;border-radius:2px;background:var(--fill)"></span><span style="flex:1;height:4px;border-radius:2px;background:var(--fill)"></span></div>'+
  title('Prestation')+
  card(row({l:'<span class="check"></span>',t:'Coupe',m:'30 min',r:'<span class="a">20,00 €</span>'})+row({l:'<span class="check on"></span>',t:'Coupe + barbe',m:'45 min',r:'<span class="a">35,00 €</span>'})+row({l:'<span class="check"></span>',t:'Dégradé',m:'30 min',r:'<span class="a">22,00 €</span>'})+row({l:'<span class="check"></span>',t:'Coupe enfant',m:'20 min',r:'<span class="a">15,00 €</span>'}),{flush:1,inset:50})+
  card(row({l:rowIc('gift','#ff9f0a'),t:'Utiliser un cadeau',m:'Saisissez le code reçu par email',reg:1,chev:1}),{flush:1,inset:58})+
  btn('Suivant')
}),
phone({cap:'Réserver — date et créneau', sub:'Calendrier (jours sans créneau grisés), Matin / Après-midi.', bar:'client', on:1, top:navbar('Retour','Étape 3 sur 4',''), body:
  '<div style="display:flex;gap:6px;margin-bottom:18px"><span style="flex:1;height:4px;border-radius:2px;background:var(--blue)"></span><span style="flex:1;height:4px;border-radius:2px;background:var(--blue)"></span><span style="flex:1;height:4px;border-radius:2px;background:var(--blue)"></span><span style="flex:1;height:4px;border-radius:2px;background:var(--fill)"></span></div>'+
  title('Date','Coupe + barbe · avec Karim')+
  '<div class="week"><div>Jeu<b>19</b></div><div class="on">Ven<b>20</b></div><div>Sam<b>21</b></div><div style="opacity:.35">Dim<b>22</b></div><div>Lun<b>23</b></div><div>Mar<b>24</b></div><div>Mer<b>25</b></div></div>'+
  '<div class="card-h" style="margin:4px 4px 8px">Matin</div>'+
  '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">'+['9:00','9:45','10:30','11:15'].map(function(h,i){return '<span class="chip'+(i===2?' blue':'')+'" style="text-align:center;padding:10px 0;font-size:15px;background:'+(i===2?'var(--blue)':'var(--card)')+';color:'+(i===2?'#fff':'var(--ink)')+';box-shadow:var(--shadow)">'+h+'</span>';}).join('')+'</div>'+
  '<div class="card-h" style="margin:4px 4px 8px">Après-midi</div>'+
  '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:22px">'+['14:00','14:45','15:30','16:15','17:00','17:45'].map(function(h){return '<span class="chip" style="text-align:center;padding:10px 0;font-size:15px;background:var(--card);box-shadow:var(--shadow)">'+h+'</span>';}).join('')+'</div>'+
  btn('Confirmer le rendez-vous')
}),
phone({cap:'Compte client', sub:'Mes informations, mes proches, changer mon mot de passe.', bar:'client', on:2, top:'<div style="height:6px"></div>', body:
  title('Compte')+
  card(frow('Nom','Lucas Martin',{chev:1})+frow('Email','lucas.martin@mail.fr',{chev:1})+frow('Téléphone','+33 6 12 34 56 78',{chev:1}),{flush:1,h:'Mes informations'})+
  sec('Mes proches','Ajouter')+
  card(row({l:av('NM').replace('#0a84ff','#af52de'),t:'Noah',m:'Peut avoir des RDV à votre nom',reg:1,chev:1}),{flush:1,inset:62})+
  card(row({l:rowIc('lock','#8e8e93'),t:'Changer mon mot de passe',reg:1,chev:1}),{flush:1,inset:58})
})
]);

/* ================================ Rendu de la page ================================ */
(function(){
  var nav=document.getElementById('nav'), main=document.getElementById('main');
  GROUPS.forEach(function(g,i){
    var a=document.createElement('a'); a.textContent=g.label; a.dataset.id=g.id; nav.appendChild(a);
    var p=document.createElement('section'); p.className='page'; p.id='p-'+g.id;
    p.innerHTML='<p class="group-intro">'+g.intro+'</p><div class="screens">'+g.shots.join('')+'</div>';
    main.appendChild(p);
  });
  function show(id){
    if(!document.getElementById('p-'+id)) id=GROUPS[0].id;
    [].forEach.call(document.querySelectorAll('.page'),function(p){p.classList.toggle('on',p.id==='p-'+id);});
    [].forEach.call(nav.children,function(a){a.classList.toggle('on',a.dataset.id===id);});
  }
  nav.addEventListener('click',function(e){var a=e.target.closest('a');if(a){location.hash=a.dataset.id;show(a.dataset.id);window.scrollTo(0,0);}});
  window.addEventListener('hashchange',function(){show(location.hash.slice(1));});
  show(location.hash.slice(1));
  var dark=false, btn=document.getElementById('themeBtn');
  function apply(){ [].forEach.call(document.querySelectorAll('.screen'),function(s){s.classList.toggle('dark',dark);s.classList.toggle('light',!dark);}); document.body.classList.toggle('dk',dark); btn.textContent=dark?'Mode clair':'Mode sombre'; }
  btn.addEventListener('click',function(){dark=!dark;apply();});
  apply();
})();
