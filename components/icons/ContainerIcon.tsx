import React from 'react';
import { View, StyleSheet } from 'react-native';
import BeerIcon from './BeerIcon';
import { ContainerType } from '@/src/utils/beerGlassType';
import { ThemedText } from '../ThemedText';

type ContainerIconProps = {
  type: ContainerType;
  size?: number;
  color?: string;
};

/**
 * Renders the appropriate container icon based on type
 * - Pint glass for draft beers < 7.4% ABV (13oz)
 * - Tulip glass for draft beers >= 7.4% ABV (16oz)
 * - Can for canned beers
 * - Bottle for bottled beers
 * - Question mark for unknown container types (null)
 */
export function ContainerIcon({ type, size = 24, color = '#000000' }: ContainerIconProps) {
  if (!type) {
    // Show a question mark for unknown container types
    // Uses muted text style for subtle appearance consistent with iconography
    return (
      <View
        style={[
          styles.unknownContainer,
          {
            width: size,
            height: size,
          },
        ]}
        accessible={true}
        accessibilityLabel="Unknown container type"
      >
        <ThemedText
          type="muted"
          style={[
            styles.unknownText,
            {
              fontSize: size * 0.75,
              lineHeight: size,
              color: color,
            },
          ]}
        >
          ?
        </ThemedText>
      </View>
    );
  }

  // All valid types map directly to BeerIcon names
  return <BeerIcon name={type} size={size} color={color} />;
}

const styles = StyleSheet.create({
  unknownContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  unknownText: {
    fontWeight: '600',
    textAlign: 'center',
  },
});
