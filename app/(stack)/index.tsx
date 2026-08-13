import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import WebView, { WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";
import source from "../config/url.json";

// Chave usada no SecureStore pra guardar o refresh token — permite login
// automático via biometria sem precisar digitar email/senha de novo.
const REFRESH_TOKEN_KEY = "cd_refresh_token";

function buildRestoreSessionScript(refreshToken: string): string {
  return `
    (function () {
      fetch('/api/auth/restore-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: ${JSON.stringify(refreshToken)} }),
      })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data && data.success) {
            window.location.href = '/painel';
          }
        })
        .catch(function (err) {
          console.error('[restore-session] falhou', err);
        });
    })();
    true;
  `;
}

// Trava o zoom dentro do WebView (pinça, duplo toque e zoom de texto do SO).
// No iOS não existe prop nativa pra isso, então o bloqueio vem daqui.
const DISABLE_ZOOM_JS = `
(function () {
  var VIEWPORT =
    'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover';

  function lockViewport() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    if (meta.getAttribute('content') !== VIEWPORT) {
      meta.setAttribute('content', VIEWPORT);
    }

    // touch-action bloqueia o zoom por duplo toque sem quebrar os cliques
    if (!document.getElementById('rn-disable-zoom')) {
      var style = document.createElement('style');
      style.id = 'rn-disable-zoom';
      style.innerHTML =
        'html, body { touch-action: pan-x pan-y; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }';
      document.head.appendChild(style);
    }
  }

  function start() {
    lockViewport();
    // O PWA pode reescrever a meta viewport em runtime; reaplica quando isso acontecer
    if (window.MutationObserver) {
      new MutationObserver(lockViewport).observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
      });
    }
  }

  if (document.head) start();
  else document.addEventListener('DOMContentLoaded', start);

  // iOS: a pinça dispara gesture events mesmo com user-scalable=no
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (evt) {
    document.addEventListener(
      evt,
      function (e) {
        e.preventDefault();
      },
      { passive: false }
    );
  });

  // Fallback: qualquer movimento com mais de um dedo
  document.addEventListener(
    'touchmove',
    function (e) {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );
})();
true;
`;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const touchX = useRef(0);
  const touchY = useRef(0);
  const webViewRef = useRef<WebView>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(
    Platform.OS === "ios",
  );
  const customUserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/102.0.5005.87 Mobile/15E148 Safari/604.1";

  // Com edge-to-edge as barras do sistema ficam transparentes e o conteúdo passa
  // por baixo delas. Reservar os insets deixa essas faixas com o fundo do
  // container (a mesma cor da status bar) e o WebView entre elas.
  // Onde o sistema já reserva o espaço, o inset vem 0 e nada é somado.
  const topPadding = Platform.OS === "android" ? insets.top : 0;
  const bottomPadding = Platform.OS === "android" ? insets.bottom : 0;

  // Fluxo de login biométrico: se existe um refresh token guardado e a
  // biometria confirma, injeta um script que restaura a sessão assim que o
  // WebView terminar de carregar (precisa das duas coisas prontas).
  const [webViewLoaded, setWebViewLoaded] = useState(false);
  const [biometricToken, setBiometricToken] = useState<string | null>(null);
  const restoreAttempted = useRef(false);

  useEffect(() => {
    if (Platform.OS === "android") {
      StatusBar.setBarStyle("dark-content");

      requestPermissions();
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const storedToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedToken) return;

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) return;

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: "Entrar na Caderneta Digital",
          cancelLabel: "Cancelar",
        });
        if (result.success) {
          setBiometricToken(storedToken);
        }
      } catch (err) {
        console.warn("[Biometria] Erro ao autenticar:", err);
      }
    })();
  }, []);

  useEffect(() => {
    if (webViewLoaded && biometricToken && !restoreAttempted.current) {
      restoreAttempted.current = true;
      webViewRef.current?.injectJavaScript(
        buildRestoreSessionScript(biometricToken),
      );
    }
  }, [webViewLoaded, biometricToken]);

  const requestPermissions = async () => {
    try {
      const cameraCheck = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.CAMERA,
      );
      const audioCheck = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );

      let cameraGranted = cameraCheck;
      let audioGranted = audioCheck;

      if (!cameraCheck || !audioCheck) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        cameraGranted =
          granted["android.permission.CAMERA"] ===
          PermissionsAndroid.RESULTS.GRANTED;
        audioGranted =
          granted["android.permission.RECORD_AUDIO"] ===
          PermissionsAndroid.RESULTS.GRANTED;
      }

      if (cameraGranted && audioGranted) {
        console.log("Permissões concedidas");
        setPermissionsGranted(true);
      } else {
        console.warn(
          "Permissões negadas - App pode não funcionar corretamente",
        );
        setPermissionsGranted(true);
      }
    } catch (err) {
      console.warn("Erro ao solicitar permissões:", err);
      setPermissionsGranted(true);
    }
  };

  const handleShouldStartLoadWithRequest = (
    request: ShouldStartLoadRequest,
  ): boolean => {
    const { url } = request;

    if (
      url.startsWith("tel:") ||
      url.startsWith("mailto:") ||
      url.startsWith("sms:") ||
      url.startsWith("whatsapp:")
    ) {
      Linking.openURL(url).catch((err) => {
        console.error("Erro ao abrir URL:", err);
      });
      return false;
    }

    return true;
  };

  const handleNavigationStateChange = (
    navState: WebViewNavigation,
  ): boolean => {
    const { url } = navState;

    if (
      url.startsWith("tel:") ||
      url.startsWith("mailto:") ||
      url.startsWith("sms:") ||
      url.startsWith("whatsapp:") ||
      url.startsWith("intent:")
    ) {
      Linking.openURL(url).catch((err) => {
        console.error("Erro ao abrir URL:", err);
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
      <View
        style={[
          styles.container,
          { paddingTop: topPadding, paddingBottom: bottomPadding },
        ]}
      >
        <StatusBar barStyle="dark-content" />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { paddingTop: topPadding, paddingBottom: bottomPadding },
      ]}
    >
      <StatusBar barStyle="dark-content" />
      <WebView
        ref={webViewRef}
        onTouchStart={(e) => {
          if (Platform.OS === "android") {
            touchX.current = e.nativeEvent.pageX;
            touchY.current = e.nativeEvent.pageY;
          }
        }}
        onTouchEnd={(e) => {
          if (
            Platform.OS === "android" &&
            touchX.current - e.nativeEvent.pageX < -20
          ) {
            if (
              touchY.current - e.nativeEvent.pageY > -20 &&
              touchY.current - e.nativeEvent.pageY < 20
            ) {
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
          console.log(
            "[Android] Permissão solicitada:",
            JSON.stringify(request),
          );
          if (request && request.grant) {
            console.log("[Android] Concedendo permissões:", request.resources);
            request.grant(request.resources);
          }
          return true;
        }}
        // @ts-ignore - onPermissionRequest para versões mais antigas
        onPermissionRequest={(request: any) => {
          console.log(
            "[WebView] Permissão solicitada:",
            JSON.stringify(request),
          );
          if (request && request.grant) {
            console.log("[WebView] Concedendo permissões:", request.resources);
            request.grant(request.resources);
          }
        }}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={handleNavigationStateChange}
        onMessage={(event) => {
          console.log("[WebView Message]:", event.nativeEvent.data);
        }}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          console.error("[WebView Error]:", nativeEvent);
        }}
        mixedContentMode={"compatibility"}
        originWhitelist={["*"]}
        userAgent={customUserAgent}
        allowsBackForwardNavigationGestures={true}
        injectedJavaScriptBeforeContentLoaded={DISABLE_ZOOM_JS}
        injectedJavaScript={DISABLE_ZOOM_JS}
        setBuiltInZoomControls={false}
        setDisplayZoomControls={false}
        textZoom={100}
        scalesPageToFit={true}
        showsVerticalScrollIndicator={true}
        showsHorizontalScrollIndicator={false}
        scrollEnabled={true}
        bounces={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f2e9d6",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f2e9d6",
  },
});
