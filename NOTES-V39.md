# V39 — LSM Business Manager : les 11 améliorations + menu Utilisateurs + identité officielle

**Base de données :** `supabase/myra_v39.sql` est **déjà appliqué** sur votre projet Supabase. Les fonctions serveur
`myra-team` (utilisateurs) et `myra-push` (notifications) sont **déjà déployées**. Rien à faire dans Supabase.
Il reste seulement à **mettre en ligne** cette version (zip ou branche GitHub) sur Vercel.

## Identité
- Nom de l’application : **LSM Business Manager** · entreprise : **Les saveurs de Myra**.
- Logos officiels : **fond vert** pour l’application (icône du téléphone, connexion, menu), **fond blanc** pour les pages
  publiques (boutique, suivi, avis, espace client), **blanc transparent** pour le petit badge des notifications.
- Couleurs de la charte : vert profond `#033B02`, doré `#DB820A`, vert naturel `#348907`, vert clair `#84C70E`,
  jaune doré `#F4BE2B`, rouge tomate `#D11A05`, blanc crème `#F4F0E3`.
- Appel / WhatsApp +242 06 900 70 22 · Facebook, Instagram, TikTok (@lessaveursdemyra) · images d’aperçu refaites.

## Menu « Administration » (propriétaire et administrateurs)
**Utilisateurs** (créer, voir, modifier, supprimer les comptes des employés) :
- **Ajouter** : nom, e-mail, téléphone, rôle, mot de passe provisoire → compte actif tout de suite ; accès à envoyer sur WhatsApp.
- **Modifier** : nom, téléphone, e-mail de connexion ; rôle et activation directement dans la liste ; 🔑 nouveau mot de passe.
- **Supprimer** : possible seulement pour un compte sans historique. S’il a déjà vendu, encaissé ou livré, l’application
  propose de le **désactiver** (l’historique reste intact).
- Recherche, filtres par état et par rôle. Nouveau rôle **Livreur·se** (ne voit que ses livraisons).

**Droits par rôle** (n°1) : pour chaque rôle, les pages visibles, le droit de **supprimer**, de **voir les coûts et marges**,
et la **remise maximale** sur une vente. La suppression et la remise maximale sont aussi bloquées par le serveur.

**Journal d’activité** (n°2) : qui a créé, modifié ou supprimé une vente, un paiement, une commande, un prix, un client,
un utilisateur… avec l’« avant → après ». Filtres, export CSV. Impossible à modifier, conservé 400 jours.

## Suivi financier
- **Clôture de caisse** (n°3) : chaque soir, chacun compte sa caisse (espèces, MTN MoMo, Airtel Money). L’application
  calcule l’attendu à partir des paiements encaissés, affiche l’écart, imprime le ticket et prévient la direction en cas
  d’écart. La direction / comptabilité valide les caisses de l’équipe.
- **Résumé du jour** (n°4) : CA, encaissements par mode, ventes par vendeur, produits phares, commandes à livrer demain,
  paiements MoMo à vérifier, ruptures, impayés, caisses. **Notification automatique à 18 h** (lundi → samedi),
  bouton **WhatsApp** et impression.

## Boutique en ligne
- **Paiement MTN MoMo** (n°5) : code marchand **245950** (nom affiché « Hermellon Glacial », numéro 068 17 25 03).
  Le client paie au code marchand puis saisit la **référence reçue par SMS** ; vous la vérifiez dans **Livraisons**
  (ou la fiche commande) : « Reçu » ou « Introuvable ». Une même référence ne peut pas servir deux fois.
  Réglages (code, nom, numéro, Airtel, paiement à la livraison) : **Boutique en ligne › Réglages**.
  ⚠️ La confirmation **automatique** par MTN nécessite un contrat « MoMo API » (Collection) : dès que vous l’avez,
  je peux brancher la vérification automatique.
- **Coffrets et abonnements** (n°6) : menu **Coffrets** — composez un coffret, assemblez-le (le stock des produits est
  déduit), il apparaît en tête de la boutique avec « vous économisez … ». Au moment de commander, le client peut demander
  à recevoir sa commande **chaque semaine / 2 semaines / mois** : la demande arrive « à valider ».
- **Paniers abandonnés** (n°7) : dès que le client saisit son téléphone, son panier est enregistré ; après 1 h sans
  commande, il apparaît dans **Paniers abandonnés** avec un bouton **Relancer sur WhatsApp**.
- **Frais par quartier** (n°8) : menu **Zones de livraison** (10 quartiers de Brazzaville pré-remplis, **tarifs à
  ajuster**), livraison offerte dès un montant au choix. Le client choisit son quartier, les frais s’ajoutent au total.

## Livraisons (n°9)
Écran **Livraisons** (idéal sur téléphone) : tournée du livreur, **Appeler**, **WhatsApp**, **Itinéraire** (Google Maps),
« Je pars », « Livrée » avec **montant encaissé** et **photo** de preuve, « Échec » avec motif. La direction attribue le
livreur (il est prévenu par notification). L’argent encaissé en livraison s’ajoute à sa clôture de caisse.

## Rentabilité par produit (n°10)
Coût matières (recette × coût moyen des matières ÷ rendement, sinon prix d’achat) + emballage + main-d’œuvre
= **coût de revient**, **marge**, **prix conseillé** pour la marge visée, marge des 30 derniers jours.

## Validation en deux étapes (n°11)
**Mon profil › Validation en deux étapes › Activer** : scannez le QR code avec Google/Microsoft Authenticator.
Ensuite un code à 6 chiffres est demandé à chaque nouvelle connexion. **Le serveur refuse toute donnée tant que le code
n’est pas saisi.** Fortement recommandé pour le compte propriétaire.

Tests : `node tests/e2e/v39.test.js` (52 vérifications). Cache PWA v31.
