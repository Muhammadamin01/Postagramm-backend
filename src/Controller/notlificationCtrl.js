const Notification = require('../Model/notificatoinModel');
const User = require('../Model/UserModel');
const Post = require('../Model/postModel');

const notificationCtrl = {
  createNotification: async (req, res) => {
    try {
      const { type, senderId, receiverId, postId, commentId, message } = req.body;

      if (!type || !senderId || !receiverId) {
        return res.status(400).json({ message: 'Type, senderId, receiverId majburiy!' });
      }
      if (senderId.toString() === receiverId.toString()) {
        return res.status(400).json({ message: "O'zingizga xabar yuborib bo'lmaydi!" });
      }

      const existingNotification = await Notification.findOne({
        senderId,
        receiverId,
        type,
        postId: postId || null,
        commentId: commentId || null,
      });
      if (existingNotification) {
        return res.status(200).json({ message: 'Bu notification allaqachon mavjud', notification: existingNotification });
      }

      const sender = await User.findById(senderId);
      const receiver = await User.findById(receiverId);
      if (!sender || !receiver) {
        return res.status(404).json({ message: 'Sender yoki receiver topilmadi!' });
      }

      let postContent = '';
      if (postId) {
        const post = await Post.findById(postId);
        postContent = post ? post.content : '';
      }

      let notifMessage = message;
      if (!notifMessage) {
        if (type === 'comment') {
          notifMessage = `${sender.username || sender.name || 'User'} sizning postingizga komment yozdi: "${postContent.substring(0, 20)}..."`;
        } else if (type === 'like') {
          notifMessage = `${sender.username || sender.name || 'User'} sizning postingizga like bosdi: "${postContent.substring(0, 20)}..."`;
        } else if (type === 'follow') {
          notifMessage = `${sender.username || sender.name || 'User'} sizni kuzatishni boshladi`;
        } else {
          notifMessage = `Yangi xabar: ${type}`;
        }
      }

      if (type === 'follow') {
        const isFollowing = receiver.followers.includes(senderId);
        if (!isFollowing) {
          receiver.followers.push(senderId);
          sender.following.push(receiverId);
          await receiver.save();
          await sender.save();
        }
      }

      const newNotification = new Notification({
        type,
        senderId,
        receiverId,
        postId: postId || null,
        commentId: commentId || null,
        message: notifMessage,
        isRead: false,
      });
      await newNotification.save();

      const populatedNotification = await Notification.findById(newNotification._id)
        .populate('senderId', 'username profileImage')
        .populate('postId', 'content postImage')
        .populate('commentId', 'content');

      const receiverSocketId = global.onlineUsers.get(receiverId.toString());
      if (receiverSocketId) {
        global._io.to(receiverSocketId).emit('newNotification', populatedNotification);
      }

      res.status(201).json(populatedNotification);
    } catch (err) {
      console.error('Create Notification Error:', err);
      res.status(500).json({ message: 'Serverda xatolik yuz berdi!' });
    }
  },

  getNotifications: async (req, res) => {
    try {
      const userId = req.params.userId;
      if (!userId) {
        return res.status(400).json({ message: 'User ID majburiy!' });
      }
      const notifications = await Notification.find({ receiverId: userId })
        .populate('senderId', 'username profileImage')
        .populate('postId', 'content postImage')
        .populate('commentId', 'content')
        .sort({ createdAt: -1 });

      res.status(200).json(notifications);
    } catch (err) {
      console.error('Get Notifications Error:', err);
      res.status(500).json({ message: 'Xatolik yuz berdi!' });
    }
  },

  readNotification: async (req, res) => {
    try {
      const notificationId = req.params.id;
      const notification = await Notification.findByIdAndUpdate(
        notificationId,
        { isRead: true },
        { new: true }
      );
      if (!notification) {
        return res.status(404).json({ message: 'Notification topilmadi!' });
      }
      const receiverSocketId = global.onlineUsers.get(notification.receiverId.toString());
      if (receiverSocketId) {
        global._io.to(receiverSocketId).emit('notificationUpdated', {
          notificationId: notification._id,
          isRead: true,
        });
      }
      res.status(200).json(notification);
    } catch (err) {
      console.error('Read Notification Error:', err);
      res.status(500).json({ message: 'Xatolik yuz berdi!' });
    }
  },

  deleteNotification: async (req, res) => {
    try {
      const notificationId = req.params.id;
      const notification = await Notification.findByIdAndDelete(notificationId);
      if (!notification) {
        return res.status(404).json({ message: 'Notification topilmadi!' });
      }
      res.status(200).json({ message: 'Notification o‘chirildi!' });
    } catch (err) {
      console.error('Delete Notification Error:', err);
      res.status(500).json({ message: 'Xatolik yuz berdi!' });
    }
  },

  deleteAllNotifications: async (req, res) => {
    try {
      const userId = req.params.userId;
      await Notification.deleteMany({ receiverId: userId });
      res.status(200).json({ message: 'Barcha notificationlar o‘chirildi!' });
    } catch (err) {
      console.error('Delete All Notifications Error:', err);
      res.status(500).json({ message: 'Xatolik yuz berdi!' });
    }
  },
};

module.exports = notificationCtrl;