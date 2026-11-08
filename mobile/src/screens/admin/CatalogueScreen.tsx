// Catalogue (administration) : prestations, suppléments, produits, catégories.
import React from 'react';
import { ScreenPlaceholder } from '../../components/ScreenPlaceholder';

export function CatalogueScreen() {
  return (
    <ScreenPlaceholder
      description="Catalogue du salon : prestations et suppléments (durées, prix, visibilité), produits de vente, catégories et ordre d'affichage."
      checklist={['Prestations : durée, prix, suppléments associés', 'Produits de vente et visibilité par écran (caisse, RDV…)', 'Catégories et réordonnancement (glisser-déposer)']}
      authNote="Admin : X-Admin-Password — API : /api/catalog (CRUD), /api/catalog/produits/*, /api/catalog/categories/*."
    />
  );
}
