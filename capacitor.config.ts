import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.musafir.app',
  appName: 'Musafir',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#c4a882',
    },
    Geolocation: {
      permissions: [
        'accessCoarseLocation',
        'accessFineLocation',
        'accessBackgroundLocation',
      ],
    },
  },
};

export default config;
