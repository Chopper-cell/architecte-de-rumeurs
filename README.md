[README.md](https://github.com/user-attachments/files/30301238/README.md)
# L'Architecte de Rumeurs

Prototype web jouable, satirique et pédagogique sur la diffusion d'une rumeur dans un réseau de personnages fictifs.

## Le concept

Le joueur compose une rumeur fictive en choisissant un fait de départ, une déformation cognitive et un ton de message.

La rumeur circule ensuite dans un réseau de 24 PNJ. Chaque personnage possède un niveau de scepticisme, des préférences de ton et des liens d'amitié. Le Rectificateur intervient pendant la simulation pour freiner sa diffusion.

Le jeu ne cherche pas à enseigner la manipulation réelle : c'est une fable interactive qui aide à observer les mécanismes de désinformation et de déformation d'un message.

## Fonctionnalités du prototype

- 10 faits de départ, 7 déformations et 6 tons de message ;
- propagation sur jusqu'à 6 tours ;
- journal qui explique les décisions des PNJ ;
- calcul de la portée, de la crédibilité et de la déformation ;
- conclusions satiriques adaptées au résultat ;
- aucune donnée personnelle collectée et aucune connexion à une API.

## Jouer localement

Télécharge ou clone ce dépôt, puis ouvre simplement le fichier `index.html` dans un navigateur web récent. Aucune installation, aucun framework et aucun serveur ne sont nécessaires.

## Règle de propagation

Un PNJ relaie la rumeur lorsque :

```text
compatibilité avec le ton − frein du Rectificateur > scepticisme
```

Cette règle volontairement simple rend la simulation lisible et facile à modifier.

## Technologies

Le projet tient dans un seul fichier autonome : HTML pour la structure, CSS pour l'apparence et JavaScript pour la simulation.

## Statut

Prototype en cours d'évolution, réalisé comme projet d'apprentissage.

## Studio 3D : du scénario à la séquence

Le dossier [`studio-3d/`](studio-3d/README.md) contient un second outil. Il transforme un scénario écrit en séquences 3D : décors, personnages animés, dialogues sous-titrés, éclairages, découpage caméra et export vidéo. Pour l'utiliser, ouvre `studio-3d/index.html` dans un navigateur.
