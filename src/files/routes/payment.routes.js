'use strict';

const express = require('express');
const { createPayment } = require('../controllers/payment.controller');

const router = express.Router();

router.post('/payments', createPayment);

module.exports = router;
