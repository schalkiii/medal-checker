const EventEmitter = require('events');

class ChromeEvent extends EventEmitter {
  addListener(cb) { this.on('event', cb); }
  removeListener(cb) { this.off('event', cb); }
  hasListener() { return this.listenerCount('event') > 0; }
}

function createChromeMock(config = {}) {
  const _storage = new Map();
  const listeners = new Map();
  let tabIdCounter = 0;

  const mock = {
    _storage,
    _listeners: listeners,
    _createdTabs: [],
    _sentMessages: [],
    _optionsPageOpened: false,

    storage: {
      local: {
        get(keys, callback) {
          if (typeof keys === 'function') { callback = keys; keys = null; }
          const result = {};
          if (keys === null || keys === undefined) {
            for (const [k, v] of _storage) result[k] = v;
          } else if (Array.isArray(keys)) {
            keys.forEach(k => { if (_storage.has(k)) result[k] = _storage.get(k); });
          } else if (typeof keys === 'object') {
            Object.keys(keys).forEach(k => {
              result[k] = _storage.has(k) ? _storage.get(k) : keys[k];
            });
          } else if (typeof keys === 'string') {
            result[keys] = _storage.get(keys);
          }
          if (callback) callback(result);
          return Promise.resolve(result);
        },
        set(items, callback) {
          Object.entries(items).forEach(([k, v]) => _storage.set(k, v));
          if (callback) setTimeout(callback, 0);
          return Promise.resolve();
        },
        remove(keys, callback) {
          const arr = Array.isArray(keys) ? keys : [keys];
          arr.forEach(k => _storage.delete(k));
          if (callback) setTimeout(callback, 0);
          return Promise.resolve();
        }
      }
    },

    cookies: {
      getAll(details, callback) {
        const cookies = config.cookies || [];
        const result = typeof details === 'function'
          ? cookies
          : cookies.filter(c => {
              if (details.url && !c.url?.startsWith(details.url.replace(/\/+$/, ''))) return false;
              if (details.domain && !c.domain?.includes(details.domain.replace(/^\./, ''))) return false;
              return true;
            });
        if (callback) setTimeout(() => callback(result), 0);
        return Promise.resolve(result);
      }
    },

    runtime: {
      sendMessage(message) {
        mock._sentMessages.push(message);
        const handler = listeners.get('runtime.onMessage');
        if (handler) {
          handler(message, { id: 'mock-sender' }, (response) => {
            mock._lastResponse = response;
          });
        }
        return Promise.resolve();
      },
      onMessage: {
        addListener(cb) { listeners.set('runtime.onMessage', cb); },
        removeListener() { listeners.delete('runtime.onMessage'); }
      },
      onInstalled: new ChromeEvent(),
      onStartup: new ChromeEvent(),
      openOptionsPage() {
        mock._optionsPageOpened = true;
        return Promise.resolve();
      }
    },

    alarms: {
      _created: [],
      _cleared: false,
      create(name, options) {
        mock.alarms._created.push({ name, options });
      },
      clear(name, callback) {
        mock.alarms._cleared = true;
        if (callback) setTimeout(callback, 0);
      },
      onAlarm: new ChromeEvent()
    },

    tabs: {
      create({ url, active }) {
        const tab = { id: ++tabIdCounter, url, active };
        mock._createdTabs.push(tab);
        return Promise.resolve(tab);
      }
    },

    action: {
      onClicked: new ChromeEvent()
    },

    reset() {
      _storage.clear();
      listeners.clear();
      mock._createdTabs = [];
      mock._sentMessages = [];
      mock._optionsPageOpened = false;
      mock._lastResponse = null;
      mock.alarms._created = [];
      mock.alarms._cleared = false;
    }
  };

  return mock;
}

module.exports = { createChromeMock };