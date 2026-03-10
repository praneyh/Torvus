import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDatabase } from '../schema';
import { seedPresetSplits, seedFoods, seedCardioExercises } from '../src/db/seeds';
import { supabase } from '../src/lib/supabase';
import { pullAllData } from '../src/lib/sync';

export default function RootLayout() {
  const [isReady, setIsReady]       = useState(false);
  const [pendingRoute, setPendingRoute] = useState<string | null>(null);
  const initDone = useRef(false);

  // Navigate only after Stack is mounted (isReady + pendingRoute both set)
  useEffect(() => {
    if (isReady && pendingRoute) {
      router.replace(pendingRoute as any);
    }
  }, [isReady, pendingRoute]);

  // ── Initial setup ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      let route = '/auth';
      try {
        const db = await getDatabase();
        await seedPresetSplits(db);
        await seedFoods(db);
        await seedCardioExercises(db);

        // Timeout wrapper so a slow Supabase call doesn't block forever
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<null>(res => setTimeout(() => res(null), 5000)),
        ]);

        const session = (sessionResult as any)?.data?.session ?? null;

        if (!session) {
          route = '/auth';
        } else {
          const userId = session.user.id;
          const prefs = await db.getFirstAsync<{
            onboarding_complete: number;
            supabase_user_id: string | null;
          }>(`SELECT onboarding_complete, supabase_user_id FROM user_preferences WHERE id = 1`);

          const storedId = prefs?.supabase_user_id ?? null;

          if (!storedId || storedId !== userId) {
            await pullAllData(db, userId).catch(console.error);
            await db.runAsync(
              `UPDATE user_preferences SET supabase_user_id = ? WHERE id = 1`,
              [userId]
            );
          }

          const freshPrefs = await db.getFirstAsync<{ onboarding_complete: number }>(
            `SELECT onboarding_complete FROM user_preferences WHERE id = 1`
          );
          route = freshPrefs?.onboarding_complete ? '/(tabs)' : '/onboarding';
        }
      } catch (e) {
        console.error('[init]', e);
        route = '/auth';
      } finally {
        initDone.current = true;
        setPendingRoute(route);
        setIsReady(true);
      }
    })();
  }, []);

  // ── Auth state listener (login / logout after initial load) ──
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!initDone.current) return; // ignore events during init

      if (event === 'SIGNED_OUT') {
        router.replace('/auth');
        return;
      }

      if (event === 'SIGNED_IN' && session) {
        try {
          const db = await getDatabase();
          const prefs = await db.getFirstAsync<{
            onboarding_complete: number;
            supabase_user_id: string | null;
          }>(`SELECT onboarding_complete, supabase_user_id FROM user_preferences WHERE id = 1`);

          const storedId = prefs?.supabase_user_id ?? null;
          const userId = session.user.id;

          if (!storedId || storedId !== userId) {
            await pullAllData(db, userId).catch(console.error);
            await db.runAsync(
              `UPDATE user_preferences SET supabase_user_id = ? WHERE id = 1`,
              [userId]
            );
          }

          const freshPrefs = await db.getFirstAsync<{ onboarding_complete: number }>(
            `SELECT onboarding_complete FROM user_preferences WHERE id = 1`
          );
          router.replace(freshPrefs?.onboarding_complete ? '/(tabs)' : '/onboarding');
        } catch (e) {
          console.error('[SIGNED_IN]', e);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0E0D0B', alignItems: 'center', justifyContent: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator color="#EF6C3E" size="large" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0E0D0B' } }}>
        <Stack.Screen name="auth" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="gym/split-builder" />
        <Stack.Screen name="gym/session" />
        <Stack.Screen name="gym/exercises" />
        <Stack.Screen name="nutrition/search" />
        <Stack.Screen name="nutrition/goals" />
        <Stack.Screen name="nutrition/ai-estimate" />
        <Stack.Screen name="gym/cardio" />
      </Stack>
    </>
  );
}
