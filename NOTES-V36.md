# V36 — Centre de notifications, Profil & Paramètres, nouvelle boutique, suivi de commande

**Base de données :** `supabase/myra_v36.sql` est déjà appliqué sur le projet. Rien à faire dans Supabase.

## 1. Notifications : la cloche affiche enfin les vraies notifications
- **Avant** : le chiffre (2) comptait des *alertes permanentes* (stock bas, créances…) et ne bougeait jamais.
- **Maintenant** : chaque commande, vente, paiement, avis et rupture de stock est **enregistré dans un historique**.
  Le chiffre de la cloche = **notifications non lues**, mis à jour **en temps réel** (et sur l’icône de l’application installée).
- Panneau de la cloche : onglets **Toutes / Non lues / Lues / À traiter**, filtre **par type** (Commandes, Ventes,
  Paiements, Avis, Stock), **tri** (plus récentes, plus anciennes, non lues d’abord, par type), regroupement par jour,
  **marquer lu / non lu** une par une, **Tout marquer comme lu**, clic = ouvre le bon écran.
- Les alertes permanentes sont rangées dans l’onglet **À traiter** (point orange sur la cloche s’il y en a).
- **Mon espace › Notifications** : historique complet + réglages des alertes sur chaque appareil.
- Chacun a ses propres « lu / non lu » ; chacun ne voit que ce que son rôle autorise.

## 2. Menu, Profil et Paramètres
- **Menu de l’avatar** (en haut à droite) : identité et rôle, thème Clair / Sombre / Auto, Profil, Paramètres,
  Notifications (avec compteur), Affichage, Boutique en ligne, Voir ma boutique, Aide et raccourcis, Déconnexion.
- **Profil** : en plus des informations et de la photo — mon activité du mois (ventes, commandes, encaissements),
  sécurité (dernière connexion, changement de mot de passe, déconnexion de tous les appareils), préférences.
- **Paramètres** (nouvelle page) : Entreprise et documents (coordonnées, logo, monnaie, préfixes), tous les modules
  en raccourcis, **sauvegarde complète** (fichier JSON) et exports CSV, version de l’application, mise à jour,
  vidage des données locales.

## 3. Nouvelle boutique (modèle « épicerie » aux couleurs de Myra)
Bandeau d’annonce · en-tête avec **recherche + catégories**, suivi et panier · accueil avec mot souligné en vert
feuille et visuel produits (ou votre **image d’accueil**) · **catégories en tuiles** · **2 bannières** (vos
**promotions** réelles, sinon « fait maison » / « livraison ») · **produits phares** avec bouton vert
« Ajouter au panier » · **compte à rebours** de la promotion qui se termine bientôt · **les plus commandés** ·
« Comment commander » · pied de page complet (contacts, horaires, réseaux sociaux).
- **Codes promo** à la commande : vérifiés et appliqués **par le serveur** (dates, minimum, nombre d’utilisations).
- Réglages (Relation client › Boutique en ligne) : bandeau d’annonce, horaires, **image d’accueil** (envoi de
  photo), Facebook / Instagram / TikTok, et **promotions à afficher** (interrupteur par promotion).
- Aucune fausse promotion ni faux prix barré : seules les promotions que vous cochez apparaissent.

## 4. Pages publiques
- **`commande.html` = Suivre ma commande** (aussi `/suivi`) : numéro de commande + téléphone → étapes
  (reçue, confirmée, en préparation, prête, en livraison, livrée), articles, montants, bouton WhatsApp.
  La confirmation de commande propose « Suivre ma commande » ; les derniers numéros sont retenus sur le téléphone.
- **Avis** et **Espace client** : même en-tête, même pied de page et même style que la boutique.

## Bon à savoir
- `/commander` et `/boutique` ouvrent la boutique ; `/commande` n’est plus une redirection.
- Cache PWA v26. Tests : `node tests/e2e/v36.test.js` (26) et `boutique.test.js` (36) ; total 196 vérifications.
