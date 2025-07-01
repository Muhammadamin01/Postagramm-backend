const Post = require('../Model/postModel');
const Comment = require('../Model/commentsModel');
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
const Notification = require('../Model/notificatoinModel'); // Imlo to‘g‘irlandi
const fs = require('fs');

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const postCtrl = {
  getAllPosts: async (req, res) => {
    try {
      const userIdFilter = req.query.userId;
      let query = {};

      if (userIdFilter) {
        if (!mongoose.Types.ObjectId.isValid(userIdFilter)) {
          return res.status(400).json({ message: 'Noto‘g‘ri foydalanuvchi ID formati' });
        }
        query = { userId: new mongoose.Types.ObjectId(userIdFilter) };
      }

      const posts = await Post.find(query)
        .populate('userId', 'username profileImage email')
        .populate({
          path: 'comments',
          populate: { path: 'userId', select: 'username profileImage email' },
        })
        .sort({ createdAt: -1 });

      res.status(200).json(posts);
    } catch (err) {
      console.error('getAllPosts error:', err.message, err.stack);
      res.status(500).json({ message: 'Server xatosi: Postlarni olishda muammo' });
    }
  },

  myPosts: async (req, res) => {
    try {
      const targetUserId = req.params.userId || req.user._id;
      if (!targetUserId) {
        return res.status(401).json({ message: 'Foydalanuvchi autentifikatsiya qilinmagan' });
      }

      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return res.status(400).json({ message: 'Noto‘g‘ri foydalanuvchi ID formati' });
      }

      const userId = new mongoose.Types.ObjectId(targetUserId);
      const posts = await Post.find({ userId })
        .populate('userId', 'username profileImage')
        .populate({
          path: 'comments',
          populate: { path: 'userId', select: 'username profileImage' },
        })
        .sort({ createdAt: -1});

      res.status(200).json(posts);
    } catch (err) {
      console.error('myPosts error:', err.message, err.stack);
      res.status(500).json({ message: 'Server xatosi: O‘z postlarini olishda muammo' });
    }
  },

  createPost: async (req, res) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({ message: 'Kontent majburiy' });
      }

      let postImage = null;
      if (req.files && req.files.postImage) {
        const file = req.files.postImage;
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'posts',
          resource_type: 'auto',
        });
        fs.unlinkSync(file.tempFilePath); // Vaqtinchalik faylni o‘chirish
        postImage = { url: result.secure_url, filename: result.public_id };
      } else {
        console.log('Rasm yuklanmadi:', req.files);
      }

      const newPost = await Post.create({
        userId: req.user._id,
        content,
        postImage,
      });

      const populatedPost = await Post.findById(newPost._id)
        .populate('userId', 'username profileImage')
        .populate({
          path: 'comments',
          populate: { path: 'userId', select: 'username profileImage' },
        });

      res.status(201).json({ post: populatedPost });
    } catch (err) {
      console.error('createPost error:', err.message, err.stack);
      res.status(500).json({ message: 'Server xatosi: Post yaratishda muammo', error: err.message });
    }
  },

  // updatePost: async (req, res) => {
  //   try {
  //     const post = await Post.findById(req.params.id);
  //     if (!post) {
  //       return res.status(404).json({ message: 'Post topilmadi' });
  //     }
  //     if (post.userId.toString() !== req.user._id.toString()) {
  //       return res.status(403).json({ message: 'Faqat o‘zingizning postingizni yangilay olasiz' });
  //     }

  //     post.content = req.body.content || post.content;
  //     if (req.files && req.files.postImage) {
  //       if (post.postImage && post.postImage.filename) {
  //         await cloudinary.uploader.destroy(post.postImage.filename);
  //       }
  //       const file = req.files.postImage;
  //       const result = await cloudinary.uploader.upload(file.tempFilePath, {
  //         folder: 'posts',
  //         resource_type: 'auto',
  //       });
  //       fs.unlinkSync(file.tempFilePath);
  //       post.postImage = { url: result.secure_url, filename: result.public_id };
  //     }
  //     await post.save();

  //     const populatedPost = await Post.findById(req.params.id)
  //       .populate('userId', 'username profileImage')
  //       .populate({
  //         path: 'comments',
  //         populate: { path: 'userId', select: 'username profileImage' },
  //       });

  //     res.status(200).json({ post: populatedPost });
  //   } catch (err) {
  //     console.error('updatePost error:', err.message, err.stack);
  //     res.status(500).json({ message: 'Server xatosi: Post yangilashda muammo', error: err.message });
  //   }
  // },



  updatePost: async (req, res) => {
    try {
      const postId = req.params.id;
      const { content, clearImage } = req.body; // Destructure 'content' and 'clearImage' from req.body

      const post = await Post.findById(postId);

      if (!post) {
        return res.status(404).json({ message: 'Post topilmadi' });
      }

      // Ensure req.user._id is correctly populated by your authentication middleware
      if (post.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Faqat o‘zingizning postingizni yangilay olasiz' });
      }

      // Update post content if provided
      if (content !== undefined && content !== null) { // Check if content is explicitly sent
        post.content = content;
      }

      // --- Image Handling Logic ---
      if (req.files && req.files.postImage) {
        // Case 1: A new image file is uploaded
        // Delete old image from Cloudinary if it exists
        if (post.postImage && post.postImage.filename) {
          await cloudinary.uploader.destroy(post.postImage.filename);
        }

        const file = req.files.postImage;
        const result = await cloudinary.uploader.upload(file.tempFilePath, {
          folder: 'posts',
          resource_type: 'auto',
        });
        fs.unlinkSync(file.tempFilePath); // Remove temporary file

        post.postImage = { url: result.secure_url, filename: result.public_id };
      } else if (clearImage === 'true') {
        // Case 2: User explicitly requested to clear the image
        // Frontend sends clearImage: 'true' as a string in formData
        if (post.postImage && post.postImage.filename) {
          // Delete existing image from Cloudinary
          await cloudinary.uploader.destroy(post.postImage.filename);
        }
        post.postImage = null; // Set postImage to null in the database
      }
      // Case 3: Neither a new image is uploaded nor clearImage is true.
      // In this case, the post.postImage remains unchanged, which is the desired behavior.

      await post.save();

      // Populate the post with user and comment details for the response
      const populatedPost = await Post.findById(postId)
        .populate('userId', 'username profileImage')
        .populate({
          path: 'comments',
          populate: { path: 'userId', select: 'username profileImage' },
        });

      res.status(200).json({ post: populatedPost });
    } catch (err) {
      console.error('updatePost error:', err.message, err.stack);
      res.status(500).json({ message: 'Server xatosi: Post yangilashda muammo', error: err.message });
    }
  },
  deletePost: async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      if (!post) {
        return res.status(404).json({ message: 'Post topilmadi' });
      }
      if (post.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Faqat o‘zingizning postingizni o‘chira olasiz' });
      }
      if (post.postImage && post.postImage.filename) {
        await cloudinary.uploader.destroy(post.postImage.filename);
      }
      await Post.deleteOne({ _id: req.params.id });
      res.status(200).json({ message: 'Post o‘chirildi' });
    } catch (err) {
      console.error('deletePost error:', err.message, err.stack);
      res.status(500).json({ message: 'Server xatosi: Post o‘chirishda muammo' });
    }
  },

  getOnePost: async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(400).json({ message: 'Noto‘g‘ri post ID formati' });
      }

      const post = await Post.findById(req.params.id)
        .populate('userId', 'username profileImage')
        .populate({
          path: 'comments',
          populate: { path: 'userId', select: 'username profileImage' },
        });
      if (!post) {
        return res.status(404).json({ message: 'Post topilmadi' });
      }
      res.status(200).json(post);
    } catch (err) {
      console.error('getOnePost error:', err.message, err.stack);
      res.status(500).json({ message: 'Server xatosi: Post olishda muammo' });
    }
  },

  likePost: async (req, res) => {
    try {
      const postId = req.params.id;
      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post topilmadi' });
      }
  
      const userId = req.user?._id;
      if (!userId) {
        return res.status(401).json({ message: 'Foydalanuvchi autentifikatsiyasi topilmadi' });
      }
  
      const isLiked = post.likes.includes(userId.toString());
  
      if (isLiked) {
        post.likes = post.likes.filter((id) => id.toString() !== userId.toString());
  
        // (optional) Notificationni o‘chirish ham mumkin
        await Notification.deleteOne({
          senderId: userId,
          receiverId: post.userId,
          type: 'like',
          postId: post._id,
        });
      } else {
        post.likes.push(userId);
  
        if (post.userId.toString() !== userId.toString()) {
          // --- ASOSIY O‘ZGARISH: USERNAME-ni DBdan olish ---
          const sender = await require('../Model/UserModel').findById(userId);
          const senderUsername = sender?.username || sender?.name || "User";
  
          const existingNotification = await Notification.findOne({
            senderId: userId,
            receiverId: post.userId,
            type: 'like',
            postId: post._id,
          });
          if (!existingNotification) {
            const newNotification = await Notification.create({
              senderId: userId,
              receiverId: post.userId,
              type: 'like',
              message: `${senderUsername} sizning postingizga like bosdi: "${post.content.substring(0, 20)}..."`,
              postId: post._id,
            });
  
            const populatedNotification = await Notification.findById(newNotification._id)
              .populate('senderId', 'username profileImage')
              .populate('postId', 'content postImage');
  
            const receiverSocketId = global.onlineUsers.get(post.userId.toString());
            if (receiverSocketId) {
              global._io.to(receiverSocketId).emit('newNotification', populatedNotification);
            }
          }
        }
      }
  
      await post.save();
  
      const populatedPost = await Post.findById(postId)
        .populate('userId', 'username profileImage')
        .populate({
          path: 'comments',
          populate: { path: 'userId', select: 'username profileImage' },
        });
  
      res.status(200).json({ post: populatedPost });
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Like qo‘yishda muammo', error: err.message });
    }
  },

  unlikePost: async (req, res) => {
    try {
      const post = await Post.findById(req.params.id);
      if (!post) return res.status(404).json({ msg: "Post topilmadi" });
  
      post.likes = post.likes.filter(id => id.toString() !== req.user._id.toString());
      await post.save();
  
      await Notification.deleteOne({
        senderId: req.user._id,
        receiverId: post.userId,
        type: 'like',
        postId: post._id,
      });
  
      res.status(200).json(post);
    } catch (err) {
      res.status(500).json({ msg: err.message });
    }
  }
};

module.exports = postCtrl;