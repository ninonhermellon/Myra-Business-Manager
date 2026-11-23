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

## V28.1 — Style mobile « épuré » (inspiré des applications de boutique)
Fichier `css/mobile.css` (mobile uniquement, l'ordinateur ne change pas).
- Fond blanc, surfaces gris clair sans bordure ni ombre, une seule couleur d'action : le vert Myra.
- Tableau de bord : barre de recherche, **bannière verte** (salutation, montant encaissé de la période,
  bouton « Nouvelle vente »), périodes en puces défilantes, indicateurs en tuiles.
- Produits en **vitrine** : grande image carrée, nom, prix, stock en une ligne.
- Listes en pleine largeur avec grands avatars ; filtres en puces à contour, puce active pleine.
- Barre d'onglets plate et pleine largeur, bouton « + » intégré.
- Fiches en feuille glissante (poignée en haut), champs gris sans bordure, écran de connexion épuré.
- Cache PWA passé en v14.
