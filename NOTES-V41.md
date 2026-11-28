# LSM Business Manager — V41

Les 10 améliorations, plus le partage de tous les documents (reçus, bons de commande, factures, devis…).

## Partager un document (WhatsApp, SMS, e-mail, Telegram, Facebook…)
- Tout document imprimable (reçu, ticket, facture, devis, bon de commande, bon de livraison, avoir, planning…)
  a maintenant un bouton **Partager** à côté de « Imprimer / PDF ».
- L'application crée un **lien sécurisé** (valable 90 jours, impossible à deviner) vers une copie du document,
  puis propose : WhatsApp, SMS, e-mail, Telegram, Facebook, copier le lien, ou le menu de partage du téléphone.
- Le client ouvre le lien sur `document.html` : il voit le document et peut l'imprimer ou l'enregistrer en PDF.
- Fiche vente : bouton **Reçu / Partager** (lien vers le reçu en ligne `recu.html`).

## 1. Trésorerie (menu Finances)
Comptes Espèces, MTN MoMo, Airtel Money et Banque (les deux derniers à activer si besoin).
Apport, retrait, transfert entre comptes, **rapprochement** (on saisit l'argent réellement compté : l'écart est corrigé et tracé),
annulation d'un mouvement (propriétaire / administrateur).
➜ Le solde de −10 000 FCFA de la Caisse principale se corrige avec **Rapprochement** (montant réellement en caisse) ou un **Apport**.

## 2. Bénéfice réel
Ventes − retours − coût des produits vendus − dépenses par catégorie = bénéfice net, mois par mois, avec graphique,
meilleurs produits et compte de résultat en PDF. Les dépenses ont désormais une **catégorie** et un **compte de paiement**.

## 3. Caisse rapide (comptoir)
Ajout des produits en un clic, remise, monnaie à rendre, paiement espèces / MoMo / crédit. Le stock et la caisse sont mis à jour.
Ticket : **imprimante thermique Bluetooth** (Chrome Android ou ordinateur ; 58 mm ou 80 mm), PDF, ou reçu WhatsApp.

## 4. Planning de production
Quantités à produire (commandes + ventes moyennes + stock minimum − stock), matières à acheter selon les recettes,
création des lots en un clic et **bons de commande fournisseurs** préparés en brouillon.

## 5. Catalogue Facebook / Instagram / WhatsApp Business
Dans Meta Commerce Manager › Catalogue › Sources de données › Flux planifié, collez :
`https://lessaveursdemyra.vercel.app/catalogue-facebook.csv` (mise à jour quotidienne). Le lien est aussi dans Boutique › Réglages.

## 6. Retours et remboursements
Menu Ventes › Retours : numéro de vente, quantités, motif, remboursement (espèces, MoMo, avoir), remise en stock, **avoir imprimable et partageable**.

## 7. Reçu automatique WhatsApp
Boutique › Réglages › Reçus : « désactivé », « proposer » (bouton après encaissement) ou « automatique ».
Le mode automatique demande l'**API WhatsApp Business (Meta)** : dans Supabase › Edge Functions › Secrets, ajoutez
`WHATSAPP_TOKEN` et `WHATSAPP_PHONE_ID`, et faites approuver par Meta un modèle nommé `recu_achat` (français) avec 4 variables :
prénom, numéro de vente, total, lien du reçu. Ne jamais envoyer ces clés par message.

## 8. Sons et alertes
Son dans l'application (réglable dans Notifications), alertes système non silencieuses et persistantes pour les commandes et paiements.

## 9. Sauvegarde automatique
Chaque nuit à 1 h 15, conservée 30 jours (menu Administration › Sauvegardes). Bouton « Sauvegarder maintenant ».
Restauration table par table réservée au propriétaire.

## 10. Confirmation automatique MTN MoMo
Nécessite le contrat **MoMo API (Collection)** de MTN Congo. Ajoutez dans Supabase › Edge Functions › Secrets :
`MOMO_SUBSCRIPTION_KEY`, `MOMO_API_USER`, `MOMO_API_KEY` (et si MTN l'indique `MOMO_TARGET_ENV`, `MOMO_BASE_URL`).
Puis Boutique › Réglages : activez « Paiement MoMo automatique ». Le client reçoit la demande sur son téléphone,
valide avec son code, et la commande passe à « payée » toute seule. Sans contrat, le paiement au code marchand 245950 reste en place.

## Tests
`node tests/e2e/v41.test.js` : 41 vérifications. Total des 11 suites : 324 vérifications réussies.
Contrôle de la base : `supabase/tests/verification_lecture_seule.sql` (lignes V41).
