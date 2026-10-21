import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mindwatch.app',
  appName: 'MindWatch',
  webDir: 'dist',
  server: {
    androidScheme: 'http'
  }
};

export default config;
