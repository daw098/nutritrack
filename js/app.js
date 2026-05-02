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
    this.dateRangeOffset = 0; // for date strip week navigation
    this._prevCalRemaining = null; // for animated counter
    this.hrCameraStream = null;
    this.hrMeasureFrame = null;
    this.hrSamples = [];
    this.hrMeasureStart = 0;
    this.hrMeasureDuration = 22000;
    this.hrLastLiveUpdate = 0;
    this.hrLastMeasurementSource = 'manual';
    this.routeTracker = this.createEmptyRouteTracker();
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
      this.renderDateStrip();
      this.navigateTo('dashboard');
    }

    this.bindNavigation();
    this.bindGlobalEvents();
    this.updateHeaderDate();

    // Restore active tracker session (survives page reload / iPhone backgrounding)
    this.restoreTrackerState();

    // Persist tracker state when app goes to background (iPhone)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && this.routeTracker.active) {
        this.persistTrackerState();
      }
    });
    window.addEventListener('beforeunload', () => {
      if (this.routeTracker.active) this.persistTrackerState();
    });

    // Listen for service worker messages
    navigator.serviceWorker?.addEventListener('message', event => {
      if (event.data?.type === 'SYNC_TRACKER_STATE' || event.data?.type === 'PERIODIC_KEEPALIVE') {
        if (this.routeTracker.active) this.persistTrackerState();
      }
    });
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
    this.showToast('Welcome to Nouri!', 'success');
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

      const isToday = new Date().toDateString() === this.currentDate.toDateString();
      const dateLabel = isToday ? 'Today' : this.formatDate(this.currentDate);

      greetEl.innerHTML = `<h2><span class="greeting-emoji">${emoji}</span>${text}, ${this.escapeHTML(this.profile.name)}</h2>
        <p>${dateLabel}</p>`;
    }

    // Calorie ring
    window.nutriCharts.drawCalorieRing(
      'calorie-ring',
      summary.totalCalories, target,
      summary.totalProtein, summary.totalCarbs, summary.totalFat,
      this.profile.proteinTarget, this.profile.carbsTarget, this.profile.fatTarget
    );

    // Center numbers - ANIMATED
    const calEl = document.getElementById('cal-remaining');
    this.animateCounter(calEl, remaining);
    document.getElementById('cal-subtitle').textContent =
      `${summary.totalCalories} eaten • ${target} goal`;

    // Macro pills
    document.getElementById('macro-protein').textContent =
      `${Math.round(summary.totalProtein)}/${this.profile.proteinTarget}g`;
    document.getElementById('macro-carbs').textContent =
      `${Math.round(summary.totalCarbs)}/${this.profile.carbsTarget}g`;
    document.getElementById('macro-fat').textContent =
      `${Math.round(summary.totalFat)}/${this.profile.fatTarget}g`;

    this.renderDailyCoach(summary);

    // Check for goal celebration 🎉
    if (summary.totalCalories > 0) {
      this.checkGoalCelebration(summary.totalCalories, target);
    }

    // Weight stat
    const weights = await window.nutriDB.getWeights();
    const bellyMeasurements = await window.nutriDB.getBodyMeasurements('belly');
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
    this.renderDashboardBelly(bellyMeasurements);
    this.renderDashboardHeartRate(summary);

    // Meals list - update title based on selected date
    const isToday = new Date().toDateString() === this.currentDate.toDateString();
    const mealsTitle = document.getElementById('dash-meals-title');
    if (mealsTitle) {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      mealsTitle.textContent = isToday ? "Today's Meals" : `${days[this.currentDate.getDay()]}'s Meals`;
    }
    const actTitle = document.getElementById('dash-activity-title');
    if (actTitle) {
      actTitle.textContent = isToday ? 'Activity' : `${this.formatDateShort(this.currentDate)} Activity`;
    }

    this.renderDashboardMeals(summary.meals);

    // Activity
    this.renderDashboardActivity(summary.activities, summary.totalBurned, isToday);
  }

  renderDailyCoach(summary) {
    const card = document.getElementById('daily-coach-card');
    if (!card || !this.profile) return;

    const score = this.calculateDayScore(summary);
    const plan = this.buildCoachPlan(summary);

    document.getElementById('coach-score').textContent = score;
    document.getElementById('coach-title').textContent = plan.title;
    document.getElementById('coach-message').textContent = plan.message;

    const metricsEl = document.getElementById('coach-metrics');
    if (metricsEl) {
      metricsEl.innerHTML = plan.metrics.map(m => `
        <div class="coach-metric ${m.status}">
          <span>${this.escapeHTML(m.label)}</span>
          <strong>${this.escapeHTML(m.value)}</strong>
        </div>
      `).join('');
    }

    const actionsEl = document.getElementById('coach-actions');
    if (actionsEl) {
      actionsEl.innerHTML = plan.actions.map(a => `
        <button class="coach-action" onclick="${a.run}">
          ${this.escapeHTML(a.label)}
        </button>
      `).join('');
    }
  }

  calculateDayScore(summary) {
    const target = this.profile.calorieTarget || 2000;
    const proteinTarget = this.profile.proteinTarget || 120;
    const waterTarget = this.profile.waterTarget || 2500;

    const caloriePct = target > 0 ? summary.totalCalories / target : 0;
    const calorieScore = summary.totalCalories > 0
      ? Math.max(0, 30 - Math.abs(1 - caloriePct) * 55)
      : 0;
    const proteinScore = Math.min(summary.totalProtein / proteinTarget, 1) * 25;
    const waterScore = Math.min(summary.waterMl / waterTarget, 1) * 20;
    const mealTypes = new Set(summary.meals.map(m => m.mealType));
    const mealScore = Math.min(mealTypes.size / 3, 1) * 15;
    const activityScore = summary.totalBurned > 0 ? 10 : 0;

    const score = 10 + calorieScore + proteinScore + waterScore + mealScore + activityScore;
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  buildCoachPlan(summary) {
    const target = this.profile.calorieTarget || 2000;
    const proteinTarget = this.profile.proteinTarget || 120;
    const carbsTarget = this.profile.carbsTarget || 200;
    const fatTarget = this.profile.fatTarget || 65;
    const waterTarget = this.profile.waterTarget || 2500;

    const remaining = target - summary.totalCalories;
    const proteinGap = Math.max(0, proteinTarget - summary.totalProtein);
    const carbsGap = Math.max(0, carbsTarget - summary.totalCarbs);
    const fatGap = Math.max(0, fatTarget - summary.totalFat);
    const waterGap = Math.max(0, waterTarget - summary.waterMl);
    const fiberGap = Math.max(0, 25 - (summary.totalFiber || 0));
    const mealCount = summary.meals.length;
    const nextMeal = this.recommendNextMealType();

    const recommendations = [];
    if (mealCount === 0) {
      recommendations.push({
        title: 'Start with a clean first log',
        message: 'Log one real meal and the app can tune the rest of the day around your calories, protein, and water.'
      });
    }
    if (remaining < -target * 0.05) {
      recommendations.push({
        title: 'Hold the line',
        message: `${Math.abs(Math.round(remaining))} kcal over target. Keep the next choice lean, high-volume, and protein-forward.`
      });
    } else if (proteinGap >= 25 && remaining > 180) {
      recommendations.push({
        title: 'Protein is the best next move',
        message: `${Math.round(proteinGap)}g protein left. Pick a lean protein now so dinner does not have to do all the work.`
      });
    } else if (remaining > target * 0.35 && mealCount > 0) {
      recommendations.push({
        title: 'You have room to plan ahead',
        message: `${Math.round(remaining)} kcal left. A balanced ${nextMeal} can keep you close without guessing later.`
      });
    }
    if (waterGap >= 500) {
      recommendations.push({
        title: 'Hydration gap',
        message: `${Math.round(waterGap / 250) * 250}ml water left. Small drinks now beat a late-night catch-up.`
      });
    }
    if (fiberGap >= 8 && mealCount > 0) {
      recommendations.push({
        title: 'Add fiber for satiety',
        message: `${Math.round(fiberGap)}g fiber left. Beans, berries, vegetables, or oats would improve fullness today.`
      });
    }
    if (summary.totalBurned === 0 && mealCount >= 2) {
      recommendations.push({
        title: 'Movement would help the day',
        message: 'A short walk or workout log can improve the net calorie picture and keep momentum visible.'
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        title: 'Nice landing zone',
        message: 'Calories, macros, and water are lining up. Keep logging with the same level of precision.'
      });
    }

    const metrics = [
      {
        label: 'Calories',
        value: remaining >= 0 ? `${Math.round(remaining)} left` : `${Math.abs(Math.round(remaining))} over`,
        status: remaining < 0 ? 'warn' : 'good'
      },
      {
        label: 'Protein',
        value: `${Math.round(proteinGap)}g left`,
        status: proteinGap > 25 ? 'warn' : 'good'
      },
      {
        label: 'Water',
        value: `${(waterGap / 1000).toFixed(1)}L left`,
        status: waterGap > 750 ? 'warn' : 'good'
      },
      {
        label: 'Balance',
        value: `${Math.round(carbsGap)}C / ${Math.round(fatGap)}F`,
        status: remaining < 0 ? 'warn' : 'good'
      }
    ];

    const actions = [
      { label: 'Smart picks', run: `app.navigateToMeal('${nextMeal}')` },
      { label: 'Log activity', run: "app.navigateTo('activity')" }
    ];
    if (waterGap >= 250) {
      actions.unshift({ label: '+500ml water', run: 'app.quickAddWater(500)' });
    }

    return {
      title: recommendations[0].title,
      message: recommendations[0].message,
      metrics,
      actions: actions.slice(0, 3)
    };
  }

  recommendNextMealType() {
    const hour = new Date().getHours();
    if (hour < 10) return 'breakfast';
    if (hour < 15) return 'lunch';
    if (hour < 20) return 'dinner';
    return 'snack';
  }

  renderDashboardHeartRate(summary) {
    const latest = summary.latestHeartRate;
    const valueEl = document.getElementById('dash-hr-value');
    const zoneEl = document.getElementById('dash-hr-zone');
    if (!valueEl || !zoneEl) return;

    if (!latest) {
      valueEl.textContent = '—';
      zoneEl.className = 'stat-change neutral';
      zoneEl.textContent = 'No data yet';
      return;
    }

    const zone = this.getHeartRateZone(latest.bpm, latest.context);
    valueEl.textContent = Math.round(latest.bpm);
    zoneEl.className = `stat-change ${zone.status}`;
    zoneEl.textContent = `${zone.label} • ${this.formatHeartRateTime(latest)}`;
  }

  renderDashboardBelly(measurements) {
    const latest = measurements?.[0];
    const previous = measurements?.[1];
    const valueEl = document.getElementById('dash-belly-value');
    const unitEl = document.getElementById('dash-belly-unit');
    const changeEl = document.getElementById('dash-belly-change');
    if (!valueEl || !unitEl || !changeEl) return;

    unitEl.textContent = this.getBodyMeasurementUnit();

    if (!latest) {
      valueEl.textContent = '—';
      changeEl.className = 'stat-change neutral';
      changeEl.textContent = 'No data yet';
      return;
    }

    valueEl.textContent = this.formatBodyMeasurementNumber(latest.valueCm);
    if (!previous) {
      changeEl.className = 'stat-change neutral';
      changeEl.textContent = `Latest ${this.formatDateShort(latest.date)}`;
      return;
    }

    const diff = latest.valueCm - previous.valueCm;
    const cls = diff < 0 ? 'positive' : diff > 0 ? 'negative' : 'neutral';
    const arrow = diff < 0 ? '↓' : diff > 0 ? '↑' : '→';
    changeEl.className = `stat-change ${cls}`;
    changeEl.textContent = `${arrow} ${this.formatBodyMeasurementNumber(Math.abs(diff))} since last`;
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

  renderDashboardActivity(activities, totalBurned, isToday = true) {
    const container = document.getElementById('dash-activity');
    if (!container) return;

    if (activities.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="padding: 20px 0">
          <p style="color: var(--text-muted); font-size: 0.82rem;">No activities logged${isToday ? ' today' : ''}</p>
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
              <h4>${this.escapeHTML(a.name)}</h4>
              <p>${this.getActivityDetailText(a)}</p>
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
          this.renderFoodSmartPicks();
          this.renderLoggedMeals();
        });
      }
    });

    // Render favorites & recents
    this.renderFoodFavorites();
    this.renderFoodSmartPicks();

    // Initial render
    this.renderFoodResults('');
    this.renderLoggedMeals();
  }

  async renderFoodSmartPicks() {
    const container = document.getElementById('food-smart-picks');
    if (!container || !this.profile) return;

    const summary = await window.nutriDB.getDailySummary(this.currentDate);
    const picks = this.getSmartFoodSuggestions(summary, 4);
    this.smartFoodPicks = picks.map(p => p.food);

    if (picks.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div class="card smart-picks-card">
        <div class="card-header">
          <span class="card-title">Smart Picks</span>
          <span class="smart-picks-context">${this.escapeHTML(this.getMealLabel(this.selectedMealType))}</span>
        </div>
        <div class="smart-pick-list">
          ${picks.map((pick, index) => `
            <button class="smart-pick" onclick="app.openSmartPick(${index})">
              <span>
                <strong>${this.escapeHTML(pick.food.name)}</strong>
                <small>${this.escapeHTML(pick.reason)}</small>
              </span>
              <em>${Math.round(pick.food.cal)} kcal</em>
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  getSmartFoodSuggestions(summary, limit = 4) {
    const foods = this.getAllFoodsIncludingCustom();
    const remainingCal = this.profile.calorieTarget - summary.totalCalories;
    const proteinGap = Math.max(0, this.profile.proteinTarget - summary.totalProtein);
    const carbsGap = Math.max(0, this.profile.carbsTarget - summary.totalCarbs);
    const fatGap = Math.max(0, this.profile.fatTarget - summary.totalFat);
    const fiberGap = Math.max(0, 25 - (summary.totalFiber || 0));

    return foods
      .map(food => {
        const cal = Number(food.cal) || 0;
        if (cal <= 0) return null;
        const protein = Number(food.protein) || 0;
        const carbs = Number(food.carbs) || 0;
        const fat = Number(food.fat) || 0;
        const fiber = Number(food.fiber) || 0;

        let score = 0;
        score += protein * (proteinGap > 15 ? 2.2 : 1.2);
        if (proteinGap > 15) score += (protein / cal) * 650;
        score += fiber * (fiberGap > 6 ? 3 : 1);
        score += carbs * (carbsGap > 35 && remainingCal > 350 ? 0.8 : 0.1);
        score += Math.min(fat, fatGap) * 0.25;

        const calorieCeiling = remainingCal > 0 ? Math.max(180, remainingCal * 0.65) : 160;
        score -= Math.max(0, cal - calorieCeiling) / 7;
        if (cal > 450) score -= (cal - 450) / 5;
        if (remainingCal < 250 && cal > 280) score -= 28;
        if (food.category === 'Nuts' && proteinGap > 15) score -= 20;
        if (food.category === 'Fats') score -= 35;
        if (food.category === 'Drinks' && cal > 20) score -= 12;
        if (food.custom) score += 8;

        return {
          food,
          score,
          reason: this.getSmartPickReason(food, { proteinGap, carbsGap, fiberGap, remainingCal })
        };
      })
      .filter(Boolean)
      .filter(pick => pick.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getSmartPickReason(food, gaps) {
    if (gaps.proteinGap > 15 && (food.protein || 0) >= 15) {
      return `${Math.round(food.protein)}g protein helps close the gap`;
    }
    if (gaps.fiberGap > 6 && (food.fiber || 0) >= 4) {
      return `${Math.round(food.fiber)}g fiber for fullness`;
    }
    if (gaps.remainingCal < 250 && food.cal <= 180) {
      return 'Keeps calories controlled';
    }
    if (gaps.carbsGap > 35 && (food.carbs || 0) >= 20) {
      return 'Useful carbs for the next meal';
    }
    return `${food.serving || '1 serving'} fits today`;
  }

  openSmartPick(index) {
    const food = this.smartFoodPicks?.[index];
    if (food) this.showFoodDetailModal(food);
  }

  getMealLabel(type) {
    const labels = {
      breakfast: 'Breakfast',
      lunch: 'Lunch',
      dinner: 'Dinner',
      snack: 'Snack'
    };
    return labels[type] || 'Meal';
  }

  renderFoodResults(query) {
    // Merge custom foods with built-in
    const customFoods = this.getCustomFoods();
    let results;
    if (!query || query.length === 0) {
      // Show custom foods first, then built-in
      results = [...customFoods, ...searchFoods('')];
    } else {
      const builtInResults = searchFoods(query);
      const customResults = customFoods.filter(f =>
        f.name.toLowerCase().includes(query.toLowerCase())
      );
      results = [...customResults, ...builtInResults];
    }
    const container = document.getElementById('food-results');
    if (!container) return;

    this.foodSearchResults = results;
    container.innerHTML = results.map((food, index) => {
      const isFav = this.isFavorite(food.name);
      const starClass = isFav ? 'fav-star active' : 'fav-star';
      const favoriteName = encodeURIComponent(food.name);
      return `
      <div class="food-result">
        <div class="food-result-info" onclick="app.openFoodResult(${index})">
          <h4>${food.custom ? '🍳 ' : ''}${this.escapeHTML(food.name)}</h4>
          <p>${this.escapeHTML(food.serving)} \u2022 P:${food.protein || 0}g C:${food.carbs || 0}g F:${food.fat || 0}g</p>
        </div>
        <span class="food-result-cal">${food.cal} kcal</span>
        <button class="${starClass}" onclick="app.toggleFavorite(decodeURIComponent('${favoriteName}'))">★</button>
      </div>`;
    }).join('');
  }

  openFoodResult(index) {
    const food = this.foodSearchResults?.[index];
    if (food) this.showFoodDetailModal(food);
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
            <h4>${this.escapeHTML(m.name)}</h4>
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
    document.getElementById('fd-cal').textContent = Math.round((f.cal || 0) * s);
    document.getElementById('fd-protein').textContent = ((f.protein || 0) * s).toFixed(1) + 'g';
    document.getElementById('fd-carbs').textContent = ((f.carbs || 0) * s).toFixed(1) + 'g';
    document.getElementById('fd-fat').textContent = ((f.fat || 0) * s).toFixed(1) + 'g';
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
      calories: Math.round((f.cal || 0) * s),
      protein: Math.round((f.protein || 0) * s * 10) / 10,
      carbs: Math.round((f.carbs || 0) * s * 10) / 10,
      fat: Math.round((f.fat || 0) * s * 10) / 10,
      fiber: Math.round((f.fiber || 0) * s * 10) / 10,
      servings: s,
      servingSize: f.serving,
      date: this.currentDate
    });

    this.closeModal('food-detail-modal');
    this.showToast(`✅ ${f.name} added to ${this.selectedMealType}`, 'success');
    this.addToRecentFoods(f); // Track for recent foods
    this.renderFoodSmartPicks();
    this.renderLoggedMeals();
  }

  async deleteMealEntry(id) {
    await window.nutriDB.deleteMeal(id);
    this.renderFoodSmartPicks();
    this.renderLoggedMeals();
    this.showToast('🗑 Entry removed', 'info');
  }

  // ══════════════════════════════════════════════════
  // WEIGHT PAGE
  // ══════════════════════════════════════════════════
  async renderWeightPage() {
    if (!this.profile) return;

    const weights = await window.nutriDB.getWeights();
    const bellyMeasurements = await window.nutriDB.getBodyMeasurements('belly');
    const todayBelly = await window.nutriDB.getBodyMeasurementForDate(this.currentDate, 'belly');
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

    this.renderBellyMeasurementInput(bellyMeasurements, todayBelly);

    // Chart
    const chartWeights = this.filterWeightsByPeriod(weights, 'month');
    window.nutriCharts.drawWeightChart('weight-chart', chartWeights, this.profile.targetWeight);
    const chartBelly = this.filterMeasurementsByPeriod(bellyMeasurements, 'month');
    window.nutriCharts.drawMeasurementChart('belly-chart', chartBelly, this.getBellyChartOptions());

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
    this.renderBellyHistory(bellyMeasurements.slice(0, 10));

    // Period tabs
    document.querySelectorAll('#page-weight .weight-period-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('#page-weight .weight-period-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const period = tab.dataset.period;
        const filtered = this.filterWeightsByPeriod(weights, period);
        window.nutriCharts.drawWeightChart('weight-chart', filtered, this.profile.targetWeight);
      };
    });

    document.querySelectorAll('#page-weight .belly-period-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('#page-weight .belly-period-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const period = tab.dataset.period;
        const filtered = this.filterMeasurementsByPeriod(bellyMeasurements, period);
        window.nutriCharts.drawMeasurementChart('belly-chart', filtered, this.getBellyChartOptions());
      };
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

  filterMeasurementsByPeriod(measurements, period) {
    return this.filterWeightsByPeriod(measurements, period);
  }

  renderBellyMeasurementInput(measurements, todayMeasurement) {
    const latest = measurements[0];
    const input = document.getElementById('belly-input');
    const note = document.getElementById('belly-note');
    const display = document.getElementById('belly-display');
    const unit = this.getBodyMeasurementUnit();

    const unitEl = document.getElementById('belly-input-unit');
    if (unitEl) unitEl.textContent = unit;

    if (display) {
      display.textContent = latest ? this.formatBodyMeasurement(latest.valueCm) : '—';
    }

    const lastLabel = document.getElementById('belly-last-label');
    if (lastLabel) {
      lastLabel.textContent = latest ? this.formatDateShort(latest.date) : 'No data yet';
    }

    if (input) {
      input.placeholder = this.profile.unit === 'imperial' ? '36' : '90';
      const source = todayMeasurement || latest;
      input.value = source ? this.formatBodyMeasurementNumber(source.valueCm) : '';
    }
    if (note) note.value = todayMeasurement?.note || '';
  }

  renderBellyHistory(measurements) {
    const container = document.getElementById('belly-history');
    if (!container) return;

    if (measurements.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No belly measurements yet</p></div>';
      return;
    }

    container.innerHTML = measurements.map((m, i) => {
      const prev = measurements[i + 1];
      let changeHtml = '<span class="wh-change same">—</span>';
      if (prev) {
        const diff = m.valueCm - prev.valueCm;
        if (diff < 0) changeHtml = `<span class="wh-change down">↓ ${this.formatBodyMeasurementNumber(Math.abs(diff))}</span>`;
        else if (diff > 0) changeHtml = `<span class="wh-change up">↑ ${this.formatBodyMeasurementNumber(diff)}</span>`;
      }
      return `
        <div class="weight-history-item">
          <span class="wh-date">${this.formatDateShort(m.date)}</span>
          <span class="wh-value">${this.formatBodyMeasurement(m.valueCm)}</span>
          ${changeHtml}
        </div>`;
    }).join('');
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

  adjustBellyMeasurement(delta) {
    const input = document.getElementById('belly-input');
    if (!input) return;

    const current = parseFloat(input.value) || (this.profile?.unit === 'imperial' ? 36 : 90);
    const next = Math.max(1, Math.round((current + delta) * 10) / 10);
    input.value = next.toFixed(1);
  }

  async saveBellyMeasurement() {
    const input = document.getElementById('belly-input');
    const note = document.getElementById('belly-note')?.value?.trim() || '';
    const displayValue = parseFloat(input?.value);

    if (!displayValue || displayValue <= 0) {
      this.showToast('Enter a belly measurement first', 'error');
      return;
    }

    const valueCm = this.bodyMeasurementInputToCm(displayValue);
    if (valueCm < 40 || valueCm > 220) {
      const unit = this.getBodyMeasurementUnit();
      this.showToast(`Enter a realistic ${unit} measurement`, 'error');
      return;
    }

    await window.nutriDB.addBodyMeasurement({
      type: 'belly',
      valueCm,
      note,
      date: this.currentDate
    });

    this.showToast(`Belly saved: ${this.formatBodyMeasurement(valueCm)}`, 'success');
    await this.renderWeightPage();
    if (this.currentPage === 'dashboard') await this.renderDashboard();
    if (this.currentPage === 'progress') await this.renderProgressPage();
  }

  // ══════════════════════════════════════════════════
  // ACTIVITY PAGE
  // ══════════════════════════════════════════════════
  async renderActivityPage() {
    const activities = await window.nutriDB.getActivitiesForDate(this.currentDate);
    const container = document.getElementById('activity-log-list');
    if (!container) return;
    this.updateRouteTrackerUI();

    // Day Summary
    this.renderActivityDaySummary(activities);

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
        ${activities.map((a, i) => `
          <div class="activity-item activity-item-clickable" onclick="app.showActivityDetail('${a.id}')">
            <div class="activity-left">
              <div class="activity-icon">${this.getActivityEmoji(a.type)}</div>
              <div class="activity-info">
                <h4>${this.escapeHTML(a.name)}</h4>
                <p>${this.getActivityDetailText(a)}</p>
              </div>
            </div>
            <span class="activity-cal">-${a.caloriesBurned} kcal</span>
          </div>
        `).join('')}`;
    }

    // Activity type cards
    document.querySelectorAll('#page-activity .activity-type-card').forEach(card => {
      if (!card._bound) {
        card._bound = true;
        card.addEventListener('click', () => {
          document.querySelectorAll('#page-activity .activity-type-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          this.selectedActivityType = card.dataset.type;
        });
      }
    });

    // Weekly stats
    this.renderWeeklyActivityStats();
  }

  renderActivityDaySummary(activities) {
    const container = document.getElementById('activity-day-summary');
    if (!container) return;
    if (activities.length === 0) {
      container.innerHTML = '';
      return;
    }
    const totalMins = activities.reduce((s, a) => s + a.durationMinutes, 0);
    const totalCal = activities.reduce((s, a) => s + a.caloriesBurned, 0);
    const totalDist = activities.reduce((s, a) => s + (Number(a.distanceKm) || 0), 0);
    const totalSteps = activities.reduce((s, a) => s + (Number(a.steps) || 0), 0);

    container.innerHTML = `
      <div class="card-header">
        <span class="card-title">Today's Totals</span>
        <span class="card-action">${activities.length} session${activities.length > 1 ? 's' : ''}</span>
      </div>
      <div class="ads-grid">
        <div class="ads-stat"><span class="ads-value">${totalMins}</span><span class="ads-label">Minutes</span></div>
        <div class="ads-stat"><span class="ads-value">${totalCal}</span><span class="ads-label">Calories</span></div>
        <div class="ads-stat"><span class="ads-value">${totalDist > 0 ? totalDist.toFixed(1) : totalSteps > 0 ? totalSteps.toLocaleString() : '—'}</span><span class="ads-label">${totalDist > 0 ? 'km' : totalSteps > 0 ? 'Steps' : 'Dist'}</span></div>
      </div>`;
  }

  async renderWeeklyActivityStats() {
    const container = document.getElementById('weekly-activity-stats');
    if (!container) return;
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // Monday=0
    const weekData = [];
    let maxCal = 1;

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - dayOfWeek + i);
      const activities = await window.nutriDB.getActivitiesForDate(d);
      const cal = activities.reduce((s, a) => s + a.caloriesBurned, 0);
      const mins = activities.reduce((s, a) => s + a.durationMinutes, 0);
      weekData.push({ day: days[i], cal, mins, count: activities.length });
      if (cal > maxCal) maxCal = cal;
    }

    const totalCal = weekData.reduce((s, d) => s + d.cal, 0);
    const totalMins = weekData.reduce((s, d) => s + d.mins, 0);
    const activeDays = weekData.filter(d => d.count > 0).length;

    container.innerHTML = `
      <div class="was-grid">
        <div class="was-stat"><span class="was-value">${activeDays}/7</span><span class="was-label">Active Days</span></div>
        <div class="was-stat"><span class="was-value">${totalCal}</span><span class="was-label">Total kcal</span></div>
        <div class="was-stat"><span class="was-value">${totalMins}</span><span class="was-label">Total Min</span></div>
        <div class="was-stat"><span class="was-value">${weekData.reduce((s, d) => s + d.count, 0)}</span><span class="was-label">Sessions</span></div>
      </div>
      ${weekData.map(d => `
        <div class="was-day-bar-row">
          <span class="was-day-label">${d.day}</span>
          <div class="was-day-bar-bg"><div class="was-day-bar" style="width:${(d.cal / maxCal * 100).toFixed(0)}%"></div></div>
          <span class="was-day-value">${d.cal > 0 ? d.cal + ' kcal' : '—'}</span>
        </div>`).join('')}`;
  }

  async showActivityDetail(activityId) {
    const all = await window.nutriDB.getActivitiesForDate(this.currentDate);
    const activity = all.find(a => a.id === activityId);
    if (!activity) return;
    this._detailActivityId = activityId;

    // Title
    document.getElementById('ad-title').textContent =
      `${this.getActivityEmoji(activity.type)} ${this.escapeHTML(activity.name)}`;

    // Hero stats
    const hero = document.getElementById('ad-hero');
    const distKm = Number(activity.distanceKm) || 0;
    const stats = [
      { value: `${activity.durationMinutes}`, label: 'Minutes' },
      { value: `${activity.caloriesBurned}`, label: 'kcal' },
      { value: distKm > 0 ? distKm.toFixed(2) : '—', label: distKm > 0 ? 'km' : 'Dist' }
    ];
    if (activity.steps) stats.push({ value: activity.steps.toLocaleString(), label: 'Steps' });
    if (activity.elevationGainM) stats.push({ value: `${activity.elevationGainM}m`, label: 'Elev Gain' });
    if (activity.paceSecPerKm) stats.push({ value: this.formatPace(activity.paceSecPerKm), label: 'Pace' });
    hero.innerHTML = stats.map(s =>
      `<div class="ad-hero-stat"><span class="adh-value">${s.value}</span><span class="adh-label">${s.label}</span></div>`
    ).join('');

    // Splits
    const splitsSection = document.getElementById('ad-splits-section');
    const splitsTable = document.getElementById('ad-splits-table');
    if (activity.splits?.length > 0) {
      splitsSection.style.display = '';
      const avgPace = activity.splits.reduce((s, sp) => s + sp.paceSecPerKm, 0) / activity.splits.length;
      splitsTable.innerHTML = `
        <div class="ad-split-header"><span>KM</span><span>Pace Bar</span><span>Pace</span></div>
        ${activity.splits.map(sp => {
          const barPct = avgPace > 0 ? Math.min(100, (avgPace / sp.paceSecPerKm) * 80) : 50;
          const cls = sp.paceSecPerKm < avgPace * 0.95 ? 'fast' : sp.paceSecPerKm > avgPace * 1.05 ? 'slow' : 'avg';
          return `<div class="ad-split-row">
            <span class="ad-split-km">${sp.km}</span>
            <div class="ad-split-bar-wrap"><div class="ad-split-bar ${cls}" style="width:${barPct}%"></div></div>
            <span class="ad-split-pace">${this.formatPace(sp.paceSecPerKm)}</span>
          </div>`;
        }).join('')}`;
    } else {
      splitsSection.style.display = 'none';
    }

    // Effort Zones
    const zonesSection = document.getElementById('ad-zones-section');
    const zonesContainer = document.getElementById('ad-zones');
    if (activity.speedZones) {
      const total = Object.values(activity.speedZones).reduce((s, v) => s + v, 0) || 1;
      zonesSection.style.display = '';
      zonesContainer.innerHTML = ['easy', 'moderate', 'vigorous', 'max'].map(z => {
        const pct = ((activity.speedZones[z] || 0) / total * 100);
        return `<div class="ad-zone-row">
          <span class="ad-zone-label ${z}">${z.charAt(0).toUpperCase() + z.slice(1)}</span>
          <div class="ad-zone-bar-bg"><div class="ad-zone-bar ${z}" style="width:${pct}%"></div></div>
          <span class="ad-zone-pct">${Math.round(pct)}%</span>
        </div>`;
      }).join('');
    } else {
      zonesSection.style.display = 'none';
    }

    // Speed chart - hide if no route data
    document.getElementById('ad-speed-section').style.display =
      activity.routePoints?.length > 5 ? '' : 'none';

    // Notes
    const notesSection = document.getElementById('ad-notes-section');
    const notesText = document.getElementById('ad-notes-text');
    if (activity.notes) {
      notesSection.style.display = '';
      notesText.textContent = activity.notes;
    } else {
      notesSection.style.display = 'none';
    }

    this.openModal('activity-detail-modal');
  }

  async deleteActivityFromDetail() {
    if (!this._detailActivityId) return;
    if (!confirm('Delete this activity?')) return;
    await window.nutriDB.deleteActivity(this._detailActivityId);
    this.closeModal('activity-detail-modal');
    this.showToast('🗑 Activity deleted', 'info');
    await this.renderActivityPage();
  }

  async saveActivity() {
    const name = document.getElementById('act-name').value;
    const duration = parseInt(document.getElementById('act-duration').value) || 0;
    const calories = parseInt(document.getElementById('act-calories').value) || 0;
    const distance = parseFloat(document.getElementById('act-distance')?.value) || 0;
    const intensity = document.getElementById('act-intensity')?.value || 'moderate';
    const notes = document.getElementById('act-notes')?.value?.trim() || '';

    if (!name || duration <= 0) {
      this.showToast('⚠️ Please fill in activity name and duration', 'error');
      return;
    }

    const type = this.selectedActivityType || 'other';
    const entry = {
      name,
      type,
      durationMinutes: duration,
      caloriesBurned: calories || this.estimateActivityCalories(duration, type),
      intensity,
      notes,
      date: this.currentDate
    };
    if (distance > 0) {
      entry.distanceKm = distance;
      entry.paceSecPerKm = (duration * 60) / distance;
      entry.steps = this.getEstimatedSteps(distance * 1000, type);
    }

    await window.nutriDB.addActivity(entry);

    // Clear form
    document.getElementById('act-name').value = '';
    document.getElementById('act-duration').value = '';
    document.getElementById('act-calories').value = '';
    if (document.getElementById('act-distance')) document.getElementById('act-distance').value = '';
    if (document.getElementById('act-notes')) document.getElementById('act-notes').value = '';

    this.showToast(`🏃 ${name} logged!`, 'success');
    this.renderActivityPage();
  }

  estimateCalories(minutes) {
    return this.estimateActivityCalories(minutes, this.selectedActivityType || 'other');
  }

  estimateActivityCalories(minutes, type = 'other') {
    // Rough MET-based estimate
    const mets = {
      cardio: 8,
      running: 9.8,
      strength: 5,
      flexibility: 3,
      sports: 7,
      cycling: 6.8,
      walking: 3.5,
      swimming: 7,
      hiking: 6,
      other: 4
    };
    const met = mets[type] || 5;
    const weightKg = this.profile?.currentWeight || 70;
    return Math.round(met * weightKg * (minutes / 60));
  }

  createEmptyRouteTracker(mode = 'walking') {
    return {
      mode,
      active: false,
      paused: false,
      startedAt: null,
      elapsedMs: 0,
      pausedAtMs: 0,
      distanceM: 0,
      elevationGainM: 0,
      lastPosition: null,
      positions: [],
      splits: [],          // per-km split data
      lastSplitDistM: 0,
      lastSplitTimeMs: 0,
      speedSamples: [],    // for speed zones
      watchId: null,
      timerId: null,
      wakeLock: null,
      status: 'Ready'
    };
  }

  // ── Estimated Steps from distance + mode ──
  getEstimatedSteps(distanceM, mode) {
    const strideM = mode === 'running' ? 1.1 : 0.72;
    return Math.round(distanceM / strideM);
  }

  // ── Speed Zone Classification ──
  getSpeedZone(speedKmh, mode) {
    if (mode === 'running') {
      if (speedKmh < 6) return { label: 'Walk', icon: '🟢', cls: 'easy' };
      if (speedKmh < 9) return { label: 'Easy', icon: '🟢', cls: 'easy' };
      if (speedKmh < 12) return { label: 'Tempo', icon: '🟡', cls: 'moderate' };
      if (speedKmh < 15) return { label: 'Hard', icon: '🟠', cls: 'vigorous' };
      return { label: 'Sprint', icon: '🔴', cls: 'max' };
    }
    if (speedKmh < 3) return { label: 'Slow', icon: '🟢', cls: 'easy' };
    if (speedKmh < 5) return { label: 'Normal', icon: '🟢', cls: 'easy' };
    if (speedKmh < 6.5) return { label: 'Brisk', icon: '🟡', cls: 'moderate' };
    return { label: 'Power', icon: '🟠', cls: 'vigorous' };
  }

  // ── Wake Lock for iPhone background ──
  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        this.routeTracker.wakeLock = await navigator.wakeLock.request('screen');
        this.routeTracker.wakeLock.addEventListener('release', () => {
          if (this.routeTracker.active && !this.routeTracker.paused) {
            this.requestWakeLock(); // Re-acquire
          }
        });
      }
    } catch (e) { /* Wake lock not available */ }
  }

  releaseWakeLock() {
    if (this.routeTracker.wakeLock) {
      this.routeTracker.wakeLock.release().catch(() => {});
      this.routeTracker.wakeLock = null;
    }
  }

  // ── Persist tracker state for backgrounding ──
  persistTrackerState() {
    if (!this.routeTracker.active) {
      localStorage.removeItem('active-tracker');
      return;
    }
    const state = {
      mode: this.routeTracker.mode,
      startedAt: this.routeTracker.startedAt,
      elapsedMs: this.getRouteTrackerElapsedMs(),
      distanceM: this.routeTracker.distanceM,
      elevationGainM: this.routeTracker.elevationGainM,
      positions: this.routeTracker.positions.slice(-500),
      splits: this.routeTracker.splits,
      lastSplitDistM: this.routeTracker.lastSplitDistM,
      lastSplitTimeMs: this.routeTracker.lastSplitTimeMs,
      paused: this.routeTracker.paused,
      savedAt: Date.now()
    };
    localStorage.setItem('active-tracker', JSON.stringify(state));
  }

  restoreTrackerState() {
    try {
      const raw = localStorage.getItem('active-tracker');
      if (!raw) return false;
      const state = JSON.parse(raw);
      if (Date.now() - state.savedAt > 4 * 3600000) {
        localStorage.removeItem('active-tracker');
        return false;
      }
      this.routeTracker = this.createEmptyRouteTracker(state.mode);
      Object.assign(this.routeTracker, {
        elapsedMs: state.elapsedMs,
        distanceM: state.distanceM,
        elevationGainM: state.elevationGainM || 0,
        positions: state.positions || [],
        splits: state.splits || [],
        lastSplitDistM: state.lastSplitDistM || 0,
        lastSplitTimeMs: state.lastSplitTimeMs || 0,
        paused: state.paused,
        lastPosition: state.positions?.length ? state.positions[state.positions.length - 1] : null,
        status: state.paused ? 'Paused' : 'Restored'
      });
      if (!state.paused) {
        this.routeTracker.active = true;
        this.routeTracker.startedAt = Date.now() - state.elapsedMs;
        this.routeTracker.timerId = setInterval(() => this.updateRouteTrackerUI(), 1000);
        this.routeTracker.watchId = navigator.geolocation.watchPosition(
          pos => this.handleRoutePosition(pos),
          err => this.handleRouteError(err),
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
        this.requestWakeLock();
      }
      this.updateRouteTrackerUI();
      this.showToast('Tracking session restored', 'info');
      return true;
    } catch { localStorage.removeItem('active-tracker'); return false; }
  }

  dismissBgBanner() {
    document.getElementById('bg-tracking-banner')?.classList.add('hidden');
  }

  setRouteTrackerMode(mode) {
    if (!['walking', 'running'].includes(mode)) return;
    if (this.routeTracker.active) {
      this.showToast('Finish the current session before switching mode.', 'info');
      return;
    }

    this.routeTracker = this.createEmptyRouteTracker(mode);
    this.selectedActivityType = mode;
    document.querySelectorAll('#page-activity .activity-type-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.type === mode);
    });
    this.updateRouteTrackerUI('Ready');
  }

  startRouteTracker() {
    if (!navigator.geolocation) {
      this.showToast('Location tracking is not available in this browser.', 'error');
      return;
    }
    if (this.routeTracker.active) return;

    this.routeTracker.active = true;
    this.routeTracker.paused = false;
    this.routeTracker.startedAt = Date.now() - this.routeTracker.elapsedMs;
    this.routeTracker.status = 'Waiting for GPS...';
    this.routeTracker.lastSplitTimeMs = this.routeTracker.elapsedMs;
    this.selectedActivityType = this.routeTracker.mode;

    this.routeTracker.timerId = setInterval(() => {
      this.updateRouteTrackerUI();
      this.persistTrackerState();
    }, 1000);

    this.routeTracker.watchId = navigator.geolocation.watchPosition(
      pos => this.handleRoutePosition(pos),
      error => this.handleRouteError(error),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    this.requestWakeLock();

    // Show background tracking banner
    const banner = document.getElementById('bg-tracking-banner');
    if (banner) {
      banner.classList.remove('hidden');
      document.getElementById('bg-tracking-text').textContent =
        'Tracking continues if you lock screen or switch apps';
    }

    // Notify service worker
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'TRACKER_ACTIVE' });
    }

    this.updateRouteTrackerUI();
  }

  pauseRouteTracker() {
    if (!this.routeTracker.active || this.routeTracker.paused) return;
    this.routeTracker.paused = true;
    this.routeTracker.elapsedMs = this.getRouteTrackerElapsedMs();
    this.routeTracker.startedAt = null;
    if (this.routeTracker.timerId) clearInterval(this.routeTracker.timerId);
    this.routeTracker.timerId = null;
    if (this.routeTracker.watchId !== null) navigator.geolocation?.clearWatch(this.routeTracker.watchId);
    this.routeTracker.watchId = null;
    this.routeTracker.status = 'Paused';
    this.releaseWakeLock();
    this.persistTrackerState();
    this.updateRouteTrackerUI();
    this.showToast('⏸ Tracking paused', 'info');
  }

  resumeRouteTracker() {
    if (!this.routeTracker.active || !this.routeTracker.paused) return;
    this.routeTracker.paused = false;
    this.routeTracker.startedAt = Date.now() - this.routeTracker.elapsedMs;
    this.routeTracker.lastPosition = null; // Don't measure gap distance
    this.routeTracker.timerId = setInterval(() => {
      this.updateRouteTrackerUI();
      this.persistTrackerState();
    }, 1000);
    this.routeTracker.watchId = navigator.geolocation.watchPosition(
      pos => this.handleRoutePosition(pos),
      err => this.handleRouteError(err),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    this.routeTracker.status = 'Resuming GPS...';
    this.requestWakeLock();
    this.updateRouteTrackerUI();
    this.showToast('▶ Tracking resumed', 'info');
  }

  handleRoutePosition(position) {
    if (this.routeTracker.paused) return;
    const coords = position.coords;
    const point = {
      lat: coords.latitude,
      lon: coords.longitude,
      alt: coords.altitude || null,
      accuracy: coords.accuracy || 0,
      altAccuracy: coords.altitudeAccuracy || null,
      speed: coords.speed || null,
      time: position.timestamp || Date.now()
    };

    if (point.accuracy > 100) {
      this.routeTracker.status = 'Improving GPS accuracy...';
      this.updateRouteTrackerUI();
      return;
    }

    const last = this.routeTracker.lastPosition;
    if (last) {
      const distance = this.distanceBetweenPoints(last, point);
      const seconds = Math.max(1, (point.time - last.time) / 1000);
      const speed = distance / seconds;
      if (distance >= 2 && distance < 250 && speed < 12) {
        this.routeTracker.distanceM += distance;

        // Track elevation gain
        if (point.alt !== null && last.alt !== null && point.altAccuracy < 20) {
          const elevDiff = point.alt - last.alt;
          if (elevDiff > 0.5) this.routeTracker.elevationGainM += elevDiff;
        }

        // Speed sample for zone analysis
        const speedKmh = speed * 3.6;
        this.routeTracker.speedSamples.push({ t: point.time, v: speedKmh });

        // Auto-generate km splits
        const currentDistKm = Math.floor(this.routeTracker.distanceM / 1000);
        const lastSplitKm = Math.floor(this.routeTracker.lastSplitDistM / 1000);
        if (currentDistKm > lastSplitKm && currentDistKm > 0) {
          const elapsedMs = this.getRouteTrackerElapsedMs();
          const splitTimeMs = elapsedMs - this.routeTracker.lastSplitTimeMs;
          const splitDistM = this.routeTracker.distanceM - this.routeTracker.lastSplitDistM;
          const paceSecPerKm = splitDistM > 0 ? (splitTimeMs / 1000) / (splitDistM / 1000) : null;
          this.routeTracker.splits.push({
            km: currentDistKm,
            timeMs: splitTimeMs,
            paceSecPerKm,
            distM: splitDistM
          });
          this.routeTracker.lastSplitDistM = this.routeTracker.distanceM;
          this.routeTracker.lastSplitTimeMs = elapsedMs;
        }
      }
    }

    this.routeTracker.lastPosition = point;
    this.routeTracker.positions.push(point);
    this.routeTracker.status = point.accuracy <= 30 ? 'Tracking' : `Tracking • ${Math.round(point.accuracy)}m GPS`;
    this.updateRouteTrackerUI();
  }

  handleRouteError(error) {
    const message = error.code === 1
      ? 'Location blocked. Allow location to track walks and runs.'
      : 'Finding location...';
    this.routeTracker.status = message;
    if (error.code === 1) {
      this.stopRouteWatch();
    }
    this.updateRouteTrackerUI();
    if (error.code === 1) this.showToast(message, 'error');
  }

  async finishRouteTracker() {
    const elapsedMs = this.getRouteTrackerElapsedMs();
    const distanceM = this.routeTracker.distanceM;
    this.stopRouteWatch();

    if (elapsedMs < 10000 && distanceM < 5) {
      this.showToast('Track a little longer before saving.', 'error');
      this.updateRouteTrackerUI('Ready');
      return;
    }

    const minutes = Math.max(1, Math.round(elapsedMs / 60000));
    const mode = this.routeTracker.mode;
    const calories = this.estimateActivityCalories(minutes, mode);
    const paceSecPerKm = distanceM > 0 ? (elapsedMs / 1000) / (distanceM / 1000) : null;
    const steps = this.getEstimatedSteps(distanceM, mode);

    // Compute speed zone breakdown
    const zones = this.computeSpeedZones(this.routeTracker.speedSamples, mode);

    await window.nutriDB.addActivity({
      name: mode === 'running' ? 'Run' : 'Walk',
      type: mode,
      durationMinutes: minutes,
      caloriesBurned: calories,
      intensity: mode === 'running' ? 'vigorous' : 'easy',
      distanceKm: distanceM / 1000,
      paceSecPerKm,
      steps,
      elevationGainM: Math.round(this.routeTracker.elevationGainM),
      splits: this.routeTracker.splits,
      speedZones: zones,
      routePoints: this.routeTracker.positions.slice(-300).map(p => ({
        lat: Number(p.lat.toFixed(6)),
        lon: Number(p.lon.toFixed(6)),
        alt: p.alt != null ? Math.round(p.alt) : null,
        accuracy: Math.round(p.accuracy),
        time: p.time
      })),
      source: 'route-tracker',
      date: this.currentDate
    });

    this.showToast(`${mode === 'running' ? 'Run' : 'Walk'} saved: ${this.formatDistance(distanceM)}`, 'success');
    this.routeTracker = this.createEmptyRouteTracker(mode);
    localStorage.removeItem('active-tracker');
    this.updateRouteTrackerUI('Saved');
    document.getElementById('bg-tracking-banner')?.classList.add('hidden');
    await this.renderActivityPage();
    if (this.currentPage === 'dashboard') await this.renderDashboard();
    if (this.currentPage === 'progress') await this.renderProgressPage();
  }

  computeSpeedZones(samples, mode) {
    const zones = { easy: 0, moderate: 0, vigorous: 0, max: 0 };
    if (!samples || samples.length < 2) return zones;
    for (const s of samples) {
      const z = this.getSpeedZone(s.v, mode);
      zones[z.cls] = (zones[z.cls] || 0) + 1;
    }
    return zones;
  }

  resetRouteTracker() {
    const mode = this.routeTracker.mode;
    this.stopRouteWatch();
    this.routeTracker = this.createEmptyRouteTracker(mode);
    localStorage.removeItem('active-tracker');
    document.getElementById('bg-tracking-banner')?.classList.add('hidden');
    this.updateRouteTrackerUI('Ready');
  }

  stopRouteWatch() {
    if (this.routeTracker.watchId !== null) {
      navigator.geolocation?.clearWatch(this.routeTracker.watchId);
    }
    if (this.routeTracker.timerId) {
      clearInterval(this.routeTracker.timerId);
    }
    this.routeTracker.elapsedMs = this.getRouteTrackerElapsedMs();
    this.routeTracker.active = false;
    this.routeTracker.paused = false;
    this.routeTracker.watchId = null;
    this.routeTracker.timerId = null;
    this.releaseWakeLock();
  }

  getRouteTrackerElapsedMs() {
    if (this.routeTracker.active && this.routeTracker.startedAt) {
      return Math.max(0, Date.now() - this.routeTracker.startedAt);
    }
    return this.routeTracker.elapsedMs || 0;
  }

  updateRouteTrackerUI(status = null) {
    const t = this.routeTracker;
    if (status) t.status = status;

    // Mode tabs
    document.querySelectorAll('.tracker-mode').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.trackerMode === t.mode);
    });

    const elapsedMs = this.getRouteTrackerElapsedMs();
    const paceSecPerKm = t.distanceM > 0 ? (elapsedMs / 1000) / (t.distanceM / 1000) : null;
    const minutes = Math.max(0, elapsedMs / 60000);
    const calories = this.estimateActivityCalories(minutes, t.mode);
    const steps = this.getEstimatedSteps(t.distanceM, t.mode);
    const speedKmh = t.distanceM > 0 && elapsedMs > 0 ? (t.distanceM / 1000) / (elapsedMs / 3600000) : 0;
    const zone = this.getSpeedZone(speedKmh, t.mode);
    const isImperial = this.profile?.unit === 'imperial';
    const distValue = isImperial ? (t.distanceM / 1609.344) : (t.distanceM / 1000);

    // Hero
    const timeEl = document.getElementById('tracker-time');
    const distanceEl = document.getElementById('tracker-distance');
    const distUnitEl = document.getElementById('tracker-distance-unit');
    if (timeEl) timeEl.textContent = this.formatDuration(elapsedMs);
    if (distanceEl) distanceEl.textContent = distValue.toFixed(2);
    if (distUnitEl) distUnitEl.textContent = isImperial ? 'mi' : 'km';

    // Secondary metrics
    const paceEl = document.getElementById('tracker-pace');
    const caloriesEl = document.getElementById('tracker-calories');
    const stepsEl = document.getElementById('tracker-steps');
    const elevEl = document.getElementById('tracker-elevation');
    const speedEl = document.getElementById('tracker-speed');
    const speedUnitEl = document.getElementById('tracker-speed-unit');
    const zoneEl = document.getElementById('tracker-zone');
    const zoneIconEl = document.getElementById('tracker-zone-icon');

    if (paceEl) paceEl.textContent = this.formatPace(paceSecPerKm);
    if (caloriesEl) caloriesEl.textContent = Math.round(calories);
    if (stepsEl) stepsEl.textContent = steps.toLocaleString();
    if (elevEl) elevEl.textContent = `${Math.round(t.elevationGainM)}m`;
    if (speedEl) speedEl.textContent = speedKmh.toFixed(1);
    if (speedUnitEl) speedUnitEl.textContent = isImperial ? 'mph' : 'km/h';
    if (zoneEl) zoneEl.textContent = zone.label;
    if (zoneIconEl) zoneIconEl.textContent = zone.icon;

    // GPS bar
    const lastAcc = t.lastPosition?.accuracy || 999;
    const gpsBar = document.getElementById('tracker-gps-bar');
    const gpsLabel = document.getElementById('tracker-gps-label');
    const gpsDots = gpsBar?.querySelector('.gps-signal-dots');
    if (gpsDots) {
      gpsDots.className = 'gps-signal-dots';
      if (lastAcc <= 10) gpsDots.classList.add('excellent');
      else if (lastAcc <= 30) gpsDots.classList.add('good');
      else if (lastAcc <= 60) gpsDots.classList.add('fair');
      else gpsDots.classList.add('poor');
    }
    if (gpsLabel) {
      if (!t.active) gpsLabel.textContent = 'GPS Ready';
      else if (lastAcc <= 10) gpsLabel.textContent = `±${Math.round(lastAcc)}m • Excellent`;
      else if (lastAcc <= 30) gpsLabel.textContent = `±${Math.round(lastAcc)}m • Good`;
      else if (lastAcc <= 60) gpsLabel.textContent = `±${Math.round(lastAcc)}m • Fair`;
      else gpsLabel.textContent = `±${Math.round(lastAcc)}m • Weak`;
    }

    // Status
    const statusEl = document.getElementById('route-tracker-status');
    if (statusEl) statusEl.textContent = t.status;

    // Live splits
    const splitsContainer = document.getElementById('tracker-live-splits');
    const splitsList = document.getElementById('tracker-splits-list');
    const currentKmEl = document.getElementById('tracker-current-km');
    if (t.splits.length > 0 && splitsContainer) {
      splitsContainer.classList.remove('hidden');
      if (currentKmEl) currentKmEl.textContent = `${distValue.toFixed(2)} ${isImperial ? 'mi' : 'km'}`;
      if (splitsList) {
        const avgPace = t.splits.reduce((s, sp) => s + sp.paceSecPerKm, 0) / t.splits.length;
        splitsList.innerHTML = t.splits.map(sp => {
          const barPct = avgPace > 0 ? Math.min(100, (avgPace / sp.paceSecPerKm) * 80) : 50;
          const barCls = sp.paceSecPerKm < avgPace * 0.95 ? 'fast' : sp.paceSecPerKm > avgPace * 1.05 ? 'slow' : '';
          return `<div class="tls-row">
            <span class="tls-km">${sp.km} km</span>
            <div class="tls-bar-wrap"><div class="tls-bar ${barCls}" style="width:${barPct}%"></div></div>
            <span class="tls-pace">${this.formatPace(sp.paceSecPerKm)}</span>
          </div>`;
        }).join('');
      }
    } else if (splitsContainer) {
      splitsContainer.classList.add('hidden');
    }

    // Buttons
    const startBtn = document.getElementById('tracker-start-btn');
    const pauseBtn = document.getElementById('tracker-pause-btn');
    const resumeBtn = document.getElementById('tracker-resume-btn');
    const finishBtn = document.getElementById('tracker-finish-btn');
    const card = document.querySelector('.route-tracker-card');

    if (card) {
      card.classList.toggle('tracking-active', t.active && !t.paused);
      card.classList.toggle('tracking-paused', t.active && t.paused);
    }

    if (startBtn) startBtn.style.display = t.active ? 'none' : '';
    if (pauseBtn) pauseBtn.style.display = (t.active && !t.paused) ? '' : 'none';
    if (resumeBtn) resumeBtn.style.display = (t.active && t.paused) ? '' : 'none';
    if (finishBtn) {
      finishBtn.style.display = t.active ? '' : 'none';
      finishBtn.disabled = elapsedMs < 10000 && t.distanceM < 5;
    }
  }

  distanceBetweenPoints(a, b) {
    const toRad = deg => deg * Math.PI / 180;
    const earthM = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earthM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  // ══════════════════════════════════════════════════
  // PROGRESS PAGE
  // ══════════════════════════════════════════════════
  async renderProgressPage() {
    if (!this.profile) return;

    const weights = await window.nutriDB.getWeights();
    const allMeals = await window.nutriDB.getAllMeals();
    const allActivities = await window.nutriDB.getAllActivities();
    const allHeartRates = await window.nutriDB.getAllHeartRates();
    const bellyMeasurements = await window.nutriDB.getBodyMeasurements('belly');

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
    const bellyStart = bellyMeasurements.length > 0 ? bellyMeasurements[bellyMeasurements.length - 1].valueCm : null;
    const bellyCurrent = bellyMeasurements.length > 0 ? bellyMeasurements[0].valueCm : null;
    const bellyChange = bellyCurrent !== null && bellyStart !== null ? bellyCurrent - bellyStart : null;
    const bellyChangeEl = document.getElementById('prog-belly-change');
    if (bellyChangeEl) {
      bellyChangeEl.textContent = bellyChange !== null
        ? `${bellyChange > 0 ? '+' : ''}${this.formatBodyMeasurement(bellyChange)}`
        : '—';
    }

    // Calorie bar chart — last 7 days
    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const daySummary = await window.nutriDB.getDailySummary(d);
      last7.push({
        date: d.toISOString(),
        calories: daySummary.totalCalories,
        protein: daySummary.totalProtein,
        waterMl: daySummary.waterMl,
        totalBurned: daySummary.totalBurned
      });
    }
    const loggedDays = last7.filter(d => d.calories > 0);
    const avgCal = loggedDays.length
      ? Math.round(loggedDays.reduce((s, d) => s + d.calories, 0) / loggedDays.length)
      : 0;
    document.getElementById('prog-avg-cal').textContent = avgCal > 0 ? avgCal : '—';
    const sevenDaysAgo = new Date(Date.now() - 6 * 86400000);
    const recentHeartRates = allHeartRates.filter(h => new Date(h.timestamp || h.date) >= sevenDaysAgo);
    const avgHeartRate = recentHeartRates.length
      ? Math.round(recentHeartRates.reduce((sum, h) => sum + (Number(h.bpm) || 0), 0) / recentHeartRates.length)
      : 0;
    document.getElementById('prog-avg-hr').textContent = avgHeartRate > 0 ? avgHeartRate : '—';
    window.nutriCharts.drawCalorieBarChart('calorie-bar-chart', last7, this.profile.calorieTarget);
    this.renderProgressInsights(last7, weights, allMeals, allActivities, allHeartRates, bellyMeasurements);

    // Macro donut — today
    const today = await window.nutriDB.getDailySummary(new Date());
    window.nutriCharts.drawMacroDonut('macro-donut', today.totalProtein, today.totalCarbs, today.totalFat);

    // Weight chart
    window.nutriCharts.drawWeightChart('progress-weight-chart', weights, this.profile.targetWeight);
    window.nutriCharts.drawMeasurementChart('progress-belly-chart', bellyMeasurements, this.getBellyChartOptions());
  }

  renderProgressInsights(last7, weights, allMeals, allActivities, allHeartRates = [], bellyMeasurements = []) {
    const container = document.getElementById('progress-insights');
    if (!container || !this.profile) return;

    if (allMeals.length === 0 && allHeartRates.length === 0 && bellyMeasurements.length === 0) {
      container.innerHTML = `
        <div class="empty-state compact">
          <p>Log a few meals and Nouri will surface weekly coaching patterns here.</p>
        </div>`;
      return;
    }

    const target = this.profile.calorieTarget || 2000;
    const proteinTarget = this.profile.proteinTarget || 120;
    const waterTarget = this.profile.waterTarget || 2500;
    const loggedDays = last7.filter(d => d.calories > 0);
    const adherenceDays = last7.filter(d =>
      d.calories >= target * 0.9 && d.calories <= target * 1.1
    ).length;
    const avgProtein = loggedDays.length
      ? Math.round(loggedDays.reduce((s, d) => s + d.protein, 0) / loggedDays.length)
      : 0;
    const avgWater = Math.round(last7.reduce((s, d) => s + d.waterMl, 0) / last7.length);
    const workoutDays = new Set(allActivities.map(a => a.date)).size;
    const recentHeartRates = allHeartRates.filter(h => new Date(h.timestamp || h.date) >= new Date(Date.now() - 6 * 86400000));
    const restingRates = recentHeartRates.filter(h => h.context === 'resting');
    const avgRestingRate = restingRates.length
      ? Math.round(restingRates.reduce((sum, h) => sum + (Number(h.bpm) || 0), 0) / restingRates.length)
      : 0;
    const latestHeartRate = allHeartRates.length > 0 ? allHeartRates[0] : null;
    const sortedWeights = [...weights].sort((a, b) => new Date(a.date) - new Date(b.date));
    const weightDelta = sortedWeights.length >= 2
      ? sortedWeights[sortedWeights.length - 1].valueKg - sortedWeights[0].valueKg
      : null;
    const sortedBelly = [...bellyMeasurements].sort((a, b) => new Date(a.date) - new Date(b.date));
    const bellyDelta = sortedBelly.length >= 2
      ? sortedBelly[sortedBelly.length - 1].valueCm - sortedBelly[0].valueCm
      : null;

    const insights = [
      {
        status: adherenceDays >= 4 ? 'good' : 'warn',
        title: 'Calorie consistency',
        body: `${adherenceDays}/7 days landed within 10% of your calorie target.`
      },
      {
        status: avgProtein >= proteinTarget * 0.8 ? 'good' : 'warn',
        title: 'Protein average',
        body: avgProtein > 0
          ? `${avgProtein}g/day average against a ${proteinTarget}g target.`
          : 'Protein has not been logged yet this week.'
      },
      {
        status: avgWater >= waterTarget * 0.75 ? 'good' : 'warn',
        title: 'Hydration baseline',
        body: `${(avgWater / 1000).toFixed(1)}L/day average against ${(waterTarget / 1000).toFixed(1)}L.`
      },
      {
        status: workoutDays >= 3 ? 'good' : 'warn',
        title: 'Activity rhythm',
        body: `${workoutDays} active day${workoutDays === 1 ? '' : 's'} logged across your history.`
      },
      {
        status: avgRestingRate && avgRestingRate <= 75 ? 'good' : latestHeartRate ? 'neutral' : 'warn',
        title: 'Heart rate',
        body: avgRestingRate
          ? `${avgRestingRate} bpm average resting heart rate from recent logs.`
          : latestHeartRate
            ? `${Math.round(latestHeartRate.bpm)} bpm latest ${latestHeartRate.context || 'manual'} reading.`
            : 'No heart-rate logs yet.'
      }
    ];

    if (weightDelta !== null) {
      const direction = weightDelta > 0 ? '+' : '';
      insights.push({
        status: Math.abs(weightDelta) <= 0.2 ? 'neutral' : 'good',
        title: 'Weight trend',
        body: `${direction}${this.formatWeight(weightDelta)} ${this.profile.unit === 'imperial' ? 'lb' : 'kg'} since your first saved weigh-in.`
      });
    }

    if (bellyDelta !== null) {
      const direction = bellyDelta > 0 ? '+' : '';
      insights.push({
        status: bellyDelta < 0 ? 'good' : Math.abs(bellyDelta) < 0.2 ? 'neutral' : 'warn',
        title: 'Belly trend',
        body: `${direction}${this.formatBodyMeasurement(bellyDelta)} since your first belly measurement.`
      });
    } else if (bellyMeasurements.length === 1) {
      insights.push({
        status: 'neutral',
        title: 'Belly baseline',
        body: `${this.formatBodyMeasurement(bellyMeasurements[0].valueCm)} saved as your first belly measurement.`
      });
    }

    container.innerHTML = insights.map(item => `
      <div class="insight-row ${item.status}">
        <span class="insight-dot"></span>
        <div>
          <h4>${this.escapeHTML(item.title)}</h4>
          <p>${this.escapeHTML(item.body)}</p>
        </div>
      </div>
    `).join('');
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
    if (this.currentPage === 'food') {
      this.renderFoodSmartPicks();
      this.renderLoggedMeals();
    }
  }

  async quickAddWater(ml) {
    await window.nutriDB.addWater(ml, this.currentDate);
    this.showToast(`💧 +${ml}ml water`, 'info');
    if (this.currentPage === 'dashboard') this.renderDashboard();
  }

  showHeartRateModal(context = 'resting') {
    this.stopCameraHeartRate(true);
    this.hrLastMeasurementSource = 'manual';
    const bpmInput = document.getElementById('hr-bpm');
    const contextInput = document.getElementById('hr-context');
    const noteInput = document.getElementById('hr-note');
    if (bpmInput) bpmInput.value = '';
    if (contextInput) contextInput.value = context;
    if (noteInput) noteInput.value = '';
    this.resetHeartRateMeasurementUI();
    this.openModal('heart-rate-modal');
  }

  async saveHeartRate() {
    const bpm = parseInt(document.getElementById('hr-bpm')?.value, 10);
    const context = document.getElementById('hr-context')?.value || 'resting';
    const note = document.getElementById('hr-note')?.value?.trim() || '';

    if (!bpm || bpm < 30 || bpm > 220) {
      this.showToast('Enter a BPM between 30 and 220', 'error');
      return;
    }

    await window.nutriDB.addHeartRate({
      bpm,
      context,
      note,
      source: this.hrLastMeasurementSource || 'manual',
      date: this.currentDate
    });

    this.closeModal('heart-rate-modal');
    const zone = this.getHeartRateZone(bpm, context);
    this.showToast(`${bpm} bpm saved - ${zone.label}`, 'success');
    if (this.currentPage === 'dashboard') await this.renderDashboard();
    if (this.currentPage === 'progress') await this.renderProgressPage();
  }

  async startCameraHeartRate() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.showToast('Camera measurement needs browser camera access.', 'error');
      return;
    }

    const video = document.getElementById('hr-camera-video');
    const panel = document.getElementById('hr-camera-panel');
    const startBtn = document.getElementById('hr-camera-start');
    if (!video || !panel) return;

    this.stopCameraHeartRate(false);
    this.hrSamples = [];
    this.hrMeasureStart = 0;
    this.hrLastLiveUpdate = 0;
    this.hrLastMeasurementSource = 'camera';
    panel.classList.remove('hidden');
    this.setHeartRateCameraStatus('Starting camera...');
    this.setHeartRateProgress(0);
    this.setHeartRateLiveBpm(null);
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Measuring...';
    }

    try {
      this.hrCameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 60 }
        }
      });

      video.srcObject = this.hrCameraStream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      await this.tryEnableCameraTorch(this.hrCameraStream);

      this.hrMeasureStart = performance.now();
      this.setHeartRateCameraStatus('Cover the rear camera with your fingertip.');
      this.captureHeartRateFrame();
    } catch (error) {
      this.stopCameraHeartRate(true);
      this.hrLastMeasurementSource = 'manual';
      this.showToast('Camera blocked. Allow camera access and try again.', 'error');
    }
  }

  stopCameraHeartRate(resetUi = false) {
    if (this.hrMeasureFrame) {
      cancelAnimationFrame(this.hrMeasureFrame);
      this.hrMeasureFrame = null;
    }

    if (this.hrCameraStream) {
      this.hrCameraStream.getTracks().forEach(track => track.stop());
      this.hrCameraStream = null;
    }

    const video = document.getElementById('hr-camera-video');
    if (video) video.srcObject = null;

    const startBtn = document.getElementById('hr-camera-start');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Measure with Camera';
    }

    if (resetUi) {
      const bpmValue = document.getElementById('hr-bpm')?.value;
      if (!bpmValue) this.hrLastMeasurementSource = 'manual';
      this.resetHeartRateMeasurementUI();
      this.hrSamples = [];
    }
  }

  resetHeartRateMeasurementUI() {
    document.getElementById('hr-camera-panel')?.classList.add('hidden');
    this.setHeartRateCameraStatus('Ready');
    this.setHeartRateProgress(0);
    this.setHeartRateLiveBpm(null);
    const startBtn = document.getElementById('hr-camera-start');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.textContent = 'Measure with Camera';
    }
  }

  async tryEnableCameraTorch(stream) {
    try {
      const track = stream.getVideoTracks?.()[0];
      const capabilities = track?.getCapabilities?.();
      if (capabilities?.torch) {
        await track.applyConstraints({ advanced: [{ torch: true }] });
      }
    } catch (error) {
      // Torch access is optional and not available in many iPhone browsers.
    }
  }

  captureHeartRateFrame() {
    const video = document.getElementById('hr-camera-video');
    const canvas = document.getElementById('hr-camera-canvas');
    if (!video || !canvas || !this.hrCameraStream) return;

    const now = performance.now();
    if (!this.hrMeasureStart) this.hrMeasureStart = now;
    const elapsed = now - this.hrMeasureStart;
    const remaining = Math.max(0, Math.ceil((this.hrMeasureDuration - elapsed) / 1000));
    this.setHeartRateProgress(Math.min(elapsed / this.hrMeasureDuration, 1));

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        this.hrMeasureFrame = requestAnimationFrame(() => this.captureHeartRateFrame());
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0;
      let green = 0;
      let blue = 0;
      const pixelCount = frame.length / 4;

      for (let i = 0; i < frame.length; i += 4) {
        red += frame[i];
        green += frame[i + 1];
        blue += frame[i + 2];
      }

      red /= pixelCount;
      green /= pixelCount;
      blue /= pixelCount;
      const warmth = red - ((green + blue) / 2);
      this.hrSamples.push({ t: now, v: red, warmth });

      if (now - this.hrLastLiveUpdate > 900) {
        const live = this.estimateHeartRateFromSamples(this.hrSamples.slice(-600));
        this.setHeartRateLiveBpm(live);
        this.hrLastLiveUpdate = now;
      }

      if (elapsed < 2500) {
        this.setHeartRateCameraStatus('Hold still while the app calibrates.');
      } else if (warmth < 8) {
        this.setHeartRateCameraStatus('Cover the lens fully with your fingertip.');
      } else {
        this.setHeartRateCameraStatus(`Reading pulse... ${remaining}s left`);
      }
    }

    if (elapsed >= this.hrMeasureDuration) {
      this.finishCameraHeartRate();
      return;
    }

    this.hrMeasureFrame = requestAnimationFrame(() => this.captureHeartRateFrame());
  }

  finishCameraHeartRate() {
    const bpm = this.estimateHeartRateFromSamples(this.hrSamples);
    this.stopCameraHeartRate(false);
    this.setHeartRateProgress(1);

    if (!bpm) {
      this.hrLastMeasurementSource = 'manual';
      this.setHeartRateLiveBpm(null);
      this.setHeartRateCameraStatus('Could not read a steady pulse. Try again with better light.');
      this.showToast('No steady pulse found. Try again or enter BPM manually.', 'error');
      return;
    }

    const bpmInput = document.getElementById('hr-bpm');
    if (bpmInput) bpmInput.value = bpm;
    this.hrLastMeasurementSource = 'camera';
    this.setHeartRateLiveBpm(bpm);
    this.setHeartRateCameraStatus('Measurement complete. Save when ready.');
    this.showToast(`Measured ${bpm} bpm`, 'success');
  }

  setHeartRateCameraStatus(text) {
    const status = document.getElementById('hr-camera-status');
    if (status) status.textContent = text;
  }

  setHeartRateProgress(value) {
    const fill = document.getElementById('hr-measure-fill');
    if (fill) fill.style.width = `${Math.max(0, Math.min(1, value)) * 100}%`;
  }

  setHeartRateLiveBpm(bpm) {
    const live = document.getElementById('hr-live-bpm');
    if (live) live.textContent = bpm ? Math.round(bpm) : '--';
  }

  estimateHeartRateFromSamples(samples) {
    if (!samples || samples.length < 80) return null;

    const startT = samples[0].t + 2500;
    const usable = samples.filter(sample => sample.t >= startT);
    if (usable.length < 80) return null;

    const durationSec = (usable[usable.length - 1].t - usable[0].t) / 1000;
    if (durationSec < 7) return null;

    const sampleRate = usable.length / durationSec;
    const raw = usable.map(sample => sample.v);
    const smooth = this.movingAverage(raw, Math.max(3, Math.round(sampleRate * 0.12)));
    const trend = this.movingAverage(smooth, Math.max(9, Math.round(sampleRate * 1.2)));
    const centered = smooth.map((value, index) => value - trend[index]);
    const mean = centered.reduce((sum, value) => sum + value, 0) / centered.length;
    const variance = centered.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / centered.length;
    const std = Math.sqrt(variance);
    if (std < 0.08) return null;

    const signal = centered.map(value => (value - mean) / std);
    const times = usable.map(sample => sample.t);
    const peak = this.estimateBpmByPeaks(signal, times);
    const auto = this.estimateBpmByAutocorrelation(signal, sampleRate);

    let bpm = null;
    if (peak && auto && Math.abs(peak.bpm - auto.bpm) <= 18) {
      bpm = (peak.bpm * 0.65) + (auto.bpm * 0.35);
    } else if (peak && peak.score >= 1.4) {
      bpm = peak.bpm;
    } else if (auto && auto.score >= 0.22) {
      bpm = auto.bpm;
    }

    if (!bpm || bpm < 40 || bpm > 200) return null;
    return Math.round(bpm);
  }

  movingAverage(values, windowSize) {
    const half = Math.max(1, Math.floor(windowSize / 2));
    return values.map((_, index) => {
      const start = Math.max(0, index - half);
      const end = Math.min(values.length - 1, index + half);
      let total = 0;
      for (let i = start; i <= end; i++) total += values[i];
      return total / (end - start + 1);
    });
  }

  estimateBpmByPeaks(signal, times) {
    const variants = [signal, signal.map(value => -value)];
    let best = null;

    variants.forEach(series => {
      const peaks = [];
      for (let i = 2; i < series.length - 2; i++) {
        const isPeak = series[i] > 0.25 &&
          series[i] > series[i - 1] &&
          series[i] >= series[i + 1] &&
          series[i] > series[i - 2] &&
          series[i] >= series[i + 2];

        if (!isPeak) continue;
        const last = peaks[peaks.length - 1];
        if (!last || times[i] - last.t > 320) {
          peaks.push({ t: times[i], v: series[i] });
        } else if (series[i] > last.v) {
          peaks[peaks.length - 1] = { t: times[i], v: series[i] };
        }
      }

      const intervals = [];
      for (let i = 1; i < peaks.length; i++) {
        const interval = peaks[i].t - peaks[i - 1].t;
        if (interval >= 300 && interval <= 1500) intervals.push(interval);
      }
      if (intervals.length < 3) return;

      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      const bpm = 60000 / median;
      const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
      const jitter = Math.sqrt(intervals.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / intervals.length) / avg;
      const score = intervals.length / Math.max(1, peaks.length) + Math.max(0, 0.8 - jitter);

      if (bpm >= 40 && bpm <= 200 && (!best || score > best.score)) {
        best = { bpm, score };
      }
    });

    return best;
  }

  estimateBpmByAutocorrelation(signal, sampleRate) {
    const minLag = Math.max(2, Math.round(sampleRate * 60 / 200));
    const maxLag = Math.min(signal.length - 2, Math.round(sampleRate * 60 / 40));
    let bestLag = 0;
    let bestScore = -Infinity;

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let energyA = 0;
      let energyB = 0;
      for (let i = lag; i < signal.length; i++) {
        const a = signal[i];
        const b = signal[i - lag];
        sum += a * b;
        energyA += a * a;
        energyB += b * b;
      }

      const score = sum / Math.sqrt(energyA * energyB || 1);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }

    if (!bestLag || bestScore < 0.16) return null;
    const bpm = 60 * sampleRate / bestLag;
    return bpm >= 40 && bpm <= 200 ? { bpm, score: bestScore } : null;
  }

  // ══════════════════════════════════════════════════
  // MODALS & UI
  // ══════════════════════════════════════════════════
  openModal(id) {
    document.getElementById(id)?.classList.add('active');
  }

  closeModal(id) {
    if (id === 'heart-rate-modal') {
      this.stopCameraHeartRate(true);
    }
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
          this.closeModal(overlay.id);
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

  getBodyMeasurementUnit() {
    return this.profile?.unit === 'imperial' ? 'in' : 'cm';
  }

  formatBodyMeasurementNumber(valueCm) {
    const value = this.profile?.unit === 'imperial' ? valueCm / 2.54 : valueCm;
    return value.toFixed(1);
  }

  formatBodyMeasurement(valueCm) {
    return `${this.formatBodyMeasurementNumber(valueCm)} ${this.getBodyMeasurementUnit()}`;
  }

  bodyMeasurementInputToCm(value) {
    return this.profile?.unit === 'imperial' ? value * 2.54 : value;
  }

  formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  formatDistance(meters) {
    const value = this.profile?.unit === 'imperial'
      ? meters / 1609.344
      : meters / 1000;
    const unit = this.profile?.unit === 'imperial' ? 'mi' : 'km';
    return `${value.toFixed(2)} ${unit}`;
  }

  formatPace(secPerKm) {
    if (!secPerKm || !Number.isFinite(secPerKm)) return '—';
    const adjusted = this.profile?.unit === 'imperial' ? secPerKm * 1.609344 : secPerKm;
    const minutes = Math.floor(adjusted / 60);
    const seconds = Math.round(adjusted % 60);
    const unit = this.profile?.unit === 'imperial' ? 'mi' : 'km';
    return `${minutes}:${String(seconds).padStart(2, '0')}/${unit}`;
  }

  getActivityDetailText(activity) {
    const parts = [`${activity.durationMinutes} min`];
    if (Number(activity.distanceKm) > 0) {
      parts.push(this.formatDistance(Number(activity.distanceKm) * 1000));
    }
    if (activity.paceSecPerKm) {
      parts.push(this.formatPace(activity.paceSecPerKm));
    } else if (activity.intensity) {
      parts.push(activity.intensity);
    }
    if (activity.steps > 0) {
      parts.push(`${activity.steps.toLocaleString()} steps`);
    }
    return parts.join(' • ');
  }

  getBellyChartOptions() {
    return {
      valueKey: 'valueCm',
      unit: this.getBodyMeasurementUnit(),
      multiplier: this.profile?.unit === 'imperial' ? 1 / 2.54 : 1,
      color: '#FFB74D',
      fillColor: 'rgba(255, 183, 77, 0.18)',
      emptyLabel: 'No belly data yet'
    };
  }

  formatDate(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  formatDateShort(date) {
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getDateKey() {
    const d = this.currentDate;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  getHeartRateZone(bpm, context = 'resting') {
    const value = Number(bpm) || 0;
    if (!value) return { label: 'No data yet', status: 'neutral' };

    const age = this.profile?.dob ? this.calculateAge(this.profile.dob) : 35;
    const maxHr = Math.max(150, 220 - age);
    const pct = value / maxHr;

    if (context === 'workout' || context === 'walking') {
      if (pct < 0.60) return { label: 'Easy', status: 'positive' };
      if (pct < 0.70) return { label: 'Fat burn', status: 'positive' };
      if (pct < 0.85) return { label: 'Cardio', status: 'neutral' };
      return { label: 'Peak', status: 'negative' };
    }

    if (context === 'recovery') {
      if (value <= 90) return { label: 'Recovering', status: 'positive' };
      if (value <= 110) return { label: 'Elevated', status: 'neutral' };
      return { label: 'High', status: 'negative' };
    }

    if (value < 55) return { label: 'Low resting', status: 'neutral' };
    if (value <= 75) return { label: 'Resting', status: 'positive' };
    if (value <= 90) return { label: 'Elevated', status: 'neutral' };
    return { label: 'High resting', status: 'negative' };
  }

  formatHeartRateTime(entry) {
    const date = new Date(entry.timestamp || entry.date);
    if (Number.isNaN(date.getTime())) return entry.context || 'manual';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  getActivityEmoji(type) {
    const map = {
      cardio: '🔥', running: '🏃', strength: '🏋️', flexibility: '🧘',
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

  // ══════════════════════════════════════════════════
  // PWA INSTALL (Android / Desktop Chrome)
  // ══════════════════════════════════════════════════
  async installApp() {
    const prompt = window._pwaInstall?.prompt;
    if (!prompt) return;

    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') {
      this.showToast('Nouri installed!', 'success');
    }
    window._pwaInstall.clear();
    document.getElementById('install-banner')?.classList.add('hidden');
  }

  dismissInstallBanner() {
    document.getElementById('install-banner')?.classList.add('hidden');
    localStorage.setItem('install-dismissed', Date.now().toString());
  }

  // ══════════════════════════════════════════════════
  // FEATURE 1: DATE NAVIGATION STRIP
  // ══════════════════════════════════════════════════
  renderDateStrip() {
    const container = document.getElementById('date-strip');
    if (!container) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Calculate the start of the displayed week
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 3 + this.dateRangeOffset);

    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);

      const isToday = d.getTime() === today.getTime();
      const isSelected = d.toDateString() === this.currentDate.toDateString();
      const isFuture = d > today;
      const dateStr = d.toISOString().split('T')[0];

      let cls = 'date-strip-day';
      if (isSelected) cls += ' selected';
      if (isToday) cls += ' today';
      if (isFuture) cls += ' future';

      html += `<button class="${cls}" onclick="app.selectDate('${dateStr}')" ${isFuture ? 'disabled' : ''}>
        <span class="dsd-name">${days[d.getDay()]}</span>
        <span class="dsd-num">${d.getDate()}</span>
        ${isToday ? '<span class="dsd-dot"></span>' : ''}
      </button>`;
    }
    container.innerHTML = html;
  }

  selectDate(dateStr) {
    this.currentDate = new Date(dateStr + 'T12:00:00');
    this.renderDateStrip();
    this.updateHeaderDate();
    this.renderDashboard();
  }

  shiftDateRange(days) {
    this.dateRangeOffset += days;
    this.renderDateStrip();
  }

  // ══════════════════════════════════════════════════
  // FEATURE 2: ANIMATED NUMBER COUNTERS
  // ══════════════════════════════════════════════════
  animateCounter(element, targetValue, duration = 600) {
    if (!element) return;
    const startValue = parseInt(element.textContent) || 0;
    if (startValue === targetValue) return;

    const startTime = performance.now();
    const diff = targetValue - startValue;

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(startValue + diff * eased);
      element.textContent = current;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // ══════════════════════════════════════════════════
  // FEATURE 3: CONFETTI CELEBRATION
  // ══════════════════════════════════════════════════
  fireConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#00D4AA', '#7C4DFF', '#FFD93D', '#FF6B6B', '#4ECDC4', '#45B7D1'];

    // Create 80 particles
    for (let i = 0; i < 80; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 100,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 12,
        vy: -Math.random() * 14 - 4,
        size: Math.random() * 8 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.3,
        opacity: 1,
        shape: Math.random() > 0.5 ? 'rect' : 'circle'
      });
    }

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        if (p.opacity <= 0) return;
        alive = true;

        p.x += p.vx;
        p.vy += p.gravity;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        p.opacity -= 0.012;
        p.vx *= 0.99;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillStyle = p.color;

        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      frame++;
      if (alive && frame < 150) {
        requestAnimationFrame(animate);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    animate();
  }

  checkGoalCelebration(eaten, goal) {
    // Trigger confetti when user reaches 90-100% of calorie goal
    const pct = eaten / goal;
    const celebratedToday = localStorage.getItem('celebrated-' + this.getDateKey());
    if (pct >= 0.9 && pct <= 1.05 && !celebratedToday) {
      localStorage.setItem('celebrated-' + this.getDateKey(), 'true');
      setTimeout(() => {
        this.fireConfetti();
        this.showToast('🎉 You hit your calorie goal!', 'success');
      }, 300);
    }
  }

  // ══════════════════════════════════════════════════
  // FEATURE 4: FAVORITES & RECENT FOODS
  // ══════════════════════════════════════════════════
  getRecentFoods() {
    try {
      return JSON.parse(localStorage.getItem('recent-foods') || '[]');
    } catch { return []; }
  }

  addToRecentFoods(food) {
    let recents = this.getRecentFoods();
    // Remove duplicates
    recents = recents.filter(f => f.name !== food.name);
    // Add to front
    recents.unshift({
      name: food.name,
      cal: food.cal,
      protein: food.protein || 0,
      carbs: food.carbs || 0,
      fat: food.fat || 0,
      fiber: food.fiber || 0,
      serving: food.serving || '1 serving'
    });
    // Keep only last 10
    recents = recents.slice(0, 10);
    localStorage.setItem('recent-foods', JSON.stringify(recents));
  }

  getFavoriteFoods() {
    try {
      return JSON.parse(localStorage.getItem('favorite-foods') || '[]');
    } catch { return []; }
  }

  toggleFavorite(foodName) {
    let favorites = this.getFavoriteFoods();
    const idx = favorites.findIndex(f => f.name === foodName);
    if (idx >= 0) {
      favorites.splice(idx, 1);
      this.showToast('Removed from favorites', 'info');
    } else {
      // Find the food data
      const allFoods = this.getAllFoodsIncludingCustom();
      const food = allFoods.find(f => f.name === foodName);
      if (food) {
        favorites.push({
          name: food.name,
          cal: food.cal,
          protein: food.protein || 0,
          carbs: food.carbs || 0,
          fat: food.fat || 0,
          fiber: food.fiber || 0,
          serving: food.serving || '1 serving'
        });
        this.showToast('⭐ Added to favorites!', 'success');
      }
    }
    localStorage.setItem('favorite-foods', JSON.stringify(favorites));
    this.renderFoodFavorites();
  }

  isFavorite(foodName) {
    return this.getFavoriteFoods().some(f => f.name === foodName);
  }

  renderFoodFavorites() {
    const container = document.getElementById('food-favorites');
    if (!container) return;

    const recents = this.getRecentFoods();
    const favorites = this.getFavoriteFoods();

    if (recents.length === 0 && favorites.length === 0) {
      container.innerHTML = '';
      return;
    }

    let html = '';

    if (favorites.length > 0) {
      html += `<div class="fav-section">
        <div class="fav-header">⭐ Favorites</div>
        <div class="fav-chips">
          ${favorites.map(f => `
            <button class="fav-chip" onclick="app.quickLogFromFav(decodeURIComponent('${encodeURIComponent(f.name)}'))">
              ${this.escapeHTML(f.name)} <span class="fav-chip-cal">${f.cal}</span>
            </button>
          `).join('')}
        </div>
      </div>`;
    }

    if (recents.length > 0) {
      html += `<div class="fav-section">
        <div class="fav-header">🕐 Recent</div>
        <div class="fav-chips">
          ${recents.slice(0, 6).map(f => `
            <button class="fav-chip fav-chip-recent" onclick="app.quickLogFromFav(decodeURIComponent('${encodeURIComponent(f.name)}'))">
              ${this.escapeHTML(f.name)} <span class="fav-chip-cal">${f.cal}</span>
            </button>
          `).join('')}
        </div>
      </div>`;
    }

    container.innerHTML = html;
  }

  quickLogFromFav(foodName) {
    const allFoods = [...this.getFavoriteFoods(), ...this.getRecentFoods(), ...this.getAllFoodsIncludingCustom()];
    const food = allFoods.find(f => f.name === foodName);
    if (food) {
      this.showFoodDetailModal(food);
    }
  }

  getAllFoodsIncludingCustom() {
    const builtIn = window.FOOD_DATABASE || [];
    const custom = this.getCustomFoods();
    return [...custom, ...builtIn];
  }

  // ══════════════════════════════════════════════════
  // FEATURE 5: CUSTOM FOOD CREATOR
  // ══════════════════════════════════════════════════
  getCustomFoods() {
    try {
      return JSON.parse(localStorage.getItem('custom-foods') || '[]');
    } catch { return []; }
  }

  showCustomFoodModal() {
    // Clear the form
    ['cf-name', 'cf-cal', 'cf-protein', 'cf-carbs', 'cf-fat', 'cf-fiber'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('cf-serving').value = '100g';
    this.openModal('custom-food-modal');
  }

  saveCustomFood() {
    const name = document.getElementById('cf-name')?.value?.trim();
    const serving = document.getElementById('cf-serving')?.value?.trim() || '100g';
    const cal = parseInt(document.getElementById('cf-cal')?.value) || 0;
    const protein = parseFloat(document.getElementById('cf-protein')?.value) || 0;
    const carbs = parseFloat(document.getElementById('cf-carbs')?.value) || 0;
    const fat = parseFloat(document.getElementById('cf-fat')?.value) || 0;
    const fiber = parseFloat(document.getElementById('cf-fiber')?.value) || 0;

    if (!name) {
      this.showToast('Please enter a food name', 'error');
      return;
    }
    if (cal === 0) {
      this.showToast('Please enter calories', 'error');
      return;
    }

    const customFoods = this.getCustomFoods();
    // Check for duplicate
    const existingIdx = customFoods.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
      customFoods[existingIdx] = { name, cal, protein, carbs, fat, fiber, serving, custom: true };
    } else {
      customFoods.push({ name, cal, protein, carbs, fat, fiber, serving, custom: true });
    }

    localStorage.setItem('custom-foods', JSON.stringify(customFoods));
    this.closeModal('custom-food-modal');
    this.showToast(`🍳 "${name}" saved!`, 'success');

    // Refresh food search if on food page
    if (this.currentPage === 'food') {
      this.renderFoodPage();
    }
  }

  // ══════════════════════════════════════════════════
  // FEATURE 6: EXPORT / IMPORT DATA
  // ══════════════════════════════════════════════════
  async exportData() {
    try {
      const data = {
        version: 3,
        exportDate: new Date().toISOString(),
        profile: await window.nutriDB.getProfile(),
        meals: await window.nutriDB.getAllMeals(),
        weights: await window.nutriDB.getAllWeights(),
        activities: await window.nutriDB.getAllActivities(),
        water: await window.nutriDB.getAllWater(),
        heartRates: await window.nutriDB.getAllHeartRates(),
        bodyMeasurements: await window.nutriDB.getAllBodyMeasurements(),
        customFoods: this.getCustomFoods(),
        favoriteFoods: this.getFavoriteFoods(),
        recentFoods: this.getRecentFoods()
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nouri-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.showToast('📤 Data exported!', 'success');
    } catch (e) {
      this.showToast('Export failed: ' + e.message, 'error');
    }
  }

  async importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.profile) {
        throw new Error('Invalid backup file');
      }

      // Confirm before importing
      if (!confirm('This will replace all your current data. Continue?')) {
        event.target.value = '';
        return;
      }

      await Promise.all([
        window.nutriDB.clearStore('meals'),
        window.nutriDB.clearStore('weights'),
        window.nutriDB.clearStore('activities'),
        window.nutriDB.clearStore('water'),
        window.nutriDB.clearStore('heartRates'),
        window.nutriDB.clearStore('bodyMeasurements')
      ]);

      // Import profile
      await window.nutriDB.saveProfile(data.profile);

      // Import meals
      if (data.meals?.length) {
        for (const meal of data.meals) {
          await window.nutriDB.addMeal(meal);
        }
      }

      // Import weights
      if (data.weights?.length) {
        for (const w of data.weights) {
          await window.nutriDB.addWeight(w);
        }
      }

      // Import activities
      if (data.activities?.length) {
        for (const activity of data.activities) {
          await window.nutriDB.addActivity(activity);
        }
      }

      // Import water
      if (data.water?.length) {
        for (const water of data.water) {
          await window.nutriDB.addWater(water);
        }
      }

      // Import heart rate
      if (data.heartRates?.length) {
        for (const heartRate of data.heartRates) {
          await window.nutriDB.addHeartRate(heartRate);
        }
      }

      // Import body measurements
      if (data.bodyMeasurements?.length) {
        for (const measurement of data.bodyMeasurements) {
          await window.nutriDB.addBodyMeasurement(measurement);
        }
      }

      // Import localStorage data
      if (data.customFoods) localStorage.setItem('custom-foods', JSON.stringify(data.customFoods));
      if (data.favoriteFoods) localStorage.setItem('favorite-foods', JSON.stringify(data.favoriteFoods));
      if (data.recentFoods) localStorage.setItem('recent-foods', JSON.stringify(data.recentFoods));

      // Reload
      this.profile = await window.nutriDB.getProfile();
      this.showToast('📥 Data imported successfully!', 'success');
      this.closeModal('settings-modal');
      this.renderDashboard();

      event.target.value = '';
    } catch (e) {
      this.showToast('Import failed: ' + e.message, 'error');
      event.target.value = '';
    }
  }
}

// ── Initialize ──
const app = new NutriApp();
document.addEventListener('DOMContentLoaded', () => app.init());
