import React from 'react';

const Ionicons = ({ name, size, color, ...props }) => {
  return React.createElement('Ionicons', {
    name,
    size,
    color,
    testID: `icon-${name}`,
    ...props,
  });
};

export default Ionicons;
