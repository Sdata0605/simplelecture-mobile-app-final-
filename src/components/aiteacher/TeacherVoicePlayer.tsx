// Plays the AI teacher's voice. Mount it for as long as a call is on (next to MicStreamer): it is a hidden WebView
// running the Web Audio page in services/teacherVoiceScript.ts, fed by services/teacherVoice.ts.
import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PLAYER_HTML } from '../../services/teacherVoiceScript';
import { teacherVoice } from '../../services/teacherVoice';

export function TeacherVoicePlayer() {
  const webView = useRef<WebView>(null);

  useEffect(() => teacherVoice.attach((script) => webView.current?.injectJavaScript(script)), []);

  return (
    <View style={styles.hiddenContainer} pointerEvents="none">
      <WebView
        ref={webView}
        originWhitelist={['*']}
        source={{ html: PLAYER_HTML, baseUrl: 'https://localhost' }}
        style={styles.hiddenWebView}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onMessage={(event) => teacherVoice.handleMessage(event.nativeEvent.data)}
      />
    </View>
  );
}

export default TeacherVoicePlayer;

const styles = StyleSheet.create({
  hiddenContainer: { position: 'absolute', top: 0, left: 0, width: 2, height: 2, opacity: 0.01 },
  hiddenWebView: { width: 2, height: 2 },
});
