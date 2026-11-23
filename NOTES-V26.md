# V26 — Refonte visuelle « Pro » (bento, verre dépoli, pastels)

Aucune table, migration SQL ni règle métier Supabase modifiée. Fichier ajouté : `css/pro.css` (chargé en dernier). `sw.js` passe en v9.

## Design
- Cadre flottant en verre dépoli sur fond dégradé aux couleurs de la marque (ordinateur), cartes arrondies, ombres douces.
- Menu latéral : icônes en pastilles, groupes repliables, bouton pour le réduire en rail d'icônes (mémorisé).
- Barre supérieure : onglets de période Aujourd'hui / Cette semaine / Ce mois / Rapports.
- Tableaux : avatars colorés aux initiales, en-têtes allégés, pastilles de statut.

## Tableau de bord (refait)
- 4 indicateurs : caisse, encaissé (avec variation), reste à encaisser, commandes actives.
- Les onglets de période pilotent les indicateurs, le donut des ventes, la courbe entrées/sorties (infobulle au survol) et l'aperçu des factures.
- Colonne gauche : commandes à traiter (cartes pastel, onglets préparer/livraison) et meilleurs clients.
- Colonne droite : stocks à surveiller avec jauge, créances à relancer avec bouton WhatsApp.

## Formulaires
- Tiroir latéral découpé en sections (identité, coordonnées, prix, stock…), champs obligatoires marqués d'une étoile.
- Aperçu en direct pour les produits et les clients.
- Sections définies dans `FORM_SECTIONS` (app.js) : ajoutez-y une page pour la personnaliser.

## Limite
La courbe « Sorties » ne compte que les paiements de type décaissement (pas la table des dépenses).
