import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { LANGUAGES, getLang, type Language } from '@/lib/languages';

interface Props {
  visible: boolean;
  selected: string;
  onSelect: (code: string) => void;
  onClose: () => void;
}

export function LanguageSelector({ visible, selected, onSelect, onClose }: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable className="flex-1 bg-black/60" onPress={onClose} />
      <SafeAreaView className="bg-card rounded-t-3xl">
        <View className="items-center pt-3 pb-2">
          <View className="w-10 h-1 rounded-full bg-border" />
          <Text className="text-white text-lg font-semibold mt-3">Select Language</Text>
        </View>
        <FlatList
          data={LANGUAGES}
          keyExtractor={l => l.code}
          style={{ maxHeight: 420 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { onSelect(item.code); onClose(); }}
              className={`flex-row items-center px-5 py-3.5 mx-3 mb-1 rounded-xl ${
                selected === item.code ? 'bg-primary-muted border border-primary' : ''
              }`}
            >
              <Text className="text-2xl mr-3">{item.flag}</Text>
              <View className="flex-1">
                <Text className="text-white font-medium">{item.name}</Text>
                <Text className="text-muted text-sm">{item.nativeName}</Text>
              </View>
              {selected === item.code && (
                <Text className="text-primary text-lg">✓</Text>
              )}
            </Pressable>
          )}
        />
        <View className="h-6" />
      </SafeAreaView>
    </Modal>
  );
}

interface BadgeProps {
  code: string;
  onPress?: () => void;
}

export function LanguageBadge({ code, onPress }: BadgeProps) {
  const lang = getLang(code);
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-1.5 bg-primary-muted border border-primary px-3 py-1.5 rounded-full"
    >
      <Text className="text-base">{lang.flag}</Text>
      <Text className="text-primary font-semibold text-sm">{lang.name}</Text>
      {onPress && <Text className="text-primary text-xs ml-0.5">▾</Text>}
    </Pressable>
  );
}
