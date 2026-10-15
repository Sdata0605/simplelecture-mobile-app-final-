import React, { useState, useMemo, useCallback } from 'react';
import { Text, TextStyle, StyleSheet, StyleProp, View, Platform } from 'react-native';
import { WebView } from 'react-native-webview';

interface LatexTextProps {
  children: string;
  style?: StyleProp<TextStyle>;
  fontSize?: number;
  color?: string;
  // When true, the whole string is a single formula: bare LaTeX/mhchem with no
  // $...$ delimiters is wrapped in display math so it typesets. Leave false (the
  // default) for mixed prose so plain text and inline-$ math keep prior behavior.
  mathOnly?: boolean;
}

const KATEX_HTML = (content: string, fontSize: number = 16, color: string = '#FFFFFF') => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/mhchem.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      background: transparent;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: ${fontSize}px;
      line-height: 1.5;
      color: ${color};
      overflow-x: hidden;
      overflow-y: auto;
    }
    #content {
      padding: 4px 0;
      word-wrap: break-word;
    }
    .katex {
      font-size: 1.1em;
      color: ${color};
    }
    .katex-display {
      margin: 0.5em 0;
      overflow-x: auto;
      overflow-y: hidden;
    }
    .katex-display > .katex {
      color: ${color};
    }
  </style>
</head>
<body>
  <div id="content">${content.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  <script>
    document.addEventListener('DOMContentLoaded', function() {
      try {
        renderMathInElement(document.getElementById('content'), {
          delimiters: [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: '\\\\(', right: '\\\\)', display: false},
            {left: '\\\\[', right: '\\\\]', display: true}
          ],
          throwOnError: false,
          errorColor: '#f44336',
          strict: false,
          trust: true
        });
      } catch(e) {
        console.log('KaTeX error:', e);
      }
      
      setTimeout(function() {
        const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 30);
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'height', height: height }));
      }, 150);
    });
  </script>
</body>
</html>
`;

const hasLatexMarkers = (text: string): boolean => {
  if (!text) return false;
  return /\$.*?\$|\\\(.*?\\\)|\\\[.*?\\\]|\\[a-zA-Z]+\{/.test(text);
};

export const LatexText: React.FC<LatexTextProps> = ({ 
  children, 
  style,
  fontSize = 16,
  color = '#FFFFFF',
  mathOnly = false
}) => {
  const [webViewHeight, setWebViewHeight] = useState(40);
  
  const containsLatex = useMemo(() => {
    return hasLatexMarkers(children);
  }, [children]);
  
  const handleMessage = useCallback((event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'height') {
        setWebViewHeight(Math.max(data.height + 10, 35));
      }
    } catch (e) {
      console.log('[LatexText] Error parsing message:', e);
    }
  }, []);
  
  if (!containsLatex) {
    return (
      <Text style={[styles.text, style]}>
        {children}
      </Text>
    );
  }
  
  // In mathOnly mode, bare LaTeX/mhchem with no $...$ delimiters won't be picked
  // up by KaTeX's auto-render, so wrap the whole expression in display math
  // (collapse newlines so the $$...$$ stays in a single text node). For mixed
  // prose (mathOnly=false) leave content as-is so inline-$ math still works.
  const hasDelimiters = /\$.+?\$|\\\(.+?\\\)|\\\[.+?\\\]/s.test(children);
  const prepared =
    mathOnly && !hasDelimiters
      ? `$$${children.replace(/\s*\n\s*/g, ' ').trim()}$$`
      : children;
  const html = KATEX_HTML(prepared, fontSize, color);
  
  return (
    <View style={[styles.webViewContainer, { minHeight: webViewHeight }]}>
      <WebView
        source={{ html }}
        style={styles.webView}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scalesPageToFit={false}
        allowsInlineMediaPlayback={true}
        mixedContentMode="compatibility"
        androidLayerType="hardware"
        bounces={false}
        overScrollMode="never"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  text: {
    color: '#FFFFFF',
  },
  webViewContainer: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default LatexText;
