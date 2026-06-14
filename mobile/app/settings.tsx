import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import { getLang } from '@/lib/languages';
import { loadPrefs, savePrefs } from '@/lib/userPrefs';
import { Input } from '@/components/ui';
import { Button } from '@/components/ui';
import { LanguageSelector } from '@/components/LanguageSelector';

const UI_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
];

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();

  const [nickname,   setNickname]   = useState('');
  const [motherLang, setMotherLang] = useState('en');
  const [targetLang, setTargetLang] = useState('fr');
  const [avatarUri,  setAvatarUri]  = useState<string | null>(null);
  const [uiLang,     setUiLang]     = useState(i18n.resolvedLanguage?.split('-')[0] ?? 'en');

  const [showMother,  setShowMother]  = useState(false);
  const [showTarget,  setShowTarget]  = useState(false);
  const [showUiLang,  setShowUiLang]  = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);

  useEffect(() => {
    loadPrefs().then(p => {
      setNickname(p.nickname);
      setMotherLang(p.motherLang);
      setTargetLang(p.targetLang);
      setAvatarUri(p.avatarUri);
      setUiLang(p.uiLang ?? i18n.resolvedLanguage?.split('-')[0] ?? 'en');
    });
  }, []);

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('settings.avatarPermission', 'Photo library access is required.'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      setAvatarUri(uri);
      await savePrefs({ avatarUri: uri });
    }
  };

  const handleSave = async () => {
    if (!nickname.trim()) {
      Alert.alert(t('create.errors.nickRequired'));
      return;
    }
    setSaving(true);
    try {
      await savePrefs({ nickname: nickname.trim(), motherLang, targetLang, uiLang });
      await i18n.changeLanguage(uiLang);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const motherInfo = getLang(motherLang);
  const targetInfo = getLang(targetLang);
  const uiLangInfo = UI_LANGUAGES.find(l => l.code === uiLang) ?? UI_LANGUAGES[0];

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, gap: 28 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="p-2 -ml-2">
            <Text className="text-muted text-2xl">←</Text>
          </Pressable>
          <Text className="text-white text-2xl font-bold">{t('settings.title')}</Text>
        </View>

        {/* Avatar */}
        <View className="items-center gap-3">
          <Pressable onPress={pickAvatar} className="relative">
            <View className="w-24 h-24 rounded-full overflow-hidden bg-card border-2 border-border items-center justify-center">
              {avatarUri
                ? <Image source={{ uri: avatarUri }} className="w-full h-full" resizeMode="cover" />
                : <Text className="text-5xl">👤</Text>
              }
            </View>
            <View className="absolute bottom-0 right-0 bg-primary rounded-full w-7 h-7 items-center justify-center">
              <Text className="text-white text-xs">✎</Text>
            </View>
          </Pressable>
          <Text className="text-muted text-xs">{t('settings.avatarHint')}</Text>
        </View>

        {/* Nickname */}
        <Input
          label={t('settings.nickname')}
          placeholder={t('settings.nicknamePlaceholder')}
          value={nickname}
          onChangeText={setNickname}
          maxLength={100}
          autoCorrect={false}
        />

        {/* Native language */}
        <View className="gap-1.5">
          <Text className="text-muted text-xs font-medium uppercase tracking-wider">
            {t('settings.motherLang')}
          </Text>
          <Pressable
            onPress={() => setShowMother(true)}
            className="bg-card border border-border rounded-xl px-4 py-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-3">
              <Text className="text-3xl">{motherInfo.flag}</Text>
              <View>
                <Text className="text-white font-medium">{motherInfo.name}</Text>
                <Text className="text-muted text-xs">{motherInfo.code.toUpperCase()}</Text>
              </View>
            </View>
            <Text className="text-muted text-sm">{t('common.change')}</Text>
          </Pressable>
        </View>

        {/* Target language */}
        <View className="gap-1.5">
          <Text className="text-muted text-xs font-medium uppercase tracking-wider">
            {t('settings.targetLang')}
          </Text>
          <Pressable
            onPress={() => setShowTarget(true)}
            className="bg-card border border-border rounded-xl px-4 py-4 flex-row items-center justify-between"
          >
            <View className="flex-row items-center gap-3">
              <Text className="text-3xl">{targetInfo.flag}</Text>
              <View>
                <Text className="text-white font-medium">{targetInfo.name}</Text>
                <Text className="text-muted text-xs">{targetInfo.code.toUpperCase()}</Text>
              </View>
            </View>
            <Text className="text-muted text-sm">{t('common.change')}</Text>
          </Pressable>
        </View>

        {/* App language */}
        <View className="gap-1.5">
          <Text className="text-muted text-xs font-medium uppercase tracking-wider">
            {t('settings.uiLanguage')}
          </Text>
          <Pressable
            onPress={() => setShowUiLang(true)}
            className="bg-card border border-border rounded-xl px-4 py-4 flex-row items-center justify-between"
          >
            <Text className="text-white font-medium">{uiLangInfo.name}</Text>
            <Text className="text-muted text-sm">{t('common.change')}</Text>
          </Pressable>
        </View>

        {/* Save */}
        <Button
          onPress={handleSave}
          disabled={saving || !nickname.trim()}
          size="lg"
          className="mt-2"
        >
          <Text className="text-white text-lg font-bold">
            {saving ? t('common.saving') : saved ? t('settings.saved') : t('settings.save')}
          </Text>
        </Button>

        <View className="h-4" />
      </ScrollView>

      <LanguageSelector
        visible={showMother}
        selected={motherLang}
        onSelect={lang => { setMotherLang(lang); setShowMother(false); }}
        onClose={() => setShowMother(false)}
      />
      <LanguageSelector
        visible={showTarget}
        selected={targetLang}
        onSelect={lang => { setTargetLang(lang); setShowTarget(false); }}
        onClose={() => setShowTarget(false)}
      />

      {/* UI language picker — reuses LanguageSelector with filtered list */}
      <UiLanguagePicker
        visible={showUiLang}
        selected={uiLang}
        onSelect={lang => { setUiLang(lang); setShowUiLang(false); }}
        onClose={() => setShowUiLang(false)}
      />
    </SafeAreaView>
  );
}

function UiLanguagePicker({
  visible, selected, onSelect, onClose,
}: { visible: boolean; selected: string; onSelect: (c: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <View className="absolute inset-0">
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <SafeAreaView className="bg-card rounded-t-3xl" edges={['bottom']}>
        <View className="items-center pt-3 pb-2">
          <View className="w-10 h-1 rounded-full bg-border" />
          <Text className="text-white text-lg font-semibold mt-3">{t('settings.uiLanguage')}</Text>
        </View>
        {UI_LANGUAGES.map(l => (
          <Pressable
            key={l.code}
            onPress={() => onSelect(l.code)}
            className={`flex-row items-center px-5 py-3.5 mx-3 mb-1 rounded-xl ${
              selected === l.code ? 'bg-primary-muted border border-primary' : ''
            }`}
          >
            <Text className={`text-base font-medium flex-1 ${selected === l.code ? 'text-primary' : 'text-white'}`}>
              {l.name}
            </Text>
            {selected === l.code && <Text className="text-primary text-lg">✓</Text>}
          </Pressable>
        ))}
        <View className="h-6" />
      </SafeAreaView>
    </View>
  );
}
