// 📁 /api/browser-auth.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Конфигурация админских паролей (в production лучше хранить в ENV)
const ADMIN_CREDENTIALS = {
  // Можно добавить несколько админов
  'admin123': {
    admin_id: 1,
    name: 'Главный Админ',
    role: 'admin',
    permissions: ['all']
  },
  'hanna2024': {
    admin_id: 2, 
    name: 'Анна',
    role: 'admin',
    permissions: ['students', 'lessons', 'vocabulary']
  },
  'tutor456': {
    admin_id: 3,
    name: 'Тьютор',
    role: 'tutor', 
    permissions: ['students', 'lessons']
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password, name } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        error: 'Missing password',
        message: 'Пароль обязателен для входа'
      });
    }

    // Проверяем пароль
    const adminData = ADMIN_CREDENTIALS[password];
    
    if (!adminData) {
      // Добавляем небольшую задержку для защиты от брутфорса
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Неверный пароль. Обратитесь к разработчику за корректным паролем.'
      });
    }

    // Генерируем простой токен (в production используйте JWT)
    const token = generateSimpleToken(adminData.admin_id);
    
    // Логируем вход (опционально - можно записать в базу)
    console.log(`🔐 Browser login: ${adminData.name} (${adminData.role}) at ${new Date().toISOString()}`);

    // Опционально: записываем в базу данных
    try {
      await supabase.from('admin_browser_sessions').insert({
        admin_id: adminData.admin_id,
        name: name || adminData.name,
        role: adminData.role,
        token: token,
        ip_address: req.headers['x-forwarded-for'] || req.connection?.remoteAddress,
        user_agent: req.headers['user-agent'],
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 часа
      });
    } catch (dbError) {
      console.warn('Не удалось записать сессию в БД:', dbError.message);
      // Продолжаем работу без записи в БД
    }

    // Возвращаем данные пользователя
    const userData = {
      admin_id: adminData.admin_id,
      name: name || adminData.name,
      role: adminData.role,
      permissions: adminData.permissions,
      token: token,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      auth_method: 'browser_password'
    };

    return res.status(200).json(userData);

  } catch (error) {
    console.error('Browser auth error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: 'Ошибка сервера. Попробуйте позже.'
    });
  }
}

/**
 * Генерация простого токена
 */
function generateSimpleToken(adminId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2);
  return `admin_${adminId}_${timestamp}_${random}`;
}

/**
 * Middleware для проверки браузерной авторизации
 */
export function checkBrowserAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  const adminId = req.headers['x-admin-id'];
  
  if (!token || !adminId) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Требуется авторизация администратора'
    });
  }

  // Простая проверка токена (в production используйте более надежную)
  if (token.startsWith(`admin_${adminId}_`)) {
    // Токен валиден
    req.admin = { admin_id: parseInt(adminId), token };
    return next ? next() : true;
  }

  return res.status(401).json({ 
    error: 'Invalid token',
    message: 'Недействительный токен авторизации'
  });
}
