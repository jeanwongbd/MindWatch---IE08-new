import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mindwatch.app',
  appName: 'MindWatch',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_mindwatch',
      iconColor: '#1B1B1A'
    }
  }
};

export default config;
