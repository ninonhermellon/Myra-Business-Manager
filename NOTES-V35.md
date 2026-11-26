# V35 — Tous les documents imprimables au même modèle minimaliste

Modèle : illustration ronde (logo) centrée, titre, sous-titre gris, cartes arrondies à bordure fine,
lignes « libellé / valeur », pilule sombre pour le montant clé, ligne d'état en couleur, pied de page discret.

## Un seul gabarit : `js/doc-kit.js`
Chaque document fournit seulement ses données ; la mise en page est définie une seule fois. Modifier une couleur
ou une marge dans ce fichier change **tous** les documents.

| Document | Où |
|---|---|
| Facture | Ventes › Facture |
| Bon de commande (vente) | Détail d'une vente › Bon de commande |
| Bon de commande client | Commandes › détail › Imprimer |
| Reçu de paiement | Paiements |
| Fiche (client, produit…) | Fiche › Imprimer |
| Listes (clients, produits, ventes…) | Bouton Imprimer des listes (format paysage si beaucoup de colonnes) |
| Devis / confirmation traiteur | Événements traiteur |
| Bon cadeau (avec QR code) | Bons cadeaux |
| État de paie | Équipe › Pointage & paie |
| Plan de production | Pilotage › Prévisions |
| Rapport du mois | Pilotage › Rapport du mois |
| Affiche « Commandez en ligne » (QR) | Boutique en ligne |
| Facture de l'espace client | Page `client.html` |

**Volontairement hors gabarit** : la planche d'étiquettes adhésives (mise en page au millimètre pour le papier
étiquettes) ; seule sa barre de boutons a été harmonisée.

## Impression
- À l'écran : style aéré du modèle. À l'impression / PDF : version resserrée, une facture courante (≈ 8 articles)
  tient sur **une page A4**.
- Couleur de l'état : vert (payé / confirmé), orange (partiel / en attente), rouge (reste à payer).
- Plus aucun script dans les documents (compatible avec la sécurité stricte de la V34).

Tests : `node tests/e2e/documents.test.js` (28 vérifications, captures dans `tests/e2e/output/documents/`). Cache PWA v25.
