import { Text } from 'react-native';
import MathText, { containsLatex } from './MathText';
import { colors } from '../constants/theme';

/**
 * Renders the AI enrichment fields (exam tip / real-life example), which can
 * contain markdown bold (**text**) and/or LaTeX formulas.
 *
 * - LaTeX present → MathText (KaTeX). KaTeX doesn't understand markdown, so
 *   the **markers** are stripped there (formula fidelity wins over bold).
 * - Plain text → native Text with **bold** segments rendered as bold spans.
 */
export default function RichTipText({
  content,
  color = colors.text,
  fontSize = 13,
  lineHeight = 19,
}: {
  content: string;
  color?: string;
  fontSize?: number;
  lineHeight?: number;
}) {
  if (containsLatex(content)) {
    return (
      <MathText
        content={content.replace(/\*\*(.+?)\*\*/g, '$1')}
        color={color}
        textStyle={{ fontSize, lineHeight }}
      />
    );
  }
  const parts = content.split(/\*\*(.+?)\*\*/g);
  return (
    <Text style={{ color, fontSize, lineHeight }}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <Text key={i} style={{ fontWeight: '700' }}>
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
