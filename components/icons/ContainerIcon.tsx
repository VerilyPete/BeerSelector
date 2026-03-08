import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BeerIcon from './BeerIcon';
import { ContainerType } from '@/src/utils/beerGlassType';

type ContainerIconProps = {
  type: ContainerType;
  size?: number;
  color?: string;
};

export function ContainerIcon({ type, size = 24, color = '#000000' }: ContainerIconProps) {
  if (!type) {
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
        <Text
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
        </Text>
      </View>
    );
  }

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
