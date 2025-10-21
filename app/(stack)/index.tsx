import { router } from 'expo-router';
import { useRef, useState } from 'react';
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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
            mixedContentMode={"compatibility"}
            originWhitelist={["*"]}
            userAgent={customUserAgent}
            allowsBackForwardNavigationGestures={true}
            scalesPageToFit={false}
            setBuiltInZoomControls={false}
            setDisplayZoomControls={false}
            injectedJavaScript={`
              // Remove meta viewport existente
              const existingMeta = document.querySelector('meta[name="viewport"]');
              if (existingMeta) {
                existingMeta.remove();
              }

              // Adiciona nova meta viewport
              const meta = document.createElement('meta');
              meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
              meta.setAttribute('name', 'viewport');
              document.getElementsByTagName('head')[0].appendChild(meta);

              // Desabilita zoom por eventos touch
              document.addEventListener('gesturestart', function(e) {
                e.preventDefault();
              });

              document.addEventListener('touchmove', function(e) {
                if (e.scale !== 1) {
                  e.preventDefault();
                }
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
