import React from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Ionicons from '@expo/vector-icons/Ionicons';
import { GlassType } from '@/src/utils/beerGlassType';

type GlassIconProps = {
  type: GlassType;
  size?: number;
  color?: string;
};

/**
 * Renders the appropriate glass icon based on type
 * - Pint glass for lower ABV draft beers
 * - Tulip glass for higher ABV draft beers
 */
export function GlassIcon({ type, size = 24, color = '#000000' }: GlassIconProps) {
  if (type === 'pint') {
    return <Ionicons name="pint" size={size} color={color} />;
  }

  if (type === 'tulip') {
    return <MaterialCommunityIcons name="glass-tulip" size={size} color={color} />;
  }

  return null;
}
