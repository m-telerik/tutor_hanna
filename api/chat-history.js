// /api/chat-history.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  const { memory_key } = req.query;
  
  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!memory_key) {
    return res.status(400).json({ error: 'memory_key required' });
  }

  // Поиск по session_id = memory_key
  const { data, error } = await supabase
    .from('n8n_chat_histories_rows')
    .select('id, session_id, message, created_at')
    .eq('session_id', memory_key)
    .order('id', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ messages: data || [] });
}
