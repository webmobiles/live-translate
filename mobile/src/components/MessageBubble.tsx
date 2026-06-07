import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { getLang } from '@/lib/languages';
import type { Message } from '@/types';

interface Props {
  message: Message;
}

export function MessageBubble({ message }: Props) {
  const { isMine, sender, senderLang, translated, original, isTranslating, isAudio, timestamp } = message;
  const senderInfo = getLang(senderLang);
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (isTranslating) {
    return (
      <View className={`flex-row mb-3 ${isMine ? 'justify-end' : 'justify-start'}`}>
        <View className={`max-w-[75%] px-4 py-3 rounded-2xl ${isMine ? 'bg-primary rounded-br-sm' : 'bg-card rounded-bl-sm'}`}>
          <ActivityIndicator size="small" color={isMine ? '#fff' : '#7C6EFF'} />
        </View>
      </View>
    );
  }

  return (
    <View className={`mb-3 ${isMine ? 'items-end' : 'items-start'}`}>
      {!isMine && (
        <View className="flex-row items-center gap-1.5 mb-1 ml-1">
          <Text className="text-base">{senderInfo.flag}</Text>
          <Text className="text-muted text-xs font-medium">{sender}</Text>
        </View>
      )}

      <View className={`max-w-[78%] px-4 py-3 rounded-2xl ${
        isMine ? 'bg-primary rounded-br-sm' : 'bg-card rounded-bl-sm border border-border'
      }`}>
        {isAudio && (
          <Text className={`text-xs mb-1 ${isMine ? 'text-white/60' : 'text-muted'}`}>
            🎤 Voice
          </Text>
        )}
        <Text className={`text-base leading-relaxed ${isMine ? 'text-white' : 'text-white'}`}>
          {translated}
        </Text>
        {!isMine && translated !== original && (
          <Text className="text-muted text-xs mt-1.5 italic">{original}</Text>
        )}
      </View>

      <Text className="text-muted text-xs mt-1 mx-1">{time}</Text>
    </View>
  );
}
