import React from 'react';
import { View, Text, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Card } from '@/components/ui';
import { loadPrefs, type UserPrefs } from '@/lib/userPrefs';

WebBrowser.maybeCompleteAuthSession();

const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL ?? 'http://10.0.2.2:4000';
const AUTH_KEY = 'auth.googleSignedIn';
const AUTH_RETURN_URL = 'hellovia-translate://auth-callback';

export default function HomeScreen() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY).then(value => {
      setIsSignedIn(value === 'true');
    });
  }, []);

  useFocusEffect(useCallback(() => {
    loadPrefs().then(setPrefs);
  }, []));

  const signInWithGoogle = async () => {
    setIsSigningIn(true);
    setAuthError(null);

    const returnTo = AUTH_RETURN_URL;
    const authUrl = `${SERVER_URL}/auth/google?returnTo=${encodeURIComponent(returnTo)}`;

    try {
      const result = await WebBrowser.openAuthSessionAsync(authUrl, returnTo);
      if (result.type !== 'success') return;

      const callbackUrl = new URL(result.url);
      const error = callbackUrl.searchParams.get('error');
      if (error) {
        setAuthError(error);
        return;
      }

      await AsyncStorage.setItem(AUTH_KEY, 'true');
      setIsSignedIn(true);

      if (callbackUrl.searchParams.get('onboarding') === '1') {
        router.push('/settings');
      }
    } catch {
      setAuthError('oauth_failed');
    } finally {
      setIsSigningIn(false);
    }
  };

  if (isSignedIn === null) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="flex-1 items-center justify-center gap-4">
          <Text className="text-5xl">🌐</Text>
          <Text className="text-muted text-sm">{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isSignedIn) {
    return (
      <SafeAreaView className="flex-1 bg-bg">
        <View className="flex-1 px-6 justify-center gap-10">
          <View className="items-center gap-4">
            <View className="w-20 h-20 rounded-3xl bg-primary items-center justify-center">
              <Text className="text-4xl">🌐</Text>
            </View>
            <View className="items-center gap-1">
              <Text className="text-white text-3xl font-bold tracking-tight">LiveTranslate</Text>
              <Text className="text-muted text-sm text-center">{t('home.tagline')}</Text>
            </View>
          </View>

          <Card className="p-8 gap-6">
            <View className="items-center">
              <Text className="text-white text-xl font-semibold">{t('login.title')}</Text>
              <Text className="text-muted text-sm mt-1">{t('login.subtitle')}</Text>
            </View>

            {authError && (
              <View className="bg-danger/10 border border-danger rounded-xl px-4 py-3">
                <Text className="text-danger text-sm text-center">
                  {t(`login.error.${authError}`, t('login.error.oauth_failed'))}
                </Text>
              </View>
            )}

            <Button
              variant="secondary"
              onPress={signInWithGoogle}
              loading={isSigningIn}
              className="bg-white border-gray-200 py-3.5"
            >
              <View className="h-6 w-6 rounded-full bg-white items-center justify-center">
                <Text className="text-lg font-bold text-gray-700">G</Text>
              </View>
              <Text className="text-gray-800 font-semibold">{t('login.continueWithGoogle')}</Text>
            </Button>

            <Text className="text-muted text-xs text-center leading-relaxed">
              {t('login.terms')}
            </Text>
          </Card>

          <Text className="text-muted text-xs text-center">
            {t('login.noAccount')}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 px-6 justify-center gap-8">

        {/* Logo */}
        <View className="items-center gap-4">
          <View className="w-24 h-24 rounded-3xl bg-primary-muted border border-primary items-center justify-center">
            <Text className="text-5xl">🌐</Text>
          </View>
          <View className="items-center gap-1">
            <Text className="text-white text-4xl font-bold tracking-tight">LiveTranslate</Text>
            <Text className="text-muted text-base text-center">{t('home.tagline')}</Text>
          </View>
        </View>

        {/* User bar */}
        <Card className="flex-row items-center justify-between px-4 py-3">
          <View className="flex-row items-center gap-3 flex-1 min-w-0">
            {prefs?.avatarUri
              ? <Image source={{ uri: prefs.avatarUri }} className="w-8 h-8 rounded-full" resizeMode="cover" />
              : <Text className="text-2xl">👤</Text>
            }
            <Text className="text-white text-sm font-medium flex-shrink" numberOfLines={1}>
              {prefs?.nickname || t('settings.nicknamePlaceholder')}
            </Text>
          </View>
          <Button
            variant="ghost"
            size="icon"
            onPress={() => router.push('/settings')}
            className="ml-2"
          >
            <Text className="text-muted text-xl">⚙</Text>
          </Button>
        </Card>

        {/* Powered by */}
        <Card className="flex-row items-center justify-center gap-2 px-4 py-3">
          <Text className="text-muted text-sm">{t('home.poweredBy')}</Text>
          <Text className="text-accent font-semibold text-sm">OpenAI GPT-4o-mini + Whisper</Text>
        </Card>

        {/* Buttons */}
        <View className="gap-4">
          <Button
            onPress={() => router.push('/create')}
            className="items-center"
          >
            <Text className="text-white text-lg font-bold">{t('home.createRoom')}</Text>
            <Text className="text-white/60 text-sm mt-0.5">{t('home.createRoomSub')}</Text>
          </Button>

          <Button
            variant="outline"
            onPress={() => router.push('/join')}
            className="border-2 border-primary items-center"
          >
            <Text className="text-primary text-lg font-bold">{t('home.joinRoom')}</Text>
            <Text className="text-muted text-sm mt-0.5">{t('home.joinRoomSub')}</Text>
          </Button>
        </View>

        {/* Language chips */}
        <View className="flex-row flex-wrap gap-2 justify-center">
          {['🇺🇸 EN', '🇪🇸 ES', '🇫🇷 FR', '🇩🇪 DE', '🇨🇳 ZH', '🇯🇵 JA', '🇧🇷 PT', '🇷🇺 RU'].map(l => (
            <View key={l} className="bg-card border border-border px-3 py-1.5 rounded-full">
              <Text className="text-muted text-xs">{l}</Text>
            </View>
          ))}
          <View className="bg-card border border-border px-3 py-1.5 rounded-full">
            <Text className="text-muted text-xs">+13 more</Text>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}
