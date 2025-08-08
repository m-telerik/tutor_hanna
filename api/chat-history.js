export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  const { session_id } = req.query;
  
  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data, error } = await supabase
    .from('n8n_chat_histories')
    .select('id, session_id, message, created_at')
    .eq('session_id', session_id)
    .order('id', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ messages: data });
}
