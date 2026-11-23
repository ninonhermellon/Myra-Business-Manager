# Portefeuille fidélité v1

- Règle : 1 point par tranche cumulée de 1 000 FCFA encaissés.
- Le reliquat inférieur à 1 000 FCFA est conservé pour le prochain paiement du client.
- Les points sont crédités automatiquement par un trigger après insertion d'un encaissement `incoming` lié à une vente client.
- Les paiements sans client, les décaissements et les ventes brouillon/annulées ne génèrent pas de points.
- Les tables `loyalty_accounts` et `loyalty_transactions` conservent le solde et le journal. La clé unique sur `payment_id` protège contre un double crédit.
- Les points ne sont pas encore échangeables : la valeur de conversion en FCFA doit être décidée avant d'activer les récompenses.

Migration appliquée au projet Supabase LSM Manager : `myra_loyalty_wallet_v1`.

Note : le portefeuille commence à créditer les nouveaux encaissements après activation. Les anciens paiements ne sont pas rétro-crédités automatiquement.
