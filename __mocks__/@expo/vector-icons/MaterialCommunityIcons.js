import React from 'react';

const MaterialCommunityIcons = ({ name, size, color, ...props }) => {
  return React.createElement('MaterialCommunityIcons', {
    name,
    size,
    color,
    testID: `icon-${name}`,
    ...props,
  });
};

export default MaterialCommunityIcons;
