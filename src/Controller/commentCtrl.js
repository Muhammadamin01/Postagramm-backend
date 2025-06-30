const Post = require('../Model/postModel');
const Comment = require('../Model/commentsModel');
const Notification = require('../Model/notificatoinModel');
const User = require('../Model/UserModel');

const commentCtrl = {
  createComment: async (req, res) => {
    try {
      const { postId, text } = req.body;
      if (!postId || !text) {
        return res.status(400).json({ message: 'postId va text majburiy' });
      }

      const post = await Post.findById(postId);
      if (!post) {
        return res.status(404).json({ message: 'Post topilmadi' });
      }

      const newComment = await Comment.create({
        postId,
        userId: req.user._id,
        text,
      });

      await Post.findByIdAndUpdate(postId, {
        $push: { comments: newComment._id },
      });

      const populatedComment = await Comment.findById(newComment._id)
        .populate('userId', 'username profileImage');

      // NOTIFICATION: faqat bitta va username DBdan olib yuboriladi!
      if (req.user._id.toString() !== post.userId.toString()) {
        const sender = await User.findById(req.user._id);
        const senderUsername = sender?.username || sender?.name || 'User';

        // Comment notification: 1 comment = 1 notification
        const existing = await Notification.findOne({
          senderId: req.user._id,
          receiverId: post.userId,
          type: 'comment',
          postId,
          commentId: newComment._id,
        });
        if (!existing) {
          const newNotification = await Notification.create({
            senderId: req.user._id,
            receiverId: post.userId,
            type: 'comment',
            message: `${senderUsername} sizning postingizga komment yozdi: "${text.substring(0, 20)}..."`,
            postId: postId,
            commentId: newComment._id,
            isRead: false,
          });

          const populatedNotification = await Notification.findById(newNotification._id)
            .populate('senderId', 'username profileImage')
            .populate('postId', 'content postImage')
            .populate('commentId', 'text');

          const receiverSocketId = global.onlineUsers.get(post.userId.toString());
          if (receiverSocketId) {
            global._io.to(receiverSocketId).emit('newNotification', populatedNotification);
          }
        }
      }

      // Commentni frontga jo‘natish
      global._io.emit('newComment', populatedComment);

      res.status(201).json(populatedComment);
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Komment yaratishda muammo' });
    }
  },

  getCommentsByPost: async (req, res) => {
    try {
      const comments = await Comment.find({ postId: req.params.postId })
        .populate('userId', 'username profileImage')
        .sort({ createdAt: -1 });
      res.json(comments);
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Kommentlarni olishda muammo' });
    }
  },

  updateComment: async (req, res) => {
    try {
      const { id } = req.params;
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ message: 'Text majburiy' });
      }

      const comment = await Comment.findById(id);
      if (!comment) {
        return res.status(404).json({ message: 'Komment topilmadi' });
      }

      if (comment.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Faqat o‘zingizning commentingizni yangilay olasiz' });
      }

      comment.text = text;
      await comment.save();

      const populatedComment = await Comment.findById(id).populate(
        'userId',
        'username profileImage'
      );
      res.json(populatedComment);
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Komment yangilashda muammo' });
    }
  },

  deleteComment: async (req, res) => {
    try {
      const { id } = req.params;
      const comment = await Comment.findById(id);
      if (!comment) {
        return res.status(404).json({ message: 'Komment topilmadi' });
      }

      if (comment.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Faqat o‘zingizning commentingizni o‘chira olasiz' });
      }

      await Comment.deleteOne({ _id: id });
      await Post.findByIdAndUpdate(comment.postId, {
        $pull: { comments: comment._id },
      });

      res.json({ message: 'Komment o‘chirildi' });
    } catch (err) {
      res.status(500).json({ message: 'Server xatosi: Komment o‘chirishda muammo' });
    }
  },
};

module.exports = commentCtrl;