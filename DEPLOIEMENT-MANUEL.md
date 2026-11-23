# Déploiement manuel — Myra Business Manager V24

## 1. Base de données Supabase

Projet : **LSM Manager** (`fvpvfmlmszcoyhjlgago`).

1. Ouvrir le projet Supabase, puis **SQL Editor**.
2. Ouvrir le fichier `supabase/myra_delete_reconciliation_v1.sql` présent dans cette archive.
3. Copier l'intégralité du SQL dans une nouvelle requête et cliquer sur **Run**.
4. Vérifier que la requête se termine sans erreur.

Cette migration ajoute les fonctions sécurisées de suppression des ventes et commandes avec régularisation du stock, de la caisse et des points fidélité. Elle ne supprime aucune donnée existante.

## 2. Déploiement Vercel

1. Décompresser cette archive.
2. Dans Vercel, ouvrir le projet existant **myra-business-manager**.
3. Déployer le dossier du projet en conservant les paramètres, variables d'environnement, nom et domaine déjà configurés.
4. Ne pas créer un nouveau projet et ne pas modifier le domaine de production.

Domaine attendu : `https://myra-business-manager.vercel.app`.

## 3. Contrôles après déploiement

- Se connecter avec le profil Super Administrateur.
- Vérifier qu'une vente comptant se valide, déduit le stock et enregistre son paiement dans la Caisse principale.
- Vérifier qu'une vente à crédit se valide et laisse un reste à encaisser.
- Supprimer une vente de test et vérifier la restitution du stock et la correction de la caisse.
- Supprimer une commande de test convertie et vérifier que sa vente liée est également supprimée.

Les suppressions transactionnelles nécessitent une connexion Internet. Si les points fidélité d'une vente ont déjà été dépensés, la suppression est volontairement bloquée pour éviter un solde de fidélité incohérent.

## Important

L'archive contient le code source et la migration SQL à appliquer. Elle ne contient aucun secret Supabase. Conserver les variables d'environnement déjà configurées dans Vercel.
