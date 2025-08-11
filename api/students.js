// 📁 /api/students.js
import { createClient } from '@supabase/supabase-js';
import { authenticate } from './_auth-middleware.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tgid = url.searchParams.get("tgid");
  
  // Если есть tgid в параметрах, добавляем его в заголовки для совместимости
  if (tgid && !req.headers["x-telegram-id"]) {
    req.headers["x-telegram-id"] = tgid;
  }

  try {
    // Универсальная проверка авторизации (Telegram или браузер)
    const user = await authenticate(req, res, ['admin', 'tutor', 'student']);
    if (!user) return; // Ошибка уже отправлена в authenticate()

    console.log('✅ Авторизован пользователь:', user.name, '- роль:', user.role, '- метод:', user.auth_method);

    // Загружаем список студентов
    let studentsQuery = supabase
      .from('hanna_users')
      .select('id, name, username, email, languages, preferred_days, preferred_time, booking_mode, telegram_id')
      .eq('is_active', true)
      .eq('role', 'student');

    // Если это студент — показываем только его карточку
    if (user.role === 'student') {
      studentsQuery = studentsQuery.eq('id', user.id);
    } else if (user.role === 'tutor') {
      // В будущем здесь можно добавить фильтрацию по tutor_id
      // studentsQuery = studentsQuery.eq('tutor_id', user.id);
    }

    const { data: users, error: studentsError } = await studentsQuery;

    if (studentsError) {
      return res.status(500).json({ error: studentsError.message });
    }

    // Получаем будущие сессии
    const { data: sessions } = await supabase
      .from('hanna_sessions')
      .select('id, participant_ids, session_datetime, status, type')
      .gte('session_datetime', new Date().toISOString());

    // Создаем карту сессий по user_id
    const sessionsMap = {};
    for (const s of sessions) {
      if (s.participant_ids && s.participant_ids.length > 0) {
        for (const user_id of s.participant_ids) {
          if (
            !sessionsMap[user_id] ||
            sessionsMap[user_id].session_datetime > s.session_datetime
          ) {
            sessionsMap[user_id] = {
              session_datetime: s.session_datetime,
              session_id: s.id,
              status: s.status,
              type: s.type
            };
          }
        }
      }
    }

    const students = users.map((u) => {
      const session = sessionsMap[u.id] || {};
      return {
        name: u.name,
        username: u.username,
        email: u.email,
        telegram_id: u.telegram_id,
        language: Array.isArray(u.languages) ? u.languages.join(', ') : (u.languages || '—'),
        preferred_days: u.preferred_days || [],
        preferred_time: u.preferred_time || null,
        booking_mode: u.booking_mode || 'by_teacher',
        next_session: session.session_datetime ? 
          new Date(session.session_datetime).toLocaleString('ru-RU', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }) : null,
        next_session_id: session.session_id || null,
        status: session.status || null,
        type: session.type || null,
        frequency: u.preferred_days?.length || null,
      };
    });

    return res.status(200).json({ 
      students,
      requester: {
        name: user.name,
        role: user.role,
        auth_method: user.auth_method
      },
      total: students.length
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
