// 📁 /api/user-role.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ADMIN_IDS = [618647337, 2341205];

export default async function handler(req, res) {
  const telegram_id = parseInt(req.headers["x-telegram-id"]);
  
  if (!telegram_id) {
    return res.status(400).json({ error: 'Missing telegram_id' });
  }

  // Проверяем, админ ли это
  if (ADMIN_IDS.includes(telegram_id)) {
    return res.status(200).json({ 
      role: 'admin',
      telegram_id 
    });
  }

  // Ищем пользователя в базе
  const { data: user, error } = await supabase
    .from('hanna_users')
    .select('id, name, languages, role, is_active, preferred_days, preferred_time')
    .eq('telegram_id', telegram_id)
    .single();

  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }

  // Если пользователь не найден - это потенциальный студент
  if (!user) {
    return res.status(200).json({ 
      role: 'prospect',
      telegram_id 
    });
  }

  // Если найден и активный студент
  if (user.role === 'student' && user.is_active) {
    // Получаем следующее занятие с новой схемой
    const { data: nextSession } = await supabase
      .from('hanna_sessions')
      .select('id, session_datetime, status, type')
      .eq('user_id', user.id)
      .gte('session_datetime', new Date().toISOString())
      .order('session_datetime', { ascending: true })
      .limit(1)
      .single();

    const response = {
      role: 'student',
      telegram_id,
      name: user.name,
      languages: user.languages,
      preferred_days: user.preferred_days,
      preferred_time: user.preferred_time
    };

    if (nextSession) {
      response.next_session = {
        session_id: nextSession.id,
        date: new Date(nextSession.session_datetime).toLocaleString('ru-RU', {
          timeZone: 'Asia/Bangkok',
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        datetime: nextSession.session_datetime,
        status: nextSession.status,
        type: nextSession.type,
        language: Array.isArray(user.languages) ? user.languages.join(', ') : user.languages
      };
    }

    return res.status(200).json(response);
  }

  // Если пользователь неактивен или имеет другую роль
  return res.status(200).json({ 
    role: 'prospect',
    telegram_id 
  });
}
