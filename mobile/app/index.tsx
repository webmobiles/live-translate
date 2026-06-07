import React from 'react';
import { View, Text, Pressable, SafeAreaView } from 'react-native';
import { router } from 'expo-router';

export default function HomeScreen() {
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
            <Text className="text-muted text-base text-center">
              Real-time AI translation across languages
            </Text>
          </View>
        </View>

        {/* Powered by */}
        <View className="flex-row items-center justify-center gap-2 bg-card rounded-xl px-4 py-3 border border-border">
          <Text className="text-muted text-sm">Powered by</Text>
          <Text className="text-accent font-semibold text-sm">OpenAI GPT-4o-mini + Whisper</Text>
        </View>

        {/* Buttons */}
        <View className="gap-4">
          <Pressable
            onPress={() => router.push('/create')}
            className="bg-primary rounded-2xl py-4 items-center active:opacity-80"
          >
            <Text className="text-white text-lg font-bold">Create Room</Text>
            <Text className="text-white/60 text-sm mt-0.5">Start a new translation session</Text>
          </Pressable>

          <Pressable
            onPress={() => router.push('/join')}
            className="border-2 border-primary rounded-2xl py-4 items-center active:opacity-80"
          >
            <Text className="text-primary text-lg font-bold">Join Room</Text>
            <Text className="text-muted text-sm mt-0.5">Enter a room code to join</Text>
          </Pressable>
        </View>

        {/* Language chips */}
        <View className="flex-row flex-wrap gap-2 justify-center">
          {['🇺🇸 EN', '🇪🇸 ES', '🇫🇷 FR', '🇩🇪 DE', '🇨🇳 ZH', '🇯🇵 JA', '🇧🇷 PT', '🇷🇺 RU'].map(l => (
            <View key={l} className="bg-card border border-border px-3 py-1.5 rounded-full">
              <Text className="text-muted text-xs">{l}</Text>
            </View>
          ))}
          <View className="bg-card border border-border px-3 py-1.5 rounded-full">
            <Text className="text-muted text-xs">+8 more</Text>
          </View>
        </View>

      </View>
    </SafeAreaView>
  );
}
