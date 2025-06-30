
const express = require('express');
const router = express.Router();
const adminCtrl = require('../Controller/adminCtrl');
const auth = require('../middleware/authMiddleware'); 

// Faqat adminlar uchun
router.use(auth, (req, res, next) => {
  if (req.user.role !== 101) return res.status(403).json({ message: 'Faqat admin uchun!' });
  next();
});

router.get('/users', adminCtrl.getAllUsers);
router.get('/posts', adminCtrl.getAllPosts);
router.get('/comments', adminCtrl.getAllComments);

router.delete('/user/:id', adminCtrl.deleteUser);
router.put('/user/:id', adminCtrl.updateUser);

router.delete('/post/:id', adminCtrl.deletePost);
router.put('/post/:id', adminCtrl.updatePost);

router.delete('/comment/:id', adminCtrl.deleteComment);
router.put('/comment/:id', adminCtrl.updateComment);

router.get('/top/likers', adminCtrl.getTopLikers);
router.get('/top/commenters', adminCtrl.getTopCommenters);
router.get('/top/posters', adminCtrl.getTopPosters);

module.exports = router;