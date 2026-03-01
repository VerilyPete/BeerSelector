import React from 'react';
import { StyleSheet, TouchableOpacity, View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { BeerWithContainerType, BeerfinderWithContainerType } from '@/src/types/beer';
import { ContainerIcon } from '../icons/ContainerIcon';
import { useAnimatedPress, useAnimatedExpand } from '@/animations';

type DisplayableBeer = BeerWithContainerType | BeerfinderWithContainerType;

type BeerItemProps = {
  beer: DisplayableBeer;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  dateLabel?: string;
  renderActions?: () => React.ReactNode;
  isTasted?: boolean;
};

const formatDate = (timestamp: string): string => {
  if (!timestamp) return 'Unknown date';
  try {
    const date = new Date(parseInt(timestamp, 10) * 1000);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return 'Invalid date';
  }
};

const formatDateString = (dateStr: string): string => {
  if (!dateStr) return 'Unknown date';
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10) - 1;
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    return dateStr;
  } catch {
    return 'Invalid date';
  }
};

const BeerItemComponent: React.FC<BeerItemProps> = ({
  beer,
  isExpanded,
  onToggle,
  dateLabel = 'Added',
  renderActions,
  isTasted = false,
}) => {
  const colorScheme = useColorScheme() ?? 'dark';
  const colors = Colors[colorScheme];

  const { animatedStyle: pressStyle, onPressIn, onPressOut } = useAnimatedPress();
  const { animatedStyle: expandStyle } = useAnimatedExpand({ isExpanded });

  const displayDate =
    'tasted_date' in beer && beer.tasted_date
      ? formatDateString(beer.tasted_date)
      : formatDate(beer.added_date || '');

  const containerType = beer.container_type;
  const hasTastedDate = 'tasted_date' in beer && beer.tasted_date;

  return (
    <TouchableOpacity
      onPress={() => onToggle(beer.id)}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      activeOpacity={1}
      testID={`beer-item-${beer.id}`}
      style={styles.touchable}
      accessibilityRole="button"
      accessibilityLabel={`${beer.brew_name} by ${beer.brewer}`}
    >
      <Animated.View style={pressStyle}>
        {/* Steel bezel outer frame */}
        <View style={[styles.steelBezel, { backgroundColor: colors.steelBezel, borderColor: colors.steelBezelBorder }]}>
          {/* Dark inner card */}
          <View style={[styles.cardInner, {
            backgroundColor: colors.backgroundSecondary,
            borderColor: isExpanded ? colors.accentMuted : colors.border,
          }]}>
            {/* Name row: icon + name + ABV badge */}
            <View style={styles.nameRow}>
              <View style={[styles.beerIconWell, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
                <ContainerIcon
                  type={containerType}
                  size={20}
                  color={hasTastedDate ? colors.tint : colors.textSecondary}
                />
              </View>
              <View style={styles.beerNameCol}>
                <Text
                  style={[styles.beerName, { color: colors.tint }]}
                  testID={`beer-name-${beer.id}`}
                  numberOfLines={isExpanded ? undefined : 1}
                >
                  {beer.brew_name || 'Unnamed Beer'}
                </Text>
                <Text
                  style={[styles.brewery, { color: colors.textSecondary }]}
                  testID={`beer-brewer-${beer.id}`}
                  numberOfLines={isExpanded ? undefined : 1}
                >
                  {beer.brewer}
                  {hasTastedDate && 'tasted_date' in beer && beer.tasted_date
                    ? ` · ${dateLabel} ${displayDate}`
                    : ''}
                </Text>
                <Text
                  style={[styles.meta, { color: colors.textMuted }]}
                  testID={`beer-style-${beer.id}`}
                  numberOfLines={1}
                >
                  {beer.brew_style}
                  {beer.brew_container ? ` · ${beer.brew_container}` : ''}
                </Text>
              </View>
              {beer.abv != null && (
                <View style={[styles.abvBadge, { borderColor: colors.accentMuted }]}>
                  <Text style={[styles.abvText, { color: colors.tint }]}>{beer.abv}%</Text>
                </View>
              )}
            </View>

            {/* Expanded description */}
            {isExpanded && (
              <Animated.View
                style={[styles.descriptionSection, { borderTopColor: colors.separator }, expandStyle]}
                testID={`beer-description-container-${beer.id}`}
              >
                {!hasTastedDate && (
                  <Text style={[styles.meta, { color: colors.textMuted }]} testID={`beer-date-${beer.id}`}>
                    {dateLabel}: {displayDate}
                  </Text>
                )}
                {beer.brew_description && (
                  <>
                    <Text style={[styles.descriptionLabel, { color: colors.text }]}>
                      Description
                    </Text>
                    <Text style={[styles.descriptionText, { color: colors.textSecondary }]} testID={`beer-description-${beer.id}`}>
                      {beer.brew_description.replace(/<\/?p>/g, '').replace(/<\/?br ?\/?>/, '\n')}
                    </Text>
                  </>
                )}
                {renderActions && <View style={styles.actionsContainer}>{renderActions()}</View>}
              </Animated.View>
            )}
          </View>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    marginHorizontal: 0,
    marginBottom: 8,
    minHeight: 44,
  },
  steelBezel: {
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
  },
  cardInner: {
    borderWidth: 1,
    borderRadius: 11,
    padding: 10,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  beerIconWell: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  beerNameCol: {
    flex: 1,
    gap: 2,
  },
  beerName: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 14,
  },
  brewery: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
  },
  abvBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minWidth: 52,
    alignItems: 'center',
  },
  abvText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    fontFamily: 'SpaceMono',
    fontSize: 10,
  },
  descriptionSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    gap: 4,
  },
  descriptionLabel: {
    fontFamily: 'SpaceGrotesk-SemiBold',
    fontSize: 13,
    marginTop: 4,
  },
  descriptionText: {
    fontFamily: 'SpaceMono',
    fontSize: 11,
    lineHeight: 18,
  },
  actionsContainer: {
    marginTop: 10,
  },
});

export const BeerItem = React.memo(BeerItemComponent);
