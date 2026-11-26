# Myra Business Manager V32 — connecteur Loyverse

## Périmètre livré

Cette version ajoute le socle sécurisé du connecteur :
- migration SQL additive : paramètres, mapping Myra/Loyverse, inbox Webhooks et file de jobs idempotente ;
- Edge Function `loyverse-api` : test authentifié de la connexion au compte Loyverse ;
- Edge Function `loyverse-webhook` : réception, contrôle par secret d'URL, déduplication et persistance des notifications ;
- page `loyverse.html` pour tester la connexion depuis une session Myra administrateur ;
- gouvernance `myra_wins` : aucune notification entrante n'écrase automatiquement une donnée métier Myra.

**Important :** ce socle ne déclenche pas encore la réplication automatique des articles, clients, reçus ou stocks. Les événements sont stockés en inbox et les jobs dans une file dédiée. Le mapping métier final doit être établi sur le schéma réel de la base de production, notamment les paiements, les lignes de vente, les emplacements de stock et les rôles. Cette précaution évite de créer des ventes/encaissements en double ou de remplacer un stock calculé par une simple valeur externe.

## 1. Migration SQL

Dans Supabase > SQL Editor, exécuter `supabase/myra_v32_loyverse.sql`.

Les tables sont protégées par RLS sans policy navigateur : seules les Edge Functions utilisant `SUPABASE_SERVICE_ROLE_KEY` peuvent y accéder.

## 2. Secrets Supabase

Dans Supabase > Edge Functions > Secrets, configurer :

- `LOYVERSE_ACCESS_TOKEN` : nouveau jeton Loyverse. Ne pas réutiliser le jeton précédemment partagé dans le chat ; le révoquer et en créer un nouveau.
- `LOYVERSE_WEBHOOK_SECRET` : chaîne aléatoire longue, indépendante du jeton API.

Les secrets Supabase `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement dans l'environnement Edge Functions Supabase. Ne jamais exposer la service role dans le navigateur.

## 3. Déploiement des fonctions

Avec Supabase CLI, depuis la racine du projet :

```bash
supabase functions deploy loyverse-api
supabase functions deploy loyverse-webhook --no-verify-jwt
```

`loyverse-api` vérifie le JWT Supabase et le rôle dans `profiles`. Vérifier que le rôle propriétaire réel est bien `owner` et que les administrateurs sont `admin` ou `super_admin`. Si le projet utilise un autre nom de table/colonne de profil, adapter ce contrôle avant déploiement.

`loyverse-webhook` ne requiert pas de JWT utilisateur : Loyverse appelle publiquement l'URL HTTPS. Il exige le secret dédié dans le paramètre `?secret=...` et persiste le webhook avant de répondre 2xx. Le secret doit être conservé confidentiel.

## 4. Configuration du Webhook Loyverse

Dans le Back Office Loyverse > Webhooks, créer un webhook pour chaque événement utile :

- `items.update`
- `customers.update`
- `receipts.update`
- `inventory_levels.update`

URL :

`https://<PROJECT_REF>.supabase.co/functions/v1/loyverse-webhook?secret=<LOYVERSE_WEBHOOK_SECRET>`

Le webhook Loyverse avec jeton personnel n'est pas signé par `X-Loyverse-Signature`. Le secret d'URL est donc utilisé comme barrière supplémentaire. Pour une application distribuée à plusieurs marchands, préférer OAuth 2.0 et vérifier la signature HMAC officielle.

## 5. Test de connexion

Déployer le dossier sur Vercel, se connecter à Myra avec un compte owner/admin, puis ouvrir `/loyverse.html` et cliquer sur « Tester la connexion Loyverse ».

## 6. Règles de synchronisation à respecter pour la phase d'activation métier

- Prix, remises maîtres, paramètres commerciaux et finances : Myra gagne toujours.
- Articles : `reference_id` doit porter un identifiant Myra stable ; un conflit de prix ou de nom est enregistré comme conflit, pas appliqué depuis Loyverse.
- Clients : conserver les deux identifiants ; ne jamais fusionner uniquement sur le nom. Téléphone normalisé/e-mail peuvent proposer un rapprochement à confirmer.
- Reçus : une vente Loyverse importée doit avoir une clé d'idempotence basée sur l'identifiant du reçu. L'import ne doit pas créer un paiement Myra tant que le rapprochement de la transaction et du mode de paiement n'est pas validé.
- Stock : importer des mouvements signés, datés et associés au magasin Loyverse. Ne jamais écraser directement `products.stock_quantity` avec `in_stock` d'un magasin externe.
- Boucle d'écho : ignorer les événements provenant d'une écriture Myra déjà poussée vers Loyverse en comparant mapping, origine et horodatage.
- Annulations/remboursements : créer une opération de retour/régularisation distincte ; ne jamais supprimer l'historique de vente.

## 7. Vérifications avant activation bidirectionnelle

1. Confirmer les noms/colonnes des tables métier sur l'instance Supabase active.
2. Confirmer le ou les `store_id` Loyverse et la devise FCFA.
3. Mapper les modes de paiement Loyverse vers les valeurs Myra (`cash`, `mtn_momo`, `airtel_money`, `bank_transfer`, `card`, `other`).
4. Faire une première importation en lecture seule et comparer les totaux.
5. Activer les exports d'articles/clients sur un petit lot pilote.
6. Tester un reçu, un remboursement, un ajustement de stock, un webhook dupliqué et une coupure réseau.
7. N'activer les flux réciproques qu'après rapprochement des soldes et des quantités.

## 8. Documentation officielle

https://developer.loyverse.com/docs/
