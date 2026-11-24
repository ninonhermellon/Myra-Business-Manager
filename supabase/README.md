# Base de données Supabase

Projet : **LSM Manager** (`fvpvfmlmszcoyhjlgago`).

## Ce qui manque encore : le schéma de base

Les fichiers de ce dossier sont des **migrations** : ils modifient des tables qui existent déjà
(`sales`, `sale_items`, `products`, `customers`, `payments`, `cash_accounts`, `purchase_orders`,
`raw_materials`, `production_batches`, `profiles`…), ainsi que des fonctions déjà présentes
(`private.current_staff_role()`, `confirm_sale`, `register_sale_payment`, `receive_purchase_order`,
`start_production`, `complete_production`). Leur création n'est dans aucun fichier : on ne peut donc
pas recréer la base de zéro (nouvel environnement de test, restauration après incident).

### Exporter le schéma (à faire une fois, puis après chaque changement de structure)

Avec la CLI Supabase (structure seulement, aucune donnée client) :

```bash
npx supabase login
npx supabase link --project-ref fvpvfmlmszcoyhjlgago
npx supabase db dump --schema public,private,storage -f supabase/00_schema.sql
```

Sans la CLI : Supabase > *Project Settings* > *Database* > *Connection string* (URI), puis

```bash
pg_dump --schema-only --no-owner --no-privileges \
  --schema=public --schema=private "postgresql://…" > supabase/00_schema.sql
```

Relire `00_schema.sql` avant de le committer : il ne doit contenir **aucun mot de passe ni
donnée**, uniquement des `CREATE TABLE`, `CREATE FUNCTION`, `CREATE POLICY`, etc.

## Ordre d'application des migrations

Sur une base neuve, après `00_schema.sql`. Les fichiers sont écrits pour pouvoir être rejoués
(`if not exists`, `create or replace`, `drop policy if exists`), mais testez toujours sur un
projet de recette avant la production :

| # | Fichier | Version | Contenu |
|---|---------|---------|---------|
| 1 | `profile_avatar_owner_access.sql` | — | Profil : lecture/modification de soi-même, bucket `myra-avatars` |
| 2 | `myra_sales_integrity_v1.sql` | — | Contrôles avant confirmation d'une vente, lignes figées après confirmation |
| 3 | `promo_campaigns_v1.sql` | V7 | Table `promo_campaigns` |
| 4 | `promo_sales_integration_v2.sql` | V8 | Consommation du code promo à la confirmation |
| 5 | `myra_loyalty_wallet_v1.sql` | — | Portefeuille de points de fidélité |
| 6 | `customer_orders_module_v1.sql` | V24 | Commandes clients, conversion en vente (remplace la fonction du n°2) |
| 7 | `myra_delete_reconciliation_v1.sql` | V24 | Suppressions avec régularisation stock / caisse / points |
| 8 | `product_images_v1.sql` | V27 | Colonne `products.image_url`, bucket `myra-products` |
| 9 | `myra_v29_extensions.sql` | V29 | 21 tables et 7 fonctions : lots, réclamations, tarifs, abonnements, crédit, traiteur, bons cadeaux, équipe, lieux, inventaire, charges fixes, messages |
| 10 | `myra_v30.sql` | V30 | Index, règles d'accès, espace client, avis, parrainage, objectifs, lieu de vente, temps réel |

`verification.sql` : requêtes de contrôle (RLS activée, profil propriétaire), ne modifie rien.
`tests/verification_lecture_seule.sql` : contrôle de santé complet après chaque migration (lecture seule).

## Fonction serveur

`functions/myra-assistant` : assistant IA (facultatif), voir `NOTES-V29.md`.

## Rappel limite de lignes

Supabase renvoie au plus 1 000 lignes par requête. L'application lit désormais les listes par pages
(`fetchAll` dans `js/app.js`) ; ne pas réduire `max-rows` dans les réglages de l'API sans le savoir.
