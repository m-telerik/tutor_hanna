// 📁 api/students.js - ИСПРАВЛЕННАЯ ВЕРСИЯ

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

    // Определяем, какие данные загружать в зависимости от роли
    let studentsQuery = supabase
      .from('hanna_users')
      .select('id, name, username, email, languages, preferred_days, preferred_time, booking_mode, telegram_id')
      .eq('is_active', true)
      .eq('role', 'student');

    // Если это студент — показываем только его данные
    if (user.role === 'student') {
      studentsQuery = studentsQuery.eq('id', user.id);
    } else if (user.role === 'tutor') {
      // В будущем здесь можно добавить фильтрацию по tutor_id
      // studentsQuery = studentsQuery.eq('tutor_id', user.id);
    }
    // Админы видят всех студентов

    const { data: users, error: studentsError } = await studentsQuery;

    if (studentsError) {
      console.error('Database error:', studentsError);
      return res.status(500).json({ 
        error: studentsError.message,
        details: 'Ошибка загрузки списка студентов'
      });
    }

    if (!users || users.length === 0) {
      return res.status(200).json({ 
        students: [],
        requester: {
          name: user.name,
          role: user.role,
          auth_method: user.auth_method
        },
        total: 0,
        message: user.role === 'student' ? 'Ваш профиль не найден' : 'Нет активных студентов'
      });
    }

    // Получаем ВСЕ будущие сессии для всех студентов одним запросом
    const userIds = users.map(u => u.id);
    const { data: allSessions, error: sessionsError } = await supabase
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

    if (sessionsError) {
      console.warn('Ошибка загрузки сессий:', sessionsError);
      // Продолжаем без сессий
    }

    // Создаем карту ближайших сессий по user_id
    const nextSessionsMap = {};
    
    if (allSessions && allSessions.length > 0) {
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
        user_id: u.id, // Добавляем для обратной совместимости
        name: u.name,
        username: u.username,
        email: u.email,
        telegram_id: u.telegram_id,
        language: Array.isArray(u.languages) ? u.languages.join(', ') : (u.languages || '—'),
        languages: u.languages, // Сохраняем оригинальный формат
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
    console.error('Unexpected error in students API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Произошла неожиданная ошибка',
      details: error.message
    });
  }
}

// 📁 api/student-lessons.js - ИСПРАВЛЕННАЯ ВЕРСИЯ

