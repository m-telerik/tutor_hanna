// 📁 /api/_session-helpers.js
// Вспомогательные функции и константы для работы с hanna_sessions

/**
 * Статусы сессий в базе данных
 */
export const SESSION_STATUS = {
  PLANNED: 'planned',
  CONFIRMED: 'confirmed', 
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

/**
 * Типы сессий
 */
export const SESSION_TYPE = {
  INDIVIDUAL: 'individual',
  PAIR: 'pair',
  GROUP: 'group'
};

/**
 * Языки
 */
export const LANGUAGE = {
  ENGLISH: 'english',
  FRENCH: 'french'
};

/**
 * Типы создания сессий
 */
export const SESSION_CREATION_TYPE = {
  MANUAL: 'manual',
  AUTO_RECURRING: 'auto_recurring',
  MAKEUP: 'makeup',
  RESCHEDULED: 'rescheduled'
};

/**
 * Кто создал сессию
 */
export const CREATED_BY = {
  AGENT: 'agent',
  STUDENT: 'student', 
  TEACHER: 'teacher',
  SYSTEM: 'system',
  CALENDAR: 'calendar'
};

/**
 * Получить человекочитаемое название статуса
 */
export function getStatusLabel(status) {
  const labels = {
    [SESSION_STATUS.PLANNED]: 'Запланировано',
    [SESSION_STATUS.CONFIRMED]: 'Подтверждено',
    [SESSION_STATUS.CANCELLED]: 'Отменено',
    [SESSION_STATUS.COMPLETED]: 'Завершено'
  };
  return labels[status] || status;
}

/**
 * Получить человекочитаемое название типа
 */
export function getTypeLabel(type) {
  const labels = {
    [SESSION_TYPE.INDIVIDUAL]: 'Индивидуальное',
    [SESSION_TYPE.PAIR]: 'Парное',
    [SESSION_TYPE.GROUP]: 'Групповое'
  };
  return labels[type] || type;
}

/**
 * Получить человекочитаемое название языка
 */
export function getLanguageLabel(language) {
  const labels = {
    [LANGUAGE.ENGLISH]: 'Английский',
    [LANGUAGE.FRENCH]: 'Французский'
  };
  return labels[language] || language;
}

/**
 * Получить CSS класс для статуса
 */
export function getStatusClass(status) {
  const classes = {
    [SESSION_STATUS.PLANNED]: 'status-planned',
    [SESSION_STATUS.CONFIRMED]: 'status-confirmed',
    [SESSION_STATUS.CANCELLED]: 'status-cancelled',
    [SESSION_STATUS.COMPLETED]: 'status-completed'
  };
  return classes[status] || 'status-unknown';
}

/**
 * Получить эмодзи для статуса
 */
export function getStatusEmoji(status) {
  const emojis = {
    [SESSION_STATUS.PLANNED]: '📅',
    [SESSION_STATUS.CONFIRMED]: '✅',
    [SESSION_STATUS.CANCELLED]: '❌',
    [SESSION_STATUS.COMPLETED]: '✅'
  };
  return emojis[status] || '❓';
}

/**
 * Проверить, можно ли присоединиться к сессии
 */
export function canJoinSession(session) {
  const sessionDate = new Date(session.session_datetime);
  const now = new Date();
  const isUpcoming = sessionDate > now;
  const hasZoomLink = !!session.zoom_link;
  const statusAllowsJoin = [SESSION_STATUS.PLANNED, SESSION_STATUS.CONFIRMED].includes(session.status);
  
  // Можно присоединиться за 10 минут до начала
  const tenMinutesBefore = new Date(sessionDate.getTime() - 10 * 60 * 1000);
  const canJoinByTime = now >= tenMinutesBefore;
  
  return isUpcoming && hasZoomLink && statusAllowsJoin && canJoinByTime;
}

/**
 * Получить время до занятия в удобном формате
 */
export function getTimeUntil(sessionDate) {
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

/**
 * Получить относительное время (сегодня, вчера, завтра и т.д.)
 */
export function getRelativeTime(sessionDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sessionDay = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
  
  const diffDays = Math.floor((sessionDay - today) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  if (diffDays === -1) return 'Вчера';
  if (diffDays > 1 && diffDays <= 7) return `Через ${diffDays} дня`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} дня назад`;
  
  return sessionDate.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short'
  });
}

/**
 * Обогатить данные сессии дополнительной информацией
 */
export function enrichSessionData(session, studentInfo = null) {
  const sessionDate = new Date(session.session_datetime);
  const isUpcoming = sessionDate > new Date();
  const isPast = sessionDate < new Date();
  
  // Определяем язык из сессии или студента
  const language = session.language || 
                  (Array.isArray(studentInfo?.languages) 
                    ? studentInfo.languages.join(', ') 
                    : studentInfo?.languages) || 'Не указан';

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
    display_language: getLanguageLabel(language),
    display_status: getStatusLabel(session.status),
    display_type: getTypeLabel(session.type),
    status_emoji: getStatusEmoji(session.status),
    status_class: getStatusClass(session.status),
    is_upcoming: isUpcoming,
    is_past: isPast,
    can_join: canJoinSession(session),
    time_until: isUpcoming ? getTimeUntil(sessionDate) : null,
    relative_time: getRelativeTime(sessionDate),
    student_name: studentInfo?.name || 'Неизвестный студент',
    student_username: studentInfo?.username
  };
}

/**
 * Проверить UUID и вернуть ошибку если невалидный
 */
export function validateUUID(uuid, fieldName = 'ID') {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uuid) {
    throw new Error(`${fieldName} обязателен`);
  }
  
  if (!uuidRegex.test(uuid)) {
    throw new Error(`${fieldName} должен быть валидным UUID`);
  }
  
  return true;
}
