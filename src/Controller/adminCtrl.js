const User = require('../Model/UserModel');
const Post = require('../Model/postModel');
const Comment = require('../Model/commentsModel');
const Notification = require('../Model/notificatoinModel');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const bcrypt = require('bcryptjs');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').lean();
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Userlarni olishda xatolik" });
  }
};

exports.getAllPosts = async (req, res) => {
  try {
    const posts = await Post.find()
      .populate('userId', 'username profileImage')
      .populate({ path: 'comments', populate: { path: 'userId', select: 'username profileImage' } })
      .sort({ createdAt: -1 })
      .lean();
    res.json(posts);
  } catch (err) {
    res.status(500).json({ message: "Postlarni olishda xatolik" });
  }
};

exports.getAllComments = async (req, res) => {
  try {
    const posts = await Post.find().select('_id');
    const validPostIds = posts.map(p=>String(p._id));
    const comments = await Comment.find({ postId: { $in: validPostIds } })
      .populate('userId', 'username profileImage')
      .populate('postId', 'content')
      .sort({ createdAt: -1 })
      .lean();
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: "Kommentlarni olishda xatolik" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'Foydalanuvchi topilmadi' });

    if (req.user.role !== 101 && req.user._id.toString() !== userId) {
      return res.status(403).json({ message: 'Sizda bu foydalanuvchini o‘chirish huquqi yo‘q' });
    }

    const posts = await Post.find({ userId });
    await Promise.all(posts.map(async post => {
      if (post.postImage && post.postImage.filename) {
        await cloudinary.uploader.destroy(post.postImage.filename).catch(() => {});
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
      await cloudinary.uploader.destroy(user.profileImage.public_id).catch(() => {});
    }
    await User.findByIdAndDelete(userId);

    res.status(200).json({ message: 'Foydalanuvchi va unga tegishli barcha maʼlumotlar o‘chirildi' });
  } catch (error) {
    res.status(500).json({ message: 'Serverda xatolik: ' + error.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    // Admin yoki o‘zi update qila oladi
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
        await cloudinary.uploader.destroy(user.profileImage.public_id).catch(() => {});
      }
      const file = req.files.profileImage;
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'profiles',
        resource_type: 'auto',
      });
      await fs.promises.unlink(file.tempFilePath);
      user.profileImage = { url: result.secure_url, public_id: result.public_id };
    }

    if (req.body.password && req.body.password.length > 0) {
      user.password = req.body.password; 
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
};

exports.deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post topilmadi' });
    if (post.postImage && post.postImage.filename) {
      await cloudinary.uploader.destroy(post.postImage.filename).catch(()=>{});
    }
    await Comment.deleteMany({ postId: post._id });
    await Post.deleteOne({ _id: req.params.id });
    res.json({ message: 'Post o‘chirildi' });
  } catch (err) {
    res.status(500).json({ message: 'Admin: Post o‘chirishda xatolik' });
  }
};

// ADMIN: Post update
exports.updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post topilmadi' });

    post.content = req.body.content || post.content;
    if (req.files && req.files.postImage) {
      if (post.postImage && post.postImage.filename) {
        await cloudinary.uploader.destroy(post.postImage.filename).catch(()=>{});
      }
      const file = req.files.postImage;
      const result = await cloudinary.uploader.upload(file.tempFilePath, {
        folder: 'posts',
        resource_type: 'auto',
      });
      fs.unlinkSync(file.tempFilePath);
      post.postImage = { url: result.secure_url, filename: result.public_id };
    }
    await post.save();

    const populatedPost = await Post.findById(req.params.id)
      .populate('userId', 'username profileImage')
      .populate({ path: 'comments', populate: { path: 'userId', select: 'username profileImage' } });

    res.status(200).json({ post: populatedPost });
  } catch (err) {
    res.status(500).json({ message: 'Server xatosi: Post yangilashda muammo', error: err.message });
  }
};

// ADMIN: Komment o‘chirish
exports.deleteComment = async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Komment topilmadi' });
    await Comment.deleteOne({ _id: req.params.id });
    await Post.findByIdAndUpdate(comment.postId, { $pull: { comments: comment._id } });
    res.json({ message: 'Komment o‘chirildi' });
  } catch (err) {
    res.status(500).json({ message: 'Admin: Komment o‘chirishda xatolik' });
  }
};

// ADMIN: Komment update
exports.updateComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ message: 'Text majburiy' });
    const comment = await Comment.findById(req.params.id);
    if (!comment) return res.status(404).json({ message: 'Komment topilmadi' });
    comment.text = text;
    await comment.save();
    res.json(comment);
  } catch (err) {
    res.status(500).json({ message: 'Admin: Komment yangilashda xatolik' });
  }
};

// ADMIN: Top likers
exports.getTopLikers = async (req, res) => {
  const agg = await Post.aggregate([
    { $unwind: "$likes" },
    { $group: { _id: "$likes", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  const users = await User.find({ _id: { $in: agg.map(a => a._id) } }).select('username profileImage').lean();
  const result = agg.map(a => {
    const user = users.find(u => u._id.toString() === a._id.toString());
    return { user, likeCount: a.count };
  });
  res.json(result);
};

// ADMIN: Top commenters
exports.getTopCommenters = async (req, res) => {
  const agg = await Comment.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  const users = await User.find({ _id: { $in: agg.map(a => a._id) } }).select('username profileImage').lean();
  const result = agg.map(a => {
    const user = users.find(u => u._id.toString() === a._id.toString());
    return { user, commentCount: a.count };
  });
  res.json(result);
};

// ADMIN: Top posters
exports.getTopPosters = async (req, res) => {
  const agg = await Post.aggregate([
    { $group: { _id: "$userId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 10 }
  ]);
  const users = await User.find({ _id: { $in: agg.map(a => a._id) } }).select('username profileImage').lean();
  const result = agg.map(a => {
    const user = users.find(u => u._id.toString() === a._id.toString());
    return { user, postCount: a.count };
  });
  res.json(result);
};