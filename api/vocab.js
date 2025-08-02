// 📁 /api/vocab.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (req.method === 'GET') {
    const { session_id } = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const { data, error } = await supabase
      .from('hanna_vocab')
      .select('word, translation, example, session_id, created_at, session:session_id(session_date)')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const words = data.map(w => ({
      ...w,
      session_date: w.session?.session_date || null
    }));

    return res.status(200).json({ words });
  }

  if (req.method === 'POST') {
    const body = await req.json();
    const { word, translation, example, session_id } = body;

    const { error } = await supabase.from('hanna_vocab').insert({
      word,
      translation,
      example,
      session_id
    });

    if (error) return res.status(500).json({ error: error.message });

    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
