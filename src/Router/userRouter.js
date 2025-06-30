const express = require('express');
const router = express.Router();
const userCtrl = require('../Controller/userCtrl');
const auth = require('../middleware/authMiddleware');

router.get('/me', auth, userCtrl.getCurrentUser);

router.get('/:id/liked-posts', auth, userCtrl.getLikedPosts);
router.get('/:id/commented-posts', auth, userCtrl.getCommentedPosts);
router.get('/:id/my-posts', auth, userCtrl.getMyPosts);

router.get('/:id', auth, userCtrl.getOneUser);
router.get('/', auth, userCtrl.searchOrGetUsers);
router.put('/:id', auth, userCtrl.updateUser);
router.delete('/:id', auth, userCtrl.deleteUser);
router.put('/follow/:id', auth, userCtrl.followUser);
router.put('/unfollow/:id', auth, userCtrl.unfollowUser);

module.exports = router;