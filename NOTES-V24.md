# Myra Business Manager — Version 24

## Commandes autonomes
- Ajout des tables `customer_orders` et `customer_order_items` ; les ventes historiques ne sont pas converties ni supprimées.
- Le menu Commandes affiche désormais son propre module, avec client, adresse/zone, date souhaitée, frais de livraison, remise, total et suivi de statut.
- Statuts : brouillon, confirmée, en préparation, prête, en livraison, livrée, annulée, convertie.
- Une commande ne modifie ni le stock ni la trésorerie.
- La conversion explicite crée une vente en brouillon et ses lignes. La confirmation de cette vente reste la seule étape qui déclenche la logique de stock déjà en place.
- Les frais de livraison sont conservés dans `sales.shipping_fee` et pris en compte dans le contrôle de cohérence du total.
- Les tables sont protégées par RLS ; accès aux rôles owner, admin, manager et sales.

## Synchronisation hors connexion
- Les commandes et lignes sont stockées dans IndexedDB comme un seul paquet logique avec identifiants UUID créés sur l'appareil.
- La reprise utilise des upserts idempotents sur ces identifiants, puis relit et vérifie l'en-tête et le nombre de lignes avant de retirer l'opération de la file.
- Les écritures/suppressions IndexedDB attendent désormais la fin de transaction, et l'outbox est mise à niveau avec des index.
- Verrou inter-onglets via Web Locks lorsque le navigateur le prend en charge ; reprises exponentielles jusqu'à 15 minutes.
- Les opérations de paiement, conversion, confirmation de vente et mouvements de stock restent bloquées hors ligne pour ne pas fabriquer un solde ou un stock non validé par le serveur.

## Migration Supabase
Le SQL `supabase/customer_orders_module_v1.sql` correspond aux changements appliqués au projet connecté. Vérification effectuée : les deux tables existent, les politiques RLS sont présentes, la fonction de conversion existe et `sales.shipping_fee` est disponible.

## Limites à ne pas masquer
- Les opérations hors ligne sont stockées sur l'appareil courant ; elles ne sont pas accessibles sur un autre appareil tant qu'elles n'ont pas été synchronisées.
- Le démarrage à froid totalement hors ligne n'est pas encore garanti : le SDK Supabase est chargé depuis un CDN externe dans `index.html`. Il faut le vendorer localement pour garantir l'ouverture de l'application sans réseau.
- Les scénarios réels Android (arrêt forcé, redémarrage du téléphone, stockage saturé, coupure réseau pendant upload, conflit entre deux appareils) doivent encore être testés sur appareils physiques avant de qualifier la synchronisation de totalement fiable.
- La création en ligne de la commande et de ses lignes utilise deux requêtes client ; si l'insertion des lignes échoue, une reprise/annulation manuelle peut être nécessaire. Une RPC transactionnelle de création est le prochain durcissement recommandé.
- Les conversions de commande en vente n'ont pas été testées sur une vente réelle ; la fonction est installée mais doit faire l'objet d'un test métier contrôlé avant exploitation.
