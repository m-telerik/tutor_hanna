// 📁 /js/navigation.js
// Универсальная навигационная система для разных ролей

class NavigationSystem {
  constructor() {
    this.currentUser = null;
    this.currentSection = 'overview';
    this.sections = {};
  }

  /**
   * Инициализация навигации
   * @param {Object} user - Объект пользователя с ролью
   * @param {string} containerId - ID контейнера для навигации
   */
  init(user, containerId = 'navigation-container') {
    this.currentUser = user;
    this.container = document.getElementById(containerId);
    
    if (!this.container) {
      console.warn('⚠️ Navigation container not found:', containerId);
      return;
    }

    this.setupSections();
    this.render();
    this.bindEvents();
    
    console.log('✅ Navigation system initialized for role:', user.role);
  }

  /**
   * Настройка секций в зависимости от роли
   */
  setupSections() {
    const role = this.currentUser?.role;

    switch (role) {
      case 'student':
        this.sections = {
          overview: {
            id: 'overview',
            title: 'Обзор',
            icon: '📊',
            description: 'Общая информация и статистика'
          },
          lessons: {
            id: 'lessons',
            title: 'Мои уроки',
            icon: '📚',
            description: 'Расписание и история занятий'
          },
          vocabulary: {
            id: 'vocabulary',
            title: 'Словарь',
            icon: '📝',
            description: 'Изученные слова и фразы'
          },
          progress: {
            id: 'progress',
            title: 'Прогресс',
            icon: '📈',
            description: 'Достижения и статистика обучения'
          },
          homework: {
            id: 'homework',
            title: 'Домашние задания',
            icon: '✏️',
            description: 'Текущие и выполненные задания'
          }
        };
        break;

      case 'tutor':
        this.sections = {
          dashboard: {
            id: 'dashboard',
            title: 'Панель управления',
            icon: '🎯',
            description: 'Общий обзор и статистика'
          },
          students: {
            id: 'students',
            title: 'Студенты',
            icon: '👥',
            description: 'Управление студентами'
          },
          schedule: {
            id: 'schedule',
            title: 'Расписание',
            icon: '📅',
            description: 'Планирование и управление уроками'
          },
          recurring: {
            id: 'recurring',
            title: 'Регулярные занятия',
            icon: '🔄',
            description: 'Настройка повторяющихся уроков'
          },
          materials: {
            id: 'materials',
            title: 'Материалы',
            icon: '📚',
            description: 'Учебные материалы и ресурсы'
          },
          analytics: {
            id: 'analytics',
            title: 'Аналитика',
            icon: '📊',
            description: 'Отчеты и статистика'
          }
        };
        break;

      case 'admin':
        this.sections = {
          overview: {
            id: 'overview',
            title: 'Обзор системы',
            icon: '🏠',
            description: 'Общая статистика платформы'
          },
          users: {
            id: 'users',
            title: 'Пользователи',
            icon: '👤',
            description: 'Управление пользователями'
          },
          tutors: {
            id: 'tutors',
            title: 'Тьюторы',
            icon: '👩‍🏫',
            description: 'Управление преподавателями'
          },
          students: {
            id: 'students',
            title: 'Студенты',
            icon: '🧑‍🎓',
            description: 'Управление студентами'
          },
          sessions: {
            id: 'sessions',
            title: 'Занятия',
            icon: '📚',
            description: 'Все занятия в системе'
          },
          chat_history: {
            id: 'chat_history',
            title: 'История чатов',
            icon: '💬',
            description: 'Диалоги с агентами'
          },
          settings: {
            id: 'settings',
            title: 'Настройки',
            icon: '⚙️',
            description: 'Системные настройки'
          }
        };
        break;

      default:
        this.sections = {
          overview: {
            id: 'overview',
            title: 'Главная',
            icon: '🏠',
            description: 'Основная информация'
          }
        };
    }
  }

