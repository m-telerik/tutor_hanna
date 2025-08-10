// 📁 /js/auth.js
// Система авторизации и проверки ролей для Telegram Mini App

class AuthSystem {
  constructor() {
    this.currentUser = null;
    this.isAuthenticated = false;
    this.requiredRoles = [];
    this.onAuthSuccess = null;
    this.onAuthFail = null;
  }

  /**
   * Инициализация системы авторизации
   * @param {string[]} requiredRoles - Массив разрешенных ролей для страницы
   * @param {Function} onSuccess - Колбэк при успешной авторизации
   * @param {Function} onFail - Колбэк при неудачной авторизации
   */
  async init(requiredRoles = [], onSuccess = null, onFail = null) {
    console.log('🔐 Инициализация AuthSystem для ролей:', requiredRoles);
    
    this.requiredRoles = requiredRoles;
    this.onAuthSuccess = onSuccess;
    this.onAuthFail = onFail;

    try {
      // Получаем пользователя из Telegram WebApp
      const telegramUser = this.getTelegramUser();
      
      if (!telegramUser || !telegramUser.id) {
        throw new Error('Не удалось получить данные пользователя из Telegram');
      }

      // Проверяем роль через API
      const userRole = await this.checkUserRole(telegramUser.id);
      
      if (!userRole) {
        throw new Error('Пользователь не найден в системе');
      }

      // Проверяем доступ
      if (!this.hasAccess(userRole.role)) {
        throw new Error(`Недостаточно прав. Требуется роль: ${requiredRoles.join(' или ')}, у вас: ${userRole.role}`);
      }

      // Сохраняем пользователя
      this.currentUser = {
        ...telegramUser,
        ...userRole,
        authenticatedAt: Date.now()
      };
      
      this.isAuthenticated = true;
      
      console.log('✅ Авторизация успешна:', this.currentUser);
      
      if (this.onAuthSuccess) {
        this.onAuthSuccess(this.currentUser);
      }
      
      return this.currentUser;

    } catch (error) {
      console.error('❌ Ошибка авторизации:', error);
      
      this.isAuthenticated = false;
      this.currentUser = null;
      
      if (this.onAuthFail) {
        this.onAuthFail(error);
      } else {
        this.showAuthError(error.message);
      }
      
      throw error;
    }
  }

  /**
   * Получение данных пользователя из Telegram WebApp
   */
  getTelegramUser() {
    try {
      // Инициализируем Telegram WebApp если доступен
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.ready();
        window.Telegram.WebApp.expand();
        
        const user = window.Telegram.WebApp.initDataUnsafe?.user;
        if (user) {
          return {
            id: user.id,
            first_name: user.first_name,
            last_name: user.last_name,
            username: user.username,
            language_code: user.language_code
          };
        }
      }
      
      // Фоллбэк для разработки (только в dev режиме)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('🔧 Dev режим: используем тестовые данные');
        return {
          id: 618647337, // Тестовый ID для разработки
          first_name: 'Test',
          last_name: 'User',
          username: 'testuser',
          language_code: 'ru'
        };
      }
      
