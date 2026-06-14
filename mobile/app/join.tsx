import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { connectSocket } from '@/lib/socket';
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector';
import { Button, Input } from '@/components/ui';

export default function JoinScreen() {
  const { t } = useTranslation();

  const [code, setCode]                     = useState('');
  const [nickname, setNickname]             = useState('');
  const [language, setLanguage]             = useState('en');
  const [langWasAutoSet, setLangWasAutoSet] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [loading, setLoading]               = useState(false);
  const peekRef = useRef(false);

  useEffect(() => {
    if (code.length !== 6 || peekRef.current) return;
    peekRef.current = true;
    const socket = connectSocket();
    const doPeek = () => {
      socket.emit('room:peek', { code: code.toUpperCase() }, (res: any) => {
        if (res?.ok && res.guestDefaultLanguage) {
          setLanguage(res.guestDefaultLanguage);
          setLangWasAutoSet(true);
        }
      });
    };
    if (socket.connected) doPeek();
    else socket.once('connect', doPeek);
  }, [code]);

  useEffect(() => {
    if (code.length !== 6) peekRef.current = false;
  }, [code]);

  const handleJoin = () => {
    if (!code.trim())     { Alert.alert(t('join.errors.codeRequired')); return; }
    if (!nickname.trim()) { Alert.alert(t('join.errors.nickRequired')); return; }

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
                code:     res.room.code,
                nickname: nickname.trim(),
                language,
                roomName: res.room.name,
                isHost:   '0',
                mode:     res.room.config?.mode ?? 'normal',
              },
            });
          } else {
            Alert.alert(t('join.errors.notFound'), res.error ?? '');
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
        Alert.alert(t('common.error.network'));
      });
    }
  };

  const ready = code.length === 6;

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 pt-4 gap-8 pb-8">

            {/* Header */}
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="p-2 -ml-2">
                <Text className="text-muted text-2xl">←</Text>
              </Pressable>
              <Text className="text-white text-2xl font-bold">{t('join.title')}</Text>
            </View>

            {/* Form */}
            <View className="gap-5">
              <Input
                label={t('join.fields.code')}
                placeholder={t('join.fields.codePlaceholder')}
                value={code}
                onChangeText={v => setCode(v.toUpperCase().slice(0, 6))}
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect={false}
                autoFocus
                className="text-2xl tracking-widest text-center font-bold"
              />

              <Input
                label={t('join.fields.yourName')}
                placeholder={t('join.fields.yourNamePlaceholder')}
                value={nickname}
                onChangeText={setNickname}
                maxLength={30}
              />

              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text className="text-muted text-xs font-medium uppercase tracking-wider">
                    {t('join.fields.yourLanguage')}
                  </Text>
                  {langWasAutoSet && (
                    <Text className="text-primary text-xs">{t('join.fields.suggestedByHost')}</Text>
                  )}
                </View>
                <Pressable
                  onPress={() => setShowLangPicker(true)}
                  className="bg-card border border-border rounded-xl px-4 py-3.5 flex-row items-center justify-between"
                >
                  <Text className="text-white text-base">{t('join.fields.yourLanguageSub')}</Text>
                  <LanguageBadge code={language} />
                </Pressable>
              </View>
            </View>

            {/* CTA */}
            <Button
              onPress={handleJoin}
              loading={loading}
              disabled={!ready}
              variant={ready ? 'default' : 'secondary'}
              label={t('join.cta')}
              className="mt-auto"
              labelClassName={ready ? 'text-white' : 'text-muted'}
            />

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
