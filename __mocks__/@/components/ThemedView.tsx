import React from 'react';
import { View } from 'react-native';

export const ThemedView = ({ children, style, ...props }: any) => (
  <View style={style} {...props}>{children}</View>
);
