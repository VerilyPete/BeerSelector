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
        <View style={[styles.card, { borderColor: colors.border }]}>
          {/* Name row: name + container icon */}
          <View style={styles.nameRow}>
            <Text
              style={[styles.beerName, { color: colors.text }]}
              testID={`beer-name-${beer.id}`}
              numberOfLines={isExpanded ? undefined : 1}
            >
              {beer.brew_name || 'Unnamed Beer'}
            </Text>
            <View style={styles.iconContainer}>
              <ContainerIcon
                type={containerType}
                size={22}
                color={hasTastedDate ? colors.tint : colors.textSecondary}
              />
            </View>
          </View>

          {/* Brewery */}
          <Text
            style={[styles.brewery, { color: colors.textSecondary }]}
            testID={`beer-brewer-${beer.id}`}
            numberOfLines={isExpanded ? undefined : 1}
          >
            {beer.brewer}
            {beer.brewer_loc ? ` · ${beer.brewer_loc}` : ''}
          </Text>

          {/* Meta line: style · container · ABV */}
          <Text style={[styles.meta, { color: colors.textSecondary }]} testID={`beer-style-${beer.id}`} numberOfLines={1}>
            {beer.brew_style}
            {beer.brew_container ? ` · ${beer.brew_container}` : ''}
            {beer.abv != null ? ` · ${beer.abv}% ABV` : ''}
          </Text>

          {/* Date */}
          <Text
            style={[styles.meta, { color: hasTastedDate ? colors.tint : colors.textSecondary }]}
            testID={`beer-date-${beer.id}`}
          >
            {dateLabel}: {displayDate}
          </Text>

          {/* Expanded description */}
          {isExpanded && beer.brew_description && (
            <Animated.View
              style={[styles.descriptionSection, { borderTopColor: colors.separator }, expandStyle]}
              testID={`beer-description-container-${beer.id}`}
            >
              <Text style={[styles.descriptionLabel, { color: colors.text }]}>
                Description
              </Text>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]} testID={`beer-description-${beer.id}`}>
                {beer.brew_description.replace(/<\/?p>/g, '').replace(/<\/?br ?\/?>/, '\n')}
              </Text>
              {renderActions && <View style={styles.actionsContainer}>{renderActions()}</View>}
            </Animated.View>
          )}
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  touchable: {
    marginHorizontal: 0,
    marginBottom: 12,
    minHeight: 44,
  },
  card: {
    borderWidth: 1,
    padding: 16,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  beerName: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 16,
    fontWeight: '600',
  },
  iconContainer: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brewery: {
    fontFamily: 'Inter',
    fontSize: 13,
    fontWeight: '400',
  },
  meta: {
    fontFamily: 'Space Mono',
    fontSize: 11,
  },
  descriptionSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  descriptionLabel: {
    fontFamily: 'Inter',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  descriptionText: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 20,
  },
  actionsContainer: {
    marginTop: 12,
  },
});

export const BeerItem = React.memo(BeerItemComponent);