      throw new Error('Telegram WebApp недоступен');
      
    } catch (error) {
      console.error('Ошибка получения Telegram пользователя:', error);
      throw error;
    }
  }

  /**
   * Проверка роли пользователя через API
   */
  async checkUserRole(telegramId) {
    try {
      const response = await fetch('/api/user-role', {
        headers: { 'x-telegram-id': telegramId.toString() }
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Доступ запрещен');
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const userData = await response.json();
      console.log('👤 Роль пользователя получена:', userData);
      
      return userData;

    } catch (error) {
      console.error('Ошибка проверки роли:', error);
      throw new Error(`Не удалось проверить роль пользователя: ${error.message}`);
    }
  }

  /**
   * Проверка доступа по роли
   */
  hasAccess(userRole) {
    // Если роли не указаны, доступ разрешен всем
    if (this.requiredRoles.length === 0) {
      return true;
    }
    
    return this.requiredRoles.includes(userRole);
  }

  /**
   * Получение текущего пользователя
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Проверка авторизации
   */
  isAuth() {
    return this.isAuthenticated && this.currentUser !== null;
  }

  /**
   * Получение заголовков для API запросов
   */
  getApiHeaders() {
    if (!this.isAuth()) {
      throw new Error('Пользователь не авторизован');
    }
    
    return {
      'x-telegram-id': this.currentUser.telegram_id.toString(),
      'Content-Type': 'application/json'
    };
  }

  /**
   * Выполнение API запроса с авторизацией
   */
  async apiRequest(url, options = {}) {
    if (!this.isAuth()) {
      throw new Error('Пользователь не авторизован');
    }

    const headers = {
      ...this.getApiHeaders(),
      ...(options.headers || {})
    };

    return fetch(url, {
      ...options,
      headers
    });
  }

  /**
   * Логаут
   */
  logout() {
    this.currentUser = null;
    this.isAuthenticated = false;
    console.log('🚪 Пользователь вышел из системы');
  }

  /**
   * Отображение ошибки авторизации
   */
  showAuthError(message) {
    // Создаем экран ошибки
    document.body.innerHTML = `
      <div class="auth-error-screen">
        <div class="auth-error-card">
          <div class="auth-error-icon">🚫</div>
          <h2 class="auth-error-title">Доступ запрещен</h2>
          <p class="auth-error-message">${message}</p>
          <div class="auth-error-actions">
            <button onclick="window.location.reload()" class="auth-error-btn">
              🔄 Обновить страницу
            </button>
            <button onclick="window.history.back()" class="auth-error-btn secondary">
              ← Назад
            </button>
          </div>
          <div class="auth-error-help">
            <p>Нужна помощь? <a href="https://t.me/hanna_teaches" target="_blank">Написать в поддержку</a></p>
          </div>
        </div>
      </div>
    `;

    // Добавляем стили
    const style = document.createElement('style');
    style.textContent = `
      .auth-error-screen {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: var(--bg-color, #fff);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      
      .auth-error-card {
        background: var(--card-bg, #f8f9fa);
        border-radius: 16px;
        padding: 3rem 2rem;
        text-align: center;
        max-width: 400px;
        width: 100%;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--border-color, #e0e0e0);
      }
      
      .auth-error-icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
      }
      
      .auth-error-title {
        color: var(--error-color, #dc3545);
        margin: 0 0 1rem 0;
        font-size: 1.5rem;
        font-weight: 600;
      }
      
      .auth-error-message {
        color: var(--text-color, #202124);
        margin: 0 0 2rem 0;
        line-height: 1.5;
      }
      
      .auth-error-actions {
        display: flex;
        gap: 1rem;
        margin-bottom: 2rem;
        flex-wrap: wrap;
      }
      
      .auth-error-btn {
        flex: 1;
        background: var(--accent-color, #007aff);
        color: white;
        border: none;
        border-radius: 8px;
        padding: 12px 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: opacity 0.2s;
        min-width: 120px;
      }
      
      .auth-error-btn:hover {
        opacity: 0.9;
      }
      
      .auth-error-btn.secondary {
        background: var(--card-bg, #f8f9fa);
        color: var(--text-color, #202124);
        border: 1px solid var(--border-color, #e0e0e0);
      }
      
      .auth-error-help {
        font-size: 12px;
        color: var(--text-color, #202124);
        opacity: 0.7;
      }
      
      .auth-error-help a {
        color: var(--accent-color, #007aff);
        text-decoration: none;
      }
      
      .auth-error-help a:hover {
        text-decoration: underline;
      }
      
      @media (max-width: 480px) {
        .auth-error-card {
          padding: 2rem 1rem;
        }
        
        .auth-error-actions {
          flex-direction: column;
        }
      }
    `;
    
    document.head.appendChild(style);
  }
}

// Глобальный экземпляр системы авторизации
window.AuthSystem = AuthSystem;

// Утилитарная функция для быстрой инициализации
window.initAuth = async function(requiredRoles, onSuccess, onFail) {
  const auth = new AuthSystem();
  return auth.init(requiredRoles, onSuccess, onFail);
};

console.log('✅ AuthSystem загружен');
