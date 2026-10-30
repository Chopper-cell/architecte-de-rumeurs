// Scénario d'exemple chargé par défaut dans l'éditeur (script classique pour fonctionner en file://).
(function (racine) {
  const texte = `TITRE: La Rumeur du boulanger

# Déclaration des personnages (couleur des vêtements, taille en mètres, voix)
PERSONNAGE: ALICE | couleur=#d1495b | taille=1.66 | cheveux=#3b2418 | voix=aigue
PERSONNAGE: BRUNO | couleur=#2e86ab | taille=1.82 | cheveux=#1c1c1c | voix=grave
PERSONNAGE: CHLOÉ | couleur=#edae49 | taille=1.60 | cheveux=#5a2a14 | peau=#8d5524

SCÈNE 1 — EXT. PLACE DU VILLAGE — AUBE
AMBIANCE: brouillard
[Alice et Bruno discutent près de la fontaine.]
ALICE: (inquiète) Tu as entendu ? Le boulanger aurait vendu sa recette secrète à une multinationale.
BRUNO: (rit) Qui t'a raconté une histoire pareille ?
ALICE: Personne. Enfin… tout le monde. On l'a vu monter dans une voiture noire.
[Bruno croise les bras.]
BRUNO: (perplexe) Une voiture noire. C'est tout ?
[Chloé entre et rejoint Alice.]
CHLOÉ: (essoufflée) Vous parlez du boulanger ? Il paraît qu'il quitte le village !
CAMÉRA: gros plan BRUNO
BRUNO: (surpris) Voilà comment une rumeur prend trois étages en une minute.
[Alice pointe Chloé.]
ALICE: (en colère) Tu vois ! Je n'invente rien !

SCÈNE 2 — INT. CAFÉ DU COIN — NUIT
LUMIÈRE: tamisée
[Bruno s'assoit à la table.]
[Chloé marche vers Bruno.]
CHLOÉ: (chuchote) J'ai appelé la boulangerie. Il était chez le dentiste.
BRUNO: (calme) Donc personne n'a vérifié avant de répéter.
[Chloé hoche la tête.]
CHLOÉ: (triste) Et Alice l'a déjà dit à tout le marché.
LUMIÈRE: orage
[Bruno se lève.]
BRUNO: (déterminé) Alors on va rectifier. Calmement, avec des faits.
[Bruno et Chloé sortent par la porte.]
`;
  if (typeof module === 'object' && module.exports) module.exports = texte;
  else racine.SCENARIO_EXEMPLE = texte;
})(typeof self !== 'undefined' ? self : this);
