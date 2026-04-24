/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

// Replace this with your Supabase Project URL
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://msghiztdtpmipcjnyiwj.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zZ2hpenRkdHBtaXBjam55aXdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNzk4MzMsImV4cCI6MjA4OTk1NTgzM30.1lDpSU3PR5B7FTLQc07ETETycRuZ1L6jZS-LRS4aGfs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
