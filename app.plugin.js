const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Plugin para adicionar features de câmera e microfone no AndroidManifest
 * para uso do WebView
 */
const withWebViewPermissions = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Adiciona uses-feature para câmera e áudio
    if (!androidManifest.manifest['uses-feature']) {
      androidManifest.manifest['uses-feature'] = [];
    }

    const features = [
      {
        $: {
          'android:name': 'android.hardware.camera',
          'android:required': 'false',
        },
      },
      {
        $: {
          'android:name': 'android.hardware.camera.autofocus',
          'android:required': 'false',
        },
      },
      {
        $: {
          'android:name': 'android.hardware.microphone',
          'android:required': 'false',
        },
      },
    ];

    // Verifica se já existe antes de adicionar
    features.forEach((feature) => {
      const exists = androidManifest.manifest['uses-feature'].some(
        (f) => f.$['android:name'] === feature.$['android:name']
      );
      if (!exists) {
        androidManifest.manifest['uses-feature'].push(feature);
      }
    });

    return config;
  });
};

module.exports = withWebViewPermissions;
