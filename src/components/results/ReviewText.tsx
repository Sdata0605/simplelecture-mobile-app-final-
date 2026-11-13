import React from 'react';
import { StyleProp, Text, TextStyle } from 'react-native';
import LatexText from '../LatexText';

const MATH_PATTERN = /\$|\\[a-zA-Z]|\^|_|\{|\}/;

interface ReviewTextProps {
  children: string;
  fontSize: number;
  color: string;
  style?: StyleProp<TextStyle>;
}

export default function ReviewText({ children, fontSize, color, style }: ReviewTextProps) {
  if (MATH_PATTERN.test(children)) {
    return (
      <LatexText fontSize={fontSize} color={color} style={style}>
        {children}
      </LatexText>
    );
  }
  return (
    <Text style={[{ fontSize, color, lineHeight: Math.round(fontSize * 1.45) }, style]}>
      {children}
    </Text>
  );
}
