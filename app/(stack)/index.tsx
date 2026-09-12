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
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { printEscPos } from "@/lib/thermal-printer";
import source from "../config/url.json";

// Chave usada no SecureStore pra guardar o refresh token — permite login
// automático via biometria sem precisar digitar email/senha de novo.
const REFRESH_TOKEN_KEY = "cd_refresh_token";

// Expressão JS que resolve a URL vinda do payload da push contra a origem do
// PWA e devolve `null` se ela apontar pra fora — sem isso qualquer notificação
// conseguiria levar o WebView pra outro site.
function buildResolvedUrlExpression(rawUrl: string, baseUrl: string): string {
  return `(function () {
        try {
          var target = new URL(${JSON.stringify(rawUrl)}, window.location.href);
          var allowed = new URL(${JSON.stringify(baseUrl)});
          if (target.origin !== allowed.origin) {
            console.warn('[push] url fora da origem do app, ignorada:', target.href);
            return null;
          }
          return target.href;
        } catch (err) {
          console.error('[push] url invalida', err);
          return null;
        }
      })()`;
}

// `pendingUrl` só vem preenchida quando o app foi aberto por uma notificação com
// `data.url`: nesse caso o restore leva direto pra rota da notificação, em vez
// do painel, pra não desfazer o deep link logo depois de navegar.
function buildRestoreSessionScript(
  refreshToken: string,
  pendingUrl: string | null,
  baseUrl: string,
): string {
  const destination = pendingUrl
    ? `${buildResolvedUrlExpression(pendingUrl, baseUrl)} || '/painel'`
    : `'/painel'`;

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
            window.location.href = ${destination};
          }
        })
        .catch(function (err) {
          console.error('[restore-session] falhou', err);
        });
    })();
    true;
  `;
}

// Entrega o push token pro PWA. Fica num global (pra quem lê no mount) e também
// dispara um evento (pra quem já estava escutando quando o token chegou).
function buildPushTokenScript(token: string): string {
  return `
    (function () {
      window.__EXPO_PUSH_TOKEN__ = ${JSON.stringify(token)};
      window.__NATIVE_PLATFORM__ = ${JSON.stringify(Platform.OS)};
      window.dispatchEvent(
        new CustomEvent('expo:push-token', {
          detail: {
            token: ${JSON.stringify(token)},
            platform: ${JSON.stringify(Platform.OS)},
          },
        })
      );
    })();
    true;
  `;
}

// Devolve pro PWA o resultado de uma impressão pedida via postMessage — ele
// casa pelo `requestId` porque várias impressões podem ser disparadas em
// sequência antes da anterior responder.
function buildPrintResultScript(requestId: string, success: boolean, error?: string): string {
  return `
    (function () {
      window.dispatchEvent(
        new CustomEvent('native:print-result', {
          detail: {
            requestId: ${JSON.stringify(requestId)},
            success: ${JSON.stringify(success)},
            error: ${JSON.stringify(error ?? null)},
          },
        })
      );
    })();
    true;
  `;
}

// Navega o WebView pra rota que veio no `data.url` da notificação.
function buildOpenUrlScript(rawUrl: string, baseUrl: string): string {
  return `
    (function () {
      var href = ${buildResolvedUrlExpression(rawUrl, baseUrl)};
      if (href && href !== window.location.href) {
        window.location.href = href;
      }
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
  // Conta os loads em vez de um booleano: cada navegação de página zera o
  // `window` do PWA, então o push token precisa ser reinjetado a cada uma.
  const [loadCount, setLoadCount] = useState(0);
  const webViewLoaded = loadCount > 0;
  const [biometricToken, setBiometricToken] = useState<string | null>(null);
  const [restoreInjected, setRestoreInjected] = useState(false);
  // Vira `true` quando o fluxo de biometria termina de qualquer jeito (sem
  // token guardado, sem hardware, autenticou ou cancelou). O deep link da push
  // espera esse sinal pra saber se pode navegar sozinho.
  const [biometricSettled, setBiometricSettled] = useState(false);

  // Só pede notificação depois que o fluxo de câmera/microfone terminou, pra
  // não empilhar dois diálogos de permissão na cara do usuário.
  const { expoPushToken, pendingUrl, clearPendingUrl } = usePushNotifications({
    enabled: permissionsGranted,
  });

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
      } finally {
        setBiometricSettled(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!webViewLoaded || !biometricToken || restoreInjected) return;

    setRestoreInjected(true);
    webViewRef.current?.injectJavaScript(
      buildRestoreSessionScript(biometricToken, pendingUrl, source.url),
    );
    // O redirect do restore já leva pra URL da notificação; consumir aqui evita
    // o efeito de deep link navegar de novo por cima.
    if (pendingUrl) clearPendingUrl();
  }, [webViewLoaded, biometricToken, restoreInjected, pendingUrl, clearPendingUrl]);

  // Reinjeta o token a cada load: quem vincula ele ao usuário logado é o PWA,
  // e depois de um reload/navegação o global anterior já não existe mais.
  useEffect(() => {
    if (!webViewLoaded || !expoPushToken) return;
    webViewRef.current?.injectJavaScript(buildPushTokenScript(expoPushToken));
  }, [loadCount, webViewLoaded, expoPushToken]);

  // Deep link da notificação. No cold start a resposta chega antes do WebView
  // existir, então a URL fica pendente até o primeiro load terminar. Quando a
  // biometria vai restaurar a sessão, quem navega é o script de restore — aqui
  // a gente espera esse fluxo pra não carregar a rota ainda deslogado.
  useEffect(() => {
    if (!webViewLoaded || !pendingUrl || !biometricSettled) return;
    if (biometricToken && !restoreInjected) return;

    webViewRef.current?.injectJavaScript(
      buildOpenUrlScript(pendingUrl, source.url),
    );
    clearPendingUrl();
  }, [
    webViewLoaded,
    pendingUrl,
    biometricSettled,
    biometricToken,
    restoreInjected,
    clearPendingUrl,
  ]);

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
        onLoadEnd={() => setLoadCount((count) => count + 1)}
        onMessage={(event) => {
          let data: {
            type?: string;
            refreshToken?: string;
            requestId?: string;
            base64?: string;
          } | null = null;
          try {
            data = JSON.parse(event.nativeEvent.data);
          } catch {
            console.log("[WebView Message]:", event.nativeEvent.data);
            return;
          }

          if (data?.type === "AUTH_TOKENS" && typeof data.refreshToken === "string") {
            SecureStore.setItemAsync(REFRESH_TOKEN_KEY, data.refreshToken).catch((err) =>
              console.warn("[Biometria] Erro ao salvar token:", err),
            );
          } else if (data?.type === "AUTH_LOGOUT") {
            SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch((err) =>
              console.warn("[Biometria] Erro ao remover token:", err),
            );
          } else if (data?.type === "OPEN_PRINTER_PICKER") {
            router.push("/printer-picker");
          } else if (
            data?.type === "PRINT_ESCPOS" &&
            typeof data.requestId === "string" &&
            typeof data.base64 === "string"
          ) {
            const { requestId, base64 } = data;
            printEscPos(base64)
              .then(() => {
                webViewRef.current?.injectJavaScript(buildPrintResultScript(requestId, true));
              })
              .catch((err) => {
                console.warn("[Impressora] Erro ao imprimir:", err);
                webViewRef.current?.injectJavaScript(
                  buildPrintResultScript(
                    requestId,
                    false,
                    err instanceof Error ? err.message : "Erro desconhecido ao imprimir.",
                  ),
                );
              });
          } else {
            console.log("[WebView Message]:", event.nativeEvent.data);
          }
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
