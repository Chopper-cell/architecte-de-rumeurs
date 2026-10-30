/*
 * Analyseur de scénario.
 * Transforme un texte au format « scénario simplifié » en structure de données :
 * titre, personnages, scènes et suite de « temps » (dialogues, actions, directives).
 * Script classique (pas de module) pour fonctionner en ouvrant index.html en file://,
 * et exportable dans Node pour les tests.
 */
(function (racine, fabrique) {
  const api = fabrique();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else racine.ScenarioParser = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Minuscules sans accents : sert à toutes les comparaisons.
  function normaliser(texte) {
    return String(texte)
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[’`]/g, "'")
      .toLowerCase()
      .trim();
  }

  function identifiant(nom) {
    return normaliser(nom).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  }

  // Émotions reconnues entre parenthèses dans un dialogue : (en colère), (rit)...
  const EMOTIONS = [
    ['colere', /col[eè]re|furieu|enrag|crie|hurle|agac|[eé]nerv/],
    ['peur', /peur|effray|terrifi|panique|tremble|angoiss/],
    ['inquietude', /inqui[eè]t|soucieu|nerveu|h[eé]sit|perplexe/],
    ['tristesse', /trist|pleur|sanglot|abattu|d[eé][cç]u|las\b|lasse/],
    ['joie', /joie|joyeu|heureu|rit|rire|sourit|souriant|amus|enthousias|ravi/],
    ['surprise', /surpri|[eé]tonn|stup[eé]f|choqu|incr[eé]dule/],
    ['chuchote', /chuchot|murmur|bas\b|voix basse|confidenti/],
    ['ironie', /ironi|sarcas|moqu|narquois/],
    ['calme', /calme|pos[eé]|serein|doux|douce/]
  ];

  function detecterEmotion(indication) {
    if (!indication) return 'neutre';
    const n = normaliser(indication);
    for (const [emotion, motif] of EMOTIONS) {
      if (motif.test(n)) return emotion;
    }
    return 'neutre';
  }

  const MOMENTS = [
    ['aube', /\b(aube|aurore|petit matin|lever du soleil)\b/],
    ['crepuscule', /\b(crepuscule|soir|soiree|coucher du soleil|fin de journee)\b/],
    ['nuit', /\b(nuit|minuit|nocturne)\b/],
    ['jour', /\b(jour|matin|midi|apres-midi|journee)\b/]
  ];

  // « SCÈNE 2 — EXT. PLACE DU MARCHÉ — NUIT » ou « INT. CAFÉ - JOUR »
  const MOTIF_SCENE = /^(?:(?:sc[eè]ne|sequence|s[eé]quence)\s*\d*\s*[:.\-—–]*\s*)?(?:(int|ext|int\/ext)\.?\s+)(.+)$/i;
  const MOTIF_SCENE_SEULE = /^(?:sc[eè]ne|s[eé]quence)\s*(\d+)?\s*[:.\-—–]*\s*(.*)$/i;

  function analyserEntete(ligne) {
    const brute = ligne.trim();
    let interieur = null;
    let reste = '';
    const m = brute.match(MOTIF_SCENE);
    if (m) {
      interieur = normaliser(m[1]).startsWith('int');
      reste = m[2];
    } else {
      const s = brute.match(MOTIF_SCENE_SEULE);
      if (!s) return null;
      reste = s[2] || '';
      const n = normaliser(reste);
      if (/^int[\.\s]/.test(n)) { interieur = true; reste = reste.replace(/^int\.?\s*/i, ''); }
      else if (/^ext[\.\s]/.test(n)) { interieur = false; reste = reste.replace(/^ext\.?\s*/i, ''); }
    }
    const morceaux = reste.split(/\s+[—–-]\s+|\s*[—–]\s*/).map(x => x.trim()).filter(Boolean);
    let moment = null;
    if (morceaux.length > 1) {
      const dernier = normaliser(morceaux[morceaux.length - 1]);
      for (const [nom, motif] of MOMENTS) {
        if (motif.test(dernier)) { moment = nom; morceaux.pop(); break; }
      }
    }
    const lieu = morceaux.join(' — ') || 'Lieu indéterminé';
    return { entete: brute, lieu, interieur, moment };
  }

  // Lignes « CLÉ: valeur » reconnues comme directives de mise en scène.
  const DIRECTIVES = {
    titre: 'titre', title: 'titre',
    personnage: 'personnage', perso: 'personnage', role: 'personnage',
    decor: 'decor',
    lumiere: 'lumiere', eclairage: 'lumiere',
    camera: 'camera', plan: 'camera',
    ambiance: 'meteo', meteo: 'meteo',
    pause: 'pause', duree: 'pause'
  };

  function analyserAttributs(texte) {
    // « ALICE | couleur=#e07a5f | taille=1.65 | voix=aigue »
    const morceaux = texte.split('|').map(x => x.trim()).filter(Boolean);
    const nom = (morceaux.shift() || '').trim();
    const attributs = {};
    for (const m of morceaux) {
      const [cle, ...valeur] = m.split(/[=:]/);
      if (!cle || !valeur.length) continue;
      attributs[normaliser(cle)] = valeur.join('=').trim();
    }
    return { nom, attributs };
  }

  function nouvellePersonne(nom, attributs, declare) {
    const a = attributs || {};
    const taille = parseFloat(a.taille);
    return {
      id: identifiant(nom),
      nom: nom.trim(),
      couleur: a.couleur || null,
      peau: a.peau || null,
      cheveux: a.cheveux || null,
      taille: isFinite(taille) ? Math.min(2.2, Math.max(1.2, taille)) : null,
      voix: a.voix ? normaliser(a.voix) : null,
      declare: !!declare
    };
  }

  function analyser(texte) {
    const resultat = { titre: 'Sans titre', personnages: [], scenes: [], avertissements: [] };
    const parId = new Map();
    let scene = null;
    let locuteurEnAttente = null; // format « NOM » seul puis réplique sur la ligne suivante

    function ajouterPersonnage(nom, attributs, declare) {
      const id = identifiant(nom);
      if (!id) return null;
      if (parId.has(id)) {
        const p = parId.get(id);
        if (declare) Object.assign(p, nouvellePersonne(p.nom, attributs, true), { nom: p.nom });
        return p;
      }
      const p = nouvellePersonne(nom, attributs, declare);
      parId.set(id, p);
      resultat.personnages.push(p);
      return p;
    }

    function sceneCourante(numLigne) {
      if (!scene) {
        scene = { numero: 1, entete: 'SCÈNE 1', lieu: 'Lieu indéterminé', interieur: null, moment: null,
                  decor: null, lumiere: null, meteo: null, temps: [], ligne: numLigne };
        resultat.scenes.push(scene);
        resultat.avertissements.push(`Ligne ${numLigne} : aucune scène déclarée, une scène par défaut a été créée.`);
      }
      return scene;
    }

    function personnageConnu(nom) {
      return parId.get(identifiant(nom)) || null;
    }

    const lignes = String(texte).replace(/\r\n?/g, '\n').split('\n');
    lignes.forEach((ligneBrute, index) => {
      const numLigne = index + 1;
      const ligne = ligneBrute.trim();
      if (!ligne) { locuteurEnAttente = null; return; }
      if (ligne.startsWith('#') || ligne.startsWith('//')) return;

      // Réplique en attente (format scénario classique sur deux lignes).
      if (locuteurEnAttente && !/^\[/.test(ligne)) {
        const s = sceneCourante(numLigne);
        const m = ligne.match(/^\(([^)]*)\)\s*(.*)$/);
        if (m && !m[2]) { locuteurEnAttente.indication = m[1]; return; }
        const indication = m ? m[1] : locuteurEnAttente.indication;
        const texteReplique = m ? m[2] : ligne;
        s.temps.push({ type: 'dialogue', personnage: locuteurEnAttente.p.id, texte: texteReplique,
                       indication: indication || null, emotion: detecterEmotion(indication), ligne: numLigne });
        locuteurEnAttente = null;
        return;
      }

      // En-tête de scène.
      const entete = analyserEntete(ligne);
      if (entete && (/^(int|ext)/i.test(normaliser(ligne)) || /^s[eé]quence|^sc[eè]ne/i.test(normaliser(ligne)))) {
        scene = { numero: resultat.scenes.length + 1, ...entete, decor: null, lumiere: null, meteo: null,
                  temps: [], ligne: numLigne };
        resultat.scenes.push(scene);
        return;
      }

      // Directive « CLÉ: valeur ».
      const d = ligne.match(/^([A-Za-zÀ-ÿ' \-]{2,24})\s*:\s*(.*)$/);
      if (d) {
        const cle = DIRECTIVES[normaliser(d[1]).replace(/\s+/g, '')];
        const valeur = d[2].trim();
        if (cle === 'titre') { resultat.titre = valeur || resultat.titre; return; }
        if (cle === 'personnage') {
          const { nom, attributs } = analyserAttributs(valeur);
          if (nom) ajouterPersonnage(nom, attributs, true);
          return;
        }
        if (cle) {
          const s = sceneCourante(numLigne);
          if (cle === 'decor' && s.temps.length === 0) s.decor = normaliser(valeur);
          else if (cle === 'lumiere' && s.temps.length === 0) s.lumiere = normaliser(valeur);
          else if (cle === 'meteo' && s.temps.length === 0) s.meteo = normaliser(valeur);
          else if (cle === 'pause') {
            const duree = parseFloat(valeur.replace(',', '.'));
            s.temps.push({ type: 'pause', duree: isFinite(duree) ? Math.min(20, Math.max(0.2, duree)) : 1.5, ligne: numLigne });
          } else {
            s.temps.push({ type: 'directive', cle, valeur, ligne: numLigne });
          }
          return;
        }
        // Sinon : réplique « NOM: (indication) texte ».
        const nomLocuteur = d[1].trim();
        const connu = personnageConnu(nomLocuteur);
        const enMajuscules = nomLocuteur === nomLocuteur.toUpperCase() && /[A-ZÀ-Ý]/.test(nomLocuteur);
        if (connu || enMajuscules) {
          const p = connu || ajouterPersonnage(nomLocuteur, {}, false);
          const m = valeur.match(/^\(([^)]*)\)\s*(.*)$/);
          const indication = m ? m[1] : null;
          const replique = (m ? m[2] : valeur).trim();
          const s = sceneCourante(numLigne);
          if (!replique) { locuteurEnAttente = { p, indication }; return; }
          s.temps.push({ type: 'dialogue', personnage: p.id, texte: replique, indication,
                         emotion: detecterEmotion(indication), ligne: numLigne });
          return;
        }
      }

      // NOM seul en majuscules (format scénario classique).
      if (/^[A-ZÀ-Ý][A-ZÀ-Ý0-9 '\-]{1,24}$/.test(ligne) && !entete) {
        const p = personnageConnu(ligne) || ajouterPersonnage(ligne, {}, false);
        locuteurEnAttente = { p, indication: null };
        return;
      }

      // Tout le reste est une action ; les crochets sont facultatifs.
      const action = ligne.replace(/^\[\s*|\s*\]$/g, '').trim();
      if (action) sceneCourante(numLigne).temps.push({ type: 'action', texte: action, ligne: numLigne });
    });

    for (const p of resultat.personnages) {
      if (!p.declare) {
        resultat.avertissements.push(`« ${p.nom} » n'est pas déclaré avec PERSONNAGE: — apparence générée automatiquement.`);
      }
    }
    if (!resultat.scenes.length) resultat.avertissements.push('Le scénario ne contient aucune scène.');
    return resultat;
  }

  return { analyser, normaliser, identifiant, detecterEmotion, analyserEntete };
});
