import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserPrefs {
  nickname: string;
  motherLang: string;
  targetLang: string;
  avatarUri: string | null;
  uiLang: string;
}

const DEFAULTS: UserPrefs = {
  nickname: '',
  motherLang: 'en',
  targetLang: 'fr',
  avatarUri: null,
  uiLang: 'en',
};

const KEY = 'live_translate_user_prefs';

export async function loadPrefs(): Promise<UserPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function savePrefs(prefs: Partial<UserPrefs>): Promise<UserPrefs> {
  const current = await loadPrefs();
  const next = { ...current, ...prefs };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function useUserPrefs() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);

  useEffect(() => {
    loadPrefs().then(setPrefs);
  }, []);

  const update = useCallback(async (partial: Partial<UserPrefs>) => {
    const next = await savePrefs(partial);
    setPrefs(next);
    return next;
  }, []);

  return { prefs, update };
}
