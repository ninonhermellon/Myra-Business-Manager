# V38 — Équipe et accès

**Problème corrigé :** un compte créé dans Supabase (Authentication › Users) n'avait pas de « fiche d'équipe »
(table `profiles`) : la personne voyait « Accès refusé ou compte désactivé ». Le compte de **Persidem Pandou**
a été rattaché comme **Gérant·e (actif)** : il peut se connecter dès maintenant.

**Base de données :** `supabase/myra_v38_equipe.sql` est déjà appliqué. Fonctions `myra-team` (nouvelle) et
`myra-push` (type « Équipe ») déjà déployées. Rien à faire dans Supabase.

## Ce qui change
- **Tout nouveau compte reçoit automatiquement sa fiche**, « en attente d'activation » (rôle Employé·e).
  Vous recevez une **notification** « 👤 Nouveau compte à activer » (cloche + téléphone).
- **Paramètres › Équipe et accès** (propriétaire et administrateurs uniquement) :
  - liste de l'équipe : nom, e-mail, dernière connexion, rôle, état (Actif / En attente / Désactivé) ;
  - **Activer** un compte en attente après avoir choisi son rôle, **Désactiver** un membre, **changer le rôle** ;
  - **Ajouter un membre** : nom, e-mail, rôle, mot de passe provisoire proposé → le compte est actif tout de suite,
    sans e-mail de confirmation. Les accès s'affichent pour être **copiés ou envoyés sur WhatsApp** ;
  - **🔑 Nouveau mot de passe provisoire** pour un membre qui l'a oublié.
- Message de connexion plus clair quand un compte n'est pas encore activé.

## Garde-fous (contrôlés par le serveur)
- Personne ne peut modifier ses propres droits ; il reste toujours au moins un propriétaire actif.
- Un administrateur ne peut ni toucher au propriétaire, ni nommer un administrateur.
- Un rôle ne peut jamais être obtenu en s'inscrivant soi-même : il est donné par la direction.

| Rôle | Accès |
|---|---|
| Administrateur | Tout, sauf toucher au propriétaire |
| Gérant·e | Ventes, stock, clients, équipe au quotidien |
| Vente | Ventes, clients, commandes |
| Gestion de stock | Produits, stock, achats |
| Comptabilité | Paiements, dépenses, rapports |
| Employé·e | Accès de base |

Tests : `node tests/e2e/v38.test.js` (14). Ensemble : 225 vérifications. Cache PWA v30.
