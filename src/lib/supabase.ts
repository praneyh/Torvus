// ============================================================
// TORVUS — Supabase Client
// src/lib/supabase.ts
// ============================================================

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL  = 'https://rhdinurdqecvdobjsrzb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoZGludXJkcWVjdmRvYmpzcnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwMjIzMzgsImV4cCI6MjA4ODU5ODMzOH0.RDfn7GvijO0ZL0HSImgecSq9BqQvsFTXfcXcogvJVpY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage:            AsyncStorage,
    autoRefreshToken:   true,
    persistSession:     true,
    detectSessionInUrl: false,
  },
});
