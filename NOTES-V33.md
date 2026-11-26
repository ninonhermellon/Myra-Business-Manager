# V33 — Notifications en temps réel (même application fermée)

Basée sur la V32 (connecteur Loyverse) fournie. **Base de données :** `supabase/myra_v33_notifications.sql` et la
fonction serveur `myra-push` sont déjà en place sur le projet (vérifié). Rien à faire dans Supabase.

## Activer (une fois par appareil)
- **Ordinateur** (Chrome / Edge) : ouvrez Myra, cliquez **Activer** dans le bandeau qui apparaît en bas
  (ou **Mon espace › Notifications › Activer sur cet appareil**), puis **Autoriser**.
- **Android** : ouvrez Myra depuis son icône, même chose.
- **iPhone / iPad** (iOS 16.4 ou plus récent) : Myra doit être ouverte **depuis l'icône de l'écran d'accueil**
  (pas dans Safari). Puis Mon espace › Notifications › Activer.
- Une notification « 🔔 Notifications activées » confirme que tout fonctionne. Bouton **Tester** à tout moment.

## Ce qui déclenche une notification
| Type | Exemple | Qui la reçoit |
|---|---|---|
| Nouvelle commande | 🛒 Nouvelle commande en ligne — Awa · 6 000 FCFA · Bacongo · 2 × Marinade | toute l'équipe |
| Vente confirmée | ✅ VTE-… · Client · 9 000 FCFA | direction, comptabilité, ventes |
| Paiement reçu (facture en attente) | 💰 5 000 FCFA · Client · VTE-… · MTN MoMo | direction, comptabilité |
| Avis client | ⭐ Nouvel avis : 5/5 — « Délicieux » | direction, ventes |
| Stock bas / rupture | ⚠️ Marinade 1 kg : 2 restant(s) (seuil 3) | direction, gestion de stock |

- Vous n'êtes **jamais** notifié(e) de vos propres actions.
- Chaque appareil choisit ses types (interrupteurs dans Mon espace › Notifications).
- Toucher la notification ouvre directement le bon écran (Commandes, Ventes, Produits…).

## Technique et sécurité
- Web Push standard (clés VAPID créées automatiquement, stockées dans la base, jamais dans le navigateur).
- La base appelle la fonction `myra-push` par une file asynchrone (`pg_net`) : une vente n'est jamais ralentie ni
  bloquée par une notification.
- La fonction refuse tout appel sans le secret interne (testé : 401) ou sans session de l'équipe.
- Appareils qui n'existent plus : retirés automatiquement.
- Cache PWA v23. Tests : `node tests/e2e/notifications.test.js` (16 vérifications).
