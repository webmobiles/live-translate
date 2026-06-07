import React, { useRef, useEffect } from 'react';
import { Pressable, Animated, Text, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

interface Props {
  isRecording: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  disabled?: boolean;
}

export function VoiceButton({ isRecording, onPressIn, onPressOut, disabled }: Props) {
  const pulse = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.25, duration: 500, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      ).start();
      Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      pulse.stopAnimation();
      Animated.timing(pulse, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      Animated.timing(glow, { toValue: 0, duration: 150, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  const handlePressIn = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPressIn();
  };

  const handlePressOut = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPressOut();
  };

  return (
    <Animated.View style={{ transform: [{ scale: pulse }] }}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: isRecording ? '#FF4757' : '#7C6EFF',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text style={{ fontSize: 20 }}>{isRecording ? '⏹' : '🎤'}</Text>
      </Pressable>
    </Animated.View>
  );
}
