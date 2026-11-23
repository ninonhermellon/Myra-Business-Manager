# V27.3 — Démarrage sans reconnexion, fiabilité et sécurité

## Session conservée au lancement
- Si l'appareil a déjà ouvert une session, l'application s'ouvre **directement sur l'espace de travail**,
  en ligne comme hors ligne. L'écran de connexion n'apparaît plus au démarrage (écran de chargement à la place).
- La session est vérifiée ensuite en arrière-plan (délai maximal 10 s). Un réseau absent, lent ou instable,
  ou un jeton expiré hors ligne, **ne déconnecte plus**.
- Retour à l'écran de connexion uniquement si : 1re utilisation sur l'appareil, déconnexion volontaire,
  session révoquée par le serveur, ou profil désactivé par le propriétaire.
- La déconnexion ne ferme plus que la session de **cet appareil** (les autres appareils restent connectés)
  et fonctionne aussi hors ligne.

## Fiabilité des chiffres
- Les listes, le tableau de bord, les finances et le marketing chargent désormais **toutes** les lignes
  (Supabase limite chaque requête à 1 000 lignes ; les totaux étaient tronqués au-delà).

## Technique
- Bibliothèque Supabase figée en 2.118.0 et livrée dans `vendor/` (disponible hors connexion).
- `vercel.json` : politique de sécurité du contenu (CSP), `sw.js` jamais mis en cache.
- `supabase/README.md` : export du schéma et ordre des migrations ; migrations rejouables.
- Cache PWA passé en v12.
