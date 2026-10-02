/**
 * Quasar ID & Messenger Client SDK for Meowave
 * Standard ES6 module and browser-compatible helper.
 */

class QuasarIDClient {
  /**
   * @param {Object} options
   * @param {string} [options.baseUrl='http://localhost:8088'] - Quasar API base URL
   * @param {string} [options.storageKey='quasar_auth_token'] - LocalStorage key for session
   */
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || 'http://localhost:8088').replace(/\/+$/, '');
    this.storageKey = options.storageKey || 'quasar_auth_token';
    this.userStorageKey = options.userStorageKey || 'quasar_user_data';
  }

  getToken() {
    try {
      return localStorage.getItem(this.storageKey) || null;
    } catch {
      return null;
    }
  }

  setToken(token) {
    try {
      if (token) {
        localStorage.setItem(this.storageKey, token);
      } else {
        localStorage.removeItem(this.storageKey);
      }
    } catch (e) {
      console.error('[QuasarSDK] Failed to save token:', e);
    }
  }

  getCurrentUser() {
    try {
      const data = localStorage.getItem(this.userStorageKey);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  setCurrentUser(user) {
    try {
      if (user) {
        localStorage.setItem(this.userStorageKey, JSON.stringify(user));
      } else {
        localStorage.removeItem(this.userStorageKey);
      }
    } catch (e) {
      console.error('[QuasarSDK] Failed to save user data:', e);
    }
  }

  async _request(endpoint, { method = 'GET', body = null, auth = true } = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Quasar-Client': 'meowave-desktop-v2'
    };

    if (auth) {
      const token = this.getToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }

    const res = await fetch(url, config);
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errorMsg = data.message || data.error || `HTTP ${res.status}`;
      throw new Error(errorMsg);
    }

    return data;
  }

  /**
   * Register a new Quasar ID
   */
  async register({ email, username, password }) {
    const data = await this._request('/api/v1/auth/register', {
      method: 'POST',
      body: { email, username, password },
      auth: false
    });

    if (data.token) {
      this.setToken(data.token);
      this.setCurrentUser(data.user);
    }
    return data;
  }

  /**
   * Login with Quasar ID (email or username) and password
   */
  async login({ identifier, password }) {
    const data = await this._request('/api/v1/auth/login', {
      method: 'POST',
      body: { identifier, password },
      auth: false
    });

    if (data.token) {
      this.setToken(data.token);
      this.setCurrentUser(data.user);
    }
    return data;
  }

  /**
   * Get user profile with pinned music and status
   */
  async getProfile() {
    const profile = await this._request('/api/v1/user/profile', { method: 'GET', auth: true });
    this.setCurrentUser(profile);
    return profile;
  }

  /**
   * Pin or update current track in Quasar Profile
   * @param {Object} track - Meowave track object { id, service, title, artist, artwork_url, duration }
   * @param {boolean} [broadcastStatus=true] - Broadcast "Now Playing" status to Messenger
   */
  async setProfileMusic(track, broadcastStatus = true) {
    return await this._request('/api/v1/user/profile/music', {
      method: 'PUT',
      body: { track, broadcast_status: broadcastStatus },
      auth: true
    });
  }

  /**
   * Sync chat messages from Meowave rooms with Quasar Messenger
   * @param {Array<Object>} messages - Array of { room_id, content, timestamp }
   */
  async syncMessages(messages) {
    return await this._request('/api/v1/messenger/sync', {
      method: 'POST',
      body: { messages },
      auth: true
    });
  }

  /**
   * Log out and clear local credentials
   */
  logout() {
    this.setToken(null);
    this.setCurrentUser(null);
  }
}

// Support both ES Module export and global window attach
if (typeof window !== 'undefined') {
  window.QuasarIDClient = QuasarIDClient;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { QuasarIDClient };
}
