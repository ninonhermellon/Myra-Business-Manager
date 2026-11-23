# V28 — Remise en ordre de l'interface (UI/UX)

Identité conservée (vert Myra, verre dépoli, typographies). Les corrections sont regroupées dans
`css/v28.css`, chargée en dernier et commentée par section.

## Mobile
- **Listes lisibles sans défilement horizontal** : chaque vente, client ou paiement tient sur une ligne
  de liste (nom + montant en haut ; n°, date, statut dessous). Avant, seules 2 colonnes sur 6 étaient
  visibles et les montants étaient hors écran.
- **Menu tiroir enfin utilisable** : il passait sous la barre du bas (Profil, Paramètres et Déconnexion
  inaccessibles). La barre du bas se masque quand le menu est ouvert.
- **Plein écran** : suppression du cadre flottant et des bandes de couleur sur les bords.
- **Un seul titre** : la barre du haut porte le titre de la page, plus de titre répété en dessous.
- Boutons d'action : « Ajouter » mis en avant, CSV / PDF compacts.
- Périodes du tableau de bord sur une seule ligne (plus de « Rappor » coupé).
- Fiches (vente, client…) ouvertes depuis le bas de l'écran, actions rangées en grille,
  action principale en pleine largeur.

## Ordinateur et mobile
- **Ventes** : la liste affiche enfin le **Total** et le **Montant payé** (au lieu de Sous-total et
  Remise, presque toujours à 0). Colonnes choisies aussi pour Clients, Paiements, Dépenses, Trésorerie,
  Devis et Produits.
- **Statuts colorés par sens** : vert payé, ambre en cours, bleu confirmé, rouge annulé, gris brouillon ;
  texte agrandi (11,5 px au lieu de 9 px environ).
- **Cartes produits** : nom et prix d'abord ; un seul badge cohérent (« Rupture », « Stock bas »,
  « Indisponible ») au lieu de « Disponible » affiché même avec un stock à 0.
- En-têtes de colonnes sans « (FCFA) » répété ; montants alignés et en gras.
- Intitulé « Produits & stocks » identique dans le menu et la page ; fiche « Vente VTE-… » au lieu de
  « Centre de contrôle · … ».

## Technique
- Icônes Font Awesome 6.5.2 livrées dans `vendor/` : elles s'affichent aussi hors connexion.
- Cache PWA passé en v13.

## V28.2 — Style mobile « application de gestion » (remplace le style V28.1)
Fichier `css/mobile.css` (mobile uniquement, l'ordinateur ne change pas).
- Fond gris très clair, **cartes blanches** légèrement surélevées, coins arrondis.
- Tableau de bord : **carte sombre** « Encaissé · période » avec gros montant, **pastille de tendance**
  (+/- % vs période précédente) et bouton « + Vente » ; périodes en **sélecteur segmenté** ;
  indicateurs en tuiles blanches ; nouvelle section **Accès rapide** (icônes colorées + chevrons).
- **Profil** : photo centrée, nom, e-mail, puis liste de réglages (informations, paramètres de
  l'entreprise, synchronisation, déconnexion en rouge).
- Listes dans une carte blanche, avatars carrés arrondis ; filtres en puces, active verte.
- **Barre d'onglets flottante** avec bouton central « + » vert surélevé.
- Fiches en feuille glissante ; écran de connexion en carte.
- Cache PWA passé en v15.
