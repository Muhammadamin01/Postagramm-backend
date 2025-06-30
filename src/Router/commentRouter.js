const express = require('express');
const router = express.Router();
const commentCtrl = require('../Controller/commentCtrl');
const auth = require('../middleware/authMiddleware');

router.post('/', auth, commentCtrl.createComment);
router.get('/:postId', commentCtrl.getCommentsByPost);
router.put('/:id', auth, commentCtrl.updateComment);
router.delete('/:id', auth, commentCtrl.deleteComment);

module.exports = router; 