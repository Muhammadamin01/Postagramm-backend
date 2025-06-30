const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const User = require('../Model/UserModel');
const Post = require('../Model/postModel');
const Comment = require('../Model/commentsModel');
const Notification = require('../Model/notificatoinModel');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const userCtrl = {
  deleteUser: async (req, res) => {
    try {
      const userId = req.params.id;
      if (req.user.role !== 101 && req.user._id.toString() !== userId) {
        return res.status(403).json({ message: 'Sizda bu foydalanuvchini o‘chirish huquqi yo‘q' });
      }
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

      const posts = await Post.find({ userId });
      await Promise.all(posts.map(async post => {
        if (post.postImage && post.postImage.filename) {
          await cloudinary.uploader.destroy(post.postImage.filename).catch(() => { });
        }
        await Comment.deleteMany({ postId: post._id });
        await Post.findByIdAndDelete(post._id);
      }));

      await Promise.all([
        Comment.deleteMany({ userId }),
        Post.updateMany({ likes: userId }, { $pull: { likes: userId } }),
        User.updateMany({ followers: userId }, { $pull: { followers: userId } }),
        User.updateMany({ following: userId }, { $pull: { following: userId } }),
        Notification.deleteMany({ $or: [{ senderId: userId }, { receiverId: userId }] })
      ]);

      if (user.profileImage && user.profileImage.public_id) {
        await cloudinary.uploader.destroy(user.profileImage.public_id).catch(() => { });
      }
      await User.findByIdAndDelete(userId);

      res.status(200).json({ message: 'Foydalanuvchi va unga tegishli barcha maʼlumotlar o‘chirildi' });
    } catch (error) {
      console.error('Delete User Error:', error.stack);
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  updateUser: async (req, res) => {
    try {
      const userId = req.params.id;
      if (req.user.role !== 101 && req.user._id.toString() !== userId) {
        return res.status(403).json({ message: "Sizda bu foydalanuvchini yangilash huquqi yo‘q" });
      }
      const user = await User.findById(userId).select('+password');
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

      const [emailExists, usernameExists] = await Promise.all([
        req.body.email && req.body.email !== user.email
          ? User.findOne({ email: req.body.email })
          : null,
        req.body.username && req.body.username !== user.username
          ? User.findOne({ username: req.body.username })
          : null
      ]);
      if (emailExists) return res.status(400).json({ message: 'Bu email allaqachon band' });
      if (usernameExists) return res.status(400).json({ message: 'Bu username allaqachon band' });

      if (req.body.email) user.email = req.body.email;
      if (req.body.username) user.username = req.body.username;
      if (req.body.surname) user.surname = req.body.surname;
      if (req.body.job !== undefined) user.job = req.body.job;
      if (req.body.hobby !== undefined) user.hobby = req.body.hobby;

      if (req.files && req.files.profileImage) {
        if (user.profileImage && user.profileImage.public_id) {
          await cloudinary.uploader.destroy(user.profileImage.public_id).catch(() => { });
        }
        const file = req.files.profileImage;
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'profiles',
          resource_type: 'auto',
        });
        await fs.promises.unlink(file.tempFilePath);
        user.profileImage = { url: result.secure_url, public_id: result.public_id };
      }

      if (req.body.newPassword) {
        if (!req.body.currentPassword) {
          return res.status(400).json({ message: 'Joriy parolni kiriting' });
        }
        const isMatch = await bcrypt.compare(req.body.currentPassword, user.password);
        if (!isMatch) {
          return res.status(400).json({ message: 'Joriy parol notoʻgʻri' });
        }
        if (req.body.newPassword.length < 4) {
          return res.status(400).json({ message: "Yangi parol kamida 4 ta belgidan iborat bo‘lishi kerak" });
        }
        user.password = req.body.newPassword;
      }

      await user.save();
      const userToReturn = user.toObject();
      delete userToReturn.password;
      res.status(200).json({ message: 'Foydalanuvchi muvaffaqiyatli yangilandi', user: userToReturn });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(400).json({ message: "Username yoki email band" });
      }
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  searchOrGetUsers: async (req, res) => {
    try {
      const q = req.query.q || '';
      let users;
      if (q) {
        users = await User.find({ username: { $regex: q, $options: 'i' } }).select('-password');
      } else {
        users = await User.find().select('-password');
      }
      res.status(200).json(users);
    } catch (err) {
      res.status(500).json({ message: "Foydalanuvchilarni olishda xatolik" });
    }
  },

  getCurrentUser: async (req, res) => {
    try {
      const user = await User.findById(req.user._id).select('-password');
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  getOneUser: async (req, res) => {
    try {
      const user = await User.findById(req.params.id).select('-password');
      if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      res.status(200).json(user);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // FOLLOW
  followUser: async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const myUserId = req.user._id.toString();

      if (!mongoose.Types.ObjectId.isValid(targetUserId) || !mongoose.Types.ObjectId.isValid(myUserId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri ID formati' });
      }
      if (targetUserId === myUserId) {
        return res.status(400).json({ message: "O‘zingizni follow qilib bo‘lmaydi" });
      }

      const targetUser = await User.findById(targetUserId);
      const myUser = await User.findById(myUserId);

      if (!myUser.following.map(String).includes(targetUserId)) {
        myUser.following.push(targetUserId);
        await myUser.save();
      }
      if (!targetUser.followers.map(String).includes(myUserId)) {
        targetUser.followers.push(myUserId);
        await targetUser.save();
      }

      const updatedTarget = await User.findById(targetUserId).select('-password');
      const updatedMe = await User.findById(myUserId).select('-password');
      return res.status(200).json({
        message: 'Follow qilindi',
        user: updatedTarget,
        currentUser: updatedMe
      });
    } catch (error) {
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  // UNFOLLOW
  unfollowUser: async (req, res) => {
    try {
      const targetUserId = req.params.id;
      const myUserId = req.user._id.toString();

      if (!mongoose.Types.ObjectId.isValid(targetUserId) || !mongoose.Types.ObjectId.isValid(myUserId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri ID formati' });
      }

      const targetUser = await User.findById(targetUserId);
      const myUser = await User.findById(myUserId);

      myUser.following = myUser.following.filter(id => id.toString() !== targetUserId);
      await myUser.save();

      targetUser.followers = targetUser.followers.filter(id => id.toString() !== myUserId);
      await targetUser.save();

      const updatedTarget = await User.findById(targetUserId).select('-password');
      const updatedMe = await User.findById(myUserId).select('-password');
      return res.status(200).json({
        message: 'Unfollow qilindi',
        user: updatedTarget,
        currentUser: updatedMe
      });
    } catch (error) {
      res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
    }
  },

  getProfile: async (req, res) => {
    try {
      const userId = req.params.userId;
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri foydalanuvchi ID formati' });
      }
      const user = await User.findById(userId)
        .select('username bio followers following profileImage')
        .lean();
      if (!user) {
        return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });
      }
      user.followersCount = Array.isArray(user.followers) ? user.followers.length : 0;
      user.followingCount = Array.isArray(user.following) ? user.following.length : 0;
      user.followers = undefined;
      user.following = undefined;

      if (!req.user || !req.user._id) {
        user.isFollowed = false;
      } else {
        if (!mongoose.Types.ObjectId.isValid(req.user._id)) {
          return res.status(400).json({ message: 'Noto‘g‘ri joriy foydalanuvchi ID formati' });
        }
        const currentUser = await User.findById(req.user._id).lean();
        if (!currentUser) {
          return res.status(404).json({ message: 'Joriy foydalanuvchi topilmadi' });
        }
        user.isFollowed = Array.isArray(currentUser.following) && currentUser.following.some(id => id.toString() === userId);
      }
      res.status(200).json(user);
    } catch (error) {
      console.error('Profil olishda xato:', error.stack);
      res.status(500).json({ message: 'Serverda xato yuz berdi: ' + error.message });
    }
  },

   getLikedPosts: async (req, res) => {
    try {
      const posts = await Post.find({ likes: req.params.id })
        .populate('userId', 'username profileImage')
        .lean();

      res.json(posts.map(post => ({
        ...post,
        _action: 'like',
      })));
    } catch (e) {
      res.status(500).json({ message: "Layk bosilgan postlarni olishda xatolik" });
    }
  },

  getCommentedPosts: async (req, res) => {
    try {
      const comments = await Comment.find({ userId: req.params.id })
        .populate('postId')
        .lean();

      const postIds = comments.map(c => c.postId?._id).filter(Boolean);
      const posts = await Post.find({ _id: { $in: postIds } }).lean();

      const result = comments.map(c => ({
        comment: c,
        post: posts.find(p => p._id.toString() === c.postId?._id?.toString()),
        _action: 'comment'
      }));

      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Komment qoldirilgan postlarni olishda xatolik" });
    }
  },

  getMyPosts: async (req, res) => {
    try {
      const posts = await Post.find({ userId: req.params.id })
        .populate('userId', 'username profileImage')
        .lean();

      res.json(posts.map(post => ({
        ...post,
        _action: 'post'
      })));
    } catch (e) {
      res.status(500).json({ message: "User postlarini olishda xatolik" });
    }
  },

};

module.exports = userCtrl;