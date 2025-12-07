import React from 'react';
import BeerIcon from './BeerIcon';
import { GlassType } from '@/src/utils/beerGlassType';

type GlassIconProps = {
  type: GlassType;
  size?: number;
  color?: string;
};

/**
 * Renders the appropriate glass icon based on type
 * - Pint glass for draft beers < 7.4% ABV
 * - Tulip glass for draft beers >= 7.4% ABV
 */
export function GlassIcon({ type, size = 24, color = '#000000' }: GlassIconProps) {
  if (type === 'pint') {
    return <BeerIcon name="pint" size={size} color={color} />;
  }

  if (type === 'tulip') {
    return <BeerIcon name="tulip" size={size} color={color} />;
  }

  return null;
}
