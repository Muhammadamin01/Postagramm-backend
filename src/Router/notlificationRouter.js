const express = require('express');
const router = express.Router();
const NotificationCtrl = require('../Controller/notlificationCtrl');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, NotificationCtrl.createNotification);
router.get('/:userId', auth, NotificationCtrl.getNotifications);
router.patch('/:id/read', auth, NotificationCtrl.readNotification);
router.delete('/:id', auth, NotificationCtrl.deleteNotification);
router.delete('/all/:userId', auth, NotificationCtrl.deleteAllNotifications);

module.exports = router;