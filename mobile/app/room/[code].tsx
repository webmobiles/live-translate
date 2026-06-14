import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, Pressable, FlatList,
  KeyboardAvoidingView, Platform, Alert, Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import {
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { getSocket } from '@/lib/socket';
import { ParticipantList } from '@/components/ParticipantList';
import { MessageBubble } from '@/components/MessageBubble';
import { VoiceButton } from '@/components/VoiceButton';
import { LanguageSelector, LanguageBadge } from '@/components/LanguageSelector';
import type { Message, Participant, Room } from '@/types';

const MIN_VOICE_MESSAGE_DURATION_MS = 1000;

export default function RoomScreen() {
  const { code, nickname, language: initialLang, roomName, mode } = useLocalSearchParams<{
    code: string;
    nickname: string;
    language: string;
    roomName: string;
    mode: string;
  }>();

  const isSoloMode = mode === 'solo_multilang';

  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [myLanguage, setMyLanguage] = useState(initialLang ?? 'en');

  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordingRef = useRef<ReturnType<typeof useAudioRecorder> | null>(null);
  const recordingStartedAtRef = useRef(0);
  const listRef = useRef<FlatList>(null);
  const socketRef = useRef(getSocket());
  const mySocketId = useRef<string>('');

  // ── Socket setup ──────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = socketRef.current;
    mySocketId.current = socket.id ?? '';

    const onConnect = () => {
      setIsConnected(true);
      mySocketId.current = socket.id ?? '';
    };
    const onDisconnect = () => setIsConnected(false);

    const onParticipantsUpdated = ({ participants: p }: { participants: Participant[] }) => {
      setParticipants(p);
    };

    const onParticipantJoined = ({ participant }: { participant: Participant }) => {
      addSystemMsg(`${participant.nickname} joined (${participant.language.toUpperCase()})`);
    };

    const onParticipantLeft = ({ socketId }: { socketId: string }) => {
      setParticipants(prev => {
        const leaving = prev.find(p => p.socketId === socketId);
        if (leaving) addSystemMsg(`${leaving.nickname} left`);
        return prev.filter(p => p.socketId !== socketId);
      });
    };

    const onMessageTranslating = ({ id }: { id: string }) => {
      setMessages(prev => {
        if (prev.some(m => m.id === id)) return prev;
        return [...prev, {
          id, original: '…', translated: '…', sender: '', senderLang: myLanguage,
          targetLang: myLanguage, isMine: false, timestamp: Date.now(), isTranslating: true,
        }];
      });
    };

    const onMessageIncoming = (msg: Message) => {
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== msg.id);
        return [...filtered, { ...msg, isTranslating: false }];
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const onMessageError = ({ id }: { id: string }) => {
      setMessages(prev => prev.filter(m => m.id !== id));
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('room:participants-updated', onParticipantsUpdated);
    socket.on('room:participant-joined', onParticipantJoined);
    socket.on('room:participant-left', onParticipantLeft);
    socket.on('message:translating', onMessageTranslating);
    socket.on('message:incoming', onMessageIncoming);
    socket.on('message:error', onMessageError);

    setIsConnected(socket.connected);

    // Request audio permissions on mount
    requestRecordingPermissionsAsync().catch(() => {});
    setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    }).catch(() => {});

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('room:participants-updated', onParticipantsUpdated);
      socket.off('room:participant-joined', onParticipantJoined);
      socket.off('room:participant-left', onParticipantLeft);
      socket.off('message:translating', onMessageTranslating);
      socket.off('message:incoming', onMessageIncoming);
      socket.off('message:error', onMessageError);
    };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const addSystemMsg = (text: string) => {
    setMessages(prev => [...prev, {
      id: `sys-${Date.now()}`,
      original: text, translated: text,
      sender: 'system', senderLang: 'en', targetLang: 'en',
      isMine: false, timestamp: Date.now(), isTranslating: false,
    }]);
  };

  const sendText = useCallback(() => {
    const text = inputText.trim();
    if (!text || !isConnected) return;
    socketRef.current.emit('message:text', { text });
    setInputText('');
  }, [inputText, isConnected]);

  // ── Voice recording ───────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const { granted } = await getRecordingPermissionsAsync();
      if (!granted) {
        const { granted: g } = await requestRecordingPermissionsAsync();
        if (!g) { Alert.alert('Microphone permission required'); return; }
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
    } catch (err) {
      console.error('startRecording', err);
    }
  }, [recorder]);

  const stopAndSend = useCallback(async () => {
    if (!recordingRef.current) return;
    setIsRecording(false);
    try {
      const durationMs = recordingStartedAtRef.current ? Date.now() - recordingStartedAtRef.current : 0;
      await recordingRef.current.stop();
      const uri = recordingRef.current.uri;
      recordingRef.current = null;
      recordingStartedAtRef.current = 0;
      if (!uri) return;

      if (durationMs < MIN_VOICE_MESSAGE_DURATION_MS) {
        Alert.alert('Send voice at least 1 second duration.');
        await FileSystem.deleteAsync(uri, { idempotent: true });
        return;
      }

      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      socketRef.current.emit('message:audio', { audioBase64: base64, mimeType: 'audio/m4a', durationMs });

      await FileSystem.deleteAsync(uri, { idempotent: true });
    } catch (err) {
      console.error('stopAndSend', err);
      recordingRef.current = null;
      recordingStartedAtRef.current = 0;
    }
  }, []);

  // ── Copy room code ────────────────────────────────────────────────────────

  const copyCode = () => {
    Clipboard.setString(code);
    Alert.alert('Copied!', `Room code ${code} copied to clipboard`);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-bg">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-border gap-3">
        <Pressable onPress={() => router.back()} className="p-1">
          <Text className="text-muted text-xl">←</Text>
        </Pressable>

        <View className="flex-1">
          <Text className="text-white font-bold text-base" numberOfLines={1}>
            {roomName ?? code}
          </Text>
          <View className="flex-row items-center gap-2">
            {!isSoloMode && (
              <Pressable onPress={copyCode}>
                <Text className="text-accent text-xs font-mono font-bold">{code} 📋</Text>
              </Pressable>
            )}
            <View className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-accent' : 'bg-danger'}`} />
            <Text className="text-muted text-xs">{isConnected ? 'Live' : 'Reconnecting…'}</Text>
          </View>
        </View>

        <Pressable onPress={() => setShowLangPicker(true)}>
          <LanguageBadge code={myLanguage} onPress={() => setShowLangPicker(true)} />
        </Pressable>
      </View>

      {/* Participants */}
      <ParticipantList participants={participants} mySocketId={mySocketId.current} />

      {/* Messages */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => (
            item.sender === 'system'
              ? <View className="items-center my-2">
                  <Text className="text-muted text-xs bg-card px-3 py-1 rounded-full">{item.original}</Text>
                </View>
              : <MessageBubble message={item} />
          )}
          contentContainerStyle={{ padding: 16, flexGrow: 1, justifyContent: 'flex-end' }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center gap-3 py-20">
              <Text className="text-4xl">🌐</Text>
              <Text className="text-muted text-center text-sm px-8">
                Send a message or hold the mic button to speak.{'\n'}Everyone gets it in their own language.
              </Text>
            </View>
          }
        />

        {/* Input Bar */}
        <View className="flex-row items-end px-4 py-3 border-t border-border gap-3">
          <TextInput
            className="flex-1 bg-card border border-border rounded-2xl px-4 py-3 text-white text-base max-h-28"
            placeholder={`Message in ${myLanguage.toUpperCase()}…`}
            placeholderTextColor="#8A8AA3"
            value={inputText}
            onChangeText={setInputText}
            multiline
            returnKeyType="send"
            onSubmitEditing={sendText}
            blurOnSubmit={false}
            editable={isConnected}
          />

          {inputText.trim().length > 0 ? (
            <Pressable
              onPress={sendText}
              disabled={!isConnected}
              className="bg-primary rounded-full w-12 h-12 items-center justify-center active:opacity-80"
            >
              <Text className="text-white text-xl">↑</Text>
            </Pressable>
          ) : (
            <VoiceButton
              isRecording={isRecording}
              onPressIn={startRecording}
              onPressOut={stopAndSend}
              disabled={!isConnected}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      <LanguageSelector
        visible={showLangPicker}
        selected={myLanguage}
        onSelect={setMyLanguage}
        onClose={() => setShowLangPicker(false)}
      />
    </SafeAreaView>
  );
}
