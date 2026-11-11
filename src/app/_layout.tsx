import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from "@expo-google-fonts/outfit";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { font, palette } from "@/theme";
import { startAccountSync } from "@/sync/account";
import { installWebHead } from "@/lib/webHead";

installWebHead();

export default function RootLayout() {
  const [loaded] = useFonts({
    [font.regular]: Outfit_400Regular,
    [font.medium]: Outfit_500Medium,
    [font.semiBold]: Outfit_600SemiBold,
    [font.bold]: Outfit_700Bold,
  });

  useEffect(() => {
    startAccountSync();
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.bgMenu }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: palette.bgPlay },
            animation: "fade",
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="play" />
          <Stack.Screen name="zen" />
          <Stack.Screen name="endless" />
          <Stack.Screen name="community" />
          <Stack.Screen name="account" />
          <Stack.Screen name="about" />
          <Stack.Screen name="support" />
          <Stack.Screen name="gallery" />
          <Stack.Screen name="stats" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="studio" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
