# LSM Business Manager

Application web responsive de gestion de **Les Saveurs de Myra**, connectée au projet Supabase `fvpvfmlmszcoyhjlgago`.

## Correctifs d'audit intégrés

- Correction des valeurs d'état de vente (`partially_paid`) et d'approvisionnement (`partially_received`) pour correspondre aux contraintes SQL réelles.
- Correction des modes de paiement des dépenses : valeurs alignées sur la contrainte SQL (`cash`, `mtn_momo`, `airtel_money`, `bank_transfer`, `card`, `other`).
- Correction des types de comptes de trésorerie : valeurs autorisées (`cash`, `mobile_money`, `bank`).
- Ajout des listes relationnelles pour choisir clients, fournisseurs, produits, ingrédients, catégories, recettes et comptes, au lieu de saisir manuellement des UUID.
- Ajout des écrans CRUD pour catégories produits, catégories ingrédients, mouvements de stock des ingrédients, mouvements de stock produits et mouvements de trésorerie.
- Enregistrement de l'utilisateur connecté dans les champs `created_by` concernés.
- Le module Paiements conserve l'obligation de rattacher un encaissement à une vente et un décaissement à un approvisionnement.

## Identité visuelle

Le logo officiel fourni par l'entreprise est utilisé sur l'écran de connexion, la navigation latérale, le favicon et l'icône mobile. Couleurs : vert profond `#0d4426`, jaune `#F9E207`, vert végétal `#71990E` et blanc.

## Configuration Supabase

- URL : `https://fvpvfmlmszcoyhjlgago.supabase.co`
- Clé navigateur : clé publishable uniquement (`js/config.js`).
- Authentification : Supabase Auth e-mail / mot de passe.
- Profil propriétaire : rôle `owner`.
- Devise : FCFA.
- Bucket Storage : `myra-avatars`, téléversement limité au dossier de l'utilisateur connecté.

Aucune clé `service_role` ou secret serveur n'est inclus dans le navigateur.

## Profil et avatar

La rubrique **Mon profil** permet au compte connecté de modifier son nom, son téléphone et sa photo. Formats autorisés : PNG, JPG/JPEG et WEBP, maximum 2 Mo.

## Limites fonctionnelles restantes

Cette livraison corrige les incompatibilités identifiées entre plusieurs formulaires et les contraintes SQL. Elle ne constitue pas encore une validation complète de toutes les opérations métier en production. Les fonctions suivantes restent à développer ou à tester avec des données réelles :

- Saisie multi-lignes et calcul automatique des ventes, devis et commandes d'achat (`sale_items`, `quote_items`, `purchase_order_items`).
- Consommation automatique des ingrédients à la production et mise à jour des stocks à la réception, la production et la vente.
- Synchronisation comptable entre paiements, mouvements de trésorerie et soldes des comptes.
- Génération des factures PDF avec numérotation séquentielle.
- Administration sécurisée des comptes Supabase Auth (invitation, création, désactivation et réinitialisation des accès) via fonction serveur dédiée.
- Tests de bout en bout sur navigateur mobile et ordinateur, notamment création, modification, suppression et règles de suppression liées aux clés étrangères.

Ne pas considérer ces fonctions comme validées tant qu'elles n'ont pas été testées sur l'instance déployée.

## Déploiement

Décompresser l'archive puis déployer le dossier `myra-business-manager` sur Vercel (preset Other, commande de build vide, répertoire de sortie `.`) ou Netlify.

## Arborescence

- `index.html` : écran de connexion et shell de l'application
- `assets/` : logo officiel et favicon
- `css/styles.css` : interface responsive
- `js/config.js` : paramètres publics Supabase
- `js/app.js` : authentification, navigation, tableau de bord, CRUD et profil
- `supabase/` : migrations et requêtes de vérification


## Workflows métier connectés
- Les nouveaux encaissements passent par `register_sale_payment` (idempotence, solde de vente et trésorerie).
- Les approvisionnements commandés peuvent être réceptionnés via `receive_purchase_order`.
- Les lots de production peuvent être démarrés puis clôturés via `start_production` et `complete_production`.
- La réception d'une commande réceptionne actuellement toutes les quantités restant dues ; la réception partielle ligne par ligne reste à développer.
- La saisie multi-articles des ventes, devis et achats ainsi que les tests de bout en bout restent à finaliser.

## Version 3 — Cycle de vente sécurisé

- Création d'une vente avec plusieurs articles depuis un formulaire dédié.
- Calcul automatique du sous-total, de la remise et du total.
- Enregistrement initial en brouillon : aucune sortie de stock à cette étape.
- Action « Confirmer » sur les ventes en brouillon, reliée à la RPC Supabase `confirm_sale`.
- La confirmation est l'action qui déclenche la déduction du stock et l'écriture des mouvements, sous réserve des contrôles de stock et des droits définis côté base.
- Les ventes et paiements ne sont plus modifiables/supprimables depuis le CRUD générique de cette page ; ils passent par leurs actions métier dédiées.

