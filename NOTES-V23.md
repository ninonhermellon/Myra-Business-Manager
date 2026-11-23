# Myra Business Manager — Version 23

## Améliorations incluses
- Les rapports Jour / Semaine / Mois / Année de la page Finances sont désormais calculés à partir des paiements réellement reçus (`payments.direction = incoming`) et de leur date de paiement. Les commandes non réglées ne sont donc plus présentées comme du chiffre encaissé.
- Ajout de l'indicateur « Reste à encaisser », calculé sur les ventes non annulées (`total - amount_paid`, sans valeur négative), dans le tableau de bord et les Finances.
- Libellés financiers clarifiés pour distinguer encaissements, dépenses et sommes dues.
- Navigation principale recentrée sur les fonctions commerciales, catalogue/stock, finances, profil et paramètres. Les anciennes tables techniques/industrielles restent dans la base et ne sont pas supprimées.
- Service worker revu : le cache applicatif local est indépendant des CDN, les appels Supabase Auth/REST ne sont jamais mis en cache, et le repli hors ligne utilise les fichiers applicatifs déjà présents en cache.

## Vérifications effectuées
- Syntaxe JavaScript de `js/app.js` et `sw.js` validée avec `node --check`.
- Intégrité de l'archive ZIP validée.
- Schéma Supabase réel consulté pour confirmer les colonnes utilisées dans les calculs financiers (`payments.direction`, `payments.payment_date`, `sales.total`, `sales.amount_paid`).

## Limites connues — ne pas considérer comme déjà livré
- Les commandes sont encore représentées par les enregistrements `sales` : la séparation complète `orders` / `sales` / `payments` nécessite une migration et une reprise contrôlée des données, puis la refonte des flux de commande et de confirmation.
- Le mode hors connexion n'est pas encore un Offline First intégral : les appels de paiement, confirmation et mouvements sensibles restent en ligne ; les bibliothèques externes et l'authentification hors ligne après redémarrage doivent être testées sur appareils réels.
- Notifications push, assistant IA, résolutions avancées des conflits, impression Android et partage PDF/WhatsApp doivent encore être intégrés et testés.
- Aucun changement de schéma ni aucune donnée n'ont été modifiés dans Supabase pendant cette livraison.

## Contrôles de sécurité Supabase relevés
L'analyse Supabase signale cinq fonctions `SECURITY DEFINER` exposées aux utilisateurs authentifiés (`confirm_sale`, `register_sale_payment`, `receive_purchase_order`, `start_production`, `complete_production`) et la protection des mots de passe compromis désactivée. Les fonctions n'ont pas été modifiées automatiquement : leurs droits doivent être corrigés après audit de leurs appels applicatifs afin de ne pas bloquer les opérations métier. Activer la protection des mots de passe compromis dans les paramètres Auth du projet.
