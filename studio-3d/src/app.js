/*
 * Interface du studio : éditeur, lecture, découpage, voix et exports.
 */
(function (racine) {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const CLE_STOCKAGE = 'studio3d.scenario';

  const COULEURS_TYPES = { titre: '#5b4a6e', etablissement: '#3c6e71', dialogue: '#7b3f98', action: '#c27c2c', pause: '#555' };
  const NOMS_PLANS = {
    titre: 'Titre', large: 'Plan large', deux: 'Plan à deux', amorce: 'Champ / contrechamp', moyen: 'Plan moyen',
    gros_plan: 'Gros plan', plongee: 'Plongée', contre_plongee: 'Contre-plongée', travelling: 'Travelling'
  };

  function formaterTemps(s) {
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`;
  }

  function telecharger(nom, contenu, type) {
    const blob = contenu instanceof Blob ? contenu : new Blob([contenu], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nom;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function nomFichier(titre, extension) {
    return (racine.ScenarioParser.identifiant(titre) || 'sequence') + '.' + extension;
  }

  function demarrer() {
    const THREE = racine.THREE;
    const editeur = $('#scenario');
    const canvas = $('#rendu');
    const curseur = $('#curseur');
    const affichageTemps = $('#temps');
    const boutonLecture = $('#lecture');
    const listeDecoupage = $('#decoupage');
    const frise = $('#frise');
    const tete = $('#tete-lecture');
    const messages = $('#messages');
    const etatExport = $('#etat-export');

    if (!THREE) {
      messages.innerHTML = '<li class="erreur">Three.js n\'a pas pu être chargé (vendor/three.min.js manquant).</li>';
      return;
    }

    let texteInitial = racine.SCENARIO_EXEMPLE || '';
    try { texteInitial = localStorage.getItem(CLE_STOCKAGE) || texteInitial; } catch (e) { /* stockage indisponible */ }
    editeur.value = texteInitial;

    let plateau;
    try {
      plateau = racine.Stage.creerPlateau(THREE, { canvas, largeur: 1280, hauteur: 720 });
    } catch (e) {
      messages.innerHTML = `<li class="erreur">WebGL indisponible dans ce navigateur : ${e.message}</li>`;
      return;
    }

    let plan = null;
    let t = 0;
    let lecture = false;
    let dernierInstant = null;
    let dernierTempsParle = null;
    let enregistrement = null;
    let voixActive = false;

    // ---------- Génération ----------

    function generer() {
      const scenario = racine.ScenarioParser.analyser(editeur.value);
      plan = racine.Director.construirePlan(scenario);
      plateau.charger(plan);
      curseur.max = plan.duree;
      t = Math.min(t, plan.duree);
      afficherDecoupage();
      afficherMessages(scenario);
      rendre(0);
      try { localStorage.setItem(CLE_STOCKAGE, editeur.value); } catch (e) { /* ignoré */ }
    }

    function afficherMessages(scenario) {
      const s = plan.scenes.length, d = plan.temps.filter(b => b.type === 'dialogue').length;
      const items = [`<li class="ok">${s} scène${s > 1 ? 's' : ''}, ${plan.personnages.length} personnage${plan.personnages.length > 1 ? 's' : ''}, ${d} réplique${d > 1 ? 's' : ''}, ${plan.temps.length} plans — durée ${formaterTemps(plan.duree)}.</li>`];
      for (const a of plan.avertissements) items.push(`<li class="alerte">${echapper(a)}</li>`);
      messages.innerHTML = items.join('');
    }

    function echapper(x) {
      return String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    function afficherDecoupage() {
      frise.querySelectorAll('.segment').forEach(e => e.remove());
      listeDecoupage.innerHTML = '';
      plan.temps.forEach((b, i) => {
        const seg = document.createElement('div');
        seg.className = 'segment';
        seg.style.left = (b.debut / plan.duree * 100) + '%';
        seg.style.width = Math.max(0.2, (b.fin - b.debut) / plan.duree * 100) + '%';
        seg.style.background = COULEURS_TYPES[b.type] || '#666';
        seg.title = `${formaterTemps(b.debut)} — ${b.description}`;
        seg.addEventListener('click', () => sauter(b.debut + 0.01));
        frise.appendChild(seg);

        const li = document.createElement('li');
        li.dataset.index = i;
        const sc = plan.scenes[b.scene];
        li.innerHTML = `<button type="button">
            <span class="tc">${formaterTemps(b.debut)}</span>
            <span class="type" style="background:${COULEURS_TYPES[b.type]}">${NOMS_PLANS[b.plan.type] || b.plan.type}</span>
            <span class="desc">${echapper(b.description)}${b.emotion && b.emotion !== 'neutre' ? ` <em>(${b.emotion})</em>` : ''}</span>
            ${sc && b.type === 'etablissement' ? `<span class="lieu">Sc. ${sc.numero} · ${echapper(sc.nomDecor)}</span>` : ''}
          </button>`;
        li.querySelector('button').addEventListener('click', () => sauter(b.debut + 0.01));
        listeDecoupage.appendChild(li);
      });
    }

    // ---------- Lecture ----------

    let indexActif = -1;
    function rendre(dt) {
      if (!plan) return;
      const info = plateau.rendre(t, dt);
      curseur.value = t;
      affichageTemps.textContent = `${formaterTemps(t)} / ${formaterTemps(plan.duree)}`;
      tete.style.left = (t / plan.duree * 100) + '%';
      const actif = info && info.temps ? plan.temps.indexOf(info.temps) : -1;
      if (actif !== indexActif) {
        listeDecoupage.querySelectorAll('li.actif').forEach(e => e.classList.remove('actif'));
        const li = listeDecoupage.querySelector(`li[data-index="${actif}"]`);
        if (li) {
          li.classList.add('actif');
          if (lecture) li.scrollIntoView({ block: 'nearest' });
        }
        indexActif = actif;
      }
      if (lecture && voixActive && info && info.dialogue && info.dialogue !== dernierTempsParle) {
        dernierTempsParle = info.dialogue;
        parler(info.dialogue);
      }
    }

    function boucle(instant) {
      // Pendant un export, on suit l'horloge réelle (quitte à sauter des images) pour que la vidéo garde le bon rythme.
      const dt = dernierInstant === null ? 0 : Math.min(enregistrement ? 1 : 0.1, (instant - dernierInstant) / 1000);
      dernierInstant = instant;
      if (lecture && plan) {
        t += dt;
        if (t >= plan.duree) {
          t = plan.duree;
          arreter();
          if (enregistrement) enregistrement.stop();
        }
      }
      rendre(lecture ? dt : 0);
      requestAnimationFrame(boucle);
    }

    function jouer() {
      if (!plan) return;
      if (t >= plan.duree - 0.05) t = 0;
      lecture = true;
      dernierTempsParle = null;
      boutonLecture.textContent = '❚❚ Pause';
      boutonLecture.setAttribute('aria-label', 'Pause');
    }

    function arreter() {
      lecture = false;
      boutonLecture.textContent = '▶ Lecture';
      boutonLecture.setAttribute('aria-label', 'Lecture');
      if (racine.speechSynthesis) racine.speechSynthesis.cancel();
    }

    function sauter(instant) {
      if (!plan || enregistrement) return;
      t = Math.max(0, Math.min(plan.duree, instant));
      dernierTempsParle = null;
      if (racine.speechSynthesis) racine.speechSynthesis.cancel();
    }

    // ---------- Voix (synthèse vocale du navigateur) ----------

    function parler(b) {
      const synth = racine.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const p = plan.personnages.find(x => x.id === b.personnage) || {};
      const u = new SpeechSynthesisUtterance(b.texte);
      u.lang = 'fr-FR';
      const voixFr = synth.getVoices().filter(v => /^fr/i.test(v.lang));
      if (voixFr.length) {
        let h = 0; for (const c of p.id || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
        u.voice = voixFr[h % voixFr.length];
      }
      u.pitch = p.voix === 'grave' ? 0.7 : p.voix === 'aigue' ? 1.35 : 1;
      u.rate = b.emotion === 'colere' || b.emotion === 'peur' ? 1.2 : b.emotion === 'tristesse' ? 0.9 : 1.05;
      u.volume = b.emotion === 'chuchote' ? 0.5 : 1;
      synth.speak(u);
    }

    // ---------- Exports ----------

    function exporterVideo() {
      if (!plan || enregistrement) return;
      if (typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
        etatExport.textContent = 'Ce navigateur ne permet pas l\'enregistrement vidéo du canvas.';
        return;
      }
      const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      const type = types.find(x => MediaRecorder.isTypeSupported(x));
      if (!type) { etatExport.textContent = 'Aucun format vidéo pris en charge par ce navigateur.'; return; }
      const flux = canvas.captureStream(30);
      const morceaux = [];
      const rec = new MediaRecorder(flux, { mimeType: type, videoBitsPerSecond: 8000000 });
      rec.ondataavailable = e => { if (e.data.size) morceaux.push(e.data); };
      rec.onstop = () => {
        flux.getTracks().forEach(p => p.stop());
        enregistrement = null;
        document.body.classList.remove('export-en-cours');
        etatExport.textContent = 'Vidéo exportée.';
        telecharger(nomFichier(plan.titre, type.includes('mp4') ? 'mp4' : 'webm'), new Blob(morceaux, { type: type.split(';')[0] }));
      };
      const voixAvant = voixActive;
      voixActive = false; // la synthèse vocale ne peut pas être capturée dans la vidéo
      enregistrement = { stop: () => { rec.stop(); voixActive = voixAvant; } };
      document.body.classList.add('export-en-cours');
      etatExport.textContent = `Enregistrement en temps réel… (${formaterTemps(plan.duree)})`;
      t = 0;
      rec.start(250);
      jouer();
    }

    function exporterImage() {
      if (!plan) return;
      rendre(0);
      canvas.toBlob(b => telecharger(nomFichier(plan.titre + '-' + t.toFixed(1), 'png'), b), 'image/png');
    }

    function exporterPlan() {
      if (!plan) return;
      const propre = { ...plan, personnages: plan.personnages.map(({ couleurRendu, ...p }) => p) };
      telecharger(nomFichier(plan.titre + '-plan-de-tournage', 'json'), JSON.stringify(propre, null, 2), 'application/json');
    }

    // ---------- Événements ----------

    $('#generer').addEventListener('click', () => { arreter(); t = 0; generer(); });
    $('#exemple').addEventListener('click', () => {
      if (editeur.value.trim() && editeur.value !== racine.SCENARIO_EXEMPLE && !confirm('Remplacer le scénario actuel par l\'exemple ?')) return;
      editeur.value = racine.SCENARIO_EXEMPLE; arreter(); t = 0; generer();
    });
    $('#importer').addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then(texte => { editeur.value = texte; arreter(); t = 0; generer(); });
      e.target.value = '';
    });
    $('#enregistrer').addEventListener('click', () => telecharger(nomFichier(plan ? plan.titre : 'scenario', 'txt'), editeur.value, 'text/plain'));
    boutonLecture.addEventListener('click', () => (lecture ? arreter() : jouer()));
    $('#debut').addEventListener('click', () => sauter(0));
    curseur.addEventListener('input', () => sauter(parseFloat(curseur.value)));
    frise.addEventListener('click', e => {
      if (e.target !== frise) return;
      const r = frise.getBoundingClientRect();
      sauter((e.clientX - r.left) / r.width * plan.duree);
    });
    $('#opt-soustitres').addEventListener('change', e => plateau.reglerOptions({ sousTitres: e.target.checked }));
    $('#opt-cinema').addEventListener('change', e => plateau.reglerOptions({ cinemascope: e.target.checked }));
    $('#opt-voix').addEventListener('change', e => {
      voixActive = e.target.checked;
      if (!racine.speechSynthesis && voixActive) etatExport.textContent = 'Synthèse vocale indisponible dans ce navigateur.';
      if (!voixActive && racine.speechSynthesis) racine.speechSynthesis.cancel();
    });
    $('#opt-resolution').addEventListener('change', e => {
      const [l, h] = e.target.value.split('x').map(Number);
      plateau.redimensionner(l, h);
    });
    $('#export-video').addEventListener('click', exporterVideo);
    $('#export-image').addEventListener('click', exporterImage);
    $('#export-plan').addEventListener('click', exporterPlan);
    editeur.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); arreter(); t = 0; generer(); jouer(); }
    });
    document.addEventListener('keydown', e => {
      if (e.target === editeur || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      if (e.code === 'Space') { e.preventDefault(); lecture ? arreter() : jouer(); }
      if (e.code === 'ArrowRight') sauter(t + 2);
      if (e.code === 'ArrowLeft') sauter(t - 2);
    });

    generer();
    requestAnimationFrame(boucle);

    // Accès pour le débogage et les tests automatisés.
    racine.studio = { generer, jouer, arreter, sauter, get plan() { return plan; }, get t() { return t; } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : this);
