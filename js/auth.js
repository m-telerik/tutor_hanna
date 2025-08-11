// 📁 /js/auth.js
// Универсальная система авторизации для Telegram Mini App и браузера

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
   * Автоматически определяет контекст (Telegram WebApp или браузер)
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
      // Определяем контекст
      if (this.isTelegramWebApp()) {
        console.log('📱 Обнаружен Telegram WebApp');
        return await this.initTelegramAuth();
      } else {
        console.log('🌐 Обнаружен браузер');
        return await this.initBrowserAuth();
      }

    } catch (error) {
      console.error('❌ Ошибка авторизации:', error);
      
      if (this.onAuthFail) {
        this.onAuthFail(error);
      } else {
        this.showAuthError(error.message);
      }
      
      throw error;
    }
  }

  /**
   * Проверка, работаем ли мы в Telegram WebApp
   */
  isTelegramWebApp() {
    return !!(window.Telegram?.WebApp?.initDataUnsafe?.user);
  }

  /**
   * Инициализация авторизации через Telegram WebApp
   */
  async initTelegramAuth() {
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
      throw new Error(`Недостаточно прав. Требуется роль: ${this.requiredRoles.join(' или ')}, у вас: ${userRole.role}`);
    }

    // Сохраняем пользователя
    this.currentUser = {
      ...telegramUser,
      ...userRole,
      authenticatedAt: Date.now(),
      authMethod: 'telegram'
    };
    
    this.isAuthenticated = true;
    
    console.log('✅ Telegram авторизация успешна:', this.currentUser);
    
    if (this.onAuthSuccess) {
      this.onAuthSuccess(this.currentUser);
    }
    
    return this.currentUser;
  }

  /**
   * Инициализация авторизации через браузер
   */
  async initBrowserAuth() {
    // Проверяем сохраненную сессию
    const savedSession = this.getSavedBrowserSession();
    if (savedSession && this.isValidBrowserSession(savedSession)) {
      this.currentUser = savedSession.user;
      this.isAuthenticated = true;
      
      if (this.hasAccess(savedSession.user.role)) {
        console.log('✅ Восстановлена браузерная сессия:', this.currentUser);
        if (this.onAuthSuccess) {
          this.onAuthSuccess(this.currentUser);
        }
        return this.currentUser;
      }
    }

    // Показываем форму авторизации
    await this.showBrowserLoginForm();
    return null;
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
            telegram_id: user.id,
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
          telegram_id: 618647337,
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
   * Получение сохраненной браузерной сессии
   */
  getSavedBrowserSession() {
    try {
      const sessionData = localStorage.getItem('hanna_admin_session');
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      console.error('Ошибка чтения сессии:', error);
      return null;
    }
  }

  /**
   * Проверка валидности браузерной сессии
   */
  isValidBrowserSession(session) {
    if (!session || !session.user || !session.expiresAt) {
      return false;
    }
    
    // Проверяем срок действия (24 часа)
    return new Date(session.expiresAt) > new Date();
  }

  /**
   * Сохранение браузерной сессии
   */
  saveBrowserSession(user) {
    const session = {
      user,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 часа
      createdAt: new Date().toISOString()
    };
    
    localStorage.setItem('hanna_admin_session', JSON.stringify(session));
  }

  /**
   * Авторизация по паролю (для браузера)
   */
  async authenticateWithPassword(password, additionalData = {}) {
    try {
      // Отправляем пароль на сервер для проверки
      const response = await fetch('/api/browser-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          password,
          ...additionalData
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }

      const userData = await response.json();
      console.log('✅ Авторизация по паролю успешна:', userData);

      // Проверяем доступ
      if (!this.hasAccess(userData.role)) {
        throw new Error(`Недостаточно прав. Требуется роль: ${this.requiredRoles.join(' или ')}, у вас: ${userData.role}`);
      }

      // Сохраняем пользователя
      this.currentUser = {
        ...userData,
        authenticatedAt: Date.now(),
        authMethod: 'browser_password'
      };
      
      this.isAuthenticated = true;
      this.saveBrowserSession(this.currentUser);
      
      // Убираем форму авторизации
      this.hideBrowserLoginForm();
      
      if (this.onAuthSuccess) {
        this.onAuthSuccess(this.currentUser);
      }
      
      return this.currentUser;

    } catch (error) {
      console.error('❌ Ошибка авторизации по паролю:', error);
      throw error;
    }
  }

  /**
   * Показ формы авторизации для браузера
   */
  async showBrowserLoginForm() {
    return new Promise((resolve, reject) => {
      // Создаем форму авторизации
      const loginForm = document.createElement('div');
      loginForm.id = 'browser-login-form';
      loginForm.innerHTML = `
        <div class="browser-auth-screen">
          <div class="browser-auth-card">
            <div class="browser-auth-icon">🔐</div>
            <h2 class="browser-auth-title">Вход в систему</h2>
            <p class="browser-auth-subtitle">Введите пароль для доступа к панели управления Hanna English & French</p>
            
            <form id="browser-auth-form">
              <div class="browser-auth-field">
                <label for="admin-password">Пароль:</label>
                <input 
                  type="password" 
                  id="admin-password" 
                  name="password" 
                  required 
                  placeholder="Введите пароль"
                  autocomplete="current-password"
                />
              </div>
              
              <div class="browser-auth-field">
                <label for="admin-name">Имя (опционально):</label>
                <input 
                  type="text" 
                  id="admin-name" 
                  name="name" 
                  placeholder="Ваше имя"
                  autocomplete="name"
                />
              </div>
              
              <div class="browser-auth-actions">
                <button type="submit" class="browser-auth-btn" id="login-btn">
                  🚀 Войти
                </button>
              </div>
              
              <div class="browser-auth-error" id="auth-error" style="display: none;">
                <!-- Ошибки будут показаны здесь -->
              </div>
            </form>
            
            <div class="browser-auth-help">
              <p><strong>Доступные роли:</strong></p>
              <ul style="text-align: left; margin: 1rem 0;">
                <li><strong>Админ:</strong> полный доступ ко всем функциям</li>
                <li><strong>Тьютор:</strong> доступ к студентам и урокам</li>
              </ul>
              <p><small>Пароль можно получить у разработчика. Сессия действует 24 часа.</small></p>
            </div>
          </div>
        </div>
      `;

      // Добавляем стили
      this.addBrowserAuthStyles();
      
      document.body.appendChild(loginForm);

      // Добавляем обработчик формы
      const authForm = document.getElementById('browser-auth-form');
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const password = formData.get('password');
        const name = formData.get('name') || 'Пользователь';
        
        const loginBtn = document.getElementById('login-btn');
        const errorDiv = document.getElementById('auth-error');
        
        // Показываем загрузку
        loginBtn.disabled = true;
        loginBtn.textContent = '🔄 Вход...';
        errorDiv.style.display = 'none';
        
        try {
          const user = await this.authenticateWithPassword(password, { name });
          resolve(user);
        } catch (error) {
          // Показываем ошибку
          errorDiv.innerHTML = `
            <strong>Ошибка входа:</strong><br>
            ${error.message}
          `;
          errorDiv.style.display = 'block';
          
          // Сбрасываем кнопку
          loginBtn.disabled = false;
          loginBtn.textContent = '🚀 Войти';
          
          // Не reject, позволяем пользователю попробовать снова
        }
      });
    });
  }

  /**
   * Добавление стилей для браузерной авторизации
   */
  addBrowserAuthStyles() {
    if (document.getElementById('browser-auth-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'browser-auth-styles';
    style.textContent = `
      .browser-auth-screen {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, var(--bg-color, #f5f5f5) 0%, var(--card-bg, #ffffff) 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 2rem;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        z-index: 10000;
      }
      
      .browser-auth-card {
        background: var(--card-bg, #ffffff);
        border-radius: 20px;
        padding: 3rem 2rem;
        text-align: center;
        max-width: 450px;
        width: 100%;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.1);
        border: 1px solid var(--border-color, #e0e0e0);
      }
      
      .browser-auth-icon {
        font-size: 4rem;
        margin-bottom: 1.5rem;
      }
      
      .browser-auth-title {
        color: var(--accent-color, #007aff);
        margin: 0 0 1rem 0;
        font-size: 1.8rem;
        font-weight: 600;
      }
      
      .browser-auth-subtitle {
        color: var(--text-color, #202124);
        margin: 0 0 2rem 0;
        line-height: 1.5;
        opacity: 0.8;
      }
      
      .browser-auth-field {
        margin-bottom: 1.5rem;
        text-align: left;
      }
      
      .browser-auth-field label {
        display: block;
        margin-bottom: 0.5rem;
        font-weight: 500;
        color: var(--text-color, #202124);
      }
      
      .browser-auth-field input {
        width: 100%;
        padding: 12px 16px;
        border: 2px solid var(--border-color, #e0e0e0);
        border-radius: 12px;
        font-size: 16px;
        background: var(--input-bg, #ffffff);
        color: var(--text-color, #202124);
        transition: border-color 0.2s;
        box-sizing: border-box;
      }
      
      .browser-auth-field input:focus {
        outline: none;
        border-color: var(--accent-color, #007aff);
        box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
      }
      
      .browser-auth-actions {
        margin-bottom: 2rem;
      }
      
      .browser-auth-btn {
        width: 100%;
        background: linear-gradient(135deg, var(--accent-color, #007aff) 0%, #5856d6 100%);
        color: white;
        border: none;
        border-radius: 12px;
        padding: 14px 24px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .browser-auth-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 8px 25px rgba(0, 122, 255, 0.3);
      }
      
      .browser-auth-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
        transform: none;
      }
      
      .browser-auth-error {
        background: rgba(220, 53, 69, 0.1);
        color: var(--error-color, #dc3545);
        border: 1px solid rgba(220, 53, 69, 0.2);
        border-radius: 8px;
        padding: 1rem;
        margin-top: 1rem;
        text-align: left;
      }
      
      .browser-auth-help {
        font-size: 12px;
        color: var(--text-color, #202124);
        opacity: 0.7;
        line-height: 1.4;
      }
      
      .browser-auth-help p {
        margin: 0.5rem 0;
      }
      
      .browser-auth-help ul {
        margin: 0.5rem 0;
        padding-left: 1.2rem;
      }
      
      .browser-auth-help li {
        margin: 0.3rem 0;
      }
      
      @media (max-width: 480px) {
        .browser-auth-card {
          padding: 2rem 1rem;
          margin: 1rem;
        }
        
        .browser-auth-title {
          font-size: 1.5rem;
        }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * Скрытие формы авторизации браузера
   */
  hideBrowserLoginForm() {
    const loginForm = document.getElementById('browser-login-form');
    if (loginForm) {
      loginForm.remove();
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
    
    if (this.currentUser.authMethod === 'browser_password') {
      return {
        'x-admin-token': this.currentUser.token || 'browser-auth',
        'x-admin-id': this.currentUser.admin_id || '1',
        'Content-Type': 'application/json'
      };
    } else {
      return {
        'x-telegram-id': this.currentUser.telegram_id.toString(),
        'Content-Type': 'application/json'
      };
    }
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
    
    // Очищаем браузерную сессию если она есть
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('hanna_admin_session');
    }
    
    console.log('🚪 Пользователь вышел из системы');
    window.location.reload();
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
