import React from 'react';
import { View, Text, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui';
import { Card } from '@/components/ui';
import { loadPrefs, type UserPrefs } from '@/lib/userPrefs';

export default function HomeScreen() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);

  useFocusEffect(useCallback(() => {
    loadPrefs().then(setPrefs);
  }, []));

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
