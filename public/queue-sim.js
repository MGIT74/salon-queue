/* Temps d'attente de la file : UN seul calcul, utilise par le serveur (queueMath.recompute : ticket de la borne,
 * ecran TV, dashboard, email « c'est bientot votre tour ») ET par la borne (tuiles des coiffeurs, ecran de veille).
 *
 * Une « voie » par coiffeur = dans combien de minutes il sera libre :
 *  - au depart : fin de sa pause en cours, puis fin de sa coupe en cours (+5 min de marge si elle deborde) ;
 *  - ses RDV a venir restent a LEUR heure : un client sans RDV ne passe avant que s'il a le temps de finir avant le RDV ;
 *  - les clients en attente, dans l'ordre d'arrivee :
 *      client qui a choisi un coiffeur     -> chez ce coiffeur ;
 *      « Premier disponible » sans RDV     -> le coiffeur sans RDV qui se libere le premier ;
 *      RDV sans coiffeur / arrive en retard -> le premier coiffeur qui se libere.
 *
 * simulate(o) -> { waits: { idEntree: minutes }, nextFor(idCoiffeur|null, dureeMin) }
 *   o.now (ms) ; o.barbers : [{ id, walkin, freeInMin? }] ; o.entries : file (status, barber_id, is_appointment,
 *   checkin_at, start_at, total_duration_min) ; dates en ms ou texte ISO. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QueueSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var OVERRUN_BUFFER_MIN = 5;

  function ms(v) { if (v === null || v === undefined || v === '') return null; var t = typeof v === 'number' ? v : new Date(v).getTime(); return isNaN(t) ? null : t; }
  function dur(e) { return Math.max(0, Number(e && e.total_duration_min) || 0); }

  function simulate(o) {
    var now = ms(o.now) || Date.now();
    var lanes = {}, order = [];
    function lane(id) {
      if (!lanes[id]) { lanes[id] = { t: 0, rdv: [] }; order.push(id); }
      return lanes[id];
    }
    (o.barbers || []).forEach(function (b) { lane(b.id).t = Math.max(0, Number(b.freeInMin) || 0); lanes[b.id].walkin = !!b.walkin; });
    var entries = o.entries || [];

    // Coupes en cours.
    entries.forEach(function (e) {
      if (e.status !== 'in_progress' || !e.barber_id) return;
      var start = ms(e.start_at), elapsed = start ? (now - start) / 60000 : 0;
      var left = dur(e) - elapsed;
      var L = lane(e.barber_id);
      L.t += left > 0 ? left : OVERRUN_BUFFER_MIN;
    });

    // RDV a venir (heure pas encore arrivee) : reserves a leur heure chez leur coiffeur.
    var waits = {}, due = [];
    entries.forEach(function (e) {
      if (e.status !== 'waiting') return;
      var at = ms(e.checkin_at);
      if (e.is_appointment && e.barber_id && at && at > now) lane(e.barber_id).rdv.push({ id: e.id, start: (at - now) / 60000, d: dur(e) });
      else due.push(e);
    });
    order.forEach(function (id) { lanes[id].rdv.sort(function (a, b) { return a.start - b.start; }); });

    // Ou un client de « d » minutes commencerait chez ce coiffeur (sans rien modifier) - et les RDV passes avant lui.
    function tryPlace(id, d) {
      var L = lane(id), t = L.t, i = 0, served = [];
      while (i < L.rdv.length && L.rdv[i].start < t + d) {
        var r = L.rdv[i], s = Math.max(t, r.start);
        served.push({ id: r.id, wait: s }); t = s + r.d; i++;
      }
      return { start: t, used: i, served: served };
    }
    function commit(id, p, d) {
      var L = lane(id);
      p.served.forEach(function (x) { waits[x.id] = Math.round(x.wait); });
      L.rdv.splice(0, p.used);
      L.t = p.start + d;
    }
    function candidates(barberId, walkin) {
      if (barberId) return [barberId];
      var pool = walkin ? order.filter(function (id) { return lanes[id].walkin; }) : [];
      if (!pool.length) pool = order.slice();
      return pool;
    }
    function best(ids, d) {
      var pick = null;
      ids.forEach(function (id) { var p = tryPlace(id, d); if (!pick || p.start < pick.p.start) pick = { id: id, p: p }; });
      return pick;
    }

    // Clients presents, dans l'ordre d'arrivee.
    due.sort(function (a, b) { return (ms(a.checkin_at) || 0) - (ms(b.checkin_at) || 0); });
    due.forEach(function (e) {
      var d = dur(e), pick = best(candidates(e.barber_id, !e.is_appointment), d);
      if (!pick) { waits[e.id] = 0; return; }
      commit(pick.id, pick.p, d);
      waits[e.id] = Math.round(pick.p.start);
    });
    // Etat des voies a ce moment (clients presents places, RDV a venir encore a leur heure) : sert aux NOUVEAUX
    // clients (tuiles de la borne), pour ne pas compter deux fois les RDV.
    var snapshot = JSON.stringify(lanes);
    // RDV a venir restants : a leur heure, ou des que le coiffeur est libre si le client d'avant deborde.
    order.forEach(function (id) {
      var L = lanes[id], t = L.t;
      L.rdv.forEach(function (r) { var s = Math.max(t, r.start); waits[r.id] = Math.round(s); t = s + r.d; });
    });

    // Attente d'un NOUVEAU client : chez ce coiffeur, ou « Premier disponible » (barberId null, coiffeurs sans RDV).
    function nextFor(barberId, d) {
      var saved = lanes; lanes = JSON.parse(snapshot);
      try {
        if (barberId && !lanes[barberId]) return 0;
        var pick = best(candidates(barberId, true), Math.max(0, Number(d) || 0));
        return pick ? Math.round(pick.p.start) : 0;
      } finally { lanes = saved; }
    }
    return { waits: waits, nextFor: nextFor };
  }

  return { simulate: simulate, OVERRUN_BUFFER_MIN: OVERRUN_BUFFER_MIN };
});
