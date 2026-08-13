import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

// Precisa bater com o `defaultChannel` do plugin expo-notifications no app.json:
// no Android é esse canal que define som, vibração e importância das push.
const ANDROID_CHANNEL_ID = "default";

// Com o app em primeiro plano o Android/iOS não mostram a notificação sozinhos —
// quem decide é esse handler.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: "Notificações",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2a5580",
    });
  }

  // Emulador/simulador não recebe push remota — nem adianta pedir token.
  if (!Device.isDevice) {
    console.warn("[Push] Push remota só funciona em dispositivo físico");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;

  if (status !== "granted") {
    const request = await Notifications.requestPermissionsAsync();
    status = request.status;
  }

  if (status !== "granted") {
    console.warn("[Push] Permissão de notificação negada");
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn(
      "[Push] projectId da EAS não encontrado em extra.eas.projectId",
    );
    return null;
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });

  // Em dev o token aparece no terminal do `expo start` — é por onde se testa a
  // push antes do PWA estar registrando o token no backend.
  if (__DEV__) console.log("[Push] Expo push token:", token.data);

  return token.data;
}

type UsePushNotificationsOptions = {
  /**
   * Só registra quando for `true`. Serve pra não empilhar o diálogo de
   * notificação em cima do de câmera/microfone.
   */
  enabled?: boolean;
};

type UsePushNotifications = {
  /** ExpoPushToken[...] — o que o backend usa pra disparar via exp.host. */
  expoPushToken: string | null;
  /** `data.url` da notificação que o usuário tocou, ainda não consumida. */
  pendingUrl: string | null;
  clearPendingUrl: () => void;
};

export function usePushNotifications({
  enabled = true,
}: UsePushNotificationsOptions = {}): UsePushNotifications {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [consumedResponseId, setConsumedResponseId] = useState<string | null>(
    null,
  );

  // Cobre também o cold start: se o app foi aberto pela notificação, a resposta
  // que o lançou vem por aqui já no primeiro render.
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    registerForPushNotificationsAsync()
      .then((token) => {
        if (!cancelled) setExpoPushToken(token);
      })
      .catch((err) => console.warn("[Push] Erro ao registrar token:", err));

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  useEffect(() => {
    if (!lastResponse) return;

    const responseId = lastResponse.notification.request.identifier;
    if (responseId === consumedResponseId) return;

    const data = lastResponse.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    const url = data?.url;

    setConsumedResponseId(responseId);
    if (typeof url === "string" && url.length > 0) {
      setPendingUrl(url);
    }
  }, [lastResponse, consumedResponseId]);

  const clearPendingUrl = useCallback(() => setPendingUrl(null), []);

  return { expoPushToken, pendingUrl, clearPendingUrl };
}
