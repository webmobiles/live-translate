import React, { useState } from 'react';
import { View, Text, Pressable, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { connectSocket } from '@/lib/socket';
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector';
import { Button, Input, Card } from '@/components/ui';
import type { RoomConfig } from '@/types';

type RoomMode = 'normal' | 'solo_multilang'

export default function CreateScreen() {
  const { t } = useTranslation();

  const [roomMode, setRoomMode]     = useState<RoomMode>('normal');
  const [roomName, setRoomName]     = useState('');
  const [nickname, setNickname]     = useState('');
  const [language, setLanguage]     = useState('en');
  const [guestLang, setGuestLang]   = useState('en');
  const [soloLangA, setSoloLangA]   = useState('es');
  const [soloLangB, setSoloLangB]   = useState('en');
  const [showLangPicker, setShowLangPicker]       = useState(false);
  const [showGuestPicker, setShowGuestPicker]     = useState(false);
  const [showSoloPickerA, setShowSoloPickerA]     = useState(false);
  const [showSoloPickerB, setShowSoloPickerB]     = useState(false);
  const [loading, setLoading] = useState(false);

  const isSolo = roomMode === 'solo_multilang';

  const handleCreate = () => {
    if (!isSolo && !nickname.trim()) {
      Alert.alert(t('create.errors.nickRequired'));
      return;
    }
    if (isSolo && soloLangA === soloLangB) {
      Alert.alert(t('create.errors.sameLang'));
      return;
    }

    setLoading(true);
    const socket = connectSocket();

    const fullConfig: RoomConfig = {
      mode: roomMode,
      soloLanguages: isSolo ? [soloLangA, soloLangB] : null,
      guestDefaultLanguage: isSolo ? null : guestLang,
      input: { text: true, voice: true },
      voicePipeline: 'stt-text-translate',
      output: { translatedText: true, translatedAudio: false },
    };

    const doCreate = () => {
      socket.emit(
        'room:create',
        {
          name:     isSolo ? undefined : (roomName.trim() || undefined),
          nickname: isSolo ? 'Solo'    : nickname.trim(),
          language: isSolo ? soloLangB : language,
          config:   fullConfig,
        },
        (res: { ok: boolean; code?: string; room?: any; error?: string }) => {
          setLoading(false);
          if (res.ok && res.code) {
            router.replace({
              pathname: '/room/[code]',
              params: {
                code:     res.code,
                nickname: isSolo ? 'Solo' : nickname.trim(),
                language: isSolo ? soloLangB : language,
                roomName: res.room?.name ?? res.code,
                isHost:   '1',
              },
            });
          } else {
            Alert.alert(t('common.error.generic'), res.error ?? '');
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
        Alert.alert(t('common.error.network'));
      });
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1">
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View className="flex-1 px-6 pt-4 gap-7 pb-8">

            {/* Header */}
            <View className="flex-row items-center gap-3">
              <Pressable onPress={() => router.back()} className="p-2 -ml-2">
                <Text className="text-muted text-2xl">←</Text>
              </Pressable>
              <Text className="text-white text-2xl font-bold">{t('create.title')}</Text>
            </View>

            {/* Mode selector */}
            <View className="gap-2">
              <Text className="text-muted text-xs font-medium uppercase tracking-wider">{t('create.roomType')}</Text>
              <View className="flex-row gap-2">
                <Pressable
                  onPress={() => setRoomMode('normal')}
                  className={`flex-1 items-center gap-2 px-3 py-4 rounded-xl border ${
                    !isSolo ? 'bg-primary-muted border-primary' : 'bg-card border-border'
                  }`}
                >
                  <Text className="text-2xl">👥</Text>
                  <Text className={`text-xs font-semibold ${!isSolo ? 'text-primary' : 'text-white'}`}>
                    {t('create.mode.normal')}
                  </Text>
                  <Text className="text-xs text-muted text-center leading-snug">{t('create.mode.normalSub')}</Text>
                </Pressable>

                <Pressable
                  onPress={() => setRoomMode('solo_multilang')}
                  className={`flex-1 items-center gap-2 px-3 py-4 rounded-xl border ${
                    isSolo ? 'bg-primary-muted border-primary' : 'bg-card border-border'
                  }`}
                >
                  <Text className="text-2xl">🔄</Text>
                  <Text className={`text-xs font-semibold ${isSolo ? 'text-primary' : 'text-white'}`}>
                    {t('create.mode.solo')}
                  </Text>
                  <Text className="text-xs text-muted text-center leading-snug">{t('create.mode.soloSub')}</Text>
                </Pressable>
              </View>
            </View>

            {/* Normal mode fields */}
            {!isSolo && (
              <View className="gap-5">
                <Input
                  label={t('create.fields.roomName')}
                  placeholder={t('create.fields.roomNamePlaceholder')}
                  value={roomName}
                  onChangeText={setRoomName}
                  maxLength={40}
                />

                <Input
                  label={t('create.fields.yourName')}
                  placeholder={t('create.fields.yourNamePlaceholder')}
                  value={nickname}
                  onChangeText={setNickname}
                  maxLength={30}
                  autoFocus
                />

                <View className="gap-1.5">
                  <Text className="text-muted text-xs font-medium uppercase tracking-wider">
                    {t('create.fields.yourLanguage')}
                  </Text>
                  <Pressable
                    onPress={() => setShowLangPicker(true)}
                    className="bg-card border border-border rounded-xl px-4 py-3.5 flex-row items-center justify-between"
                  >
                    <Text className="text-white text-base">{t('create.fields.yourLanguageSub')}</Text>
                    <LanguageBadge code={language} />
                  </Pressable>
                </View>

                <View className="gap-1.5">
                  <Text className="text-muted text-xs font-medium uppercase tracking-wider">
                    {t('create.fields.guestLanguage')}
                  </Text>
                  <Pressable
                    onPress={() => setShowGuestPicker(true)}
                    className="bg-card border border-border rounded-xl px-4 py-3.5 flex-row items-center justify-between"
                  >
                    <Text className="text-white/70 text-base">{t('create.fields.guestLanguageSub')}</Text>
                    <LanguageBadge code={guestLang} />
                  </Pressable>
                  <Text className="text-muted text-xs">{t('create.fields.guestLanguageHint')}</Text>
                </View>
              </View>
            )}

            {/* Solo mode language pair */}
            {isSolo && (
              <View className="gap-3">
                <Text className="text-muted text-xs font-medium uppercase tracking-wider">
                  {t('create.fields.soloLanguages')}
                </Text>
                <View className="flex-row items-center gap-3">
                  <Pressable
                    onPress={() => setShowSoloPickerA(true)}
                    className="flex-1 bg-card border border-border rounded-xl px-4 py-4 items-center gap-2"
                  >
                    <Text className="text-xs text-muted uppercase tracking-wider">{t('create.fields.personA')}</Text>
                    <LanguageBadge code={soloLangA} />
                  </Pressable>
                  <Text className="text-2xl text-muted">⇄</Text>
                  <Pressable
                    onPress={() => setShowSoloPickerB(true)}
                    className="flex-1 bg-card border border-border rounded-xl px-4 py-4 items-center gap-2"
                  >
                    <Text className="text-xs text-muted uppercase tracking-wider">{t('create.fields.personB')}</Text>
                    <LanguageBadge code={soloLangB} />
                  </Pressable>
                </View>
                {soloLangA === soloLangB && (
                  <Text className="text-danger text-sm text-center">{t('create.errors.sameLang')}</Text>
                )}
              </View>
            )}

            {/* Info box */}
            <Card className="p-4 bg-primary-muted border-primary gap-2">
              <Text className="text-primary font-semibold">
                {isSolo ? t('create.info.soloTitle') : t('create.info.normalTitle')}
              </Text>
              <Text className="text-white/70 text-sm leading-relaxed">
                {isSolo ? t('create.info.soloBody') : t('create.info.normalBody')}
              </Text>
            </Card>

            {/* CTA */}
            <Button
              onPress={handleCreate}
              loading={loading}
              disabled={isSolo && soloLangA === soloLangB}
              label={t('create.cta')}
              className="mt-auto"
            />

          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <LanguageSelector visible={showLangPicker} selected={language}
        onSelect={setLanguage} onClose={() => setShowLangPicker(false)} />
      <LanguageSelector visible={showGuestPicker} selected={guestLang}
        onSelect={lang => { setGuestLang(lang); setShowGuestPicker(false); }}
        onClose={() => setShowGuestPicker(false)} />
      <LanguageSelector visible={showSoloPickerA} selected={soloLangA}
        onSelect={lang => { setSoloLangA(lang); setShowSoloPickerA(false); }}
        onClose={() => setShowSoloPickerA(false)} />
      <LanguageSelector visible={showSoloPickerB} selected={soloLangB}
        onSelect={lang => { setSoloLangB(lang); setShowSoloPickerB(false); }}
        onClose={() => setShowSoloPickerB(false)} />
    </SafeAreaView>
  );
}
