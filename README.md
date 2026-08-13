# PWA Base App

Um aplicativo mobile wrapper construído com React Native e Expo que permite transformar qualquer website em um aplicativo nativo para iOS e Android.

## O que é este projeto?

Este é um aplicativo baseado em WebView que carrega um website dentro de um container nativo. Perfeito para transformar PWAs (Progressive Web Apps) ou sites responsivos em aplicativos mobile distribuíveis nas lojas de aplicativos.

### Recursos

- WebView otimizada com suporte a JavaScript
- Navegação por gestos (swipe para voltar no Android)
- Respeita as áreas seguras do dispositivo (status bar, notch, etc.)
- User Agent customizável
- Suporte para conteúdo misto (HTTP/HTTPS)
- Push notifications nativas entregues ao PWA (ver seção abaixo)
- Compatível com iOS, Android e Web

## Configuração

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar a URL do seu website

Edite o arquivo `app/(stack)/url.json` e altere a URL para o seu website:

```json
{
    "url": "https://seu-site.com"
}
```

### 3. Iniciar o servidor de desenvolvimento

```bash
npm start
```

ou com cache limpo:

```bash
npx expo start --clear
```

### 4. Testar o aplicativo

No terminal, você verá opções para abrir o app em:

- **Desenvolvimento local**: Escaneie o QR code com Expo Go (iOS/Android)
- **Emulador Android**: Pressione `a`
- **Simulador iOS**: Pressione `i` (apenas macOS)
- **Web**: Pressione `w`

## Estrutura do Projeto

```
pwa-base-app/
├── app/
│   ├── config/
│   │   └── url.json         # Configuração da URL do site
│   ├── (stack)/
│   │   ├── index.tsx        # Tela principal com WebView
│   │   └── _layout.tsx      # Layout do grupo de rotas
│   └── _layout.tsx          # Layout raiz da aplicação
├── hooks/
│   └── usePushNotifications.ts  # Permissão, token e deep link das push
├── assets/                  # Imagens e recursos
├── google-services.json     # Config do Firebase (FCM) para Android
├── package.json
└── README.md
```

## Personalização

### Alterar o User Agent

Edite o arquivo `app/(stack)/index.tsx` e modifique a variável `customUserAgent`:

```typescript
const customUserAgent = 'Seu User Agent personalizado';
```

### Desabilitar navegação por gestos

No arquivo `app/(stack)/index.tsx`, remova ou comente as props `onTouchStart` e `onTouchEnd` do componente `WebView`.

### Adicionar splash screen ou ícone

1. Adicione suas imagens em `assets/images/`
2. Configure em `app.json` ou `app.config.js`

## Scripts Disponíveis

- `npm start` - Inicia o servidor de desenvolvimento
- `npm run android` - Abre no emulador Android
- `npm run ios` - Abre no simulador iOS (apenas macOS)
- `npm run web` - Abre no navegador web
- `npm run lint` - Executa o linter

## Push Notifications

O app usa `expo-notifications` com o **Expo Push Service**: o nativo pega um
`ExpoPushToken`, entrega pro PWA dentro do WebView, e o PWA vincula esse token ao
usuário logado. O disparo é feito pelo backend contra o `exp.host`.

> Push remota **não funciona no Expo Go nem em emulador** — precisa de um dev
> build (`npm run android`) ou de um build da EAS num aparelho físico.

### Credenciais (uma vez por projeto)

1. **Android** — o `google-services.json` do projeto Firebase fica na raiz do
   repo e é referenciado por `android.googleServicesFile` no `app.json`. Além
   dele, suba a chave de service account FCM V1 pra EAS:

   ```bash
   eas credentials --platform android   # → Push Notifications: FCM V1 → upload do JSON da service account
   ```

   A service account sai no Firebase Console em
   *Configurações do projeto → Contas de serviço → Gerar nova chave privada*.

2. **iOS** — não precisa de Firebase. Basta a APNs Key na EAS:

   ```bash
   eas credentials --platform ios       # → Push Notifications: Manage your Apple Push Notifications Key
   ```

### Contrato com o PWA

Assim que o token existe, o nativo injeta no WebView (a cada carregamento de
página):

```js
window.__EXPO_PUSH_TOKEN__ = 'ExponentPushToken[xxxxxxxx]';
window.__NATIVE_PLATFORM__ = 'android' | 'ios';
window.dispatchEvent(new CustomEvent('expo:push-token', { detail: { token, platform } }));
```

Do lado do PWA, registrar o token junto do usuário autenticado:

```js
function registerPushToken({ token, platform }) {
  return fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform }),
  });
}

// cobre o caso do token já estar disponível antes do listener existir
if (window.__EXPO_PUSH_TOKEN__) {
  registerPushToken({
    token: window.__EXPO_PUSH_TOKEN__,
    platform: window.__NATIVE_PLATFORM__,
  });
}

window.addEventListener('expo:push-token', (event) => registerPushToken(event.detail));
```

Vale enviar de novo a cada login (o token é do device, o vínculo é do usuário) e
apagar o vínculo no logout.

### Disparando uma notificação

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H 'Content-Type: application/json' \
  -d '{
    "to": "ExponentPushToken[xxxxxxxx]",
    "title": "Novo pedido",
    "body": "Fulano fez um pedido de R$ 42,00",
    "channelId": "default",
    "data": { "url": "/painel/pedidos/123" }
  }'
```

O `data.url` é opcional: quando presente, tocar na notificação leva o WebView
pra essa rota (inclusive com o app fechado). URLs fora da origem configurada em
`app/config/url.json` são ignoradas.

## Build para Produção

### Android (APK/AAB)

```bash
eas build --platform android
```

### iOS (IPA)

```bash
eas build --platform ios
```

Você precisará configurar o [EAS Build](https://docs.expo.dev/build/setup/) primeiro.

## Tecnologias Utilizadas

- [Expo](https://expo.dev) - Framework para React Native
- [Expo Router](https://docs.expo.dev/router/introduction/) - Roteamento baseado em arquivos
- [React Native WebView](https://github.com/react-native-webview/react-native-webview) - Componente WebView
- [React Native Safe Area Context](https://github.com/th3rdwave/react-native-safe-area-context) - Gerenciamento de áreas seguras
- TypeScript - Tipagem estática

## Requisitos

- Node.js 18+
- npm ou yarn
- Expo CLI
- Para iOS: macOS com Xcode
- Para Android: Android Studio

## Solução de Problemas

### WebView não carrega

1. Verifique se a URL em `url.json` está correta
2. Certifique-se de que o site permite ser carregado em iframe
3. Verifique a conexão com a internet

### Erro de tipos do TypeScript

```bash
npm install --save-dev @types/react-native
```

### Cache corrompido

```bash
rm -rf node_modules
npm install
npx expo start --clear
```

## Licença

Este projeto está sob a licença MIT.

## Suporte

Para questões e suporte:
- [Documentação do Expo](https://docs.expo.dev/)
- [Comunidade Expo no Discord](https://chat.expo.dev)