import { createClient } from '@supabase/supabase-js';
import { authenticate } from './_auth-middleware.js';
import { 
  SESSION_STATUS, 
  enrichSessionData, 
  validateUUID,
  getTimeUntil,
  getRelativeTime 
} from './_session-helpers.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Универсальная проверка авторизации (Telegram или браузер)
    const user = await authenticate(req, res, ['admin', 'tutor', 'student']);
    if (!user) return; // Ошибка уже отправлена в authenticate()

    console.log('✅ Student Lessons API - авторизован:', user.name, '- роль:', user.role, '- метод:', user.auth_method);

    const { searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const user_id = searchParams.get('user_id');
    const status_filter = searchParams.get('status') || 'all'; // all, upcoming, completed, cancelled
    const limit = parseInt(searchParams.get('limit')) || 50;

    // Определяем, чьи занятия загружать
    let targetUserId = user_id;
    
    if (user.role === 'student') {
      // Студенты могут видеть только свои занятия
      if (user.auth_method === 'telegram') {
        targetUserId = user.id;
      } else {
        return res.status(403).json({ 
          error: 'Access denied',
          message: 'Студенты могут просматривать только свои занятия'
        });
      }
    } else if (user.role === 'tutor') {
      // Тьюторы могут видеть занятия своих студентов
      if (!targetUserId) {
        return res.status(400).json({ 
          error: 'Missing user_id',
          message: 'Укажите ID студента для просмотра занятий'
        });
      }
      // Валидируем UUID
      try {
        validateUUID(targetUserId, 'user_id');
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid user_id',
          message: error.message
        });
      }
    } else if (user.role === 'admin') {
      // Админы могут видеть все занятия
      if (!targetUserId) {
        return res.status(400).json({ 
          error: 'Missing user_id',
          message: 'Укажите ID студента для просмотра занятий'
        });
      }
      // Валидируем UUID
      try {
        validateUUID(targetUserId, 'user_id');
      } catch (error) {
        return res.status(400).json({ 
          error: 'Invalid user_id',
          message: error.message
        });
      }
    }

    // Строим запрос к базе данных
    let query = supabase
      .from('hanna_sessions')
      .select(`
        id,
        session_datetime,
        duration_minutes,
        status,
        type,
        language,
        zoom_link,
        zoom_meeting_id,
        notes,
        participant_ids,
        google_event_id,
        session_type,
        created_at,
        updated_at,
        created_by,
        tutor_id
      `)
      .contains('participant_ids', [targetUserId])
      .order('session_datetime', { ascending: false })
      .limit(limit);

    // Применяем фильтры по статусу
    const now = new Date().toISOString();
    
    if (status_filter === 'upcoming') {
      query = query
        .gte('session_datetime', now)
        .in('status', [SESSION_STATUS.PLANNED, SESSION_STATUS.CONFIRMED]);
    } else if (status_filter === 'completed') {
      query = query
        .eq('status', SESSION_STATUS.COMPLETED);
    } else if (status_filter === 'cancelled') {
      query = query
        .eq('status', SESSION_STATUS.CANCELLED);
    } else if (status_filter === 'past') {
      query = query
        .lt('session_datetime', now);
    }

    const { data: sessions, error: sessionsError } = await query;

    if (sessionsError) {
      console.error('Database error:', sessionsError);
      return res.status(500).json({ 
        error: sessionsError.message,
        details: 'Ошибка загрузки занятий из базы данных'
      });
    }

    // Получаем информацию о студенте для контекста
    const { data: studentInfo, error: studentError } = await supabase
      .from('hanna_users')
      .select('id, name, username, email, languages')
      .eq('id', targetUserId)
      .single();

    if (studentError && studentError.code !== 'PGRST116') {
      console.error('Student info error:', studentError);
      // Продолжаем без информации о студенте
    }

    // Обогащаем данные занятий
    const enrichedLessons = (sessions || []).map(session => {
      const sessionDate = new Date(session.session_datetime);
      const isUpcoming = sessionDate > new Date();
      const isPast = sessionDate < new Date();

      return {
        ...session,
        formatted_date: sessionDate.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }),
        formatted_time: sessionDate.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit'
        }),
        formatted_datetime: sessionDate.toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        weekday: sessionDate.toLocaleDateString('ru-RU', { weekday: 'long' }),
        weekday_short: sessionDate.toLocaleDateString('ru-RU', { weekday: 'short' }),
        display_language: session.language || (studentInfo?.languages ? 
          (Array.isArray(studentInfo.languages) ? studentInfo.languages.join(', ') : studentInfo.languages) 
          : 'Не указан'),
        display_status: getStatusLabel(session.status),
        display_type: getTypeLabel(session.type),
        status_emoji: getStatusEmoji(session.status),
        status_class: getStatusClass(session.status),
        is_upcoming: isUpcoming,
        is_past: isPast,
        can_join: isUpcoming && session.zoom_link && 
                  ['planned', 'confirmed'].includes(session.status),
        student_name: studentInfo?.name || 'Неизвестный студент',
        student_username: studentInfo?.username,
        time_until: isUpcoming ? getTimeUntil(sessionDate) : null,
        relative_time: getRelativeTime(sessionDate)
      };
    });

    // Группируем по статусу для удобства
    const upcomingLessons = enrichedLessons.filter(l => l.is_upcoming && l.status !== SESSION_STATUS.CANCELLED);
    const pastLessons = enrichedLessons.filter(l => l.is_past);
    const cancelledLessons = enrichedLessons.filter(l => l.status === SESSION_STATUS.CANCELLED);

    const response = {
      lessons: enrichedLessons,
      grouped: {
        upcoming: upcomingLessons,
        past: pastLessons,
        cancelled: cancelledLessons
      },
      stats: {
        total: enrichedLessons.length,
        upcoming: upcomingLessons.length,
        past: pastLessons.length,
        cancelled: cancelledLessons.length,
        completed: enrichedLessons.filter(l => l.status === SESSION_STATUS.COMPLETED).length
      },
      student_info: studentInfo,
      requester: {
        name: user.name,
        role: user.role,
        auth_method: user.auth_method
      },
      filters_applied: {
        user_id: targetUserId,
        status_filter,
        limit
      }
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Unexpected error in student-lessons API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Произошла ошибка при загрузке занятий',
      details: error.message
    });
  }
}

/**
 * Получить человекочитаемое название статуса
 */
function getStatusLabel(status) {
  const labels = {
    'planned': 'Запланировано',
    'confirmed': 'Подтверждено',
    'cancelled': 'Отменено',
    'completed': 'Завершено'
  };
  return labels[status] || status;
}

/**
 * Получить человекочитаемое название типа
 */
function getTypeLabel(type) {
  const labels = {
    'individual': 'Индивидуальное',
    'pair': 'Парное',
    'group': 'Групповое'
  };
  return labels[type] || type;
}

/**
 * Получить CSS класс для статуса
 */
function getStatusClass(status) {
  const classes = {
    'planned': 'status-planned',
    'confirmed': 'status-confirmed',
    'cancelled': 'status-cancelled',
    'completed': 'status-completed'
  };
  return classes[status] || 'status-unknown';
}

/**
 * Получить эмодзи для статуса
 */
function getStatusEmoji(status) {
  const emojis = {
    'planned': '📅',
    'confirmed': '✅',
    'cancelled': '❌',
    'completed': '✅'
  };
  return emojis[status] || '❓';
}