Contrôle effectué : vérification syntaxique JavaScript avec `node --check` et présence des fonctions RPC attendues dans le projet Supabase. Les tests fonctionnels de bout en bout nécessitent des données de test et une connexion dans l'application.

## Version 5 — Fiches clients et fidélisation
- Accès à une fiche détaillée depuis chaque ligne du répertoire Clients.
- Coordonnées, entreprise, adresse et notes du client.
- Indicateurs calculés à partir des ventes : chiffre d'affaires, montant encaissé, solde restant, nombre de ventes et panier moyen.
- Historique des ventes avec statut, montants et accès à la facture des ventes confirmées.
- Les brouillons et ventes annulées sont exclus des indicateurs commerciaux.

## Version 6 — Marketing et fidélisation
- Nouveau tableau de bord Marketing & fidélisation.
- Segmentation automatique : nouveaux clients, actifs (achat au cours des 60 derniers jours) et inactifs (aucun achat au cours des 60 derniers jours).
- Classement des clients selon les montants effectivement encaissés.
- Estimation des points : 1 point par tranche complète de 1 000 FCFA encaissés ; niveaux indicatifs Bronze (50), Argent (200) et Or (500).
- Export CSV de la segmentation et des indicateurs clients.
- Les points et niveaux sont calculés à la volée depuis les ventes ; ils ne constituent pas encore un portefeuille de points stocké, ni une mécanique de récompense échangeable.

## Version 7 – Promotions commerciales
- Ajout du module de gestion des campagnes promotionnelles dans Marketing & fidélité.
- Création de codes de réduction en pourcentage ou montant fixe, seuil minimum, limite d'utilisations, activation/désactivation et suppression.
- Table `promo_campaigns` protégée par RLS ; accès réservé aux rôles owner, admin et manager.
- Migration SQL : `supabase/promo_campaigns_v1.sql` (déjà appliquée sur le projet Supabase associé).
- Important : cette version permet de gérer les campagnes. L'application automatique d'un code sur une vente et l'incrément sécurisé du compteur d'utilisations seront ajoutés dans une prochaine étape ; ne pas considérer les codes comme déjà applicables au paiement.

## Version 8 — application des codes promotionnels
- Le formulaire de vente accepte un code promotionnel actif.
- La remise est calculée selon le type de campagne (pourcentage ou montant fixe), le minimum de commande, les dates et le plafond d'utilisations.
- Le code est enregistré avec le brouillon ; son utilisation est comptabilisée uniquement lorsque la vente passe à `confirmed`.
- Un trigger PostgreSQL verrouille la campagne et contrôle à nouveau sa disponibilité lors de la confirmation, afin d'éviter de dépasser le plafond en cas de confirmations simultanées.
- Migration : `supabase/promo_sales_integration_v2.sql` (déjà appliquée au projet Supabase associé).

Limite connue : le programme de points reste calculé à titre indicatif dans le tableau Marketing. Le portefeuille de points et leur échange contre des récompenses feront l'objet d'une prochaine étape dédiée.


## Version 11 — centre de contrôle des ventes
- Ajout d'une fiche détaillée accessible depuis chaque ligne de vente.
- Vue consolidée du client, des articles, du sous-total, des remises, du total et du solde restant.
- Historique des encaissements avec mode de paiement, référence et accès direct aux reçus.
- Traçabilité des mouvements de stock associés à la vente lorsque ceux-ci sont disponibles.
- Accès direct à la facture depuis le dossier de vente.

Limite : cette vue rassemble les données enregistrées dans les tables de vente, paiement et mouvements de stock. Elle ne remplace pas un rapprochement comptable externe et n'a pas encore fait l'objet d'un test transactionnel complet sur une vente réelle.

## Mode PWA et fonctionnement hors connexion (v12)

L'application est installable depuis un navigateur compatible grâce au manifeste `manifest.webmanifest` et au service worker `sw.js`. Le shell (interface, styles, scripts et identité visuelle) est mis en cache pour permettre le rechargement de l'application sans réseau après une première visite en ligne. Les dernières données consultées du tableau de bord et des modules sont conservées localement dans le navigateur. Le profil actif déjà chargé est également mis en cache pour permettre la réouverture de la session locale lorsque le navigateur conserve une session Supabase valide.

**Limite importante de cette première étape :** le mode hors connexion est actuellement un mode de consultation des dernières données mises en cache. Les créations et modifications (ventes, paiements, mouvements de stock, achats, production, etc.) restent désactivées de fait sans réseau et ne sont pas placées dans une file d'attente de synchronisation. Il ne faut pas enregistrer une opération métier hors connexion en pensant qu'elle sera envoyée plus tard. La synchronisation transactionnelle des écritures devra être ajoutée dans une étape dédiée, avec identifiants idempotents, résolution des conflits et reprise contrôlée.

