<script>
// Minimal AuthSystem used by pages like student.html
class AuthSystem {
  constructor() {
    this.telegramId = null;
    this.user = null;
  }

  async init(allowedRoles = ['admin','tutor','student'], onSuccess, onFail) {
    try {
      // 1) достаем telegram id
      this.telegramId = this._getTelegramIdFromTG() || this._getTelegramIdFromQuery();
      if (!this.telegramId) throw new Error('Не удалось определить telegram_id');

      // 2) проверяем авторизацию на сервере
      const resp = await fetch('/api/simple-auth', {
        method: 'GET',
        headers: { 'x-telegram-id': this.telegramId }
      });

      const data = await resp.json();
      if (!resp.ok || data.authenticated !== true) {
        throw new Error(data.message || 'Не авторизован');
      }

      // 3) проверяем роль
      const role = data.user?.role;
      if (!allowedRoles.includes(role)) {
        throw new Error(`Недостаточно прав (${role}). Доступны: ${allowedRoles.join(', ')}`);
      }

      this.user = data.user;
      if (typeof onSuccess === 'function') onSuccess(this.user);
      return this.user;
    } catch (e) {
      if (typeof onFail === 'function') onFail(e);
      throw e;
    }
  }

  apiRequest(url, options = {}) {
    // добавим ?tgid=... для фолбэка и заголовок x-telegram-id
    const urlHasQuery = url.includes('?');
    const withTgid = this.telegramId ? `${url}${urlHasQuery ? '&' : '?'}tgid=${encodeURIComponent(this.telegramId)}` : url;

    const headers = {
      ...(options.headers || {}),
      'x-telegram-id': this.telegramId || '',
    };

    // если отправляем json — выставим content-type
    if (options.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    return fetch(withTgid, { ...options, headers });
  }

  _getTelegramIdFromTG() {
    try {
      const tg = window.Telegram?.WebApp;
      if (!tg) return null;
      tg.ready?.();
      const id = tg.initDataUnsafe?.user?.id;
      return id ? String(id) : null;
    } catch { return null; }
  }

  _getTelegramIdFromQuery() {
    const p = new URLSearchParams(window.location.search);
    const tgid = p.get('tgid') || p.get('telegram_id') || p.get('id');
    return tgid ? String(tgid) : null;
  }
}
</script>
