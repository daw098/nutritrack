/* ═══════════════════════════════════════════════════════
   NutriTrack — IndexedDB Data Layer
   Handles all persistent storage using IndexedDB
   ═══════════════════════════════════════════════════════ */

const DB_NAME = 'NutriTrackDB';
const DB_VERSION = 3;

class NutriDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Profile store (single document)
        if (!db.objectStoreNames.contains('profile')) {
          db.createObjectStore('profile', { keyPath: 'id' });
        }

        // Weight entries
        if (!db.objectStoreNames.contains('weights')) {
          const ws = db.createObjectStore('weights', { keyPath: 'id' });
          ws.createIndex('date', 'date', { unique: false });
        }

        // Meal logs
        if (!db.objectStoreNames.contains('meals')) {
          const ms = db.createObjectStore('meals', { keyPath: 'id' });
          ms.createIndex('date', 'date', { unique: false });
          ms.createIndex('mealType', 'mealType', { unique: false });
        }

        // Custom foods
        if (!db.objectStoreNames.contains('customFoods')) {
          const fs = db.createObjectStore('customFoods', { keyPath: 'id' });
          fs.createIndex('name', 'name', { unique: false });
        }

        // Activity logs
        if (!db.objectStoreNames.contains('activities')) {
          const as = db.createObjectStore('activities', { keyPath: 'id' });
          as.createIndex('date', 'date', { unique: false });
        }

        // Water logs
        if (!db.objectStoreNames.contains('water')) {
          const wt = db.createObjectStore('water', { keyPath: 'id' });
          wt.createIndex('date', 'date', { unique: false });
        }

        // Heart rate logs
        if (!db.objectStoreNames.contains('heartRates')) {
          const hr = db.createObjectStore('heartRates', { keyPath: 'id' });
          hr.createIndex('date', 'date', { unique: false });
          hr.createIndex('context', 'context', { unique: false });
        }

        // Body measurements such as belly / waist circumference
        if (!db.objectStoreNames.contains('bodyMeasurements')) {
          const bm = db.createObjectStore('bodyMeasurements', { keyPath: 'id' });
          bm.createIndex('date', 'date', { unique: false });
          bm.createIndex('type', 'type', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Generic CRUD Methods ──────────────────────────
  _tx(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  async _add(storeName, data) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName, 'readwrite');
      const req = store.add(data);
      req.onsuccess = () => resolve(data);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _put(storeName, data) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName, 'readwrite');
      const req = store.put(data);
      req.onsuccess = () => resolve(data);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _get(storeName, id) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _getAll(storeName) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName, 'readwrite');
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _getByIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName);
      const index = store.index(indexName);
      const req = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async _getByDateRange(storeName, startDate, endDate) {
    return new Promise((resolve, reject) => {
      const store = this._tx(storeName);
      const index = store.index('date');
      const range = IDBKeyRange.bound(startDate, endDate);
      const req = index.getAll(range);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Profile ───────────────────────────────────────
  async getProfile() {
    return this._get('profile', 'user');
  }

  async saveProfile(profileData) {
    return this._put('profile', { id: 'user', ...profileData });
  }

  // ── Weight ────────────────────────────────────────
  async addWeight(entry) {
    const normalizedDate = this._normalizeDate(entry.date || new Date());
    const { date: _d, ...rest } = entry;
    const data = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      valueKg: entry.valueKg,
      note: entry.note || '',
      ...rest,
      date: normalizedDate
    };
    return this._add('weights', data);
  }

  async getWeights() {
    const all = await this._getAll('weights');
    return all.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getWeightForDate(date) {
    const normalized = this._normalizeDate(date);
    const entries = await this._getByIndex('weights', 'date', normalized);
    return entries.length > 0 ? entries[entries.length - 1] : null;
  }

  async deleteWeight(id) {
    return this._delete('weights', id);
  }

  // ── Meals ─────────────────────────────────────────
  async addMeal(entry) {
    const normalizedDate = this._normalizeDate(entry.date || new Date());
    const { date: _d, ...rest } = entry;
    const data = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...rest,
      date: normalizedDate
    };
    return this._add('meals', data);
  }

  async getMealsForDate(date) {
    const normalized = this._normalizeDate(date);
    return this._getByIndex('meals', 'date', normalized);
  }

  async getAllMeals() {
    const all = await this._getAll('meals');
    return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async deleteMeal(id) {
    return this._delete('meals', id);
  }

  // ── Activities ────────────────────────────────────
  async addActivity(entry) {
    const normalizedDate = this._normalizeDate(entry.date || new Date());
    const { date: _d, ...rest } = entry;
    const data = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...rest,
      date: normalizedDate
    };
    return this._add('activities', data);
  }

  async getActivitiesForDate(date) {
    const normalized = this._normalizeDate(date);
    return this._getByIndex('activities', 'date', normalized);
  }

  async getAllActivities() {
    const all = await this._getAll('activities');
    return all.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async deleteActivity(id) {
    return this._delete('activities', id);
  }

  // ── Water ─────────────────────────────────────────
  async addWater(amountMl, date = new Date()) {
    if (typeof amountMl === 'object' && amountMl !== null) {
      const entry = amountMl;
      const { date: _d, ...rest } = entry;
      const data = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...rest,
        amountMl: Number(entry.amountMl) || 0,
        date: this._normalizeDate(entry.date || date)
      };
      return this._add('water', data);
    }

    const data = {
      id: crypto.randomUUID(),
      date: this._normalizeDate(date),
      timestamp: new Date().toISOString(),
      amountMl
    };
    return this._add('water', data);
  }

  async getWaterForDate(date) {
    const normalized = this._normalizeDate(date);
    const entries = await this._getByIndex('water', 'date', normalized);
    return entries.reduce((sum, e) => sum + e.amountMl, 0);
  }

  async deleteWater(id) {
    return this._delete('water', id);
  }

  // ── Heart Rate ────────────────────────────────────
  async addHeartRate(entry) {
    const normalizedDate = this._normalizeDate(entry.date || new Date());
    const { date: _d, ...rest } = entry;
    const data = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...rest,
      bpm: Number(entry.bpm),
      context: entry.context || 'resting',
      note: entry.note || '',
      source: entry.source || 'manual',
      date: normalizedDate
    };
    return this._add('heartRates', data);
  }

  async getHeartRatesForDate(date) {
    const normalized = this._normalizeDate(date);
    const entries = await this._getByIndex('heartRates', 'date', normalized);
    return entries.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
  }

  async getLatestHeartRate() {
    const all = await this.getAllHeartRates();
    return all.length > 0 ? all[0] : null;
  }

  async deleteHeartRate(id) {
    return this._delete('heartRates', id);
  }

  // ── Body Measurements ─────────────────────────────
  async addBodyMeasurement(entry) {
    const normalizedDate = this._normalizeDate(entry.date || new Date());
    const { date: _d, ...rest } = entry;
    const data = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...rest,
      type: entry.type || 'belly',
      valueCm: Number(entry.valueCm),
      note: entry.note || '',
      date: normalizedDate
    };
    return this._add('bodyMeasurements', data);
  }

  async getBodyMeasurements(type = 'belly') {
    const entries = await this._getByIndex('bodyMeasurements', 'type', type);
    return entries.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
  }

  async getBodyMeasurementForDate(date, type = 'belly') {
    const normalized = this._normalizeDate(date);
    const entries = await this._getByIndex('bodyMeasurements', 'date', normalized);
    const matches = entries
      .filter(e => (e.type || 'belly') === type)
      .sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
    return matches.length > 0 ? matches[0] : null;
  }

  async getLatestBodyMeasurement(type = 'belly') {
    const all = await this.getBodyMeasurements(type);
    return all.length > 0 ? all[0] : null;
  }

  async deleteBodyMeasurement(id) {
    return this._delete('bodyMeasurements', id);
  }

  // ── Aggregations ──────────────────────────────────
  async getDailySummary(date) {
    const normalized = this._normalizeDate(date);
    const meals = await this.getMealsForDate(date);
    const activities = await this.getActivitiesForDate(date);
    const water = await this.getWaterForDate(date);
    const weight = await this.getWeightForDate(date);
    const heartRates = await this.getHeartRatesForDate(date);
    const bellyMeasurement = await this.getBodyMeasurementForDate(date, 'belly');

    const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
    const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
    const totalFat = meals.reduce((s, m) => s + (m.fat || 0), 0);
    const totalFiber = meals.reduce((s, m) => s + (m.fiber || 0), 0);
    const totalBurned = activities.reduce((s, a) => s + (a.caloriesBurned || 0), 0);

    return {
      date: normalized,
      meals,
      activities,
      heartRates,
      waterMl: water,
      weight: weight ? weight.valueKg : null,
      bellyMeasurement,
      latestHeartRate: heartRates.length > 0 ? heartRates[0] : null,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      totalFiber,
      totalBurned,
      netCalories: totalCalories - totalBurned
    };
  }

  // ── Utilities ─────────────────────────────────────
  _normalizeDate(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  getTodayStr() {
    return this._normalizeDate(new Date());
  }

  // ── Export Helpers (for data backup) ──────────────
  async getAllMeals() {
    const store = this._tx('meals');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        resolve(rows.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllWeights() {
    const store = this._tx('weights');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        resolve(rows.sort((a, b) => new Date(b.date) - new Date(a.date)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllActivities() {
    const store = this._tx('activities');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        resolve(rows.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllWater() {
    const store = this._tx('water');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        resolve(rows.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllHeartRates() {
    const store = this._tx('heartRates');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        resolve(rows.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getAllBodyMeasurements() {
    const store = this._tx('bodyMeasurements');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        resolve(rows.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date)));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async clearStore(storeName) {
    const store = this._tx(storeName, 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// Export singleton
window.nutriDB = new NutriDB();