  /**
   * Отрисовка навигации
   */
  render() {
    const sectionsArray = Object.values(this.sections);
    
    this.container.innerHTML = `
      <div class="navigation-panel">
        <div class="nav-tabs">
          ${sectionsArray.map(section => `
            <button 
              class="nav-tab ${section.id === this.currentSection ? 'active' : ''}" 
              data-section="${section.id}"
              title="${section.description}"
            >
              <span class="nav-icon">${section.icon}</span>
              <span class="nav-title">${section.title}</span>
            </button>
          `).join('')}
        </div>
      </div>
      
      <div class="nav-content">
        ${sectionsArray.map(section => `
          <div 
            class="nav-section ${section.id === this.currentSection ? 'active' : ''}" 
            id="${section.id}-section"
            data-section="${section.id}"
          >
            <div class="section-placeholder">
              <div class="placeholder-icon">${section.icon}</div>
              <h3>${section.title}</h3>
              <p>${section.description}</p>
              <div class="loading-state">
                <span class="loading-spinner"></span>
                <p>Загрузка контента...</p>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  /**
   * Привязка событий
   */
  bindEvents() {
    const tabs = this.container.querySelectorAll('.nav-tab');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const sectionId = e.currentTarget.dataset.section;
        this.switchToSection(sectionId);
      });
    });

    // Обработка swipe на мобильных устройствах
    this.setupSwipeNavigation();
  }

  /**
   * Переключение между секциями
   */
  switchToSection(sectionId) {
    if (!this.sections[sectionId]) {
      console.warn('⚠️ Unknown section:', sectionId);
      return;
    }

    // Обновляем активные элементы
    this.container.querySelectorAll('.nav-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.section === sectionId);
    });

    this.container.querySelectorAll('.nav-section').forEach(section => {
      section.classList.toggle('active', section.dataset.section === sectionId);
    });

    // Сохраняем текущую секцию
    this.currentSection = sectionId;

    // Вызываем событие переключения
    this.onSectionChange(sectionId);

    // Haptic feedback для Telegram
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }

    console.log('📍 Switched to section:', sectionId);
  }

  /**
   * Обработчик смены секции (переопределяется извне)
   */
  onSectionChange(sectionId) {
    // Это событие можно перехватить для загрузки контента
    const event = new CustomEvent('navigation:sectionChange', {
      detail: { sectionId, user: this.currentUser }
    });
    document.dispatchEvent(event);
  }

  /**
   * Обновление контента секции
   */
  updateSectionContent(sectionId, htmlContent) {
    const section = this.container.querySelector(`#${sectionId}-section`);
    if (section) {
      section.innerHTML = htmlContent;
    }
  }

  /**
   * Показать/скрыть загрузку в секции
   */
  setSectionLoading(sectionId, isLoading) {
    const section = this.container.querySelector(`#${sectionId}-section`);
    if (!section) return;

    if (isLoading) {
      section.innerHTML = `
        <div class="loading-state">
          <span class="loading-spinner"></span>
          <p>Загрузка...</p>
        </div>
      `;
    }
  }

  /**
   * Показать ошибку в секции
   */
  setSectionError(sectionId, errorMessage) {
    const section = this.container.querySelector(`#${sectionId}-section`);
    if (!section) return;

    section.innerHTML = `
      <div class="error-state">
        <div class="error-icon">⚠️</div>
        <h3>Ошибка загрузки</h3>
        <p>${errorMessage}</p>
        <button onclick="navigation.reloadSection('${sectionId}')" class="btn-primary">
          🔄 Попробовать снова
        </button>
      </div>
    `;
  }

  /**
   * Перезагрузка секции
   */
  reloadSection(sectionId) {
    this.setSectionLoading(sectionId, true);
    this.onSectionChange(sectionId);
  }

  /**
   * Настройка swipe навигации для мобильных
   */
  setupSwipeNavigation() {
    let startX = 0;
    let endX = 0;

    const content = this.container.querySelector('.nav-content');
    if (!content) return;

    content.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
    });

    content.addEventListener('touchend', (e) => {
      endX = e.changedTouches[0].clientX;
      this.handleSwipe();
    });
  }

  /**
   * Обработка swipe жестов
   */
  handleSwipe() {
    const threshold = 50; // Минимальное расстояние для swipe
    const diff = startX - endX;

    if (Math.abs(diff) < threshold) return;

    const sectionsArray = Object.keys(this.sections);
    const currentIndex = sectionsArray.indexOf(this.currentSection);

    if (diff > 0 && currentIndex < sectionsArray.length - 1) {
      // Swipe влево - следующая секция
      this.switchToSection(sectionsArray[currentIndex + 1]);
    } else if (diff < 0 && currentIndex > 0) {
      // Swipe вправо - предыдущая секция
      this.switchToSection(sectionsArray[currentIndex - 1]);
    }
  }

  /**
   * Получить текущую секцию
   */
  getCurrentSection() {
    return this.currentSection;
  }

  /**
   * Получить информацию о секции
   */
  getSectionInfo(sectionId) {
    return this.sections[sectionId] || null;
  }

  /**
   * Добавить кастомную секцию (для расширения)
   */
  addCustomSection(sectionConfig) {
    this.sections[sectionConfig.id] = sectionConfig;
    this.render();
    this.bindEvents();
  }
}

// Глобальный экземпляр
window.NavigationSystem = NavigationSystem;
window.navigation = null;

// Helper функция для инициализации
window.initNavigation = function(user, containerId) {
  window.navigation = new NavigationSystem();
  window.navigation.init(user, containerId);
  return window.navigation;
};

console.log('✅ Navigation system loaded');
