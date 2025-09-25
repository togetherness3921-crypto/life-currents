#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || 'https://cvzgxnspmmxxxwnxiydk.supabase.co'
const key = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2emd4bnNwbW14eHh3bnhpeWRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY4NzczNTgsImV4cCI6MjA3MjQ1MzM1OH0.2syXitu78TLVBu8hD7DfAC7h6CYvgyP-ZWcw9wY3xhU'

const supabase = createClient(url, key)

const { data, error } = await supabase
  .from('graph_documents')
  .select('id, data')
  .eq('id', 'main')
  .maybeSingle()

if (error) {
  console.error('Error reading graph_documents:', error)
  process.exit(1)
}

console.log(JSON.stringify(data, null, 2))


