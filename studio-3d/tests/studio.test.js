// Tests de l'analyseur et du réalisateur : node --test studio-3d/tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Parser = require('../src/parser.js');
const Director = require('../src/director.js');
const exemple = require('../exemples/la-rumeur-du-boulanger.js');

test('analyse le titre, les personnages et les scènes de l\'exemple', () => {
  const s = Parser.analyser(exemple);
  assert.equal(s.titre, 'La Rumeur du boulanger');
  assert.deepEqual(s.personnages.map(p => p.id), ['alice', 'bruno', 'chloe']);
  assert.equal(s.personnages[1].taille, 1.82);
  assert.equal(s.personnages[1].voix, 'grave');
  assert.equal(s.scenes.length, 2);
  assert.equal(s.scenes[0].interieur, false);
  assert.equal(s.scenes[0].moment, 'aube');
  assert.equal(s.scenes[1].interieur, true);
  assert.equal(s.scenes[1].moment, 'nuit');
  assert.deepEqual(s.avertissements, []);
});

test('reconnaît les deux formats de réplique et les émotions', () => {
  const s = Parser.analyser('INT. SALON - JOUR\nMARC: (furieux) Assez !\n\nLÉA\n(en chuchotant)\nViens par ici.');
  const [a, b] = s.scenes[0].temps;
  assert.equal(a.type, 'dialogue');
  assert.equal(a.emotion, 'colere');
  assert.equal(b.personnage, 'lea');
  assert.equal(b.emotion, 'chuchote');
  assert.equal(b.texte, 'Viens par ici.');
});

test('crée une scène par défaut et signale les personnages non déclarés', () => {
  const s = Parser.analyser('PAUL: Bonjour.');
  assert.equal(s.scenes.length, 1);
  assert.ok(s.avertissements.some(a => a.includes('aucune scène')));
  assert.ok(s.avertissements.some(a => a.includes('PAUL')));
});

test('analyse les actions : verbe, sujets et cible', () => {
  const persos = [{ id: 'alice', nom: 'Alice' }, { id: 'bruno', nom: 'Bruno' }];
  const decor = Director.DECORS.place;
  assert.deepEqual(Director.analyserAction('Bruno marche vers Alice.', persos, decor),
    { verbe: 'marcher', sujets: ['bruno'], cible: { personnage: 'alice' } });
  assert.deepEqual(Director.analyserAction('Alice et Bruno sortent par la porte.', persos, decor),
    { verbe: 'sortir', sujets: ['alice', 'bruno'], cible: { repere: 'porte' } });
  assert.equal(Director.analyserAction('Alice s\'assoit sur le banc.', persos, decor).verbe, 'assis');
});

test('choisit décor et éclairage à partir de l\'en-tête', () => {
  assert.equal(Director.choisirDecor({ lieu: 'Café du coin', interieur: true }), 'cafe');
  assert.equal(Director.choisirDecor({ lieu: 'Clairière', interieur: false }), 'foret');
  assert.equal(Director.choisirDecor({ lieu: 'Inconnu', interieur: true }), 'salon');
  assert.equal(Director.choisirEclairage(null, true, 'nuit'), 'interieur_nuit');
  assert.equal(Director.choisirEclairage('orage', false, 'jour'), 'orage');
  assert.equal(Director.choisirEclairage(null, false, 'crepuscule'), 'crepuscule');
});

test('le plan de tournage est continu, ordonné et cohérent', () => {
  const plan = Director.construirePlan(Parser.analyser(exemple));
  assert.ok(plan.duree > 30);
  for (let i = 1; i < plan.temps.length; i++) {
    assert.ok(plan.temps[i].debut >= plan.temps[i - 1].debut, `ordre du temps ${i}`);
    assert.ok(plan.temps[i].fin > plan.temps[i].debut);
  }
  assert.equal(plan.temps[0].type, 'titre');
  assert.equal(plan.scenes[0].debut, 0);
  assert.ok(plan.scenes[1].debut >= plan.scenes[0].fin - 1e-9);
  // Chloé entre en cours de scène 1 : invisible au départ, visible après son entrée.
  const sc = plan.scenes[0];
  const entree = plan.temps.find(b => b.verbe === 'entrer');
  assert.equal(Director.visibleA(plan, sc, 'chloe', 5), false);
  assert.equal(Director.visibleA(plan, sc, 'chloe', entree.fin), true);
  // Elle finit à distance de conversation d'Alice.
  const pc = Director.positionA(plan, sc, 'chloe', entree.fin).pos;
  const pa = Director.positionA(plan, sc, 'alice', entree.fin).pos;
  const d = Math.hypot(pc[0] - pa[0], pc[1] - pa[1]);
  assert.ok(d > 0.8 && d < 2, `distance ${d}`);
  // La directive CAMÉRA s'applique à la réplique suivante.
  const impose = plan.temps.find(b => b.plan.impose);
  assert.equal(impose.plan.type, 'gros_plan');
  assert.equal(impose.personnage, 'bruno');
  // Changement d'éclairage en cours de scène 2.
  assert.deepEqual(plan.eclairages.filter(e => e.scene === 1).map(e => e.preset), ['tamise', 'orage']);
  // Bruno s'assoit puis se relève.
  const postures = plan.postures.filter(p => p.personnage === 'bruno').map(p => p.type);
  assert.deepEqual(postures, ['bras_croises', 'assis', 'debout']);
});

test('la durée d\'une réplique dépend de sa longueur et de l\'émotion', () => {
  const court = Director.dureeReplique('Oui.', 'neutre');
  const long = Director.dureeReplique('Je ne sais vraiment pas quoi te répondre à propos de cette histoire.', 'neutre');
  assert.equal(court, 1.6);
  assert.ok(long > 4);
  assert.ok(Director.dureeReplique('Un texte assez long pour comparer', 'tristesse') > Director.dureeReplique('Un texte assez long pour comparer', 'colere'));
});

test('tempsA trouve le plan actif par recherche binaire', () => {
  const plan = Director.construirePlan(Parser.analyser(exemple));
  for (const b of plan.temps) assert.equal(Director.tempsA(plan, b.debut + 0.001), b);
});
