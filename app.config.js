import 'dotenv/config';

export default {
  expo: {
    name: "FermiToday",
    slug: "fermi-today",
    version: "0.7.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    plugins: [
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#6366f1",
          sounds: []
        }
      ]
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.scuola.fermitoday", // ← Changed to match Android
      infoPlist: {
        UIBackgroundModes: ["remote-notification"]
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#6366f1"
      },
      package: "com.scuola.fermitoday",
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      googleServicesFile: "./google-services.json",
      permissions: [
        "NOTIFICATIONS" 
      ],
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    extra: {
      backendUrl: process.env.BACKEND_URL,
      eas: {
        projectId: "80ad0eb0-cd57-4b36-bebd-10bb86061534", 
      }
    },
  },
};