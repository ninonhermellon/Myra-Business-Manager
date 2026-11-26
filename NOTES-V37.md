# V37 — Avis clients détaillés : boutique, relances, 5 critères

**Base de données :** `supabase/myra_v37_avis.sql` est déjà appliqué sur le projet. Rien à faire dans Supabase.

## Noter sur 5 étoiles, critère par critère
| Critère | Ce que le client note |
|---|---|
| **Produit** (obligatoire) | goût, qualité, fraîcheur |
| **Boutique** | commande en ligne, choix, clarté des prix |
| **Service** | accueil, conseils, rapidité de réponse |
| **Livraison** | délai, ponctualité, état de la commande |
| **SAV** | suivi après l’achat, réponse aux réclamations |
Les critères autres que le produit sont facultatifs (« Non concerné » par défaut).

## Dans la boutique (fiche produit)
- Note globale, répartition 5★ → 1★, moyenne par critère, et les avis des clients (prénom + initiale,
  badge **« Achat vérifié »** quand le téléphone correspond à un client qui a déjà acheté ce produit).
- Bouton **« Donner mon avis »** : étoiles par critère, commentaire, prénom, téléphone (jamais affiché).
- Anti-abus : un avis par produit et par numéro tous les 30 jours, notes contrôlées par le serveur.
- Vos **réponses** s’affichent sous l’avis (« Réponse des Saveurs de Myra »).

## Après une livraison (lien `avis.html`)
Même formulaire à 5 critères, envoyé sur WhatsApp depuis l’application.

## Dans l’application (Relation client › Avis clients)
- **Note globale**, avis reçus (boutique / après commande), taux de réponse, nombre à relancer.
- **Notes par critère** avec barre de couleur et **« Point à améliorer »** (le critère le plus faible).
- **Relancer les clients** : demandes sans réponse depuis plus de 2 jours, bouton « Relancer » (WhatsApp avec
  le lien) ou « Relancer les N » un par un ; 3 relances maximum par client, pour ne pas déranger.
- **Demander un avis** : ventes et livraisons des 60 derniers jours (les 8 plus récentes, puis « Afficher les autres »).
- **Tous les avis** avec filtre (boutique, après commande, 3 étoiles ou moins, masqués) : **Contacter** ou
  **Remercier** sur WhatsApp, **Répondre** publiquement, **Masquer / Republier** un avis de la boutique.
- Chaque nouvel avis déclenche une **notification** (cloche + téléphone).

Tests : `node tests/e2e/v37.test.js` (15). Ensemble : 211 vérifications. Cache PWA v29.
