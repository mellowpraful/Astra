// js/json-api.js
// Local-only JSON API shim that uses localStorage. This removes any dependency
// on server-side PHP endpoints and keeps the same async API shape so other
// code can continue calling window.erpJsonApi.getData/saveData.

(function(){
  'use strict';

  function keyToStorageName(key) {
    // keep keys as provided to preserve compatibility
    return String(key);
  }

  async function getData(key) {
    try {
      const s = localStorage.getItem(keyToStorageName(key));
      if (!s) return [];
      try {
        return JSON.parse(s);
      } catch (e) {
        console.warn('erpJsonApi.getData: corrupt JSON in localStorage for', key);
        return [];
      }
    } catch (e) {
      console.error('erpJsonApi.getData error', e);
      return [];
    }
  }

  async function saveData(key, data) {
    try {
      localStorage.setItem(keyToStorageName(key), JSON.stringify(data));
      return { ok: true };
    } catch (e) {
      console.error('erpJsonApi.saveData error', e);
      return { ok: false, error: String(e) };
    }
  }

  window.erpJsonApi = {
    available: false,
    getData: getData,
    saveData: saveData
  };

  // Export for CommonJS (node) if required by tests
  if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
    module.exports = window.erpJsonApi;
  }
})();
