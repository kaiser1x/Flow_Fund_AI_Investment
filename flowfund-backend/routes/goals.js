'use strict';

const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getGoals,
  getGoalsSummary,
  getGoalsInsights,
  createGoal,
  updateGoal,
  deleteGoal,
} = require('../controllers/goalsController');

// Static routes BEFORE parameterized routes
router.get('/summary',  authMiddleware, getGoalsSummary);
router.get('/insights', authMiddleware, getGoalsInsights);
router.get('/',         authMiddleware, getGoals);
router.post('/',        authMiddleware, createGoal);
router.patch('/:id',    authMiddleware, updateGoal);
router.delete('/:id',   authMiddleware, deleteGoal);

module.exports = router;
