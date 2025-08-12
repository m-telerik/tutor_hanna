// 📁 /api/students.js - ОБНОВЛЕННАЯ ВЕРСИЯ с улучшенной информацией о занятиях

import { createClient } from '@supabase/supabase-js';
import { authenticate } from './_auth-middleware.js';
import { SESSION_STATUS, validateUUID } from './_session-helpers.js';

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

    // Получаем ВСЕ будущие сессии для всех студентов одним запросом
    const userIds = users.map(u => u.id);
    const { data: allSessions } = await supabase
      .from('hanna_sessions')
      .select(`
        id, 
        participant_ids, 
        session_datetime, 
        status, 
        type, 
        language,
        duration_minutes,
        zoom_link,
        zoom_meeting_id,
        google_event_id,
        session_type,
        notes
      `)
      .gte('session_datetime', new Date().toISOString())
      .order('session_datetime', { ascending: true });

    // Создаем карту ближайших сессий по user_id
    const nextSessionsMap = {};
    
    if (allSessions) {
      // Группируем сессии по участникам
      allSessions.forEach(session => {
        if (session.participant_ids && session.participant_ids.length > 0) {
          session.participant_ids.forEach(userId => {
            if (userIds.includes(userId)) {
              // Берем только самую ближайшую сессию для каждого пользователя
              if (!nextSessionsMap[userId] || 
                  nextSessionsMap[userId].session_datetime > session.session_datetime) {
                nextSessionsMap[userId] = session;
              }
            }
          });
        }
      });
    }

    // Обогащаем данные студентов информацией о сессиях
    const students = users.map((u) => {
      const nextSession = nextSessionsMap[u.id];
      
      let sessionInfo = {
        next_session: null,
        next_session_id: null,
        next_session_datetime: null,
        status: null,
        type: null,
        can_join: false,
        zoom_link: null,
        time_until: null,
        duration: null
      };

      if (nextSession) {
        const sessionDate = new Date(nextSession.session_datetime);
        const now = new Date();
        const timeUntil = getTimeUntil(sessionDate);
        const canJoin = sessionDate > now && nextSession.zoom_link && 
                       [SESSION_STATUS.PLANNED, SESSION_STATUS.CONFIRMED].includes(nextSession.status);

        // Определяем язык из сессии или студента
        const sessionLanguage = nextSession.language || 
                               (Array.isArray(u.languages) ? u.languages.join(', ') : u.languages);

        sessionInfo = {
          next_session: sessionDate.toLocaleString('ru-RU', {
            timeZone: 'Asia/Bangkok',
            year: 'numeric',
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          }),
          next_session_id: nextSession.id,
          next_session_datetime: nextSession.session_datetime,
          status: nextSession.status,
          type: nextSession.type,
          session_language: sessionLanguage,
          session_type: nextSession.session_type,
          can_join: canJoin,
          zoom_link: nextSession.zoom_link,
          zoom_meeting_id: nextSession.zoom_meeting_id,
          google_event_id: nextSession.google_event_id,
          time_until: timeUntil,
          duration: nextSession.duration_minutes || 60,
          formatted_date: sessionDate.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            weekday: 'short'
          }),
          formatted_time: sessionDate.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          notes: nextSession.notes
        };
      }

      return {
        id: u.id,
        name: u.name,
        username: u.username,
        email: u.email,
        telegram_id: u.telegram_id,
        language: Array.isArray(u.languages) ? u.languages.join(', ') : (u.languages || '—'),
        preferred_days: u.preferred_days || [],
        preferred_time: u.preferred_time || null,
        booking_mode: u.booking_mode || 'by_teacher',
        frequency: u.preferred_days?.length || null,
        ...sessionInfo
      };
    });

    return res.status(200).json({ 
      students,
      requester: {
        name: user.name,
        role: user.role,
        auth_method: user.auth_method
      },
      total: students.length,
      stats: {
        with_upcoming_lessons: students.filter(s => s.next_session).length,
        without_lessons: students.filter(s => !s.next_session).length,
        can_join_now: students.filter(s => s.can_join).length
      }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Получить время до занятия в удобном формате
 */
function getTimeUntil(sessionDate) {
  const now = new Date();
  const diff = sessionDate - now;
  
  if (diff <= 0) return 'Сейчас';
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `через ${days} дн.`;
  } else if (hours > 0) {
    return `через ${hours} ч.`;
  } else if (minutes > 0) {
    return `через ${minutes} мин.`;
  } else {
    return 'скоро';
  }
}
