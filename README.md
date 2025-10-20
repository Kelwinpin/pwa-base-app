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
├── assets/                  # Imagens e recursos
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
