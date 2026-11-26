# V36.1 — Boutique : corrections de la version modifiée, vue mobile, menu hamburger

## Pourquoi les produits ne s'affichaient plus
En retirant la barre de recherche et le bandeau du haut, le script de la boutique cherchait ces éléments au
démarrage et s'arrêtait avant de charger les produits (cartes grises vides). Le script est maintenant **robuste** :
retirer un élément de la page ne bloque plus jamais l'affichage des produits (testé).

## Vos changements conservés
- Texte d'accueil : « Nous vous proposons une marinade universelle, une préparation 100% naturelle… »
  (aussi enregistré dans les réglages de la boutique, qui sinon le remplaçaient au chargement).
- « 100% naturel », livraison sous 24 h confirmée par WhatsApp, votre visuel Marinade Universelle en image
  d'accueil (allégé : 1,2 Mo → 160 Ko), votre icône de notification (redimensionnée à 96 px).

## Coordonnées mises à jour (base de données)
Téléphone et WhatsApp **069007022** · adresse **Centre-ville, Brazzaville** · horaires **du lundi au samedi,
de 07 h 00 à 17 h 30**. Elles apparaissent sur la boutique, les pages publiques, les factures et les bons.

## Vue mobile
- **Menu hamburger** (☰) : panneau latéral avec toutes les rubriques, bouton WhatsApp, téléphone, horaires et
  adresse ; se ferme au toucher d'un lien, à côté ou avec Échap.
- En-tête sur une ligne : logo, nom complet, recherche (s'ouvre d'un toucher), suivi, panier.
- Votre image en premier, textes et boutons à la bonne taille, prix lisibles, pas de bandeau qui déborde.
- Sur ordinateur, rien ne change : menu en ligne, bandeau, recherche visible.

Cache PWA v27. Tests : boutique 36/36, V36 26/26, audit 49/49.
