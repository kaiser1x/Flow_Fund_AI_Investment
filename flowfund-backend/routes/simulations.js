'use strict';

const express = require('express');
const router  = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  runSimulation,
  getPreFill,
  getSnapshots,
  getSnapshotsSummary,
  saveSnapshot,
  updateSnapshot,
  deleteSnapshot,
} = require('../controllers/simulationsController');

// Static routes BEFORE parameterized routes
router.post('/run',      authMiddleware, runSimulation);
router.get('/prefill',   authMiddleware, getPreFill);
router.get('/summary',   authMiddleware, getSnapshotsSummary);
router.get('/',          authMiddleware, getSnapshots);
router.post('/save',     authMiddleware, saveSnapshot);
router.patch('/:id',     authMiddleware, updateSnapshot);
router.delete('/:id',    authMiddleware, deleteSnapshot);

module.exports = router;
