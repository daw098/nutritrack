/* ═══════════════════════════════════════════════════════
   NutriTrack — Main Application Logic
   Handles routing, rendering, user interactions
   ═══════════════════════════════════════════════════════ */

class NutriApp {
  constructor() {
    this.currentPage = 'dashboard';
    this.currentDate = new Date();
    this.profile = null;
    this.selectedMealType = 'breakfast';
    this.selectedActivityType = null;
    this.foodServings = 1;
  }

  // ══════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════
  async init() {
    await window.nutriDB.init();
    this.profile = await window.nutriDB.getProfile();

    if (!this.profile) {
      this.showOnboarding();
    } else {
      this.hideOnboarding();
      this.navigateTo('dashboard');
    }

    this.bindNavigation();
    this.bindGlobalEvents();
    this.updateHeaderDate();
  }

  // ── Navigation ────────────────────────────────────
  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const page = item.dataset.page;
        if (page === 'add') {
          this.showQuickAddModal();
          return;
        }
        this.navigateTo(page);
      });
    });
  }

  navigateTo(page) {
    this.currentPage = page;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (activeNav) activeNav.classList.add('active');

    // Show page
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const pageEl = document.getElementById(`page-${page}`);
    if (pageEl) {
      pageEl.classList.add('active');
      // Re-trigger animation
      pageEl.style.animation = 'none';
      pageEl.offsetHeight; // Force reflow
      pageEl.style.animation = '';
    }

    // Load page data
    this.loadPageData(page);
  }

  async loadPageData(page) {
    switch(page) {
      case 'dashboard': await this.renderDashboard(); break;
      case 'food':      await this.renderFoodPage(); break;
      case 'weight':    await this.renderWeightPage(); break;
      case 'activity':  await this.renderActivityPage(); break;
      case 'progress':  await this.renderProgressPage(); break;
    }
  }

  // ── Header ────────────────────────────────────────
  updateHeaderDate() {
    const el = document.getElementById('header-date');
    if (el) {
      const opts = { weekday: 'long', month: 'long', day: 'numeric' };
      el.textContent = this.currentDate.toLocaleDateString('en-US', opts);
    }
  }

  // ══════════════════════════════════════════════════
  // ONBOARDING
  // ══════════════════════════════════════════════════
  showOnboarding() {
    document.getElementById('onboarding').classList.remove('hidden');
    this.onboardingStep = 0;
    this.onboardingData = {};
    this.renderOnboardingStep();
  }

  hideOnboarding() {
    document.getElementById('onboarding').classList.add('hidden');
  }

  renderOnboardingStep() {
    document.querySelectorAll('.onboarding-step').forEach(s => s.classList.remove('active'));
    const step = document.querySelector(`.onboarding-step[data-step="${this.onboardingStep}"]`);
    if (step) step.classList.add('active');

    // Update dots
    document.querySelectorAll('.onboarding-dot').forEach((dot, i) => {
      dot.classList.remove('active', 'done');
      if (i === this.onboardingStep) dot.classList.add('active');
      else if (i < this.onboardingStep) dot.classList.add('done');
    });
  }

  nextOnboardingStep() {
    const steps = document.querySelectorAll('.onboarding-step');
    if (this.onboardingStep < steps.length - 1) {
      this.collectOnboardingData();
      this.onboardingStep++;
      this.renderOnboardingStep();
    }
  }

  prevOnboardingStep() {
    if (this.onboardingStep > 0) {
      this.onboardingStep--;
      this.renderOnboardingStep();
    }
  }

  collectOnboardingData() {
    const step = this.onboardingStep;
    if (step === 0) {
      this.onboardingData.name = document.getElementById('ob-name')?.value || 'User';
      this.onboardingData.sex = document.getElementById('ob-sex')?.value || 'other';
      this.onboardingData.dob = document.getElementById('ob-dob')?.value || '1990-01-01';
    } else if (step === 1) {
      this.onboardingData.heightCm = parseFloat(document.getElementById('ob-height')?.value) || 170;
      this.onboardingData.currentWeight = parseFloat(document.getElementById('ob-weight')?.value) || 75;
      this.onboardingData.unit = document.getElementById('ob-unit')?.value || 'metric';
    } else if (step === 2) {
      this.onboardingData.goal = document.querySelector('.goal-option.selected')?.dataset.goal || 'maintain';
      this.onboardingData.targetWeight = parseFloat(document.getElementById('ob-target-weight')?.value) || this.onboardingData.currentWeight;
      this.onboardingData.activityLevel = document.getElementById('ob-activity')?.value || 'moderate';
    }
  }

  async finishOnboarding() {
    this.collectOnboardingData();
    const d = this.onboardingData;

    // Calculate BMR & targets
    const age = this.calculateAge(d.dob);
    const bmr = this.calculateBMR(d.sex, d.currentWeight, d.heightCm, age);
    const tdee = this.calculateTDEE(bmr, d.activityLevel);
    const calorieTarget = this.adjustCaloriesForGoal(tdee, d.goal);

    // Macro split: 30% protein, 40% carbs, 30% fat
    const proteinG = Math.round((calorieTarget * 0.30) / 4);
    const carbsG = Math.round((calorieTarget * 0.40) / 4);
    const fatG = Math.round((calorieTarget * 0.30) / 9);

    this.profile = {
      name: d.name,
      sex: d.sex,
      dob: d.dob,
      heightCm: d.heightCm,
      currentWeight: d.currentWeight,
      targetWeight: d.targetWeight,
      unit: d.unit,
      goal: d.goal,
      activityLevel: d.activityLevel,
      calorieTarget,
      proteinTarget: proteinG,
      carbsTarget: carbsG,
      fatTarget: fatG,
      waterTarget: 2500,
      createdAt: new Date().toISOString()
    };

    await window.nutriDB.saveProfile(this.profile);

    // Save initial weight
    await window.nutriDB.addWeight({
      valueKg: d.currentWeight,
      date: new Date()
    });

    this.hideOnboarding();
    this.navigateTo('dashboard');
    this.showToast('🎉 Welcome to NutriTrack!', 'success');
  }

  // ── BMR & TDEE Calculations ───────────────────────
  calculateAge(dob) {
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (now.getMonth() < birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  }

  calculateBMR(sex, weightKg, heightCm, age) {
    if (sex === 'female') {
      return 447.593 + (9.247 * weightKg) + (3.098 * heightCm) - (4.330 * age);
    }
    return 88.362 + (13.397 * weightKg) + (4.799 * heightCm) - (5.677 * age);
  }

  calculateTDEE(bmr, activity) {
    const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, veryActive: 1.9 };
    return Math.round(bmr * (mult[activity] || 1.55));
  }

  adjustCaloriesForGoal(tdee, goal) {
    switch (goal) {
      case 'lose':   return tdee - 500;
      case 'gain':   return tdee + 300;
      default:       return tdee;
    }
  }

  // ══════════════════════════════════════════════════
  // DASHBOARD
  // ══════════════════════════════════════════════════
  async renderDashboard() {
    if (!this.profile) return;

    const summary = await window.nutriDB.getDailySummary(this.currentDate);
    const target = this.profile.calorieTarget;
    const remaining = Math.max(0, target - summary.totalCalories);

    // Greeting
    const greetEl = document.getElementById('dash-greeting');
    if (greetEl) {
      const hour = new Date().getHours();
      let emoji = '🌅', text = 'Good morning';
      if (hour >= 12 && hour < 17) { emoji = '☀️'; text = 'Good afternoon'; }
      else if (hour >= 17) { emoji = '🌙'; text = 'Good evening'; }
      greetEl.innerHTML = `<h2><span class="greeting-emoji">${emoji}</span>${text}, ${this.profile.name}</h2>
        <p>${this.formatDate(this.currentDate)}</p>`;
    }

    // Calorie ring
    window.nutriCharts.drawCalorieRing(
      'calorie-ring',
      summary.totalCalories, target,
      summary.totalProtein, summary.totalCarbs, summary.totalFat,
      this.profile.proteinTarget, this.profile.carbsTarget, this.profile.fatTarget
    );

    // Center numbers
    document.getElementById('cal-remaining').textContent = remaining;
    document.getElementById('cal-subtitle').textContent =
      `${summary.totalCalories} eaten • ${target} goal`;

    // Macro pills
    document.getElementById('macro-protein').textContent =
      `${Math.round(summary.totalProtein)}/${this.profile.proteinTarget}g`;
    document.getElementById('macro-carbs').textContent =
      `${Math.round(summary.totalCarbs)}/${this.profile.carbsTarget}g`;
    document.getElementById('macro-fat').textContent =
      `${Math.round(summary.totalFat)}/${this.profile.fatTarget}g`;

    // Weight stat
    const weights = await window.nutriDB.getWeights();
    const latestWeight = weights.length > 0 ? weights[0] : null;
    const prevWeight = weights.length > 1 ? weights[1] : null;
    const weightEl = document.getElementById('dash-weight-value');
    const weightChangeEl = document.getElementById('dash-weight-change');
    if (weightEl && latestWeight) {
      const displayWeight = this.profile.unit === 'imperial'
        ? (latestWeight.valueKg * 2.205).toFixed(1)
        : latestWeight.valueKg.toFixed(1);
      const unit = this.profile.unit === 'imperial' ? 'lbs' : 'kg';
      weightEl.textContent = displayWeight;
      document.getElementById('dash-weight-unit').textContent = unit;

      if (prevWeight && weightChangeEl) {
        const diff = latestWeight.valueKg - prevWeight.valueKg;
        const sign = diff > 0 ? '+' : '';
        const cls = diff < 0 ? 'positive' : diff > 0 ? 'negative' : 'neutral';
        const arrow = diff < 0 ? '↓' : diff > 0 ? '↑' : '→';
        weightChangeEl.className = `stat-change ${cls}`;
        weightChangeEl.textContent = `${arrow} ${sign}${diff.toFixed(1)} this week`;
      }
    }

    // Water stat
    const waterMl = summary.waterMl;
    const waterTarget = this.profile.waterTarget || 2500;
    const waterPct = Math.min(waterMl / waterTarget * 100, 100);
    document.getElementById('dash-water-value').textContent = (waterMl / 1000).toFixed(1);
    document.getElementById('dash-water-target').textContent = `/${(waterTarget/1000).toFixed(1)}L`;
    document.getElementById('dash-water-fill').style.width = `${waterPct}%`;

    // Meals list
    this.renderDashboardMeals(summary.meals);

    // Activity
    this.renderDashboardActivity(summary.activities, summary.totalBurned);
  }

  renderDashboardMeals(meals) {
    const types = ['breakfast', 'lunch', 'dinner', 'snack'];
    const icons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍪' };
    const container = document.getElementById('dash-meals');
    if (!container) return;

    let html = '';
    for (const type of types) {
      const typeMeals = meals.filter(m => m.mealType === type);
      const totalCal = typeMeals.reduce((s, m) => s + (m.calories || 0), 0);
      const count = typeMeals.length;

      html += `
        <div class="meal-item" onclick="app.navigateToMeal('${type}')">
          <div class="meal-left">
            <div class="meal-icon ${type}">${icons[type]}</div>
            <div class="meal-info">
              <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
              <p>${count > 0 ? `${count} item${count > 1 ? 's' : ''} logged` : 'Tap to add'}</p>
            </div>
          </div>
          <div class="meal-right">
            ${count > 0
              ? `<span class="meal-calories">${totalCal}</span><span class="meal-calories-unit"> kcal</span>`
              : '<button class="meal-add-btn">+</button>'
            }
          </div>
        </div>`;
    }
    container.innerHTML = html;
  }

  renderDashboardActivity(activities, totalBurned) {
    const container = document.getElementById('dash-activity');
    if (!container) return;

    if (activities.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 20px 0">
          <p style="color: var(--text-muted); font-size: 0.82rem;">No activities logged today</p>
        </div>`;
      return;
    }

    let html = '';
    for (const a of activities) {
      html += `
        <div class="activity-item">
          <div class="activity-left">
            <div class="activity-icon">${this.getActivityEmoji(a.type)}</div>
            <div class="activity-info">
              <h4>${a.name}</h4>
              <p>${a.durationMinutes} min</p>
            </div>
          </div>
          <span class="activity-cal">-${a.caloriesBurned} kcal</span>
        </div>`;
    }
    container.innerHTML = html;
  }

  navigateToMeal(type) {
    this.selectedMealType = type;
    this.navigateTo('food');
    // Set active tab
    setTimeout(() => {
      document.querySelectorAll('.meal-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.meal === type);
      });
    }, 50);
  }

  // ══════════════════════════════════════════════════
  // FOOD PAGE
  // ══════════════════════════════════════════════════
  async renderFoodPage() {
    // Bind search
    const searchInput = document.getElementById('food-search');
    if (searchInput && !searchInput._bound) {
      searchInput._bound = true;
      searchInput.addEventListener('input', (e) => {
        this.renderFoodResults(e.target.value);
      });
    }

    // Bind meal tabs
    document.querySelectorAll('.meal-tab').forEach(tab => {
      if (!tab._bound) {
        tab._bound = true;
        tab.addEventListener('click', () => {
          document.querySelectorAll('.meal-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          this.selectedMealType = tab.dataset.meal;
          this.renderLoggedMeals();
        });
      }
    });

    // Initial render
    this.renderFoodResults('');
    this.renderLoggedMeals();
  }

  renderFoodResults(query) {
    const results = searchFoods(query);
    const container = document.getElementById('food-results');
    if (!container) return;

    container.innerHTML = results.map(food => `
      <div class="food-result" onclick="app.showFoodDetailModal(${JSON.stringify(food).replace(/"/g, '&quot;')})">
        <div class="food-result-info">
          <h4>${food.name}</h4>
          <p>${food.serving} • P:${food.protein}g C:${food.carbs}g F:${food.fat}g</p>
        </div>
        <span class="food-result-cal">${food.cal} kcal</span>
      </div>
    `).join('');
  }

  async renderLoggedMeals() {
    const meals = await window.nutriDB.getMealsForDate(this.currentDate);
    const filtered = meals.filter(m => m.mealType === this.selectedMealType);
    const container = document.getElementById('logged-meals');
    if (!container) return;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🍽</div>
          <h3>No ${this.selectedMealType} logged</h3>
          <p>Search for food above to add it</p>
        </div>`;
      return;
    }

    const total = filtered.reduce((s, m) => s + (m.calories || 0), 0);
    container.innerHTML = `
      <div class="card-header">
        <span class="card-title">Logged (${filtered.length} items • ${total} kcal)</span>
      </div>
      ${filtered.map(m => `
        <div class="logged-entry">
          <div class="logged-entry-info">
            <h4>${m.name}</h4>
            <span class="entry-macros">
              P:${Math.round(m.protein)}g • C:${Math.round(m.carbs)}g • F:${Math.round(m.fat)}g
              ${m.servings !== 1 ? ` • ${m.servings} serving${m.servings > 1 ? 's' : ''}` : ''}
            </span>
          </div>
          <span class="logged-entry-cal">${m.calories}</span>
          <button class="logged-entry-delete" onclick="app.deleteMealEntry('${m.id}')">✕</button>
        </div>
      `).join('')}`;
  }

  showFoodDetailModal(food) {
    this.foodServings = 1;
    const modal = document.getElementById('food-detail-modal');

    document.getElementById('fd-name').textContent = food.name;
    document.getElementById('fd-serving').textContent = food.serving;
    this.currentFood = food;
    this.updateFoodDetailValues();

    modal.classList.add('active');
  }

  updateFoodDetailValues() {
    const f = this.currentFood;
    const s = this.foodServings;
    document.getElementById('fd-qty').textContent = s.toFixed(1);
    document.getElementById('fd-cal').textContent = Math.round(f.cal * s);
    document.getElementById('fd-protein').textContent = (f.protein * s).toFixed(1) + 'g';
    document.getElementById('fd-carbs').textContent = (f.carbs * s).toFixed(1) + 'g';
    document.getElementById('fd-fat').textContent = (f.fat * s).toFixed(1) + 'g';
  }

  adjustServings(delta) {
    this.foodServings = Math.max(0.1, Math.round((this.foodServings + delta) * 10) / 10);
    this.updateFoodDetailValues();
  }

  async addFoodToMeal() {
    const f = this.currentFood;
    const s = this.foodServings;

    await window.nutriDB.addMeal({
      name: f.name,
      mealType: this.selectedMealType,
      calories: Math.round(f.cal * s),
      protein: Math.round(f.protein * s * 10) / 10,
      carbs: Math.round(f.carbs * s * 10) / 10,
      fat: Math.round(f.fat * s * 10) / 10,
      servings: s,
      servingSize: f.serving,
      date: this.currentDate
    });

    this.closeModal('food-detail-modal');
    this.showToast(`✅ ${f.name} added to ${this.selectedMealType}`, 'success');
    this.renderLoggedMeals();
  }

  async deleteMealEntry(id) {
    await window.nutriDB.deleteMeal(id);
    this.renderLoggedMeals();
    this.showToast('🗑 Entry removed', 'info');
  }

  // ══════════════════════════════════════════════════
  // WEIGHT PAGE
  // ══════════════════════════════════════════════════
  async renderWeightPage() {
    if (!this.profile) return;

    const weights = await window.nutriDB.getWeights();
    const current = weights.length > 0 ? weights[0].valueKg : this.profile.currentWeight;

    // Slider
    const slider = document.getElementById('weight-slider');
    const display = document.getElementById('weight-display');
    if (slider) {
      slider.min = Math.max(30, current - 20);
      slider.max = current + 20;
      slider.step = 0.1;
      slider.value = current;
      display.textContent = this.formatWeight(current);

      if (!slider._bound) {
        slider._bound = true;
        slider.addEventListener('input', (e) => {
          display.textContent = this.formatWeight(parseFloat(e.target.value));
        });
      }
    }

    // Chart
    const chartWeights = this.filterWeightsByPeriod(weights, 'month');
    window.nutriCharts.drawWeightChart('weight-chart', chartWeights, this.profile.targetWeight);

    // Stats
    if (weights.length > 0) {
      const first = weights[weights.length - 1];
      const totalChange = current - first.valueKg;
      const toGoal = this.profile.targetWeight ? (current - this.profile.targetWeight) : 0;

      document.getElementById('ws-current').textContent = this.formatWeight(current);
      document.getElementById('ws-change').textContent =
        `${totalChange > 0 ? '+' : ''}${this.formatWeight(totalChange)}`;
      document.getElementById('ws-goal').textContent =
        this.profile.targetWeight ? this.formatWeight(this.profile.targetWeight) : '—';
    }

    // History
    this.renderWeightHistory(weights.slice(0, 10));

    // Period tabs
    document.querySelectorAll('#page-weight .chart-period-tab').forEach(tab => {
      if (!tab._bound) {
        tab._bound = true;
        tab.addEventListener('click', () => {
          document.querySelectorAll('#page-weight .chart-period-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          const period = tab.dataset.period;
          const filtered = this.filterWeightsByPeriod(weights, period);
          window.nutriCharts.drawWeightChart('weight-chart', filtered, this.profile.targetWeight);
        });
      }
    });
  }

  filterWeightsByPeriod(weights, period) {
    const now = new Date();
    let cutoff;
    switch (period) {
      case 'week':  cutoff = new Date(now - 7 * 86400000); break;
      case 'month': cutoff = new Date(now - 30 * 86400000); break;
      case '3month': cutoff = new Date(now - 90 * 86400000); break;
      case 'year':  cutoff = new Date(now - 365 * 86400000); break;
      default:      return weights;
    }
    return weights.filter(w => new Date(w.date) >= cutoff);
  }

  renderWeightHistory(weights) {
    const container = document.getElementById('weight-history');
    if (!container) return;

    if (weights.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No weight entries yet</p></div>';
      return;
    }

    container.innerHTML = weights.map((w, i) => {
      const prev = weights[i + 1];
      let changeHtml = '<span class="wh-change same">—</span>';
      if (prev) {
        const diff = w.valueKg - prev.valueKg;
        if (diff < 0) changeHtml = `<span class="wh-change down">↓ ${Math.abs(diff).toFixed(1)}</span>`;
        else if (diff > 0) changeHtml = `<span class="wh-change up">↑ ${diff.toFixed(1)}</span>`;
      }
      return `
        <div class="weight-history-item">
          <span class="wh-date">${this.formatDateShort(w.date)}</span>
          <span class="wh-value">${this.formatWeight(w.valueKg)}</span>
          ${changeHtml}
        </div>`;
    }).join('');
  }

  async saveWeight() {
    const slider = document.getElementById('weight-slider');
    const value = parseFloat(slider.value);

    await window.nutriDB.addWeight({
      valueKg: value,
      date: this.currentDate
    });

    // Update profile current weight
    this.profile.currentWeight = value;
    await window.nutriDB.saveProfile(this.profile);

    this.showToast(`⚖️ Weight saved: ${this.formatWeight(value)}`, 'success');
    this.renderWeightPage();
  }

  adjustWeight(delta) {
    const slider = document.getElementById('weight-slider');
    const display = document.getElementById('weight-display');
    const newVal = Math.round((parseFloat(slider.value) + delta) * 10) / 10;
    slider.value = newVal;
    display.textContent = this.formatWeight(newVal);
  }

  // ══════════════════════════════════════════════════
  // ACTIVITY PAGE
  // ══════════════════════════════════════════════════
  async renderActivityPage() {
    const activities = await window.nutriDB.getActivitiesForDate(this.currentDate);
    const container = document.getElementById('activity-log-list');
    if (!container) return;

    if (activities.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏃</div>
          <h3>No activities today</h3>
          <p>Select an activity type and log your workout</p>
        </div>`;
    } else {
      const totalBurned = activities.reduce((s, a) => s + a.caloriesBurned, 0);
      const totalMins = activities.reduce((s, a) => s + a.durationMinutes, 0);
      container.innerHTML = `
        <div class="card-header">
          <span class="card-title">Today's Activity</span>
          <span class="card-action">${totalBurned} kcal • ${totalMins} min</span>
        </div>
        ${activities.map(a => `
          <div class="activity-item">
            <div class="activity-left">
              <div class="activity-icon">${this.getActivityEmoji(a.type)}</div>
              <div class="activity-info">
                <h4>${a.name}</h4>
                <p>${a.durationMinutes} min • ${a.intensity || 'moderate'}</p>
              </div>
            </div>
            <span class="activity-cal">-${a.caloriesBurned} kcal</span>
          </div>
        `).join('')}`;
    }

    // Activity type cards
    document.querySelectorAll('.activity-type-card').forEach(card => {
      if (!card._bound) {
        card._bound = true;
        card.addEventListener('click', () => {
          document.querySelectorAll('.activity-type-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this.selectedActivityType = card.dataset.type;
        });
      }
    });
  }

  async saveActivity() {
    const name = document.getElementById('act-name').value;
    const duration = parseInt(document.getElementById('act-duration').value) || 0;
    const calories = parseInt(document.getElementById('act-calories').value) || 0;

    if (!name || duration <= 0) {
      this.showToast('⚠️ Please fill in activity name and duration', 'error');
      return;
    }

    await window.nutriDB.addActivity({
      name,
      type: this.selectedActivityType || 'other',
      durationMinutes: duration,
      caloriesBurned: calories || this.estimateCalories(duration),
      intensity: 'moderate',
      date: this.currentDate
    });

    // Clear form
    document.getElementById('act-name').value = '';
    document.getElementById('act-duration').value = '';
    document.getElementById('act-calories').value = '';

    this.showToast(`🏃 ${name} logged!`, 'success');
    this.renderActivityPage();
  }

  estimateCalories(minutes) {
    // Rough MET-based estimate
    const mets = { cardio: 8, strength: 5, flexibility: 3, sports: 7, other: 4 };
    const met = mets[this.selectedActivityType] || 5;
    const weightKg = this.profile?.currentWeight || 70;
    return Math.round(met * weightKg * (minutes / 60));
  }

  // ══════════════════════════════════════════════════
  // PROGRESS PAGE
  // ══════════════════════════════════════════════════
  async renderProgressPage() {
    if (!this.profile) return;

    const weights = await window.nutriDB.getWeights();
    const allMeals = await window.nutriDB.getAllMeals();
    const allActivities = await window.nutriDB.getAllActivities();

    // Stats
    const startWeight = weights.length > 0 ? weights[weights.length - 1].valueKg : 0;
    const currentWeight = weights.length > 0 ? weights[0].valueKg : 0;
    const totalChange = currentWeight - startWeight;

    document.getElementById('prog-total-change').textContent =
      `${totalChange > 0 ? '+' : ''}${this.formatWeight(totalChange)}`;
    document.getElementById('prog-entries').textContent = allMeals.length;
    document.getElementById('prog-workouts').textContent = allActivities.length;
    document.getElementById('prog-days').textContent =
      this.calculateStreak(allMeals);

    // Calorie bar chart — last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const daySummary = await window.nutriDB.getDailySummary(d);
      last7.push({ date: d.toISOString(), calories: daySummary.totalCalories });
    }
    window.nutriCharts.drawCalorieBarChart('calorie-bar-chart', last7, this.profile.calorieTarget);

    // Macro donut — today
    const today = await window.nutriDB.getDailySummary(new Date());
    window.nutriCharts.drawMacroDonut('macro-donut', today.totalProtein, today.totalCarbs, today.totalFat);

    // Weight chart
    window.nutriCharts.drawWeightChart('progress-weight-chart', weights, this.profile.targetWeight);
  }

  calculateStreak(meals) {
    if (meals.length === 0) return 0;
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today - i * 86400000);
      const dateStr = window.nutriDB._normalizeDate(d);
      const hasMeals = meals.some(m => m.date === dateStr);
      if (hasMeals) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  // ══════════════════════════════════════════════════
  // QUICK ADD MODAL
  // ══════════════════════════════════════════════════
  showQuickAddModal() {
    document.getElementById('quick-add-modal').classList.add('active');
  }

  async quickAddCalories() {
    const cal = parseInt(document.getElementById('qa-calories').value);
    const name = document.getElementById('qa-name').value || 'Quick add';

    if (!cal || cal <= 0) {
      this.showToast('⚠️ Enter a valid calorie amount', 'error');
      return;
    }

    await window.nutriDB.addMeal({
      name,
      mealType: 'snack',
      calories: cal,
      protein: 0,
      carbs: 0,
      fat: 0,
      servings: 1,
      date: this.currentDate
    });

    document.getElementById('qa-calories').value = '';
    document.getElementById('qa-name').value = '';
    this.closeModal('quick-add-modal');
    this.showToast(`✅ ${cal} kcal added`, 'success');
    if (this.currentPage === 'dashboard') this.renderDashboard();
  }

  async quickAddWater(ml) {
    await window.nutriDB.addWater(ml, this.currentDate);
    this.showToast(`💧 +${ml}ml water`, 'info');
    if (this.currentPage === 'dashboard') this.renderDashboard();
  }

  // ══════════════════════════════════════════════════
  // MODALS & UI
  // ══════════════════════════════════════════════════
  closeModal(id) {
    document.getElementById(id)?.classList.remove('active');
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      toast.style.transition = 'all 300ms ease';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  bindGlobalEvents() {
    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
        }
      });
    });

    // Goal option selection in onboarding
    document.querySelectorAll('.goal-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.goal-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });

    // Settings button
    document.getElementById('btn-settings')?.addEventListener('click', () => {
      this.showSettingsModal();
    });
  }

  showSettingsModal() {
    if (!this.profile) return;
    document.getElementById('set-name').value = this.profile.name;
    document.getElementById('set-calorie').value = this.profile.calorieTarget;
    document.getElementById('set-protein').value = this.profile.proteinTarget;
    document.getElementById('set-carbs').value = this.profile.carbsTarget;
    document.getElementById('set-fat').value = this.profile.fatTarget;
    document.getElementById('set-water').value = this.profile.waterTarget;
    document.getElementById('set-target-weight').value = this.profile.targetWeight || '';
    document.getElementById('settings-modal').classList.add('active');
  }

  async saveSettings() {
    this.profile.name = document.getElementById('set-name').value;
    this.profile.calorieTarget = parseInt(document.getElementById('set-calorie').value) || 2000;
    this.profile.proteinTarget = parseInt(document.getElementById('set-protein').value) || 150;
    this.profile.carbsTarget = parseInt(document.getElementById('set-carbs').value) || 200;
    this.profile.fatTarget = parseInt(document.getElementById('set-fat').value) || 65;
    this.profile.waterTarget = parseInt(document.getElementById('set-water').value) || 2500;
    this.profile.targetWeight = parseFloat(document.getElementById('set-target-weight').value) || null;

    await window.nutriDB.saveProfile(this.profile);
    this.closeModal('settings-modal');
    this.showToast('✅ Settings saved', 'success');
    this.loadPageData(this.currentPage);
  }

  async resetAllData() {
    if (confirm('⚠️ Are you sure? This will delete ALL your data permanently.')) {
      indexedDB.deleteDatabase('NutriTrackDB');
      location.reload();
    }
  }

  // ══════════════════════════════════════════════════
  // UTILITIES
  // ══════════════════════════════════════════════════
  formatWeight(kg) {
    if (this.profile?.unit === 'imperial') {
      return (kg * 2.205).toFixed(1);
    }
    return kg.toFixed(1);
  }

  formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  formatDateShort(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getActivityEmoji(type) {
    const map = {
      cardio: '🏃', strength: '🏋️', flexibility: '🧘',
      sports: '⚽', swimming: '🏊', cycling: '🚴',
      walking: '🚶', hiking: '🥾', other: '💪'
    };
    return map[type] || '💪';
  }

  getGreetingEmoji() {
    const hour = new Date().getHours();
    if (hour < 12) return '🌅';
    if (hour < 17) return '☀️';
    return '🌙';
  }
}

// ── Initialize ──
const app = new NutriApp();
document.addEventListener('DOMContentLoaded', () => app.init());
