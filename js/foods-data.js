/* ═══════════════════════════════════════════════════════
   NutriTrack — Built-in Food Database
   Common foods with nutritional info per 100g
   ═══════════════════════════════════════════════════════ */

const FOOD_DATABASE = [
  // ── Proteins ──────────────────────────────────────
  { name: "Chicken Breast (grilled)", category: "Protein", cal: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, serving: "100g" },
  { name: "Chicken Thigh (grilled)", category: "Protein", cal: 209, protein: 26, carbs: 0, fat: 10.9, fiber: 0, serving: "100g" },
  { name: "Salmon (baked)", category: "Protein", cal: 208, protein: 20, carbs: 0, fat: 13, fiber: 0, serving: "100g" },
  { name: "Tuna (canned, in water)", category: "Protein", cal: 116, protein: 26, carbs: 0, fat: 0.8, fiber: 0, serving: "100g" },
  { name: "Shrimp (cooked)", category: "Protein", cal: 99, protein: 24, carbs: 0.2, fat: 0.3, fiber: 0, serving: "100g" },
  { name: "Ground Beef (lean)", category: "Protein", cal: 250, protein: 26, carbs: 0, fat: 15, fiber: 0, serving: "100g" },
  { name: "Turkey Breast", category: "Protein", cal: 135, protein: 30, carbs: 0, fat: 1, fiber: 0, serving: "100g" },
  { name: "Egg (whole, large)", category: "Protein", cal: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0, serving: "100g (≈2 eggs)" },
  { name: "Egg White", category: "Protein", cal: 52, protein: 11, carbs: 0.7, fat: 0.2, fiber: 0, serving: "100g" },
  { name: "Tofu (firm)", category: "Protein", cal: 144, protein: 17, carbs: 3, fat: 8, fiber: 2, serving: "100g" },
  { name: "Steak (sirloin)", category: "Protein", cal: 271, protein: 26, carbs: 0, fat: 18, fiber: 0, serving: "100g" },
  { name: "Lamb Chop", category: "Protein", cal: 294, protein: 25, carbs: 0, fat: 21, fiber: 0, serving: "100g" },
  { name: "Pork Tenderloin", category: "Protein", cal: 143, protein: 26, carbs: 0, fat: 3.5, fiber: 0, serving: "100g" },
  { name: "Cod Fish", category: "Protein", cal: 82, protein: 18, carbs: 0, fat: 0.7, fiber: 0, serving: "100g" },
  { name: "Cottage Cheese (low-fat)", category: "Protein", cal: 72, protein: 12, carbs: 2.7, fat: 1, fiber: 0, serving: "100g" },

  // ── Dairy ─────────────────────────────────────────
  { name: "Greek Yogurt (plain)", category: "Dairy", cal: 59, protein: 10, carbs: 3.6, fat: 0.7, fiber: 0, serving: "100g" },
  { name: "Whole Milk", category: "Dairy", cal: 61, protein: 3.2, carbs: 4.8, fat: 3.3, fiber: 0, serving: "100ml" },
  { name: "Cheddar Cheese", category: "Dairy", cal: 403, protein: 25, carbs: 1.3, fat: 33, fiber: 0, serving: "100g" },
  { name: "Mozzarella", category: "Dairy", cal: 280, protein: 28, carbs: 3.1, fat: 17, fiber: 0, serving: "100g" },
  { name: "Butter", category: "Dairy", cal: 717, protein: 0.9, carbs: 0.1, fat: 81, fiber: 0, serving: "100g" },
  { name: "Cream Cheese", category: "Dairy", cal: 342, protein: 6, carbs: 4, fat: 34, fiber: 0, serving: "100g" },
  { name: "Whey Protein Powder", category: "Dairy", cal: 380, protein: 75, carbs: 8, fat: 5, fiber: 0, serving: "100g (≈3 scoops)" },

  // ── Grains & Carbs ────────────────────────────────
  { name: "White Rice (cooked)", category: "Grains", cal: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, serving: "100g" },
  { name: "Brown Rice (cooked)", category: "Grains", cal: 123, protein: 2.7, carbs: 26, fat: 1, fiber: 1.6, serving: "100g" },
  { name: "Quinoa (cooked)", category: "Grains", cal: 120, protein: 4.4, carbs: 21, fat: 1.9, fiber: 2.8, serving: "100g" },
  { name: "Oats (dry)", category: "Grains", cal: 379, protein: 13, carbs: 68, fat: 7, fiber: 10, serving: "100g" },
  { name: "Pasta (cooked)", category: "Grains", cal: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, serving: "100g" },
  { name: "Whole Wheat Bread", category: "Grains", cal: 247, protein: 13, carbs: 41, fat: 3.4, fiber: 7, serving: "100g (≈3 slices)" },
  { name: "White Bread", category: "Grains", cal: 265, protein: 9, carbs: 49, fat: 3.2, fiber: 2.7, serving: "100g (≈3 slices)" },
  { name: "Tortilla (flour)", category: "Grains", cal: 312, protein: 8, carbs: 52, fat: 8, fiber: 2, serving: "100g" },
  { name: "Sweet Potato (baked)", category: "Grains", cal: 90, protein: 2, carbs: 21, fat: 0.1, fiber: 3.3, serving: "100g" },
  { name: "Potato (baked)", category: "Grains", cal: 93, protein: 2.5, carbs: 21, fat: 0.1, fiber: 2.2, serving: "100g" },
  { name: "Corn Tortilla", category: "Grains", cal: 218, protein: 5.7, carbs: 44, fat: 2.9, fiber: 5.2, serving: "100g" },

  // ── Fruits ────────────────────────────────────────
  { name: "Banana", category: "Fruits", cal: 89, protein: 1.1, carbs: 23, fat: 0.3, fiber: 2.6, serving: "100g (≈1 medium)" },
  { name: "Apple", category: "Fruits", cal: 52, protein: 0.3, carbs: 14, fat: 0.2, fiber: 2.4, serving: "100g (≈1 medium)" },
  { name: "Orange", category: "Fruits", cal: 47, protein: 0.9, carbs: 12, fat: 0.1, fiber: 2.4, serving: "100g" },
  { name: "Strawberries", category: "Fruits", cal: 32, protein: 0.7, carbs: 7.7, fat: 0.3, fiber: 2, serving: "100g" },
  { name: "Blueberries", category: "Fruits", cal: 57, protein: 0.7, carbs: 14, fat: 0.3, fiber: 2.4, serving: "100g" },
  { name: "Avocado", category: "Fruits", cal: 160, protein: 2, carbs: 8.5, fat: 15, fiber: 6.7, serving: "100g (≈½ medium)" },
  { name: "Mango", category: "Fruits", cal: 60, protein: 0.8, carbs: 15, fat: 0.4, fiber: 1.6, serving: "100g" },
  { name: "Grapes", category: "Fruits", cal: 69, protein: 0.7, carbs: 18, fat: 0.2, fiber: 0.9, serving: "100g" },
  { name: "Watermelon", category: "Fruits", cal: 30, protein: 0.6, carbs: 7.6, fat: 0.2, fiber: 0.4, serving: "100g" },
  { name: "Pineapple", category: "Fruits", cal: 50, protein: 0.5, carbs: 13, fat: 0.1, fiber: 1.4, serving: "100g" },

  // ── Vegetables ────────────────────────────────────
  { name: "Broccoli", category: "Vegetables", cal: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, serving: "100g" },
  { name: "Spinach (raw)", category: "Vegetables", cal: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, serving: "100g" },
  { name: "Tomato", category: "Vegetables", cal: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, serving: "100g" },
  { name: "Cucumber", category: "Vegetables", cal: 15, protein: 0.7, carbs: 3.6, fat: 0.1, fiber: 0.5, serving: "100g" },
  { name: "Carrot", category: "Vegetables", cal: 41, protein: 0.9, carbs: 10, fat: 0.2, fiber: 2.8, serving: "100g" },
  { name: "Bell Pepper", category: "Vegetables", cal: 31, protein: 1, carbs: 6, fat: 0.3, fiber: 2.1, serving: "100g" },
  { name: "Onion", category: "Vegetables", cal: 40, protein: 1.1, carbs: 9.3, fat: 0.1, fiber: 1.7, serving: "100g" },
  { name: "Mushrooms", category: "Vegetables", cal: 22, protein: 3.1, carbs: 3.3, fat: 0.3, fiber: 1, serving: "100g" },
  { name: "Lettuce (romaine)", category: "Vegetables", cal: 17, protein: 1.2, carbs: 3.3, fat: 0.3, fiber: 2.1, serving: "100g" },
  { name: "Cauliflower", category: "Vegetables", cal: 25, protein: 1.9, carbs: 5, fat: 0.3, fiber: 2, serving: "100g" },
  { name: "Zucchini", category: "Vegetables", cal: 17, protein: 1.2, carbs: 3.1, fat: 0.3, fiber: 1, serving: "100g" },
  { name: "Green Beans", category: "Vegetables", cal: 31, protein: 1.8, carbs: 7, fat: 0.1, fiber: 3.4, serving: "100g" },

  // ── Legumes & Nuts ────────────────────────────────
  { name: "Black Beans (cooked)", category: "Legumes", cal: 132, protein: 8.9, carbs: 24, fat: 0.5, fiber: 8.7, serving: "100g" },
  { name: "Chickpeas (cooked)", category: "Legumes", cal: 164, protein: 8.9, carbs: 27, fat: 2.6, fiber: 7.6, serving: "100g" },
  { name: "Lentils (cooked)", category: "Legumes", cal: 116, protein: 9, carbs: 20, fat: 0.4, fiber: 7.9, serving: "100g" },
  { name: "Almonds", category: "Nuts", cal: 579, protein: 21, carbs: 22, fat: 50, fiber: 12, serving: "100g (≈2/3 cup)" },
  { name: "Peanut Butter", category: "Nuts", cal: 588, protein: 25, carbs: 20, fat: 50, fiber: 6, serving: "100g (≈6 tbsp)" },
  { name: "Walnuts", category: "Nuts", cal: 654, protein: 15, carbs: 14, fat: 65, fiber: 6.7, serving: "100g" },
  { name: "Cashews", category: "Nuts", cal: 553, protein: 18, carbs: 30, fat: 44, fiber: 3.3, serving: "100g" },

  // ── Fats & Oils ───────────────────────────────────
  { name: "Olive Oil", category: "Fats", cal: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, serving: "100ml (≈7 tbsp)" },
  { name: "Coconut Oil", category: "Fats", cal: 862, protein: 0, carbs: 0, fat: 100, fiber: 0, serving: "100ml" },

  // ── Common Meals & Snacks ─────────────────────────
  { name: "Pizza Slice (cheese)", category: "Meals", cal: 266, protein: 11, carbs: 33, fat: 10, fiber: 2.3, serving: "1 slice (≈107g)" },
  { name: "Hamburger (with bun)", category: "Meals", cal: 295, protein: 17, carbs: 24, fat: 14, fiber: 1.3, serving: "1 burger (≈150g)" },
  { name: "Caesar Salad", category: "Meals", cal: 127, protein: 7, carbs: 7, fat: 8, fiber: 2, serving: "100g" },
  { name: "Burrito (chicken)", category: "Meals", cal: 190, protein: 10, carbs: 22, fat: 7, fiber: 2, serving: "100g" },
  { name: "Sushi Roll (California)", category: "Meals", cal: 93, protein: 3, carbs: 15, fat: 2.3, fiber: 0.6, serving: "100g (≈4 pieces)" },
  { name: "Granola Bar", category: "Snacks", cal: 471, protein: 10, carbs: 64, fat: 20, fiber: 5, serving: "100g (≈2 bars)" },
  { name: "Protein Bar", category: "Snacks", cal: 370, protein: 30, carbs: 35, fat: 12, fiber: 8, serving: "100g (≈1.5 bars)" },
  { name: "Dark Chocolate (70%)", category: "Snacks", cal: 598, protein: 8, carbs: 46, fat: 43, fiber: 11, serving: "100g" },
  { name: "Trail Mix", category: "Snacks", cal: 462, protein: 14, carbs: 44, fat: 29, fiber: 5, serving: "100g" },
  { name: "Popcorn (air-popped)", category: "Snacks", cal: 387, protein: 13, carbs: 78, fat: 4.5, fiber: 15, serving: "100g" },
  { name: "Rice Cakes", category: "Snacks", cal: 387, protein: 8, carbs: 84, fat: 2.8, fiber: 1.7, serving: "100g" },
  { name: "Hummus", category: "Snacks", cal: 166, protein: 8, carbs: 14, fat: 10, fiber: 6, serving: "100g" },

  // ── Drinks ────────────────────────────────────────
  { name: "Orange Juice", category: "Drinks", cal: 45, protein: 0.7, carbs: 10, fat: 0.2, fiber: 0.2, serving: "100ml" },
  { name: "Coffee (black)", category: "Drinks", cal: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, serving: "100ml (≈1 cup)" },
  { name: "Latte (full milk)", category: "Drinks", cal: 56, protein: 3, carbs: 5, fat: 2.5, fiber: 0, serving: "100ml" },
  { name: "Smoothie (fruit)", category: "Drinks", cal: 68, protein: 1, carbs: 16, fat: 0.3, fiber: 1, serving: "100ml" },
  { name: "Coca-Cola", category: "Drinks", cal: 42, protein: 0, carbs: 11, fat: 0, fiber: 0, serving: "100ml" },
  { name: "Beer (regular)", category: "Drinks", cal: 43, protein: 0.5, carbs: 3.6, fat: 0, fiber: 0, serving: "100ml" },
  { name: "Red Wine", category: "Drinks", cal: 85, protein: 0.1, carbs: 2.6, fat: 0, fiber: 0, serving: "100ml" },
  { name: "Green Tea", category: "Drinks", cal: 1, protein: 0, carbs: 0.2, fat: 0, fiber: 0, serving: "100ml" },
  { name: "Almond Milk (unsweetened)", category: "Drinks", cal: 15, protein: 0.6, carbs: 0.3, fat: 1.2, fiber: 0.2, serving: "100ml" },

  // ── Persian/Middle Eastern Foods ──────────────────
  { name: "Kebab Koobideh", category: "Meals", cal: 235, protein: 18, carbs: 2, fat: 17, fiber: 0.5, serving: "100g (≈1 skewer)" },
  { name: "Tahdig (crispy rice)", category: "Meals", cal: 195, protein: 3, carbs: 32, fat: 6, fiber: 0.5, serving: "100g" },
  { name: "Ghormeh Sabzi", category: "Meals", cal: 155, protein: 12, carbs: 8, fat: 9, fiber: 3, serving: "100g" },
  { name: "Joojeh Kabab", category: "Meals", cal: 175, protein: 25, carbs: 3, fat: 7, fiber: 0, serving: "100g" },
  { name: "Zereshk Polo", category: "Meals", cal: 165, protein: 4, carbs: 30, fat: 3, fiber: 1, serving: "100g" },
  { name: "Ash Reshteh", category: "Meals", cal: 85, protein: 4, carbs: 12, fat: 2.5, fiber: 3, serving: "100g" },
  { name: "Falafel", category: "Meals", cal: 333, protein: 13, carbs: 32, fat: 18, fiber: 5, serving: "100g (≈4 pieces)" },
  { name: "Shawarma (chicken)", category: "Meals", cal: 168, protein: 15, carbs: 10, fat: 8, fiber: 1, serving: "100g" },
  { name: "Basmati Rice (cooked)", category: "Grains", cal: 150, protein: 3.5, carbs: 32, fat: 0.4, fiber: 0.6, serving: "100g" },
  { name: "Lavash Bread", category: "Grains", cal: 275, protein: 9.2, carbs: 56, fat: 1.2, fiber: 2, serving: "100g" },
  { name: "Sangak Bread", category: "Grains", cal: 265, protein: 9, carbs: 53, fat: 1.5, fiber: 3, serving: "100g" },
  { name: "Dates (Medjool)", category: "Fruits", cal: 277, protein: 1.8, carbs: 75, fat: 0.2, fiber: 6.7, serving: "100g (≈4 dates)" },
];

// Search function with fuzzy matching
function searchFoods(query) {
  if (!query || query.trim().length < 2) return FOOD_DATABASE.slice(0, 20);

  const q = query.toLowerCase().trim();
  const words = q.split(/\s+/);

  const scored = FOOD_DATABASE.map(food => {
    const name = food.name.toLowerCase();
    const cat = food.category.toLowerCase();
    let score = 0;

    // Exact match
    if (name === q) score += 100;
    // Starts with
    if (name.startsWith(q)) score += 50;
    // Contains full query
    if (name.includes(q)) score += 30;
    // Category match
    if (cat.includes(q)) score += 15;

    // Each word match
    for (const w of words) {
      if (name.includes(w)) score += 10;
      if (cat.includes(w)) score += 5;
    }

    return { food, score };
  })
  .filter(s => s.score > 0)
  .sort((a, b) => b.score - a.score);

  return scored.map(s => s.food).slice(0, 25);
}

// Get food categories
function getFoodCategories() {
  return [...new Set(FOOD_DATABASE.map(f => f.category))];
}

window.FOOD_DATABASE = FOOD_DATABASE;
window.searchFoods = searchFoods;
window.getFoodCategories = getFoodCategories;
