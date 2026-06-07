import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { getLang } from '@/lib/languages';
import type { Participant } from '@/types';

interface Props {
  participants: Participant[];
  mySocketId?: string;
}

export function ParticipantList({ participants, mySocketId }: Props) {
  if (participants.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="border-b border-border"
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}
    >
      {participants.map(p => {
        const lang = getLang(p.language);
        const isMe = p.socketId === mySocketId;
        return (
          <View
            key={p.socketId}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-full border ${
              isMe ? 'bg-primary-muted border-primary' : 'bg-card border-border'
            }`}
          >
            <Text className="text-base">{lang.flag}</Text>
            <Text className={`text-sm font-medium ${isMe ? 'text-primary' : 'text-white'}`}>
              {p.nickname}
              {p.isHost ? ' 👑' : ''}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}
