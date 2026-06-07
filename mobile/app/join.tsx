import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { connectSocket } from '@/lib/socket';
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector';

export default function JoinScreen() {
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [language, setLanguage] = useState('en');
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleJoin = () => {
    if (!code.trim()) { Alert.alert('Room code required', 'Please enter the 6-character room code.'); return; }
    if (!nickname.trim()) { Alert.alert('Name required', 'Please enter your name.'); return; }

    setLoading(true);
    const socket = connectSocket();

    const doJoin = () => {
      socket.emit(
        'room:join',
        { code: code.trim().toUpperCase(), nickname: nickname.trim(), language },
        (res: { ok: boolean; room?: any; error?: string }) => {
          setLoading(false);
          if (res.ok && res.room) {
            router.replace({
              pathname: '/room/[code]',
              params: {
                code: res.room.code,
                nickname: nickname.trim(),
                language,
                roomName: res.room.name,
                isHost: '0',
              },
            });
          } else {
            Alert.alert('Cannot join', res.error ?? 'Room not found. Check the code.');
          }
        },
      );
    };

    if (socket.connected) {
      doJoin();
    } else {
      socket.once('connect', doJoin);
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
              <Text className="text-white text-2xl font-bold">Join Room</Text>
            </View>

            {/* Form */}
            <View className="gap-5">
              <View className="gap-2">
                <Text className="text-muted text-sm font-medium uppercase tracking-wider">Room Code</Text>
                <TextInput
                  className="bg-card border border-border rounded-xl px-4 py-3.5 text-white text-2xl tracking-widest text-center font-bold"
                  placeholder="ABC123"
                  placeholderTextColor="#8A8AA3"
                  value={code}
                  onChangeText={t => setCode(t.toUpperCase())}
                  maxLength={6}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
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
                />
              </View>

              <View className="gap-2">
                <Text className="text-muted text-sm font-medium uppercase tracking-wider">Your Language</Text>
                <Pressable
                  onPress={() => setShowLangPicker(true)}
                  className="bg-card border border-border rounded-xl px-4 py-3.5 flex-row items-center justify-between"
                >
                  <Text className="text-white text-base">I want to read in…</Text>
                  <LanguageBadge code={language} />
                </Pressable>
              </View>
            </View>

            {/* CTA */}
            <Pressable
              onPress={handleJoin}
              disabled={loading || code.length < 6}
              className={`rounded-2xl py-4 items-center mt-auto mb-4 active:opacity-80 ${
                code.length === 6 ? 'bg-primary' : 'bg-card border border-border'
              }`}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text className={`text-lg font-bold ${code.length === 6 ? 'text-white' : 'text-muted'}`}>
                    Join Room
                  </Text>
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
