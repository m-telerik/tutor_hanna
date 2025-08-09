import { createClient } from '@supabase/supabase-js';
import getRawBody from 'raw-body';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  console.log('🔍 x-telegram-id:', telegram_id);

  if (!ADMIN_IDS.includes(telegram_id)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (req.method === 'GET') {
    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const session_id = searchParams.get('session_id');
    const user_name = searchParams.get('user_name');
    const user_id = searchParams.get('user_id');

    let query = supabase
      .from('hanna_vocab')
      .select(`
        id,
        word,
        translation,
        example,
        created_at,
        language,
        studied_count,
        last_studied_at,
        session_id,
        user_id,
        hanna_users!inner(name)
      `)
      .order('created_at', { ascending: false });

    // Фильтрация по session_id
    if (session_id) {
      query = query.eq('session_id', session_id);
    }
    
    // Фильтрация по имени пользователя
    if (user_name) {
      query = query.eq('hanna_users.name', user_name);
    }
    
    // Фильтрация по user_id
    if (user_id) {
      query = query.eq('user_id', user_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database error:', error);
      return res.status(500).json({ error: error.message });
    }

    // Преобразуем данные для совместимости
    const words = data.map(w => ({
      id: w.id,
      word: w.word,
      translation: w.translation,
      example: w.example,
      created_at: w.created_at,
      language: w.language,
      studied_count: w.studied_count || 0,
      last_studied_at: w.last_studied_at,
      session_id: w.session_id,
      user_id: w.user_id,
      user_name: w.hanna_users?.name
    }));

    return res.status(200).json({ words });
  }

  if (req.method === 'POST') {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody.toString());
    console.log('📥 body:', body);

    const { word, translation, example, session_id, user_id, language } = body;
    
    if (!word || (!session_id && !user_id)) {
      return res.status(400).json({ error: 'Missing required fields: word and (session_id or user_id)' });
    }

    // Если передан session_id, но нет user_id, получаем user_id из сессии
    let finalUserId = user_id;
    if (!finalUserId && session_id) {
      const { data: sessionData } = await supabase
        .from('hanna_sessions')
        .select('participant_ids')
        .eq('id', session_id)
        .single();
      
      if (sessionData?.participant_ids?.length > 0) {
        finalUserId = sessionData.participant_ids[0]; // Берем первого участника
      }
    }

    if (!finalUserId) {
      return res.status(400).json({ error: 'Cannot determine user_id' });
    }

    const { error } = await supabase.from('hanna_vocab').insert({
      word,
      translation,
      example,
      session_id,
      user_id: finalUserId,
      language
    });

    if (error) {
      console.error('Insert error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  if (req.method === 'PUT') {
    const rawBody = await getRawBody(req);
    const body = JSON.parse(rawBody.toString());
    
    const { id, studied } = body;
    
    if (!id) {
      return res.status(400).json({ error: 'Missing word id' });
    }

    const updateData = {};
    if (studied) {
      // Увеличиваем счетчик изучения
      const { data: currentWord } = await supabase
        .from('hanna_vocab')
        .select('studied_count')
        .eq('id', id)
        .single();
      
      updateData.studied_count = (currentWord?.studied_count || 0) + 1;
      updateData.last_studied_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('hanna_vocab')
      .update(updateData)
      .eq('id', id);

    if (error) {
      console.error('Update error:', error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true });
  }

  res.status(405).json({ error: 'Method not allowed' });
}
