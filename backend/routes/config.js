const express = require('express');
const router = express.Router();
const { getIgnorePlatforms } = require('../utils/ignore-platform');

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      ignorePlatforms: getIgnorePlatforms()
    }
  });
});

module.exports = router;
