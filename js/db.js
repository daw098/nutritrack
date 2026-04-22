/* ═══════════════════════════════════════════════════════
   NutriTrack — IndexedDB Data Layer
   Handles all persistent storage using IndexedDB
   ═══════════════════════════════════════════════════════ */

const DB_NAME = 'NutriTrackDB';
const DB_VERSION = 1;

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

  // ── Aggregations ──────────────────────────────────
  async getDailySummary(date) {
    const normalized = this._normalizeDate(date);
    const meals = await this.getMealsForDate(date);
    const activities = await this.getActivitiesForDate(date);
    const water = await this.getWaterForDate(date);
    const weight = await this.getWeightForDate(date);

    const totalCalories = meals.reduce((s, m) => s + (m.calories || 0), 0);
    const totalProtein = meals.reduce((s, m) => s + (m.protein || 0), 0);
    const totalCarbs = meals.reduce((s, m) => s + (m.carbs || 0), 0);
    const totalFat = meals.reduce((s, m) => s + (m.fat || 0), 0);
    const totalBurned = activities.reduce((s, a) => s + (a.caloriesBurned || 0), 0);

    return {
      date: normalized,
      meals,
      activities,
      waterMl: water,
      weight: weight ? weight.valueKg : null,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
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
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllWeights() {
    const store = this._tx('weights');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllActivities() {
    const store = this._tx('activities');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
}

// Export singleton
window.nutriDB = new NutriDB();
