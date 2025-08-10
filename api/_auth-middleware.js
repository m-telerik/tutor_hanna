// 📁 /api/_auth-middleware.js
// Универсальная система проверки авторизации для Telegram и браузера

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Универсальная проверка авторизации
 * Поддерживает как Telegram WebApp, так и браузерную авторизацию
 */
export async function checkAuth(req, allowedRoles = []) {
  const telegramId = req.headers["x-telegram-id"];
  const adminToken = req.headers["x-admin-token"];
  const adminId = req.headers["x-admin-id"];

  // Проверка браузерной авторизации
  if (adminToken && adminId) {
    return await checkBrowserAuth(adminToken, adminId, allowedRoles);
  }
  
  // Проверка Telegram авторизации
  if (telegramId) {
    return await checkTelegramAuth(parseInt(telegramId), allowedRoles);
  }

  throw new Error('Отсутствуют данные авторизации');
}

/**
 * Проверка браузерной авторизации
 */
async function checkBrowserAuth(token, adminId, allowedRoles) {
  // Простая проверка токена (в production используйте более надежную)
  if (!token.startsWith(`admin_${adminId}_`)) {
    throw new Error('Недействительный токен авторизации');
  }

  // Опционально: проверяем токен в базе данных
  try {
    const { data: session } = await supabase
      .from('admin_browser_sessions')
      .select('*')
      .eq('admin_id', parseInt(adminId))
      .eq('token', token)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (session) {
      // Используем данные из базы
      const userData = {
        admin_id: session.admin_id,
        name: session.name,
        role: session.role,
        auth_method: 'browser'
      };

      if (allowedRoles.length > 0 && !allowedRoles.includes(userData.role)) {
        throw new Error(`Недостаточно прав. Требуется роль: ${allowedRoles.join(' или ')}, у вас: ${userData.role}`);
      }

      return userData;
    }
  } catch (dbError) {
    console.warn('Не удалось проверить токен в БД, используем локальную проверку:', dbError.message);
  }

  // Fallback: локальная проверка без базы данных
  const adminData = {
    1: { name: 'Главный Админ', role: 'admin' },
    2: { name: 'Анна', role: 'admin' },
    3: { name: 'Тьютор', role: 'tutor' }
  };

  const userData = adminData[parseInt(adminId)];
  if (!userData) {
    throw new Error('Неизвестный администратор');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(userData.role)) {
    throw new Error(`Недостаточно прав. Требуется роль: ${allowedRoles.join(' или ')}, у вас: ${userData.role}`);
  }

  return {
    admin_id: parseInt(adminId),
    name: userData.name,
    role: userData.role,
    auth_method: 'browser'
  };
}

/**
 * Проверка Telegram авторизации
 */
async function checkTelegramAuth(telegramId, allowedRoles) {
  const { data: user, error } = await supabase
    .from('hanna_users')
    .select('id, name, role, is_active, telegram_id, username, email')
    .eq('telegram_id', telegramId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Ошибка базы данных: ${error.message}`);
  }

  if (!user) {
    throw new Error('Пользователь не найден в системе');
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    throw new Error(`Недостаточно прав. Требуется роль: ${allowedRoles.join(' или ')}, у вас: ${user.role}`);
  }

  return {
    id: user.id,
    telegram_id: user.telegram_id,
    name: user.name,
    username: user.username,
    email: user.email,
    role: user.role,
    is_active: user.is_active,
    auth_method: 'telegram'
  };
}

/**
 * Middleware функция для Express-like API
 */
export function requireAuth(allowedRoles = []) {
  return async (req, res, next) => {
    try {
      const user = await checkAuth(req, allowedRoles);
      req.user = user;
      req.isAuthenticated = true;
      
      if (next) next();
      return user;
    } catch (error) {
      console.error('Auth middleware error:', error);
      
      return res.status(403).json({
        error: 'Access denied',
        message: error.message,
        required_roles: allowedRoles
      });
    }
  };
}

/**
 * Упрощенная функция для проверки авторизации в API handlers
 */
export async function authenticate(req, res, allowedRoles = []) {
  try {
    const user = await checkAuth(req, allowedRoles);
    return user;
  } catch (error) {
    res.status(403).json({
      error: 'Access denied',
      message: error.message,
      required_roles: allowedRoles
    });
    return null;
  }
}

/**
 * Получение информации о текущем пользователе
 */
export async function getCurrentUser(req) {
  try {
    return await checkAuth(req, []);
  } catch (error) {
    return null;
  }
}
