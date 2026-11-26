# Tests automatiques

## 1. Base de données (dans Supabase, sans rien modifier)

`supabase/tests/verification_lecture_seule.sql` : à coller dans **Supabase › SQL Editor** puis **Run**.
Chaque ligne doit afficher `ok = true` : tables présentes, règles d'accès actives partout, aucune
table ouverte aux visiteurs, fonctions sensibles protégées, index, cohérence des stocks, ventes et bons cadeaux.
À relancer après chaque migration.

## 2. Application (navigateur automatique, sur un ordinateur avec Node.js)

Les tests ouvrent l'application dans Chrome (Playwright) avec un **faux Supabase** : aucune donnée réelle
n'est lue ni modifiée.

```bash
npm install --no-save playwright@1.63.0
npx playwright install chromium
node tests/e2e/v29.test.js        # 22 parcours : tarifs, bon cadeau, crédit, inventaire, assistant…
node tests/e2e/v30.test.js        # 19 parcours : espace client, avis, parrainage, objectifs, lieu de vente, affichage
node tests/e2e/boutique.test.js   # 36 parcours : boutique (catalogue, panier, codes promo, commande, sécurité, écran équipe)
node tests/e2e/v37.test.js        # 15 parcours : avis détaillés (boutique, avis.html, relances, réponse, masquage)
node tests/e2e/v38.test.js        # 14 parcours : équipe et accès (activer, rôle, créer un compte, mot de passe)
node tests/e2e/v36.test.js        # 26 parcours : centre de notifications, menu avatar, profil, paramètres, suivi de commande, pages publiques
node tests/e2e/documents.test.js     # 28 vérifications : tous les documents imprimables au gabarit unique
node tests/e2e/audit.test.js         # 49 vérifications : en-têtes de sécurité, Open Graph / SEO, responsive 320 → 1440 px
node tests/e2e/notifications.test.js  # 16 parcours : notifications push (activation, préférences, iPhone, Android, blocage)
node tests/e2e/screens.js . tests/e2e/output   # captures de tous les écrans, ordinateur + mobile
```

Chaque test affiche `OK` ou `ÉCHEC` puis un total (par exemple `19/19 vérifications réussies`).
Les captures sont enregistrées dans `tests/e2e/output/` (non versionné).
Limiter les écrans capturés : `PAGES=sales,lots,report node tests/e2e/screens.js . tests/e2e/output`.

Le faux Supabase (`tests/e2e/screens.js`) refuse un tri sur une colonne inexistante, comme le vrai :
c'est ce qui a permis de reproduire le bug « Stock par lieu » de la V29.
