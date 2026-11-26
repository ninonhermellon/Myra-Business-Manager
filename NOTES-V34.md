# V34 — Aperçus WhatsApp / réseaux sociaux, SEO, sécurité HTTP, responsive

## Pourquoi l'aperçu ne s'affichait pas
1. L'image était donnée en adresse **relative** (`assets/logo…png`) : WhatsApp, Facebook, Instagram… exigent une adresse
   complète `https://…`.
2. Le logo pesait **757 Ko** : WhatsApp abandonne au-delà d'environ 300 Ko.
3. Pas de `og:url`, pas de `favicon.ico` à la racine, page d'accueil sans aucune balise Open Graph.
4. La version en ligne sur `myra-business-manager-ten.vercel.app` était encore la V30 (la boutique n'y existait pas).

## Ce qui est fait
- **Open Graph + Twitter Card sur toutes les pages** : `index.html`, `boutique.html`, `commande.html` (nouvelle,
  redirige vers la boutique), `client.html`, `avis.html`, `loyverse.html`. Images 1200 × 630 (≈ 75 Ko) aux couleurs
  de la marque + image carrée 1080 × 1080 (Pinterest, miniatures).
- **Favicons complets** : `favicon.ico` (16→64 px), PNG 16/32, icône Apple 180 px, icônes 192/512 et icône adaptative
  Android pour l'application installée. Logo allégé (757 → 289 Ko) : toutes les pages se chargent plus vite.
- **SEO** : titres et descriptions optimisés, URL canonique, `robots.txt`, `sitemap.xml`, données structurées
  Google (entreprise + chaque produit avec son prix en FCFA et sa disponibilité). Les pages privées sont en `noindex`.
- **Sécurité HTTP** (`vercel.json`) : pages publiques sans aucun script injectable (CSP `script-src 'self'`),
  anti-clic-piège (`X-Frame-Options: DENY`), HSTS, COOP, CORP, Permissions-Policy restrictive, `X-Robots-Tag`
  sur les pages privées, cache 1 an pour les librairies et 7 jours pour les images.
- **Responsive** : contrôlé de 320 à 1440 px (boutique, espace client, avis, 8 écrans de l'application) ;
  finitions sur petits téléphones (nom de la boutique complet, factures lisibles).
- **Design pattern** : une seule source de vérité. Tous les en-têtes sont générés depuis `tools/seo.config.json`.

## Changer le domaine ou un texte
Modifiez `tools/seo.config.json` (ex. `"siteUrl"`), puis lancez `node tools/seo-build.js` et redéployez.

## À faire de votre côté
1. **Relier le domaine** `lessaveursdemyra.vercel.app` au projet : Vercel › projet `myra-business-manager` ›
   Settings › Domains › Add. (Il n'apparaît pas dans le compte Vercel connecté ; les aperçus pointent vers lui.)
2. **Déployer ce zip.**
3. **Rafraîchir les aperçus déjà mis en cache** : ouvrez https://developers.facebook.com/tools/debug/ , collez
   `https://lessaveursdemyra.vercel.app/boutique`, cliquez « Scrape Again » (vaut pour Facebook, Instagram et
   Messenger). WhatsApp garde l'ancien aperçu d'un lien déjà partagé : pour un test immédiat, partagez
   `…/boutique?v=2`.
4. (Facultatif) Google Search Console › ajouter le site › envoyer `sitemap.xml`.

Tests : `node tests/e2e/audit.test.js` (49 vérifications : sécurité, SEO, responsive). Cache PWA v24.
