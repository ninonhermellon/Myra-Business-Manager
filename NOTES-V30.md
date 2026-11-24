# V30 — Sécurité, performances, relation client et pilotage

**Base de données :** `supabase/myra_v30.sql` est déjà appliqué sur le projet (vérifié : 13/13 contrôles
de `supabase/tests/verification_lecture_seule.sql` au vert). Rien à faire dans Supabase pour cette version.

## Nouveautés

| # | Fonctionnalité | Où |
|---|---|---|
| 1 | Nouveaux écrans dans des fichiers séparés (`js/ext/*.js`), `app.js` n'est plus alourdi | Technique |
| 2 | Tests automatiques : santé de la base (SQL) + 41 parcours dans le navigateur | `tests/README.md` |
| 3 | Revue de sécurité Supabase : fonctions sensibles vérifiées, aucune table ouverte aux visiteurs | — |
| 4 | Index sur 53 liens entre tables, règles d'accès sans doublon, **tableau de bord instantané** (dernières données de l'appareil, puis actualisation) | Tableau de bord |
| 5 | **Temps réel** : ventes, commandes, paiements faits sur un autre appareil apparaissent tout de suite (avec notification) | Partout |
| 6 | **Mode sombre** et **taille du texte** (par appareil) | Mon espace › Affichage |
| 7 | **Espace client en ligne** : lien personnel (WhatsApp) — factures, reste à payer, points, facture PDF | Relation client › Espace client en ligne ; page `client.html` |
| 8 | **Avis après livraison** : note 1 à 5 étoiles en 10 s, moyenne par produit | Relation client › Avis clients ; page `avis.html` |
| 9 | **Parrainage** : « Parrainé par » dans la fiche client, bon cadeau au parrain après le 1er achat du filleul | Relation client › Parrainage |
| 10 | **Rapport du mois** : bilan comparé au mois précédent, marge, PDF, analyse de l'assistant ; rappel du 1er au 5 | Pilotage › Rapport du mois |
| 11 | **Objectifs** du mois (chiffre d'affaires, nouveaux clients), progression sur le tableau de bord | Pilotage › Objectifs |
| 12 | **Lieu de vente** dans chaque vente (mémorisé par appareil) et comparaison sur 6 mois | Vente ; Pilotage › Ventes par lieu |

## À faire par vous dans Supabase (sécurité, 1 minute)
Activer la protection contre les mots de passe déjà divulgués : **Authentication › Sign In / Providers › Email ›
Leaked password protection** (selon l'offre Supabase, l'option peut ne pas être disponible).

## Bon à savoir
- **Espace client** : le lien est personnel, valable 1 an, désactivable à tout moment (bouton ⦸). Il ne
  donne accès qu'aux factures de ce client, en lecture seule.
- **Marge** du rapport : calculée avec le « coût de revient » des produits ; le rapport indique la part des
  produits vendus dont le coût est renseigné.
- **Ventes par lieu** : seules les ventes où le lieu a été choisi sont réparties ; les autres sont
  « Non précisé ».
- **Mode sombre** : les photos et le logo gardent leurs vraies couleurs.
- **Nettoyage du code (n°1)** : volontairement limité. Les nouveaux écrans sont isolés dans des fichiers
  séparés et testés ; la réécriture complète d'`app.js` et des 6 feuilles de style n'a pas été faite, car
  elle demanderait de retester chaque écran existant pour un gain invisible à l'usage (un premier essai de
  reformatage automatique avait d'ailleurs supprimé du code, d'où la prudence).
- Cache PWA v19.
