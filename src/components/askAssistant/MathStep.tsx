// One step of a worked maths solution, typeset (KaTeX) in a single WebView. Display-only: touches pass through
// so the board underneath keeps scrolling.
import React, { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { buildMathStepHtml } from '../../services/askAssistant/mathStepHtml';

interface MathStepProps {
  bullets: string[];
}

function MathStepBase({ bullets }: MathStepProps) {
  const [height, setHeight] = useState(48);
  // Rebuild the page only when the lines actually change, not on every render of the board.
  const key = bullets.join('\u0001');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildMathStepHtml(bullets), [key]);

  const onMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    const next = parseInt(event.nativeEvent.data, 10);
    if (next > 0) setHeight(next);
  }, []);

  return (
    <View style={[styles.container, { height }]} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.webView}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit={false}
        cacheEnabled
        startInLoadingState={false}
      />
    </View>
  );
}

export const MathStep = memo(MathStepBase);
export default MathStep;

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', backgroundColor: 'transparent' },
  webView: { flex: 1, backgroundColor: 'transparent' },
});
