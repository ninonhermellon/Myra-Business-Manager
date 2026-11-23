# V27 — Fiches interactives, photos produits, facture, listes

**À faire une fois dans Supabase (SQL Editor) :** exécuter `supabase/product_images_v1.sql`
(colonne `products.image_url` + bucket public `myra-products`). Sans cela, l'application fonctionne
mais enregistre les produits sans photo (un message l'indique).

## Nouveautés
- **Produits** : grille de cartes (photo, étiquettes, prix, bouton Modifier) ou liste avec vignettes ; bascule mémorisée.
  Photo envoyée depuis le formulaire (redimensionnée à 900 px, JPEG), aperçu en direct.
- **Popups de fiche** (clic sur une ligne ou une carte) : Produits, Clients, Ventes, Commandes et tous les autres modules
  → voir, **Modifier**, **Supprimer** ; création via « Ajouter » puis popup de confirmation vert « Enregistrement réussi ».
- **Facture** : nouveau modèle dégradé aubergine → rouge → orange (carte arrondie, lignes alternées, pastille Total TTC,
  mode de paiement, conditions, signature). Reçus, bons de commande et devis inchangés.
- **Listes** : ventes groupées par mois avec sous-total, barre de total (total / encaissé / reste), bouton **PDF**
  (impression de la liste filtrée) en plus du CSV, commandes cliquables avec détail des articles.
- Cache PWA passé en v10.

## V27.1 — Lignes compactes
- Colonne « Actions » supprimée de toutes les listes (hauteur de ligne réduite).
- Un clic sur une ligne ou carte ouvre la fiche avec toutes les actions : modifier, supprimer, imprimer, partager (WhatsApp / partage du téléphone), facture, reçu, bon de commande, confirmer, réceptionner, production, statut de commande, conversion en vente.
- Les popups défilent et gardent leurs boutons visibles en bas.

## V27.2 — Smartphone aligné sur l'ordinateur
Cadre « verre », vrais tableaux (4 colonnes max, défilement horizontal), cartes KPI en 2 colonnes, barre du bas flottante. Exceptions : menu en tiroir, barre de navigation du bas.
