import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from "react-native-webview";
import source from '../config/url.json';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const touchX = useRef(0);
  const touchY = useRef(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const customUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/102.0.5005.87 Mobile/15E148 Safari/604.1';

  // Calcula o padding inferior - usa o inset ou fallback para Android
  const bottomPadding = Platform.OS === 'android'
    ? Math.max(insets.bottom, 48) // 48px é um fallback comum para botões de navegação Android
    : insets.bottom;

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor('#ffffff');
      StatusBar.setBarStyle('dark-content');
      StatusBar.setTranslucent(false);
    }
    console.log('Safe Area Insets:', insets);
    console.log('Bottom Padding usado:', bottomPadding);
  }, [insets, bottomPadding]);

  return (
    <View style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#ffffff"
          translucent={false}
        />
        <WebView
            onTouchStart={e => {
                if (Platform.OS === 'android') {
                  touchX.current = e.nativeEvent.pageX;
                  touchY.current = e.nativeEvent.pageY
                }
            }}
            onTouchEnd={e => {
                if (Platform.OS === 'android' && touchX.current - e.nativeEvent.pageX < -20) {
                    if (touchY.current - e.nativeEvent.pageY > -20 && touchY.current - e.nativeEvent.pageY < 20) {
                      router.back();
                    }
                }
            }}
            startInLoadingState={true}
            source={{ uri: source.url }}
            style={{ flex: 1 }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback={true}
            // IMPORTANTE: Configuração para aceitar uploads de arquivos
            allowFileAccess={true}
            allowFileAccessFromFileURLs={true}
            allowUniversalAccessFromFileURLs={true}
            // Suporte para captura de mídia (foto picker e câmera)
            mediaCapturePermissionGrantType="grant"
            mixedContentMode={"compatibility"}
            originWhitelist={["*"]}
            userAgent={customUserAgent}
            allowsBackForwardNavigationGestures={true}
            scalesPageToFit={true}
            showsVerticalScrollIndicator={true}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={true}
            bounces={true}
            injectedJavaScriptBeforeContentLoaded={`
              // Configura viewport para prevenir zoom mantendo scroll
              const meta = document.createElement('meta');
              meta.setAttribute('name', 'viewport');
              meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
              document.head.appendChild(meta);

              // Injeta CSS para safe area com valor fixo para Android
              const style = document.createElement('style');
              style.innerHTML = \`
                * {
                  box-sizing: border-box;
                }
                html, body {
                  margin: 0;
                  padding: 0;
                  height: 100%;
                  overflow-x: hidden;
                }
                body {
                  padding-bottom: ${bottomPadding}px !important;
                }
              \`;
              document.head.appendChild(style);
              true;
            `}
            injectedJavaScript={`
              // Previne zoom por toque duplo
              let lastTouchEnd = 0;
              document.addEventListener('touchend', function(event) {
                const now = Date.now();
                if (now - lastTouchEnd <= 300) {
                  event.preventDefault();
                }
                lastTouchEnd = now;
              }, { passive: false });

              // Previne pinch zoom
              document.addEventListener('gesturestart', function(e) {
                e.preventDefault();
              }, { passive: false });

              true;
            `}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
