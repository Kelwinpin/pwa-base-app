import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, PermissionsAndroid, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView, { WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import source from '../config/url.json';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const touchX = useRef(0);
  const touchY = useRef(0);
  const webViewRef = useRef<WebView>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(Platform.OS === 'ios');
  const customUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/102.0.5005.87 Mobile/15E148 Safari/604.1';

  const bottomPadding = Platform.OS === 'android'
    ? Math.max(insets.bottom, 48)
    : insets.bottom;

  useEffect(() => {
    if (Platform.OS === 'android') {
      StatusBar.setBackgroundColor('#ffffff');
      StatusBar.setBarStyle('dark-content');
      StatusBar.setTranslucent(false);
      
      requestPermissions();
    }
  }, []);

  const requestPermissions = async () => {
    try {
      const cameraCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
      const audioCheck = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);

      let cameraGranted = cameraCheck;
      let audioGranted = audioCheck;

      if (!cameraCheck || !audioCheck) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        cameraGranted = granted['android.permission.CAMERA'] === PermissionsAndroid.RESULTS.GRANTED;
        audioGranted = granted['android.permission.RECORD_AUDIO'] === PermissionsAndroid.RESULTS.GRANTED;
      }

      if (cameraGranted && audioGranted) {
        console.log('Permissões concedidas');
        setPermissionsGranted(true);
      } else {
        console.warn('Permissões negadas - App pode não funcionar corretamente');
        setPermissionsGranted(true);
      }
    } catch (err) {
      console.warn('Erro ao solicitar permissões:', err);
      setPermissionsGranted(true);
    }
  };

  const handleShouldStartLoadWithRequest = (request: ShouldStartLoadRequest): boolean => {
    const { url } = request;
    
    if (
      url.startsWith('tel:') ||
      url.startsWith('mailto:') ||
      url.startsWith('sms:') ||
      url.startsWith('whatsapp:')
    ) {
      Linking.openURL(url).catch(err => {
        console.error('Erro ao abrir URL:', err);
      });
      return false;
    }
    
    return true;
  };

  const handleNavigationStateChange = (navState: WebViewNavigation): boolean => {
    const { url } = navState;
    
    if (
      url.startsWith('tel:') ||
      url.startsWith('mailto:') ||
      url.startsWith('sms:') ||
      url.startsWith('whatsapp:') ||
      url.startsWith('intent:')
    ) {
      Linking.openURL(url).catch(err => {
        console.error('Erro ao abrir URL:', err);
      });
      
      if (webViewRef.current) {
        webViewRef.current.stopLoading();
      }
      
      return false;
    }
    
    return true;
  };

  // Aguarda permissões no Android
  if (!permissionsGranted) {
    return (
      <View style={styles.container}>
        <StatusBar
          barStyle="dark-content"
          backgroundColor="#ffffff"
          translucent={false}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFA311" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
        translucent={false}
      />
      <WebView
        ref={webViewRef}
        onTouchStart={e => {
          if (Platform.OS === 'android') {
            touchX.current = e.nativeEvent.pageX;
            touchY.current = e.nativeEvent.pageY;
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
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        geolocationEnabled={true}

        // @ts-ignore - Props Android específicas para permissões de mídia
        androidPermissionRequest={(request: any) => {
          console.log('[Android] Permissão solicitada:', JSON.stringify(request));
          if (request && request.grant) {
            console.log('[Android] Concedendo permissões:', request.resources);
            request.grant(request.resources);
          }
          return true;
        }}

        // @ts-ignore - onPermissionRequest para versões mais antigas
        onPermissionRequest={(request: any) => {
          console.log('[WebView] Permissão solicitada:', JSON.stringify(request));
          if (request && request.grant) {
            console.log('[WebView] Concedendo permissões:', request.resources);
            request.grant(request.resources);
          }
        }}
        
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={handleNavigationStateChange}

        onMessage={(event) => {
          console.log('[WebView Message]:', event.nativeEvent.data);
        }}

        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error('[WebView Error]:', nativeEvent);
        }}

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
          const meta = document.createElement('meta');
          meta.setAttribute('name', 'viewport');
          meta.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
          document.head.appendChild(meta);

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

          // Intercepta getUserMedia para debug
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
            navigator.mediaDevices.getUserMedia = function(constraints) {
              console.log('[PWA] getUserMedia chamado com:', JSON.stringify(constraints));
              return originalGetUserMedia(constraints)
                .then(stream => {
                  console.log('[PWA] getUserMedia: stream obtido com sucesso');
                  return stream;
                })
                .catch(error => {
                  console.error('[PWA] getUserMedia: erro -', error.name, error.message);
                  throw error;
                });
            };
          }

          true;
        `}
        injectedJavaScript={`
          let lastTouchEnd = 0;
          document.addEventListener('touchend', function(event) {
            const now = Date.now();
            if (now - lastTouchEnd <= 300) {
              event.preventDefault();
            }
            lastTouchEnd = now;
          }, { passive: false });

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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
});