/*
 * Plateau 3D (Three.js r159, build classique « three.min.js »).
 * Évalue le plan de tournage à l'instant t : décor, personnages articulés,
 * animations, éclairage, météo et caméra, puis compose l'image finale
 * (sous-titres, cartons, bandes cinéma, fondus) dans un canvas 2D enregistrable.
 */
(function (racine) {
  'use strict';

  const D = racine.Director;

  // ---------- Utilitaires ----------

  const lerp = (a, b, k) => a + (b - a) * k;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lisser = k => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

  // Poids d'un geste : montée et descente douces.
  function enveloppe(t, debut, fin, montee = 0.35) {
    if (t < debut || t > fin) return 0;
    const m = Math.min(montee, (fin - debut) / 2);
    return lisser(Math.min((t - debut) / m, (fin - t) / m, 1));
  }

  function hash(texte) {
    let h = 2166136261;
    for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 4294967295;
  }

  // Bruit pseudo-aléatoire déterministe (pour les éclairs et la bouche).
  function bruit(x) { const s = Math.sin(x * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

  const PEAUX = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a0673f'];
  const CHEVEUX = ['#2b1b10', '#5a3825', '#a55728', '#1c1c1c', '#d6b370', '#7a7a7a'];
  const TENUES = ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#7f8c8d'];

  // ---------- Éclairages ----------

  const PRESETS = {
    jour:           { ciel: '#9cc9f0', brume: '#c7dcef', densite: 0.012, hemiCiel: '#cfe6ff', hemiSol: '#7a6a4f', hemi: 1.1,
                      soleil: '#fff3d6', intensite: 2.6, dir: [6, 10, 4], expo: 1.0, lampes: 0, eclairs: false },
    aube:           { ciel: '#f2b8a0', brume: '#e8c2b0', densite: 0.02, hemiCiel: '#ffd7c2', hemiSol: '#5c4a5a', hemi: 0.8,
                      soleil: '#ffb07a', intensite: 1.8, dir: [-9, 3, 2], expo: 1.0, lampes: 0.4, eclairs: false },
    crepuscule:     { ciel: '#e0795a', brume: '#a85a5a', densite: 0.02, hemiCiel: '#ff9e6e', hemiSol: '#3b2a3d', hemi: 0.7,
                      soleil: '#ff8040', intensite: 2.0, dir: [9, 2.5, -3], expo: 1.05, lampes: 1.2, eclairs: false },
    nuit:           { ciel: '#0b1430', brume: '#101a35', densite: 0.03, hemiCiel: '#3a4f8a', hemiSol: '#0a0a12', hemi: 0.65,
                      soleil: '#9fb6ff', intensite: 0.7, dir: [-4, 8, -5], expo: 1.3, lampes: 2.4, eclairs: false },
    interieur:      { ciel: '#d9cbb5', brume: '#d9cbb5', densite: 0.004, hemiCiel: '#fff1dc', hemiSol: '#6b5b4b', hemi: 1.0,
                      soleil: '#fff0d0', intensite: 1.6, dir: [5, 9, 6], expo: 1.0, lampes: 1.0, eclairs: false },
    interieur_nuit: { ciel: '#1b1712', brume: '#1b1712', densite: 0.01, hemiCiel: '#6b5a48', hemiSol: '#1a120c', hemi: 0.35,
                      soleil: '#8fa6d9', intensite: 0.35, dir: [5, 6, -4], expo: 1.15, lampes: 2.6, eclairs: false },
    tamise:         { ciel: '#2a1c14', brume: '#2a1c14', densite: 0.012, hemiCiel: '#a0704a', hemiSol: '#20140c', hemi: 0.35,
                      soleil: '#ffb070', intensite: 0.5, dir: [3, 5, 5], expo: 1.0, lampes: 1.6, eclairs: false },
    orage:          { ciel: '#2c3440', brume: '#3a4350', densite: 0.035, hemiCiel: '#6d7c90', hemiSol: '#15181d', hemi: 0.55,
                      soleil: '#c8d4ff', intensite: 0.5, dir: [-3, 9, 3], expo: 1.1, lampes: 1.6, eclairs: true },
    neon:           { ciel: '#140a26', brume: '#1d0f33', densite: 0.03, hemiCiel: '#ff3cac', hemiSol: '#2b86c5', hemi: 0.7,
                      soleil: '#7b5cff', intensite: 0.8, dir: [4, 6, -5], expo: 1.2, lampes: 2.8, eclairs: false }
  };

  function melangerPresets(a, b, k, C) {
    const couleur = (x, y) => new C(x).lerp(new C(y), k);
    return {
      ciel: couleur(a.ciel, b.ciel), brume: couleur(a.brume, b.brume), densite: lerp(a.densite, b.densite, k),
      hemiCiel: couleur(a.hemiCiel, b.hemiCiel), hemiSol: couleur(a.hemiSol, b.hemiSol), hemi: lerp(a.hemi, b.hemi, k),
      soleil: couleur(a.soleil, b.soleil), intensite: lerp(a.intensite, b.intensite, k),
      dir: a.dir.map((v, i) => lerp(v, b.dir[i], k)), expo: lerp(a.expo, b.expo, k),
      lampes: lerp(a.lampes, b.lampes, k), eclairs: k > 0.5 ? b.eclairs : a.eclairs
    };
  }

  // ---------- Création ----------

  function creerPlateau(THREE, options) {
    const largeur = options.largeur || 1280;
    const hauteur = options.hauteur || 720;
    const sortie = options.canvas;
    const ctx = sortie.getContext('2d');

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(1);
    renderer.setSize(largeur, hauteur, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene3d = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, largeur / hauteur, 0.1, 200);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    scene3d.add(hemi);
    const soleil = new THREE.DirectionalLight(0xffffff, 2);
    soleil.castShadow = true;
    soleil.shadow.mapSize.set(2048, 2048);
    soleil.shadow.camera.left = -14; soleil.shadow.camera.right = 14;
    soleil.shadow.camera.top = 14; soleil.shadow.camera.bottom = -14;
    soleil.shadow.camera.near = 0.5; soleil.shadow.camera.far = 60;
    soleil.shadow.bias = -0.0004;
    scene3d.add(soleil);
    scene3d.add(soleil.target);
    // Lumière de « remplissage » qui suit la caméra pour garder les visages lisibles.
    const remplissage = new THREE.PointLight(0xffffff, 0, 12, 1.6);
    scene3d.add(remplissage);
    scene3d.fog = new THREE.FogExp2(0xffffff, 0.01);

    const etat = {
      plan: null, decorCourant: -1, groupeDecor: null, lampes: [], personnages: new Map(),
      vitres: [], fenetres: [], pluie: null, dernierT: null, options: { sousTitres: true, cinemascope: false, nomsLocuteurs: true }
    };

    // ---------- Matériaux ----------
    const cacheMateriaux = new Map();
    function mat(couleur, rugosite = 0.85, extra = {}) {
      const cle = couleur + '|' + rugosite + '|' + JSON.stringify(extra);
      if (!cacheMateriaux.has(cle)) cacheMateriaux.set(cle, new THREE.MeshStandardMaterial({ color: couleur, roughness: rugosite, ...extra }));
      return cacheMateriaux.get(cle);
    }

    function boite(l, h, p, couleur, x, y, z, parent, ombre = true) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, p), mat(couleur));
      m.position.set(x, y, z);
      m.castShadow = ombre; m.receiveShadow = true;
      parent.add(m);
      return m;
    }

    function cylindre(rh, rb, h, couleur, x, y, z, parent, segments = 16) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rh, rb, h, segments), mat(couleur));
      m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true;
      parent.add(m);
      return m;
    }

    function lampe(x, y, z, couleur, parent, portee = 9) {
      const l = new THREE.PointLight(couleur, 0, portee, 1.8);
      l.position.set(x, y, z);
      parent.add(l);
      const ampoule = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8),
        new THREE.MeshStandardMaterial({ color: couleur, emissive: couleur, emissiveIntensity: 0 }));
      ampoule.position.set(x, y, z);
      parent.add(ampoule);
      etat.lampes.push({ lumiere: l, ampoule, base: 10 });
      return l;
    }

    // ---------- Décors procéduraux ----------

    function maison(x, z, l, h, p, couleur, toit, parent, rotation = 0) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.rotation.y = rotation;
      boite(l, h, p, couleur, 0, h / 2, 0, g);
      const t = new THREE.Mesh(new THREE.ConeGeometry(Math.max(l, p) * 0.75, 1.6, 4), mat(toit));
      t.position.y = h + 0.8; t.rotation.y = Math.PI / 4; t.scale.set(l / Math.max(l, p), 1, p / Math.max(l, p));
      t.castShadow = true;
      g.add(t);
      // Fenêtres légèrement émissives : elles s'allument la nuit.
      const vitre = new THREE.MeshStandardMaterial({ color: '#30343a', emissive: '#ffcc77', emissiveIntensity: 0 });
      etat.vitres.push(vitre);
      for (let i = -1; i <= 1; i += 2) {
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), vitre);
        f.position.set(i * l * 0.25, h * 0.62, p / 2 + 0.01);
        g.add(f);
      }
      boite(0.9, 1.8, 0.05, '#5b3a29', 0, 0.9, p / 2 + 0.03, g, false);
      parent.add(g);
      return g;
    }

    function arbre(x, z, echelle, parent) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(echelle);
      cylindre(0.15, 0.22, 1.6, '#5a3d27', 0, 0.8, 0, g, 8);
      const teinte = ['#2f6b3a', '#3c7d43', '#285c34'][Math.floor(hash(x + ':' + z) * 3)];
      for (let i = 0; i < 3; i++) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(1.2 - i * 0.3, 1.6, 9), mat(teinte));
        c.position.y = 1.9 + i * 0.75; c.castShadow = true;
        g.add(c);
      }
      parent.add(g);
    }

    function chaise(x, z, rot, parent) {
      const g = new THREE.Group();
      g.position.set(x, 0, z); g.rotation.y = rot;
      boite(0.45, 0.06, 0.45, '#7a5232', 0, 0.46, 0, g);
      boite(0.45, 0.5, 0.05, '#7a5232', 0, 0.72, -0.2, g);
      for (const [a, b] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) boite(0.04, 0.46, 0.04, '#5b3a22', a, 0.23, b, g);
      parent.add(g);
    }

    function table(x, z, l, p, parent, couleur = '#8a5a35') {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      boite(l, 0.06, p, couleur, 0, 0.76, 0, g);
      for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) boite(0.06, 0.74, 0.06, '#4a2f1c', a * (l / 2 - 0.08), 0.37, b * (p / 2 - 0.08), g);
      parent.add(g);
      return g;
    }

    function banc(x, z, parent, rot = 0) {
      const g = new THREE.Group();
      g.position.set(x, 0, z); g.rotation.y = rot;
      boite(1.8, 0.08, 0.45, '#7d5a3c', 0, 0.45, 0, g);
      boite(1.8, 0.4, 0.06, '#7d5a3c', 0, 0.75, -0.2, g);
      boite(0.08, 0.45, 0.4, '#333', -0.8, 0.22, 0, g); boite(0.08, 0.45, 0.4, '#333', 0.8, 0.22, 0, g);
      parent.add(g);
    }

    function lampadaire(x, z, parent) {
      cylindre(0.06, 0.09, 3.6, '#2b2f33', x, 1.8, z, parent, 8);
      boite(0.5, 0.08, 0.08, '#2b2f33', x + 0.22, 3.55, z, parent);
      lampe(x + 0.42, 3.4, z, '#ffd18a', parent, 11);
    }

    function sol(l, p, couleur, parent, rugosite = 0.95) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(l, p), mat(couleur, rugosite));
      m.rotation.x = -Math.PI / 2;
      m.receiveShadow = true;
      parent.add(m);
      return m;
    }

    function piece(parent, couleurMur, couleurSol, porteX, porteCote) {
      sol(12, 10, couleurSol, parent, 0.7);
      const mur = '#' + couleurMur.replace('#', '');
      boite(12, 4, 0.2, mur, 0, 2, -4.2, parent, false);           // fond
      boite(0.2, 4, 10, mur, -6, 2, 0.8, parent, false);           // gauche
      boite(0.2, 4, 10, mur, 6, 2, 0.8, parent, false);            // droite
      boite(12, 0.2, 10, '#efe7da', 0, 4, 0.8, parent, false);      // plafond
      // Plinthe
      boite(12, 0.15, 0.05, '#5b4636', 0, 0.075, -4.08, parent, false);
      const porte = boite(0.08, 2.1, 1.1, '#6b4429', porteCote * 5.88, 1.05, porteX, parent, false);
      return porte;
    }

    const CONSTRUCTEURS = {
      place(g) {
        sol(60, 60, '#9a9187', g);
        const pave = sol(16, 16, '#b3a898', g); pave.position.y = 0.005;
        // Fontaine
        cylindre(1.4, 1.5, 0.5, '#8d8d8d', 0, 0.25, -5.2, g, 24);
        cylindre(1.2, 1.2, 0.08, '#4a7fa0', 0, 0.5, -5.2, g, 24).material = mat('#4a7fa0', 0.15);
        cylindre(0.15, 0.2, 1.4, '#8d8d8d', 0, 0.9, -5.2, g, 12);
        cylindre(0.5, 0.15, 0.2, '#8d8d8d', 0, 1.6, -5.2, g, 12);
        maison(-8, -8, 5, 4.5, 4, '#e3d3b6', '#8a3b2e', g);
        maison(-2, -10.5, 5, 5.5, 4, '#d8c7a5', '#6d3a2a', g);
        maison(4, -9.5, 4.5, 4, 4, '#e8dcc8', '#7a3e2c', g);
        maison(10, -6, 4, 4.8, 4, '#cdb999', '#8a3b2e', g, -0.5);
        maison(-11.5, -1, 4, 4, 4, '#e0cfae', '#6d3a2a', g, 0.9);
        arbre(7.5, -2, 1, g); arbre(-9, 4.5, 1.2, g); arbre(11, 3, 1.1, g);
        banc(4.6, -2.8, g);
        lampadaire(-4.5, -3, g); lampadaire(6, 1.5, g);
      },
      rue(g) {
        sol(60, 60, '#6f6a64', g);
        boite(40, 0.15, 3, '#a39e96', 0, 0.075, -3.2, g, false);   // trottoir
        boite(40, 0.15, 3, '#a39e96', 0, 0.075, 5.5, g, false);
        const couleurs = ['#d9c7a7', '#c9b08f', '#e3d6bf', '#b98f6d', '#cfc0a3'];
        for (let i = 0; i < 6; i++) maison(-13 + i * 5.2, -7.2, 5, 5 + (i % 3), 4.6, couleurs[i % 5], '#5a3b30', g);
        lampadaire(-4, -2.6, g); lampadaire(5, -2.6, g);
        banc(-1.8, -3.3, g);
        boite(1.2, 0.9, 0.6, '#3d6b4a', 7.5, 0.6, -3.3, g); // jardinière
      },
      foret(g) {
        sol(70, 70, '#4f6b3a', g);
        const chemin = sol(5, 40, '#7b6a4e', g); chemin.position.y = 0.004; chemin.rotation.z = 0.25;
        const places = [[-4.5, -4], [-6, 1], [-3, -7], [3, -6.5], [5.5, -3.5], [7, 1.5], [-8, -6], [9, -6], [0, -9], [-10, 3], [11, -1], [6.5, -9]];
        places.forEach(([x, z], i) => arbre(x, z, 0.9 + (i % 4) * 0.2, g));
        cylindre(0.4, 0.45, 0.45, '#6b4a2f', 2.4, 0.22, -1.9, g, 12);
        for (let i = 0; i < 14; i++) {
          const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + hash('r' + i) * 0.3), mat('#7c7c74'));
          r.position.set((hash('x' + i) - 0.5) * 22, 0.1, -3 - hash('z' + i) * 8); r.castShadow = true;
          g.add(r);
        }
        lampe(-1, 3.5, -2, '#ffe2b0', g, 7); // lumière d'ambiance (lanterne)
      },
      salon(g) {
        piece(g, '#c9b79c', '#8b6b4a', -1.5, -1);
        // Canapé
        boite(2.6, 0.45, 0.9, '#7b4b5a', 0, 0.3, -2.9, g); boite(2.6, 0.7, 0.25, '#6e4250', 0, 0.75, -3.3, g);
        boite(0.25, 0.6, 0.9, '#6e4250', -1.35, 0.5, -2.9, g); boite(0.25, 0.6, 0.9, '#6e4250', 1.35, 0.5, -2.9, g);
        table(0, -1.1, 1.4, 0.7, g);
        chaise(2.6, -1.5, -0.6, g);
        // Tapis, bibliothèque, fenêtre
        const tapis = sol(4, 3, '#8c3f3f', g, 1); tapis.position.set(0, 0.006, -1);
        boite(1.6, 2.4, 0.4, '#5b3a22', -4, 1.2, -3.9, g);
        for (let i = 0; i < 3; i++) boite(1.4, 0.3, 0.3, ['#9b2c2c', '#2c5d9b', '#c99b2c'][i], -4, 0.5 + i * 0.7, -3.85, g);
        const fenetre = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.6), new THREE.MeshStandardMaterial({ color: '#9cc9f0', emissive: '#9cc9f0', emissiveIntensity: 0.4 }));
        fenetre.position.set(3.5, 2.1, -4.09); g.add(fenetre);
        etat.fenetres.push(fenetre.material);
        cylindre(0.03, 0.03, 1.5, '#333', 2.9, 0.75, -3.4, g, 6);
        lampe(2.9, 1.65, -3.4, '#ffcf8a', g, 8);
        lampe(0, 3.7, 0, '#fff0d6', g, 12);
      },
      cafe(g) {
        piece(g, '#b46b4a', '#3f2f25', 1.2, -1);
        // Comptoir et étagère à bouteilles
        boite(4, 1.1, 0.8, '#5a3a24', 3, 0.55, -3.4, g); boite(4.1, 0.08, 0.95, '#2a1a10', 3, 1.12, -3.4, g);
        for (let i = 0; i < 9; i++) cylindre(0.06, 0.06, 0.32, ['#2f6b3a', '#7a2a2a', '#c9a227'][i % 3], 1.4 + i * 0.4, 1.95, -4.0, g, 8);
        boite(4, 0.05, 0.3, '#3a2616', 3, 1.78, -4.0, g);
        table(-1.6, -1.3, 1.1, 1.1, g, '#6a4126'); chaise(-2.4, -1.3, Math.PI / 2, g); chaise(-0.8, -1.3, -Math.PI / 2, g);
        table(2.4, 0.6, 0.9, 0.9, g, '#6a4126'); chaise(2.4, -0.2, 0, g);
        lampe(-1.6, 3.2, -1.3, '#ffbe6b', g, 7); lampe(2.8, 3.2, -2.6, '#ffbe6b', g, 7);
        cylindre(0.01, 0.01, 0.8, '#111', -1.6, 3.6, -1.3, g, 4); cylindre(0.01, 0.01, 0.8, '#111', 2.8, 3.6, -2.6, g, 4);
      },
      bureau(g) {
        piece(g, '#9fb0bf', '#5f6670', -0.5, 1);
        boite(2.2, 0.08, 1, '#3d3d3d', 0, 0.76, -2, g);
        boite(0.08, 0.74, 0.9, '#2a2a2a', -1.0, 0.37, -2, g); boite(0.08, 0.74, 0.9, '#2a2a2a', 1.0, 0.37, -2, g);
        const ecran = boite(0.7, 0.45, 0.04, '#111', 0, 1.1, -2.25, g);
        ecran.material = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#6fb3ff', emissiveIntensity: 0.6 });
        chaise(0, -2.7, Math.PI, g); chaise(-1.5, -0.9, 0.3, g); chaise(1.5, -0.9, -0.3, g);
        boite(1, 1.9, 0.5, '#7d8590', 4.5, 0.95, -3.8, g); boite(1, 1.9, 0.5, '#7d8590', 3.4, 0.95, -3.8, g);
        const fenetre = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.6), new THREE.MeshStandardMaterial({ color: '#9cc9f0', emissive: '#9cc9f0', emissiveIntensity: 0.4 }));
        fenetre.position.set(-3.5, 2.1, -4.09); g.add(fenetre);
        etat.fenetres.push(fenetre.material);
        lampe(0, 3.7, -1, '#eef4ff', g, 12);
        cylindre(0.25, 0.3, 0.5, '#a0522d', -5, 0.25, -3.5, g, 12); arbre(-5, -3.5, 0.35, g);
      }
    };

    function construireDecor(scene) {
      if (etat.groupeDecor) {
        scene3d.remove(etat.groupeDecor);
        etat.groupeDecor.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      }
      etat.lampes = []; etat.vitres = []; etat.fenetres = [];
      const g = new THREE.Group();
      (CONSTRUCTEURS[scene.decor] || CONSTRUCTEURS.place)(g);
      scene3d.add(g);
      etat.groupeDecor = g;
      etat.decorCourant = scene.index;
      construireMeteo(scene);
    }

    // ---------- Météo ----------

    function construireMeteo(scene) {
      if (etat.pluie) { scene3d.remove(etat.pluie.objet); etat.pluie.objet.geometry.dispose(); etat.pluie = null; }
      const orageDansScene = etat.plan.eclairages.some(e => e.scene === scene.index && e.preset === 'orage');
      const type = scene.meteo === 'neige' ? 'neige' : (scene.meteo === 'pluie' || orageDansScene) ? 'pluie' : null;
      if (!type) return;
      const n = type === 'neige' ? 2500 : 5000;
      const base = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        base[i * 3] = (bruit(i * 1.1) - 0.5) * 30;
        base[i * 3 + 1] = bruit(i * 2.3) * 14;
        base[i * 3 + 2] = (bruit(i * 3.7) - 0.5) * 30;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(base), 3));
      const m = new THREE.PointsMaterial({ color: type === 'neige' ? '#ffffff' : '#aac4e0', size: type === 'neige' ? 0.08 : 0.045,
                                           transparent: true, opacity: type === 'neige' ? 0.9 : 0.55, depthWrite: false });
      const objet = new THREE.Points(geo, m);
      scene3d.add(objet);
      etat.pluie = { objet, base, type, interieur: scene.interieur, scene: scene.index };
    }

    function animerMeteo(t, actif) {
      const p = etat.pluie;
      if (!p) return;
      // À l'intérieur, on voit la pluie seulement si on la place « dehors » : on la masque.
      p.objet.visible = actif && !p.interieur;
      if (!p.objet.visible) return;
      const pos = p.objet.geometry.attributes.position.array;
      const vitesse = p.type === 'neige' ? 0.9 : 11;
      for (let i = 0; i < pos.length; i += 3) {
        const y = (p.base[i + 1] - t * vitesse) % 14;
        pos[i + 1] = y < 0 ? y + 14 : y;
        pos[i] = p.base[i] + (p.type === 'neige' ? Math.sin(t + i) * 0.3 : 0);
      }
      p.objet.geometry.attributes.position.needsUpdate = true;
    }

    // ---------- Personnages articulés ----------

    function creerPersonnage(def) {
      const peau = def.peau || PEAUX[Math.floor(hash(def.id + 'p') * PEAUX.length)];
      const cheveux = def.cheveux || CHEVEUX[Math.floor(hash(def.id + 'c') * CHEVEUX.length)];
      const tenue = def.couleur || TENUES[Math.floor(hash(def.id + 't') * TENUES.length)];
      const pantalon = new THREE.Color(tenue).multiplyScalar(0.35).getStyle();
      const femme = hash(def.id + 'g') > 0.5;

      const racineP = new THREE.Group();
      const echelle = (def.taille || 1.7) / 1.75;
      racineP.scale.setScalar(echelle);

      const capsule = (r, l, couleur) => {
        const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 12), mat(couleur, 0.8));
        m.castShadow = true; m.receiveShadow = true;
        return m;
      };
      const articulation = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

      const bassin = articulation(racineP, 0, 0.95, 0);
      const hanches = capsule(0.17, 0.12, pantalon); hanches.rotation.z = Math.PI / 2; bassin.add(hanches);

      const buste = articulation(bassin, 0, 0.05, 0);
      const torse = capsule(0.2, 0.34, tenue); torse.position.y = 0.3; torse.scale.set(1.15, 1, 0.75); buste.add(torse);

      const cou = articulation(buste, 0, 0.58, 0);
      const tete = articulation(cou, 0, 0.05, 0);
      const crane = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 18), mat(peau, 0.6));
      crane.position.y = 0.1; crane.scale.set(1, 1.12, 1.02); crane.castShadow = true; tete.add(crane);
      const chevelure = new THREE.Mesh(new THREE.SphereGeometry(0.155, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(cheveux, 0.9));
      chevelure.position.set(0, 0.12, -0.012); chevelure.scale.set(1.04, 1.12, 1.06); chevelure.castShadow = true; tete.add(chevelure);
      if (femme) {
        const longs = capsule(0.12, 0.18, cheveux); longs.position.set(0, 0.02, -0.07); longs.scale.set(1.25, 1, 0.7); tete.add(longs);
      }
      const oeilMat = mat('#1a1a1a', 0.3);
      const yeux = [];
      for (const s of [-1, 1]) {
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), oeilMat);
        o.position.set(s * 0.05, 0.13, 0.135); tete.add(o); yeux.push(o);
      }
      const bouche = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), mat('#5a1f1f', 0.5));
      bouche.position.set(0, 0.04, 0.138); bouche.scale.set(1, 0.25, 0.4); tete.add(bouche);
      const nez = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(peau, 0.6));
      nez.position.set(0, 0.09, 0.15); tete.add(nez);

      function bras(cote) {
        const epaule = articulation(buste, cote * 0.27, 0.52, 0);
        const haut = capsule(0.06, 0.22, tenue); haut.position.y = -0.15; epaule.add(haut);
        const coude = articulation(epaule, 0, -0.31, 0);
        const avant = capsule(0.05, 0.2, peau); avant.position.y = -0.13; coude.add(avant);
        const main = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8), mat(peau, 0.6));
        main.position.y = -0.29; main.castShadow = true; coude.add(main);
        return { epaule, coude };
      }
      function jambe(cote) {
        const hanche = articulation(bassin, cote * 0.1, -0.04, 0);
        const cuisse = capsule(0.08, 0.3, pantalon); cuisse.position.y = -0.22; hanche.add(cuisse);
        const genou = articulation(hanche, 0, -0.45, 0);
        const tibia = capsule(0.065, 0.3, pantalon); tibia.position.y = -0.2; genou.add(tibia);
        const pied = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.24), mat('#2a2522', 0.7));
        pied.position.set(0, -0.44, 0.05); pied.castShadow = true; genou.add(pied);
        return { hanche, genou };
      }
      const brasG = bras(1), brasD = bras(-1); // gauche du personnage = +x (il regarde vers +z)
      const jambeG = jambe(1), jambeD = jambe(-1);

      // Tabouret de secours quand un personnage s'assoit sans siège dans le décor.
      const tabouret = new THREE.Group();
      boite(0.42, 0.05, 0.42, '#6b4a2f', 0, 0.45, -0.05, tabouret);
      cylindre(0.04, 0.05, 0.43, '#4a3220', 0, 0.22, -0.05, tabouret, 8);
      tabouret.visible = false;

      const groupe = new THREE.Group();
      groupe.add(racineP); groupe.add(tabouret);
      scene3d.add(groupe);

      return {
        def, groupe, racine: racineP, echelle, bassin, buste, cou, tete, bouche, yeux, brasG, brasD, jambeG, jambeD, tabouret,
        orientation: 0, phaseMarche: 0
      };
    }

    function reinitialiserPose(r) {
      for (const o of [r.bassin, r.buste, r.cou, r.tete, r.brasG.epaule, r.brasG.coude, r.brasD.epaule, r.brasD.coude,
                       r.jambeG.hanche, r.jambeG.genou, r.jambeD.hanche, r.jambeD.genou]) o.rotation.set(0, 0, 0);
      r.bassin.position.set(0, 0.95, 0);
      r.bouche.scale.set(1, 0.25, 0.4);
      r.yeux.forEach(o => o.scale.set(1, 1, 1));
    }

    // Applique une pose partielle avec un poids (0 = rien, 1 = pose complète).
    function appliquer(r, pose, w) {
      if (w <= 0) return;
      const cibles = {
        bassin: r.bassin, buste: r.buste, cou: r.cou, tete: r.tete,
        epauleG: r.brasG.epaule, coudeG: r.brasG.coude, epauleD: r.brasD.epaule, coudeD: r.brasD.coude,
        hancheG: r.jambeG.hanche, genouG: r.jambeG.genou, hancheD: r.jambeD.hanche, genouD: r.jambeD.genou
      };
      for (const cle in pose) {
        if (cle === 'hauteur') { r.bassin.position.y = lerp(r.bassin.position.y, pose.hauteur, w); continue; }
        const o = cibles[cle];
        const [x, y, z] = pose[cle];
        o.rotation.x = lerp(o.rotation.x, x, w);
        o.rotation.y = lerp(o.rotation.y, y, w);
        o.rotation.z = lerp(o.rotation.z, z, w);
      }
    }

    // Les gestes : fonctions (temps local, temps absolu) → pose.
    const GESTES = {
      saluer: (u, t) => ({ epauleD: [0, 0, -2.6], coudeD: [0, 0, -0.4 + Math.sin(t * 9) * 0.45], tete: [-0.05, 0, 0.08] }),
      pointer: () => ({ epauleD: [-1.5, 0, -0.15], coudeD: [-0.05, 0, 0], buste: [0, -0.15, 0] }),
      acquiescer: (u, t) => ({ tete: [Math.sin(t * 10) * 0.22 + 0.1, 0, 0] }),
      refuser: (u, t) => ({ tete: [0, Math.sin(t * 10) * 0.35, 0] }),
      sursauter: (u) => ({ hauteur: 0.95 + Math.sin(clamp(u * 2.2, 0, 1) * Math.PI) * 0.12, epauleG: [-0.4, 0, 1.1], epauleD: [-0.4, 0, -1.1],
                           coudeG: [-0.8, 0, 0], coudeD: [-0.8, 0, 0], buste: [-0.15, 0, 0], tete: [-0.2, 0, 0] }),
      rire: (u, t) => ({ buste: [-0.12 + Math.abs(Math.sin(t * 12)) * 0.08, 0, 0], tete: [-0.3, 0, 0],
                         epauleG: [-0.5, 0, 0.3], coudeG: [-1.6, 0, 0], epauleD: [-0.5, 0, -0.3], coudeD: [-1.6, 0, 0], bouche: 1 }),
      pleurer: (u, t) => ({ buste: [0.35, 0, 0], tete: [0.45, 0, 0], epauleG: [-1.2, 0, -0.35], coudeG: [-2.1, 0, 0],
                            epauleD: [-1.2, 0, 0.35], coudeD: [-2.1, 0, 0], hauteur: 0.95 + Math.sin(t * 7) * 0.01 }),
      reflechir: () => ({ epauleD: [-0.9, 0, 0.35], coudeD: [-2.3, 0, 0], epauleG: [-0.3, 0, -0.5], coudeG: [-1.6, 0, 0], tete: [0.1, 0, 0.12] }),
      danser: (u, t) => ({ bassin: [0, Math.sin(t * 5) * 0.3, Math.sin(t * 5) * 0.08], hauteur: 0.95 + Math.abs(Math.sin(t * 5)) * 0.05,
                           epauleG: [0, 0, 2.4 + Math.sin(t * 5) * 0.4], epauleD: [0, 0, -2.4 + Math.sin(t * 5) * 0.4],
                           hancheG: [Math.max(0, Math.sin(t * 5)) * -0.5, 0, 0], genouG: [Math.max(0, Math.sin(t * 5)) * 0.8, 0, 0] }),
      regarder: () => ({ tete: [0, 0, 0], buste: [0.05, 0, 0] }),
      chuchoter: () => ({ buste: [0.25, 0, 0.08], tete: [0, 0, 0.15], epauleD: [-1.0, 0, 0.3], coudeD: [-1.9, 0, 0] }),
      retourner: () => ({})
    };

    // Expression corporelle pendant une réplique, selon l'émotion.
    function poseParole(emotion, t, graine) {
      const s1 = Math.sin(t * 3.1 + graine * 10), s2 = Math.sin(t * 2.3 + graine * 7);
      switch (emotion) {
        case 'colere': return { buste: [0.18, 0, 0], tete: [0.1 + s1 * 0.05, 0, 0], epauleD: [-1.2 + s1 * 0.25, 0, -0.2], coudeD: [-1.4, 0, 0],
                                epauleG: [-0.2, 0, 0.25], coudeG: [-0.8, 0, 0] };
        case 'peur': return { buste: [-0.2, 0, 0], tete: [-0.1, s1 * 0.15, 0], epauleG: [-1.3, 0, 0.3], coudeG: [-1.6, 0, 0],
                              epauleD: [-1.3, 0, -0.3], coudeD: [-1.6, 0, 0], hauteur: 0.92 };
        case 'inquietude': return { tete: [0.12, s2 * 0.1, 0.05], epauleG: [-0.55, 0, -0.25], coudeG: [-1.3, 0, 0],
                                    epauleD: [-0.55, 0, 0.25], coudeD: [-1.3, 0, 0] };
        case 'tristesse': return { buste: [0.22, 0, 0], tete: [0.35, 0, 0], epauleG: [0, 0, 0.05], epauleD: [0, 0, -0.05] };
        case 'joie': return { buste: [-0.08, 0, 0], tete: [-0.1, s2 * 0.1, 0], epauleG: [-0.4, 0, 0.9 + s1 * 0.2], coudeG: [-0.6, 0, 0],
                              epauleD: [-0.4, 0, -0.9 - s1 * 0.2], coudeD: [-0.6, 0, 0], hauteur: 0.95 + Math.abs(s1) * 0.02 };
        case 'surprise': return { buste: [-0.15, 0, 0], tete: [-0.2, 0, 0], epauleG: [-0.6, 0, 1.0], coudeG: [-1.4, 0, 0],
                                  epauleD: [-0.6, 0, -1.0], coudeD: [-1.4, 0, 0], yeux: 1.5 };
        case 'chuchote': return { buste: [0.22, 0, 0], tete: [0.05, 0, 0.12], epauleD: [-1.0, 0, 0.25], coudeD: [-1.9, 0, 0] };
        case 'ironie': return { tete: [-0.05, 0.15, 0.15], epauleG: [-0.3, 0, 0.6], coudeG: [-1.0, 0, 0] };
        default: return { tete: [s2 * 0.06, s1 * 0.08, 0], epauleD: [-0.6 + s1 * 0.2, 0, -0.15], coudeD: [-1.1 + s2 * 0.3, 0, 0] };
      }
    }

    function angleVers(de, vers) { return Math.atan2(vers[0] - de[0], vers[1] - de[1]); }
    function differenceAngle(a, b) { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; }

    // ---------- Évaluation complète à l'instant t ----------

    function evaluer(t, dt) {
      const plan = etat.plan;
      if (!plan) return null;
      const scene = D.sceneA(plan, t);
      const temps = D.tempsA(plan, t);
      if (!scene) return { scene: null, temps };
      const saut = etat.dernierT === null || Math.abs(t - etat.dernierT) > 0.5 || dt <= 0;
      if (etat.decorCourant !== scene.index) construireDecor(scene);
      etat.dernierT = t;

      // Positions de chaque membre de la distribution.
      const positions = {};
      for (const [id, r] of etat.personnages) {
        const visible = scene.distribution.includes(id) && D.visibleA(plan, scene, id, t);
        r.groupe.visible = visible;
        if (!visible) continue;
        const { pos, enMouvement } = D.positionA(plan, scene, id, t);
        positions[id] = { pos, enMouvement, rig: r };
      }

      // Qui parle, à qui ?
      let dialogue = temps && temps.type === 'dialogue' && t <= temps.fin ? temps : null;
      let referenceDialogue = dialogue;
      if (!referenceDialogue) {
        for (const b of plan.temps) if (b.scene === scene.index && b.type === 'dialogue' && b.debut <= t) referenceDialogue = b;
      }

      for (const id in positions) {
        const { pos, enMouvement, rig: r } = positions[id];
        reinitialiserPose(r);
        r.groupe.position.set(pos[0], 0, pos[1]);
        const { posture, brasCroises } = D.postureA(plan, id, t, scene);
        const assis = posture.type === 'assis';
        const graine = hash(id);

        // Orientation visée.
        let cap = r.orientation;
        if (enMouvement) {
          cap = angleVers(enMouvement.de, enMouvement.vers);
        } else {
          let regard = null;
          const geste = plan.gestes.find(g => g.personnage === id && t >= g.debut && t <= g.fin && g.vers);
          if (geste && positions[geste.vers]) regard = positions[geste.vers].pos;
          else if (referenceDialogue) {
            if (referenceDialogue.personnage === id && referenceDialogue.interlocuteur && positions[referenceDialogue.interlocuteur]) regard = positions[referenceDialogue.interlocuteur].pos;
            else if (referenceDialogue.personnage !== id && positions[referenceDialogue.personnage]) regard = positions[referenceDialogue.personnage].pos;
          }
          if (!regard) {
            // Sinon : regarder le plus proche voisin, ou vers l'avant de la scène.
            let meilleur = null, dMin = Infinity;
            for (const autre in positions) {
              if (autre === id) continue;
              const d = Math.hypot(positions[autre].pos[0] - pos[0], positions[autre].pos[1] - pos[1]);
              if (d < dMin) { dMin = d; meilleur = positions[autre].pos; }
            }
            regard = meilleur && dMin < 6 ? meilleur : [pos[0], pos[1] + 5];
          }
          cap = angleVers(pos, regard);
          const dos = plan.orientations.find(o => o.personnage === id && t >= o.debut && t <= o.fin);
          if (dos) cap += Math.PI * lisser((t - dos.debut) / 0.8);
        }
        if (saut) r.orientation = cap;
        else r.orientation += differenceAngle(r.orientation, cap) * clamp(dt * 6, 0, 1);
        r.groupe.rotation.y = r.orientation;

        // Base : respiration et balancement léger.
        const respire = Math.sin(t * 1.6 + graine * 6);
        appliquer(r, { buste: [respire * 0.015, 0, 0], epauleG: [0.02, 0, 0.09 + respire * 0.01], epauleD: [0.02, 0, -0.09 - respire * 0.01],
                       tete: [0, Math.sin(t * 0.4 + graine * 9) * 0.08, 0] }, 1);

        // Marche / course.
        if (enMouvement) {
          const course = enMouvement.mode === 'courir';
          const k = (t - enMouvement.debut) * (course ? 11 : 7.2);
          const amp = course ? 0.9 : 0.55;
          const s = Math.sin(k), c = Math.cos(k);
          appliquer(r, {
            hancheG: [-s * amp, 0, 0], hancheD: [s * amp, 0, 0],
            genouG: [Math.max(0, c) * amp * 1.4, 0, 0], genouD: [Math.max(0, -c) * amp * 1.4, 0, 0],
            epauleG: [s * amp * 0.9, 0, 0.08], epauleD: [-s * amp * 0.9, 0, -0.08],
            coudeG: [course ? -1.4 : -0.3, 0, 0], coudeD: [course ? -1.4 : -0.3, 0, 0],
            buste: [course ? 0.2 : 0.04, s * 0.06, 0], hauteur: 0.95 + Math.abs(c) * (course ? 0.06 : 0.035)
          }, 1);
        }

        // Postures.
        r.tabouret.visible = false;
        if (assis) {
          const w = lisser((t - posture.t) / 0.7);
          appliquer(r, { hauteur: 0.52, hancheG: [-1.5, 0, 0.06], hancheD: [-1.5, 0, -0.06], genouG: [1.5, 0, 0], genouD: [1.5, 0, 0],
                         buste: [-0.05, 0, 0], epauleG: [-0.45, 0, 0.1], epauleD: [-0.45, 0, -0.1], coudeG: [-0.7, 0, 0], coudeD: [-0.7, 0, 0] }, w);
          if (posture.tabouret) {
            r.tabouret.visible = w > 0.05;
            r.tabouret.scale.setScalar(Math.max(0.01, w));
          }
        } else if (posture.type === 'debout' && posture.t > scene.debut) {
          // Transition assis → debout.
          const w = 1 - lisser((t - posture.t) / 0.7);
          if (w > 0) appliquer(r, { hauteur: 0.52, hancheG: [-1.5, 0, 0], hancheD: [-1.5, 0, 0], genouG: [1.5, 0, 0], genouD: [1.5, 0, 0] }, w);
        }
        if (brasCroises !== false && !enMouvement) {
          appliquer(r, { epauleG: [-0.75, 0, -0.45], coudeG: [-1.75, -0.5, 0], epauleD: [-0.85, 0, 0.45], coudeD: [-1.75, 0.5, 0] },
                    lisser((t - brasCroises) / 0.6));
        }

        // Réplique en cours.
        if (dialogue && dialogue.personnage === id) {
          const w = enveloppe(t, dialogue.debut, dialogue.fin, 0.4);
          const pose = poseParole(dialogue.emotion, t, graine);
          const yeux = pose.yeux; delete pose.yeux;
          if (assis || enMouvement) { delete pose.hauteur; }
          appliquer(r, pose, w * (brasCroises !== false ? 0.6 : 1));
          // Bouche : alternance pseudo-syllabique.
          const syllabe = bruit(Math.floor(t * 9) + graine * 100);
          const ouverture = t < dialogue.fin - 0.15 ? 0.25 + syllabe * (dialogue.emotion === 'chuchote' ? 0.35 : 0.85) : 0.25;
          r.bouche.scale.y = ouverture * (dialogue.emotion === 'colere' ? 1.3 : 1);
          if (yeux) r.yeux.forEach(o => o.scale.setScalar(lerp(1, yeux, w)));
        } else if (dialogue && dialogue.interlocuteur === id) {
          // L'interlocuteur réagit légèrement.
          const reaction = { tristesse: { tete: [0.2, 0, 0] }, colere: { buste: [-0.08, 0, 0], tete: [-0.05, 0, 0] },
                             surprise: { tete: [-0.1, 0, 0.1] }, joie: { tete: [-0.05, 0, 0.08] } }[dialogue.emotion];
          if (reaction) appliquer(r, reaction, enveloppe(t, dialogue.debut, dialogue.fin, 0.6) * 0.7);
        }

        // Gestes ponctuels.
        for (const g of plan.gestes) {
          if (g.personnage !== id || t < g.debut || t > g.fin) continue;
          const f = GESTES[g.type];
          if (!f) continue;
          const pose = f((t - g.debut) / (g.fin - g.debut), t);
          const ouvrir = pose.bouche; delete pose.bouche;
          if (assis) delete pose.hauteur;
          const w = enveloppe(t, g.debut, g.fin, 0.3);
          appliquer(r, pose, w);
          if (ouvrir) r.bouche.scale.y = lerp(r.bouche.scale.y, 0.5 + Math.abs(Math.sin(t * 14)) * 0.5, w);
        }

        // Clignement des yeux.
        if (bruit(Math.floor(t * 4) + graine * 50) > 0.93) r.yeux.forEach(o => { o.scale.y = 0.15; });
      }

      return { scene, temps, positions, dialogue };
    }

    // ---------- Lumière ----------

    function appliquerEclairage(scene, t) {
      const { courant, precedent } = D.eclairageA(etat.plan, scene, t);
      const a = PRESETS[(precedent || courant).preset] || PRESETS.jour;
      const b = PRESETS[courant.preset] || PRESETS.jour;
      const k = precedent ? lisser((t - courant.t) / 1.5) : 1;
      const p = melangerPresets(a, b, k, THREE.Color);
      scene3d.background = p.ciel;
      scene3d.fog.color.copy(p.brume);
      const meteo = scene.meteo === 'brouillard' ? 0.035 : 0;
      scene3d.fog.density = scene.interieur ? p.densite * 0.4 : p.densite + meteo;
      hemi.color.copy(p.hemiCiel); hemi.groundColor.copy(p.hemiSol); hemi.intensity = p.hemi;
      soleil.color.copy(p.soleil); soleil.intensity = p.intensite * (scene.interieur ? 0.7 : 1);
      soleil.position.set(p.dir[0], p.dir[1], p.dir[2]);
      soleil.target.position.set(0, 0, 0);
      renderer.toneMappingExposure = p.expo;
      for (const l of etat.lampes) {
        l.lumiere.intensity = l.base * p.lampes;
        l.ampoule.material.emissiveIntensity = Math.min(3, p.lampes * 1.5);
      }
      for (const v of etat.vitres) v.emissiveIntensity = clamp(p.lampes * 0.5, 0, 1.4);
      for (const f of etat.fenetres) { f.color.copy(p.ciel); f.emissive.copy(p.ciel); f.emissiveIntensity = 0.6; }
      // Éclairs : flash bref, déterministe.
      let eclair = 0;
      if (p.eclairs) {
        const fenetre = Math.floor(t * 1.5);
        if (bruit(fenetre + scene.index * 31) > 0.86) {
          const u = t * 1.5 - fenetre;
          eclair = u < 0.12 ? 1 : u < 0.2 ? 0 : u < 0.28 ? 0.7 : 0;
        }
        hemi.intensity += eclair * 3;
        scene3d.background = p.ciel.clone().lerp(new THREE.Color('#dfe8ff'), eclair * 0.7);
      }
      remplissage.intensity = scene.interieur ? 5 : 3 + (p.lampes > 1.5 ? 3 : 0);
      return { eclair, preset: courant.preset, orage: p.eclairs };
    }

    // ---------- Caméra ----------

    function centreDe(positions) {
      const ids = Object.keys(positions);
      if (!ids.length) return [0, 0];
      let x = 0, z = 0;
      ids.forEach(id => { x += positions[id].pos[0]; z += positions[id].pos[1]; });
      return [x / ids.length, z / ids.length];
    }

    function cadrer(temps, positions, scene, t) {
      const cadre = temps ? temps.plan : { type: 'large' };
      const u = temps ? clamp((t - temps.debut) / Math.max(0.01, temps.fin - temps.debut), 0, 1) : 0;
      const pos = id => id && positions[id] ? positions[id].pos : null;
      const hauteurTete = id => {
        const r = id && positions[id] ? positions[id].rig : null;
        if (!r) return 1.6;
        return (r.bassin.position.y + 0.8) * r.echelle;
      };
      const centre = centreDe(positions);
      const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
      const sujet = pos(cadre.sujet);
      const cible = pos(cadre.cible);
      // Côté de l'axe : on reste toujours du même côté (règle des 180°), ici vers +z (avant-scène).
      function cote(a, b) {
        const dx = b[0] - a[0], dz = b[1] - a[1];
        const d = Math.hypot(dx, dz) || 1;
        let nx = -dz / d, nz = dx / d;
        if (nz < 0) { nx = -nx; nz = -nz; }
        return [nx, nz, dx / d, dz / d, d];
      }
      let position, regard, focale = 40;

      switch (cadre.type) {
        case 'titre':
        case 'large': {
          const ouverture = cadre.ouverture;
          const recul = ouverture ? lerp(13, 10.5, lisser(u)) : 9.5;
          const balayage = ouverture ? lerp(-0.35, 0.05, lisser(u)) : 0.1 * Math.sin(t * 0.1);
          position = v3(centre[0] + Math.sin(balayage) * recul, ouverture ? lerp(5.5, 3.6, lisser(u)) : 3.4, centre[1] + Math.cos(balayage) * recul);
          regard = v3(centre[0], 1.1, centre[1] - 0.5);
          focale = 38;
          break;
        }
        case 'deux': {
          if (!sujet || !cible) return cadrer({ ...temps, plan: { type: sujet ? 'moyen' : 'large', sujet: cadre.sujet } }, positions, scene, t);
          const [nx, nz, , , d] = cote(sujet, cible);
          const m = [(sujet[0] + cible[0]) / 2, (sujet[1] + cible[1]) / 2];
          const recul = 2.8 + d * 0.9 - u * 0.3;
          position = v3(m[0] + nx * recul, 1.55, m[1] + nz * recul);
          regard = v3(m[0], 1.35, m[1]);
          focale = 38;
          break;
        }
        case 'amorce': {
          if (!sujet || !cible) return cadrer({ ...temps, plan: { type: 'moyen', sujet: cadre.sujet } }, positions, scene, t);
          // Caméra derrière l'épaule de la cible, qui reste en amorce au premier plan.
          const [nx, nz, ux, uz] = cote(sujet, cible);
          const h = hauteurTete(cadre.cible);
          position = v3(cible[0] + ux * 1.5 + nx * 0.8, h + 0.1, cible[1] + uz * 1.5 + nz * 0.8);
          regard = v3(sujet[0] + nx * 0.15, hauteurTete(cadre.sujet) - 0.05, sujet[1] + nz * 0.15);
          focale = 32 + u * 3;
          break;
        }
        case 'moyen':
        case 'gros_plan':
        case 'plongee':
        case 'contre_plongee': {
          if (!sujet) return cadrer({ ...temps, plan: { type: 'large' } }, positions, scene, t);
          const r = positions[cadre.sujet].rig;
          // Face au personnage, légèrement de trois quarts.
          const a = r.orientation + (hash(cadre.sujet) > 0.5 ? 0.35 : -0.35);
          const fx = Math.sin(a), fz = Math.cos(a);
          const h = hauteurTete(cadre.sujet);
          if (cadre.type === 'moyen') {
            const recul = 3.1 - u * 0.25;
            position = v3(sujet[0] + fx * recul, h - 0.2, sujet[1] + fz * recul);
            regard = v3(sujet[0], h - 0.4, sujet[1]);
            focale = 36;
          } else if (cadre.type === 'gros_plan') {
            const recul = 2.1 - u * 0.15;
            position = v3(sujet[0] + fx * recul, h + 0.02, sujet[1] + fz * recul);
            regard = v3(sujet[0], h - 0.12, sujet[1]);
            focale = 30;
          } else if (cadre.type === 'plongee') {
            position = v3(sujet[0] + fx * 2.6, h + 2.6, sujet[1] + fz * 2.6);
            regard = v3(sujet[0], h - 0.6, sujet[1]);
            focale = 40;
          } else {
            position = v3(sujet[0] + fx * 2.0, 0.55, sujet[1] + fz * 2.0);
            regard = v3(sujet[0], h + 0.05, sujet[1]);
            focale = 38;
          }
          break;
        }
        case 'travelling': {
          if (!sujet) return cadrer({ ...temps, plan: { type: 'large' } }, positions, scene, t);
          const mv = positions[cadre.sujet].enMouvement;
          let dx = 1, dz = 0;
          if (mv) { const d = Math.hypot(mv.vers[0] - mv.de[0], mv.vers[1] - mv.de[1]) || 1; dx = (mv.vers[0] - mv.de[0]) / d; dz = (mv.vers[1] - mv.de[1]) / d; }
          let nx = -dz, nz = dx;
          if (nz < 0) { nx = -nx; nz = -nz; }
          position = v3(sujet[0] + nx * 5.2 - dx * 1.2, 1.7, sujet[1] + nz * 5.2 - dz * 1.2);
          regard = v3(sujet[0] + dx * 0.6, 1.2, sujet[1] + dz * 0.6);
          focale = 36;
          break;
        }
        default:
          position = v3(centre[0], 3.4, centre[1] + 9.5);
          regard = v3(centre[0], 1.1, centre[1]);
      }

      // Décors intérieurs : la caméra ne traverse pas les murs.
      if (scene.interieur) {
        position.x = clamp(position.x, -5.6, 5.6);
        position.z = clamp(position.z, -3.8, 9);
        position.y = clamp(position.y, 0.4, 3.7);
      }
      // Légère respiration de caméra « à l'épaule ».
      position.x += Math.sin(t * 0.7) * 0.02;
      position.y += Math.sin(t * 0.9 + 1) * 0.015;
      return { position, regard, focale };
    }

    // ---------- Composition 2D ----------

    function decouper(ctx, texte, largeurMax) {
      const mots = texte.split(/\s+/);
      const lignes = [];
      let courante = '';
      for (const m of mots) {
        const essai = courante ? courante + ' ' + m : m;
        if (ctx.measureText(essai).width > largeurMax && courante) { lignes.push(courante); courante = m; }
        else courante = essai;
      }
      if (courante) lignes.push(courante);
      return lignes;
    }

    function composer(t, info) {
      const W = sortie.width, H = sortie.height;
      ctx.drawImage(renderer.domElement, 0, 0, W, H);
      const plan = etat.plan;
      const echelle = H / 720;

      // Bandes cinéma 2.39:1.
      let bande = 0;
      if (etat.options.cinemascope) {
        bande = Math.round((H - W / 2.39) / 2);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, W, bande); ctx.fillRect(0, H - bande, W, bande);
      }

      // Fondus au noir entre les scènes.
      let noir = 0;
      if (info.scene) {
        const sc = info.scene;
        if (sc.index > 0) noir = Math.max(noir, 1 - clamp((t - sc.debut) / 0.7, 0, 1));
        noir = Math.max(noir, 1 - clamp((sc.fin - t) / 0.6, 0, 1));
      }

      // Carton de titre.
      const titre = plan.temps[0];
      if (titre && titre.type === 'titre' && t < titre.fin) {
        const a = Math.min(1, t / 0.6, (titre.fin - t) / 0.8);
        ctx.fillStyle = `rgba(0,0,0,${0.75 * clamp(a + 0.2, 0, 1)})`;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.fillStyle = '#f5efe4';
        ctx.textAlign = 'center';
        ctx.font = `600 ${Math.round(58 * echelle)}px Georgia, 'Times New Roman', serif`;
        ctx.fillText(plan.titre, W / 2, H / 2);
        ctx.font = `${Math.round(18 * echelle)}px Arial, sans-serif`;
        ctx.fillStyle = '#c9b8e0';
        ctx.fillText('Studio 3D — L\'Architecte de Rumeurs', W / 2, H / 2 + 44 * echelle);
        ctx.globalAlpha = 1;
      }

      if (noir > 0) { ctx.fillStyle = `rgba(0,0,0,${noir})`; ctx.fillRect(0, 0, W, H); }

      // Carton de lieu en début de scène.
      if (info.temps && info.temps.type === 'etablissement') {
        const u = t - info.temps.debut;
        const a = clamp(Math.min((u - 0.3) / 0.5, (info.temps.fin - t) / 0.5), 0, 1);
        if (a > 0) {
          ctx.globalAlpha = a;
          ctx.textAlign = 'left';
          ctx.font = `bold ${Math.round(15 * echelle)}px Arial, sans-serif`;
          const texte = info.scene.entete.toUpperCase();
          const l = ctx.measureText(texte).width;
          const x = 40 * echelle, y = bande + 46 * echelle;
          ctx.fillStyle = 'rgba(0,0,0,0.55)';
          ctx.fillRect(x - 14 * echelle, y - 24 * echelle, l + 28 * echelle, 36 * echelle);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(texte, x, y);
          ctx.globalAlpha = 1;
        }
      }

      // Sous-titres.
      if (etat.options.sousTitres && info.dialogue) {
        const d = info.dialogue;
        const a = clamp(Math.min((t - d.debut) / 0.15, (d.fin - t) / 0.15), 0, 1);
        if (a > 0) {
          const perso = plan.personnages.find(p => p.id === d.personnage);
          const taille = Math.round(26 * echelle);
          ctx.font = `${taille}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          const lignes = decouper(ctx, (d.emotion === 'chuchote' ? '(bas) ' : '') + d.texte, W * 0.72);
          const base = H - Math.max(bande, 0) - 34 * echelle - (lignes.length - 1) * taille * 1.25;
          ctx.globalAlpha = a;
          ctx.lineJoin = 'round';
          ctx.lineWidth = 5 * echelle;
          ctx.strokeStyle = 'rgba(0,0,0,0.85)';
          if (etat.options.nomsLocuteurs && perso) {
            ctx.font = `bold ${Math.round(17 * echelle)}px Arial, sans-serif`;
            ctx.strokeText(perso.nom.toUpperCase(), W / 2, base - taille * 1.05);
            ctx.fillStyle = perso.couleurRendu || '#ffd27f';
            ctx.fillText(perso.nom.toUpperCase(), W / 2, base - taille * 1.05);
            ctx.font = `${taille}px Arial, sans-serif`;
          }
          ctx.fillStyle = '#ffffff';
          lignes.forEach((l, i) => {
            ctx.strokeText(l, W / 2, base + i * taille * 1.25);
            ctx.fillText(l, W / 2, base + i * taille * 1.25);
          });
          ctx.globalAlpha = 1;
        }
      }
    }

    // ---------- API ----------

    function charger(plan) {
      for (const r of etat.personnages.values()) {
        scene3d.remove(r.groupe);
        r.groupe.traverse(o => { if (o.geometry) o.geometry.dispose(); });
      }
      etat.personnages.clear();
      etat.plan = plan;
      etat.decorCourant = -1;
      etat.dernierT = null;
      for (const p of plan.personnages) {
        const r = creerPersonnage(p);
        etat.personnages.set(p.id, r);
        // Couleur lisible pour le nom dans les sous-titres.
        const c = new THREE.Color(p.couleur || TENUES[Math.floor(hash(p.id + 't') * TENUES.length)]);
        const hsl = {}; c.getHSL(hsl);
        p.couleurRendu = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s + 0.1), Math.max(0.62, hsl.l)).getStyle();
      }
    }

    function rendre(t, dt = 0) {
      if (!etat.plan) return null;
      const info = evaluer(t, dt);
      if (!info || !info.scene) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, sortie.width, sortie.height);
        return info;
      }
      const lumiere = appliquerEclairage(info.scene, t);
      animerMeteo(t, true);
      const vue = cadrer(info.temps && info.temps.type === 'titre' ? { ...info.temps, plan: { type: 'large', ouverture: true } } : info.temps,
                         info.positions, info.scene, t);
      camera.position.copy(vue.position);
      camera.fov = vue.focale;
      camera.aspect = sortie.width / sortie.height;
      camera.updateProjectionMatrix();
      camera.lookAt(vue.regard);
      remplissage.position.copy(vue.position).lerp(vue.regard, 0.35);
      remplissage.position.y += 0.6;
      renderer.render(scene3d, camera);
      composer(t, info);
      info.lumiere = lumiere;
      return info;
    }

    function redimensionner(l, h) {
      sortie.width = l; sortie.height = h;
      renderer.setSize(l, h, false);
    }

    redimensionner(largeur, hauteur);

    return {
      charger, rendre, redimensionner,
      reglerOptions(o) { Object.assign(etat.options, o); },
      get plan() { return etat.plan; }
    };
  }

  racine.Stage = { creerPlateau, PRESETS };
})(typeof self !== 'undefined' ? self : this);
