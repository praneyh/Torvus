// ============================================================
// TORVUS — Auth Screen (Login / Sign Up)
// app/auth.tsx
// ============================================================

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

type Mode = 'login' | 'signup';

export default function AuthScreen() {
  const [mode, setMode]       = useState<Mode>('login');
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleSubmit() {
    setError('');
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) throw err;
        // _layout.tsx onAuthStateChange will handle routing
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw err;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo / wordmark */}
          <View style={styles.logoWrap}>
            <Text style={styles.logo}>TORVUS</Text>
            <Text style={styles.tagline}>Track. Lift. Grow.</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>

            {/* Mode toggle */}
            <View style={styles.modeRow}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'login' && styles.modeBtnActive]}
                onPress={() => { setMode('login'); setError(''); }}
              >
                <Text style={[styles.modeBtnText, mode === 'login' && styles.modeBtnTextActive]}>
                  LOG IN
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]}
                onPress={() => { setMode('signup'); setError(''); }}
              >
                <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>
                  SIGN UP
                </Text>
              </TouchableOpacity>
            </View>

            {/* Fields */}
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={v => { setEmail(v); setError(''); }}
                placeholder="you@example.com"
                placeholderTextColor="#444"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={v => { setPassword(v); setError(''); }}
                placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
                placeholderTextColor="#444"
                secureTextEntry
              />
            </View>

            {/* Error */}
            {!!error && <Text style={styles.errorText}>{error}</Text>}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#0E0D0B" />
                : <Text style={styles.submitBtnText}>
                    {mode === 'login' ? 'LOG IN' : 'CREATE ACCOUNT'}
                  </Text>
              }
            </TouchableOpacity>

            {/* Footer note */}
            {mode === 'signup' && (
              <Text style={styles.footerNote}>
                Your data is stored locally and backed up to the cloud.
              </Text>
            )}
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0E0D0B' },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 48 },

  logoWrap: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 36, fontWeight: '900', color: '#EF6C3E', letterSpacing: 6 },
  tagline: { fontSize: 12, color: '#555', letterSpacing: 2, marginTop: 4 },

  card: {
    backgroundColor: '#141311',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#252320',
    padding: 24,
  },

  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#0E0D0B',
    borderRadius: 10,
    padding: 4,
    marginBottom: 24,
  },
  modeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#EF6C3E' },
  modeBtnText: { fontSize: 12, fontWeight: '700', letterSpacing: 1, color: '#555' },
  modeBtnTextActive: { color: '#0E0D0B' },

  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#0E0D0B',
    borderWidth: 1,
    borderColor: '#252320',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F2F0EB',
  },

  errorText: { fontSize: 12, color: '#EF3E7A', marginBottom: 12, textAlign: 'center' },

  submitBtn: {
    backgroundColor: '#EF6C3E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#0E0D0B', fontWeight: '800', fontSize: 14, letterSpacing: 1 },

  footerNote: { fontSize: 11, color: '#444', textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
