# V25 — Refonte UX, design patterns et fonctionnalités

Aucune table, migration SQL ni règle métier Supabase n'a été modifiée.

## Nouveaux fichiers
- `js/ui-kit.js` : dialogues de confirmation/saisie/formulaire accessibles (remplacent `confirm()`/`prompt()`), toasts enrichis.
- `js/shell.js` : palette de commandes (Ctrl/Cmd+K ou `/`), création rapide, notifications, raccourcis (G puis D/V/C/O/S/F/P/M, N), routage par URL (#/ventes…), squelettes de chargement, modales accessibles avec protection des saisies non enregistrées, navigation mobile.
- `css/ux.css` : styles de ces composants. `sw.js` passe en v8.

## Améliorations
- Tableaux : tri, filtres par statut, pagination, recherche, export CSV du résultat filtré, ouverture d'une fiche au clic, noms de clients au lieu des identifiants, affichage en cartes sur mobile. Correction : les boutons « Modifier » cessaient de fonctionner après une recherche.
- Tableau de bord : graphique des encaissements 7/14/30 j, variations vs période précédente, créances à relancer (WhatsApp), meilleurs clients du mois, salutation selon l'heure.
- Promotions : vrai formulaire validé (dates, plafond…) au lieu de 5 fenêtres successives.
- Commandes : statut en pastille, contact WhatsApp client.
- Connexion : erreurs en français, état de chargement, afficher/masquer le mot de passe, alerte Verr. Maj.
- Navigation : groupes repliables, page active mémorisée dans l'URL, barre inférieure mobile.
- Indicatif WhatsApp par défaut : 242 (constante DEFAULT_CC dans app.js).

## À tester sur l'instance déployée
Parcours testé en navigateur avec une base simulée : connexion, tableau de bord, ventes, clients, promotions, commandes, mobile. Les RPC (confirmation de vente, réception, production) n'ont pas été rejouées contre Supabase.
