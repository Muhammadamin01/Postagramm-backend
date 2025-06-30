const jwt = require('jsonwebtoken');
const User = require('../Model/UserModel');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: "Token yo‘q, kirish taqiqlangan" });
    }
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: "Token topilmadi" });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'secret');
    } catch (e) {
      return res.status(401).json({ message: "Token noto‘g‘ri yoki muddati o‘tgan" });
    }
    const userId = decoded.id || decoded._id;
    if (!userId) {
      return res.status(401).json({ message: "Token noto‘g‘ri" });
    }
    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: "Foydalanuvchi topilmadi" });
    }
    req.user = {
      id: user._id.toString(),
      _id: user._id.toString(),
      role: user.role,
      username: user.username,
      email: user.email
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: "Token noto‘g‘ri yoki serverda xato" });
  }
};

module.exports = authMiddleware;