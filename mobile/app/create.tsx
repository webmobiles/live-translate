import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { connectSocket } from '@/lib/socket';
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector';

export default function CreateScreen() {
  const [roomName, setRoomName] = useState('');
  const [nickname, setNickname] = useState('');
  const [language, setLanguage] = useState('en');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = () => {
    if (!nickname.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }

    setLoading(true);
    const socket = connectSocket();

    const doCreate = () => {
      socket.emit(
        'room:create',
        {
          name: roomName.trim() || undefined,
          nickname: nickname.trim(),
          language,
        },
        (res: { ok: boolean; code?: string; room?: any; error?: string }) => {
          setLoading(false);
          if (res.ok && res.code) {
            router.replace({
              pathname: '/room/[code]',
              params: {
                code: res.code,
                nickname: nickname.trim(),
                language,
                roomName: res.room?.name ?? res.code,
                isHost: '1',
              },
            });
          } else {
            Alert.alert('Error', res.error ?? 'Could not create room');
          }
        },
      );
    };

    if (socket.connected) {
      doCreate();
    } else {
      socket.once('connect', doCreate);
      socket.once('connect_error', () => {
        setLoading(false);
        Alert.alert('Connection failed', 'Could not reach the server. Check your network.');
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 pt-4 gap-8">

            {/* Header */}
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="p-2 -ml-2">
                <Text className="text-muted text-2xl">←</Text>
              </Pressable>
              <Text className="text-white text-2xl font-bold">Create Room</Text>
            </View>

            {/* Form */}
            <View className="gap-5">
              <View className="gap-2">
                <Text className="text-muted text-sm font-medium uppercase tracking-wider">Room Name (optional)</Text>
                <TextInput
                  className="bg-card border border-border rounded-xl px-4 py-3.5 text-white text-base"
                  placeholder="e.g. Team Meeting, Conference..."
                  placeholderTextColor="#8A8AA3"
                  value={roomName}
                  onChangeText={setRoomName}
                  maxLength={40}
                />
              </View>

              <View className="gap-2">
                <Text className="text-muted text-sm font-medium uppercase tracking-wider">Your Name</Text>
                <TextInput
                  className="bg-card border border-border rounded-xl px-4 py-3.5 text-white text-base"
                  placeholder="Enter your name"
                  placeholderTextColor="#8A8AA3"
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={30}
                  autoFocus
                />
              </View>

              <View className="gap-2">
                <Text className="text-muted text-sm font-medium uppercase tracking-wider">Your Language</Text>
                <Pressable
                  onPress={() => setShowLangPicker(true)}
                  className="bg-card border border-border rounded-xl px-4 py-3.5 flex-row items-center justify-between"
                >
                  <Text className="text-white text-base">I speak in…</Text>
                  <LanguageBadge code={language} />
                </Pressable>
              </View>
            </View>

            {/* Info */}
            <View className="bg-primary-muted border border-primary rounded-xl p-4 gap-2">
              <Text className="text-primary font-semibold">How it works</Text>
              <Text className="text-white/70 text-sm leading-relaxed">
                Share the room code with others. Each person selects their language.
                Messages are translated live by OpenAI — everyone reads in their own language.
              </Text>
            </View>

            {/* CTA */}
            <Pressable
              onPress={handleCreate}
              disabled={loading}
              className="bg-primary rounded-2xl py-4 items-center mt-auto mb-4 active:opacity-80"
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text className="text-white text-lg font-bold">Create Room</Text>
              }
            </Pressable>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LanguageSelector
        visible={showLangPicker}
        selected={language}
        onSelect={setLanguage}
        onClose={() => setShowLangPicker(false)}
      />
    </SafeAreaView>
  );
}
