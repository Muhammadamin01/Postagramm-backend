const bcrypt = require('bcryptjs');
const JWT = require('jsonwebtoken');
const User = require('../Model/UserModel');

const authCtrl = {
  login: async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Hamma qatorlarni to‘ldiring" });
      }
      const user = await User.findOne({ email }).select('+password');
      if (!user) return res.status(400).json({ message: "Email yoki parol noto‘g‘ri" });
      if (!user.password) return res.status(500).json({ message: "Parol bazada mavjud emas" });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ message: "Email yoki parol noto‘g‘ri" });

      const userData = user.toObject();
      delete userData.password;

      const token = JWT.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET_KEY || 'secret',
        { expiresIn: '12h' }
      );

      res.status(200).json({
        message: "Login muvaffaqiyatli",
        userId: user._id.toString(),
        token,
        user: userData
      });
    } catch (error) {
      res.status(500).json({ message: "Serverda xatolik: " + error.message });
    }
  },

  signup: async (req, res) => {
    try {
      const { username, email, password, surname, job, hobby } = req.body;
      if (!username || !email || !password) {
        return res.status(400).json({ message: "Barcha qatorlarni to‘ldiring" });
      }

      // Email yoki username bandligi
      const [userExists, usernameExists] = await Promise.all([
        User.findOne({ email }),
        User.findOne({ username }),
      ]);
      if (userExists) return res.status(403).json({ message: "Bu email allaqachon mavjud" });
      if (usernameExists) return res.status(403).json({ message: "Bu username allaqachon mavjud" });

      // Parol hash
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({
        username,
        email,
        password: hashedPassword,
        surname,
        job,
        hobby
      });
      await newUser.save();

      const userData = newUser.toObject();
      delete userData.password;

      const token = JWT.sign(
        { id: newUser._id, role: newUser.role },
        process.env.JWT_SECRET_KEY || 'secret',
        { expiresIn: '12h' }
      );

      res.status(201).json({
        message: "Ro‘yxatdan o‘tish muvaffaqiyatli",
        userId: newUser._id.toString(),
        token,
        user: userData
      });
    } catch (error) {
      res.status(500).json({ message: "Serverda xatolik: " + error.message });
    }
  }
};

module.exports = authCtrl;