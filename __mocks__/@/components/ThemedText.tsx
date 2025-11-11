import React from 'react';
import { Text } from 'react-native';

export const ThemedText = ({ children, type, style, ...props }: any) => (
  <Text style={style} {...props}>{children}</Text>
);
