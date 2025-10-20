import { router } from 'expo-router';
import { useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from "react-native-webview";
import source from '../config/url.json';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const touchX = useRef(0);
  const touchY = useRef(0);
  const customUserAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/102.0.5005.87 Mobile/15E148 Safari/604.1';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
        />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
