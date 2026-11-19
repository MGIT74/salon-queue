# Design de l'app mobile TBO — règles obligatoires

Référence visuelle : `mobile/maquette/design-dashboard.html` (à ouvrir dans un navigateur : clair + sombre).
Ces règles s'appliquent à **toutes** les sections (admin, poste, caisse, client).
Couleurs : uniquement les tokens de `src/theme/theme.ts` (copie de `public/app.css`). Aucune couleur inventée,
sauf les fonds « doux » ci-dessous et la couleur propre de chaque coiffeur (renvoyée par le serveur).

## 1. Tokens à ajouter dans `theme.ts`

```ts
export const radius = { button: 10, card: 16, pill: 12, chip: 99, loyalty: 18 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 40, page: 16, block: 22, grid: 10 };

// Fonds doux des pastilles d'icônes (en plus de blueSoft existant)
light: greenSoft '#e4f3e8', orangeSoft '#fbefe3', redSoft '#fbe5e8'
dark:  greenSoft '#0f2e19', orangeSoft '#3a2508', redSoft '#3a1210'

// Ombre des cartes : en clair seulement, aucune en sombre
light card shadow: { shadowColor:'#000', shadowOpacity:0.06, shadowRadius:10, shadowOffset:{width:0,height:3}, elevation:2 }
dark: pas d'ombre
// Séparateur de liste : light 'rgba(0,0,0,0.06)', dark 'rgba(255,255,255,0.06)' (StyleSheet.hairlineWidth)
```

## 2. Typographie (police système iOS)

| Usage | Taille / graisse | Couleur |
|---|---|---|
| Titre de page (« Bienvenue, … ») | 28 / 700, letterSpacing −0.6 | ink (nom en blue) |
| Sous-titre de page (date) | 15 / 400 | grey |
| Titre de bloc (hors carte) | 20 / 700, letterSpacing −0.4 | ink |
| Étiquette de carte | 13 / 600, MAJUSCULES, letterSpacing 0.6 | grey |
| Grand chiffre (CA) | 34 / 700, letterSpacing −1 | ink |
| Chiffre KPI | 28 / 700 | ink |
| Texte principal de ligne | 16 / 600 | ink |
| Texte secondaire | 13 / 400 | grey |

Tous les chiffres : `fontVariant: ['tabular-nums']`.

## 3. Mise en page

- `ScrollView` : `paddingHorizontal: 16` des deux côtés, **identique** à gauche et à droite. Rien ne déborde : textes longs → `numberOfLines={1}` + ellipsis.
- 22 px entre deux blocs ; 10 px entre les cartes d'une grille (KPI 2×2, cartes côte à côte).
- Le titre d'un bloc est **au-dessus** de la carte, pas dedans (lien bleu « Tout voir » à droite si besoin).
- En-tête fixe : à gauche le bouton salon (icône dans pastille `blueSoft` + nom + chevron = sélecteur d'enseigne), à droite l'avatar rond (initiales) du compte. Pas d'email affiché en en-tête.

## 4. Composants (à créer dans `src/components/`, réutilisés partout)

- **Card** : fond `card`, rayon 16, padding 16, **aucune bordure**, ombre en clair seulement. Variante `flush` (padding vertical 4, sans padding horizontal) pour les listes.
- **SectionHeader** : titre 20/700 + action optionnelle.
- **KpiTile** : pastille d'icône 32×32 rayon 10 (fond doux + icône couleur), chiffre 28/700, libellé 13 grey.
- **Segmented** : contrôle segmenté iOS pleine largeur — fond `fill`, rayon 10, padding 2 ; segment actif fond `card` (clair) / `#636366` (sombre) avec petite ombre.
- **PeriodNav** : ligne à part : bouton rond ‹, libellé de période centré 15/600, bouton rond ›.
- **ListRow** : padding 11/16, séparateur fin décalé (pas sous l'avatar), pas de carte dans une carte. Chevron `›` couleur `sep` si la ligne ouvre un détail.
- **Avatar** : rond, initiales blanches 12.5/700, fond = couleur du coiffeur (sinon `blue`).
- **Chip** : rayon 99, fond `fill`, 12/600.
- **StatPill** : fond `fill`, rayon 12, chiffre 20/700 + point de couleur et libellé 12.5 grey.
- **Delta** : pastille rayon 99, fond vert/rouge doux, texte vert/rouge 13/600 (▲ / ▼).
- **BarChart** : barres rayon 6 en haut, `blueSoft`, la plus haute (ou sélectionnée) en `blue`, étiquettes 11 grey.
- États : chargement = squelette ou petit `ActivityIndicator` dans la carte ; vide = texte 15 grey centré ; erreur = message serveur en `red` + bouton « Réessayer ». Pull-to-refresh sur chaque écran.

## 5. Interdit

- Boutons flottants (⚙️ ou autre) qui chevauchent le contenu.
- Emojis dans l'interface (🏆, 🥈…) — utiliser rang + avatar.
- Bordures grises autour des cartes ; cartes dans des cartes.
- Marges différentes à gauche et à droite, texte coupé ou qui sort de l'écran.
- Toute donnée inventée : chaque chiffre vient du serveur.
