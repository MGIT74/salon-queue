// Encaissement : ticket en cours pour un passage (prestations, produits,
// cartes cadeaux, remises), et impression/lecture du ticket.
// PAIEMENT CARTE : Nepting (/api/tpe) est volontairement NON branché sur
// le mobile — aucune clé, aucun appel — jusqu'à décision contraire.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenPlaceholder } from '../shared/ScreenPlaceholder';
import { colors, radius, spacing } from '../../theme/theme';

export function EncaissementScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          Paiement carte Nepting volontairement débranché sur le mobile (aucune clé TPE
          embarquée, aucun appel à /api/tpe). L'encaissement espèces/cartes cadeaux restera
          possible via l'API ventes.
        </Text>
      </View>
      <ScreenPlaceholder
        description="Ticket en cours : lignes de prestations et produits, carte cadeau en paiement, remise, ticket client et ticket Z à la clôture."
        checklist={['Choisir un passage (RDV ou file) et encaisser', 'Cartes cadeaux : recherche et remboursement', 'Imprimer via le pont TPE/imprimante du salon']}
        authNote="Session coiffeur (PIN X-Barber-Id/Pin) ou admin — API : POST /api/sales, GET /api/sales, /api/sales/gift-cards/*, GET /api/settings/vat-rates."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  notice: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    backgroundColor: colors.surface,
  },
  noticeText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
});
