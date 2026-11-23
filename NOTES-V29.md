# V29 — 16 nouvelles fonctionnalités

## Installation (dans cet ordre)

1. **Base de données** — Supabase › SQL Editor › nouvelle requête : coller tout le fichier
   `supabase/myra_v29_extensions.sql` puis **Run**. Le résultat final doit lister **21 tables** avec
   `rowsecurity = true`. Le script ne supprime rien et peut être relancé sans danger.
   (Si ce n'est pas déjà fait : exécuter aussi `supabase/product_images_v1.sql` pour les photos.)
2. **Application** — déployer le dossier comme d'habitude (Vercel).
3. **Assistant IA (facultatif)** — voir plus bas. Sans cette étape, les « réponses rapides » de
   l'assistant fonctionnent déjà.

Tant que l'étape 1 n'est pas faite, l'application fonctionne exactement comme avant : les nouveaux
écrans affichent « Module pas encore activé » et les formulaires existants ne changent pas.

## Les 16 fonctionnalités et où les trouver

| # | Fonctionnalité | Menu |
|---|---|---|
| 1 | Lots et dates limites, liste « à vendre en premier », alerte au tableau de bord | Traçabilité › Lots & dates limites |
| 2 | Étiquettes A4 (3 × 8) : nom, prix, lot, date limite, QR code | Traçabilité › Étiquettes |
| 3 | Retours et réclamations (type, lot concerné, solution, montant) | Traçabilité › Réclamations |
| 4 | Prix négocié par client, prix par quantité, prix de gros — **appliqués automatiquement dans la vente** | Clients professionnels › Prix négociés / Prix par quantité ; fiche client « Type de client » ; fiche produit « Prix de gros » |
| 5 | Commandes récurrentes (chaque semaine, 2 semaines, mois), créées automatiquement | Clients professionnels › Commandes récurrentes |
| 6 | Plafond de crédit et délai de paiement par client, **vente à crédit bloquée au-delà du plafond**, relance WhatsApp, échéancier | Clients professionnels › Crédit clients / Échéancier ; fiche client |
| 7 | Traiteur : événements, calendrier, acompte, **devis imprimable** | Traiteur & cadeaux › Événements traiteur |
| 8 | Bons cadeaux : création, impression avec QR, **utilisation en caisse** (champ « Bon cadeau » de la vente) | Traiteur & cadeaux › Bons cadeaux |
| 9 | Ventes par vendeuse, objectifs du mois, commissions | Équipe › Ventes & commissions |
| 10 | Employés, pointage du jour en un geste, avances, état de paie imprimable | Équipe › Pointage & paie / Employés / Avances |
| 11 | Stock par lieu (cuisine, boutique, marché…) et transferts | Catalogue & stock › Stock par lieu / Lieux / Transferts |
| 12 | Assistant : réponses rapides + questions libres (IA Claude) | Pilotage › Assistant |
| 13 | Prévisions de ventes et plan de production imprimable | Pilotage › Prévisions |
| 14 | Scan de codes-barres / QR : bouton « Scanner » dans la vente, inventaire par scan | Vente ; Catalogue & stock › Inventaire (scan) |
| 15 | Charges fixes mensuelles et budget du mois | Pilotage › Budget & charges fixes |
| 16 | Messages WhatsApp personnalisés (anniversaires, clients inactifs, meilleurs clients…) | Pilotage › Messages clients ; fiche client « Date d'anniversaire » |

## Bon à savoir (limites assumées de cette version)

- **Lots** : la quantité restante d'un lot se met à jour dans sa fiche ; une vente ne la déduit pas
  automatiquement (elle déduit le stock total, comme avant).
- **Stock par lieu** : c'est une répartition du stock total. Les ventes déduisent le total ; le stock
  « non affecté » absorbe la différence. Un inventaire réaligne les quantités.
- **Scan caméra** : fonctionne sur Chrome / Android. Sur iPhone (Safari), la caméra n'est pas encore
  prise en charge par le navigateur : l'application propose alors de saisir le code. Renseignez le
  « Code-barres » dans chaque fiche produit, ou utilisez les QR codes des étiquettes Myra.
- **Commandes récurrentes** : créées à la première ouverture du tableau de bord de la journée (par un
  compte vendeur ou direction), ou avec le bouton « Créer les commandes dues ».
- **Acomptes traiteur et vente d'un bon cadeau** : à encaisser comme d'habitude (vente ou
  encaissement) ; ces écrans suivent les montants mais n'écrivent pas dans la caisse.
- **Messages groupés** : WhatsApp n'autorise pas l'envoi automatique en masse sans abonnement payant
  (WhatsApp Business API). L'application prépare chaque message, il suffit de toucher « Envoyer ».
- **Ventes & commissions** : la direction voit toute l'équipe ; une vendeuse ne voit que ses ventes.

## Assistant IA (questions libres)

Les réponses rapides (meilleures ventes, clients inactifs, réapprovisionnement, évolution du mois,
dettes clients) sont calculées dans l'application, sans coût. Pour les **questions libres**, une
fonction serveur appelle l'IA Claude d'Anthropic. La clé reste sur le serveur Supabase, jamais dans
le navigateur.

1. Créer une clé API sur https://console.anthropic.com (l'usage est facturé par Anthropic :
   de l'ordre de quelques dizaines à 200 FCFA par question selon le volume de vos données).
2. Sur un ordinateur avec Node.js :
   ```bash
   npx supabase login
   npx supabase functions deploy myra-assistant --project-ref fvpvfmlmszcoyhjlgago
   npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-VOTRE_CLE --project-ref fvpvfmlmszcoyhjlgago
   ```
   (à lancer depuis le dossier de l'application, qui contient `supabase/functions/myra-assistant`).

L'application envoie à la fonction un résumé chiffré (ventes par mois et par produit, clients,
stocks) ; seuls les comptes actifs de l'application peuvent l'appeler.

## Technique

- Chaque module est un fichier séparé dans `js/ext/` (socle commun : `js/ext/core.js`) ;
  `js/app.js` reçoit seulement des points d'accroche. Styles : `css/ext.css`.
- QR codes générés localement (`vendor/qrcode-generator-1.4.4`, licence MIT), donc aussi hors
  connexion. Cache PWA passé en v16.
- Migration testée sur PostgreSQL 16 : exécution répétée, prix (public / gros / quantité / négocié),
  commandes récurrentes sans doublon, encours crédit, bons cadeaux (solde insuffisant refusé),
  transferts (stock insuffisant refusé), inventaire appliqué une seule fois, droits par rôle
  (vendeuse, visiteur anonyme).
