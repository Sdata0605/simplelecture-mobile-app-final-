import { useState, useCallback, useRef, memo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fontSize } from '../constants/theme';
import { containsLatex, hasMathDelimiters, escapeHtml } from '../utils/latexFormat';

interface MathTextProps {
  content: string;
  style?: object;
  textStyle?: object;
  color?: string;
  // When true, the whole content is treated as a single math/chemistry
  // expression. Bare LaTeX with no $...$ delimiters (e.g. "F = G \frac{m_1 m_2}{r^2}"
  // or "\ce{H2O}") is wrapped in display-math delimiters so it typesets. Use this
  // for dedicated formula boxes, NOT for mixed prose that uses inline $...$.
  mathOnly?: boolean;
}

function buildKatexHtml(bodyHtml: string, textColor: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/mhchem.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{background:transparent;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.45;color:${textColor};padding:2px 0;word-wrap:break-word;}
.katex{font-size:1.05em;}
.katex-display{margin:2px 0;overflow-x:auto;overflow-y:hidden;}
p{margin-bottom:4px;}
</style>
</head>
<body>
${bodyHtml}
<script>
document.addEventListener("DOMContentLoaded",function(){
renderMathInElement(document.body,{
delimiters:[
{left:"$$",right:"$$",display:true},
{left:"$",right:"$",display:false},
{left:"\\\\[",right:"\\\\]",display:true},
{left:"\\\\(",right:"\\\\)",display:false}
],throwOnError:false,errorColor:"#cc0000",trust:false
});
function s(){var h=document.body.scrollHeight;if(h>0)window.ReactNativeWebView.postMessage(h.toString());}
setTimeout(s,100);setTimeout(s,300);setTimeout(s,600);setTimeout(s,1200);
});
</script>
</body>
</html>`;
}

const MathText = memo(({ content, style, textStyle, color = colors.gray900, mathOnly = false }: MathTextProps) => {
  const { width } = useWindowDimensions();
  const [webViewHeight, setWebViewHeight] = useState(20);

  const safeContent = content ?? '';
  const hasDelimiters = hasMathDelimiters(safeContent);
  // In mathOnly mode the whole string is a formula: render via KaTeX if it has
  // delimiters, any LaTeX command, or sub/superscripts/backslashes — but still
  // fall back to plain text for word-only formulas like "Speed = Distance / Time".
  const hasLatex = mathOnly
    ? (hasDelimiters || containsLatex(safeContent) || /[_^\\]/.test(safeContent))
    : containsLatex(safeContent);

  const webViewRef = useRef<WebView>(null);

  const onMessage = useCallback((event: any) => {
    const height = parseInt(event.nativeEvent.data, 10);
    if (height && height > 0) {
      setWebViewHeight(height);
    }
  }, []);

  const onLoadEnd = useCallback(() => {
    webViewRef.current?.injectJavaScript(
      'var h=document.body.scrollHeight;if(h>0)window.ReactNativeWebView.postMessage(h.toString());true;'
    );
  }, []);

  if (!hasLatex) {
    return (
      <View style={style}>
        <Text style={[styles.plainText, { color }, textStyle]}>
          {safeContent}
        </Text>
      </View>
    );
  }

  // mathOnly with no delimiters → wrap the whole expression in display-math so
  // KaTeX auto-render typesets it (collapse newlines so the $$...$$ stays in one
  // text node). Otherwise leave the content as-is for inline-delimiter rendering.
  const prepared =
    mathOnly && !hasDelimiters
      ? `$$${safeContent.replace(/\s*\n\s*/g, ' ').trim()}$$`
      : safeContent;
  const bodyHtml = `<div>${escapeHtml(prepared)}</div>`;
  const htmlContent = buildKatexHtml(bodyHtml, color);

  // pointerEvents="none": this is a display-only surface (scrolling is
  // disabled), but WebViews still consume touch streams by default, which
  // breaks parent scroll views and the notes pager's swipe gestures when a
  // drag starts on a math block. Let all touches pass through.
  return (
    <View
      style={[styles.container, style, { height: webViewHeight }]}
      pointerEvents="none"
    >
      <WebView
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webView}
        scrollEnabled={false}
        nestedScrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        onMessage={onMessage}
        onLoadEnd={onLoadEnd}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={false}
        cacheEnabled={true}
        startInLoadingState={false}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  plainText: {
    fontSize: fontSize.md,
    lineHeight: 24,
  },
});

export { containsLatex, buildKatexHtml, escapeHtml };
export default MathText;