Pour installer : ouvrir l'application en HTTPS, se connecter une première fois avec Internet, puis utiliser le bouton « Installer » lorsqu'il est proposé par le navigateur (ou le menu du navigateur > Installer l'application / Ajouter à l'écran d'accueil). La première visite nécessite une connexion pour télécharger les ressources et authentifier l'utilisateur.

## Mode hors connexion et synchronisation locale (v13)

- Les brouillons de vente saisis hors connexion sont stockés dans IndexedDB sur l'appareil (ils survivent à la fermeture de l'application et au redémarrage).
- Le catalogue clients/produits doit avoir été consulté en ligne au moins une fois pour être disponible hors connexion.
- À la reconnexion, les brouillons sont transmis à Supabase avec leurs lignes. Une vente synchronisée reste en brouillon : sa confirmation et la sortie de stock nécessitent une validation en ligne.
- Le statut réseau affiche le nombre de ventes en attente. Les brouillons locaux apparaissent dans le tableau des ventes avec la mention « En attente de synchronisation ».
- Les codes promotionnels ne sont pas acceptés hors connexion, car leur validité et leur disponibilité doivent être contrôlées sur le serveur.
- Les paiements, confirmations de vente, réceptions d'approvisionnement et actions de production restent en ligne uniquement dans cette première étape. Ne désinstallez pas le navigateur / ne videz pas ses données avant synchronisation : les opérations en attente sont conservées localement sur cet appareil.

Cette version constitue la première brique de synchronisation (brouillons de vente). Elle ne prétend pas encore synchroniser hors connexion tous les modules de gestion.

## Synchronisation hors connexion — v15

- Les créations, modifications et suppressions locales de fiches autorisées sont placées dans une file IndexedDB.
- Les modifications/suppressions d'une fiche déjà présente sur le serveur utilisent une comparaison de la version de base avec la version distante avant application. Une divergence est mise en conflit, sans écrasement automatique.
- Les erreurs transitoires sont conservées avec compteur de tentatives et délai exponentiel de reprise.
- Le centre « Synchronisation » affiche la file et un historique local des événements. En cas de conflit, l'utilisateur peut conserver la version serveur ou réessayer sa version locale après rebasage.
- La file et son journal sont conservés sur l'appareil ; ils ne sont pas partagés entre appareils.

Limites importantes : les workflows financiers et les actions métier de stock/production (confirmation, paiement, réception, démarrage/clôture de production) restent exclusivement en ligne. Les créations de fiches liées par clés étrangères ne sont pas encore résolues automatiquement lorsqu'elles dépendent d'un parent créé localement. Les conflits sont résolus fiche par fiche ; pas de fusion champ par champ. Effectuer les tests de synchronisation en environnement de recette avant usage opérationnel.


## Version 16 — dépendances entre opérations et reprises multi-appareils

- Ajout d'un moteur de dépendances basé sur les clés étrangères locales : lorsqu'un approvisionnement référence un fournisseur créé hors connexion, l'opération fournisseur est envoyée en premier. La commande reste bloquée tant que sa fiche parente n'a pas été synchronisée ; elle reprend ensuite avec le même UUID, utilisé comme identifiant stable côté Supabase.
- Ordonnancement topologique des opérations en attente, notamment pour les références fournisseur, catégorie, produit, recette, client et matière première.
- Affichage explicite des opérations bloquées par une dépendance dans le centre de synchronisation.
- Verrou local pour éviter deux traitements simultanés de la file dans le même onglet, et identifiant d'appareil conservé localement pour tracer l'origine des opérations.
- Reprise idempotente des créations : si le serveur a déjà reçu une fiche avant une coupure réseau, l'application vérifie l'identifiant et le contenu avant de retirer l'opération de la file. Une ligne portant le même identifiant mais des données différentes devient un conflit.
- Reprise d'une vente si son insertion a réussi côté serveur mais que la réponse réseau a été perdue : recherche du numéro de vente déjà créé avant toute nouvelle insertion.

Limites : la synchronisation n'est pas un moteur temps réel partagé entre appareils ; chaque appareil conserve sa propre file locale. La détection des conflits sur modifications existantes reste optimiste et au niveau de la fiche. Les lignes `purchase_order_items` ne disposent pas encore d'un formulaire de saisie hors connexion dédié ; l'ordonnanceur sait gérer des références parent-enfant pour les enregistrements mis en file, mais le workflow multi-lignes d'achat reste à développer. Les validations métier de stock, réception et production restent en ligne.

## Version 32 — Connecteur Loyverse (socle sécurisé)
- Migration additive `supabase/myra_v32_loyverse.sql` : paramètres, correspondances d'identifiants, inbox Webhooks et file de synchronisation idempotente.
- Edge Function `loyverse-api` : test de connexion authentifié, rôle administrateur requis, jeton conservé côté serveur.
- Edge Function `loyverse-webhook` : réception et déduplication des événements Loyverse avant accusé 2xx.
- Page de contrôle `/loyverse.html`.
- Politique `myra_wins` : les notifications Loyverse ne remplacent jamais automatiquement les données maîtres de Myra.

**Limite explicite :** cette livraison prépare et sécurise le canal de synchronisation mais n'active pas encore la réplication métier automatique. Le mapping des articles, clients, reçus, paiements et stocks doit être finalisé après vérification du schéma réel Supabase et des magasins Loyverse. Voir `docs/IMPLEMENTATION-LOYVERSE-V32.md`.
