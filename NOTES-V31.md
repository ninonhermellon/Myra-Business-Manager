# V31 — Boutique en ligne pour les clients

**Base de données :** `supabase/myra_v31_boutique.sql` est déjà appliqué sur le projet (vérifié : 14/14 contrôles
de `supabase/tests/verification_lecture_seule.sql` au vert). Rien à faire dans Supabase.

## Pour les clients : `boutique.html` (ou `/boutique`, `/commander`)
Une page professionnelle aux couleurs de la marque, sur téléphone comme sur ordinateur :
- accueil (titre, présentation, bouton WhatsApp), « Comment commander » en 3 étapes ;
- catalogue avec photos, catégories, recherche, notes des avis clients ;
- fiche produit : photo, description, prix, **quantité souhaitée**, « Ajouter au panier » ou « Commander » ;
- panier modifiable (gardé sur le téléphone du client) ;
- formulaire : **nom, téléphone, WhatsApp, adresse, quartier, date de livraison souhaitée, remarque** ;
- confirmation avec numéro de commande + bouton pour vous l’envoyer sur WhatsApp.
- Les clients **ne voient jamais l’espace de gestion** : la page n’utilise que 2 fonctions sécurisées
  (voir le catalogue, passer commande). Aucune table n’est ouverte aux visiteurs.

## Pour l’équipe
- **Relation client › Boutique en ligne** : lien à partager, QR code, affiche à imprimer, ouverture/fermeture
  (congés), textes de la page, minimum de commande, numéro WhatsApp, liste des commandes reçues avec « Répondre ».
- Chaque commande en ligne arrive dans **Commandes** en **Brouillon**, avec le badge « En ligne », le WhatsApp du
  client et une notification instantanée. Appelez le client, ajoutez les frais de livraison, puis confirmez.
- Le client est retrouvé par son numéro de téléphone, ou créé automatiquement.

## Sécurité
- Les prix sont **toujours recalculés par le serveur** (un prix modifié dans le navigateur est ignoré).
- Anti-abus : 30 articles max, quantités de 1 à 500, 3 commandes par numéro et par heure, 60 par heure au total.
- Stock exact, prix de revient et données clients ne sont jamais envoyés à la page publique
  (seulement « disponible » ou « sur commande »).

## Bon à savoir
- Un produit apparaît en vitrine s’il est **actif** et a un **prix de vente**. Ajoutez photo et description
  dans Catalogue › Produits : ce sont elles qui font vendre.
- Produit en rupture : affiché « Sur commande », toujours commandable (vous confirmez le délai par téléphone).
- Pas de paiement en ligne : le total et la livraison sont confirmés par téléphone.
- Cache PWA v21. Tests : `node tests/e2e/boutique.test.js` (28 vérifications).
