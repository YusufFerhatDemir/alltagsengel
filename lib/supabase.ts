import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nnwyktkqibdjxgimjyuq.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ud3lrdGtxaWJkanhnaW1qeXVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5OTc3NDUsImV4cCI6MjA4NzU3Mzc0NX0.DOGjqwwoWrQzelnIQX5ve-HKts0G5Qg5r9JiKNXWxpk'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
