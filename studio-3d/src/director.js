/*
 * Réalisateur automatique.
 * À partir du scénario analysé, calcule un « plan de tournage » entièrement déterministe :
 * durée de chaque temps, découpage caméra, déplacements, gestes, postures et éclairages.
 * La scène 3D se contente ensuite d'évaluer ce plan à l'instant t (lecture, saut, export).
 */
(function (racine, fabrique) {
  const api = fabrique(racine.ScenarioParser || (typeof require === 'function' ? require('./parser.js') : null));
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.Director = api;
})(typeof self !== 'undefined' ? self : this, function (Parser) {
  'use strict';

  const normaliser = Parser.normaliser;

  const VITESSE_MARCHE = 1.35; // m/s
  const VITESSE_COURSE = 3.6;
  const DUREE_ETABLISSEMENT = 2.8;
  const DUREE_TITRE = 3.2;

  // ---------- Décors et éclairages ----------

  const DECORS = {
    place:  { nom: 'Place de village', exterieur: true,
              reperes: { centre: [0, 0], gauche: [-3.2, 0.4], droite: [3.2, 0.4], fond: [0, -3.5], devant: [0, 2.4],
                         porte: [-6.5, -3], fontaine: [0, -5.2], banc: [4.6, -2.4] },
              entree: [-9, 1], sieges: [[4.6, -2.4], [3.6, -2.4]] },
    rue:    { nom: 'Rue', exterieur: true,
              reperes: { centre: [0, 0], gauche: [-3.5, 0], droite: [3.5, 0], fond: [0, -2], devant: [0, 2],
                         porte: [2, -3.4], lampadaire: [-4, -2.6], banc: [-1.8, -2.8] },
              entree: [-10, 0.5], sieges: [[-1.8, -2.8], [-2.6, -2.8]] },
    foret:  { nom: 'Forêt', exterieur: true,
              reperes: { centre: [0, 0], gauche: [-3, 0.5], droite: [3, 0.5], fond: [0, -4], devant: [0, 2.4],
                         souche: [2.4, -1.6], arbre: [-3, -3] },
              entree: [-9, -1], sieges: [[2.4, -1.6], [-2.2, -1.2]] },
    salon:  { nom: 'Salon', exterieur: false,
              reperes: { centre: [0, 0.3], gauche: [-2.6, 0.5], droite: [2.6, 0.5], fond: [0, -2.6], devant: [0, 2],
                         porte: [-4.6, -1.5], canape: [0, -2.4], table: [0, -1], fenetre: [3.5, -3.6] },
              entree: [-6.5, -1.5], sieges: [[-0.6, -2.4], [0.6, -2.4], [2.6, -1.2]] },
    cafe:   { nom: 'Café', exterieur: false,
              reperes: { centre: [0, 0.4], gauche: [-2.8, 0.6], droite: [2.8, 0.6], fond: [0, -2.8], devant: [0, 2.2],
                         porte: [-5, 1.2], comptoir: [2.8, -3.2], table: [-1.6, -1.3] },
              entree: [-7, 1.2], sieges: [[-2.4, -1.3], [-0.8, -1.3], [2.4, -0.2]] },
    bureau: { nom: 'Bureau', exterieur: false,
              reperes: { centre: [0, 0.4], gauche: [-2.6, 0.5], droite: [2.6, 0.5], fond: [0, -2.8], devant: [0, 2.2],
                         porte: [4.6, -0.5], bureau: [0, -2], fenetre: [-3.5, -3.6] },
              entree: [6.8, -0.5], sieges: [[0, -2.7], [-1.5, -0.9], [1.5, -0.9]] }
  };

  const MOTS_DECORS = [
    ['foret', /foret|bois|parc|jardin|clairiere|chemin|campagne|montagne/],
    ['cafe', /cafe|bar|bistro|restaurant|cantine|terrasse|auberge|boulangerie|boutique|magasin/],
    ['bureau', /bureau|redaction|mairie|ecole|classe|salle|commissariat|laboratoire|studio/],
    ['salon', /salon|maison|appartement|chambre|cuisine|chez|domicile|grenier/],
    ['rue', /rue|ruelle|avenue|boulevard|quai|trottoir|gare|pont|parking/],
    ['place', /place|marche|village|fontaine|square|cour|port/]
  ];

  function choisirDecor(scene) {
    if (scene.decor) {
      const n = normaliser(scene.decor);
      if (DECORS[n]) return n;
      for (const [nom, motif] of MOTS_DECORS) if (motif.test(n)) return nom;
    }
    const lieu = normaliser(scene.lieu || '');
    for (const [nom, motif] of MOTS_DECORS) if (motif.test(lieu)) return nom;
    return scene.interieur ? 'salon' : 'place';
  }

  const ECLAIRAGES = ['jour', 'aube', 'crepuscule', 'nuit', 'interieur', 'interieur_nuit', 'orage', 'neon', 'tamise'];
  const MOTS_ECLAIRAGES = [
    ['orage', /orage|eclair|tempete/],
    ['neon', /neon|cyber|fluo/],
    ['tamise', /tamise|bougie|intime|feutre|chandelle/],
    ['aube', /aube|aurore|matin/],
    ['crepuscule', /crepuscule|coucher|soir|dore/],
    ['nuit', /nuit|sombre|lune|obscur/],
    ['jour', /jour|soleil|midi|clair/]
  ];

  function choisirEclairage(valeur, interieur, moment) {
    if (valeur) {
      const n = normaliser(valeur);
      if (ECLAIRAGES.includes(n)) return n;
      for (const [nom, motif] of MOTS_ECLAIRAGES) {
        if (motif.test(n)) return interieur && nom === 'nuit' ? 'interieur_nuit' : nom;
      }
    }
    if (interieur) return moment === 'nuit' || moment === 'crepuscule' ? 'interieur_nuit' : 'interieur';
    return moment || 'jour';
  }

  function choisirMeteo(valeur) {
    const n = normaliser(valeur || '');
    if (/pluie|pleut|averse|orage/.test(n)) return 'pluie';
    if (/brouillard|brume/.test(n)) return 'brouillard';
    if (/neige/.test(n)) return 'neige';
    return null;
  }

  // ---------- Actions ----------

  // Ordre important : le premier motif trouvé l'emporte.
  const VERBES = [
    ['entrer', /\b(entre|entrent|arrive|arrivent|apparait|apparaissent|surgit)\b/],
    ['sortir', /\b(sort|sortent|part|partent|s'en va|s'en vont|quitte|quittent|s'eloigne|s'eloignent)\b/],
    ['courir', /\b(court|courent|se precipite|se precipitent|fonce|foncent|s'enfuit)\b/],
    ['marcher', /\b(marche|marchent|va|vont|avance|avancent|s'approche|s'approchent|rejoint|rejoignent|se dirige|se dirigent|traverse|traversent|recule|reculent|retourne)\b/],
    ['assis', /\b(s'assoit|s'assied|s'assoient|s'asseyent|s'installe|s'installent)\b/],
    ['debout', /\b(se leve|se levent|se redresse)\b/],
    ['saluer', /\b(salue|saluent|fait signe|font signe|agite la main)\b/],
    ['pointer', /\b(pointe|pointent|montre|montrent|designe|designent|indique)\b/],
    ['acquiescer', /\b(hoche la tete|acquiesce|acquiescent|approuve)\b/],
    ['refuser', /\b(secoue la tete|refuse|refusent|nie)\b/],
    ['bras_croises', /\b(croise les bras|croisent les bras)\b/],
    ['retourner', /\b(se retourne|se retournent|tourne le dos|tournent le dos)\b/],
    ['sursauter', /\b(sursaute|sursautent|bondit|recule d'un pas)\b/],
    ['rire', /\b(rit|rient|eclate de rire|ricane|pouffe)\b/],
    ['pleurer', /\b(pleure|pleurent|sanglote)\b/],
    ['reflechir', /\b(reflechit|hesite|medite|se gratte)\b/],
    ['danser', /\b(danse|dansent)\b/],
    ['regarder', /\b(regarde|regardent|observe|fixe|scrute)\b/],
    ['chuchoter', /\b(chuchote|murmure|glisse a l'oreille)\b/]
  ];

  const DUREES_GESTES = {
    saluer: 2, pointer: 2, acquiescer: 1.4, refuser: 1.4, sursauter: 1.1, rire: 2.2, pleurer: 3,
    reflechir: 2.6, danser: 4, regarder: 1.6, chuchoter: 2, retourner: 1.2
  };

  function trouverMentions(texteNormalise, personnages) {
    const mentions = [];
    for (const p of personnages) {
      const nom = normaliser(p.nom).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const motif = new RegExp(`(^|[^a-z0-9])${nom}(?![a-z0-9])`, 'g');
      let m;
      while ((m = motif.exec(texteNormalise))) mentions.push({ id: p.id, index: m.index + m[1].length });
    }
    return mentions.sort((a, b) => a.index - b.index);
  }

  function analyserAction(texte, personnages, decor) {
    const n = normaliser(texte);
    let verbe = null;
    let indexVerbe = -1;
    for (const [nom, motif] of VERBES) {
      const m = n.match(motif);
      if (m) { verbe = nom; indexVerbe = m.index; break; }
    }
    const mentions = trouverMentions(n, personnages);
    let sujets = [];
    let cible = null;
    if (indexVerbe >= 0) {
      sujets = [...new Set(mentions.filter(m => m.index < indexVerbe).map(m => m.id))];
      const apres = mentions.filter(m => m.index > indexVerbe && !sujets.includes(m.id));
      if (apres.length) cible = { personnage: apres[0].id };
    }
    if (!sujets.length && mentions.length) {
      sujets = [mentions[0].id];
      const autre = mentions.find(m => m.id !== mentions[0].id);
      if (autre && !cible) cible = { personnage: autre.id };
    }
    if (!cible) {
      for (const repere of Object.keys(decor.reperes)) {
        if (new RegExp(`\\b${repere}\\b`).test(n)) { cible = { repere }; break; }
      }
      if (!cible && /\b(a gauche|vers la gauche)\b/.test(n)) cible = { repere: 'gauche' };
      if (!cible && /\b(a droite|vers la droite)\b/.test(n)) cible = { repere: 'droite' };
      if (!cible && /\b(au centre|au milieu)\b/.test(n)) cible = { repere: 'centre' };
      if (!cible && /\b(au fond)\b/.test(n)) cible = { repere: 'fond' };
    }
    return { verbe, sujets, cible };
  }

  // ---------- Caméra ----------

  const MOTS_CAMERA = [
    ['gros_plan', /gros plan|tres gros|serre|visage/],
    ['amorce', /amorce|par-dessus|epaule|champ.contrechamp|contrechamp/],
    ['plongee', /plongee/],
    ['contre_plongee', /contre.plongee/],
    ['travelling', /travelling|suit|suivi|accompagne/],
    ['deux', /plan a deux|deux personnages|two.shot|duo/],
    ['moyen', /plan moyen|americain|taille|moyen/],
    ['large', /large|ensemble|general|etablissement|panorama|vue d'ensemble/]
  ];

  function lireCamera(valeur, personnages) {
    const n = normaliser(valeur);
    let type = 'moyen';
    // contre-plongée doit passer avant plongée.
    if (/contre.plongee/.test(n)) type = 'contre_plongee';
    else for (const [nom, motif] of MOTS_CAMERA) if (motif.test(n)) { type = nom; break; }
    const mentions = trouverMentions(n, personnages);
    return { type, sujet: mentions[0] ? mentions[0].id : null, cible: mentions[1] ? mentions[1].id : null, impose: true };
  }

  // ---------- Plan de tournage ----------

  function dureeReplique(texte, emotion) {
    const mots = texte.split(/\s+/).filter(Boolean).length;
    const ponctuation = (texte.match(/[,;:.!?…]/g) || []).length * 0.12;
    const rythme = emotion === 'colere' || emotion === 'peur' ? 0.3 : emotion === 'tristesse' || emotion === 'chuchote' ? 0.42 : 0.36;
    return Math.max(1.6, Math.round((0.7 + mots * rythme + ponctuation) * 100) / 100);
  }

  function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

  function placementsInitiaux(ids, decor) {
    const positions = {};
    const n = ids.length;
    const centre = decor.reperes.centre;
    ids.forEach((id, i) => {
      // Arc légèrement concave face à la caméra principale.
      const x = (i - (n - 1) / 2) * 1.7;
      const z = -Math.abs(i - (n - 1) / 2) * 0.35;
      positions[id] = [centre[0] + x, centre[1] + z];
    });
    return positions;
  }

  function construirePlan(scenario) {
    const personnages = scenario.personnages;
    const plan = {
      titre: scenario.titre,
      personnages: personnages.map(p => ({ ...p })),
      scenes: [], temps: [], deplacements: [], gestes: [], postures: [], orientations: [],
      visibilites: [], eclairages: [], duree: 0, avertissements: [...scenario.avertissements]
    };
    let t = 0;

    // Carton de titre.
    plan.temps.push({ id: 0, scene: scenario.scenes.length ? 0 : -1, type: 'titre', debut: 0, fin: DUREE_TITRE,
                      texte: scenario.titre, plan: { type: 'titre' }, description: 'Carton de titre' });
    t = DUREE_TITRE;

    scenario.scenes.forEach((sc, indexScene) => {
      const nomDecor = choisirDecor(sc);
      const decor = DECORS[nomDecor];
      const interieur = sc.interieur === null ? !decor.exterieur : sc.interieur;
      const eclairageInitial = choisirEclairage(sc.lumiere, interieur, sc.moment);
      const scene = {
        index: indexScene, numero: sc.numero, entete: sc.entete, lieu: sc.lieu, decor: nomDecor,
        nomDecor: decor.nom, interieur, moment: sc.moment, meteo: choisirMeteo(sc.meteo || (eclairageInitial === 'orage' ? 'pluie' : '')),
        debut: t, fin: t, distribution: [], positionsInitiales: {}, reperes: decor.reperes
      };
      plan.eclairages.push({ scene: indexScene, t, preset: eclairageInitial });

      // Pré-analyse : qui est présent, qui entre en cours de scène.
      const actions = sc.temps.map(x => x.type === 'action' ? analyserAction(x.texte, personnages, decor) : null);
      const vus = new Set();
      const entrants = new Set();
      sc.temps.forEach((x, i) => {
        const ids = x.type === 'dialogue' ? [x.personnage] : actions[i] ? [...actions[i].sujets, ...(actions[i].cible && actions[i].cible.personnage ? [actions[i].cible.personnage] : [])] : [];
        ids.forEach((id, k) => {
          if (vus.has(id)) return;
          vus.add(id);
          if (x.type === 'action' && actions[i].verbe === 'entrer' && actions[i].sujets.includes(id) && k < actions[i].sujets.length) entrants.add(id);
        });
      });
      scene.distribution = [...vus];
      const presents = scene.distribution.filter(id => !entrants.has(id));
      const positions = placementsInitiaux(presents, decor);
      // Les entrants attendent hors champ, près de l'entrée.
      [...entrants].forEach((id, i) => { positions[id] = [decor.entree[0], decor.entree[1] + i * 0.8]; });
      scene.positionsInitiales = JSON.parse(JSON.stringify(positions));
      const presence = new Set(presents);
      scene.distribution.forEach(id => plan.visibilites.push({ scene: indexScene, personnage: id, t, visible: presence.has(id) }));
      const assis = new Set();
      const dosTourne = new Map();

      // Plan d'établissement.
      plan.temps.push({ id: plan.temps.length, scene: indexScene, type: 'etablissement', debut: t, fin: t + DUREE_ETABLISSEMENT,
                        texte: sc.entete, plan: { type: 'large', ouverture: true }, description: `${decor.nom} — plan d'ensemble` });
      t += DUREE_ETABLISSEMENT;

      let cameraImposee = null;
      let dernierLocuteur = null;
      let compteurDialogue = 0;

      function finirDos(id, instant) {
        if (dosTourne.has(id)) {
          const o = dosTourne.get(id);
          o.fin = instant;
          dosTourne.delete(id);
        }
      }

      function cibleVers(id, cible, sujetsGroupe, indexGroupe) {
        if (!cible) return null;
        if (cible.personnage && positions[cible.personnage]) {
          const pc = positions[cible.personnage];
          const depart = positions[id];
          const dx = depart[0] - pc[0], dz = depart[1] - pc[1];
          const d = Math.hypot(dx, dz) || 1;
          const ecart = 1.15 + indexGroupe * 0.9;
          // On s'arrête à distance de conversation, du côté d'où l'on vient.
          return [pc[0] + dx / d * ecart, pc[1] + dz / d * ecart];
        }
        if (cible.repere && decor.reperes[cible.repere]) {
          const r = decor.reperes[cible.repere];
          return [r[0] + indexGroupe * 0.9, r[1] + (cible.repere === 'banc' || cible.repere === 'canape' ? 0.6 : 0)];
        }
        return null;
      }

      function nearestSeat(pos) {
        let meilleur = null, dMin = Infinity;
        for (const s of decor.sieges) {
          const d = distance(pos, s);
          const occupe = [...assis].some(id => distance(positions[id], s) < 0.4);
          if (!occupe && d < dMin && d < 3.5) { dMin = d; meilleur = s; }
        }
        return meilleur;
      }

      function deplacer(id, vers, debut, mode) {
        const de = positions[id];
        const d = distance(de, vers);
        if (d < 0.05) return 0;
        const duree = d / (mode === 'courir' ? VITESSE_COURSE : VITESSE_MARCHE);
        plan.deplacements.push({ scene: indexScene, personnage: id, debut, fin: debut + duree, de: [...de], vers: [...vers], mode });
        positions[id] = [...vers];
        finirDos(id, debut);
        return duree;
      }

      sc.temps.forEach((x, i) => {
        if (x.type === 'directive') {
          if (x.cle === 'camera') cameraImposee = lireCamera(x.valeur, personnages);
          else if (x.cle === 'lumiere') plan.eclairages.push({ scene: indexScene, t, preset: choisirEclairage(x.valeur, interieur, sc.moment) });
          else if (x.cle === 'meteo') { const m = choisirMeteo(x.valeur); if (m) scene.meteo = m; }
          else if (x.cle === 'decor') plan.avertissements.push(`Ligne ${x.ligne} : DÉCOR doit être placé avant le premier dialogue ou la première action de la scène (ignoré).`);
          return;
        }

        if (x.type === 'pause') {
          plan.temps.push({ id: plan.temps.length, scene: indexScene, type: 'pause', debut: t, fin: t + x.duree,
                            plan: cameraImposee || { type: 'large' }, description: `Pause (${x.duree} s)`, ligne: x.ligne });
          cameraImposee = null;
          t += x.duree;
          return;
        }

        if (x.type === 'dialogue') {
          const id = x.personnage;
          if (!presence.has(id)) {
            // Un personnage qui parle sans être entré apparaît sur place.
            presence.add(id);
            if (distance(positions[id] || decor.entree, decor.entree) < 0.5 || !positions[id]) {
              const libres = placementsInitiaux([...presence], decor);
              positions[id] = libres[id];
            }
            plan.visibilites.push({ scene: indexScene, personnage: id, t, visible: true });
          }
          const autres = [...presence].filter(o => o !== id);
          let interlocuteur = dernierLocuteur && dernierLocuteur !== id && presence.has(dernierLocuteur) ? dernierLocuteur : null;
          if (!interlocuteur && autres.length) {
            interlocuteur = autres.reduce((a, b) => distance(positions[a], positions[id]) <= distance(positions[b], positions[id]) ? a : b);
          }
          const duree = dureeReplique(x.texte, x.emotion);
          let cadre;
          if (cameraImposee) {
            cadre = { ...cameraImposee, sujet: cameraImposee.sujet || id, cible: cameraImposee.cible || interlocuteur };
            // « amorce BRUNO » : Bruno au premier plan, on cadre le locuteur.
            if (cadre.type === 'amorce' && cameraImposee.sujet && cameraImposee.sujet !== id) {
              cadre = { ...cadre, sujet: id, cible: cameraImposee.sujet };
            }
          } else if (!interlocuteur) {
            cadre = { type: x.emotion === 'tristesse' || x.emotion === 'peur' ? 'gros_plan' : 'moyen', sujet: id };
          } else if (compteurDialogue === 0) {
            cadre = { type: 'deux', sujet: id, cible: interlocuteur };
          } else if (['colere', 'peur', 'surprise'].includes(x.emotion)) {
            cadre = { type: x.emotion === 'colere' ? 'contre_plongee' : 'gros_plan', sujet: id, cible: interlocuteur };
          } else if (x.emotion === 'chuchote' || x.emotion === 'tristesse' || x.texte.split(/\s+/).length > 16) {
            cadre = { type: 'gros_plan', sujet: id, cible: interlocuteur };
          } else {
            cadre = { type: compteurDialogue % 3 === 2 ? 'moyen' : 'amorce', sujet: id, cible: interlocuteur };
          }
          plan.temps.push({ id: plan.temps.length, scene: indexScene, type: 'dialogue', debut: t, fin: t + duree,
                            personnage: id, interlocuteur, texte: x.texte, emotion: x.emotion, indication: x.indication,
                            plan: cadre, description: `${nomDe(plan, id)} : « ${abreger(x.texte)} »`, ligne: x.ligne });
          finirDos(id, t);
          if (x.emotion === 'joie' && x.indication && /ri/.test(normaliser(x.indication))) {
            plan.gestes.push({ personnage: id, debut: t, fin: t + Math.min(duree, 2), type: 'rire' });
          }
          cameraImposee = null;
          dernierLocuteur = id;
          compteurDialogue++;
          t += duree + 0.15;
          return;
        }

        // Action.
        const a = actions[i];
        let duree = 1.6;
        let typePlan = 'large';
        const sujets = a.sujets.length ? a.sujets : [];
        if (!sujets.length) {
          plan.avertissements.push(`Ligne ${x.ligne} : action sans personnage reconnu, jouée comme plan d'ambiance.`);
          duree = Math.max(2, Math.min(5, x.texte.split(/\s+/).length * 0.3));
        }
        sujets.forEach((id, k) => {
          const dureePerso = (() => {
            switch (a.verbe) {
              case 'entrer': {
                plan.visibilites.push({ scene: indexScene, personnage: id, t, visible: true });
                presence.add(id);
                const libres = placementsInitiaux([...presence], decor);
                const vers = cibleVers(id, a.cible, sujets, k) || libres[id];
                typePlan = 'travelling';
                return deplacer(id, vers, t, 'marcher');
              }
              case 'sortir': {
                if (assis.has(id)) { plan.postures.push({ personnage: id, t, type: 'debout' }); assis.delete(id); }
                const vers = a.cible && a.cible.repere ? cibleVers(id, a.cible, sujets, k) : [decor.entree[0] - 1.5, decor.entree[1] + k];
                const dd = deplacer(id, vers, t + 0.4, 'marcher') + 0.4;
                plan.visibilites.push({ scene: indexScene, personnage: id, t: t + dd, visible: false });
                presence.delete(id);
                typePlan = 'large';
                return dd;
              }
              case 'marcher':
              case 'courir': {
                const etaitAssis = assis.has(id);
                if (etaitAssis) { plan.postures.push({ personnage: id, t, type: 'debout' }); assis.delete(id); }
                let vers = cibleVers(id, a.cible, sujets, k);
                if (!vers) {
                  // Sans destination : quelques pas vers le centre ou vers l'avant.
                  const p = positions[id];
                  const c = decor.reperes.centre;
                  vers = distance(p, c) > 1.5 ? [p[0] + (c[0] - p[0]) * 0.6, p[1] + (c[1] - p[1]) * 0.6] : [p[0], p[1] + 1.4];
                }
                typePlan = 'travelling';
                return deplacer(id, vers, t + (etaitAssis ? 0.8 : 0), a.verbe) + (etaitAssis ? 0.8 : 0);
              }
              case 'assis': {
                const siege = (a.cible && a.cible.repere && decor.reperes[a.cible.repere]) ? nearestSeat(decor.reperes[a.cible.repere]) || null : nearestSeat(positions[id]);
                let dd = 0;
                if (siege) dd = deplacer(id, [siege[0], siege[1]], t, 'marcher');
                plan.postures.push({ personnage: id, t: t + dd, type: 'assis', tabouret: !siege });
                assis.add(id);
                typePlan = 'moyen';
                return dd + 1.2;
              }
              case 'debout':
                plan.postures.push({ personnage: id, t, type: 'debout' });
                assis.delete(id);
                typePlan = 'moyen';
                return 1.2;
              case 'bras_croises':
                plan.postures.push({ personnage: id, t, type: 'bras_croises' });
                typePlan = 'moyen';
                return 1.3;
              case 'retourner': {
                const o = { personnage: id, debut: t, fin: Infinity, type: 'dos' };
                plan.orientations.push(o);
                dosTourne.set(id, o);
                typePlan = 'moyen';
                return 1.4;
              }
              case null:
                typePlan = 'moyen';
                return 2;
              default: {
                const dg = DUREES_GESTES[a.verbe] || 1.8;
                const g = { personnage: id, debut: t, fin: t + dg, type: a.verbe };
                if (a.cible && a.cible.personnage) g.vers = a.cible.personnage;
                plan.gestes.push(g);
                typePlan = ['pointer', 'regarder', 'chuchoter'].includes(a.verbe) && a.cible && a.cible.personnage ? 'deux' : 'moyen';
                if (a.verbe === 'pleurer' || a.verbe === 'rire' || a.verbe === 'sursauter') typePlan = 'gros_plan';
                return dg;
              }
            }
          })();
          duree = Math.max(duree, dureePerso);
        });
        let cadre = cameraImposee
          ? { ...cameraImposee, sujet: cameraImposee.sujet || sujets[0] || null, cible: cameraImposee.cible || (a.cible && a.cible.personnage) || null }
          : { type: sujets.length > 1 && typePlan === 'moyen' ? 'deux' : typePlan, sujet: sujets[0] || null,
              cible: (a.cible && a.cible.personnage) || sujets[1] || null };
        if (cadre.type === 'deux' && !cadre.cible) cadre.type = 'moyen';
        if (!cadre.sujet && cadre.type !== 'large') cadre.type = 'large';
        plan.temps.push({ id: plan.temps.length, scene: indexScene, type: 'action', debut: t, fin: t + duree,
                          texte: x.texte, verbe: a.verbe, sujets, plan: cadre, description: x.texte, ligne: x.ligne });
        cameraImposee = null;
        t += duree + 0.1;
      });

      // Petite respiration de fin de scène.
      t += 0.6;
      scene.fin = t;
      dosTourne.forEach(o => { o.fin = t; });
      plan.orientations.forEach(o => { if (o.fin === Infinity) o.fin = t; });
      plan.scenes.push(scene);
    });

    plan.duree = Math.round(t * 100) / 100;
    if (plan.temps.length && plan.temps[0].type === 'titre' && plan.scenes.length) {
      // Le décor de la première scène apparaît déjà derrière le carton de titre.
      const premier = plan.scenes[0];
      for (const x of [...plan.visibilites, ...plan.eclairages]) if (x.scene === 0 && x.t === premier.debut) x.t = 0;
      premier.debut = 0;
    }
    return plan;
  }

  function nomDe(plan, id) {
    const p = plan.personnages.find(x => x.id === id);
    return p ? p.nom : id;
  }

  function abreger(texte, max = 48) {
    return texte.length > max ? texte.slice(0, max - 1).trimEnd() + '…' : texte;
  }

  // ---------- Requêtes à l'instant t (utilisées par la scène 3D) ----------

  function tempsA(plan, t) {
    const liste = plan.temps;
    let bas = 0, haut = liste.length - 1, trouve = liste[0] || null;
    while (bas <= haut) {
      const m = (bas + haut) >> 1;
      if (liste[m].debut <= t) { trouve = liste[m]; bas = m + 1; } else haut = m - 1;
    }
    return trouve;
  }

  function sceneA(plan, t) {
    let s = plan.scenes[0] || null;
    for (const sc of plan.scenes) if (sc.debut <= t) s = sc;
    return s;
  }

  function positionA(plan, scene, id, t) {
    let pos = scene.positionsInitiales[id] ? [...scene.positionsInitiales[id]] : null;
    let enMouvement = null;
    for (const d of plan.deplacements) {
      if (d.scene !== scene.index || d.personnage !== id || d.debut > t) continue;
      if (t >= d.fin) { pos = [...d.vers]; continue; }
      const k = (t - d.debut) / (d.fin - d.debut);
      const lisse = k * k * (3 - 2 * k) * 0.25 + k * 0.75; // départ et arrêt légèrement adoucis
      pos = [d.de[0] + (d.vers[0] - d.de[0]) * lisse, d.de[1] + (d.vers[1] - d.de[1]) * lisse];
      enMouvement = d;
    }
    return { pos, enMouvement };
  }

  function visibleA(plan, scene, id, t) {
    let v = false;
    for (const x of plan.visibilites) if (x.scene === scene.index && x.personnage === id && x.t <= t) v = x.visible;
    return v;
  }

  function postureA(plan, id, t, scene) {
    let posture = { type: 'debout', t: scene.debut, tabouret: false };
    let bras = false;
    for (const p of plan.postures) {
      if (p.personnage !== id || p.t > t || p.t < scene.debut) continue;
      if (p.type === 'bras_croises') { bras = p.t; continue; }
      posture = p;
      if (p.type === 'debout') bras = false;
    }
    // Les bras se décroisent dès que le personnage parle.
    if (bras !== false) {
      for (const b of plan.temps) if (b.type === 'dialogue' && b.personnage === id && b.debut > bras && b.debut <= t) { bras = false; break; }
    }
    return { posture, brasCroises: bras };
  }

  function eclairageA(plan, scene, t) {
    let courant = null, precedent = null;
    for (const e of plan.eclairages) {
      if (e.scene !== scene.index || e.t > t) continue;
      precedent = courant;
      courant = e;
    }
    return { courant, precedent };
  }

  return {
    construirePlan, tempsA, sceneA, positionA, visibleA, postureA, eclairageA,
    analyserAction, choisirDecor, choisirEclairage, dureeReplique, DECORS, ECLAIRAGES
  };
});
